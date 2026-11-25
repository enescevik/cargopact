import type pg from "pg";
import { requireRole } from "../lib/auth";
import { ok, validation } from "../lib/http";
import { carbonOf, loadTrips } from "../lib/trips";
import { CARBON_METHOD } from "@cargopact/domain";
import type { Route } from "./master-data";
const DAY = 86_400_000;
const CONFIRMED = ["ONAYLI", "DEPO_KABUL", "YUKLENDI", "VARISTA", "TESLIM", "EKSIK_HASAR"];
const LOADED = ["YUKLENDI", "VARISTA", "TESLIM", "EKSIK_HASAR"];
/** Değişken maliyet varsayımı: palet başına 200 TL (kuruş). */
export const VARIABLE_COST_PER_PALLET_MINOR = 20_000;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
interface Metric { value: number | null; numerator: number; denominator: number; formula: string; unit: "percent" | "minutes" | "count" | "minor" | "pallets" }
const pct = (n: number, d: number, formula: string): Metric => ({ value: d > 0 ? Math.round((n / d) * 1000) / 10 : null, numerator: n, denominator: d, formula, unit: "percent" });
const count = (n: number, d: number, formula: string): Metric => ({ value: n, numerator: n, denominator: d, formula, unit: "count" });
const num = (v: unknown) => Number(v ?? 0);

