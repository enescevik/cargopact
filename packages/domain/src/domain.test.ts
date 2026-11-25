import { describe, expect, it } from "vitest";
import { bookingCutoff, intakeCutoff, isWithinCutoff, estimatePallets, isValidTrPlate, normalizePlate } from "./index";

const eur = { usableVolumeM3: 1.728, fillFactor: 0.8, maxGrossKg: 1000 };
const koliM = { lengthMm: 400, widthMm: 300, heightMm: 300, unitWeightKg: 12 };

describe("zaman sınırları", () => {
  const t = new Date("2026-11-26T18:00:00+03:00");
  it("T−3 ve T−1 hesaplar (18:00 → 15:00 ve 17:00)", () => {
    expect(bookingCutoff(t).toISOString()).toBe("2026-11-26T12:00:00.000Z");
    expect(intakeCutoff(t).toISOString()).toBe("2026-11-26T14:00:00.000Z");
  });
  it("sınır anı dahildir, 1 ms sonrası değildir", () => {
    const c = bookingCutoff(t);
    expect(isWithinCutoff(c, c)).toBe(true);
    expect(isWithinCutoff(new Date(c.getTime() + 1), c)).toBe(false);
  });
});

describe("estimatePallets", () => {
  it("hacim sınırlı: 200 orta koli", () => {
    const r = estimatePallets(eur, [{ count: 200, ...koliM }]);
    // 200*0.036=7.2 m³; palet etkin 1.3824 m³ → ceil(5.208)=6; ağırlık 2400kg → 3
    expect(r.estimatedPallets).toBe(6);
    expect(r.totalVolumeM3).toBe(7.2);
    expect(r.warnings).toEqual([]);
  });
  it("ağırlık sınırlı: az hacimli ağır koli", () => {
    const r = estimatePallets(eur, [{ count: 100, lengthMm: 200, widthMm: 200, heightMm: 200, unitWeightKg: 40 }]);
    // hacim 0.8 m³ → 1 palet; ağırlık 4000 → 4 palet
    expect(r.estimatedPallets).toBe(4);
    expect(r.warnings).toHaveLength(1);
  });
  it("tam sınır: etkin hacmi tam dolduran yük 1 palet", () => {
    const effective = Math.floor(1.728 * 0.8 * 1e9);
    const r = estimatePallets(eur, [{ count: 1, lengthMm: effective, widthMm: 1, heightMm: 1, unitWeightKg: 10 }]);
    expect(r.estimatedPallets).toBe(1);
    const over = estimatePallets(eur, [{ count: 2, lengthMm: Math.ceil(effective / 2) + 1, widthMm: 1, heightMm: 1, unitWeightKg: 10 }]);
    expect(over.estimatedPallets).toBe(2);
  });
  it("karışık koli satırları toplanır", () => {
    const r = estimatePallets(eur, [
      { count: 10, ...koliM },
      { count: 10, lengthMm: 600, widthMm: 400, heightMm: 400, unitWeightKg: 20 },
    ]);
    expect(r.totalVolumeM3).toBe(1.32);
    expect(r.estimatedPallets).toBe(1);
  });
  it("geçersiz girdiyi reddeder", () => {
    expect(() => estimatePallets(eur, [])).toThrow();
    expect(() => estimatePallets(eur, [{ count: 0, ...koliM }])).toThrow();
  });
});

describe("plaka", () => {
  it("normalize eder ve doğrular", () => {
    expect(normalizePlate("41 dnc-101")).toBe("41DNC101");
    expect(isValidTrPlate("41 DNC 101")).toBe(true);
    expect(isValidTrPlate("06 AB 1234")).toBe(true);
    expect(isValidTrPlate("99 XX 11")).toBe(false);
    expect(isValidTrPlate("41 D 1")).toBe(false);
  });
});
