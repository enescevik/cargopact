import { createHash } from "node:crypto";
import type pg from "pg";
import { tmsTripInput, wmsPalletEventInput, type Role } from "@cargopact/contracts";
import { defaultVolume } from "@cargopact/domain";
import { requireRole } from "../lib/auth";
import { HttpError, notFound, ok, validation } from "../lib/http";
import { flushCarrier, integrationStatus } from "../lib/events";
import { carrierTrip, loadTrips } from "../lib/trips";
import { demoRoutes } from "./demo";
import type { Route } from "./master-data";

const PLANNERS: readonly Role[] = ["carrier_admin", "carrier_planner"];
const CARRIER_ALL: readonly Role[] = ["carrier_admin", "carrier_planner", "carrier_warehouse"];
const DEFAULT_BASE_PRICE_MINOR = 100000; // TMS fiyat göndermez; aynı hat için son seferin taban fiyatı, yoksa bu değer.
const WMS_TO_RESERVATION = { RECEIVED: "DEPO_KABUL", LOADED: "YUKLENDI", ARRIVED: "VARISTA", DELIVERED: "TESLIM" } as const;
const key = (...parts: string[]) => createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 40);

/**
 * Entegrasyon katmanı. Durum makinesi ve sefer doğrulaması TEKRARLANMAZ: mevcut demo rotalarının
 * işleyicileri (POST /carrier/trips, POST /carrier/reservations/{id}/events) içeriden çağrılır.
 */
