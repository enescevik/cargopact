import { randomUUID } from "node:crypto";
import type pg from "pg";
import { z } from "zod";
import {
  cancelInput, decisionInput, quoteInput, reservationEventInput, reservationInput, tripCreateInput, tripStatusInput, tripUpdateInput, podUploadInput, type Role,
} from "@cargopact/contracts";
import { withTx } from "@cargopact/db";
import {
  CANCELLATION_POLICY_TABLE, cancellationRefund, checkEligibility, defaultVolume, isWithinCutoff,
} from "@cargopact/domain";
import { audit } from "../lib/audit";
import { requireRole, type AuthContext } from "../lib/auth";
import { HttpError, notFound, ok, validation } from "../lib/http";
import { idempotent } from "../lib/idempotency";
import { objectExists, POD_EXT, POD_PUT_TTL, presignPut, uploadsBucket } from "../lib/s3";
import {
  addEvent, addLedger, adjustCap, capacityOf, carrierTrip, COST_PER_PALLET_MINOR, CONFIRMED_STATES, round2, expireDue, expireHolds, HOLD_MS, iso,
  loadTrips, newReference, pendingCounts, quoteFor, RESERVATION_SELECT, reservationViews, setStatus, STATUS_LABELS, toPrice, tripCard, type Q,
} from "../lib/trips";
import type { Route } from "./master-data";

const CUSTOMER: readonly Role[] = ["customer_user"];
const PLANNERS: readonly Role[] = ["carrier_admin", "carrier_planner"];
const CARRIER_ALL: readonly Role[] = ["carrier_admin", "carrier_planner", "carrier_warehouse"];
const DECLINED_CARD = "4000000000000002";
const DEPOSIT_PERCENT = 30;
const QUOTE_TTL_MS = 15 * 60_000;

const uid = (v: string): string => { if (!z.string().uuid().safeParse(v).success) throw notFound(); return v; };
const conflict = (msg: string, reason: string, extra: Record<string, unknown> = {}) => new HttpError("CONFLICT", msg, { reason, ...extra });
const fetchRes = async (q: Q, where: string, params: unknown[]) => (await q.query(`${RESERVATION_SELECT} ${where}`, params)).rows;
const istanbulDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const istanbulYear = (d: Date) => Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric" }).format(d));
const istanbulTime = (d: Date) => new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);
const trLower = (s: string) => s.toLocaleLowerCase("tr-TR").trim();
const sumOf = (rows: Record<string, unknown>[], t: string) => rows.filter((e) => e.type === t).reduce((a, e) => a + Number(e.amount_minor), 0);
const dueNow = (total: number, plan: "full" | "deposit") => (plan === "full" ? total : Math.floor((total * DEPOSIT_PERCENT) / 100));

