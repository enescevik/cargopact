# Design – Rezervasyon, Blokaj ve Taşıyıcı Onayı
Bu belge **gerçekleşen** uygulamayı anlatır (`services/api/src/routes/demo.ts`, `services/api/src/lib/trips.ts`, `packages/domain`). Genel kurallar için `../platform-foundation/design.md`, sefer ve kapasite için `../capacity-and-pricing/design.md`. Uygulama hackathon hızı için "demo dikey dilimi" olarak yazıldı; ortak sözleşme `docs/DEMO_API.md`.

## 1. Kapsam
- Müşteri teklifi kabul eder (talep + blokaj + simüle provizyon), taşıyıcı onaylar/reddeder, süre aşımı, müşteri iptali, takip sorgusu.
- Ödeme ayrıntısı `../payments-and-cancellation/design.md`, depo olayları `../warehouse-and-tracking/design.md`.

## 2. Veri modeli (migrasyon 0032, 0033, 0035, 0038–0041, 0052, 0053)
| Tablo | Önemli kolonlar |
|---|---|
| `reservations` | `customer_id`, `carrier_id`, `trip_id` (FK), `reference` (`BV-XXXXXX`, benzersiz), `order_number` (`CP-YYYY-NNNNNN`, benzersiz, onayda dolar), `status` (CHECK), `pallets`, `gross_kg`, `volume_m3`, `product_class_id`, `unit_price_minor`, `total_price_minor`, `price_breakdown jsonb`, `payment_plan` (`full`/`deposit`), `deposit_percent`, `hold_expires_at`, `decision_reason`, `recipient_name`, `pallet_codes jsonb`, `needs_review`, `pod_recipient_name`, `is_demo`, `version` |
| `reservation_events` | `reservation_id`, `type`, `note`, `actor_user_id`; `UNIQUE (reservation_id, type)` (her olay türü bir kez) |
| `order_counters` | `year` PK, `last_value`; sipariş numarası kaynağı |
| `trip_capacity` | `held_*`, `confirmed_*`, `loaded_*` sayaçları; kapasite kilit satırı |
| `idempotency_keys`, `audit_log` | platform-foundation |

Fiyat blokaj anında hesaplanıp `reservations` satırına yazılır; sonradan tarife/talep değişimi onaylı fiyatı etkilemez (2.5, 1.6). Ayrı `quotes` tablosu yoktur.

