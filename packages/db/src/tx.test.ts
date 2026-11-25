import { describe, expect, it, vi } from "vitest";
import { chunk, ConflictError, isRetryable, MAX_ROWS_PER_TX, withTx } from "./tx";

const fakePool = (script: ((sql: string) => unknown)[]) => {
  let i = 0;
  const client = { query: vi.fn(async (sql: string) => script[i++]?.(sql)), release: vi.fn() };
  return { pool: { connect: async () => client } as never, client };
};
const occ = () => { throw Object.assign(new Error("change conflicts"), { code: "40001" }); };

describe("tx", () => {
  it("chunk 3000 sınırına böler", () => {
    const parts = chunk(Array.from({ length: 6001 }, (_, i) => i));
    expect(parts.map((p) => p.length)).toEqual([3000, 3000, 1]);
    expect(MAX_ROWS_PER_TX).toBe(3000);
  });
  it("yalnız geçici hataları yeniden dener", () => {
    expect(isRetryable({ code: "40001" })).toBe(true);
    expect(isRetryable({ code: "23505" })).toBe(false);
  });
  it("commit'te 40001 gelirse yeniden dener ve başarır", async () => {
    // 1. deneme: begin, fn, commit(OCC), rollback; 2. deneme: begin, fn, commit
    const { pool } = fakePool([() => 0, () => 0, occ, () => 0, () => 0, () => 0, () => 0]);
    let runs = 0;
    const out = await withTx(pool, async (c) => { runs++; await c.query("select 1"); return "ok"; }, { baseDelayMs: 1 });
    expect(out).toBe("ok");
    expect(runs).toBe(2);
  });
  it("deneme hakkı bitince ConflictError", async () => {
    const steps = Array.from({ length: 40 }, (_, i) => (i % 4 === 2 ? occ : () => 0));
    const { pool } = fakePool(steps);
    await expect(withTx(pool, async (c) => { await c.query("x"); }, { maxRetries: 2, baseDelayMs: 1 })).rejects.toBeInstanceOf(ConflictError);
  });
  it("kalıcı hatayı yeniden denemeden fırlatır", async () => {
    const { pool } = fakePool([() => 0, () => { throw Object.assign(new Error("dup"), { code: "23505" }); }, () => 0]);
    let runs = 0;
    await expect(withTx(pool, async (c) => { runs++; await c.query("x"); }, { baseDelayMs: 1 })).rejects.toMatchObject({ code: "23505" });
    expect(runs).toBe(1);
  });
});
