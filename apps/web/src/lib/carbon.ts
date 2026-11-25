/**
 * Karbon tasarrufu tahmini (GLEC çerçevesine yakın, sabit varsayılan katsayılar).
 * Paylaşımlı araçta yükün payına düşen emisyon, aynı yük için ayrı (özel) bir
 * araç gönderilseydi oluşacak emisyonla karşılaştırılır. Sonuç bir tahmindir.
 */
type Point = { latitude?: number | null; longitude?: number | null };

/** Yol mesafesi ≈ kuş uçuşu × 1,25 (Türkiye karayolu ortalaması için yaygın düzeltme). */
export function roadKm(a: Point, b: Point): number | null {
  if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) return null;
  const R = 6371, rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude), dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h)) * 1.25;
}

/** kg CO₂e / km — palet kapasitesine göre araç sınıfı (kamyonet, kamyon, tır) varsayılanları. */
const KG_PER_KM = (pallets: number) => (pallets <= 6 ? 0.32 : pallets <= 18 ? 0.55 : 0.9);

export function co2Saved(km: number, pallets: number, positions = 33): { savedKg: number; sharedKg: number; dedicatedKg: number } {
  // Paylaşımlı araçta yük, aracın emisyonundan palet payı kadar sorumludur.
  const sharedKg = km * KG_PER_KM(positions) * (pallets / Math.max(positions, 1));
  const dedicatedKg = km * KG_PER_KM(pallets);
  return { savedKg: Math.max(0, dedicatedKg - sharedKg), sharedKg, dedicatedKg };
}
