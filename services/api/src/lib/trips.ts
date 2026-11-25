import { notify } from "./notify";
import { randomBytes } from "node:crypto";
import type pg from "pg";
import { derivePickupCode, PICKUP_MAX_ATTEMPTS, withTx } from "@cargopact/db";
import { presignGet, uploadsBucket } from "./s3";
import { defaultPolicy, priceQuote, checkEligibility, withTierOverride, loadCarbon, tripCarbon, routeDistanceKm, type AlternativeScenario, type ContractTariff, type PriceQuote } from "@cargopact/domain";
import { contractView, loadAcceptances } from "./contract";

export type Q = pg.Pool | pg.PoolClient;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const STATUS_LABELS: Record<string, string> = {
  TASIYICI_ONAYI_BEKLIYOR: "Taşıyıcı onayı bekliyor", ONAYLI: "Onaylandı", DEPO_KABUL: "Çıkış deposunda kabul edildi",
  YUKLENDI: "Araca yüklendi", VARISTA: "Varışta teslime hazır", TESLIM: "Teslim edildi", SURESI_DOLDU: "Süresi doldu",
  RET: "Reddedildi", IPTAL: "İptal edildi", EKSIK_HASAR: "Eksik / hasar", GELMEDI: "Yük getirilmedi",
  YENIDEN_DEGERLENDIRME: "Araç/kapasite değişti, yeniden değerlendirme gerekli",
  INCELEME: "İncelemede – ölçüm farkı", RET_DEPO: "Depoda reddedildi",
};
export const CONFIRMED_STATES = ["ONAYLI", "DEPO_KABUL", "YUKLENDI", "VARISTA", "TESLIM", "EKSIK_HASAR"];
export const LOADED_STATES = ["YUKLENDI", "VARISTA", "TESLIM", "EKSIK_HASAR"];
export const FLOW = ["TASIYICI_ONAYI_BEKLIYOR", "ONAYLI", "DEPO_KABUL", "YUKLENDI", "VARISTA", "TESLIM", "EKSIK_HASAR", "GELMEDI", "RET", "IPTAL", "SURESI_DOLDU", "INCELEME", "RET_DEPO"];
export const COST_PER_PALLET_MINOR = 20000;
export const HOLD_MS = 2 * 3_600_000;

export const iso = (d: unknown): string => (d instanceof Date ? d.toISOString() : String(d));
const r2 = (n: number) => Math.round(n * 100) / 100;
export const round2 = r2;

export const TRIP_SELECT = `select t.id, t.carrier_id, t.reference, t.departure_at, t.arrival_eta, t.booking_cutoff_at, t.intake_cutoff_at, t.status,
  t.total_positions, t.internal_pallets, t.internal_kg, t.max_gross_kg, t.sellable_pallets, t.sellable_kg, t.sellable_m3, t.base_price_minor, t.pricing_tiers,
  t.floor_ratio, t.ceiling_ratio, t.is_demo, t.version trip_version, t.capacity_version, ca.name carrier_name, ca.status carrier_status,
  vt.code vt_code, vt.name vt_name, vt.pallet_positions vt_positions, v.id vehicle_id, v.plate,
  o.id o_id, o.code o_code, o.name o_name, o.city o_city, o.district o_district, o.address o_address, o.latitude o_lat, o.longitude o_lng, o.contact_phone o_phone, o.opening_hours o_hours, o.intake_window o_intake, o.pickup_window o_pickup,
  d.id d_id, d.code d_code, d.name d_name, d.city d_city, d.district d_district, d.address d_address, d.latitude d_lat, d.longitude d_lng, d.contact_phone d_phone, d.opening_hours d_hours, d.intake_window d_intake, d.pickup_window d_pickup,
  coalesce(cap.held_pallets,0) held_pallets, coalesce(cap.held_kg,0) held_kg, coalesce(cap.held_m3,0) held_m3,
  coalesce(cap.confirmed_pallets,0) confirmed_pallets, coalesce(cap.confirmed_kg,0) confirmed_kg, coalesce(cap.confirmed_m3,0) confirmed_m3,
  coalesce(cap.loaded_pallets,0) loaded_pallets, coalesce(cap.loaded_kg,0) loaded_kg
  from trips t join tenants ca on ca.id = t.carrier_id join facilities o on o.id = t.origin_facility_id join facilities d on d.id = t.destination_facility_id
  join vehicles v on v.id = t.vehicle_id join vehicle_types vt on vt.id = v.vehicle_type_id left join trip_capacity cap on cap.trip_id = t.id`;

