import type pg from "pg";
import { z } from "zod";
import type { Role } from "@cargopact/contracts";
import { requireRole, type AuthContext } from "../lib/auth";
import { camelRow, notFound, ok } from "../lib/http";
import type { Route } from "./master-data";
const CUSTOMER: readonly Role[] = ["customer_user"];
const CARRIER: readonly Role[] = ["carrier_admin", "carrier_planner", "carrier_warehouse"];
/** Rol → hedef kitle. Tenant JWT üyeliğinden gelir; istemciden alınmaz. */
const audienceOf = (ctx: AuthContext): "customer" | "carrier" => {
  requireRole(ctx, [...CUSTOMER, ...CARRIER]);
  return CUSTOMER.includes(ctx.role) ? "customer" : "carrier";
};
const uid = (v: string): string => { if (!z.string().uuid().safeParse(v).success) throw notFound("Bildirim"); return v; };
export function notificationRoutes(pool: pg.Pool): Route[] {
  return [
    {
      method: "GET", pattern: "/notifications",
      handler: async (ctx, req) => {
        const aud = audienceOf(ctx);
        const unreadOnly = req.query.unread === "true" || req.query.unread === "1";
        const rows = (await pool.query(
          `select id, audience, reservation_id, trip_id, type, title, body, created_at, read_at, is_demo from notifications
            where tenant_id = $1 and audience = $2 ${unreadOnly ? "and read_at is null" : ""} order by created_at desc limit 50`, [ctx.tenantId, aud])).rows;
        const unread = Number((await pool.query("select count(*)::int n from notifications where tenant_id = $1 and audience = $2 and read_at is null", [ctx.tenantId, aud])).rows[0].n);
        return ok({ items: rows.map((r) => camelRow(r)), unreadCount: unread });
      },
    },
    {
      method: "POST", pattern: "/notifications/read-all",
      handler: async (ctx) => {
        const aud = audienceOf(ctx);
        const r = await pool.query("update notifications set read_at = now() where tenant_id = $1 and audience = $2 and read_at is null", [ctx.tenantId, aud]);
        return ok({ updated: r.rowCount ?? 0 });
      },
    },
    {
      method: "POST", pattern: "/notifications/{id}/read",
      handler: async (ctx, req) => {
        const aud = audienceOf(ctx);
        const id = uid(req.params.id);
        const row = (await pool.query("select id from notifications where id = $1 and tenant_id = $2 and audience = $3", [id, ctx.tenantId, aud])).rows[0];
        if (!row) throw notFound("Bildirim"); // başka kiracı/kitle: varlığı sızdırılmaz
        await pool.query("update notifications set read_at = now() where id = $1 and read_at is null", [id]);
        return ok({ id, read: true });
      },
    },
  ];
}
