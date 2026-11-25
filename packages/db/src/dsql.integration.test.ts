/**
 * Gerçek Aurora DSQL'e karşı entegrasyon testi. DSQL_TEST_ENDPOINT yoksa atlanır.
 * Rastgele adlı geçici tablolar oluşturur ve sonunda düşürür; uygulama tablolarına dokunmaz.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { createPool } from "./connection";
import { chunk, withTx } from "./tx";

const endpoint = process.env.DSQL_TEST_ENDPOINT;
const sfx = randomBytes(4).toString("hex");
const T = { parent: `it_${sfx}_parent`, child: `it_${sfx}_child`, cap: `it_${sfx}_cap`, bulk: `it_${sfx}_bulk` };

class Insufficient extends Error {}

describe.skipIf(!endpoint)("Aurora DSQL davranışı (entegrasyon)", () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    pool = createPool({ endpoint, user: "admin", max: 8 });
    // DSQL: her DDL kendi işleminde (otomatik commit).
    await pool.query(`create table ${T.parent} (id uuid primary key default gen_random_uuid(), name text not null)`);
    await pool.query(`create table ${T.child} (id uuid primary key default gen_random_uuid(), parent_id uuid not null references ${T.parent}(id))`);
    await pool.query(`create table ${T.cap} (id text primary key, remaining int not null check (remaining >= 0))`);
    await pool.query(`create table ${T.bulk} (id uuid primary key default gen_random_uuid(), v int not null)`);
  }, 60_000);

  afterAll(async () => {
    for (const t of [T.child, T.parent, T.cap, T.bulk]) await pool?.query(`drop table if exists ${t}`).catch(() => undefined);
    await pool?.end();
  }, 60_000);

  it("yabancı anahtar ekleme ve silmede uygulanır", async () => {
    await expect(pool.query(`insert into ${T.child} (parent_id) values (gen_random_uuid())`)).rejects.toMatchObject({ code: "23503" });
    const p = (await pool.query(`insert into ${T.parent} (name) values ('p') returning id`)).rows[0].id;
    await pool.query(`insert into ${T.child} (parent_id) values ($1)`, [p]);
    await expect(pool.query(`delete from ${T.parent} where id = $1`, [p])).rejects.toMatchObject({ code: "23503" });
  });

  it("son kapasite için eşzamanlı 6 istekten yalnız biri kazanır (OCC + withTx yeniden deneme)", async () => {
    await pool.query(`insert into ${T.cap} (id, remaining) values ('trip', 1)`);
    const take = () => withTx(pool, async (c) => {
      const cur = await c.query(`select remaining from ${T.cap} where id = 'trip'`);
      if (cur.rows[0].remaining < 1) throw new Insufficient();
      await c.query(`update ${T.cap} set remaining = remaining - 1 where id = 'trip'`);
      return "ok";
    }, { maxRetries: 8, baseDelayMs: 20 });
    const results = await Promise.allSettled(Array.from({ length: 6 }, take));
    const won = results.filter((r) => r.status === "fulfilled").length;
    const insufficient = results.filter((r) => r.status === "rejected" && r.reason instanceof Insufficient).length;
    expect(won).toBe(1);
    expect(insufficient).toBe(5);
    expect((await pool.query(`select remaining from ${T.cap} where id = 'trip'`)).rows[0].remaining).toBe(0);
  }, 60_000);

  it("işlem başına 3000 satır sınırı; chunk ile aşılır", async () => {
    await expect(withTx(pool, (c) => c.query(`insert into ${T.bulk} (v) select g from generate_series(1, 3001) g`))).rejects.toMatchObject({ code: "54000" });
    const rows = Array.from({ length: 3500 }, (_, i) => i);
    for (const part of chunk(rows)) {
      await withTx(pool, (c) => c.query(`insert into ${T.bulk} (v) select unnest($1::int[])`, [part]));
    }
    expect(Number((await pool.query(`select count(*) n from ${T.bulk}`)).rows[0].n)).toBe(3500);
  }, 60_000);

  it("DDL ile DML aynı işlemde çalışmaz", async () => {
    await expect(withTx(pool, async (c) => {
      await c.query(`create table it_${sfx}_never (id uuid primary key)`);
      await c.query(`insert into ${T.parent} (name) values ('x')`);
    })).rejects.toMatchObject({ code: "0A000" });
  });
});
