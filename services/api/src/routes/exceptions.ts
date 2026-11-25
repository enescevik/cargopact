import type pg from "pg";
import { z } from "zod";
import type { Role } from "@cargopact/contracts";
import { withTx } from "@cargopact/db";
import { audit } from "../lib/audit";
import { requireRole, type AuthContext } from "../lib/auth";
import { notFound, ok, validation } from "../lib/http";
import type { Route } from "./master-data";

const CARRIER: readonly Role[] = ["carrier_admin", "carrier_planner", "carrier_warehouse"];
const MIN = 60_000;
const HOUR = 3_600_000;
const iso = (d: unknown): string => (d instanceof Date ? d : new Date(String(d))).toISOString();
const uuid = z.string().uuid();
const EXC_ID = /^([A-Z_]{3,30}):([0-9a-f-]{36})$/;
const CONFIRMED_PLUS = ["ONAYLI", "DEPO_KABUL", "YUKLENDI", "VARISTA", "TESLIM", "EKSIK_HASAR"];

export type ExceptionType = "GELMEDI" | "EKSIK_HASAR" | "LATE_DROPOFF" | "NOT_PICKED_UP" | "NEEDS_REVIEW" | "MEASUREMENT_DIFF" | "EXPIRED_HOLD";
type Severity = "high" | "medium" | "low";
type Responsible = "Müşteri" | "Taşıyıcı" | "Depo";
export interface ExceptionItem {
  id: string; type: ExceptionType; severity: Severity; title: string;
  reservation: { id: string; reference: string; orderNumber: string | null; customerName: string; pallets: number; status: string };
  tripId: string; tripReference: string; detectedAt: string; responsible: Responsible; reasonCode: string; suggestedAction: string;
  status: "open" | "resolved"; resolution: { note: string; by: string | null; at: string } | null;
}

/** Varış günü (İstanbul, UTC+3 sabit) + teslim alma penceresi bitişi. */
export function pickupDeadline(arrivalEta: Date, pickupWindow: { to?: string } | null): Date {
  const local = new Date(arrivalEta.getTime() + 3 * HOUR).toISOString().slice(0, 10);
  const to = /^\d{2}:\d{2}$/.test(pickupWindow?.to ?? "") ? pickupWindow!.to! : "18:00";
  return new Date(`${local}T${to}:00+03:00`);
}

interface Row { [k: string]: any } // eslint-disable-line @typescript-eslint/no-explicit-any

async function hasTable(pool: pg.Pool, name: string): Promise<boolean> {
  const r = await pool.query("select 1 from information_schema.tables where table_schema = 'public' and table_name = $1", [name]);
  return r.rows.length > 0;
}

