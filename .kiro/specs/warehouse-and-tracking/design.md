# Design – Depo İşlemleri ve Takip
Gerçekleşen uygulama: `routes/demo.ts` (`recordEvent`, `pod-upload-url`, `tracking`), `routes/integrations.ts` (WMS/TMS), `lib/events.ts`, `apps/mobile/src/{queue,scanner,qr}.ts(x)`, `apps/mobile/src/carrier/*`. e-POD ve sefer düzenleme commit `70f10d2`, entegrasyonlar commit `24e7a28` (`docs/INTEGRATIONS.md`).

## 1. Model: rezervasyon düzeyi olay + palet kodu
Durum ve olaylar **rezervasyon** düzeyindedir (bir rezervasyon = N palet). Palet kimliği onayda üretilir: `reservations.pallet_codes jsonb` = `["CP-2026-000123-P1", …]` (`<sipariş no>-P<n>`). Mobil QR bu kodu üretir ve okur; SSCC eşleme alanı yoktur. Palet bazlı olay yalnız WMS entegrasyon tablosunda tutulur.

## 2. Veri modeli
| Tablo | Amaç |
|---|---|
| `reservation_events` (0033) | Olay günlüğü: `type`, `note`, `actor_user_id`; `UNIQUE(reservation_id, type)` → aynı olay türü ikinci kez yazılmaz |
| `trip_capacity.loaded_pallets/loaded_kg` (0031) | Fiili doluluk; `YUKLENDI` olayında artar |
| `reservation_attachments` (0050) | e-POD dosyası: `kind` (`photo`/`signature`), `s3_key`, `content_type`, `attached` |
| `reservations.pod_recipient_name` (0053) | Teslim alan kişi (e-POD) |
| `wms_pallet_events` (0061) | Palet bazlı WMS olayı; `UNIQUE(pallet_code, event_type)` |
| `integration_cursors` (0060) | EventBridge yayın imleci (taşıyıcı başına) |

## 3. Olay akışı (`POST /carrier/reservations/{id}/events`, carrier_admin/planner/warehouse)
Geçiş tablosu: `DEPO_KABUL ← ONAYLI`, `YUKLENDI ← DEPO_KABUL`, `VARISTA ← YUKLENDI`, `TESLIM ← VARISTA`, `EKSIK_HASAR ← YUKLENDI|VARISTA`, `GELMEDI ← ONAYLI`. Diğer sıra 409 `INVALID_TRANSITION`.
- `DEPO_KABUL`: yalnız `now ≤ intake_cutoff_at` (T−1, sınır dahil); sonrası 409. Kalan kapora tahsil edilir (payments spec).
- `YUKLENDI`: `loaded_*` sayacı artar → "fiili" palet doluluğu (`actualPallets = iç + loaded`). Planlanan (`iç + confirmed`), bloke (`held`) ve fiili ayrı alanlarda döner.
- `TESLIM`: `recipientName` zorunlu (400); `podKeys` varsa anahtar öneki `pod/<carrier>/<reservationId>/` olmalı, `reservation_attachments`'ta kayıtlı ve S3'te mevcut olmalı (`HeadObject`), sonra `attached=true`. Yetkili alıcı doğrulaması yok (yalnız ad kaydı).
- Tekrar: aynı tür olay zaten varsa veya durum zaten o ise mevcut görünüm döner, çift hareket/sayaç yok. HTTP katmanında ayrıca `Idempotency-Key`.
- Her olay `audit_log`'a (`reservation.event.<TİP>`) yazılır.

## 4. e-POD (`POST /carrier/reservations/{id}/pod-upload-url`)
Yalnız `VARISTA` durumunda; rezervasyon başına en çok 20 dosya; yanıt: presigned S3 PUT URL + `key` (`pod/<carrier>/<id>/<uuid>.<uzantı>`), `jpeg/png/webp`. Bucket özel; API rolü yalnız `pod/*` yoluna `PutObject/GetObject` alır; okuma için presigned GET.