export async function loadTrips(q: Q, where: string, params: unknown[]): Promise<Row[]> {
  return (await q.query(`${TRIP_SELECT} ${where}`, params)).rows;
}

const facility = (r: Row, p: "o" | "d") => ({
  id: r[`${p}_id`], code: r[`${p}_code`], name: r[`${p}_name`], city: r[`${p}_city`], district: r[`${p}_district`] ?? null, address: r[`${p}_address`],
  latitude: r[`${p}_lat`] == null ? null : Number(r[`${p}_lat`]), longitude: r[`${p}_lng`] == null ? null : Number(r[`${p}_lng`]),
  contactPhone: r[`${p}_phone`] ?? null, openingHours: r[`${p}_hours`] ?? null,
  intakeWindow: r[`${p}_intake`] ?? null, pickupWindow: r[`${p}_pickup`] ?? null,
});

export const capacityOf = (r: Row) => {
  const sell = { pallets: r.sellable_pallets, kg: r.sellable_kg, m3: Number(r.sellable_m3) };
  const held = { pallets: r.held_pallets, kg: r.held_kg, m3: Number(r.held_m3) };
  const conf = { pallets: r.confirmed_pallets, kg: r.confirmed_kg, m3: Number(r.confirmed_m3) };
  return {
    totalPositions: r.total_positions, internalPallets: r.internal_pallets, internalKg: r.internal_kg, maxGrossKg: r.max_gross_kg,
    sellable: sell, held, confirmed: conf, loaded: { pallets: r.loaded_pallets, kg: r.loaded_kg },
    remaining: { pallets: sell.pallets - held.pallets - conf.pallets, kg: sell.kg - held.kg - conf.kg, m3: r2(sell.m3 - held.m3 - conf.m3) },
    plannedPallets: r.internal_pallets + conf.pallets, heldPallets: held.pallets, actualPallets: r.internal_pallets + r.loaded_pallets,
    plannedGrossKg: r.internal_kg + held.kg + conf.kg,
  };
};

export const policyOf = (r: Row) => withTierOverride(defaultPolicy(Number(r.base_price_minor), Number(r.floor_ratio), Number(r.ceiling_ratio)), r.pricing_tiers);

/** Kayıtlı ticari koşul: geçerli sözleşme tarifesi (sefere özel olan genel olana göre önceliklidir). */
export async function contractFor(q: Q, r: Row, customerId: string, now: Date): Promise<ContractTariff | null> {
  const { rows } = await q.query(
    `select tf.base_price_minor, cu.name from carrier_customer_tariffs tf join tenants cu on cu.id = tf.customer_id
      where tf.carrier_id = $1 and tf.customer_id = $2 and (tf.trip_id is null or tf.trip_id = $3)
        and (tf.valid_from is null or tf.valid_from <= $4) and (tf.valid_to is null or tf.valid_to > $4)
      order by (tf.trip_id is null), tf.created_at desc limit 1`, [r.carrier_id, customerId, r.id, now]);
  return rows[0] ? { basePriceMinor: Number(rows[0].base_price_minor), customerName: rows[0].name } : null;
}

