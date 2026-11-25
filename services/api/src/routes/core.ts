import type pg from "pg";
import { z } from "zod";
import type { MeResponse } from "@cargopact/contracts";
import { audit } from "../lib/audit";
import { loadUser, requireRole } from "../lib/auth";
import { camelRow, notFound, ok } from "../lib/http";
import { idempotent } from "../lib/idempotency";
import type { Route } from "./master-data";

export function coreRoutes(pool: pg.Pool): Route[] {
  return [
    {
      method: "GET", pattern: "/health",
      handler: async () => ok({ status: "ok" }),
    },
  ];
}

/** /me kimlik gerektirir ama aktif kiracı/rol seçimi zorunlu değildir (bekleyen firma da çağırabilir). */
export async function meHandler(pool: pg.Pool, req: import("../lib/http").Req) {
  const { user, memberships } = await loadUser(pool, req);
  const wanted = req.headers["x-tenant-id"];
  const m = memberships.find((x) => x.tenant_id === wanted) ?? (memberships.length === 1 ? memberships[0] : undefined);
  const body: MeResponse = {
    userId: user.id, email: user.email, displayName: user.display_name,
    memberships: memberships.map((x) => ({ tenantId: x.tenant_id, tenantName: x.tenant_name, tenantType: x.tenant_type, tenantStatus: x.tenant_status, role: x.role })),
    active: m ? { tenantId: m.tenant_id, tenantType: m.tenant_type, role: m.role, tenantStatus: m.tenant_status } : null,
  };
  return ok(body);
}

const tenantStatusPatch = z.object({ status: z.enum(["active", "suspended"]), reason: z.string().max(300).optional() });

export function platformRoutes(pool: pg.Pool): Route[] {
  return [
    {
      method: "GET", pattern: "/platform/tenants",
      handler: async (ctx, req) => {
        requireRole(ctx, ["platform_admin", "admin_viewer"]);
        const st = z.enum(["pending", "active", "suspended"]).optional().parse(req.query.status);
        const { rows } = await pool.query(
          "select id, type, name, status, is_demo, created_at from tenants where type <> 'platform' and ($1::text is null or status = $1) order by created_at limit 200", [st ?? null]);
        return ok({ items: rows.map(camelRow) });
      },
    },
    {
      method: "PATCH", pattern: "/platform/tenants/{id}/status",
      handler: async (ctx, req) => {
        requireRole(ctx, ["platform_admin"]);
        const input = tenantStatusPatch.parse(req.body);
        return idempotent(pool, ctx, "tenant.status", req.headers["idempotency-key"], { id: req.params.id, ...input }, async (c) => {
          const cur = await c.query("select * from tenants where id = $1 and type <> 'platform'", [req.params.id]);
          if (cur.rows.length === 0) throw notFound("Firma");
          const { rows } = await c.query("update tenants set status = $2 where id = $1 returning *", [req.params.id, input.status]);
          await audit(c, ctx, { tenantId: req.params.id, action: "tenant.status", entityType: "tenant", entityId: req.params.id, before: { status: cur.rows[0].status }, after: { status: input.status }, reason: input.reason });
          return ok(camelRow(rows[0]));
        });
      },
    },
  ];
}
