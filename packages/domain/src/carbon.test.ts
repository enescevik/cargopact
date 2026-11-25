import { describe, expect, it } from "vitest";
import { haversineKm, loadCarbon, routeDistanceKm, tripCarbon, vehicleClassFor } from "./carbon";

describe("carbon", () => {
  it("haversine İstanbul–Ankara ≈ 350 km", () => {
    const d = haversineKm({ lat: 41.0082, lng: 28.9784 }, { lat: 39.9334, lng: 32.8597 });
    expect(d).toBeGreaterThan(340);
    expect(d).toBeLessThan(360);
  });
  it("koordinat yoksa mesafe 0", () => expect(routeDistanceKm({ lat: null, lng: null }, { lat: 1, lng: 1 })).toBe(0));
  it("araç sınıfı eşikleri", () => {
    expect([6, 7, 18, 19].map(vehicleClassFor)).toEqual(["kamyonet", "kamyon", "kamyon", "tir"]);
  });
  it("pay dağıtımı ve dedicated alternatif", () => {
    const c = loadCarbon({ distanceKm: 100, vehiclePalletPositions: 33, pallets: 3, scenario: "dedicated" });
    expect(c.vehicleClass).toBe("tir");
    expect(c.allocatedKg).toBe(8.2); // 100*0.9*3/33 = 8.18
    expect(c.alternativeKg).toBe(32); // 3 palet → kamyonet
    expect(c.savedKg).toBe(23.8);
  });
  it("groupage alternatifi", () => {
    const c = loadCarbon({ distanceKm: 100, vehiclePalletPositions: 33, pallets: 3, scenario: "groupage" });
    expect(c.alternativeKg).toBe(15.7); // 100*1.2*0.55*3/18/0.7 = 15.714
  });
  it("senaryo yoksa tasarruf iddiası yok", () => {
    const c = loadCarbon({ distanceKm: 100, vehiclePalletPositions: 33, pallets: 3 });
    expect(c.alternativeKg).toBeNull();
    expect(c.savedKg).toBeNull();
  });
  it("tasarruf negatif olamaz", () => {
    const c = loadCarbon({ distanceKm: 100, vehiclePalletPositions: 8, pallets: 8, scenario: "groupage" });
    expect(c.savedKg).toBeGreaterThanOrEqual(0);
  });
  it("sefer karbonu yalnız verilenleri toplar", () => {
    const t = tripCarbon({ distanceKm: 100, vehiclePalletPositions: 33, confirmed: [{ pallets: 3, scenario: "dedicated" }, { pallets: 2, scenario: null }] });
    expect(t.tripKg).toBe(90);
    expect(t.externalPallets).toBe(5);
    expect(t.reservationsWithScenario).toBe(1);
    expect(t.reservationsTotal).toBe(2);
    expect(t.declaredSavedKg).toBe(23.8);
  });
});
