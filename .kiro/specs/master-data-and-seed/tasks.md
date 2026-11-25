# Tasks – Ana Veri ve Seed

Bağımlılık: platform-foundation görev 2 ve 3 tamamlanmış olmalı.

- [ ] 1. Şema
  - [x] 1.1 Migrasyonlar: facilities, vehicle_types, vehicles, packaging_types, product_classes, carrier_product_classes (tek-DDL dosyalar) (1.1, 2.1, 3.1)
  - [x] 1.2 Async indeksler ve benzersizlikler (carrier+code, carrier+plate, tenant+code)
  - [x] 1.3 Platform kataloğu migrasyonu: araç tipleri, ambalaj tipleri, ürün sınıfları (is_demo=false) (2.1, 3.1, 3.3)
- [ ] 2. Domain
  - [x] 2.1 `estimatePallets` (hacim + ağırlık, mikro-m³ tamsayı) ve birim testleri (3.4, 3.5, 5a)
  - [x] 2.2 Alan doğrulayıcıları: plaka, telefon, pencere biçimi, saat dilimi, koordinat (1.1)
- [ ] 3. API
  - [x] 3.1 Tesis CRUD + pasife alma, `If-Match` sürümü, denetim, idempotency (1.1–1.3, 4.3, 4.4)
  - [x] 3.2 Araç tipi ve araç CRUD; platform tipleri salt okunur, taşıyıcı kendi tiplerini ekler (2.1, 2.2)
  - [x] 3.3 Ambalaj tipi, ürün sınıfı ve taşıyıcı kabul listesi (3.1–3.3)
  - [x] 3.4 `/catalog/*` okuma uçları ve `POST /customer/shipments/estimate-pallets` (3.4, 3.5)
  - [x] 3.5 Rol yetkileri (carrier_admin / platform_admin / diğerleri) ve kiracı izolasyon testleri (4.1, 4.2)
  - [x] 3.6 Pasif kayıt kuralları: pasif tesis/araç seçilemez, referanslı kayıt silinemez (1.3, 4.4)
- [ ] 4. Seed L1
  - [x] 4.1 Seed çatısı: deterministik uuidv5, göreli zaman çapası, prod koruması, parçalı yazma (≤3000) (5.1–5.3)
  - [x] 4.2 L1 veri seti: kiracılar, tesisler, araç/araç tipi, ambalaj, ürün sınıfları (tasarım §5.3) (5.4)
  - [x] 4.3 `seed:users`: Cognito kullanıcıları + users/memberships, parola ortam değişkeninden (5.4)
  - [x] 4.4 `seed:verify` (kiracı sınırı, FK, tekillik) ve `seed:reset` (yalnız is_demo, çocuk→ebeveyn) (5.2, 5.5)
  - [x] 4.5 İdempotency testi: seed iki kez çalışır, satır sayıları aynı
- [ ] 5. Sonraki katmanlar (placeholder, ilgili spec'ler uygulanınca)
  - [ ] 5.1 L2 seed (seferler, rezervasyonlar) → capacity/reservation spec'leri sonrası
  - [ ] 5.2 L3 seed (ödeme/iptal) → payments spec'i sonrası
  - [ ] 5.3 L4 seed (palet olayları, gelmeme) → warehouse spec'i sonrası
- [ ] 6. Doğrulama
  - [x] 6.1 Testler + typecheck + synth geçer; gerçek DSQL'de seed L1 çalıştırılıp verify geçer (deploy onayı sonrası)
  - [x] 6.2 `docs/PROGRESS.md` güncelle
