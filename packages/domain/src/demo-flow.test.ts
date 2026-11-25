import { describe, expect, it } from "vitest";
import { cancellationRefund, checkEligibility, defaultPolicy, priceQuote } from "./index";
const dep = new Date("2026-11-27T15:00:00Z");
const cutoff = new Date(dep.getTime() - 3 * 3_600_000);
const trip = { status: "published", bookingCutoffAt: cutoff, internalKg: 17000, maxGrossKg: 22000, sellablePallets: 8, sellableKg: 5000, sellableM3: 12 };
const cap = (o: Partial<Record<string, number>> = {}) => ({ heldPallets: 0, heldKg: 0, heldM3: 0, confirmedPallets: 0, confirmedKg: 0, confirmedM3: 0, ...o });
const now = new Date(cutoff.getTime() - 48 * 3_600_000);
describe("checkEligibility", () => {
  it("plan örneği: 2700 kg dolu, 3 palet 2600 kg → MAX_GROSS_EXCEEDED + INSUFFICIENT_KG", () => {
    const r = checkEligibility(trip, cap({ confirmedPallets: 5, confirmedKg: 2700, confirmedM3: 6 }), { pallets: 3, grossKg: 2600, volumeM3: 3.6, productClassAccepted: true }, { now });
    expect(r.eligible).toBe(false);
    expect(r.reasons.map((x) => x.code).sort()).toEqual(["INSUFFICIENT_KG", "MAX_GROSS_EXCEEDED"]);
  });
  it("uygun talep", () => {
    expect(checkEligibility(trip, cap(), { pallets: 3, grossKg: 1500, volumeM3: 3.6, productClassAccepted: true }, { now }).eligible).toBe(true);
  });
  it("sınır anı dahil, sonrası reddedilir", () => {
    const req = { pallets: 1, grossKg: 500, volumeM3: 1, productClassAccepted: true };
    expect(checkEligibility(trip, cap(), req, { now: cutoff }).eligible).toBe(true);
    expect(checkEligibility(trip, cap(), req, { now: new Date(cutoff.getTime() + 1) }).reasons.map((x) => x.code)).toContain("BOOKING_CUTOFF_PASSED");
  });
  it("tüm nedenler birlikte döner", () => {
    const r = checkEligibility({ ...trip, status: "draft" }, cap(), { pallets: 9, grossKg: 9500, volumeM3: 13, productClassAccepted: false }, { now });
    expect(r.reasons.map((x) => x.code)).toEqual(["TRIP_NOT_PUBLISHED", "INSUFFICIENT_PALLETS", "INSUFFICIENT_KG", "MAX_GROSS_EXCEEDED", "INSUFFICIENT_VOLUME", "PRODUCT_CLASS_NOT_ACCEPTED", "PALLET_TOO_HEAVY"]);
  });
});
describe("priceQuote", () => {
  const p = defaultPolicy(110000);
  const c = (h: number, k: number) => ({ heldPallets: h, confirmedPallets: k, sellablePallets: 8 });
  it("boş araç, uzak kalkış: taban", () => {
    const q = priceQuote(p, cutoff, c(0, 0), 3, now);
    expect(q.unitPriceMinor).toBe(110000);
    expect(q.totalPriceMinor).toBe(330000);
  });
  it("talep basamakları", () => {
    expect(priceQuote(p, cutoff, c(0, 4), 1, now).unitPriceMinor).toBe(121000); // 0.5 → 1.10
    expect(priceQuote(p, cutoff, c(0, 6), 1, now).unitPriceMinor).toBe(132000); // 0.75 → 1.20
    const hi = priceQuote(p, cutoff, c(0, 8), 1, now);
    expect(hi.unitPriceMinor).toBe(149000); // 1.35, 10 TL yuvarlama
    expect(hi.breakdown.explanation[0]).toBe("Talep yoğun: +35%");
  });
  it("zaman indirimi yalnız doluluk ≤ %60", () => {
    const near = new Date(cutoff.getTime() - 5 * 3_600_000);
    const low = priceQuote(p, cutoff, c(0, 1), 1, near);
    expect(low.breakdown.timeMultiplier).toBe(0.85);
    expect(low.unitPriceMinor).toBe(94000);
    expect(low.breakdown.explanation).toContain("Kalkışa 5 saat kaldı: −15%");
    const high = priceQuote(p, cutoff, c(0, 6), 1, near);
    expect(high.breakdown.timeDecayApplied).toBe(false);
    expect(high.unitPriceMinor).toBe(132000);
  });
  it("sınırlara kırpar ve deterministiktir", () => {
    const tight = defaultPolicy(100000, 0.95, 1.05);
    expect(priceQuote(tight, cutoff, c(0, 8), 1, now).breakdown.clampedTo).toBe("ceiling");
    expect(priceQuote(p, cutoff, c(0, 2), 2, now)).toEqual(priceQuote(p, cutoff, c(0, 2), 2, now));
  });
});
describe("cancellationRefund", () => {
  const d = new Date("2026-11-27T15:00:00Z");
  const at = (h: number) => new Date(d.getTime() - h * 3_600_000);
  it("onay öncesi tam serbest", () => expect(cancellationRefund(d, at(1), { approved: false }).refundPercent).toBe(100));
  it("≥24 saat %100", () => expect(cancellationRefund(d, at(24), { approved: true }).refundPercent).toBe(100));
  it("24 saat–T−3 arası %50", () => { expect(cancellationRefund(d, at(10), { approved: true }).refundPercent).toBe(50); expect(cancellationRefund(d, at(3), { approved: true }).refundPercent).toBe(50); });
  it("T−3 sonrası ve no-show %0", () => { expect(cancellationRefund(d, at(2), { approved: true }).refundPercent).toBe(0); expect(cancellationRefund(d, at(30), { approved: true, noShow: true }).refundPercent).toBe(0); });
});
