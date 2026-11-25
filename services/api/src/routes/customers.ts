import type pg from "pg";
import type { Role } from "@cargopact/contracts";
import { requireRole } from "../lib/auth";
import { ok } from "../lib/http";
import { STATUS_LABELS } from "../lib/trips";
import type { Route } from "./master-data";

const CUSTOMER_MANAGEMENT_ROLES: readonly Role[] = ["carrier_admin", "carrier_planner"];

export type CustomerRiskCategory = "UYGUN" | "IZLENMELI" | "RISKLI";

/**
 * Operasyonel güven skoru. Kişisel veya finansal veri kullanmaz; otomatik onay/ret kararı değildir.
 * Başlangıç öncülü 4 başarılı / 1 başarısızdır. TESLIM olumlu, doğrulanmış GELMEDI çift olumsuz ağırlıktadır.
 */
export function customerReliability(delivered: number, noShow: number) {
  const evidenceCount = delivered + noShow;
  const score = Math.max(0, Math.min(100, Math.round((100 * (delivered + 4)) / (delivered + 4 + 2 * noShow + 1))));
  const category: CustomerRiskCategory = score >= 75 ? "UYGUN" : score >= 50 ? "IZLENMELI" : "RISKLI";
  return {
    score,
    category,
    evidenceCount,
    scoreExplanation: `${delivered} teslim, ${noShow} doğrulanmış gelmeme; gelmeme çift ağırlıklı, başlangıç öncülü 4/1.`,
  };
}

export function customerRoutes(pool: pg.Pool): Route[] {
  return [{
    method: "GET",
    pattern: "/carrier/customers",
    handler: async (ctx) => {
      requireRole(ctx, CUSTOMER_MANAGEMENT_ROLES);
      const metrics = await pool.query(
        `select cu.id customer_id, cu.name customer_name, cu.status tenant_status,
                count(*)::int total_reservations,
                count(*) filter (where r.status = 'TESLIM')::int delivered,
                count(*) filter (where r.status = 'GELMEDI')::int no_show,
                count(*) filter (where r.status = 'IPTAL')::int cancelled,
                count(*) filter (where r.status = 'RET')::int rejected,
                count(*) filter (where r.status = 'EKSIK_HASAR')::int damaged,
                count(*) filter (where r.status = 'TASIYICI_ONAYI_BEKLIYOR')::int pending,
                count(*) filter (where r.status in ('ONAYLI','DEPO_KABUL','YUKLENDI','VARISTA'))::int active,
                max(r.created_at) last_reservation_at
           from reservations r
           join tenants cu on cu.id = r.customer_id and cu.type = 'customer'
          where r.carrier_id = $1
          group by cu.id, cu.name, cu.status`,
        [ctx.tenantId],
      );
      const events = await pool.query(
        `select r.customer_id, r.reference reservation_reference, e.type, e.created_at
           from reservation_events e
           join reservations r on r.id = e.reservation_id
          where r.carrier_id = $1
            and e.type in ('TESLIM','GELMEDI','IPTAL','RET','EKSIK_HASAR','TASIYICI_ONAYI_BEKLIYOR')
          order by e.created_at desc, e.id desc`,
        [ctx.tenantId],
      );
      const recent = new Map<string, { type: string; label: string; at: string; reservationReference: string }[]>();
      for (const event of events.rows) {
        const list = recent.get(event.customer_id) ?? [];
        if (list.length >= 5) continue;
        list.push({
          type: event.type,
          label: STATUS_LABELS[event.type] ?? event.type,
          at: new Date(event.created_at).toISOString(),
          reservationReference: event.reservation_reference,
        });
        recent.set(event.customer_id, list);
      }
      const riskOrder: Record<CustomerRiskCategory, number> = { RISKLI: 0, IZLENMELI: 1, UYGUN: 2 };
      const items = metrics.rows.map((row) => {
        const delivered = Number(row.delivered);
        const verifiedNoShows = Number(row.no_show);
        return {
          id: row.customer_id,
          name: row.customer_name,
          tenantStatus: row.tenant_status,
          totalReservations: Number(row.total_reservations),
          delivered,
          verifiedNoShows,
          cancelled: Number(row.cancelled),
          rejected: Number(row.rejected),
          damaged: Number(row.damaged),
          pending: Number(row.pending),
          active: Number(row.active),
          lastReservationAt: new Date(row.last_reservation_at).toISOString(),
          recentEvents: recent.get(row.customer_id) ?? [],
          ...customerReliability(delivered, verifiedNoShows),
        };
      }).sort((a, b) => riskOrder[a.category] - riskOrder[b.category] || a.score - b.score || a.name.localeCompare(b.name, "tr-TR"));
      return ok({ items });
    },
  }];
}
