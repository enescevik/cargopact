/** Karbon tahmini (demo katsayıları). Saf fonksiyonlar; tek kaynak sunucu. */
export type AlternativeScenario = "dedicated" | "groupage";
export type VehicleClass = "kamyonet" | "kamyon" | "tir";

export const CARBON_FACTORS: Record<VehicleClass, number> = { kamyonet: 0.32, kamyon: 0.55, tir: 0.9 };
export const ROUTE_FACTOR = 1.25;
export const GROUPAGE_DETOUR = 1.2;
export const GROUPAGE_FACTOR = 0.55;
export const GROUPAGE_PALLETS = 18;
export const GROUPAGE_LOAD_RATIO = 0.7;
export const CARBON_METHOD = "ISO 14083 / GLEC pay dağıtımı yaklaşımı · demo katsayıları";
export const CARBON_NOTE = "Tahmini; pilotta gerçek yakıt/telemetri ve doğrulanmış alternatif senaryo ile hesaplanır.";

export interface Carbon {
  distanceKm: number;
  vehicleClass: VehicleClass;
  vehicleFactorKgPerKm: number;
  allocatedKg: number;
  alternativeScenario: AlternativeScenario | null;
  alternativeKg: number | null;
  savedKg: number | null;
  method: string;
  isDemoFactors: true;
  note: string;
}
export interface TripCarbon {
  distanceKm: number;
  vehicleFactorKgPerKm: number;
  tripKg: number;
  externalPallets: number;
  allocatedExternalKg: number;
  declaredSavedKg: number;
  reservationsWithScenario: number;
  reservationsTotal: number;
  method: string;
  isDemoFactors: true;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** Kuş uçuşu × 1,25; koordinat yoksa 0. */
export function routeDistanceKm(o: { lat: number | null; lng: number | null }, d: { lat: number | null; lng: number | null }): number {
  if (o.lat == null || o.lng == null || d.lat == null || d.lng == null) return 0;
  return r1(haversineKm({ lat: o.lat, lng: o.lng }, { lat: d.lat, lng: d.lng }) * ROUTE_FACTOR);
}
export function vehicleClassFor(pallets: number): VehicleClass {
  return pallets <= 6 ? "kamyonet" : pallets <= 18 ? "kamyon" : "tir";
}

export function loadCarbon(i: { distanceKm: number; vehiclePalletPositions: number; pallets: number; scenario?: AlternativeScenario | null }): Carbon {
  const cls = vehicleClassFor(i.vehiclePalletPositions);
  const factor = CARBON_FACTORS[cls];
  const allocated = (i.distanceKm * factor * i.pallets) / Math.max(1, i.vehiclePalletPositions);
  const scenario = i.scenario ?? null;
  let alt: number | null = null;
  if (scenario === "dedicated") alt = i.distanceKm * CARBON_FACTORS[vehicleClassFor(i.pallets)];
  else if (scenario === "groupage") alt = (i.distanceKm * GROUPAGE_DETOUR * GROUPAGE_FACTOR * i.pallets) / GROUPAGE_PALLETS / GROUPAGE_LOAD_RATIO;
  const allocatedKg = r1(allocated);
  const alternativeKg = alt === null ? null : r1(alt);
  return {
    distanceKm: r1(i.distanceKm), vehicleClass: cls, vehicleFactorKgPerKm: factor, allocatedKg,
    alternativeScenario: scenario, alternativeKg,
    savedKg: alt === null ? null : Math.max(0, r1(alt - allocated)),
    method: CARBON_METHOD, isDemoFactors: true, note: CARBON_NOTE,
  };
}

export function tripCarbon(i: {
  distanceKm: number; vehiclePalletPositions: number;
  /** ONAYLI+ dış rezervasyonlar */
  confirmed: { pallets: number; scenario: AlternativeScenario | null }[];
}): TripCarbon {
  const factor = CARBON_FACTORS[vehicleClassFor(i.vehiclePalletPositions)];
  let alloc = 0, saved = 0, withScenario = 0, pallets = 0;
  for (const r of i.confirmed) {
    const c = loadCarbon({ distanceKm: i.distanceKm, vehiclePalletPositions: i.vehiclePalletPositions, pallets: r.pallets, scenario: r.scenario });
    alloc += c.allocatedKg; pallets += r.pallets;
    if (c.savedKg !== null) { saved += c.savedKg; withScenario++; }
  }
  return {
    distanceKm: r1(i.distanceKm), vehicleFactorKgPerKm: factor, tripKg: r1(i.distanceKm * factor), externalPallets: pallets,
    allocatedExternalKg: r1(alloc), declaredSavedKg: r1(saved), reservationsWithScenario: withScenario, reservationsTotal: i.confirmed.length,
    method: CARBON_METHOD, isDemoFactors: true,
  };
}
