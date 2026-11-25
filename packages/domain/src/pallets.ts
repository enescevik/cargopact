export interface PalletTypeSpec {
  usableVolumeM3: number;
  fillFactor: number;
  maxGrossKg: number;
}
export interface CartonLine {
  count: number;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  /** Koli başına tipik brüt ağırlık (kg). */
  unitWeightKg: number;
}
export interface PalletEstimate {
  totalVolumeM3: number;
  totalWeightKg: number;
  estimatedPallets: number;
  perPalletUsableM3: number;
  warnings: string[];
}

const MM3_PER_M3 = 1_000_000_000;

/**
 * Koli beyanından tahmini palet sayısı. Hacimler mm³ tamsayısıyla hesaplanır (kayan nokta hatası yok).
 * Sonuç yalnız tahmindir; kapasite ve fiyat müşterinin onayladığı palet adedi üzerindendir.
 */
export function estimatePallets(pallet: PalletTypeSpec, cartons: CartonLine[]): PalletEstimate {
  if (cartons.length === 0) throw new Error("En az bir koli satırı gerekli");
  const effectiveMm3 = Math.floor(pallet.usableVolumeM3 * pallet.fillFactor * MM3_PER_M3);
  if (effectiveMm3 <= 0) throw new Error("Palet hacmi geçersiz");

  let totalMm3 = 0;
  let totalKg = 0;
  for (const c of cartons) {
    if (!Number.isInteger(c.count) || c.count <= 0) throw new Error("Koli adedi pozitif tamsayı olmalı");
    totalMm3 += c.count * c.lengthMm * c.widthMm * c.heightMm;
    totalKg += c.count * c.unitWeightKg;
  }
  const byVolume = Math.ceil(totalMm3 / effectiveMm3);
  const byWeight = Math.ceil(totalKg / pallet.maxGrossKg);
  const warnings: string[] = [];
  if (byWeight > byVolume) warnings.push("Palet sayısı ağırlık sınırına göre belirlendi.");
  return {
    totalVolumeM3: Math.round((totalMm3 / MM3_PER_M3) * 1000) / 1000,
    totalWeightKg: Math.round(totalKg * 100) / 100,
    estimatedPallets: Math.max(byVolume, byWeight),
    perPalletUsableM3: Math.round((effectiveMm3 / MM3_PER_M3) * 1000) / 1000,
    warnings,
  };
}