export function integrationRoutes(pool: pg.Pool): Route[] {
  const base = demoRoutes(pool);
  const find = (method: string, pattern: string) => {
    const r = base.find((x) => x.method === method && x.pattern === pattern);
    if (!r) throw new Error(`Rota yok: ${method} ${pattern}`);
    return r.handler;
  };
  const createTrip = find("POST", "/carrier/trips");
  const recordEvent = find("POST", "/carrier/reservations/{id}/events");
  return [
    {
      method: "POST", pattern: "/carrier/integrations/tms/trips",
      handler: async (ctx, req) => {
        requireRole(ctx, PLANNERS);
        const i = tmsTripInput.parse(req.body);
        const view = async (id: string) => carrierTrip((await loadTrips(pool, "where t.id = $1", [id]))[0], new Date(), 0);
        const ex = (await pool.query("select id, carrier_id from trips where reference = $1", [i.externalTripNo])).rows[0];
        if (ex) {
          if (ex.carrier_id !== ctx.tenantId) throw new HttpError("CONFLICT", "Bu sefer numarası kullanımda.", { reason: "EXTERNAL_TRIP_NO_TAKEN" });
          return ok({ externalTripNo: i.externalTripNo, created: false, trip: await view(ex.id) });
        }
        const fac = (await pool.query("select id, code from facilities where carrier_id = $1 and code = any($2::text[])", [ctx.tenantId, [i.originCode, i.destinationCode]])).rows;
        const origin = fac.find((f) => f.code === i.originCode), dest = fac.find((f) => f.code === i.destinationCode);
        if (!origin) throw validation(`Çıkış tesisi kodu bulunamadı: ${i.originCode}`);
        if (!dest) throw validation(`Varış tesisi kodu bulunamadı: ${i.destinationCode}`);
        const veh = (await pool.query(
          "select v.id, vt.pallet_positions from vehicles v join vehicle_types vt on vt.id = v.vehicle_type_id where v.carrier_id = $1 and upper(replace(v.plate, ' ', '')) = $2",
          [ctx.tenantId, i.plate.toUpperCase().replace(/\s+/g, "")])).rows[0];
        if (!veh) throw validation(`Plaka bulunamadı: ${i.plate}`);
        const last = (await pool.query("select base_price_minor from trips where carrier_id = $1 and origin_facility_id = $2 and destination_facility_id = $3 order by created_at desc limit 1", [ctx.tenantId, origin.id, dest.id])).rows[0];
        const sellablePallets = Math.max(0, veh.pallet_positions - i.internalPallets);
        const body = {
          originFacilityId: origin.id, destinationFacilityId: dest.id, vehicleId: veh.id, departureAt: i.plannedDeparture, arrivalEta: i.plannedArrival,
          internalPallets: i.internalPallets, internalKg: i.internalKg, maxGrossKg: i.maxGrossKg, sellablePallets,
          sellableKg: Math.max(0, i.maxGrossKg - i.internalKg), sellableM3: defaultVolume(sellablePallets),
          basePriceMinor: Number(last?.base_price_minor ?? DEFAULT_BASE_PRICE_MINOR), publish: false,
        };
        // Aynı externalTripNo eşzamanlı gelirse aynı idempotency anahtarı tek sefer üretir.
        const res = await createTrip(ctx, { ...req, body, headers: { ...req.headers, "idempotency-key": "tms-" + key(ctx.tenantId, i.externalTripNo) } });
        const id = (res.body as { id: string }).id;
        await pool.query("update trips set reference = $2, version = version + 1, updated_at = now() where id = $1 and carrier_id = $3", [id, i.externalTripNo, ctx.tenantId]);
        return ok({ externalTripNo: i.externalTripNo, created: true, trip: await view(id) }, 201);
      },
    },
    {
      method: "POST", pattern: "/warehouse/integrations/wms/pallet-events",
      handler: async (ctx, req) => {
        requireRole(ctx, CARRIER_ALL);
        const i = wmsPalletEventInput.parse(req.body);
        const m = /^(CP-\d{4}-\d{6})-P(\d+)$/.exec(i.palletCode);
        if (!m) throw validation("Palet kodu CP-YYYY-NNNNNN-P<n> biçiminde olmalı.");
        const r = (await pool.query("select id, status, pallets, pallet_codes, is_demo from reservations where order_number = $1 and carrier_id = $2", [m[1], ctx.tenantId])).rows[0];
        if (!r || !(r.pallet_codes as string[]).includes(i.palletCode)) throw notFound("Palet");
        const type = WMS_TO_RESERVATION[i.eventType];
        // Teslim yetkisi palet kodundan ayrı doğrulanır: WMS teslim bildirimi alıcı/kod kontrolünü atlayamaz.
        if (i.eventType === "DELIVERED") throw new HttpError("CONFLICT", "Teslim, alıcı adı ve teslim koduyla taşıyıcı uygulamasında kaydedilmelidir; WMS bildirimi bu kontrolü atlayamaz.", { reason: "RECIPIENT_CHECK_REQUIRED" });
        await pool.query(
          "insert into wms_pallet_events (carrier_id, reservation_id, pallet_code, event_type, occurred_at, is_demo) values ($1,$2,$3,$4,$5,$6) on conflict (pallet_code, event_type) do nothing",
          [ctx.tenantId, r.id, i.palletCode, i.eventType, new Date(i.occurredAt), r.is_demo]);
        const seen = Number((await pool.query("select count(*) n from wms_pallet_events where reservation_id = $1 and event_type = $2", [r.id, i.eventType])).rows[0].n);
        const base = { palletCode: i.palletCode, eventType: i.eventType, reservationEvent: type, palletsSeen: seen, palletsTotal: r.pallets };
        if (seen < r.pallets) return ok({ ...base, transitioned: false, reservationStatus: r.status });
        // Tüm paletler bildirildi: rezervasyon düzeyi geçişi mevcut durum makinesine devret.
        const res = await recordEvent(ctx, { ...req, params: { id: r.id }, body: { type, note: `WMS: ${i.eventType}` }, headers: { ...req.headers, "idempotency-key": "wms-" + key(m[1], type) } });
        return ok({ ...base, transitioned: true, reservationStatus: (res.body as { status?: string })?.status ?? type });
      },
    },
    {
      method: "GET", pattern: "/carrier/integrations/status",
      handler: async (ctx) => { requireRole(ctx, CARRIER_ALL); return ok(await integrationStatus(pool, ctx.tenantId)); },
    },
    {
      method: "POST", pattern: "/carrier/integrations/events/flush",
      handler: async (ctx) => { requireRole(ctx, PLANNERS); return ok(await flushCarrier(pool, ctx.tenantId)); },
    },
  ];
}
