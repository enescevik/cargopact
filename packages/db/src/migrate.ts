import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type pg from "pg";

// Lambda paketinde import.meta.url bulunmaz; yalnızca migrate çağrıldığında hesaplanır.
const migrationsDir = () => join(dirname(fileURLToPath(import.meta.url)), "../migrations");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForJob(pool: pg.Pool, jobId: string): Promise<void> {
  for (let i = 0; i < 180; i++) {
    const { rows } = await pool.query("select status, details from sys.jobs where job_id = $1", [jobId]);
    if (rows.length === 0) return; // tamamlanmış işler listeden temizlenir
    const st = String(rows[0].status).toLowerCase();
    if (st.includes("fail")) throw new Error(`İndeks işi başarısız (${jobId}): ${rows[0].details ?? ""}`);
    if (st.includes("complet")) return;
    await sleep(1000);
  }
  throw new Error(`İndeks işi zaman aşımı: ${jobId}`);
}

export interface MigrateResult { applied: string[]; skipped: string[] }

/** Her dosya tek DDL (veya yalnız DML) içerir; DDL ve kayıt ekleme ayrı işlemlerde çalışır. */
export async function migrate(pool: pg.Pool, log: (m: string) => void = console.log): Promise<MigrateResult> {
  await pool.query(
    "create table if not exists schema_migrations (version text primary key, applied_at timestamptz not null default now(), checksum text not null)",
  );
  const done = new Map<string, string>(
    (await pool.query("select version, checksum from schema_migrations")).rows.map((r) => [r.version, r.checksum]),
  );
  const files = readdirSync(migrationsDir()).filter((f) => f.endsWith(".sql")).sort();
  const result: MigrateResult = { applied: [], skipped: [] };
  for (const f of files) {
    const sql = readFileSync(join(migrationsDir(), f), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const prev = done.get(f);
    if (prev) {
      if (prev !== checksum) throw new Error(`Uygulanmış migrasyon değişmiş: ${f}`);
      result.skipped.push(f);
      continue;
    }
    log(`→ ${f}`);
    const res = await pool.query(sql);
    const jobId = (Array.isArray(res) ? res[res.length - 1] : res).rows?.[0]?.job_id;
    if (jobId) await waitForJob(pool, jobId);
    await pool.query("insert into schema_migrations(version, checksum) values ($1, $2)", [f, checksum]);
    result.applied.push(f);
  }
  return result;
}

/** Uygulama rolüne tablo yetkilerini verir (idempotent). audit_log yalnız INSERT/SELECT. */
export async function grantAppRole(pool: pg.Pool, lambdaRoleArn: string, log: (m: string) => void = console.log): Promise<void> {
  if (!/^arn:aws:iam::\d{12}:role\/[\w+=,.@\-/]+$/.test(lambdaRoleArn)) throw new Error("Geçersiz rol ARN");
  try {
    await pool.query(`aws iam grant cargopact_app to '${lambdaRoleArn}'`);
    log("IAM rolü cargopact_app ile eşlendi");
  } catch (e) {
    // Zaten eşlenmişse tekrar çalıştırma hata vermemeli.
    if (!/already|exists/i.test((e as Error).message)) throw e;
    log("IAM eşlemesi zaten var");
  }
  const { rows } = await pool.query("select tablename from pg_tables where schemaname = 'public'");
  for (const { tablename } of rows) {
    if (!/^[a-z_][a-z0-9_]*$/.test(tablename)) continue;
    if (tablename === "schema_migrations") continue;
    const privs = tablename === "audit_log" ? "select, insert" : "select, insert, update, delete";
    await pool.query(`grant ${privs} on public.${tablename} to cargopact_app`);
  }
  log("Tablo yetkileri verildi");
}