export function quoteFor(r: Row, pallets: number, now: Date, contract?: ContractTariff | null): PriceQuote {
  return priceQuote(policyOf(r), r.booking_cutoff_at, { heldPallets: r.held_pallets, confirmedPallets: r.confirmed_pallets, sellablePallets: r.sellable_pallets }, pallets, now, contract);
}
export const toPrice = (p: PriceQuote) => {
  const { roundedFromMinor: _drop, ...bd } = p.breakdown;
  return { unitPriceMinor: p.unitPriceMinor, totalPriceMinor: p.totalPriceMinor, currency: "TRY" as const, breakdown: bd };
};

export const distanceOf = (r: Row): number =>
  routeDistanceKm({ lat: r.o_lat == null ? null : Number(r.o_lat), lng: r.o_lng == null ? null : Number(r.o_lng) }, { lat: r.d_lat == null ? null : Number(r.d_lat), lng: r.d_lng == null ? null : Number(r.d_lng) });
export const carbonOf = (r: Row, pallets: number, scenario?: AlternativeScenario | null) =>
  loadCarbon({ distanceKm: distanceOf(r), vehiclePalletPositions: Number(r.vt_positions), pallets, scenario });

export function tripCard(r: Row, pallets: number, now: Date, locked?: { unitPriceMinor: number; totalPriceMinor: number; breakdown: Row }, contract?: ContractTariff | null) {
  const cap = capacityOf(r);
  const price = locked ? { unitPriceMinor: locked.unitPriceMinor, totalPriceMinor: locked.totalPriceMinor, currency: "TRY" as const, breakdown: locked.breakdown } : toPrice(quoteFor(r, pallets, now, contract));
  return {
    id: r.id, reference: r.reference, carrier: { id: r.carrier_id, name: r.carrier_name },
    origin: facility(r, "o"), destination: facility(r, "d"),
    vehicleType: { code: r.vt_code, name: r.vt_name, palletPositions: r.vt_positions },
    departureAt: iso(r.departure_at), arrivalEta: iso(r.arrival_eta), bookingCutoffAt: iso(r.booking_cutoff_at), intakeCutoffAt: iso(r.intake_cutoff_at),
    sellable: cap.sellable, remaining: cap.remaining, price, carbon: carbonOf(r, pallets),
  };
}

export async function pendingCounts(q: Q, tripIds: string[]): Promise<Map<string, number>> {
  if (tripIds.length === 0) return new Map();
  const { rows } = await q.query("select trip_id, count(*) n from reservations where trip_id = any($1::uuid[]) and status = 'TASIYICI_ONAYI_BEKLIYOR' group by trip_id", [tripIds]);
  return new Map(rows.map((x) => [x.trip_id, Number(x.n)]));
}

/** Onaylı+ dış rezervasyonlar (sefer karbonu için). */
export async function confirmedLoads(q: Q, tripIds: string[]): Promise<Map<string, { pallets: number; scenario: AlternativeScenario | null }[]>> {
  const m = new Map<string, { pallets: number; scenario: AlternativeScenario | null }[]>();
  if (tripIds.length === 0) return m;
  const { rows } = await q.query("select trip_id, pallets, alternative_scenario from reservations where trip_id = any($1::uuid[]) and status = any($2::text[])", [tripIds, CONFIRMED_STATES]);
  for (const x of rows) { const l = m.get(x.trip_id) ?? []; l.push({ pallets: Number(x.pallets), scenario: (x.alternative_scenario ?? null) as AlternativeScenario | null }); m.set(x.trip_id, l); }
  return m;
}
export const carrierTrip = (r: Row, now: Date, pending: number, loads: { pallets: number; scenario: AlternativeScenario | null }[] = []) => ({
  ...tripCard(r, 1, now), carbon: tripCarbon({ distanceKm: distanceOf(r), vehiclePalletPositions: Number(r.vt_positions), confirmed: loads }), status: r.status, vehicle: { id: r.vehicle_id, plate: r.plate }, capacity: capacityOf(r), pendingCount: pending,
  version: Number(r.trip_version), capacityVersion: Number(r.capacity_version ?? 1),
});

export const newReference = (): string => {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const b = randomBytes(6);
  return "BV-" + Array.from(b, (x) => alphabet[x % alphabet.length]).join("");
};

