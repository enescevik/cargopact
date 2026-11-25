# Design – Ödeme ve İptal
Gerçekleşen uygulama: `services/api/src/routes/demo.ts` (`decide`, `cancelCore`, `recordEvent`), `services/api/src/lib/trips.ts` (`addLedger`, `paymentView`), `packages/domain/src/cancellation.ts`. Karar: simüle sağlayıcı (steering `decisions.md` #4, #5).

## 1. Kapsam
Provizyon, tahsilat, iade, iptal ücreti ve defter. Gerçek sağlayıcı yok; kart bilgisi saklanmaz (yalnız son 4 hane idempotency gövdesine girer).

## 2. Veri modeli (migrasyon 0034, 0042)
`ledger_entries`: `id`, `reservation_id` (FK), `type` CHECK (`AUTHORIZED`, `CAPTURED`, `RELEASED`, `REFUNDED`, `RETAINED`, `FAILED`), `amount_minor bigint ≥ 0`, `reason`, `idempotency_key` (**UNIQUE**), `is_demo`, `created_at`. Yalnız ekleme; güncelleme/silme kodu yok. `reservations.payment_plan` (`full`/`deposit`) ve `deposit_percent` (30) rezervasyon anında satıra yazılır. Para birimi ve `correlationId` kolonu yoktur (TRY varsayılır; korelasyon `audit_log` üzerinde).
`RELEASED` (provizyon serbest bırakma) requirements'taki tipe eklendi.

## 3. Ödeme akışı (gerçekleşen)
| Adım | Tetik | Defter |
|---|---|---|
| Talep | `POST /customer/reservations` | `AUTHORIZED`: `full` → toplam, `deposit` → `floor(toplam × %30)` (`<id>:AUTHORIZED`) |
| Onay | `decision approve` | `CAPTURED` = provizyon tutarı (`<id>:CAPTURED:approve`) |
| Depo kabulü | olay `DEPO_KABUL` | `deposit` planında kalan (`toplam − tahsil`) için `CAPTURED` (`<id>:CAPTURED:intake`); `full` planında yok |
| Ret / süre aşımı / onay öncesi iptal | | `RELEASED` = provizyon (`<id>:RELEASED`) |
| Onaylı müşteri iptali | `cancel` | `REFUNDED` = `floor(tahsil × yüzde)`, kalan `RETAINED` |
| Taşıyıcı sefer iptali | `trips/{id}/status cancel` | tam `REFUNDED` (tahsil edilen), `RETAINED` yok |
| Gelmeme | olay `GELMEDI` (yalnız T−1 sonrası) | iade %0 → tahsilatın tamamı `RETAINED` |
Bakiye ve ödeme durumu (`authorized/captured/partially_captured/refunded/released/failed`, `paidMinor`, `refundedMinor`, `retainedMinor`, `dueMinor`) `paymentView` ile defterden **hesaplanır**; kayıtlı bakiye alanı yok (2.3).
Simüle sağlayıcı: kart `4000000000000002` → 400 `PAYMENT_DECLINED`, kapasite ve defter değişmez (istek işlemi geri alınır). Diğer geçerli kartlar başarılı. Zaman aşımı/tekrar deneme senaryoları yok.

## 4. İptal politikası
`cancellationRefund(departureAt, now, { approved, noShow })` (saf, birim testli):
- Onay öncesi: %100 serbest bırakma.
- Onay sonrası: kalkışa ≥24 saat %100; 24 saat–3 saat arası %50; 3 saatten az %0; gelmeme %0.
Tek, sabit politika; `CANCELLATION_POLICY_TABLE` quote yanıtında gösterilir. `GET …/cancel-preview` aynı fonksiyonla iade/ücreti önceden hesaplar; müşteri `cancel` çağırarak onaylar.

## 5. Çift işlem koruması
- Ledger `idempotency_key` UNIQUE + `ON CONFLICT DO NOTHING`; anahtarlar rezervasyon kimliği + işlem türünden türer, tekrar çalışma ikinci kayıt üretmez.
- Kapasite iadesi durum geçişine bağlıdır (iptal yalnız `TASIYICI_ONAYI_BEKLIYOR`/`ONAYLI`'dan); ikinci çağrı `IPTAL`'de mevcut sonucu döner. Smoke: "müşteri iptali: IPTAL, tekrar aynı, kapasite bir kez iade".
- Tüm yazma uçları `Idempotency-Key` ister.

## 6. API
`POST /customer/reservations` (kart gövdesi + `paymentPlan`), `GET /customer/reservations/{id}/cancel-preview`, `POST …/cancel`, `POST /carrier/reservations/{id}/decision`, `POST /carrier/reservations/{id}/events`, `POST /carrier/trips/{id}/status`. Ödeme özeti `Reservation.payment` içinde (`entries[]` ile).

## 7. Gereksinimlerden sapmalar
| Konu | Gereksinim | Uygulama |
|---|---|---|
| Ödeme planı | Taşıyıcı seçer, (a)(b)(c) | Müşteri `full` veya `deposit` seçer; kapora %30 sabit (`DEPOSIT_PERCENT`); (c) teslimde ödeme yok |
| Kalan tahsilat | T−1 öncesi | Depo kabulünde (`DEPO_KABUL`) otomatik tahsil |
| İlk tahsilat | Onayda talep | Talepte provizyon, onayda tahsilat |
| Politika | Taşıyıcı bazlı tablo, siparişe sabitlenir | Tek sabit politika (kod); siparişe sabitlenmez |
| `ODEME_BEKLIYOR` | Ödemesiz onay + süre sonu iptali | Yok; ödeme talep anında zorunlu, onay hep tahsilatlıdır |
| Sağlayıcı arayüzü | `PaymentProvider` soyutlaması | Soyutlama yok; simülasyon route içinde |
| Defter alanları | para birimi, correlationId | Yok |
| Taşıyıcı yeniden planlama, hasar/eksik iadesi | Müşteri ücretsiz kabul/iptal; palet bazlı kısmi iade | Yok (yalnız taşıyıcı sefer iptali tam iade); `EKSIK_HASAR` yalnız durum olayı, talep/iade kaydı yok |
| Mutabakat | Defter ↔ durum karşılaştırma işi | Yok |
