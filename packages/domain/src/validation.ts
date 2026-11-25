/** Plakayı büyük harfe çevirir, boşluk ve tireleri atar. */
export const normalizePlate = (plate: string): string => plate.toUpperCase().replace(/[\s\-.]/g, "");

/** Türkiye plaka biçimi: il kodu (01-81) + 1-3 harf + 2-4 rakam. */
export const isValidTrPlate = (plate: string): boolean =>
  /^(0[1-9]|[1-7]\d|8[01])[A-Z]{1,3}\d{2,4}$/.test(normalizePlate(plate));