export async function addLedger(c: pg.PoolClient, resId: string, type: string, amount: number, reason: string, key: string, now: Date, demo: boolean) {
  await c.query(
    "insert into ledger_entries (reservation_id, type, amount_minor, reason, idempotency_key, is_demo, created_at) values ($1,$2,$3,$4,$5,$6,$7) on conflict (idempotency_key) do nothing",
    [resId, type, Math.max(0, Math.round(amount)), reason, key, demo, now],
  );
}
export async function addEvent(c: pg.PoolClient, resId: string, type: string, note: string | null, userId: string | null, now: Date, demo: boolean) {
  await c.query(
    "insert into reservation_events (reservation_id, type, note, actor_user_id, is_demo, created_at) values ($1,$2,$3,$4,$5,$6) on conflict (reservation_id, type) do nothing",
    [resId, type, note, userId, demo, now],
  );
}

export interface CapDelta { heldP?: number; heldKg?: number; heldM3?: number; confP?: number; confKg?: number; confM3?: number; loadP?: number; loadKg?: number }
/** Her kapasite değişikliği trip_capacity satırını günceller; eşzamanlı değişiklikler OCC ile serileşir. */
export async function adjustCap(c: pg.PoolClient, tripId: string, d: CapDelta): Promise<void> {
  const res = await c.query(
    `update trip_capacity set held_pallets = held_pallets + $2, held_kg = held_kg + $3, held_m3 = held_m3 + $4,
       confirmed_pallets = confirmed_pallets + $5, confirmed_kg = confirmed_kg + $6, confirmed_m3 = confirmed_m3 + $7,
       loaded_pallets = loaded_pallets + $8, loaded_kg = loaded_kg + $9, version = version + 1, updated_at = now() where trip_id = $1`,
    [tripId, d.heldP ?? 0, d.heldKg ?? 0, r2(d.heldM3 ?? 0), d.confP ?? 0, d.confKg ?? 0, r2(d.confM3 ?? 0), d.loadP ?? 0, d.loadKg ?? 0],
  );
  if (res.rowCount === 0) throw new Error("trip_capacity satırı yok: " + tripId);
}

export async function setStatus(c: pg.PoolClient, id: string, status: string, now: Date, reason?: string | null, extra: Row = {}) {
  const sets = ["status = $2", "version = version + 1", "updated_at = $3"];
  const params: unknown[] = [id, status, now];
  if (reason !== undefined) { params.push(reason); sets.push(`decision_reason = $${params.length}`); }
  for (const [k, v] of Object.entries(extra)) { params.push(v); sets.push(`${k} = $${params.length}`); }
  await c.query(`update reservations set ${sets.join(", ")} where id = $1`, params);
}

/** Süresi dolan blokajları bu işlemde bir kez iade eder (tembel süre aşımı). */
export async function expireHolds(c: pg.PoolClient, tripId: string, now: Date): Promise<number> {
  const { rows } = await c.query(
    "select id, pallets, gross_kg, volume_m3, is_demo from reservations where trip_id = $1 and status = 'TASIYICI_ONAYI_BEKLIYOR' and hold_expires_at < $2", [tripId, now]);
  if (rows.length === 0) return 0;
  const auth = await c.query("select reservation_id, amount_minor from ledger_entries where reservation_id = any($1::uuid[]) and type = 'AUTHORIZED'", [rows.map((x) => x.id)]);
  const amt = new Map(auth.rows.map((x) => [x.reservation_id, Number(x.amount_minor)]));
  let p = 0, kg = 0, m3 = 0;
  for (const r of rows) {
    await setStatus(c, r.id, "SURESI_DOLDU", now, "Blokaj süresi doldu");
    await addEvent(c, r.id, "SURESI_DOLDU", "Blokaj süresi doldu", null, now, r.is_demo);
    await notify(c, r.id, "customer", "HOLD_EXPIRED", "Blokaj süresi doldu · {ref}", "Taşıyıcı süre içinde onaylamadı; provizyon serbest bırakıldı.");
    await addLedger(c, r.id, "RELEASED", amt.get(r.id) ?? 0, "Blokaj süresi doldu; provizyon serbest", `${r.id}:RELEASED`, now, r.is_demo);
    p += r.pallets; kg += r.gross_kg; m3 += Number(r.volume_m3);
  }
  await adjustCap(c, tripId, { heldP: -p, heldKg: -kg, heldM3: -m3 });
  return rows.length;
}

