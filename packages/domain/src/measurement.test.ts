import { describe, expect, it } from "vitest";
import { adjustedTotalMinor, classifyMeasurement, nonAcceptedShareMinor, proportionalKg } from "./measurement";

const d = { pallets: 4, grossKg: 2000 };
describe("classifyMeasurement", () => {
  it("%3 sınırı dahil tolerans içi", () => {
    const r = classifyMeasurement(d, { pallets: 4, grossKg: 2060 });
    expect(r).toMatchObject({ diffKg: 60, withinTolerance: true, needsEligibility: false });
  });
  it("%3 üzeri ağır: uygunluk gerekir", () => {
    expect(classifyMeasurement(d, { pallets: 4, grossKg: 2061 })).toMatchObject({ withinTolerance: false, needsEligibility: true, lighter: false });
  });
  it("fazla palet: uygunluk gerekir", () => {
    expect(classifyMeasurement(d, { pallets: 5, grossKg: 2000 }).needsEligibility).toBe(true);
  });
  it("beyandan hafif: kabul, fark kaydedilir", () => {
    expect(classifyMeasurement(d, { pallets: 3, grossKg: 1500 })).toMatchObject({ lighter: true, needsEligibility: false, diffPallets: -1, diffKg: -500 });
    expect(classifyMeasurement(d, { pallets: 4, grossKg: 1800 })).toMatchObject({ lighter: true, withinTolerance: false });
  });
  it("palet az ama kg fazla: uygunluk gerekir", () => {
    expect(classifyMeasurement(d, { pallets: 3, grossKg: 2200 }).needsEligibility).toBe(true);
  });
});
describe("fiyat ve pay", () => {
  it("toplam birim × palet", () => { expect(adjustedTotalMinor(25000, 3)).toBe(75000); });
  it("kabul edilmeyen pay", () => {
    expect(nonAcceptedShareMinor(100000, 4, 3)).toBe(25000);
    expect(nonAcceptedShareMinor(100000, 4, 4)).toBe(0);
    expect(nonAcceptedShareMinor(100000, 4, 5)).toBe(0);
  });
  it("orantılı kg", () => { expect(proportionalKg(2500, 5, 3)).toBe(1500); });
});
