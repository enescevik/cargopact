import type pg from "pg";
import { withTx } from "../tx";
import { pickupFields } from "../pickup";
import { demoId } from "./ids";
import { assertSeedAllowed, tenantId, upsert } from "./seed";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const HOUR = 3_600_000;
export const DEMO_TRIP_REF = "DNC-DEMO-GEB-ANK";

/** İstanbul (UTC+3, DST yok) yerel saatiyle bugünden +gün, saat:dakika. */
function istanbulAt(now: Date, dayOffset: number, hh: number, mm = 0): Date {
  const local = new Date(now.getTime() + 3 * HOUR);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + dayOffset, hh - 3, mm));
}

interface TripSeed {
  ref: string; carrier: "dincer" | "siva"; origin: string; dest: string; plate: string; dep: Date; hours: number; status: string; base: number; tir?: boolean;
}

const CONFIRMED = ["ONAYLI", "DEPO_KABUL", "YUKLENDI", "VARISTA", "TESLIM", "EKSIK_HASAR"];
const LOADED = ["YUKLENDI", "VARISTA", "TESLIM", "EKSIK_HASAR"];

async function deleteReservationsOf(pool: pg.Pool, where: string, params: unknown[]) {
  const sub = `select id from reservations where ${where}`;
  for (const t of ["notifications", "warehouse_measurements", "ledger_entries", "reservation_events", "reservation_attachments"]) {
    await withTx(pool, (c) => c.query(`delete from ${t} where reservation_id in (${sub})`, params));
  }
  await withTx(pool, (c) => c.query(`delete from reservations where ${where}`, params));
}

/** Onaylı seed siparişlerine yetkili alıcı + teslim kodu (hash) yazar; bekleyenlere yalnız alıcı. */
function seedPickup(id: string, approved: boolean) {
  const recipients = [{ name: "Mehmet Yılmaz", phone: "+90 532 000 00 01" }];
  const pk = pickupFields(id);
  return { pickup_recipients: recipients, pickup_code_hash: approved ? pk.pickup_code_hash : null, pickup_code_hint: approved ? pk.pickup_code_hint : null, pickup_failed_attempts: 0 };
}