/** Okuma uçları için: süresi dolmuş blokajı olan seferleri ayrı işlemlerde temizler. */
export async function expireDue(pool: pg.Pool, tripId?: string): Promise<void> {
  const now = new Date();
  const { rows } = await pool.query(
    "select distinct trip_id from reservations where status = 'TASIYICI_ONAYI_BEKLIYOR' and hold_expires_at < $1" + (tripId ? " and trip_id = $2" : ""), tripId ? [now, tripId] : [now]);
  for (const r of rows) await withTx(pool, (c) => expireHolds(c, r.trip_id, now));
}

// ---------------- Rezervasyon görünümü ----------------
const LEDGER_ORDER = ["AUTHORIZED", "CAPTURED", "RELEASED", "REFUNDED", "RETAINED", "FAILED"];

export function paymentView(res: Row, entries: Row[]) {
  const sum = (t: string) => entries.filter((e) => e.type === t).reduce((a, e) => a + Number(e.amount_minor), 0);
  const auth = sum("AUTHORIZED"), cap = sum("CAPTURED"), rel = sum("RELEASED"), ref = sum("REFUNDED"), ret = sum("RETAINED");
  const total = Number(res.total_price_minor);
  let status: string;
  if (ref > 0) status = "refunded";
  else if (cap > 0) status = cap >= total ? "captured" : "partially_captured";
  else if (rel > 0) status = "released";
  else if (auth > 0) status = "authorized";
  else status = entries.some((e) => e.type === "FAILED") ? "failed" : "authorized";
  const active = CONFIRMED_STATES.includes(res.status) && res.status !== "EKSIK_HASAR";
  const due = res.status === "TASIYICI_ONAYI_BEKLIYOR" ? Math.max(0, total - auth) : active ? Math.max(0, total - cap) : 0;
  return {
    status, paidMinor: cap - ref, refundedMinor: ref, retainedMinor: ret, dueMinor: due,
    entries: [...entries].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at) || LEDGER_ORDER.indexOf(a.type) - LEDGER_ORDER.indexOf(b.type))
      .map((e) => ({ type: e.type, amountMinor: Number(e.amount_minor), at: iso(e.created_at), reason: e.reason })),
  };
}

export const measurementView = (m?: Row) => m ? {
  declared: { pallets: m.declared_pallets, kg: m.declared_kg },
  measured: { pallets: m.measured_pallets, kg: m.measured_kg, heightMm: m.measured_height_mm ?? null },
  diff: { pallets: m.diff_pallets, kg: m.diff_kg }, outcome: m.outcome as string, note: m.note ?? null, at: iso(m.created_at),
} : null;

export interface ViewOpts { carrierView?: boolean }