/** İstisnaları mevcut verilerden hesaplar; durum yalnız exception_resolutions'tan gelir. */
export async function computeExceptions(pool: pg.Pool, carrierId: string, now: Date, tripId?: string): Promise<ExceptionItem[]> {
  const out: ExceptionItem[] = [];
  const base = `select r.id, r.reference, r.order_number, r.pallets, r.status, r.needs_review, r.updated_at, r.decision_reason,
        cu.name customer_name, t.id trip_id, t.reference trip_reference, t.departure_at, t.arrival_eta, t.intake_cutoff_at, d.pickup_window
      from reservations r join tenants cu on cu.id = r.customer_id join trips t on t.id = r.trip_id join facilities d on d.id = t.destination_facility_id
     where r.carrier_id = $1 and ($2::uuid is null or r.trip_id = $2)`;
  const rows: Row[] = (await pool.query(`${base} and (r.status in ('GELMEDI','EKSIK_HASAR','ONAYLI','VARISTA','SURESI_DOLDU') or r.needs_review = true) order by r.updated_at desc limit 500`, [carrierId, tripId ?? null])).rows;
  const add = (r: Row, type: ExceptionType, severity: Severity, title: string, detectedAt: Date, responsible: Responsible, reasonCode: string, suggestedAction: string) =>
    out.push({
      id: `${type}:${r.id}`, type, severity, title,
      reservation: { id: r.id, reference: r.reference, orderNumber: r.order_number ?? null, customerName: r.customer_name, pallets: Number(r.pallets), status: r.status },
      tripId: r.trip_id, tripReference: r.trip_reference, detectedAt: detectedAt.toISOString(), responsible, reasonCode, suggestedAction, status: "open", resolution: null,
    });
  for (const r of rows) {
    const upd = new Date(r.updated_at);
    const cutoff = new Date(r.intake_cutoff_at);
    if (r.status === "GELMEDI") add(r, "GELMEDI", "high", "Yük getirilmedi (gelmeme)", upd, "Müşteri", "NO_SHOW_VERIFIED", "Gelmeme kaydını doğrulayın; iptal ücreti ve müşteri önceliği kayıtlara yansır.");
    if (r.status === "EKSIK_HASAR") add(r, "EKSIK_HASAR", "high", "Eksik veya hasarlı palet bildirimi", upd, "Taşıyıcı", "DAMAGE_OR_SHORTAGE", "Palet bazında hasar/eksik talebini inceleyin ve kısmi iade kararı verin.");
    if (r.status === "ONAYLI") {
      if (now.getTime() > cutoff.getTime()) add(r, "LATE_DROPOFF", "high", "Yük kabul süresi (T−1) içinde teslim edilmedi", cutoff, "Müşteri", "LATE_DROPOFF", "Müşteriyle iletişime geçin; yük standart akışta işlenmez, operasyona gecikme bildirin.");
      else if (cutoff.getTime() - now.getTime() <= 30 * MIN) add(r, "LATE_DROPOFF", "medium", "Kabul süresi yaklaşıyor, yük henüz gelmedi", new Date(cutoff.getTime() - 30 * MIN), "Müşteri", "LATE_DROPOFF_RISK", "Müşteriyi arayıp yükün zamanında getirileceğini doğrulayın.");
    }
    if (r.status === "VARISTA") {
      const dl = pickupDeadline(new Date(r.arrival_eta), r.pickup_window);
      if (now.getTime() > dl.getTime()) add(r, "NOT_PICKED_UP", "medium", "Varış deposundan teslim alınmadı", dl, "Müşteri", "NOT_PICKED_UP", "Alıcıyla iletişime geçin; yeni teslim alma zamanı veya saklama planlayın.");
    }
    if (r.needs_review === true && !["RET", "IPTAL", "SURESI_DOLDU", "TESLIM"].includes(r.status)) add(r, "NEEDS_REVIEW", "medium", "Sefer değişikliği sonrası uygunluk incelemesi bekliyor", upd, "Taşıyıcı", "TRIP_CHANGED_REVIEW", "Talebi inceleyip onaylayın veya reddedin.");
    if (r.status === "SURESI_DOLDU" && now.getTime() - upd.getTime() <= 24 * HOUR) add(r, "EXPIRED_HOLD", "low", "Geçici blokaj süresi doldu", upd, "Müşteri", "HOLD_EXPIRED", "Kapasite iade edildi; gerekirse müşteriyle yeniden teklif için iletişime geçin.");
  }
  if (await hasTable(pool, "warehouse_measurements")) {
    const m: Row[] = (await pool.query(
      `select * from (select distinct on (w.reservation_id) w.reservation_id, w.outcome, w.diff_kg, w.diff_pallets, w.created_at
           from warehouse_measurements w join reservations r on r.id = w.reservation_id where r.carrier_id = $1 and ($2::uuid is null or r.trip_id = $2)
          order by w.reservation_id, w.created_at desc) x where x.outcome in ('review','partial','rejected')`, [carrierId, tripId ?? null])).rows;
    if (m.length) {
      const rs: Row[] = (await pool.query(`${base} and r.id = any($3::uuid[])`, [carrierId, tripId ?? null, m.map((x) => x.reservation_id)])).rows;
      const by = new Map(rs.map((r) => [r.id, r]));
      for (const x of m) {
        const r = by.get(x.reservation_id);
        if (!r) continue;
        const detail = `Fark: ${Number(x.diff_pallets)} palet, ${Number(x.diff_kg)} kg.`;
        const [sev, title, code, act] = x.outcome === "rejected"
          ? ["high", "Depo ölçümü: yük reddedildi", "MEASUREMENT_REJECTED", "Reddi müşteriye bildirin ve iade/yeniden planlama sürecini başlatın."]
          : x.outcome === "partial"
            ? ["medium", "Depo ölçümü: kısmi kabul", "MEASUREMENT_PARTIAL", "Kabul edilen miktarı ve fiyat farkını müşteriyle doğrulayın."]
            : ["medium", "Depo ölçümü beyandan farklı, inceleme gerekli", "MEASUREMENT_REVIEW", "Ölçümü inceleyip uygunluğu yeniden değerlendirin."];
        add(r, "MEASUREMENT_DIFF", sev as Severity, `${title}. ${detail}`, new Date(x.created_at), "Depo", code, act);
      }
    }
  }
  if (await hasTable(pool, "exception_resolutions")) {
    const res: Row[] = (await pool.query(
      `select e.exception_id, e.note, e.resolved_at, u.email from exception_resolutions e left join users u on u.id = e.resolved_by where e.carrier_id = $1`, [carrierId])).rows;
    const map = new Map(res.map((x) => [x.exception_id, x]));
    for (const it of out) {
      const x = map.get(it.id);
      if (x) { it.status = "resolved"; it.resolution = { note: x.note, by: x.email ?? null, at: iso(x.resolved_at) }; }
    }
  }
  const sev = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => Number(a.status === "resolved") - Number(b.status === "resolved") || sev[a.severity] - sev[b.severity] || b.detectedAt.localeCompare(a.detectedAt));
}

const resolveBody = z.object({ note: z.string().trim().min(1, "Not zorunlu.").max(500) });

