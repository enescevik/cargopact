export const ELIGIBILITY_MESSAGES: Record<string, string> = {
  TRIP_NOT_PUBLISHED: "Sefer yayında değil.",
  BOOKING_CUTOFF_PASSED: "Yer ayırma süresi (kalkıştan 3 saat önce) geçti.",
  INSUFFICIENT_PALLETS: "Seferde yeterli boş palet yok.",
  INSUFFICIENT_KG: "Seferde yeterli satılabilir ağırlık (kg) kalmadı.",
  MAX_GROSS_EXCEEDED: "Araç azami brüt yük sınırı aşılıyor.",
  INSUFFICIENT_VOLUME: "Seferde yeterli hacim (m³) kalmadı.",
  PRODUCT_CLASS_NOT_ACCEPTED: "Taşıyıcı bu ürün sınıfını kabul etmiyor.",
  PALLET_TOO_HEAVY: "Palet başına ağırlık 1.000 kg sınırını aşıyor.",
};
export const CAPACITY_REASON_CODES = ["INSUFFICIENT_PALLETS", "INSUFFICIENT_KG", "MAX_GROSS_EXCEEDED", "INSUFFICIENT_VOLUME"];
export interface EligibilityTrip {
  status: string; bookingCutoffAt: Date; internalKg: number; maxGrossKg: number;
  sellablePallets: number; sellableKg: number; sellableM3: number;
}
export interface EligibilityCapacity {
  heldPallets: number; heldKg: number; heldM3: number; confirmedPallets: number; confirmedKg: number; confirmedM3: number;
}
export interface EligibilityRequest { pallets: number; grossKg: number; volumeM3: number; productClassAccepted: boolean }
export interface Reason { code: string; message: string }
const reason = (code: string): Reason => ({ code, message: ELIGIBILITY_MESSAGES[code] });
export const MAX_KG_PER_PALLET = 1000;
/** Tüm başarısız kuralları döndürür (ilkini değil). Sınır anı (now == cutoff) izinlidir. */
export function checkEligibility(trip: EligibilityTrip, cap: EligibilityCapacity, req: EligibilityRequest, ctx: { now: Date }): { eligible: boolean; reasons: Reason[] } {
  const r: Reason[] = [];
  if (trip.status !== "published") r.push(reason("TRIP_NOT_PUBLISHED"));
  if (ctx.now.getTime() > trip.bookingCutoffAt.getTime()) r.push(reason("BOOKING_CUTOFF_PASSED"));
  if (req.pallets > trip.sellablePallets - cap.heldPallets - cap.confirmedPallets) r.push(reason("INSUFFICIENT_PALLETS"));
  if (req.grossKg > trip.sellableKg - cap.heldKg - cap.confirmedKg) r.push(reason("INSUFFICIENT_KG"));
  if (trip.internalKg + cap.heldKg + cap.confirmedKg + req.grossKg > trip.maxGrossKg) r.push(reason("MAX_GROSS_EXCEEDED"));
  if (req.volumeM3 > trip.sellableM3 - cap.heldM3 - cap.confirmedM3 + 1e-9) r.push(reason("INSUFFICIENT_VOLUME"));
  if (!req.productClassAccepted) r.push(reason("PRODUCT_CLASS_NOT_ACCEPTED"));
  if (req.pallets > 0 && req.grossKg / req.pallets > MAX_KG_PER_PALLET) r.push(reason("PALLET_TOO_HEAVY"));
  return { eligible: r.length === 0, reasons: r };
}
/** Hacim girilmezse palet başına varsayılan hacim. */
export const DEFAULT_M3_PER_PALLET = 1.2;
export const defaultVolume = (pallets: number): number => Math.round(pallets * DEFAULT_M3_PER_PALLET * 100) / 100;
