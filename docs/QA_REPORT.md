# QA Raporu – Web müşteri akışı ve jüri panosu

Tarih: 25.11.2026 · Ortam: https://d1xysc2r88pheq.cloudfront.net · Chromium headless 1440x900 · Betik: `scripts/e2e-ui.mjs`
Çalıştırma: `set -a; . ./.env.seed; set +a; cd /tmp/pw && node /workshop/scripts/e2e-ui.mjs` (önce `npm run demo:reset`).

## Sonuç: 14/14 adım YEŞİL, konsol hatası 0

| # | Adım | Sonuç |
|---|------|-------|
| 01 | web.musteri girişi | PASS |
| 02 | Gebze → Ankara, yarın, 3 palet araması (ilçe adıyla, istemci tarafı filtre) | PASS |
| 03 | DNC-DEMO-GEB-ANK sefer detayı | PASS |
| 04 | 3 palet / 1500 kg / GENEL beyanı, fiyat teklifi görünür | PASS |
| 05 | Tam ödeme + "Teklifi kabul et" → "Taşıyıcı onayı bekliyor" | PASS |
| 06 | web.yonetici girişi (ayrı oturum) | PASS |
| 07 | Seferi açıp talebi onaylama | PASS |
| 08 | Kapasite 28/33 | PASS |
| 09 | Jüri panosu: 28/33, 33 hücre, "Gebze → Sincan" başlığı | PASS |
| 10 | Müşteride sipariş no (CP-2026-NNNNNN) + gerçek QR (sipariş + 3 palet) | PASS |
| 11 | Yük takibi | PASS |
| 12 | Sohbet: "Gebze'den Ankara'ya 3 palet…" 25 sn içinde yanıt | PASS |
| 13 | user@baskent girişi + sefer | PASS |
| 14 | Ağırlık aşımı: Türkçe gerekçe, kabul butonu pasif | PASS (9000 kg ile, bkz. kalan sorunlar) |

Ekran görüntüleri: `/tmp/pw/shots/01-…14-*.png` (adım başına bir tane).

## Düzeltilen hatalar
- Gebze ile arama sonuç vermiyordu (API yalnız il eşler): şehir/ilçe/tesis adı istemcide eşleniyor (aksan duyarsız).
- Başlıkta il yerine ilçe (`district ?? city`): müşteri ve pano. İl, alt satırda "Kocaeli → Ankara" olarak kalır.
- Sahte QR yerine gerçek QR (`qrcode`): palet kodları ve sipariş numarası.
- Takip ekranı çöküyordu ("Invalid time value", teslim penceresi "09:00–18:00" saat metni). Düzeltildi.
- `Field` etiketleri girdiye bağlı değildi (erişilebilirlik, seçiciler). `htmlFor/id` eklendi.
- Pano: araç yerleşim ızgarası karttan taşıyordu, boş hücreler `.empty` sınıfıyla çakışıp dev görünüyordu. Düzeltildi.
- "Yükü takip et" düğmesi koyu kartta beyaz üstüne beyazdı.

## Kalan sorunlar (koordinatöre)
1. **Seed/backend:** Plan senaryosu 3 palet / 2600 kg → MAX_GROSS_EXCEEDED, güncel seed'de oluşmuyor (onay sonrası kalan 5 palet / 3500 kg, uygun görünüyor). Taşıyıcı kalan kg/maxGross değerleri senaryoya göre ayarlanmalı. e2e 9000 kg ile Türkçe gerekçeyi doğruluyor.
2. **Hedef rota adı:** Demo seferin varış ilçesi "Sincan"; başlık "Gebze → Sincan" oluyor, "Gebze → Ankara" değil. İsteniyorsa varış ilçesi seed'de boşaltılmalı.
3. **App.tsx (giriş):** E-posta/Parola etiketleri girdilere bağlı değil (`htmlFor` yok).
4. **Carrier.tsx:** Sefer detay başlığı hâlâ il gösteriyor ("Kocaeli → Ankara"); `place()` (format.ts) kullanılmalı.
5. **Eşzamanlılık:** Aynı demo seferi birden çok ajan/test kullanınca e2e kararsızlaşıyor (başka bir `seed:demo` talebi siliyor). Mobil ekranlar bu turda incelenmedi.
