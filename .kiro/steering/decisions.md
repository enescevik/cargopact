---
inclusion: always
---
# Açık Kararlar ve Çelişkiler

| # | Konu | Durum |
|---|---|---|
| 1 | Veri tabanı: plan DynamoDB diyor, ekip ilişkisel (Aurora DSQL) seçti | **DSQL**. Çift rezervasyon: tek kapasite satırı + OCC çakışmasında yeniden deneme + idempotency tablosu. DSQL'de yabancı anahtar yok, bütünlük uygulamada. |
| 2 | Tek taşıyıcı (Dinçer) vs çoklu taşıyıcı (Dinçer, Siva…) | **Çoklu**: `carrier` kiracı, `customer` ayrı kiracı. Tüm sorgular tenant filtreli. |
| 3 | Fiyat: plan sabit tarife teklifi; ekip "müşteri teklif verir" diyor | AÇIK: sabit fiyat mı, müşteri fiyat önerisi/pazarlık mı? Şimdilik sabit tarife + onay. |
| 4 | Ödeme sağlayıcı | AÇIK. Soyut `PaymentProvider` arayüzü + demo simülasyon. Hackathon servis listesinde ödeme yok. |
| 5 | İptal ücret dilimleri | AÇIK. Taşıyıcı bazlı parametre, varsayılan değerler iş sahibinden gelecek. |
| 6 | "Q" = Amazon Q Business (plan) / Amazon Quick (ekip) | Kendi sohbet arayüzümüz + AgentCore birincil. Quick/Q ek kanal, sonra. |
| 7 | Hackathon izinli servis listesi | AÇIK, liste bekleniyor. |
| 8 | Mikro toplama / toplama | Müşteri yönetir; sistemde yok. Entegrasyon noktası ileride. |
