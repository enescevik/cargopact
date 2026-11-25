# CargoPact Demo API Sözleşmesi (sunum dikey dilimi)

Bu belge backend, web, mobil ve ajan işlerinin ORTAK sözleşmesidir. Alan adları ve biçimler birebir uygulanır.
Taban URL: `https://765h182ijf.execute-api.us-east-1.amazonaws.com` (env: web `VITE_API_URL`, mobil `EXPO_PUBLIC_API_URL`).

## Ortak kurallar
- Kimlik: `Authorization: Bearer <Cognito ID token>`. Cognito: User Pool `us-east-1_6KUOjpqWj`, Client `72hnkn87h160or9j2ilo8f8dhl` (USER_PASSWORD_AUTH ve SRP açık).
- Tüm POST/PUT/PATCH istekleri `Idempotency-Key: <uuid>` başlığı ister (her kullanıcı eylemi için yeni uuid; aynı eylemin tekrarı aynı anahtarı kullanır).
- Hata gövdesi: `{ code, message, correlationId, details? }`. Kodlar: VALIDATION_ERROR 400, UNAUTHENTICATED 401, FORBIDDEN 403, NOT_FOUND 404, CONFLICT 409, IDEMPOTENCY_MISMATCH 422. Ek iş kodları `details.reason` içinde: `CAPACITY_EXCEEDED`, `BOOKING_CUTOFF_PASSED`, `PAYMENT_DECLINED`, `INVALID_TRANSITION`.
- Para: `amountMinor` kuruş tamsayı (`375000` = 3.750,00 TL). Zaman: ISO 8601 UTC; ekranda `Europe/Istanbul` ile gösterilir.
- `GET /me` → `{ userId, email, displayName, memberships[], active: { tenantId, tenantType: "customer"|"carrier"|"platform", role, tenantStatus } }`. Rol `customer_user` ise müşteri arayüzü, `carrier_admin|carrier_planner|carrier_warehouse` ise transfer merkezi arayüzü açılır.

## Tipler

```ts
type Dim = { pallets: number; kg: number; m3: number };
type Facility = { id: string; code: string; name: string; city: string; district: string | null; address: string;
  intakeWindow: { from: string; to: string } | null; pickupWindow: { from: string; to: string } | null };
type Price = { unitPriceMinor: number; totalPriceMinor: number; currency: "TRY";
  breakdown: { basePriceMinor: number; utilization: number; demandMultiplier: number; hoursToCutoff: number;
               timeMultiplier: number; timeDecayApplied: boolean; clampedTo: "floor" | "ceiling" | null; explanation: string[] } };
type TripCard = {
  id: string; reference: string; carrier: { id: string; name: string };
  origin: Facility; destination: Facility; vehicleType: { code: string; name: string; palletPositions: number };
  departureAt: string; arrivalEta: string; bookingCutoffAt: string; intakeCutoffAt: string;
  sellable: Dim; remaining: Dim; price: Price;      // price, istenen palet adediyle (varsayılan 1)
};
type Capacity = { totalPositions: number; internalPallets: number; internalKg: number; maxGrossKg: number;
  sellable: Dim; held: Dim; confirmed: Dim; loaded: { pallets: number; kg: number }; remaining: Dim;
  plannedPallets: number;   // internal + confirmed (bloke hariç)
  heldPallets: number;      // bilgi amaçlı ayrı
  actualPallets: number;    // internal + loaded
  plannedGrossKg: number }; // internal + held + confirmed kg
type CarrierTrip = TripCard & { status: "draft"|"published"|"closed"|"departed"|"completed"|"cancelled";
  vehicle: { id: string; plate: string }; capacity: Capacity; pendingCount: number };

type ReservationStatus = "TASIYICI_ONAYI_BEKLIYOR"|"ONAYLI"|"DEPO_KABUL"|"YUKLENDI"|"VARISTA"|"TESLIM"
                       | "SURESI_DOLDU"|"RET"|"IPTAL"|"EKSIK_HASAR"|"GELMEDI";
type LedgerEntry = { type: "AUTHORIZED"|"CAPTURED"|"RELEASED"|"REFUNDED"|"RETAINED"|"FAILED"; amountMinor: number; at: string; reason: string };
type Reservation = {
  id: string; reference: string;             // başvuru ref. "BV-7K2Q9D"
  orderNumber: string | null;               // onayda "CP-2026-000123"
  status: ReservationStatus; statusLabel: string;   // Türkçe etiket
  trip: TripCard;                           // price alanı rezervasyonun kilitli fiyatıyla
  customer: { id: string; name: string };
  pallets: number; grossKg: number; volumeM3: number; productClass: { code: string; name: string };
  unitPriceMinor: number; totalPriceMinor: number;
  paymentPlan: "full" | "deposit"; depositPercent: number;   // deposit: %30 şimdi, kalan T−1 öncesi (demo: onayda tahsil)
  payment: { status: "authorized"|"captured"|"partially_captured"|"refunded"|"released"|"failed";
             paidMinor: number; refundedMinor: number; retainedMinor: number; dueMinor: number; entries: LedgerEntry[] };
  holdExpiresAt: string | null; decisionReason: string | null; createdAt: string;
  events: { type: string; label: string; at: string; note: string | null }[];
  palletCodes: string[];                    // onayda üretilir: "CP-2026-000123-P1"
};
type CarrierReservation = Reservation & {
  priorityRank: number;                     // 1 = en öncelikli (gelmemesi olan firmalar sona)
  verifiedNoShows: number;                  // geriye uyumluluk; yalnız taşıyıcıya görünür
  customerHistory: {                        // yalnız taşıyıcıya görünür; mevcut/açık talep sayılmaz
    historicalReservationCount: number;     // sonuçlanmış geçmiş talepler
    verifiedNoShows: number;                // ONAYLI olup T−1'e kadar getirilmeyen yükler
  };
  eligibility: { eligible: boolean; reasons: { code: string; message: string }[] } };
type CustomerManagementItem = {
  id: string; name: string; tenantStatus: string;
  totalReservations: number; delivered: number; verifiedNoShows: number; cancelled: number; rejected: number; damaged: number; pending: number; active: number;
  score: number; category: "UYGUN"|"IZLENMELI"|"RISKLI"; evidenceCount: number; scoreExplanation: string;
  lastReservationAt: string; recentEvents: { type: string; label: string; at: string; reservationReference: string }[];
};
```

