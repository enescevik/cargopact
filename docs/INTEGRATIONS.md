# Entegrasyon katmanı: olay veri yolu, TMS ve WMS adaptörleri

## Mimari

```
API (denetim kaydı: audit_log) ──► Zamanlanmış işçi (rate 1 dk) ──► EventBridge `cargopact-events`
        ▲                                   │ imleç: integration_cursors              │ kural: source=cargopact.api
 TMS ─► POST /carrier/integrations/tms/trips │                                         ▼
 WMS ─► POST /warehouse/integrations/wms/pallet-events                  SQS `cargopact-wms-erp-subscriber` (+ DLQ)
```

Mevcut rotalara dokunulmaz. Her durum değişikliği zaten `audit_log` içine yazılır; işçi (`services/api/src/integrations-worker.ts`)
taşıyıcı başına yeni satırları okur, olaya çevirir ve yayınlar. Garanti: **en az bir kez**. Tüketici `detail.eventId` ile tekilleştirir.
Satırlar commit sırası farkı için 3 sn gecikmeyle okunur. Hata olursa imleç yalnız başarılı satıra kadar ilerler (`last_error` yazılır).
Hemen yayınlamak için `POST /carrier/integrations/events/flush`.

Kaynak: `cargopact.api`. Veri yolu: `cargopact-events`. Abone yedeği: SQS `cargopact-wms-erp-subscriber`, DLQ `cargopact-wms-erp-subscriber-dlq` (5 deneme).

## Olay kataloğu

| detail-type | Tetikleyen | Not |
|---|---|---|
| `trip.created` | sefer oluşturuldu (TMS dahil) | |
| `trip.published` / `trip.closed` / `trip.cancelled` | sefer durumu | |
| `reservation.requested` | müşteri talebi | |
| `reservation.approved` | taşıyıcı onayı | `orderNumber` dolu |
| `reservation.rejected` / `reservation.cancelled` | ret / iptal | kapasite bir kez iade edilir |
| `warehouse.received` | DEPO_KABUL | |
| `warehouse.loaded` | YUKLENDI | |
| `shipment.arrived` | VARISTA | |
| `shipment.delivered` | TESLIM | |
| `shipment.damaged` | EKSIK_HASAR | |
| `reservation.no_show` | GELMEDI | |

Ana veri değişiklikleri (tesis, araç vb.) yayınlanmaz. Kişisel veri, ödeme ayrıntısı ve serbest metin gerekçe **yoktur**.

### Örnek (SQS gövdesi = EventBridge zarfı)

```json
{
  "version": "0", "source": "cargopact.api", "detail-type": "reservation.approved",
  "time": "2026-11-25T10:15:02Z",
  "detail": {
    "eventId": "0b1f…", "version": 1, "carrierId": "…", "entityType": "reservation", "entityId": "…",
    "action": "reservation.approve", "tripId": "…", "orderNumber": "CP-2026-000123",
    "status": "ONAYLI", "correlationId": "…", "occurredAt": "2026-11-25T10:15:01.482Z"
  }
}
```

## TMS sefer adaptörü

`POST /carrier/integrations/tms/trips` (carrier_admin, carrier_planner)

```json
{ "externalTripNo": "TMS-2026-88123", "originCode": "DNC-GEB-TM", "destinationCode": "DNC-ANK-DM", "plate": "41DNC101",
  "plannedDeparture": "2026-12-10T15:00:00Z", "plannedArrival": "2026-12-10T23:00:00Z",
  "internalPallets": 10, "internalKg": 6000, "maxGrossKg": 24000 }
```

- Tesis kodu, plaka (boşluksuz, büyük harf eşleşir) taşıyıcı kayıtlarına eşlenir; bulunamazsa 400.
- Doğrulama ve araç çakışma kilidi `POST /carrier/trips` işleyicisinin kendisiyle yapılır (kopya mantık yok). Sefer **taslak** açılır; yayın planlamacıdadır.
- `reference = externalTripNo`. Aynı numara tekrar gelirse 200 ve `created:false` ile mevcut sefer döner. Başka taşıyıcıda kullanımdaysa 409.
- Satışa açık kapasite: araç pozisyonu − iç palet; kg: azami brüt − iç kg; m³ varsayılan hacim. Taban fiyat: aynı hattın son seferi, yoksa 1000,00 TRY (TMS fiyat göndermez).

Pilotta: TMS planlama çıktısı her sefer için bu uca (API anahtarı yerine Cognito istemci kimliği, machine-to-machine) gönderir.

## WMS palet adaptörü

`POST /warehouse/integrations/wms/pallet-events` (carrier_admin, carrier_planner, carrier_warehouse; yalnız sahip taşıyıcı)

```json
{ "palletCode": "CP-2026-000123-P1", "eventType": "RECEIVED", "occurredAt": "2026-12-10T12:05:00Z" }
```

| WMS | Rezervasyon olayı |
|---|---|
| RECEIVED | DEPO_KABUL |
| LOADED | YUKLENDI |
| ARRIVED | VARISTA |
| DELIVERED | TESLIM (**kabul edilmez**, aşağıya bakın) |

- Palet olayı `wms_pallet_events` tablosuna (palet + tür tekil) yazılır; aynı okutma çift sayılmaz.
- **Tüm paletler** bildirildiğinde rezervasyon düzeyi geçiş mevcut durum makinesine (`POST /carrier/reservations/{id}/events` işleyicisi) devredilir. Yanıt `palletsSeen/palletsTotal` ve `transitioned` verir. Zaman sınırı ve geçersiz geçiş kuralları orada uygulanır (409).
- Bilinmeyen/başka taşıyıcıya ait palet: 404.
- **DELIVERED → 409 `RECIPIENT_CHECK_REQUIRED`:** teslim yetkisi palet kodundan ayrı doğrulanır. WMS teslim bildirimi alıcı adı + müşterinin 6 haneli teslim kodu kontrolünü atlayamaz; teslim yalnız `POST /carrier/reservations/{id}/events` (`type=TESLIM`, `recipientName`, `pickupCode`) ile kaydedilir. WMS tarafında DELIVERED palet olayı da saklanmaz.

## Durum

`GET /carrier/integrations/status` → `{ bus, source, lastPublishedAt, publishedCount, lastError, queueDepth }`.
`queueDepth` şimdilik `null` (API'de SQS istemcisi paketlenmedi); kuyruk derinliği AWS konsolu/CLI ile okunur.

## Bilinen eksikler

- Olay yayını denetim kaydı yoklamasıdır (en çok ~1 dk gecikme); işlem içi "outbox" değildir.
- WMS ölçüm farkı, EKSIK_HASAR ve GELMEDI olayları WMS adaptöründe yok (yalnız dört palet olayı).
- Abone gerçek bir WMS/ERP değil, SQS kuyruğudur. Gerçek abone için aynı kurala hedef eklenir (API destination / Lambda).
- Adaptörler kullanıcı JWT'si ile çalışır; pilotta servis hesabı gerekir.
