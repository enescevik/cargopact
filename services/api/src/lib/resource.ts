import type pg from "pg";
import type { ZodType, ZodTypeDef } from "zod";
import { z } from "zod";
import { pageQuery, statusPatch, type Role } from "@cargopact/contracts";
import { withTx } from "@cargopact/db";
import { audit } from "./audit";
import { PLATFORM_TENANT_ID, requireRole, type AuthContext } from "./auth";
import { camelRow, forbidden, notFound, ok, validation, type Req, type Res } from "./http";
import { idempotent } from "./idempotency";

export interface ResourceDef<I> {
  /** Denetim ve idempotency kapsamı için ad, ör. "facility". */
  entity: string;
  table: string;
  ownerCol: "carrier_id" | "tenant_id";
  schema: ZodType<I, ZodTypeDef, unknown>;
  /** Yazılacak sütunlar (sütun adları statik; kullanıcı girdisi sütun adı olamaz). */
  toRow: (input: I) => Record<string, unknown>;
  jsonCols?: string[];
  readRoles: readonly Role[];
  writeRoles: readonly Role[];
  /** Yazma sahibi: taşıyıcı kiracısı veya platform kiracısı. */
  writeOwner: (ctx: AuthContext) => string;
  /** Okumada görünür sahipler (taşıyıcı kendi + platform kataloğu gibi). */
  readOwners: (ctx: AuthContext, req: Req) => string[];
  /** Yazma öncesi ek doğrulama (yabancı kayıt görünürlüğü vb.). */
  validate?: (c: pg.PoolClient, ctx: AuthContext, input: I) => Promise<void>;
}

const SAFE_ID = /^[a-z_][a-z0-9_]*$/;
const assertIdent = (s: string) => { if (!SAFE_ID.test(s)) throw new Error(`Geçersiz tanımlayıcı: ${s}`); return s; };

// Zaman PostgreSQL metniyle (mikrosaniye hassasiyetli) taşınır; JS Date milisaniyeye kırpacağı için kullanılmaz.
const encodeCursor = (createdAtText: string, id: string) => Buffer.from(`${createdAtText}|${id}`).toString("base64url");
const decodeCursor = (c: string) => {
  const [ts, id] = Buffer.from(c, "base64url").toString().split("|");
  if (!ts || !id || Number.isNaN(Date.parse(ts))) throw validation("Geçersiz cursor.");
  return { ts, id };
};