## Müşteri uçları (rol: customer_user, firma aktif)
| Yöntem | Yol | Gövde / sorgu | Yanıt |
|---|---|---|---|
| GET | `/customer/trips` | `?originCity=&destinationCity=&date=YYYY-MM-DD&pallets=` (hepsi opsiyonel) | `{ items: TripCard[] }` yalnız published ve T−3 geçmemiş |
| GET | `/customer/trips/{id}` | `?pallets=` | `TripCard` |
| POST | `/customer/trips/{id}/quote` | `{ pallets, grossKg, volumeM3?, productClassCode }` | `{ eligible, reasons[{code,message}], price: Price, bookingCutoffAt, intakeCutoffAt, quoteExpiresAt, paymentPlans: [{code:"full",label,dueNowMinor},{code:"deposit",label,depositPercent,dueNowMinor,remainingMinor}], cancellationPolicy: [{label, refundPercent}] }` — **hiçbir şey yazmaz** |
| PUT | `/customer/reservations/{id}/recipients` | `{ recipients: [{ name, phone? }] }` (en çok 3) | `Reservation`. TESLIM'e kadar düzenlenebilir. `Reservation.pickup = { code (yalnız müşteri; onaydan sonra), recipients[], hint (son 2 hane), locked }`; taşıyıcı yanıtında `code` yoktur |
| POST | `/customer/reservations` | `{ tripId, pallets, grossKg, volumeM3?, productClassCode, paymentPlan, recipientName?, card: { holder, number, expiry, cvc } }` | 201 `Reservation` (durum `TASIYICI_ONAYI_BEKLIYOR`, kapasite bloke, ödeme provizyon). Kart `4000000000000002` → 402 benzeri `VALIDATION_ERROR` + `details.reason=PAYMENT_DECLINED`. Kapasite yoksa 409 `CAPACITY_EXCEEDED`, uygunsuzsa 400 + reasons |
| GET | `/customer/reservations` | | `{ items: Reservation[] }` (yeni→eski) |
| GET | `/customer/reservations/{id}` | | `Reservation` |
| GET | `/customer/reservations/{id}/cancel-preview` | | `{ refundMinor, feeMinor, rule: string }` |
| POST | `/customer/reservations/{id}/cancel` | `{ reason? }` | `Reservation` (IPTAL, kapasite bir kez iade, iade/ücret defterde) |
| GET | `/customer/orders/{orderNumber}/tracking` | | `{ orderNumber, status, statusLabel, updatedAt, nextStep, steps: [{status,label,done,at}], origin, destination, intakeCutoffAt, pickupWindow, palletCodes }` (yalnız kendi firması; değilse 404) |
| GET | `/catalog/product-classes` | | mevcut (code: GENEL, GIDA-AMBALAJLI, KIRILGAN, TEHLIKELI) |

