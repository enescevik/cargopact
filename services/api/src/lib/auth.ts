import { ROLES, type Role, type TenantType } from "@cargopact/contracts";
import type pg from "pg";
import { withTx } from "@cargopact/db";
import { forbidden, HttpError, type Req } from "./http";

export interface AuthContext {
  userId: string;
  email: string;
  tenantId: string;
  tenantType: TenantType;
  tenantStatus: string;
  role: Role;
  correlationId: string;
}

export const PLATFORM_TENANT_ID = "00000000-0000-4000-8000-000000000001";

interface MembershipRow { tenant_id: string; tenant_name: string; tenant_type: TenantType; tenant_status: string; role: Role }

/** Üyelikleri okur. Kullanıcı ilk kez geliyorsa bekleyen (pending) müşteri firması oluşturur. */
export async function loadUser(pool: pg.Pool, req: Req) {
  const sub = String(req.claims.sub ?? "");
  const email = String(req.claims.email ?? "").toLowerCase();
  if (!sub) throw new HttpError("UNAUTHENTICATED", "Kimlik doğrulanamadı.");

  const find = async (q: pg.Pool | pg.PoolClient) => {
    const u = await q.query("select id, email, display_name from users where cognito_sub = $1", [sub]);
    if (u.rows.length === 0) return undefined;
    const m = await q.query(
      `select m.tenant_id, t.name as tenant_name, t.type as tenant_type, t.status as tenant_status, m.role
         from memberships m join tenants t on t.id = m.tenant_id
        where m.user_id = $1 and m.status = 'active' order by t.name`,
      [u.rows[0].id],
    );
    return { user: u.rows[0] as { id: string; email: string; display_name: string | null }, memberships: m.rows as MembershipRow[] };
  };

  const existing = await find(pool);
  if (existing) return existing;
  if (!email) throw new HttpError("UNAUTHENTICATED", "Token e-posta içermiyor (ID token kullanın).");

  await withTx(pool, async (c) => {
    if (await find(c)) return;
    const t = await c.query("insert into tenants (type, name, status) values ('customer', $1, 'pending') returning id", [email]);
    const u = await c.query("insert into users (cognito_sub, email) values ($1, $2) returning id", [sub, email]);
    await c.query("insert into memberships (user_id, tenant_id, role) values ($1, $2, 'customer_user')", [u.rows[0].id, t.rows[0].id]);
    await c.query(
      "insert into audit_log (tenant_id, actor_user_id, actor_role, action, entity_type, entity_id, correlation_id) values ($1,$2,'customer_user','tenant.self_signup','tenant',$1,$3)",
      [t.rows[0].id, u.rows[0].id, req.correlationId],
    );
  });
  return (await find(pool))!;
}

/** İstemciden gelen tenant yalnız SEÇİM yapar; üyelikte doğrulanır. Başka kaynaktan tenant/rol alınmaz. */
export async function authenticate(pool: pg.Pool, req: Req): Promise<AuthContext> {
  const { user, memberships } = await loadUser(pool, req);
  if (memberships.length === 0) throw forbidden("Aktif üyeliğiniz yok.");
  const wanted = req.headers["x-tenant-id"];
  const m = wanted ? memberships.find((x) => x.tenant_id === wanted) : memberships.length === 1 ? memberships[0] : undefined;
  if (!m) throw forbidden(wanted ? "Bu kiracıda üyeliğiniz yok." : "Birden fazla üyeliğiniz var; x-tenant-id başlığı gerekli.");
  if (!ROLES.includes(m.role)) throw forbidden();
  return { userId: user.id, email: user.email, tenantId: m.tenant_id, tenantType: m.tenant_type, tenantStatus: m.tenant_status, role: m.role, correlationId: req.correlationId };
}

/** Rol kontrolü; ayrıca bekleyen (pending/suspended) firma işlem yapamaz. */
export function requireRole(ctx: AuthContext, roles: readonly Role[]): void {
  if (!roles.includes(ctx.role)) throw forbidden();
  if (ctx.tenantStatus !== "active") throw forbidden("Firmanız henüz onaylanmamış veya askıda.");
}