## 5. Takip
`GET /customer/orders/{orderNumber}/tracking`: adımlar (`TASIYICI_ONAYI_BEKLIYOR → ONAYLI → DEPO_KABUL → YUKLENDI → VARISTA → TESLIM`), `nextStep` (çıkış deposu ve T−1 İstanbul saati, varış teslim alma), `palletCodes`, varış `pickupWindow`. Başka firma → 404. Canlı araç konumu yok (2. madde).

## 6. Mobil (Expo)
- QR: `qr.tsx` palet kodundan QR üretir, `scanner.tsx` kamerayla okur (jsQR/web kamera); okunan kod `CP-…-Pn` → rezervasyon eşleştirilir.
- Çevrimdışı kuyruk (`queue.ts`): olay ağ yoksa `localStorage` kuyruğuna (idempotency anahtarıyla) alınır, UI "bekliyor" gösterir; bağlantıda sırayla gönderilir, sunucu teyidinden önce "tamam" sayılmaz. Çevrimdışı simülasyon anahtarı vardır (demo).
- Teslimde e-POD sayfası (`carrier/Pod.tsx`): fotoğraf/imza yükleme + alıcı adı.

## 7. Entegrasyonlar
- **WMS** `POST /warehouse/integrations/wms/pallet-events`: palet olayını (`RECEIVED/LOADED/ARRIVED/DELIVERED`) `wms_pallet_events`'e idempotent yazar; rezervasyonun **tüm** paletleri bildirilince aynı türde rezervasyon olayını mevcut `recordEvent` ile tetikler (durum makinesi tekrarlanmaz).
- **TMS** `POST /carrier/integrations/tms/trips`: `externalTripNo` (= `trips.reference`), tesis kodu, plaka ile sefer **taslak** oluşturur (`POST /carrier/trips` işleyicisi içeriden çağrılır); aynı numara tekrarında mevcut sefer döner.
- **EventBridge**: `audit_log` → `integration_cursors` imleciyle `cargopact-events` yoluna (`reservation.requested/approved/rejected/cancelled`, `warehouse.received/loaded`, `shipment.arrived/delivered/damaged`, `reservation.no_show`, `trip.*`). En az bir kez, kişisel veri yok. Kural `source=cargopact.api` olayları SQS `cargopact-wms-erp-subscriber` (+ DLQ) kuyruğuna yönlendirir (abone yedeği). Lambda (`integrations-worker`) dakikada bir tetiklenir; `GET /carrier/integrations/status` ve `POST …/events/flush` ile izlenir.
- Sefer düzenleme (`PUT /carrier/trips/{id}`, `If-Match`): kapasite bloke+onaylı altına inemez (409 `CAPACITY_BELOW_COMMITTED`); bekleyen talepler yeniden değerlendirilir, uygunsuz olan `needs_review` alır.

## 8. Gereksinimlerden sapmalar
| Konu | Gereksinim | Uygulama |
|---|---|---|
| Ölçüm | Palet ölçü/kg girilir, beyanla fark, uygunluk yeniden | Yok; depo kabulünde ölçüm alanı, fark ve inceleme kaydı yok |
| Palet kimliği | Palet başına kayıt + SSCC alanı | Rezervasyonda `pallet_codes`; SSCC yok; palet tablosu yok |
| Olay düzeyi | Palet bazlı olay ve sayaç | Rezervasyon düzeyi; palet bazı yalnız WMS entegrasyonunda |
| Fotoğraf | Kabulde fotoğraf | Yalnız teslimde e-POD |
| Alıcı yetkisi | Yetkili alıcı doğrulama, yetkisize ret | Alıcı adı kaydı; yetkili listesi yok |
| Varış penceresi uyarısı | Pencere dışı uyarı | Yok; pencere takipte gösterilir |
| Bildirim | Varışta alıcıya | Yok (olay yayınlanır) |
| Takip | Hasar/eksik palete bağlı | `EKSIK_HASAR` rezervasyon durumu |
| Canlı konum | Doğrulanmış kaynak varsa | Yok |
| İstisna kayıtları | Sorumlu, neden kodu, bildirim | Yok; yalnız `GELMEDI`, `EKSIK_HASAR` durumları |
| Raporlama | Planlanan/fiili ayrı | Var (`Capacity` alanları, dashboard) |