/** Seed L2: sunum seferleri, geçmiş rezervasyonlar, tutarlı kapasite/defter. Tekrar çalıştırılabilir; demo seferini sıfırlar. */
export async function seedDemo(pool: pg.Pool, log: (m: string) => void = console.log): Promise<void> {
  assertSeedAllowed();
  log("Seed L2 (sefer + rezervasyon)");
  const now = new Date();
  const year = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric" }).format(now));

  const trips: TripSeed[] = [
    { ref: DEMO_TRIP_REF, carrier: "dincer", origin: "DNC-GEB-TM", dest: "DNC-ANK-DM", plate: "41DNC101", dep: istanbulAt(now, 1, 18), hours: 8, status: "published", base: 110000, tir: true },
    { ref: "DNC-GEB-BRS", carrier: "dincer", origin: "DNC-GEB-TM", dest: "DNC-BRS-DM", plate: "41DNC201", dep: istanbulAt(now, 1, 20), hours: 3, status: "published", base: 70000 },
    { ref: "DNC-KMP-KNY", carrier: "dincer", origin: "DNC-KMP-TM", dest: "DNC-KNY-DM", plate: "41DNC102", dep: istanbulAt(now, 2, 17), hours: 9, status: "published", base: 180000, tir: true },
    { ref: "DNC-GEB-ADN", carrier: "dincer", origin: "DNC-GEB-TM", dest: "DNC-ADN-DM", plate: "41DNC301", dep: new Date(now.getTime() + 5 * HOUR), hours: 10, status: "published", base: 220000 },
    { ref: "DNC-PAST-GEB-ANK", carrier: "dincer", origin: "DNC-GEB-TM", dest: "DNC-ANK-DM", plate: "41DNC102", dep: istanbulAt(now, -1, 18), hours: 8, status: "completed", base: 110000, tir: true },
    { ref: "SVA-CRK-IZM", carrier: "siva", origin: "SVA-CRK-TM", dest: "SVA-IZM-DM", plate: "59SVA101", dep: istanbulAt(now, 1, 19), hours: 7, status: "published", base: 90000, tir: true },
    { ref: "SVA-MRS-GZT", carrier: "siva", origin: "SVA-MRS-TM", dest: "SVA-GZT-DM", plate: "59SVA301", dep: istanbulAt(now, 1, 16), hours: 5, status: "published", base: 130000 },
  ];
  // 1) TAM SIFIRLAMA: seed listesinde olmayan her rezervasyon ve seferi sil (smoke, TMS, elle oluşturulanlar dahil),
  //    seed seferlerinin tüm rezervasyonlarını da sil; aşağıda yalnız seed rezervasyonları yeniden yazılır.
  const seedTripIds = trips.map((t) => demoId("trips", t.ref));
  const carriers = [tenantId("dincer"), tenantId("siva")];
  const allRes = "trip_id in (select id from trips where carrier_id = any($1::uuid[]))";
  await withTx(pool, (c) => c.query(`delete from wms_pallet_events where reservation_id in (select id from reservations where ${allRes})`, [carriers]));
  await withTx(pool, (c) => c.query("delete from exception_resolutions where carrier_id = any($1::uuid[])", [carriers]));
  await withTx(pool, (c) => c.query("delete from quote_requests where carrier_id = any($1::uuid[])", [carriers]));
  await deleteReservationsOf(pool, allRes, [carriers]);
  const extraTrips = (await pool.query("select id, reference from trips where carrier_id = any($1::uuid[]) and not (id = any($2::uuid[]))", [carriers, seedTripIds])).rows;
  if (extraTrips.length) {
    const ids = extraTrips.map((r) => r.id);
    await withTx(pool, (c) => c.query("delete from trip_capacity where trip_id = any($1::uuid[])", [ids]));
    await withTx(pool, (c) => c.query("delete from trips where id = any($1::uuid[])", [ids]));
  }
  log(`  sıfırlandı: tüm rezervasyonlar, seed dışı ${extraTrips.length} sefer`);
  // Seed dışı (elle/smoke eklenmiş) tesis ve araçlar artık referanssız; sil.
  await withTx(pool, (c) => c.query("delete from vehicles where is_demo = false and carrier_id = any($1::uuid[])", [carriers]));
  await withTx(pool, (c) => c.query("delete from facilities where is_demo = false and carrier_id = any($1::uuid[])", [carriers]));

  const veh = new Map<string, Row>((await pool.query(
    "select v.id, v.plate, vt.pallet_positions pos, vt.max_payload_kg payload from vehicles v join vehicle_types vt on vt.id = v.vehicle_type_id where v.plate = any($1::text[])", [trips.map((t) => t.plate)])).rows.map((r) => [r.plate, r]));
  const tripRows = trips.map((t) => {
    const v = veh.get(t.plate);
    if (!v) throw new Error(`Araç bulunamadı: ${t.plate} (önce seed L1)`);
    const demoShape = t.tir && v.pos === 33;
    const internalPallets = demoShape ? 25 : Math.floor(v.pos * 0.6);
    const sellablePallets = demoShape ? 8 : Math.min(v.pos - internalPallets, Math.max(3, Math.floor(v.pos * 0.3)));
    const maxGross = demoShape ? 22000 : v.payload;
    const internalKg = demoShape ? 17000 : Math.round(v.payload * 0.6);
    const sellableKg = demoShape ? 5000 : Math.round(v.payload * 0.25);
    return {
      id: demoId("trips", t.ref), carrier_id: tenantId(t.carrier), reference: t.ref,
      origin_facility_id: demoId("facilities", t.origin), destination_facility_id: demoId("facilities", t.dest), vehicle_id: v.id,
      departure_at: t.dep, arrival_eta: new Date(t.dep.getTime() + t.hours * HOUR), booking_cutoff_at: new Date(t.dep.getTime() - 3 * HOUR), intake_cutoff_at: new Date(t.dep.getTime() - HOUR),
      status: t.status, total_positions: v.pos, internal_pallets: internalPallets, internal_kg: internalKg, max_gross_kg: maxGross,
      sellable_pallets: sellablePallets, sellable_kg: sellableKg, sellable_m3: demoShape ? 12 : Math.round(sellablePallets * 1.5 * 100) / 100,
      base_price_minor: t.base, pricing_tiers: t.ref === DEMO_TRIP_REF ? { demandTiers: [{ minUtilization: 0, multiplier: 1 }], timeTiers: [] } : null,
      floor_ratio: 0.8, ceiling_ratio: 1.5, capacity_version: 1, is_demo: true, updated_at: now,
    };
  });
  await upsert(pool, "trips", tripRows, ["id"], log);
  // Kayıtlı ticari koşullar (PROJECT_PLAN §5 jüri senaryosu): demo seferinde sözleşmeli birim fiyatlar.
  const demoTrip = demoId("trips", DEMO_TRIP_REF);
  await upsert(pool, "carrier_customer_tariffs", [["marmara", 125000], ["anadolu", 110000], ["baskent", 95000]].map(([cu, price]) => ({
    id: demoId("carrier_customer_tariffs", `${DEMO_TRIP_REF}:${cu}`), carrier_id: tenantId("dincer"), customer_id: tenantId(cu as string), trip_id: demoTrip,
    base_price_minor: price, valid_from: null, valid_to: null, is_demo: true,
  })), ["id"], log);
  const tripBy = new Map(tripRows.map((t) => [t.reference, t]));

  // 3) Geçmiş / geçmiş-durum rezervasyonları (deterministik).
  const pcId = (await pool.query("select id from product_classes where code = 'GENEL' and tenant_id = '00000000-0000-4000-8000-000000000001'")).rows[0].id;
  interface ResSeed { key: string; customer: string; trip: string; status: string; pallets: number; kg: number; order: number | null; events: [string, number][]; plan?: "full" | "deposit"; createdHoursBeforeDep: number }
  const resSeeds: ResSeed[] = [
    { key: "past-baskent-gelmedi", customer: "baskent", trip: "DNC-PAST-GEB-ANK", status: "GELMEDI", pallets: 2, kg: 1200, order: 3, createdHoursBeforeDep: 60,
      events: [["TASIYICI_ONAYI_BEKLIYOR", 60], ["ONAYLI", 58], ["GELMEDI", 0]] },
    { key: "past-marmara-teslim", customer: "marmara", trip: "DNC-PAST-GEB-ANK", status: "TESLIM", pallets: 1, kg: 500, order: 1, createdHoursBeforeDep: 70,
      events: [["TASIYICI_ONAYI_BEKLIYOR", 70], ["ONAYLI", 68], ["DEPO_KABUL", 4], ["YUKLENDI", 2], ["VARISTA", -6], ["TESLIM", -8]] },
    // Marmara Ambar karar desteği senaryosu: 10 sonuçlanmış talep, 2 doğrulanmış gelmeme.
    ...Array.from({ length: 7 }, (_, i): ResSeed => ({
      key: `past-marmara-teslim-${i + 2}`, customer: "marmara", trip: "DNC-PAST-GEB-ANK", status: "TESLIM", pallets: 1, kg: 450 + i * 10,
      order: 4 + i, createdHoursBeforeDep: 66 - i,
      events: [["TASIYICI_ONAYI_BEKLIYOR", 66 - i], ["ONAYLI", 64 - i], ["DEPO_KABUL", 4], ["YUKLENDI", 2], ["VARISTA", -6], ["TESLIM", -8]],
    })),
    ...Array.from({ length: 2 }, (_, i): ResSeed => ({
      key: `past-marmara-gelmedi-${i + 1}`, customer: "marmara", trip: "DNC-PAST-GEB-ANK", status: "GELMEDI", pallets: 1, kg: 500,
      order: 11 + i, createdHoursBeforeDep: 56 - i,
      events: [["TASIYICI_ONAYI_BEKLIYOR", 56 - i], ["ONAYLI", 54 - i], ["GELMEDI", 0]],
    })),
    { key: "hist-marmara-brs", customer: "marmara", trip: "DNC-GEB-BRS", status: "ONAYLI", pallets: 2, kg: 800, order: 2, createdHoursBeforeDep: 20,
      events: [["TASIYICI_ONAYI_BEKLIYOR", 20], ["ONAYLI", 19]] },
    { key: "hist-anadolu-kny", customer: "anadolu", trip: "DNC-KMP-KNY", status: "TASIYICI_ONAYI_BEKLIYOR", pallets: 1, kg: 500, order: null, createdHoursBeforeDep: 30,
      events: [["TASIYICI_ONAYI_BEKLIYOR", 30]] },
    // İstisna kuyruğu demosu: varışta eksik/hasar bildirilen sevkiyat (geçmiş sefer; kapasite satırı aşağıda yeniden kurulur).
    { key: "past-anadolu-eksik-hasar", customer: "anadolu", trip: "DNC-PAST-GEB-ANK", status: "EKSIK_HASAR", pallets: 1, kg: 480, order: 13, createdHoursBeforeDep: 50,
      events: [["TASIYICI_ONAYI_BEKLIYOR", 50], ["ONAYLI", 48], ["DEPO_KABUL", 4], ["YUKLENDI", 2], ["VARISTA", -6], ["EKSIK_HASAR", -7]] },
  ];
  const resRows: Row[] = [], ledgerRows: Row[] = [], eventRows: Row[] = [];
  for (const s of resSeeds) {
    const t = tripBy.get(s.trip)!;
    const id = demoId("reservations", s.key);
    const total = s.pallets * t.base_price_minor;
    const orderNo = s.order ? `CP-${year}-${String(s.order).padStart(6, "0")}` : null;
    const at = (h: number) => new Date(t.departure_at.getTime() - h * HOUR);
    const pending = s.status === "TASIYICI_ONAYI_BEKLIYOR";
    resRows.push({
      id, customer_id: tenantId(s.customer), carrier_id: t.carrier_id, trip_id: t.id, reference: `BV-SEED${resRows.length + 1}`,
      order_number: orderNo, status: s.status, pallets: s.pallets, gross_kg: s.kg, volume_m3: Math.round(s.pallets * 1.2 * 100) / 100, product_class_id: pcId,
      unit_price_minor: t.base_price_minor, total_price_minor: total,
      price_breakdown: { basePriceMinor: t.base_price_minor, utilization: 0, demandMultiplier: 1, hoursToCutoff: 0, timeMultiplier: 1, timeDecayApplied: false, clampedTo: null, explanation: ["Standart fiyat: talep ve zaman etkisi yok"] },
      payment_plan: "full", deposit_percent: 30, hold_expires_at: pending ? t.booking_cutoff_at : null,
      needs_review: false, pod_recipient_name: s.status === "TESLIM" ? "Mehmet Yılmaz" : null, ...seedPickup(id, orderNo !== null), pallet_codes: orderNo ? Array.from({ length: s.pallets }, (_, i) => `${orderNo}-P${i + 1}`) : [], is_demo: true, created_at: at(s.createdHoursBeforeDep), updated_at: now,
    });
    for (const [type, h] of s.events) eventRows.push({ reservation_id: id, type, note: null, is_demo: true, created_at: at(h) });
    ledgerRows.push({ reservation_id: id, type: "AUTHORIZED", amount_minor: total, reason: "Tam tutar provizyonu (simüle)", idempotency_key: `${id}:AUTHORIZED`, is_demo: true, created_at: at(s.createdHoursBeforeDep) });
    if (!pending) ledgerRows.push({ reservation_id: id, type: "CAPTURED", amount_minor: total, reason: "Onayda tam tahsilat", idempotency_key: `${id}:CAPTURED:approve`, is_demo: true, created_at: at(s.createdHoursBeforeDep - 1) });
    if (s.status === "GELMEDI") ledgerRows.push({ reservation_id: id, type: "RETAINED", amount_minor: total, reason: "Yük getirilmedi: iptal ücreti tutuldu", idempotency_key: `${id}:RETAINED`, is_demo: true, created_at: at(0) });
  }
    await upsert(pool, "reservations", resRows, ["id"], log);
  await upsert(pool, "reservation_events", eventRows.map((e) => ({ id: demoId("reservation_events", `${e.reservation_id}:${e.type}`), ...e })), ["id"], log);
  await upsert(pool, "ledger_entries", ledgerRows.map((e) => ({ id: demoId("ledger_entries", e.idempotency_key), ...e })), ["id"], log);
  // KPI hunisi: her seed rezervasyonu için uygun teklif + dönüşmeyen birkaç teklif (tutarlı, is_demo).
  const quoteRows: Row[] = resRows.map((r) => ({ id: demoId("quote_requests", `q:${r.id}`), carrier_id: r.carrier_id, customer_id: r.customer_id, trip_id: r.trip_id, pallets: r.pallets, gross_kg: r.gross_kg, eligible: true, unit_price_minor: r.unit_price_minor, created_at: new Date(r.created_at.getTime() - HOUR), is_demo: true }));
  const extraQ: [string, string, number, number, boolean][] = [
    ["marmara", "DNC-GEB-BRS", 2, 900, true], ["anadolu", "DNC-GEB-BRS", 1, 500, true], ["baskent", "DNC-KMP-KNY", 3, 1500, true], ["marmara", "DNC-PAST-GEB-ANK", 2, 1000, true],
    ["anadolu", "DNC-PAST-GEB-ANK", 4, 2000, true], ["baskent", "DNC-GEB-BRS", 20, 30000, false], ["marmara", "DNC-KMP-KNY", 25, 26000, false],
  ];
  extraQ.forEach(([cu, tr, p, kg, el], i) => {
    const t = tripBy.get(tr)!;
    quoteRows.push({ id: demoId("quote_requests", `x${i}`), carrier_id: t.carrier_id, customer_id: tenantId(cu), trip_id: t.id, pallets: p, gross_kg: kg, eligible: el, unit_price_minor: t.base_price_minor, created_at: new Date(t.departure_at.getTime() - (40 + i * 3) * HOUR), is_demo: true });
  });
  await upsert(pool, "quote_requests", quoteRows, ["id"], log);
  // Tüm canlı siparişler silindiği için sayaç en yüksek seed numarasına (13) döner.
  await withTx(pool, async (c) => {
    await c.query("insert into order_counters (year, last_value) values ($1, 13) on conflict (year) do update set last_value = 13", [year]);
  });

  // 4) Kapasite satırlarını rezervasyon toplamlarından yeniden kur (tüm seed seferleri).
  const ids = tripRows.map((t) => t.id);
  const sums = (await pool.query(
    "select trip_id, status, sum(pallets) p, sum(gross_kg) kg, sum(volume_m3) m3 from reservations where trip_id = any($1::uuid[]) group by trip_id, status", [ids])).rows;
  const capRows = ids.map((id) => {
    const mine = sums.filter((s) => s.trip_id === id);
    const agg = (states: string[], f: "p" | "kg" | "m3") => mine.filter((s) => states.includes(s.status)).reduce((a, s) => a + Number(s[f]), 0);
    return {
      trip_id: id, held_pallets: agg(["TASIYICI_ONAYI_BEKLIYOR"], "p"), held_kg: agg(["TASIYICI_ONAYI_BEKLIYOR"], "kg"), held_m3: Math.round(agg(["TASIYICI_ONAYI_BEKLIYOR"], "m3") * 100) / 100,
      confirmed_pallets: agg(CONFIRMED, "p"), confirmed_kg: agg(CONFIRMED, "kg"), confirmed_m3: Math.round(agg(CONFIRMED, "m3") * 100) / 100,
      loaded_pallets: agg(LOADED, "p"), loaded_kg: agg(LOADED, "kg"), is_demo: true, updated_at: now,
    };
  });
  await upsert(pool, "trip_capacity", capRows, ["trip_id"], log);
  log(`  demo seferi ${DEMO_TRIP_REF}: rezervasyonsuz, 25/33`);
}
