# Karbon hesabı (DEMO)

Tüm değerler **tahminidir ve demo katsayılarına dayanır**. Ekranda "demo katsayıları, tahmini" etiketi zorunludur (`isDemoFactors: true`). Tek hesap kaynağı sunucudur (`packages/domain/src/carbon.ts`); web, mobil ve asistan aynı değeri gösterir.

## Yöntem
ISO 14083 / GLEC çerçevesindeki **pay dağıtımı (allocation)** yaklaşımı: seferin toplam emisyonu, yükün kapladığı palet payına göre dağıtılır. Bu bir yaklaşımdır; sertifikalı bir hesap değildir.

## Formüller
- `distanceKm` = tesis koordinatları arası kuş uçuşu mesafe × 1,25
- `seferEmisyonu` = `distanceKm` × `vehicleFactorKgPerKm`
- `allocatedKg` = `seferEmisyonu` × (yükün paleti / araç palet pozisyonu)
- `alternativeKg`
  - `dedicated` (ayrı araç): `distanceKm` × (palete göre seçilen araç sınıfının katsayısı)
  - `groupage` (parsiyel/ambar): `distanceKm` × 1,2 × 0,55 × palet/18 / 0,7
- `savedKg` = max(0, `alternativeKg` − `allocatedKg`); alternatif seçilmediyse `null`

## Katsayılar (DEMO, resmi değer değildir)
| Araç sınıfı | kg CO₂e / km |
|---|---|
| kamyonet | 0,32 |
| kamyon | 0,55 |
| tır | 0,90 |

Groupage formülündeki 1,2 (dolaşım/aktarma payı), 18 (referans araç palet sayısı) ve 0,7 (doluluk) de demo varsayımıdır.

## Neden tasarruf yalnız alternatif seçilince gösterilir (karar 1a, plan §1)
"Tasarruf" bir karşılaştırma gerektirir. Müşterinin gerçekte ne yapacağını bilmeden tasarruf iddia etmek doğrulanamaz. Bu yüzden müşteri rezervasyonda isteğe bağlı olarak "ayrı araçla" veya "parsiyel/ambar ile gönderirdim" seçerse tasarruf hesaplanır. Seçmezse yalnız yükün payına düşen emisyon gösterilir ve `savedKg` `null` kalır. Asistan bu durumda tasarruf iddia etmez. Taşıyıcı tarafındaki `declaredSavedKg` yalnız müşterilerin beyan ettiği senaryolara dayanır.

## Sınırlar
- Mesafe kuş uçuşu × sabit katsayıdır; gerçek rota, yük ve eğim yoktur.
- Araç katsayıları sınıf başına sabittir; yakıt tipi, Euro sınıfı, boş dönüş yoktur.
- Alternatif senaryolar müşteri beyanıdır, doğrulanmamıştır.
- Boru hattı (well-to-wheel) ve tank-to-wheel ayrımı yapılmaz.

## Pilotta değişecekler
- Gerçek yakıt tüketimi ve araç telemetrisi.
- Doğrulanmış alternatif senaryo (gerçek ayrı araç/ambar teklifleri).
- Resmî katsayı tabloları, örn. UK DESNZ/DEFRA dönüşüm faktörleri veya GLEC varsayılanları. Bu belgede resmî sayısal değer verilmemiştir; kullanılacak sürüm pilotta doğrulanıp belgelenecektir.
