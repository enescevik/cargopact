export interface PricingPolicy {
  basePriceMinor: number;
  floorRatio: number;
  ceilingRatio: number;
  /** minUtilization ≤ doluluk olan en yüksek basamak. */
  demandTiers: { minUtilization: number; multiplier: number }[];
  /** maxHoursToCutoff ≥ kalan saat olan EN KÜÇÜK eşik. */
  timeTiers: { maxHoursToCutoff: number; multiplier: number }[];
  timeDecayMaxUtilization: number;
  roundingMinor: number;
}
export const DEFAULT_DEMAND_TIERS = [
  { minUtilization: 0, multiplier: 1.0 }, { minUtilization: 0.5, multiplier: 1.1 },
  { minUtilization: 0.75, multiplier: 1.2 }, { minUtilization: 0.9, multiplier: 1.35 },
];
export const DEFAULT_TIME_TIERS = [
  { maxHoursToCutoff: 24, multiplier: 0.95 }, { maxHoursToCutoff: 12, multiplier: 0.9 }, { maxHoursToCutoff: 6, multiplier: 0.85 },
];
export const defaultPolicy = (basePriceMinor: number, floorRatio = 0.8, ceilingRatio = 1.5): PricingPolicy => ({
  basePriceMinor, floorRatio, ceilingRatio, demandTiers: DEFAULT_DEMAND_TIERS, timeTiers: DEFAULT_TIME_TIERS,
  timeDecayMaxUtilization: 0.6, roundingMinor: 1000,
});
export interface PriceCapacity { heldPallets: number; confirmedPallets: number; sellablePallets: number }
export interface PriceBreakdown {
  basePriceMinor: number; utilization: number; demandMultiplier: number; hoursToCutoff: number;
  timeMultiplier: number; timeDecayApplied: boolean; clampedTo: "floor" | "ceiling" | null;
  roundedFromMinor: number; explanation: string[];
}
export interface PriceQuote { unitPriceMinor: number; totalPriceMinor: number; breakdown: PriceBreakdown }
const milli = (x: number) => Math.round(x * 1000);
const pct = (m: number) => Math.round(Math.abs(m - 1) * 100);
/** Saf ve deterministik: aynı girdi (saat dahil) aynı fiyatı üretir. Para kuruş tamsayısıdır. */
export function priceQuote(policy: PricingPolicy, bookingCutoffAt: Date, capacity: PriceCapacity, palletCount: number, now: Date): PriceQuote {
  const sellable = capacity.sellablePallets;
  const utilization = sellable > 0 ? Math.min(1, (capacity.heldPallets + capacity.confirmedPallets) / sellable) : 1;
  const demandMultiplier = [...policy.demandTiers].sort((a, b) => a.minUtilization - b.minUtilization)
    .reduce((m, t) => (t.minUtilization <= utilization + 1e-9 ? t.multiplier : m), 1);
  const hoursToCutoff = Math.round(((bookingCutoffAt.getTime() - now.getTime()) / 3_600_000) * 100) / 100;
  const eligibleTime = [...policy.timeTiers].filter((t) => t.maxHoursToCutoff >= hoursToCutoff).sort((a, b) => a.maxHoursToCutoff - b.maxHoursToCutoff)[0];
  const decay = eligibleTime && utilization <= policy.timeDecayMaxUtilization + 1e-9;
  const timeMultiplier = decay ? eligibleTime.multiplier : 1;
  const base = policy.basePriceMinor;
  const raw = Math.round((base * milli(demandMultiplier) * milli(timeMultiplier)) / 1_000_000);
  const lo = Math.round(base * policy.floorRatio), hi = Math.round(base * policy.ceilingRatio);
  const clampedTo = raw < lo ? "floor" : raw > hi ? "ceiling" : null;
  const clamped = Math.min(hi, Math.max(lo, raw));
  const unit = Math.floor(clamped / policy.roundingMinor + 0.5) * policy.roundingMinor;
  const explanation: string[] = [];
  if (demandMultiplier > 1) explanation.push(`Talep yoğun: +${pct(demandMultiplier)}%`);
  if (decay && timeMultiplier < 1) explanation.push(`Kalkışa ${Math.max(0, Math.ceil(hoursToCutoff))} saat kaldı: −${pct(timeMultiplier)}%`);
  if (clampedTo) explanation.push(clampedTo === "floor" ? "Fiyat taşıyıcının alt sınırında tutuldu" : "Fiyat taşıyıcının üst sınırında tutuldu");
  if (explanation.length === 0) explanation.push("Standart fiyat: talep ve zaman etkisi yok");
  return {
    unitPriceMinor: unit, totalPriceMinor: unit * palletCount,
    breakdown: { basePriceMinor: base, utilization: Math.round(utilization * 1000) / 1000, demandMultiplier, hoursToCutoff, timeMultiplier, timeDecayApplied: Boolean(decay) && timeMultiplier < 1, clampedTo, roundedFromMinor: clamped, explanation },
  };
}
