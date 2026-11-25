const HOUR = 3_600_000;
export interface CancellationResult { refundPercent: number; rule: string }
/** İptal politikası. Onay öncesi: tam serbest bırakma. Onay sonrası: ≥24 saat %100, 24 saat – T−3 arası %50, sonrası %0. */
export function cancellationRefund(departureAt: Date, now: Date, opts: { approved: boolean; noShow?: boolean }): CancellationResult {
  if (opts.noShow) return { refundPercent: 0, rule: "Yük getirilmedi: iade yok." };
  if (!opts.approved) return { refundPercent: 100, rule: "Taşıyıcı onayından önce iptal: ücret yok, ön provizyon serbest bırakılır." };
  const left = departureAt.getTime() - now.getTime();
  if (left >= 24 * HOUR) return { refundPercent: 100, rule: "Kalkışa 24 saatten fazla kala iptal: tam iade." };
  if (left >= 3 * HOUR) return { refundPercent: 50, rule: "Kalkışa 24 saat ile 3 saat arasında iptal: %50 iade." };
  return { refundPercent: 0, rule: "Kalkışa 3 saatten az kala iptal: iade yok." };
}
export const CANCELLATION_POLICY_TABLE = [
  { label: "Taşıyıcı onayından önce", refundPercent: 100 },
  { label: "Kalkışa 24 saatten fazla", refundPercent: 100 },
  { label: "Kalkışa 24 saat ile 3 saat arası", refundPercent: 50 },
  { label: "Kalkışa 3 saatten az veya yük getirilmezse", refundPercent: 0 },
];
