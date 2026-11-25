import type pg from "pg";
import { z } from "zod";
import { requireRole } from "../lib/auth";
import { ok, validation } from "../lib/http";
import type { Route } from "./master-data";

export const CORRELATION_RE = /^[A-Za-z0-9._-]{8,64}$/;
const SESSION_RE = /^[A-Za-z0-9._-]{8,128}$/;

const completeInput = z.object({
  latencyMs: z.number().int().min(0).max(600_000),
  replyChars: z.number().int().min(0).max(1_000_000),
  ok: z.boolean(),
  sessionId: z.string().regex(SESSION_RE).optional(),
});

const seenTurns = new Set<string>();

/**
 * Ajan araç çağrısı kaydı (handler.ts'ten yanıt SONRASI çağrılır). Asla fırlatmaz; ucuzdur (en çok 2 sorgu).
 * Kiracı/kullanıcı JWT sub'ından üyelik tablosundan türetilir (x-tenant-id varsa üyelikte doğrulanır).
 */
export async function recordToolCall(
  pool: pg.Pool,
  r: { correlationId: string; sessionId: string; sub: string; tenantHint?: string; method: string; path: string; status: number; ms: number },
): Promise<void> {
  try {
    if (!r.sub || !CORRELATION_RE.test(r.correlationId) || !SESSION_RE.test(r.sessionId) || r.path.startsWith("/agent/")) return;
    const who = `select u.id as user_id, m.tenant_id, m.role from users u join memberships m on m.user_id = u.id and m.status = 'active'
                  where u.cognito_sub = $1 and ($2::text is null or m.tenant_id::text = $2) order by m.tenant_id limit 1`;
    if (!seenTurns.has(r.correlationId)) {
      await pool.query(
        `insert into agent_turns (correlation_id, session_id, tenant_id, user_id, user_role)
         select $3, $4, w.tenant_id, w.user_id, w.role from (${who}) w on conflict (correlation_id) do nothing`,
        [r.sub, r.tenantHint ?? null, r.correlationId, r.sessionId],
      );
      if (seenTurns.size > 500) seenTurns.clear();
      seenTurns.add(r.correlationId);
    }
    await pool.query(
      `insert into agent_tool_calls (correlation_id, session_id, tenant_id, user_id, method, path, status, ms)
       select $3, $4, w.tenant_id, w.user_id, $5, $6, $7, $8 from (${who}) w`,
      [r.sub, r.tenantHint ?? null, r.correlationId, r.sessionId, r.method, r.path.slice(0, 200), r.status, Math.min(r.ms, 2_000_000_000)],
    );
  } catch (e) {
    console.warn(JSON.stringify({ level: "warn", message: "agent trace write failed", error: (e as Error)?.name }));
  }
}

export function traceRoutes(pool: pg.Pool): Route[] {
  return [
    {
      method: "POST", pattern: "/agent/turns/{correlationId}/complete",
      handler: async (ctx, req) => {
        const id = req.params.correlationId;
        if (!CORRELATION_RE.test(id)) throw validation("Geçersiz correlationId.");
        const b = completeInput.parse(req.body ?? {});
        // Yalnız kendi (tenant+user) satırına yazılır; başkasının satırı ON CONFLICT WHERE ile güncellenmez.
        const { rowCount } = await pool.query(
          `insert into agent_turns (correlation_id, session_id, tenant_id, user_id, user_role, latency_ms, reply_chars, ok, completed_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8, now())
           on conflict (correlation_id) do update set latency_ms = excluded.latency_ms, reply_chars = excluded.reply_chars,
             ok = excluded.ok, completed_at = excluded.completed_at, session_id = coalesce(agent_turns.session_id, excluded.session_id)
           where agent_turns.tenant_id = excluded.tenant_id and agent_turns.user_id = excluded.user_id`,
          [id, b.sessionId ?? null, ctx.tenantId, ctx.userId, ctx.role, b.latencyMs, b.replyChars, b.ok],
        );
        return ok({ correlationId: id, recorded: (rowCount ?? 0) > 0 });
      },
    },
    {
      method: "GET", pattern: "/carrier/agent-traces",
      handler: async (ctx, req) => {
        requireRole(ctx, ["carrier_admin", "carrier_planner", "carrier_warehouse", "platform_admin", "admin_viewer"]);
        const limit = Math.min(Math.max(parseInt(req.query.limit ?? "20", 10) || 20, 1), 50);
        const all = ctx.tenantType === "platform";
        const turns = await pool.query(
          `select correlation_id, session_id, user_role, latency_ms, reply_chars, ok, completed_at, created_at, is_demo
             from agent_turns where ($1::boolean or tenant_id = $2) order by created_at desc limit $3`,
          [all, ctx.tenantId, limit],
        );
        const ids = turns.rows.map((t) => t.correlation_id as string);
        const tools = ids.length
          ? await pool.query(
              `select correlation_id, method, path, status, ms, created_at from agent_tool_calls
                where correlation_id = any($1::text[]) and ($2::boolean or tenant_id = $3) order by created_at limit 500`,
              [ids, all, ctx.tenantId],
            )
          : { rows: [] as Record<string, unknown>[] };
        const audits = ids.length
          ? await pool.query(
              `select correlation_id, action, entity_type, entity_id, actor_role, created_at from audit_log
                where correlation_id = any($1::text[]) and ($2::boolean or tenant_id = $3) order by created_at limit 500`,
              [ids, all, ctx.tenantId],
            )
          : { rows: [] as Record<string, unknown>[] };
        const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : d);
        const items = turns.rows.map((t) => ({
          correlationId: t.correlation_id, sessionId: t.session_id, userRole: t.user_role,
          createdAt: iso(t.created_at), completedAt: iso(t.completed_at),
          latencyMs: t.latency_ms, replyChars: t.reply_chars, ok: t.ok, isDemo: t.is_demo,
          toolCalls: tools.rows.filter((x) => x.correlation_id === t.correlation_id)
            .map((x) => ({ method: x.method, path: x.path, status: x.status, ms: x.ms, createdAt: iso(x.created_at) })),
          auditEntries: audits.rows.filter((x) => x.correlation_id === t.correlation_id)
            .map((x) => ({ action: x.action, entityType: x.entity_type, entityId: x.entity_id, actorRole: x.actor_role, createdAt: iso(x.created_at) })),
        }));
        return ok({ items });
      },
    },
  ];
}