## 3. Durum makinesi
```
TASIYICI_ONAYI_BEKLIYOR ─onay→ ONAYLI ─→ DEPO_KABUL ─→ YUKLENDI ─→ VARISTA ─→ TESLIM
        │ ret → RET            │ iptal → IPTAL          YUKLENDI/VARISTA → EKSIK_HASAR
        │ süre → SURESI_DOLDU  │ T−1 sonrası → GELMEDI
        └ müşteri iptali → IPTAL
```
- Bekleyen talep: `decision` (onay/ret), müşteri iptali, süre aşımı. Onaylıdan müşteri iptali yalnız `ONAYLI` durumunda (DEPO_KABUL sonrası iptal yok). Taşıyıcı sefer iptali tüm aktif talepleri tam iadeyle `IPTAL` yapar; `YUKLENDI`/`VARISTA` paleti olan sefer iptal edilemez.
- Sapma: `TEKLIF` ve `YENIDEN_PLANLAMA` durumları uygulanmadı; teklif kalıcı değil (quote yazmaz). `GELMEDI` durumu eklendi (requirements'ta "gelmeme kaydı"). Sefer düzenlemesinde bekleyen talep `needs_review=true` bayrağı ve `YENIDEN_DEGERLENDIRME` olayı alır, durum değişmez.

## 4. Eşzamanlılık ve idempotency
- **Blokaj** (`POST /customer/reservations`): tek `UPDATE trip_capacity ... WHERE held+confirmed+talep <= satılabilir` (palet, kg, m³ ve azami brüt koşulları birlikte). `rowCount = 0` → 409 `CAPACITY_EXCEEDED`. İki eşzamanlı istek aynı satırı yazdığı için DSQL OCC (`40001`) biri bekletir/yeniden denetir (`withTx`); smoke testinde "son palet yarışı: yalnız biri kazanır" geçer.
- **Onay/ret/iptal/olay**: kapasite değişimi her zaman `adjustCap` (aynı `trip_capacity` satırı) ile; durum geçişi koşulu satır durumuna bağlı olduğundan tekrar işlem ikinci kez iade etmez. Ledger kayıtları `idempotency_key` (`<id>:RELEASED`, `<id>:CAPTURED:approve` …) ve `ON CONFLICT DO NOTHING` ile çift yazılmaz.
- **Sipariş numarası**: `order_counters` yıl satırı `INSERT … ON CONFLICT DO UPDATE last_value+1`; çakışma OCC ile yeniden denenir, işlem geri alınınca boşluk oluşmaz. Aynı onayın tekrarı `CONFIRMED_STATES` kontrolüyle mevcut numarayı döner.
- **HTTP idempotency**: tüm yazma uçları `Idempotency-Key` ister (`idempotent()`; aynı anahtar+gövde → kayıtlı yanıt, farklı gövde → 422).
- **Süre aşımı**: zamanlanmış iş yok; `expireHolds` tembel çalışır (rezervasyon oluşturma, onay, iptal, sefer güncelleme, müşteri sefer/teklif okumaları). `hold_expires_at < now` olan bekleyenler `SURESI_DOLDU` olur, held sayacı bir kez düşer, provizyon `RELEASED` yazılır. Blokaj süresi `min(now + 2 saat, T−3)`.

## 5. Uygunluk ve öncelik
- `checkEligibility` (packages/domain): yayın durumu, T−3 (`now > cutoff` reddeder, sınır dahil), palet, kg, azami brüt, m³, ürün sınıfı, palet başı 1.000 kg. Onayda sayaçtan talebin kendi blokajı çıkarılarak yeniden çalışır; uygunsuzsa 409 `NOT_ELIGIBLE`.
- Öncelik (`reservationViews`, taşıyıcı görünümü): bekleyen talepler sefer içinde `GELMEDI` durumlu kaydı olan firma sona, eşitlikte `created_at` artan. `priorityRank` ve `verifiedNoShows` yalnız taşıyıcı yanıtında; müşteri yanıtında yoktur. Yalnız `GELMEDI` sayılır; "sayılmayan" nedenler (zamanında iptal, taşıyıcı aksaması…) sayılmadığı için doğal olarak dışarıdadır, ama ayrı neden kodu alanı yoktur.

## 6. API
| Yöntem | Yol | Rol | Not |
|---|---|---|---|
| POST | `/customer/trips/{id}/quote` | customer_user | yazmaz; uygunluk, fiyat dökümü, ödeme planları, iptal tablosu |
| POST | `/customer/reservations` | customer_user | 201 `TASIYICI_ONAYI_BEKLIYOR`; 409 `CAPACITY_EXCEEDED`; 400 `BOOKING_CUTOFF_PASSED`/`NOT_ELIGIBLE`/`PAYMENT_DECLINED` |
| GET | `/customer/reservations`, `/{id}` | customer_user | yalnız kendi firması |
| GET/POST | `/customer/reservations/{id}/cancel-preview`, `/cancel` | customer_user | |
| GET | `/customer/orders/{orderNumber}/tracking` | customer_user | başka firma → 404 |
| GET | `/carrier/trips/{id}` | carrier_* | bekleyenler öncelik sırasıyla |
| POST | `/carrier/reservations/{id}/decision` | carrier_admin, carrier_planner | `approve`/`reject` (ret için `reason` zorunlu) |
Denetim: `reservation.create/approve/reject/cancel` `audit_log`'a yazılır. Olaylar ayrıca EventBridge'e yayınlanır (`reservation.requested/approved/rejected/cancelled`, bkz. warehouse-and-tracking §7).

## 7. Gereksinimlerden sapmalar
| Konu | Gereksinim | Uygulama |
|---|---|---|
| Teklif kabulü | Süresi dolmuş teklif / sefer sürümü değişimi reddedilir | Teklif kalıcı değil; kabulde fiyat ve uygunluk sunucuda yeniden hesaplanır, `quoteExpiresAt` yalnız bilgi |
| Müşteri bildirimi | Onayda müşteriye bildirim | Uygulama içi bildirim yok; durum takip/sipariş listesinde görünür, olay EventBridge'e gider |
| Planlamacı gerekçesi | Seçim gerekçesi denetim izine | Yalnız ret gerekçesi (`decision_reason`) saklanır; onayda gerekçe alanı yok |
| Neden kodları | Gelmeme sayılmayan nedenler ayrı kodlu | Ayrı kod yok; yalnız `GELMEDI` sayılır |
| Süre aşımı | Blokaj dolunca serbest bırakma | Tembel (okuma/yazma anında), zamanlayıcı yok |
| Ödeme | Onayda ilk tahsilat | Provizyon talepte, tahsilat onayda (payments spec) |