function parseDate(v: string | undefined, fallback: Date, field: string): Date {
  if (!v) return fallback;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00+03:00` : v);
  if (Number.isNaN(d.getTime())) throw validation("Tarih geçersiz (YYYY-MM-DD veya ISO).", { field });
  return d;
}
/** Yerel gün*1440+dakika ölçeği (saat dilimi duvar saati) — pencere karşılaştırması için. */
function localKey(d: Date, tz: string): { day: number; min: number } {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value]));
  return { day: Math.floor(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)) / DAY), min: Number(p.hour) * 60 + Number(p.minute) };
}
const hm = (s: string | undefined, def: number) => { const m = /^(\d{1,2}):(\d{2})$/.exec(s ?? ""); return m ? Number(m[1]) * 60 + Number(m[2]) : def; };
/** Teslim, varış gününün alım penceresinde mi? Varış pencere kapandıktan sonraysa pencere ertesi gündür; pencere açılmadan önceyse aynı gün. */
export function pickupOnTime(deliveredAt: Date, arrivalEta: Date, window: { from?: string; to?: string } | null, tz: string): boolean {
  const to = hm(window?.to, 23 * 60 + 59);
  const a = localKey(arrivalEta, tz), t = localKey(deliveredAt, tz);
  return t.day * 1440 + t.min <= (a.day + (a.min > to ? 1 : 0)) * 1440 + to;
}
const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function kpiRoutes(pool: pg.Pool): Route[] {
  return [{
    method: "GET", pattern: "/carrier/kpis",
    handler: async (ctx, req) => {
      requireRole(ctx, ["carrier_admin", "carrier_planner", "carrier_warehouse", "platform_admin", "admin_viewer"]);
      const now = new Date();
      const from = parseDate(req.query.from, new Date(now.getTime() - 30 * DAY), "from");
      const to = parseDate(req.query.to ? req.query.to : undefined, new Date(now.getTime() + 7 * DAY), "to");
      if (to <= from) throw validation("Bitiş tarihi başlangıçtan sonra olmalı.", { field: "to" });
      if (to.getTime() - from.getTime() > 366 * DAY) throw validation("Aralık en çok 366 gün olabilir.", { field: "to" });
      const all = ctx.tenantType === "platform";
      const sc = [all, ctx.tenantId, from, to];
      const [qr, resQ, evQ, ledQ, tripQ] = await Promise.all([
        pool.query(`select count(*) filter (where eligible) eligible, count(*) total from quote_requests where ($1::boolean or carrier_id = $2) and created_at >= $3 and created_at < $4`, sc),
        pool.query(`select r.id, r.status, r.pallets, r.created_at, r.trip_id, r.alternative_scenario, t.intake_cutoff_at, t.arrival_eta, d.pickup_window, d.timezone
                      from reservations r join trips t on t.id = r.trip_id join facilities d on d.id = t.destination_facility_id
                     where ($1::boolean or r.carrier_id = $2) and r.created_at >= $3 and r.created_at < $4`, sc),
        pool.query(`select e.reservation_id, e.type, e.created_at from reservation_events e join reservations r on r.id = e.reservation_id
                     where ($1::boolean or r.carrier_id = $2) and r.created_at >= $3 and r.created_at < $4`, sc),
        pool.query(`select l.type, coalesce(sum(l.amount_minor), 0) amt from ledger_entries l join reservations r on r.id = l.reservation_id
                     where ($1::boolean or r.carrier_id = $2) and r.created_at >= $3 and r.created_at < $4 group by l.type`, sc),
        pool.query(`select t.id, t.reference, t.status, t.departure_at, t.total_positions, t.internal_pallets, t.sellable_pallets, t.sellable_kg, t.sellable_m3, t.carrier_id,
                           o.name o_name, d.name d_name, c.held_pallets, c.held_kg, c.held_m3, c.confirmed_pallets, c.confirmed_kg, c.confirmed_m3, c.loaded_pallets, c.loaded_kg
                      from trips t join facilities o on o.id = t.origin_facility_id join facilities d on d.id = t.destination_facility_id
                      left join trip_capacity c on c.trip_id = t.id
                     where ($1::boolean or t.carrier_id = $2) and t.departure_at >= $3 and t.departure_at < $4 and t.status not in ('draft','cancelled')
                     order by t.departure_at`, sc),
      ]);
      // Seçili seferlerin ham rezervasyon toplamları (kapasite sayacından bağımsız): çift rezervasyon denetimi ve fiili m³.
      const tripIds = tripQ.rows.map((t) => t.id as string);
      const raw = tripIds.length ? (await pool.query(
        `select trip_id,
                coalesce(sum(pallets) filter (where status = 'TASIYICI_ONAYI_BEKLIYOR' and (hold_expires_at is null or hold_expires_at > now())), 0) held_p,
                coalesce(sum(pallets) filter (where status = any($2::text[])), 0) conf_p,
                coalesce(sum(volume_m3) filter (where status = any($3::text[])), 0) loaded_m3
           from reservations where trip_id = any($1::uuid[]) group by trip_id`, [tripIds, CONFIRMED, LOADED])).rows : [];
      const rawBy = new Map<string, Row>(raw.map((r) => [r.trip_id, r]));

      const ev = new Map<string, Map<string, Date>>();
      for (const e of evQ.rows) { const m = ev.get(e.reservation_id) ?? new Map<string, Date>(); m.set(e.type, e.created_at); ev.set(e.reservation_id, m); }
      const rs = resQ.rows;
      const has = (r: Row, t: string) => ev.get(r.id)?.has(t) === true;
      const eligibleQuotes = num(qr.rows[0].eligible);
      const decided = rs.filter((r) => r.status !== "TASIYICI_ONAYI_BEKLIYOR");
      const approved = rs.filter((r) => has(r, "ONAYLI"));
      const mins = rs.flatMap((r) => { const e = ev.get(r.id); const d = e?.get("ONAYLI") ?? e?.get("RET"); return d ? [Math.max(0, (d.getTime() - r.created_at.getTime()) / 60_000)] : []; });
      const avg = mins.length ? Math.round((mins.reduce((a, b) => a + b, 0) / mins.length) * 10) / 10 : null;
      const med = median(mins);
      const intake = rs.filter((r) => has(r, "DEPO_KABUL"));
      const intakeOk = intake.filter((r) => ev.get(r.id)!.get("DEPO_KABUL")! <= r.intake_cutoff_at);
      const delivered = rs.filter((r) => has(r, "TESLIM"));
      const deliveredOk = delivered.filter((r) => pickupOnTime(ev.get(r.id)!.get("TESLIM")!, r.arrival_eta, r.pickup_window, r.timezone || "Europe/Istanbul"));
      const loadedRes = rs.filter((r) => LOADED.includes(r.status));
      const damaged = rs.filter((r) => r.status === "EKSIK_HASAR");
      const noShow = rs.filter((r) => r.status === "GELMEDI");
      const led = new Map<string, number>(ledQ.rows.map((l) => [l.type, num(l.amt)]));
      const revenue = (led.get("CAPTURED") ?? 0) - (led.get("REFUNDED") ?? 0);
      const costPallets = rs.filter((r) => CONFIRMED.includes(r.status)).reduce((a, r) => a + num(r.pallets), 0);
      const cost = costPallets * VARIABLE_COST_PER_PALLET_MINOR;

      const confRes = rs.filter((r) => CONFIRMED.includes(r.status));
      const carbonTrips = confRes.length ? new Map((await loadTrips(pool, "where t.id = any($1::uuid[])", [[...new Set(confRes.map((r) => r.trip_id as string))]])).map((t) => [t.id, t])) : new Map<string, Row>();
      let cAlloc = 0, cSaved = 0, cScen = 0, cPallets = 0;
      for (const r of confRes) {
        const c = carbonOf(carbonTrips.get(r.trip_id)!, num(r.pallets), r.alternative_scenario);
        cAlloc += c.allocatedKg; cPallets += num(r.pallets);
        if (c.savedKg !== null) { cSaved += c.savedKg; cScen++; }
      }
      const r1 = (n: number) => Math.round(n * 10) / 10;
      const carbon = { allocatedKg: r1(cAlloc), declaredSavedKg: r1(cSaved), perPalletAllocatedKg: cPallets > 0 ? r1(cAlloc / cPallets) : 0, reservationsWithScenario: cScen, reservationsTotal: confRes.length, method: CARBON_METHOD, isDemoFactors: true as const };
      const trips = tripQ.rows.map((t) => {
        const rw = rawBy.get(t.id);
        const cap = { heldP: num(t.held_pallets), heldKg: num(t.held_kg), heldM3: num(t.held_m3), confP: num(t.confirmed_pallets), confKg: num(t.confirmed_kg), confM3: num(t.confirmed_m3) };
        const reserveViolation = cap.confP + cap.heldP > t.sellable_pallets || cap.confKg + cap.heldKg > t.sellable_kg || cap.confM3 + cap.heldM3 > num(t.sellable_m3) + 0.005;
        const doubleBooked = rw ? (num(rw.conf_p) + num(rw.held_p) > t.sellable_pallets || num(rw.conf_p) !== cap.confP || num(rw.held_p) !== cap.heldP) : false;
        return {
          tripId: t.id as string, reference: t.reference as string, route: `${t.o_name} → ${t.d_name}`, status: t.status as string, departureAt: (t.departure_at as Date).toISOString(),
          sellable: { pallets: num(t.sellable_pallets), kg: num(t.sellable_kg), m3: num(t.sellable_m3) },
          held: { pallets: cap.heldP, kg: cap.heldKg, m3: cap.heldM3 },
          planned: { pallets: cap.confP, kg: cap.confKg, m3: cap.confM3 },
          actual: { pallets: num(t.loaded_pallets), kg: num(t.loaded_kg), m3: Math.round(num(rw?.loaded_m3) * 100) / 100 },
          internalPallets: num(t.internal_pallets), totalPositions: num(t.total_positions),
          internalReserveViolation: reserveViolation, doubleBooking: doubleBooked,
        };
      });
      const offered = trips.reduce((a, t) => a + t.sellable.pallets, 0);
      const soldExt = trips.reduce((a, t) => a + t.planned.pallets, 0);
      const loadedExt = trips.reduce((a, t) => a + t.actual.pallets, 0);

      const metrics = {
        quoteToReservation: pct(rs.length, eligibleQuotes, "Rezervasyon talebi ÷ uygun (eligible) fiyat teklifi sayısı"),
        reservationToApproval: pct(approved.length, decided.length, "Taşıyıcı onayı alan rezervasyon ÷ karara bağlanmış rezervasyon (bekleyenler hariç)"),
        decisionMinutesAvg: { value: avg, numerator: Math.round(mins.reduce((a, b) => a + b, 0)), denominator: mins.length, formula: "Karar süresi (dk) ortalaması: rezervasyon oluşturma → ONAYLI/RET olayı", unit: "minutes" } as Metric,
        decisionMinutesMedian: { value: med === null ? null : Math.round(med * 10) / 10, numerator: mins.length, denominator: mins.length, formula: "Karar süresi (dk) medyanı: rezervasyon oluşturma → ONAYLI/RET olayı", unit: "minutes" } as Metric,
        onTimeDropoff: pct(intakeOk.length, intake.length, "Depo kabulü kabul kesim saatinden (T−1) önce yapılan sipariş ÷ depo kabulü yapılan sipariş"),
        onTimePickup: pct(deliveredOk.length, delivered.length, "Varış gününün alım penceresinde teslim alınan sipariş ÷ teslim edilen sipariş"),
        damageRate: pct(damaged.length, loadedRes.length, "Eksik/hasar bildirilen sipariş ÷ yüklenen sipariş"),
        noShowRate: pct(noShow.length, approved.length, "Doğrulanmış gelmeme (GELMEDI) ÷ onaylanan sipariş"),
        soldExternalPallets: pct(soldExt, offered, "Onaylı dış palet pozisyonu ÷ satışa açılmış palet pozisyonu"),
        loadedExternalPallets: pct(loadedExt, offered, "Araca yüklenmiş dış palet pozisyonu ÷ satışa açılmış palet pozisyonu"),
        internalReserveViolations: count(trips.filter((t) => t.internalReserveViolation).length, trips.length, "Onaylı + bekleyen blokaj, satılabilir kapasiteyi (palet/kg/m³) aşan sefer sayısı (hedef 0)"),
        doubleBookings: count(trips.filter((t) => t.doubleBooking).length, trips.length, "Rezervasyon kayıtlarından hesaplanan dolu palet, satılabilir kapasiteyi aşan veya kapasite sayacıyla uyuşmayan sefer sayısı (hedef 0)"),
        grossRevenueMinor: { value: revenue, numerator: revenue, denominator: 1, formula: "Defter: tahsil edilen (CAPTURED) − iade edilen (REFUNDED), kuruş", unit: "minor" } as Metric,
        variableCostMinor: { value: cost, numerator: costPallets, denominator: 1, formula: `Onaylı palet adedi × ${VARIABLE_COST_PER_PALLET_MINOR / 100} TL/palet değişken maliyet`, unit: "minor" } as Metric,
        contributionMinor: { value: revenue - cost, numerator: revenue, denominator: cost, formula: "Brüt gelir − değişken maliyet, kuruş", unit: "minor" } as Metric,
      };
      return ok({ from: from.toISOString(), to: to.toISOString(), scope: all ? "all-carriers" : "carrier", generatedAt: now.toISOString(), counts: { quotes: num(qr.rows[0].total), eligibleQuotes, reservations: rs.length, trips: trips.length }, metrics, carbon, trips });
    },
  }];
}