export function demoRoutes(pool: pg.Pool): Route[] {
  const oneView = async (q: Q, id: string, now: Date, carrierView: boolean) => (await reservationViews(q, await fetchRes(q, "where r.id = $1", [id]), now, { carrierView }))[0];
  const publishedTrip = async (q: Q, id: string) => (await loadTrips(q, "where t.id = $1 and t.status = 'published' and ca.status = 'active'", [uid(id)]))[0];

  /** İptal ve iade çekirdeği: müşteri iptali, taşıyıcı sefer iptali. */
  async function cancelCore(c: pg.PoolClient, r: Record<string, any>, now: Date, opts: { full: boolean; reason?: string; userId: string }) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const pending = r.status === "TASIYICI_ONAYI_BEKLIYOR";
    const led = (await c.query("select type, amount_minor from ledger_entries where reservation_id = $1", [r.id])).rows;
    const dep = (await c.query("select departure_at from trips where id = $1", [r.trip_id])).rows[0].departure_at as Date;
    if (pending) {
      await adjustCap(c, r.trip_id, { heldP: -r.pallets, heldKg: -r.gross_kg, heldM3: -Number(r.volume_m3) });
      await addLedger(c, r.id, "RELEASED", sumOf(led, "AUTHORIZED"), "İptal: provizyon serbest bırakıldı", `${r.id}:RELEASED`, now, r.is_demo);
    } else {
      await adjustCap(c, r.trip_id, { confP: -r.pallets, confKg: -r.gross_kg, confM3: -Number(r.volume_m3) });
      const captured = sumOf(led, "CAPTURED");
      const pct = opts.full ? 100 : cancellationRefund(dep, now, { approved: true }).refundPercent;
      const refund = Math.floor((captured * pct) / 100);
      if (refund > 0) await addLedger(c, r.id, "REFUNDED", refund, opts.full ? "Taşıyıcı kaynaklı iptal: tam iade" : `İptal: %${pct} iade`, `${r.id}:REFUNDED`, now, r.is_demo);
      if (captured - refund > 0) await addLedger(c, r.id, "RETAINED", captured - refund, "İptal ücreti (politika)", `${r.id}:RETAINED`, now, r.is_demo);
    }
    await setStatus(c, r.id, "IPTAL", now, opts.reason ?? null);
    await addEvent(c, r.id, "IPTAL", opts.reason ?? null, opts.userId, now, r.is_demo);
  }

  async function decide(c: pg.PoolClient, ctx: AuthContext, id: string, input: z.infer<typeof decisionInput>) {
    const now = new Date();
    let r = (await fetchRes(c, "where r.id = $1 and r.carrier_id = $2", [uid(id), ctx.tenantId]))[0];
    if (!r) throw notFound("Rezervasyon");
    if (r.status === "TASIYICI_ONAYI_BEKLIYOR" && (await expireHolds(c, r.trip_id, now)) > 0) r = (await fetchRes(c, "where r.id = $1", [id]))[0];
    const done = async () => ok(await oneView(c, id, now, true));
    if (input.decision === "approve") {
      if (CONFIRMED_STATES.includes(r.status)) return done();
      if (r.status !== "TASIYICI_ONAYI_BEKLIYOR") throw conflict(`Bu talep ${STATUS_LABELS[r.status] ?? r.status} durumunda; onaylanamaz.`, "INVALID_TRANSITION");
      const t = (await loadTrips(c, "where t.id = $1", [r.trip_id]))[0];
      const cap = capacityOf(t);
      const cls = (await c.query("select accepted from carrier_product_classes where carrier_id = $1 and product_class_id = $2", [r.carrier_id, r.product_class_id])).rows[0];
      const elig = checkEligibility(
        { status: "published", bookingCutoffAt: t.booking_cutoff_at, internalKg: t.internal_kg, maxGrossKg: t.max_gross_kg, sellablePallets: t.sellable_pallets, sellableKg: t.sellable_kg, sellableM3: Number(t.sellable_m3) },
        { heldPallets: cap.held.pallets - r.pallets, heldKg: cap.held.kg - r.gross_kg, heldM3: cap.held.m3 - Number(r.volume_m3), confirmedPallets: cap.confirmed.pallets, confirmedKg: cap.confirmed.kg, confirmedM3: cap.confirmed.m3 },
        { pallets: r.pallets, grossKg: r.gross_kg, volumeM3: Number(r.volume_m3), productClassAccepted: cls ? Boolean(cls.accepted) : true },
        { now },
      );
      if (!elig.eligible) throw conflict("Uygunluk artık sağlanmıyor; talep onaylanamaz.", "NOT_ELIGIBLE", { reasons: elig.reasons });
      await adjustCap(c, r.trip_id, { heldP: -r.pallets, heldKg: -r.gross_kg, heldM3: -Number(r.volume_m3), confP: r.pallets, confKg: r.gross_kg, confM3: Number(r.volume_m3) });
      const year = istanbulYear(now);
      const ctr = await c.query("insert into order_counters (year, last_value) values ($1, 1) on conflict (year) do update set last_value = order_counters.last_value + 1 returning last_value", [year]);
      const order = `CP-${year}-${String(ctr.rows[0].last_value).padStart(6, "0")}`;
      const codes = Array.from({ length: r.pallets }, (_, i) => `${order}-P${i + 1}`);
      await setStatus(c, id, "ONAYLI", now, null, { order_number: order, pallet_codes: JSON.stringify(codes), hold_expires_at: null });
      const led = (await c.query("select type, amount_minor from ledger_entries where reservation_id = $1", [id])).rows;
      await addLedger(c, id, "CAPTURED", sumOf(led, "AUTHORIZED"), r.payment_plan === "full" ? "Onayda tam tahsilat" : `Onayda %${r.deposit_percent} kapora tahsilatı`, `${id}:CAPTURED:approve`, now, r.is_demo);
      await addEvent(c, id, "ONAYLI", `Sipariş ${order}`, ctx.userId, now, r.is_demo);
      await audit(c, ctx, { action: "reservation.approve", entityType: "reservation", entityId: id, before: { status: r.status }, after: { status: "ONAYLI", orderNumber: order } });
      return done();
    }
    if (r.status === "RET") return done();
    if (r.status !== "TASIYICI_ONAYI_BEKLIYOR") throw conflict(`Bu talep ${STATUS_LABELS[r.status] ?? r.status} durumunda; reddedilemez.`, "INVALID_TRANSITION");
    if (!input.reason?.trim()) throw validation("Ret için gerekçe zorunludur.", { field: "reason" });
    await adjustCap(c, r.trip_id, { heldP: -r.pallets, heldKg: -r.gross_kg, heldM3: -Number(r.volume_m3) });
    const led = (await c.query("select type, amount_minor from ledger_entries where reservation_id = $1", [id])).rows;
    await addLedger(c, id, "RELEASED", sumOf(led, "AUTHORIZED"), "Ret: provizyon serbest bırakıldı", `${id}:RELEASED`, now, r.is_demo);
    await setStatus(c, id, "RET", now, input.reason.trim());
    await addEvent(c, id, "RET", input.reason.trim(), ctx.userId, now, r.is_demo);
    await audit(c, ctx, { action: "reservation.reject", entityType: "reservation", entityId: id, before: { status: r.status }, after: { status: "RET" }, reason: input.reason });
    return done();
  }

  const TRANSITIONS: Record<string, string[]> = {
    DEPO_KABUL: ["ONAYLI"], YUKLENDI: ["DEPO_KABUL"], VARISTA: ["YUKLENDI"], TESLIM: ["VARISTA"], EKSIK_HASAR: ["YUKLENDI", "VARISTA"], GELMEDI: ["ONAYLI"],
  };

  async function recordEvent(c: pg.PoolClient, ctx: AuthContext, id: string, input: z.infer<typeof reservationEventInput>) {
    const now = new Date();
    const r = (await fetchRes(c, "where r.id = $1 and r.carrier_id = $2", [uid(id), ctx.tenantId]))[0];
    if (!r) throw notFound("Rezervasyon");
    const done = async () => ok(await oneView(c, id, now, true));
    const dup = await c.query("select 1 from reservation_events where reservation_id = $1 and type = $2", [id, input.type]);
    if (dup.rows.length > 0 || r.status === input.type) return done();
    if (!TRANSITIONS[input.type].includes(r.status)) throw conflict(`${STATUS_LABELS[r.status] ?? r.status} durumundan "${STATUS_LABELS[input.type]}" olayına geçilemez.`, "INVALID_TRANSITION");
    const t = (await c.query("select departure_at, intake_cutoff_at from trips where id = $1", [r.trip_id])).rows[0];
    const led = (await c.query("select type, amount_minor from ledger_entries where reservation_id = $1", [id])).rows;
    const captured = sumOf(led, "CAPTURED");
    const extra: Record<string, unknown> = {};
    switch (input.type) {
      case "TESLIM": {
        const name = input.recipientName?.trim();
        if (!name) throw validation("Teslim alan kişinin adı zorunludur.", { field: "recipientName" });
        const keys = [...new Set(input.podKeys ?? [])];
        const prefix = `pod/${r.carrier_id}/${id}/`;
        if (keys.some((k) => !k.startsWith(prefix) || k.includes(".."))) throw validation("e-POD dosya anahtarı bu rezervasyona ait değil.", { field: "podKeys" });
        if (keys.length > 0) {
          const known = (await c.query("select s3_key from reservation_attachments where reservation_id = $1 and s3_key = any($2::text[])", [id, keys])).rows;
          if (known.length !== keys.length) throw validation("e-POD dosyası için yükleme URL'si alınmamış.", { field: "podKeys" });
          for (const k of keys) if (!(await objectExists(k))) throw validation("e-POD dosyası henüz yüklenmemiş.", { field: "podKeys", key: k });
          await c.query("update reservation_attachments set attached = true where reservation_id = $1 and s3_key = any($2::text[])", [id, keys]);
        }
        extra.pod_recipient_name = name;
        break;
      }
      case "DEPO_KABUL": {
        if (!isWithinCutoff(now, t.intake_cutoff_at)) throw conflict("Çıkış deposu kabul süresi (kalkıştan 1 saat önce) geçti.", "INVALID_TRANSITION");
        const rest = Number(r.total_price_minor) - captured;
        if (rest > 0) await addLedger(c, id, "CAPTURED", rest, "Depo kabulünde kalan tutar tahsilatı", `${id}:CAPTURED:intake`, now, r.is_demo);
        break;
      }
      case "YUKLENDI":
        await adjustCap(c, r.trip_id, { loadP: r.pallets, loadKg: r.gross_kg });
        break;
      case "GELMEDI": {
        if (isWithinCutoff(now, t.intake_cutoff_at)) throw conflict("Gelmeme yalnız kabul süresi (T−1) geçtikten sonra kaydedilebilir.", "INVALID_TRANSITION");
        await adjustCap(c, r.trip_id, { confP: -r.pallets, confKg: -r.gross_kg, confM3: -Number(r.volume_m3) });
        const pct = cancellationRefund(t.departure_at, now, { approved: true, noShow: true }).refundPercent;
        const refund = Math.floor((captured * pct) / 100);
        if (refund > 0) await addLedger(c, id, "REFUNDED", refund, "Gelmeme: kısmi iade", `${id}:REFUNDED`, now, r.is_demo);
        if (captured - refund > 0) await addLedger(c, id, "RETAINED", captured - refund, "Yük getirilmedi: iptal ücreti tutuldu", `${id}:RETAINED`, now, r.is_demo);
        break;
      }
      default:
        break;
    }
    await setStatus(c, id, input.type, now, undefined, extra);
    await addEvent(c, id, input.type, input.note ?? null, ctx.userId, now, r.is_demo);
    await audit(c, ctx, { action: `reservation.event.${input.type}`, entityType: "reservation", entityId: id, before: { status: r.status }, after: { status: input.type }, reason: input.note });
    return done();
  }

  const cancelPreview = (r: Record<string, any>, led: Record<string, unknown>[], dep: Date, now: Date) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (r.status === "TASIYICI_ONAYI_BEKLIYOR") {
      const rule = cancellationRefund(dep, now, { approved: false }).rule;
      return { refundMinor: sumOf(led, "AUTHORIZED"), feeMinor: 0, rule };
    }
    if (r.status !== "ONAYLI") throw conflict(`${STATUS_LABELS[r.status] ?? r.status} durumundaki rezervasyon iptal edilemez.`, "INVALID_TRANSITION");
    const c = cancellationRefund(dep, now, { approved: true });
    const captured = sumOf(led, "CAPTURED");
    const refund = Math.floor((captured * c.refundPercent) / 100);
    return { refundMinor: refund, feeMinor: captured - refund, rule: c.rule };
  };

  const nextStep = (view: Awaited<ReturnType<typeof oneView>>): string => {
    const t = view.trip;
    switch (view.status) {
      case "TASIYICI_ONAYI_BEKLIYOR": return "Taşıyıcı onayı bekleniyor.";
      case "ONAYLI": return `Yükünüzü ${t.origin.name} merkezine en geç ${istanbulTime(new Date(t.intakeCutoffAt))} (İstanbul) tarihine kadar getirin.`;
      case "DEPO_KABUL": return "Paletleriniz araca yüklenecek.";
      case "YUKLENDI": return `Araç yolda; ${t.destination.name} merkezine varışı bekleniyor.`;
      case "VARISTA": return `Yükünüzü ${t.destination.name} merkezinden teslim alın.`;
      case "TESLIM": return "Teslimat tamamlandı.";
      default: return STATUS_LABELS[view.status] ?? view.status;
    }
  };

  return [
    // ---------------- Müşteri ----------------
    {
      method: "GET", pattern: "/customer/trips",
      handler: async (ctx, req) => {
        requireRole(ctx, CUSTOMER);
        const q = z.object({ originCity: z.string().max(80).optional(), destinationCity: z.string().max(80).optional(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), pallets: z.coerce.number().int().min(1).max(60).optional() }).parse(req.query);
        await expireDue(pool);
        const now = new Date();
        const rows = await loadTrips(pool, "where t.status = 'published' and ca.status = 'active' and t.booking_cutoff_at >= $1 order by t.departure_at", [now]);
        const items = rows
          .filter((r) => !q.originCity || trLower(r.o_city) === trLower(q.originCity))
          .filter((r) => !q.destinationCity || trLower(r.d_city) === trLower(q.destinationCity))
          .filter((r) => !q.date || istanbulDate(r.departure_at) === q.date)
          .filter((r) => !q.pallets || capacityOf(r).remaining.pallets >= q.pallets)
          .map((r) => tripCard(r, q.pallets ?? 1, now));
        return ok({ items });
      },
    },
    {
      method: "GET", pattern: "/customer/trips/{id}",
      handler: async (ctx, req) => {
        requireRole(ctx, CUSTOMER);
        const pallets = z.coerce.number().int().min(1).max(60).default(1).parse(req.query.pallets);
        await expireDue(pool, uid(req.params.id));
        const t = await publishedTrip(pool, req.params.id);
        if (!t) throw notFound("Sefer");
        return ok(tripCard(t, pallets, new Date()));
      },
    },
    {
      method: "POST", pattern: "/customer/trips/{id}/quote",
      handler: async (ctx, req) => {
        requireRole(ctx, CUSTOMER);
        const input = quoteInput.parse(req.body);
        await expireDue(pool, uid(req.params.id));
        const t = await publishedTrip(pool, req.params.id);
        if (!t) throw notFound("Sefer");
        const now = new Date();
        const pc = (await pool.query(
          `select pc.id, coalesce((select accepted from carrier_product_classes cpc where cpc.carrier_id = $2 and cpc.product_class_id = pc.id), true) accepted
             from product_classes pc where pc.code = $1 and pc.status = 'active' and pc.tenant_id = any($3::uuid[])`,
          [input.productClassCode, t.carrier_id, [t.carrier_id, "00000000-0000-4000-8000-000000000001"]])).rows[0];
        if (!pc) throw validation("Ürün sınıfı bulunamadı.", { field: "productClassCode" });
        const cap = capacityOf(t);
        const elig = checkEligibility(
          { status: t.status, bookingCutoffAt: t.booking_cutoff_at, internalKg: t.internal_kg, maxGrossKg: t.max_gross_kg, sellablePallets: t.sellable_pallets, sellableKg: t.sellable_kg, sellableM3: Number(t.sellable_m3) },
          { heldPallets: cap.held.pallets, heldKg: cap.held.kg, heldM3: cap.held.m3, confirmedPallets: cap.confirmed.pallets, confirmedKg: cap.confirmed.kg, confirmedM3: cap.confirmed.m3 },
          { pallets: input.pallets, grossKg: input.grossKg, volumeM3: input.volumeM3 ?? defaultVolume(input.pallets), productClassAccepted: Boolean(pc.accepted) },
          { now },
        );
        const price = toPrice(quoteFor(t, input.pallets, now));
        const total = price.totalPriceMinor;
        const dep = dueNow(total, "deposit");
        return ok({
          eligible: elig.eligible, reasons: elig.reasons, price, bookingCutoffAt: iso(t.booking_cutoff_at), intakeCutoffAt: iso(t.intake_cutoff_at),
          quoteExpiresAt: new Date(Math.min(now.getTime() + QUOTE_TTL_MS, t.booking_cutoff_at.getTime())).toISOString(),
          paymentPlans: [
            { code: "full", label: "Tamamı şimdi öde", dueNowMinor: total },
            { code: "deposit", label: `%${DEPOSIT_PERCENT} kapora, kalan depo kabulünde`, depositPercent: DEPOSIT_PERCENT, dueNowMinor: dep, remainingMinor: total - dep },
          ],
          cancellationPolicy: CANCELLATION_POLICY_TABLE,
        });
      },
    },
    {
      method: "POST", pattern: "/customer/reservations",
      handler: async (ctx, req) => {
        requireRole(ctx, CUSTOMER);
        const input = reservationInput.parse(req.body);
        const cardNo = input.card.number.replace(/\s/g, "");
        if (cardNo.length < 13) throw validation("Kart numarası geçersiz.");
        const [mm, yy] = input.card.expiry.split("/").map((x) => Number(x.trim()));
        const year = yy < 100 ? 2000 + yy : yy;
        if (year * 12 + mm < new Date().getFullYear() * 12 + new Date().getMonth() + 1) throw validation("Kartın son kullanma tarihi geçmiş.");
        return idempotent(pool, ctx, "reservation.create", req.headers["idempotency-key"], { ...input, card: { ...input.card, number: cardNo.slice(-4) } }, async (c) => {
          if (cardNo === DECLINED_CARD) throw validation("Kartınız reddedildi.", { reason: "PAYMENT_DECLINED" });
          const now = new Date();
          const tripId = uid(input.tripId);
          await expireHolds(c, tripId, now);
          const t = (await loadTrips(c, "where t.id = $1 and t.status = 'published' and ca.status = 'active'", [tripId]))[0];
          if (!t) throw notFound("Sefer");
          const pc = (await c.query(
            `select pc.id, pc.code, pc.name, coalesce((select accepted from carrier_product_classes cpc where cpc.carrier_id = $2 and cpc.product_class_id = pc.id), true) accepted
               from product_classes pc where pc.code = $1 and pc.status = 'active' and pc.tenant_id = any($3::uuid[])`,
            [input.productClassCode, t.carrier_id, [t.carrier_id, "00000000-0000-4000-8000-000000000001"]])).rows[0];
          if (!pc) throw validation("Ürün sınıfı bulunamadı.", { field: "productClassCode" });
          const volume = input.volumeM3 ?? defaultVolume(input.pallets);
          const cap = capacityOf(t);
          const elig = checkEligibility(
            { status: t.status, bookingCutoffAt: t.booking_cutoff_at, internalKg: t.internal_kg, maxGrossKg: t.max_gross_kg, sellablePallets: t.sellable_pallets, sellableKg: t.sellable_kg, sellableM3: Number(t.sellable_m3) },
            { heldPallets: cap.held.pallets, heldKg: cap.held.kg, heldM3: cap.held.m3, confirmedPallets: cap.confirmed.pallets, confirmedKg: cap.confirmed.kg, confirmedM3: cap.confirmed.m3 },
            { pallets: input.pallets, grossKg: input.grossKg, volumeM3: volume, productClassAccepted: Boolean(pc.accepted) },
            { now },
          );
          if (!elig.eligible) {
            const codes = elig.reasons.map((x) => x.code);
            if (codes.includes("INSUFFICIENT_PALLETS")) throw conflict("Seferde yeterli boş palet yok.", "CAPACITY_EXCEEDED", { reasons: elig.reasons });
            throw validation("Talep bu sefer için uygun değil.", { reason: codes.includes("BOOKING_CUTOFF_PASSED") ? "BOOKING_CUTOFF_PASSED" : "NOT_ELIGIBLE", reasons: elig.reasons });
          }
          const price = toPrice(quoteFor(t, input.pallets, now));
          // Kapasite blokajı: taşma korumalı tek UPDATE; eşzamanlı yazım OCC ile serileşir.
          const upd = await c.query(
            `update trip_capacity set held_pallets = held_pallets + $2, held_kg = held_kg + $3, held_m3 = held_m3 + $4, version = version + 1, updated_at = now()
              where trip_id = $1 and held_pallets + confirmed_pallets + $2 <= $5 and held_kg + confirmed_kg + $3 <= $6
                and held_m3 + confirmed_m3 + $4 <= $7 and $8 + held_kg + confirmed_kg + $3 <= $9`,
            [tripId, input.pallets, input.grossKg, volume, t.sellable_pallets, t.sellable_kg, Number(t.sellable_m3) + 1e-9, t.internal_kg, t.max_gross_kg]);
          if (upd.rowCount === 0) throw conflict("Kapasite başka bir talep tarafından dolduruldu.", "CAPACITY_EXCEEDED");
          const id = randomUUID();
          const reference = newReference();
          const holdAt = new Date(Math.min(now.getTime() + HOLD_MS, t.booking_cutoff_at.getTime()));
          await c.query(
            `insert into reservations (id, customer_id, carrier_id, trip_id, reference, status, pallets, gross_kg, volume_m3, product_class_id, unit_price_minor, total_price_minor,
               price_breakdown, payment_plan, deposit_percent, hold_expires_at, recipient_name, is_demo, created_at, updated_at)
             values ($1,$2,$3,$4,$5,'TASIYICI_ONAYI_BEKLIYOR',$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16,$17,$18,$18)`,
            [id, ctx.tenantId, t.carrier_id, tripId, reference, input.pallets, input.grossKg, volume, pc.id, price.unitPriceMinor, price.totalPriceMinor,
              JSON.stringify(price.breakdown), input.paymentPlan, DEPOSIT_PERCENT, holdAt, input.recipientName ?? null, Boolean(t.is_demo), now]);
          const authAmt = dueNow(price.totalPriceMinor, input.paymentPlan);
          await addLedger(c, id, "AUTHORIZED", authAmt, input.paymentPlan === "full" ? "Tam tutar provizyonu (simüle)" : `%${DEPOSIT_PERCENT} kapora provizyonu (simüle)`, `${id}:AUTHORIZED`, now, Boolean(t.is_demo));
          await addEvent(c, id, "TASIYICI_ONAYI_BEKLIYOR", "Talep oluşturuldu", ctx.userId, now, Boolean(t.is_demo));
          await audit(c, ctx, { action: "reservation.create", entityType: "reservation", entityId: id, after: { tripId, pallets: input.pallets, grossKg: input.grossKg, totalPriceMinor: price.totalPriceMinor } });
          return ok(await oneView(c, id, now, false), 201);
        });
      },
    },
    {
      method: "GET", pattern: "/customer/reservations",
      handler: async (ctx) => {
        requireRole(ctx, CUSTOMER);
        await expireDue(pool);
        const rows = await fetchRes(pool, "where r.customer_id = $1 order by r.created_at desc limit 200", [ctx.tenantId]);
        return ok({ items: await reservationViews(pool, rows, new Date()) });
      },
    },
    {
      method: "GET", pattern: "/customer/reservations/{id}",
      handler: async (ctx, req) => {
        requireRole(ctx, CUSTOMER);
        await expireDue(pool);
        const rows = await fetchRes(pool, "where r.id = $1 and r.customer_id = $2", [uid(req.params.id), ctx.tenantId]);
        if (!rows[0]) throw notFound("Rezervasyon");
        return ok((await reservationViews(pool, rows, new Date()))[0]);
      },
    },
    {
      method: "GET", pattern: "/customer/reservations/{id}/cancel-preview",
      handler: async (ctx, req) => {
        requireRole(ctx, CUSTOMER);
        await expireDue(pool);
        const r = (await fetchRes(pool, "where r.id = $1 and r.customer_id = $2", [uid(req.params.id), ctx.tenantId]))[0];
        if (!r) throw notFound("Rezervasyon");
        const led = (await pool.query("select type, amount_minor from ledger_entries where reservation_id = $1", [r.id])).rows;
        const dep = (await pool.query("select departure_at from trips where id = $1", [r.trip_id])).rows[0].departure_at as Date;
        return ok(cancelPreview(r, led, dep, new Date()));
      },
    },
    {
      method: "POST", pattern: "/customer/reservations/{id}/cancel",
      handler: async (ctx, req) => {
        requireRole(ctx, CUSTOMER);
        const input = cancelInput.parse(req.body ?? {});
        const id = uid(req.params.id);
        return idempotent(pool, ctx, "reservation.cancel", req.headers["idempotency-key"], { id, ...input }, async (c) => {
          const now = new Date();
          let r = (await fetchRes(c, "where r.id = $1 and r.customer_id = $2", [id, ctx.tenantId]))[0];
          if (!r) throw notFound("Rezervasyon");
          if (r.status === "TASIYICI_ONAYI_BEKLIYOR" && (await expireHolds(c, r.trip_id, now)) > 0) r = (await fetchRes(c, "where r.id = $1", [id]))[0];
          if (r.status === "IPTAL") return ok(await oneView(c, id, now, false));
          if (r.status !== "TASIYICI_ONAYI_BEKLIYOR" && r.status !== "ONAYLI") throw conflict(`${STATUS_LABELS[r.status] ?? r.status} durumundaki rezervasyon iptal edilemez.`, "INVALID_TRANSITION");
          await cancelCore(c, r, now, { full: false, reason: input.reason, userId: ctx.userId });
          await audit(c, ctx, { action: "reservation.cancel", entityType: "reservation", entityId: id, before: { status: r.status }, after: { status: "IPTAL" }, reason: input.reason });
          return ok(await oneView(c, id, now, false));
        });
      },
    },
    {
      method: "GET", pattern: "/customer/orders/{orderNumber}/tracking",
      handler: async (ctx, req) => {
        requireRole(ctx, CUSTOMER);
        const r = (await fetchRes(pool, "where r.order_number = $1 and r.customer_id = $2", [req.params.orderNumber, ctx.tenantId]))[0];
        if (!r) throw notFound("Sipariş");
        const v = (await reservationViews(pool, [r], new Date()))[0];
        const flow = ["TASIYICI_ONAYI_BEKLIYOR", "ONAYLI", "DEPO_KABUL", "YUKLENDI", "VARISTA", "TESLIM"];
        const at = (s: string) => v.events.find((e) => e.type === s)?.at ?? null;
        const steps = flow.map((s) => ({ status: s, label: STATUS_LABELS[s], done: at(s) !== null, at: at(s) }));
        const last = v.events.length ? v.events[v.events.length - 1].at : v.createdAt;
        return ok({
          orderNumber: v.orderNumber, status: v.status, statusLabel: v.statusLabel, updatedAt: last, nextStep: nextStep(v), steps,
          origin: v.trip.origin, destination: v.trip.destination, intakeCutoffAt: v.trip.intakeCutoffAt,
          pickupWindow: v.trip.destination.pickupWindow, palletCodes: v.palletCodes,
        });
      },
    },

    // ---------------- Taşıyıcı ----------------
    {
      method: "GET", pattern: "/carrier/trips",
      handler: async (ctx, req) => {
        requireRole(ctx, CARRIER_ALL);
        const status = z.enum(["draft", "published", "closed", "departed", "completed", "cancelled"]).optional().parse(req.query.status);
        await expireDue(pool);
        const now = new Date();
        const rows = await loadTrips(pool, "where t.carrier_id = $1 and ($2::text is null or t.status = $2) order by t.departure_at", [ctx.tenantId, status ?? null]);
        const pc = await pendingCounts(pool, rows.map((r) => r.id));
        return ok({ items: rows.map((r) => carrierTrip(r, now, pc.get(r.id) ?? 0)) });
      },
    },
    {
      method: "POST", pattern: "/carrier/trips",
      handler: async (ctx, req) => {
        requireRole(ctx, PLANNERS);
        const i = tripCreateInput.parse(req.body);
        const dep = new Date(i.departureAt), arr = new Date(i.arrivalEta), now = new Date();
        if (dep.getTime() <= now.getTime()) throw validation("Kalkış zamanı gelecekte olmalı.");
        if (arr.getTime() <= dep.getTime()) throw validation("Varış zamanı kalkıştan sonra olmalı.");
        if (i.originFacilityId === i.destinationFacilityId) throw validation("Çıkış ve varış tesisi farklı olmalı.");
        return idempotent(pool, ctx, "trip.create", req.headers["idempotency-key"], i, async (c) => {
          const f = await c.query("select id from facilities where id = any($1::uuid[]) and carrier_id = $2 and status = 'active'", [[i.originFacilityId, i.destinationFacilityId], ctx.tenantId]);
          if (f.rows.length !== 2) throw validation("Tesisler bulunamadı veya aktif değil.");
          // Araç satırını kilitle: aynı araca eşzamanlı sefer eklemeleri serileşir.
          const v = await c.query("select id, status, vehicle_type_id from vehicles where id = $1 and carrier_id = $2 for update", [i.vehicleId, ctx.tenantId]);
          if (!v.rows[0]) throw validation("Araç bulunamadı.");
          if (v.rows[0].status !== "active") throw validation("Araç aktif değil.");
          const vt = (await c.query("select pallet_positions from vehicle_types where id = $1", [v.rows[0].vehicle_type_id])).rows[0];
          if (i.internalPallets + i.sellablePallets > vt.pallet_positions) throw validation(`İç palet + satışa açık palet araç kapasitesini (${vt.pallet_positions}) aşıyor.`);
          if (i.internalKg + i.sellableKg > i.maxGrossKg) throw validation("İç yük + satışa açık ağırlık azami brüt yükü aşıyor.");
          const ov = await c.query("select reference from trips where vehicle_id = $1 and status in ('draft','published','closed','departed') and departure_at < $3 and arrival_eta > $2 limit 1", [i.vehicleId, dep, arr]);
          if (ov.rows[0]) throw conflict(`Araç bu aralıkta başka bir seferde (${ov.rows[0].reference}).`, "VEHICLE_OVERLAP");
          const id = randomUUID();
          const reference = "TR-" + id.slice(0, 8).toUpperCase();
          await c.query(
            `insert into trips (id, carrier_id, reference, origin_facility_id, destination_facility_id, vehicle_id, departure_at, arrival_eta, booking_cutoff_at, intake_cutoff_at, status,
               total_positions, internal_pallets, internal_kg, max_gross_kg, sellable_pallets, sellable_kg, sellable_m3, base_price_minor, is_demo)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,false)`,
            [id, ctx.tenantId, reference, i.originFacilityId, i.destinationFacilityId, i.vehicleId, dep, arr, new Date(dep.getTime() - 3 * 3_600_000), new Date(dep.getTime() - 3_600_000),
              i.publish ? "published" : "draft", vt.pallet_positions, i.internalPallets, i.internalKg, i.maxGrossKg, i.sellablePallets, i.sellableKg, i.sellableM3, i.basePriceMinor]);
          await c.query("insert into trip_capacity (trip_id) values ($1)", [id]);
          await audit(c, ctx, { action: "trip.create", entityType: "trip", entityId: id, after: { reference, status: i.publish ? "published" : "draft" } });
          const t = (await loadTrips(c, "where t.id = $1", [id]))[0];
          return ok(carrierTrip(t, now, 0), 201);
        });
      },
    },
    {
      method: "GET", pattern: "/carrier/trips/{id}",
      handler: async (ctx, req) => {
        requireRole(ctx, CARRIER_ALL);
        const id = uid(req.params.id);
        await expireDue(pool, id);
        const now = new Date();
        const t = (await loadTrips(pool, "where t.id = $1 and t.carrier_id = $2", [id, ctx.tenantId]))[0];
        if (!t) throw notFound("Sefer");
        const rows = await fetchRes(pool, "where r.trip_id = $1", [id]);
        const views = (await reservationViews(pool, rows, now, { carrierView: true })) as Array<{ status: string; priorityRank: number; createdAt: string }>;
        views.sort((a, b) => {
          const ap = a.status === "TASIYICI_ONAYI_BEKLIYOR", bp = b.status === "TASIYICI_ONAYI_BEKLIYOR";
          if (ap !== bp) return ap ? -1 : 1;
          return ap ? a.priorityRank - b.priorityRank : +new Date(b.createdAt) - +new Date(a.createdAt);
        });
        const pc = await pendingCounts(pool, [id]);
        return ok({ ...carrierTrip(t, now, pc.get(id) ?? 0), reservations: views });
      },
    },
    {
      method: "POST", pattern: "/carrier/trips/{id}/status",
      handler: async (ctx, req) => {
        requireRole(ctx, PLANNERS);
        const { action } = tripStatusInput.parse(req.body);
        const id = uid(req.params.id);
        return idempotent(pool, ctx, "trip.status", req.headers["idempotency-key"], { id, action }, async (c) => {
          const now = new Date();
          let t = (await loadTrips(c, "where t.id = $1 and t.carrier_id = $2", [id, ctx.tenantId]))[0];
          if (!t) throw notFound("Sefer");
          const from = t.status as string;
          let to: string;
          if (action === "publish") {
            if (from === "published") to = from;
            else if (!["draft", "closed"].includes(from)) throw conflict(`${from} durumundaki sefer yayınlanamaz.`, "INVALID_TRANSITION");
            else if (now.getTime() > t.booking_cutoff_at.getTime()) throw conflict("Yer ayırma süresi geçtiği için yayınlanamaz.", "BOOKING_CUTOFF_PASSED");
            else to = "published";
          } else if (action === "close") {
            if (from === "closed") to = from;
            else if (from !== "published") throw conflict(`${from} durumundaki sefer kapatılamaz.`, "INVALID_TRANSITION");
            else to = "closed";
          } else {
            if (from === "cancelled") to = from;
            else if (!["draft", "published", "closed"].includes(from)) throw conflict(`${from} durumundaki sefer iptal edilemez.`, "INVALID_TRANSITION");
            else {
              const active = await fetchRes(c, "where r.trip_id = $1 and r.status in ('TASIYICI_ONAYI_BEKLIYOR','ONAYLI','DEPO_KABUL','YUKLENDI','VARISTA')", [id]);
              if (active.some((r) => ["YUKLENDI", "VARISTA"].includes(r.status))) throw conflict("Yüklenmiş palet olan sefer iptal edilemez.", "INVALID_TRANSITION");
              for (const r of active) await cancelCore(c, r, now, { full: true, reason: "Taşıyıcı seferi iptal etti", userId: ctx.userId });
              await adjustCap(c, id, {});
              to = "cancelled";
            }
          }
          if (to !== from) {
            await c.query("update trips set status = $2, version = version + 1, updated_at = $3 where id = $1", [id, to, now]);
            await audit(c, ctx, { action: `trip.${action}`, entityType: "trip", entityId: id, before: { status: from }, after: { status: to } });
          }
          t = (await loadTrips(c, "where t.id = $1", [id]))[0];
          const pc = await pendingCounts(c, [id]);
          return ok(carrierTrip(t, now, pc.get(id) ?? 0));
        });
      },
    },
    {
      method: "POST", pattern: "/carrier/reservations/{id}/decision",
      handler: async (ctx, req) => {
        requireRole(ctx, PLANNERS);
        const input = decisionInput.parse(req.body);
        const id = uid(req.params.id);
        if (input.decision === "reject" && !input.reason?.trim()) throw validation("Ret için gerekçe zorunludur.", { field: "reason" });
        return idempotent(pool, ctx, "reservation.decision", req.headers["idempotency-key"], { id, ...input }, (c) => decide(c, ctx, id, input));
      },
    },
    {
      method: "POST", pattern: "/carrier/reservations/{id}/events",
      handler: async (ctx, req) => {
        requireRole(ctx, CARRIER_ALL);
        const input = reservationEventInput.parse(req.body);
        const id = uid(req.params.id);
        return idempotent(pool, ctx, "reservation.event", req.headers["idempotency-key"], { id, ...input }, (c) => recordEvent(c, ctx, id, input));
      },
    },
    {
      method: "POST", pattern: "/carrier/reservations/{id}/pod-upload-url",
      handler: async (ctx, req) => {
        requireRole(ctx, CARRIER_ALL);
        const input = podUploadInput.parse(req.body);
        const id = uid(req.params.id);
        if (!uploadsBucket()) throw new HttpError("INTERNAL", "Dosya deposu yapılandırılmamış.");
        const r = (await fetchRes(pool, "where r.id = $1 and r.carrier_id = $2", [id, ctx.tenantId]))[0];
        if (!r) throw notFound("Rezervasyon");
        if (r.status !== "VARISTA") throw conflict(`${STATUS_LABELS[r.status] ?? r.status} durumunda e-POD yüklenemez; yük varışta olmalı.`, "INVALID_TRANSITION");
        const n = Number((await pool.query("select count(*) n from reservation_attachments where reservation_id = $1", [id])).rows[0].n);
        if (n >= 20) throw validation("Bu rezervasyon için en fazla 20 dosya yüklenebilir.");
        const key = `pod/${ctx.tenantId}/${id}/${randomUUID()}.${POD_EXT[input.contentType]}`;
        await pool.query("insert into reservation_attachments (reservation_id, carrier_id, kind, s3_key, content_type, is_demo) values ($1,$2,$3,$4,$5,$6)", [id, ctx.tenantId, input.kind, key, input.contentType, Boolean(r.is_demo)]);
        return ok({ uploadUrl: await presignPut(key, input.contentType), key, expiresIn: POD_PUT_TTL });
      },
    },
    {
      method: "PUT", pattern: "/carrier/trips/{id}",
      handler: async (ctx, req) => {
        requireRole(ctx, PLANNERS);
        const version = Number(String(req.headers["if-match"] ?? "").replace(/"/g, ""));
        if (!Number.isInteger(version)) throw validation("If-Match başlığı (sefer sürümü) gerekli.");
        const i = tripUpdateInput.parse(req.body);
        if (Object.keys(i).length === 0) throw validation("Değişiklik belirtilmedi.");
        const id = uid(req.params.id);
        return idempotent(pool, ctx, "trip.update", req.headers["idempotency-key"], { id, version, i }, async (c) => {
          const now = new Date();
          // Kapasite satırına yaz: eşzamanlı rezervasyon/blokaj işlemleriyle OCC ile serileşir (write skew yok).
          await adjustCap(c, id, {});
          await expireHolds(c, id, now);
          const t = (await loadTrips(c, "where t.id = $1 and t.carrier_id = $2", [id, ctx.tenantId]))[0];
          if (!t) throw notFound("Sefer");
          if (Number(t.trip_version) !== version) throw conflict("Sefer başka biri tarafından değiştirilmiş (sürüm uyuşmuyor).", "VERSION_MISMATCH", { currentVersion: Number(t.trip_version) });
          if (!["draft", "published", "closed"].includes(t.status)) throw conflict(`${t.status} durumundaki sefer düzenlenemez.`, "INVALID_TRANSITION");
          const cap = capacityOf(t);
          const vehicleId = i.vehicleId ?? t.vehicle_id;
          const dep = i.departureAt ? new Date(i.departureAt) : (t.departure_at as Date);
          const arr = i.arrivalEta ? new Date(i.arrivalEta) : (t.arrival_eta as Date);
          if (i.departureAt && dep.getTime() <= now.getTime()) throw validation("Kalkış zamanı gelecekte olmalı.");
          if (arr.getTime() <= dep.getTime()) throw validation("Varış zamanı kalkıştan sonra olmalı.");
          const sP = i.sellablePallets ?? t.sellable_pallets, sKg = i.sellableKg ?? t.sellable_kg, sM3 = i.sellableM3 ?? Number(t.sellable_m3), maxKg = i.maxGrossKg ?? t.max_gross_kg;
          // Araç satırını kilitle: aynı araca eşzamanlı sefer ekleme/düzenleme serileşir.
          const v = (await c.query("select id, status, vehicle_type_id from vehicles where id = $1 and carrier_id = $2 for update", [vehicleId, ctx.tenantId])).rows[0];
          if (!v) throw validation("Araç bulunamadı.");
          if (v.status !== "active") throw validation("Araç aktif değil.");
          const vt = (await c.query("select pallet_positions from vehicle_types where id = $1", [v.vehicle_type_id])).rows[0];
          if (t.internal_pallets + sP > vt.pallet_positions) throw validation(`İç palet + satışa açık palet araç kapasitesini (${vt.pallet_positions}) aşıyor.`);
          const ov = await c.query("select reference from trips where vehicle_id = $1 and id <> $4 and status in ('draft','published','closed','departed') and departure_at < $3 and arrival_eta > $2 limit 1", [vehicleId, dep, arr, id]);
          if (ov.rows[0]) throw conflict(`Araç bu aralıkta başka bir seferde (${ov.rows[0].reference}).`, "VEHICLE_OVERLAP");
          const below: string[] = [];
          if (sP < cap.held.pallets + cap.confirmed.pallets) below.push(`palet (${cap.held.pallets + cap.confirmed.pallets} bloke/onaylı)`);
          if (sKg < cap.held.kg + cap.confirmed.kg) below.push(`kg (${cap.held.kg + cap.confirmed.kg} bloke/onaylı)`);
          if (sM3 < cap.held.m3 + cap.confirmed.m3) below.push(`m³ (${round2(cap.held.m3 + cap.confirmed.m3)} bloke/onaylı)`);
          if (maxKg < t.internal_kg + cap.confirmed.kg) below.push(`azami brüt (iç + onaylı ${t.internal_kg + cap.confirmed.kg} kg)`);
          if (below.length > 0) throw conflict(`Kapasite bloke ve onaylı yüklerin altına düşürülemez: ${below.join(", ")}.`, "CAPACITY_BELOW_COMMITTED", { committed: below });
          const cut = i.departureAt ? [new Date(dep.getTime() - 3 * 3_600_000), new Date(dep.getTime() - 3_600_000)] : [t.booking_cutoff_at, t.intake_cutoff_at];
          await c.query(
            `update trips set vehicle_id = $2, total_positions = $3, sellable_pallets = $4, sellable_kg = $5, sellable_m3 = $6, max_gross_kg = $7, departure_at = $8, arrival_eta = $9,
               booking_cutoff_at = $10, intake_cutoff_at = $11, capacity_version = coalesce(capacity_version, 1) + 1, version = version + 1, updated_at = $12 where id = $1`,
            [id, vehicleId, vt.pallet_positions, sP, sKg, sM3, maxKg, dep, arr, cut[0], cut[1], now]);
          const t2 = (await loadTrips(c, "where t.id = $1", [id]))[0];
          const cap2 = capacityOf(t2);
          const pend = await fetchRes(c, "where r.trip_id = $1 and r.status = 'TASIYICI_ONAYI_BEKLIYOR'", [id]);
          const accepted = new Map((await c.query("select product_class_id, accepted from carrier_product_classes where carrier_id = $1", [ctx.tenantId])).rows.map((x) => [x.product_class_id, Boolean(x.accepted)]));
          const reevaluated: Array<{ reservationId: string; reference: string; customer: string; eligible: boolean; reasons: { code: string; message: string }[] }> = [];
          for (const r of pend) {
            const elig = checkEligibility(
              { status: t2.status, bookingCutoffAt: t2.booking_cutoff_at, internalKg: t2.internal_kg, maxGrossKg: t2.max_gross_kg, sellablePallets: t2.sellable_pallets, sellableKg: t2.sellable_kg, sellableM3: Number(t2.sellable_m3) },
              { heldPallets: cap2.held.pallets - r.pallets, heldKg: cap2.held.kg - r.gross_kg, heldM3: cap2.held.m3 - Number(r.volume_m3), confirmedPallets: cap2.confirmed.pallets, confirmedKg: cap2.confirmed.kg, confirmedM3: cap2.confirmed.m3 },
              { pallets: r.pallets, grossKg: r.gross_kg, volumeM3: Number(r.volume_m3), productClassAccepted: accepted.get(r.product_class_id) ?? true },
              { now },
            );
            reevaluated.push({ reservationId: r.id, reference: r.reference, customer: r.customer_name, eligible: elig.eligible, reasons: elig.reasons });
            const flagged = Boolean(r.needs_review);
            if (!elig.eligible) {
              await c.query("update reservations set needs_review = true, updated_at = $2 where id = $1", [r.id, now]);
              await c.query("delete from reservation_events where reservation_id = $1 and type = 'YENIDEN_DEGERLENDIRME'", [r.id]);
              await addEvent(c, r.id, "YENIDEN_DEGERLENDIRME", `Araç/kapasite değişti, yeniden değerlendirme gerekli: ${elig.reasons.map((x) => x.message).join("; ")}`.slice(0, 290), ctx.userId, now, r.is_demo);
            } else if (flagged) {
              await c.query("update reservations set needs_review = false, updated_at = $2 where id = $1", [r.id, now]);
            }
          }
          await audit(c, ctx, {
            action: "trip.update", entityType: "trip", entityId: id,
            before: { vehicleId: t.vehicle_id, sellablePallets: t.sellable_pallets, sellableKg: t.sellable_kg, sellableM3: Number(t.sellable_m3), maxGrossKg: t.max_gross_kg, departureAt: iso(t.departure_at) },
            after: { vehicleId, sellablePallets: sP, sellableKg: sKg, sellableM3: sM3, maxGrossKg: maxKg, departureAt: iso(dep), needsReview: reevaluated.filter((x) => !x.eligible).length },
          });
          const pc = await pendingCounts(c, [id]);
          return ok({ ...carrierTrip(t2, now, pc.get(id) ?? 0), reevaluated, needsReviewCount: reevaluated.filter((x) => !x.eligible).length });
        });
      },
    },
    {
      method: "GET", pattern: "/carrier/dashboard",
      handler: async (ctx, req) => {
        requireRole(ctx, CARRIER_ALL);
        await expireDue(pool);
        const now = new Date();
        let tripId = req.query.tripId ? uid(req.query.tripId) : undefined;
        if (!tripId) {
          const d = await pool.query("select id from trips where carrier_id = $1 and reference like '%-DEMO-%' order by departure_at limit 1", [ctx.tenantId]);
          tripId = d.rows[0]?.id
            ?? (await pool.query("select id from trips where carrier_id = $1 and departure_at >= $2 and status <> 'cancelled' order by departure_at limit 1", [ctx.tenantId, now])).rows[0]?.id;
        }
        if (!tripId) throw notFound("Sefer");
        const t = (await loadTrips(pool, "where t.id = $1 and t.carrier_id = $2", [tripId, ctx.tenantId]))[0];
        if (!t) throw notFound("Sefer");
        const rows = await fetchRes(pool, "where r.trip_id = $1 order by r.created_at", [tripId]);
        const views = await reservationViews(pool, rows, now, { carrierView: true });
        const live = views.filter((v) => v.status === "TASIYICI_ONAYI_BEKLIYOR" || CONFIRMED_STATES.includes(v.status));
        const confirmed = views.filter((v) => CONFIRMED_STATES.includes(v.status));
        const revenue = confirmed.reduce((a, v) => a + v.totalPriceMinor, 0);
        const cost = confirmed.reduce((a, v) => a + v.pallets * COST_PER_PALLET_MINOR, 0);
        const timeline = views.flatMap((v) => v.events.map((e) => ({ at: e.at, label: `${v.customer.name}: ${e.label}` }))).sort((a, b) => +new Date(a.at) - +new Date(b.at));
        const pc = await pendingCounts(pool, [tripId]);
        return ok({
          trip: carrierTrip(t, now, pc.get(tripId) ?? 0), grossRevenueMinor: revenue, variableCostMinor: cost, contributionMinor: revenue - cost, costPerPalletMinor: COST_PER_PALLET_MINOR,
          customers: live.map((v) => ({ name: v.customer.name, pallets: v.pallets, kg: v.grossKg, totalMinor: v.totalPriceMinor, status: v.status, statusLabel: v.statusLabel })),
          timeline,
        });
      },
    },
  ];
}
