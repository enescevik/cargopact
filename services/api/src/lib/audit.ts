import type pg from "pg";
import type { AuthContext } from "./auth";

export interface AuditEntry {
  tenantId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
}

/** Trigger olmadığından her servis fonksiyonu mutasyonla AYNI işlemde çağırır. */
export async function audit(c: pg.PoolClient, ctx: AuthContext, e: AuditEntry): Promise<void> {
  await c.query(
    `insert into audit_log (tenant_id, actor_user_id, actor_role, action, entity_type, entity_id, before_state, after_state, reason, correlation_id)
     values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10)`,
    [e.tenantId ?? ctx.tenantId, ctx.userId, ctx.role, e.action, e.entityType, e.entityId ?? null,
     e.before === undefined ? null : JSON.stringify(e.before), e.after === undefined ? null : JSON.stringify(e.after),
     e.reason ?? null, ctx.correlationId],
  );
}