export function exceptionRoutes(pool: pg.Pool): Route[] {
  return [
    {
      method: "GET", pattern: "/carrier/exceptions",
      handler: async (ctx, req) => {
        requireRole(ctx, CARRIER);
        const st = req.query.status;
        if (st !== undefined && st !== "open" && st !== "resolved") throw validation("status open veya resolved olmalı.");
        const tripId = req.query.tripId ? (uuid.safeParse(req.query.tripId).success ? req.query.tripId : (() => { throw validation("tripId geçersiz."); })()) : undefined;
        const all = await computeExceptions(pool, ctx.tenantId, new Date(), tripId);
        const items = st ? all.filter((i) => i.status === st) : all;
        return ok({ items, counts: { open: all.filter((i) => i.status === "open").length, resolved: all.filter((i) => i.status === "resolved").length } });
      },
    },
    {
      method: "POST", pattern: "/carrier/exceptions/{id}/resolve",
      handler: async (ctx: AuthContext, req) => {
        requireRole(ctx, CARRIER);
        const id = req.params.id;
        if (!EXC_ID.test(id)) throw notFound("İstisna");
        const { note } = resolveBody.parse(req.body ?? {});
        const exc = (await computeExceptions(pool, ctx.tenantId, new Date())).find((i) => i.id === id);
        if (!exc) throw notFound("İstisna");
        return withTx(pool, async (c) => {
          const ins = await c.query(
            `insert into exception_resolutions (carrier_id, exception_id, note, resolved_by, is_demo) values ($1,$2,$3,$4,false)
             on conflict (carrier_id, exception_id) do nothing returning exception_id`, [ctx.tenantId, id, note, ctx.userId]);
          if (ins.rows.length) await audit(c, ctx, { action: "exception.resolve", entityType: "exception", entityId: exc.reservation.id, after: { exceptionId: id, type: exc.type, note } });
          const r = (await c.query("select e.note, e.resolved_at, u.email from exception_resolutions e left join users u on u.id = e.resolved_by where e.carrier_id = $1 and e.exception_id = $2", [ctx.tenantId, id])).rows[0];
          return ok({ ...exc, status: "resolved", resolution: { note: r.note, by: r.email ?? null, at: iso(r.resolved_at) }, alreadyResolved: ins.rows.length === 0 });
        });
      },
    },
    {
      method: "GET", pattern: "/carrier/trips/{id}/manifest",
      handler: async (ctx, req) => {
        requireRole(ctx, CARRIER);
        if (!uuid.safeParse(req.params.id).success) throw notFound("Sefer");
        const t = (await pool.query(
          `select t.id, t.reference, t.departure_at, t.arrival_eta, t.status, v.plate, o.name origin_name, o.city origin_city, d.name dest_name, d.city dest_city
             from trips t join vehicles v on v.id = t.vehicle_id join facilities o on o.id = t.origin_facility_id join facilities d on d.id = t.destination_facility_id
            where t.id = $1 and t.carrier_id = $2`, [req.params.id, ctx.tenantId])).rows[0];
        if (!t) throw notFound("Sefer");
        const rs: Row[] = (await pool.query(
          `select r.id, r.reference, r.order_number, r.status, r.pallets, r.gross_kg, r.volume_m3, r.pallet_codes, r.recipient_name, r.pickup_recipients, cu.name customer_name
             from reservations r join tenants cu on cu.id = r.customer_id where r.trip_id = $1 and r.carrier_id = $2 and r.status = any($3::text[]) order by r.order_number, r.created_at`,
          [t.id, ctx.tenantId, CONFIRMED_PLUS])).rows;
        const items = rs.map((r) => {
          const rec = (Array.isArray(r.pickup_recipients) ? r.pickup_recipients : r.recipient_name ? [{ name: r.recipient_name }] : []) as { name?: string }[];
          return {
            reservationId: r.id, reference: r.reference, orderNumber: r.order_number ?? null, customerName: r.customer_name, status: r.status,
            pallets: Number(r.pallets), grossKg: Number(r.gross_kg), volumeM3: Number(r.volume_m3),
            palletCodes: (Array.isArray(r.pallet_codes) ? r.pallet_codes : []) as string[], recipients: rec.map((x) => x.name).filter((n): n is string => !!n),
          };
        });
        return ok({
          trip: { id: t.id, reference: t.reference, status: t.status, plate: t.plate, departureAt: iso(t.departure_at), arrivalEta: iso(t.arrival_eta),
            origin: { name: t.origin_name, city: t.origin_city }, destination: { name: t.dest_name, city: t.dest_city } },
          items,
          totals: { reservations: items.length, pallets: items.reduce((a, i) => a + i.pallets, 0), grossKg: items.reduce((a, i) => a + i.grossKg, 0), volumeM3: Math.round(items.reduce((a, i) => a + i.volumeM3, 0) * 100) / 100 },
          generatedAt: new Date().toISOString(),
        });
      },
    },
  ];
}