## Transfer merkezi uçları (rol: carrier_admin, carrier_planner; olaylar için carrier_warehouse da)
| Yöntem | Yol | Gövde | Yanıt |
|---|---|---|---|
| GET | `/carrier/customers` | | `{ items: CustomerManagementItem[] }`. Yalnız taşıyıcı admin/planlamacı; metrikler aynı taşıyıcıyla rezervasyon geçmişinden, skor deterministik hesaplanır. KB skoru üretmez. |
| GET | `/carrier/trips` | `?status=` | `{ items: CarrierTrip[] }` (kalkışa göre) |
| POST | `/carrier/trips` | `{ originFacilityId, destinationFacilityId, vehicleId, departureAt, arrivalEta, internalPallets, internalKg, maxGrossKg, sellablePallets, sellableKg, sellableM3, basePriceMinor, publish: boolean }` | 201 `CarrierTrip` ("Aracım var, yük ekle") |
| GET | `/carrier/trips/{id}` | | `CarrierTrip & { reservations: CarrierReservation[] }` (bekleyenler öncelik sırasıyla) |
| POST | `/carrier/trips/{id}/status` | `{ action: "publish"|"close"|"cancel" }` | `CarrierTrip` |
| POST | `/carrier/reservations/{id}/decision` | `{ decision: "approve"|"reject", reason? }` (ret için reason zorunlu) | `CarrierReservation`. Onay: uygunluk yeniden kontrol, sipariş no + palet kodları, ödeme tahsil (full: tamamı, deposit: %30). Ret: kapasite iade, provizyon serbest. Tekrar → aynı sonuç |
| POST | `/carrier/reservations/{id}/events` | `{ type: "DEPO_KABUL"|"YUKLENDI"|"VARISTA"|"TESLIM"|"EKSIK_HASAR"|"GELMEDI", note?, recipientName?, pickupCode?, podKeys? }` — **TESLIM için `recipientName` (yetkili alıcılardan biri; büyük/küçük harf ve aksan duyarsız) + `pickupCode` (6 hane) zorunlu**; yanlışsa 403 `details.reason=UNAUTHORIZED_RECIPIENT` (+`remainingAttempts`) ve denetim kaydı "Yetkisiz teslim denemesi"; 5 hatalı denemeden sonra 409 `PICKUP_LOCKED`; müşteri alıcı tanımlamamışsa 409 `NO_AUTHORIZED_RECIPIENT` | `CarrierReservation`. Sıra: ONAYLI→DEPO_KABUL (T−1'e kadar)→YUKLENDI (loaded sayacı artar)→VARISTA→TESLIM. GELMEDI yalnız ONAYLI'dan, T−1 sonrası; kapasite iade, iptal ücreti tutulur |
| GET | `/carrier/dashboard` | `?tripId=` (yoksa en yakın demo seferi) | `{ trip: CarrierTrip, grossRevenueMinor, variableCostMinor, contributionMinor, costPerPalletMinor: 20000, customers: [{ name, pallets, kg, totalMinor, status, statusLabel }], timeline: [{ at, label }] }` |
| GET | `/carrier/facilities`, `/carrier/vehicles` | | mevcut (`{items}`) |

## Demo verisi
- Demo seferi: `DNC-DEMO-GEB-ANK` Dinçer Gebze Transfer Merkezi → Dinçer Ankara Dağıtım Merkezi, yarın 18:00 (İstanbul). 33 pozisyon, 25 iç palet, 17.000 kg iç yük, azami 22.000 kg, satışa 8 palet / 5.000 kg / 12 m³. Başlangıçta rezervasyon yok (25/33).
- Jüri akışı: Marmara 3 palet 1.500 kg → onay (28/33); Anadolu 2 palet 1.200 kg → onay (30/33); Başkent 3 palet 2.600 kg → **uygunsuz** (`MAX_GROSS_EXCEEDED`, `INSUFFICIENT_KG`); Başkent 3 palet 1.900 kg → onay (33/33 planlanan); depo olaylarıyla 33/33 fiili.
- Diğer seferler: Gebze→Bursa, Kemalpaşa→Konya, Gebze→Adana (bugün, zaman indirimi), Siva Çerkezköy→İzmir, Siva Mersin→Gaziantep.

## Durum etiketleri (Türkçe)
TASIYICI_ONAYI_BEKLIYOR "Taşıyıcı onayı bekliyor" · ONAYLI "Onaylandı" · DEPO_KABUL "Çıkış deposunda kabul edildi" · YUKLENDI "Araca yüklendi" · VARISTA "Varışta teslime hazır" · TESLIM "Teslim edildi" · SURESI_DOLDU "Süresi doldu" · RET "Reddedildi" · IPTAL "İptal edildi" · EKSIK_HASAR "Eksik / hasar" · GELMEDI "Yük getirilmedi"

## Demo hesapları (parola: `Cargopact2026!`)
| Kanal | Rol | E-posta | Firma |
|---|---|---|---|
| Web | Müşteri | web.musteri@cargopact.example.test | Marmara Ambar |
| Web | Transfer merkezi yöneticisi | web.yonetici@cargopact.example.test | Dinçer Lojistik |
| Mobil | Müşteri | mobil.musteri@cargopact.example.test | Anadolu Parsiyel |
| Mobil | Transfer merkezi yöneticisi | mobil.yonetici@cargopact.example.test | Dinçer Lojistik |
| (yedek) | Müşteri | user@baskent.example.test | Başkent Nakliye |

## Depo ölçümü ve inceleme
- `POST /carrier/reservations/{id}/events` `{type:"DEPO_KABUL", measurement:{measuredPallets, measuredKg, measuredHeightMm?, note?}}`. Ölçüm `warehouse_measurements` tablosunda beyandan ayrı saklanır; yanıtta `measurement {declared, measured, diff, outcome}`.
- Kural: palet eşit ve kg farkı ≤ %3 → `ok` (kapasite değişmez). Beyandan az → `ok`, fark kapasiteden iade edilir. Beyandan fazla → uygunluk ölçülen değerle yeniden çalışır: uygunsa `ok` ve onaylı kapasite güncellenir; değilse durum `INCELEME` ("İncelemede – ölçüm farkı").
- Fiyat: kilitli birim fiyat korunur; toplam = birim × palet, yalnız palet adedi değişirse değişir (fazla ödeme tahsil, eksik palet iade edilir). Kg farkı fiyatı değiştirmez.
- `POST /carrier/reservations/{id}/review` `{decision:"accept_partial", acceptedPallets}` → `DEPO_KABUL` (kabul edilmeyen paletler için iade iptal politikasına göre, defter nedeni "Kısmi kabul…", palletCodes kırpılır, kapasite bir kez düşer) veya `{decision:"reject"}` → `RET_DEPO` ("Depoda reddedildi"; kapasite bir kez iade, iade politikaya göre).

## İstisnalar ve manifest (taşıyıcı)
- `GET /carrier/exceptions?status=open|resolved&tripId=` — mevcut verilerden hesaplanan iş kuyruğu (GELMEDI, EKSIK_HASAR, LATE_DROPOFF, NOT_PICKED_UP, NEEDS_REVIEW, MEASUREMENT_DIFF, EXPIRED_HOLD). `id = TÜR:rezervasyonId`.
- `POST /carrier/exceptions/{id}/resolve` `{note}` — idempotent; ilk not korunur, denetim kaydı yazılır.
- `GET /carrier/trips/{id}/manifest` — onaylı+ rezervasyonlar, palet kodları, alıcılar. Web: sefer detayında "Manifest" (yazdır).
- Smoke: `node scripts/smoke-exceptions.mjs`
