import { createHash } from "node:crypto";
import type pg from "pg";
import { withTx } from "@cargopact/db";
import type { AuthContext } from "./auth";
import { HttpError, validation, type Res } from "./http";

const stable = (v: unknown): string =>
  JSON.stringify(v, (_k, val) => (val && typeof val === "object" && !Array.isArray(val) ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b))) : val));

/**
 * Mutasyon ile AYNI işlemde: anahtarı ekler; varsa kayıtlı yanıtı döner (mutasyon yapılmaz).
 * Aynı anahtar farklı gövdeyle gelirse 422. Eşzamanlı aynı anahtar → OCC çakışması → yeniden deneme → kayıtlı yanıt.
 */
export async function idempotent(
  pool: pg.Pool, ctx: AuthContext, scope: string, key: string | undefined, requestBody: unknown,
  run: (c: pg.PoolClient) => Promise<Res>,
): Promise<Res> {
  if (!key || key.length < 8 || key.length > 128) throw validation("Idempotency-Key başlığı (8-128 karakter) gerekli.");
  const hash = createHash("sha256").update(stable(requestBody ?? null)).digest("hex");
  return withTx(pool, async (c) => {
    const ins = await c.query(
      "insert into idempotency_keys (tenant_id, scope, key, request_hash, status_code, response_body) values ($1,$2,$3,$4,0,'{}'::jsonb) on conflict do nothing returning key",
      [ctx.tenantId, scope, key, hash],
    );
    if (ins.rows.length === 0) {
      const ex = await c.query("select request_hash, status_code, response_body from idempotency_keys where tenant_id=$1 and scope=$2 and key=$3", [ctx.tenantId, scope, key]);
      const row = ex.rows[0];
      if (row.request_hash !== hash) throw new HttpError("IDEMPOTENCY_MISMATCH", "Bu Idempotency-Key farklı bir istekle kullanılmış.");
      return { status: row.status_code, body: row.response_body, headers: { "idempotent-replay": "true" } };
    }
    const res = await run(c);
    await c.query("update idempotency_keys set status_code=$4, response_body=$5::jsonb where tenant_id=$1 and scope=$2 and key=$3", [ctx.tenantId, scope, key, res.status, JSON.stringify(res.body ?? {})]);
    return res;
  });
}
