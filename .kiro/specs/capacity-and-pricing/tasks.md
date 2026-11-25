# Tasks – Kapasite Yayını ve Dinamik Fiyat

Gereksinim numaraları `requirements.md` ile eşleşir. Bağımlılık: platform-foundation ve master-data-and-seed tamam.

- [ ] 1. Şema
  - [ ] 1.1 Migrasyonlar: pricing_policies, trips, trip_capacity, quotes (tek-DDL dosyalar, CHECK kısıtları) (1.1, 1.2, 2.1)
  - [ ] 1.2 Async indeksler ve benzersizlikler (trips carrier+reference, policies carrier+code)
  - [ ] 1.3 `db:grant` yeni tablolara uygulama yetkisi verir; deploy sonrası çalıştır
- [ ] 2. Domain (saf, birim testli)
  - [ ] 2.1 `checkEligibility`: tüm neden kodları, hepsini döndürür, plan reddi örneği (5.1, 5.2, 5.3)
  - [ ] 2.2 `priceQuote`: talep/zaman basamakları, doluluk eşiğinde zaman indirimi kapalı, kırpma, yuvarlama, breakdown, determinizm (4.1–4.5)
  - [ ] 2.3 Kapasite türetmeleri: kalan, planlanan/fiili doluluk, satış doluluğu (2.1, 2.2)
  - [ ] 2.4 Arama tarihi → İstanbul günü UTC aralığı
- [ ] 3. Veri erişimi
  - [ ] 3.1 `applyCapacityDelta` (tek UPDATE + aşım kontrolü + `CapacityExceededError`) (2.2, 2.3)
  - [ ] 3.2 Araç çakışma kontrolü: araç satırı `SELECT ... FOR UPDATE` + aralık kesişim sorgusu (master-data 2.4)
- [ ] 4. API – taşıyıcı
  - [ ] 4.1 Fiyat politikası CRUD (zod: basamaklar sıralı, çarpan aralıkları) (4.1)
  - [ ] 4.2 Sefer oluştur/güncelle (draft): tesis/araç/politika doğrulamaları, cutoff türetme, capacity_version artışı (1.1–1.5)
  - [ ] 4.3 Durum geçişleri: publish, close, reopen, cancel (izinli geçiş tablosu, If-Match) (1.1, 1.3)
  - [ ] 4.4 `GET /carrier/trips` listesi ve `/{id}/capacity` (planlanan/fiili ayrı) (2.1)
  - [ ] 4.5 Satışı bloke+onaylı altına indirme 409 (design §4.7)
- [ ] 5. API – müşteri
  - [ ] 5.1 `GET /customer/trips` arama: filtreler, cutoff, aktif taşıyıcı, gizlilik, sayfalama (3.1, 3.2)
  - [ ] 5.2 `GET /customer/trips/{id}/quote-preview` (yazmaz) (4.5, 4.6)
  - [ ] 5.3 `POST /customer/quotes` (uygunsa yazar, değilse eligible:false), `GET /customer/quotes/{id}` (yalnız kendi) (4.5, 4.6, 5.1)
- [ ] 6. Sözleşme
  - [ ] 6.1 Yeni giriş/yanıt şemaları, `API_OPERATIONS`, `openapi.json` yeniden üret
  - [ ] 6.2 Yönlendirici=belge testi geçer
- [ ] 7. Seed L2
  - [ ] 7.1 Taşıyıcı başına varsayılan fiyat politikası
  - [ ] 7.2 Design §11 seferleri (göreli tarihli), trip_capacity sıfır sayaçlarla
  - [ ] 7.3 `seed:verify`: seferler tutarlı (cutoff = kalkış −3/−1 saat, araç çakışması yok, satış ≤ kapasite)
- [ ] 8. Testler
  - [ ] 8.1 Entegrasyon (gerçek DSQL): aynı araca eşzamanlı iki sefer → bir; eşzamanlı son kapasite `applyCapacityDelta` → bir; satış < taahhüt 409
  - [ ] 8.2 Smoke: design §12 senaryoları + canlı sözleşme kontrolü
- [ ] 9. Doğrulama ve belgeler
  - [ ] 9.1 Typecheck, birim, entegrasyon, smoke, synth geçer; deploy
  - [ ] 9.2 `docs/PROGRESS.md`, steering güncelle