/** Rezervasyon satırlarını sözleşme biçimine çevirir (toplu sorgularla). */
export async function reservationViews(q: Q, rows: Row[], now: Date, opts: ViewOpts = {}) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const tripIds = [...new Set(rows.map((r) => r.trip_id))];
  const acceptances = await loadAcceptances(q, ids);
  const [trips, evs, led, att, wm] = await Promise.all([
    loadTrips(q, "where t.id = any($1::uuid[])", [tripIds]),
    q.query("select reservation_id, type, note, created_at from reservation_events where reservation_id = any($1::uuid[])", [ids]),
    q.query("select reservation_id, type, amount_minor, reason, created_at from ledger_entries where reservation_id = any($1::uuid[])", [ids]),
    uploadsBucket()
      ? q.query("select reservation_id, kind, s3_key from reservation_attachments where reservation_id = any($1::uuid[]) and attached = true order by created_at", [ids])
      : Promise.resolve({ rows: [] as Row[] }),
    q.query("select * from warehouse_measurements where reservation_id = any($1::uuid[]) order by created_at", [ids]),
  ]);
  const measurements = new Map<string, Row>();
  for (const m of wm.rows) measurements.set(m.reservation_id, m); // sıralı: sonuncu kayıt kazanır
  const attUrls = new Map<string, { kind: string; url: string }[]>();
  for (const a of att.rows) {
    const list = attUrls.get(a.reservation_id) ?? [];
    list.push({ kind: a.kind, url: await presignGet(a.s3_key) });
    attUrls.set(a.reservation_id, list);
  }
  const tripMap = new Map(trips.map((t) => [t.id, t]));
  let noShows = new Map<string, number>();
  let history = new Map<string, { historicalReservationCount: number; verifiedNoShows: number }>();
  let accepted = new Map<string, boolean>();
  const rank = new Map<string, number>();
  if (opts.carrierView) {
    const carrierIds = [...new Set(rows.map((r) => r.carrier_id))];
    // Geçmiş yalnız sonuçlanmış taleplerdir; açık talepler ve mevcut bekleyen talep sayılmaz.
    const historyStates = ["TESLIM", "GELMEDI", "RET", "IPTAL", "EKSIK_HASAR", "SURESI_DOLDU"];
    const hs = await q.query(
      `select customer_id, carrier_id, count(*) historical_count,
              count(*) filter (where status = 'GELMEDI') no_show_count
         from reservations
        where carrier_id = any($1::uuid[]) and status = any($2::text[])
        group by customer_id, carrier_id`,
      [carrierIds, historyStates],
    );
    history = new Map(hs.rows.map((x) => [`${x.carrier_id}:${x.customer_id}`, {
      historicalReservationCount: Number(x.historical_count), verifiedNoShows: Number(x.no_show_count),
    }]));
    noShows = new Map([...history].map(([key, value]) => [key, value.verifiedNoShows]));
    const cp = await q.query("select carrier_id, product_class_id, accepted from carrier_product_classes where carrier_id = any($1::uuid[])", [carrierIds]);
    accepted = new Map(cp.rows.map((x) => [`${x.carrier_id}:${x.product_class_id}`, Boolean(x.accepted)]));
    const pend = rows.filter((r) => r.status === "TASIYICI_ONAYI_BEKLIYOR")
      .sort((a, b) => Number((noShows.get(`${a.carrier_id}:${a.customer_id}`) ?? 0) > 0) - Number((noShows.get(`${b.carrier_id}:${b.customer_id}`) ?? 0) > 0) || +new Date(a.created_at) - +new Date(b.created_at));
    // Sıra, aynı seferdeki bekleyenler arasında hesaplanır.
    const perTrip = new Map<string, number>();
    for (const r of pend) { const n = (perTrip.get(r.trip_id) ?? 0) + 1; perTrip.set(r.trip_id, n); rank.set(r.id, n); }
  }
  return rows.map((r) => {
    const t = tripMap.get(r.trip_id)!;
    const podFiles = attUrls.get(r.id) ?? [];
    const events = evs.rows.filter((e) => e.reservation_id === r.id && (opts.carrierView || e.type !== "YENIDEN_DEGERLENDIRME"))
      .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at) || FLOW.indexOf(a.type) - FLOW.indexOf(b.type))
      .map((e) => ({ type: e.type, label: STATUS_LABELS[e.type] ?? e.type, at: iso(e.created_at), note: e.note ?? null, attachments: e.type === "TESLIM" ? podFiles : [] }));
    const teslim = events.find((e) => e.type === "TESLIM");
    const pod = r.status === "TESLIM" && teslim ? { recipientName: r.pod_recipient_name ?? null, deliveredAt: teslim.at, attachments: podFiles } : null;
    const recips = (Array.isArray(r.pickup_recipients) ? r.pickup_recipients : r.recipient_name ? [{ name: r.recipient_name }] : []) as { name: string; phone?: string }[];
    const pickup = {
      recipients: recips, hint: r.pickup_code_hint ?? null, locked: Number(r.pickup_failed_attempts ?? 0) >= PICKUP_MAX_ATTEMPTS,
      // Düz kod yalnız müşteriye gösterilir; taşıyıcı görünümünde asla.
      ...(opts.carrierView ? {} : { code: r.pickup_code_hash && CONFIRMED_STATES.includes(r.status) && r.status !== "TESLIM" ? derivePickupCode(r.id) : null }),
    };
    const base = {
      id: r.id, reference: r.reference, orderNumber: r.order_number ?? null, status: r.status, statusLabel: STATUS_LABELS[r.status] ?? r.status,
      trip: tripCard(t, r.pallets, now, { unitPriceMinor: Number(r.unit_price_minor), totalPriceMinor: Number(r.total_price_minor), breakdown: r.price_breakdown }),
      customer: { id: r.customer_id, name: r.customer_name },
      pallets: r.pallets, grossKg: r.gross_kg, volumeM3: Number(r.volume_m3), productClass: { code: r.pc_code, name: r.pc_name },
      unitPriceMinor: Number(r.unit_price_minor), totalPriceMinor: Number(r.total_price_minor),
      paymentPlan: r.payment_plan, depositPercent: r.deposit_percent,
      payment: paymentView(r, led.rows.filter((e) => e.reservation_id === r.id)),
      holdExpiresAt: r.status === "TASIYICI_ONAYI_BEKLIYOR" && r.hold_expires_at ? iso(r.hold_expires_at) : null,
      measurement: measurementView(measurements.get(r.id)),
      contract: contractView(acceptances.get(r.id)), carbon: carbonOf(t, r.pallets, r.alternative_scenario),
      decisionReason: r.decision_reason ?? null, createdAt: iso(r.created_at), events, palletCodes: (r.pallet_codes ?? []) as string[], pod, pickup,
    };
    if (!opts.carrierView) return base;
    const pending = r.status === "TASIYICI_ONAYI_BEKLIYOR";
    let elig = { eligible: true, reasons: [] as { code: string; message: string }[] };
    if (pending) {
      const cap = capacityOf(t);
      elig = checkEligibility(
        { status: t.status, bookingCutoffAt: t.booking_cutoff_at, internalKg: t.internal_kg, maxGrossKg: t.max_gross_kg, sellablePallets: t.sellable_pallets, sellableKg: t.sellable_kg, sellableM3: Number(t.sellable_m3) },
        { heldPallets: cap.held.pallets - r.pallets, heldKg: cap.held.kg - r.gross_kg, heldM3: cap.held.m3 - Number(r.volume_m3), confirmedPallets: cap.confirmed.pallets, confirmedKg: cap.confirmed.kg, confirmedM3: cap.confirmed.m3 },
        { pallets: r.pallets, grossKg: r.gross_kg, volumeM3: Number(r.volume_m3), productClassAccepted: accepted.get(`${r.carrier_id}:${r.product_class_id}`) ?? true },
        { now },
      );
    }
    const needsReview = pending && Boolean(r.needs_review) && !elig.eligible;
    const historyKey = `${r.carrier_id}:${r.customer_id}`;
    const customerHistory = history.get(historyKey) ?? { historicalReservationCount: 0, verifiedNoShows: 0 };
    return { ...base, needsReview, priorityRank: rank.get(r.id) ?? 0, verifiedNoShows: customerHistory.verifiedNoShows, customerHistory, eligibility: elig };
  });
}

export const RESERVATION_SELECT = `select r.*, cu.name customer_name, pc.code pc_code, pc.name pc_name
  from reservations r join tenants cu on cu.id = r.customer_id join product_classes pc on pc.id = r.product_class_id`;