export function resourceHandlers<I>(def: ResourceDef<I>, pool: pg.Pool) {
  const table = assertIdent(def.table);
  const owner = assertIdent(def.ownerCol);

  const list = async (ctx: AuthContext, req: Req): Promise<Res> => {
    requireRole(ctx, def.readRoles);
    const q = pageQuery.parse(req.query);
    const owners = def.readOwners(ctx, req);
    const args: unknown[] = [owners];
    let where = `${owner} = any($1::uuid[])`;
    if (req.query.status) { args.push(z.enum(["active", "inactive", "maintenance"]).parse(req.query.status)); where += ` and status = $${args.length}`; }
    if (q.cursor) { const c = decodeCursor(q.cursor); args.push(c.ts, c.id); where += ` and (created_at, id) > ($${args.length - 1}::timestamptz, $${args.length}::uuid)`; }
    args.push(q.limit + 1);
    const { rows } = await pool.query(`select *, created_at::text as _cursor_ts from ${table} where ${where} order by created_at, id limit $${args.length}`, args);
    const page = rows.slice(0, q.limit);
    const last = page[page.length - 1];
    const next = rows.length > q.limit ? encodeCursor(last._cursor_ts, last.id) : undefined;
    return ok({ items: page.map(({ _cursor_ts, ...r }) => camelRow(r)), nextCursor: next });
  };

  const get = async (ctx: AuthContext, req: Req): Promise<Res> => {
    requireRole(ctx, def.readRoles);
    const { rows } = await pool.query(`select * from ${table} where id = $1 and ${owner} = any($2::uuid[])`, [req.params.id, def.readOwners(ctx, req)]);
    if (rows.length === 0) throw notFound();
    return ok(camelRow(rows[0]));
  };

  const columns = (row: Record<string, unknown>) => Object.keys(row).map(assertIdent);
  const val = (col: string, v: unknown) => (def.jsonCols?.includes(col) && v !== undefined && v !== null ? JSON.stringify(v) : v ?? null);

  const create = async (ctx: AuthContext, req: Req): Promise<Res> => {
    requireRole(ctx, def.writeRoles);
    const input = def.schema.parse(req.body);
    const ownerId = def.writeOwner(ctx);
    return idempotent(pool, ctx, `${def.entity}.create`, req.headers["idempotency-key"], input, async (c) => {
      await def.validate?.(c, ctx, input);
      const row = def.toRow(input);
      const cols = columns(row);
      const ph = cols.map((col, i) => `$${i + 2}${def.jsonCols?.includes(col) ? "::jsonb" : ""}`);
      const { rows } = await c.query(
        `insert into ${table} (${owner}, ${cols.join(", ")}) values ($1, ${ph.join(", ")}) returning *`,
        [ownerId, ...cols.map((col) => val(col, row[col]))],
      );
      const created = camelRow(rows[0]);
      await audit(c, ctx, { action: `${def.entity}.create`, entityType: def.entity, entityId: rows[0].id, after: created });
      return ok(created, 201);
    });
  };

  const update = async (ctx: AuthContext, req: Req): Promise<Res> => {
    requireRole(ctx, def.writeRoles);
    const version = Number(req.headers["if-match"]?.replace(/"/g, ""));
    if (!Number.isInteger(version)) throw validation("If-Match başlığı (kayıt sürümü) gerekli.");
    const input = def.schema.parse(req.body);
    const ownerId = def.writeOwner(ctx);
    return idempotent(pool, ctx, `${def.entity}.update`, req.headers["idempotency-key"], { id: req.params.id, version, input }, async (c) => {
      const cur = await c.query(`select * from ${table} where id = $1 and ${owner} = $2`, [req.params.id, ownerId]);
      if (cur.rows.length === 0) throw notFound();
      await def.validate?.(c, ctx, input);
      const row = def.toRow(input);
      const cols = columns(row);
      const sets = cols.map((col, i) => `${col} = $${i + 4}${def.jsonCols?.includes(col) ? "::jsonb" : ""}`);
      const { rows } = await c.query(
        `update ${table} set ${sets.join(", ")}, version = version + 1, updated_at = now() where id = $1 and ${owner} = $2 and version = $3 returning *`,
        [req.params.id, ownerId, version, ...cols.map((col) => val(col, row[col]))],
      );
      if (rows.length === 0) return { status: 409, body: { code: "CONFLICT", message: "Kayıt başka biri tarafından değiştirilmiş (sürüm uyuşmuyor).", correlationId: ctx.correlationId } };
      const after = camelRow(rows[0]);
      await audit(c, ctx, { action: `${def.entity}.update`, entityType: def.entity, entityId: req.params.id, before: camelRow(cur.rows[0]), after });
      return ok(after);
    });
  };

  const setStatus = async (ctx: AuthContext, req: Req): Promise<Res> => {
    requireRole(ctx, def.writeRoles);
    const { status } = statusPatch.parse(req.body);
    const ownerId = def.writeOwner(ctx);
    return idempotent(pool, ctx, `${def.entity}.status`, req.headers["idempotency-key"], { id: req.params.id, status }, async (c) => {
      const cur = await c.query(`select * from ${table} where id = $1 and ${owner} = $2`, [req.params.id, ownerId]);
      if (cur.rows.length === 0) throw notFound();
      const { rows } = await c.query(`update ${table} set status = $3, version = version + 1, updated_at = now() where id = $1 and ${owner} = $2 returning *`, [req.params.id, ownerId, status]);
      const after = camelRow(rows[0]);
      await audit(c, ctx, { action: `${def.entity}.status`, entityType: def.entity, entityId: req.params.id, before: { status: cur.rows[0].status }, after: { status } });
      return ok(after);
    });
  };

  return { list, get, create, update, setStatus };
}

export const carrierOwner = (ctx: AuthContext) => {
  if (ctx.tenantType !== "carrier") throw forbidden();
  return ctx.tenantId;
};
export const platformOwner = (ctx: AuthContext) => {
  if (ctx.tenantType !== "platform") throw forbidden();
  return PLATFORM_TENANT_ID;
};
export { withTx };
