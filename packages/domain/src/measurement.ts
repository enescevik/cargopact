/** Depo ölçümü ve beyan karşılaştırması (saf fonksiyonlar). */
export const KG_TOLERANCE_PERCENT = 3;
export type MeasurementOutcome = "ok" | "review" | "partial" | "rejected";
export interface MeasurementDecision {
  diffKg: number; diffPallets: number;
  /** Palet adedi eşit ve kg farkı ≤ %3: normal kabul, kapasiteye dokunulmaz. */
  withinTolerance: boolean;
  /** Ölçülen her iki boyutta da beyandan az/eşit (tolerans dışı hafif dahil): kapasite farkı iade edilir. */
  lighter: boolean;
  /** Tolerans dışı ve beyandan fazla: uygunluk yeniden değerlendirilmelidir. */
  needsEligibility: boolean;
}
export function classifyMeasurement(declared: { pallets: number; grossKg: number }, measured: { pallets: number; grossKg: number }): MeasurementDecision {
  const diffKg = measured.grossKg - declared.grossKg;
  const diffPallets = measured.pallets - declared.pallets;
  const withinTolerance = diffPallets === 0 && Math.abs(diffKg) * 100 <= KG_TOLERANCE_PERCENT * declared.grossKg;
  const lighter = diffPallets <= 0 && diffKg <= 0;
  return { diffKg, diffPallets, withinTolerance, lighter, needsEligibility: !withinTolerance && !lighter };
}
/**
 * Fiyat düzeltme kuralı: kilitli birim fiyat korunur; toplam yalnız palet adedi değişirse değişir
 * (toplam = birim × kabul edilen palet). Kg farkı fiyatı değiştirmez.
 */
export const adjustedTotalMinor = (unitPriceMinor: number, pallets: number): number => Math.max(0, Math.round(unitPriceMinor)) * Math.max(0, pallets);
/** Kısmi kabul: tahsil edilenin, kabul edilmeyen palete düşen payı (kuruş). */
export const nonAcceptedShareMinor = (capturedMinor: number, declaredPallets: number, acceptedPallets: number): number =>
  declaredPallets <= 0 || acceptedPallets >= declaredPallets ? 0 : Math.floor((capturedMinor * (declaredPallets - acceptedPallets)) / declaredPallets);
/** Kabul edilen palet için orantılı ağırlık (ölçülen ortalama). */
export const proportionalKg = (measuredKg: number, measuredPallets: number, acceptedPallets: number): number =>
  measuredPallets <= 0 ? 0 : Math.round((measuredKg * acceptedPallets) / measuredPallets);
