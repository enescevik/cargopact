const HOUR_MS = 3_600_000;

/** Yer ayırma ve kesin rezervasyon için son an (T−3 saat). */
export const bookingCutoff = (departure: Date): Date => new Date(departure.getTime() - 3 * HOUR_MS);
/** Çıkış deposu fiziksel kabul için son an (T−1 saat). */
export const intakeCutoff = (departure: Date): Date => new Date(departure.getTime() - 1 * HOUR_MS);

/** Sınır anı dahildir: now <= cutoff ise işlem yapılabilir. */
export const isWithinCutoff = (now: Date, cutoff: Date): boolean => now.getTime() <= cutoff.getTime();
