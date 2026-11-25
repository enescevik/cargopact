# Design – Kapasite Yayını ve Dinamik Fiyat

Temel kurallar (DSQL kısıtları, kiracı kapsamı, idempotency, denetim, hata modeli) için `../platform-foundation/design.md`, tesis/araç/ambalaj için `../master-data-and-seed/design.md`.

## 1. Kapsam ve sınırlar
- Bu spec: sefer (trip) yaşam döngüsü, kapasite sayaçları, uygunluk, dinamik fiyat, teklif (quote) ve müşteri sefer araması.
- Kapasiteyi **değiştiren** işlemler (blokaj, onay, ret, süre aşımı, iptal) `reservation-and-approval` spec'indedir. Bu spec onların kullanacağı sayaç tablosunu ve `applyCapacityDelta` fonksiyonunu sağlar.
- Fiziksel yükleme (fiili palet) `warehouse-and-tracking` spec'inde `loaded_*` sayacını günceller.

## 2. Eşzamanlılık modeli (doğrulanmış)
DSQL snapshot isolation ve iyimser eşzamanlılık (OCC) kullanır; yalnız aynı satıra yazma çakışmaları (ve `SELECT ... FOR UPDATE`) commit anında `40001` üretir. Farklı satırlar ekleyen iki işlem birbirini görmez (write skew mümkündür). [AWS: Concurrency control in Aurora DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/working-with-concurrency-control.html)

Sonuç olarak her değişmez, tek bir "kilit satırı" üzerinden korunur:

| Değişmez | Kilit satırı | Mekanizma |
|---|---|---|
| Sefer kapasitesi aşılmaz | `trip_capacity` (sefer başına 1 satır) | Kapasiteyi değiştiren her işlem bu satırı `UPDATE` eder |
| Bir araç çakışan iki sefere atanmaz | `vehicles` satırı | Sefer oluşturma/araç değişikliği aracı `SELECT ... FOR UPDATE` ile okur |
| Satış kapasitesi bloke+onaylı'nın altına düşmez | `trip_capacity` | Sefer güncellemesi ve rezervasyon aynı satırı yazar |

Gerçek DSQL'de "son kapasite için 6 eşzamanlı istekten 1 kazanan" testi zaten geçti (platform-foundation entegrasyon testi). Bu spec aynı testi gerçek tablolarla ve araç çakışması için tekrarlar.

## 3. Veri modeli

```sql
pricing_policies(
  carrier_id uuid not null references tenants(id),
  code text not null,                                  -- unique(carrier_id, code)
  name text not null,
  base_price_minor bigint not null check (base_price_minor > 0),   -- palet başı taban (kuruş)
  floor_ratio numeric(4,3) not null default 0.800,      -- alt sınır = taban × floor_ratio
  ceiling_ratio numeric(4,3) not null default 1.500,    -- üst sınır = taban × ceiling_ratio
  demand_tiers jsonb not null,    -- [{"minUtilization":0,"multiplier":1.00},{"minUtilization":0.5,"multiplier":1.10},...]
  time_tiers jsonb not null,      -- [{"maxHoursToCutoff":24,"multiplier":0.95},{"maxHoursToCutoff":6,"multiplier":0.85}]
  time_decay_max_utilization numeric(4,3) not null default 0.600, -- doluluk bunun üstündeyse zaman indirimi yok
  rounding_minor bigint not null default 1000,          -- 10 TL'ye yuvarla
  quote_ttl_minutes int not null default 15 check (quote_ttl_minutes between 1 and 120),
  status text not null default 'active', version int not null default 1, is_demo boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
)

trips(
  carrier_id uuid not null references tenants(id),
  reference text not null,                              -- unique(carrier_id, reference); TMS sefer no veya üretilen "DNC-20261126-001"
  origin_facility_id uuid not null references facilities(id),
  destination_facility_id uuid not null references facilities(id),
  vehicle_id uuid not null references vehicles(id),
  pricing_policy_id uuid not null references pricing_policies(id),
  departure_at timestamptz not null,
  arrival_eta timestamptz not null,                     -- departure_at < arrival_eta
  booking_cutoff_at timestamptz not null,               -- = departure_at − 3h (türetilir, saklanır: sorgu ve indeks için)
  intake_cutoff_at timestamptz not null,                -- = departure_at − 1h
  pickup_window jsonb,                                  -- varış alım penceresi; boşsa varış tesisinin varsayılanı
  -- Araç ve iç yük
  total_positions int not null,                         -- araç tipinden kopyalanır (değişirse sürüm artar)
  internal_pallets int not null check (internal_pallets >= 0),
  internal_kg int not null check (internal_kg >= 0),
  buffer_pallets int not null default 0 check (buffer_pallets >= 0),
  max_gross_kg int not null,                            -- sefer azami yükü (≤ araç tipinin azami yükü)
  -- Satışa açılan
  sellable_pallets int not null check (sellable_pallets >= 0),
  sellable_kg int not null check (sellable_kg >= 0),
  sellable_m3 numeric(6,2) not null check (sellable_m3 >= 0),
  accepts_unpalletized boolean not null default false,  -- MVP'de daima false (karar #9)
  status text not null check (status in ('draft','published','closed','departed','completed','cancelled')),
  capacity_version int not null default 1,              -- araç/kapasite değişikliğinde artar
  version int not null default 1, is_demo boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (origin_facility_id <> destination_facility_id),
  check (internal_pallets + buffer_pallets + sellable_pallets <= total_positions)
)

trip_capacity(                                          -- sıcak satır: kapasiteyi değiştiren her işlem bunu yazar
  trip_id uuid primary key references trips(id),
  carrier_id uuid not null,                             -- kiracı filtresi için kopya
  held_pallets int not null default 0, held_kg int not null default 0, held_m3 numeric(6,2) not null default 0,
  confirmed_pallets int not null default 0, confirmed_kg int not null default 0, confirmed_m3 numeric(6,2) not null default 0,
  loaded_pallets int not null default 0, loaded_kg int not null default 0,
  updated_at timestamptz not null default now(),
  check (held_pallets >= 0 and held_kg >= 0 and held_m3 >= 0),
  check (confirmed_pallets >= 0 and confirmed_kg >= 0 and confirmed_m3 >= 0)
)

quotes(
  customer_id uuid not null references tenants(id),
  trip_id uuid not null references trips(id),
  carrier_id uuid not null,
  capacity_version int not null,                        -- teklif anındaki sürüm; değişirse kabul reddedilir
  pallet_count int not null check (pallet_count > 0),
  packaging_type_id uuid not null references packaging_types(id),
  pallet_height_mm int not null,
  gross_kg int not null check (gross_kg > 0),
  volume_m3 numeric(6,2) not null check (volume_m3 > 0),
  product_class_id uuid not null references product_classes(id),
  unit_price_minor bigint not null, total_price_minor bigint not null, currency text not null default 'TRY',
  price_breakdown jsonb not null,                       -- taban, talep/zaman katsayısı, kırpma, yuvarlama, doluluk
  priced_at timestamptz not null,
  expires_at timestamptz not null,                      -- min(priced_at + ttl, booking_cutoff_at)
  status text not null default 'open' check (status in ('open','accepted','expired')),
  is_demo boolean not null default false, created_at timestamptz not null default now()
)
```

**İndeksler (ASYNC):** `trips(carrier_id, departure_at)`, `trips(status, booking_cutoff_at)`, `trips(origin_facility_id, departure_at)`, `trips(vehicle_id, departure_at)`, `quotes(customer_id, created_at)`, `quotes(trip_id)`; benzersiz `trips(carrier_id, reference)`, `pricing_policies(carrier_id, code)`.

**Türetilmiş değerler:**
```
satışa açık − (bloke + onaylı) = kalan          (palet, kg, m³ ayrı ayrı)
planlanan palet doluluğu = internal_pallets + confirmed_pallets   (bloke ayrı gösterilir)
fiili palet doluluğu     = internal_pallets + loaded_pallets
toplam brüt kg (planlanan) = internal_kg + held_kg + confirmed_kg
```
Satış doluluğu (fiyat için) = `(held_pallets + confirmed_pallets) / sellable_pallets`.

## 4. Sefer yaşam döngüsü

```
draft ──publish──> published ──close (satışı durdur)──> closed ──depart──> departed ──complete──> completed
  │                   │  ▲                                  │
  └──cancel──>     cancelled (bekleyen/onaylı rezervasyonlar reservation/payments spec'lerinde iade akışına girer)
                      └─ reopen (closed → published, yalnız booking_cutoff_at geçmediyse)
```
- `published` dışında hiçbir durumda yeni teklif verilmez ve aramada görünmez.
- `booking_cutoff_at` geçtiğinde sefer durum değiştirmeden aramadan düşer (sorgu koşulu); ayrıca durum yazılmaz (zamanlayıcı gerekmez).
- `departed`/`completed` geçişleri warehouse spec'inde depo olaylarıyla yapılır; bu spec yalnız durum alanını ve izinli geçiş tablosunu tanımlar.

### Doğrulamalar (yayın ve güncelleme)
1. Çıkış tesisi `transfer_center|both`, varış tesisi `distribution_center|both`, ikisi de aktif ve aynı taşıyıcının.
2. Araç aktif (`maintenance`/`inactive` değil), aynı taşıyıcının; tipi aktif.
3. `total_positions = vehicle_type.pallet_positions`; `max_gross_kg ≤ vehicle_type.max_payload_kg`; `internal_kg + sellable_kg ≤ max_gross_kg`; `sellable_m3 ≤ vehicle_type.cargo_volume_m3`.
4. `internal_pallets + buffer_pallets + sellable_pallets ≤ total_positions` (gereksinim 1.2).
5. `departure_at > now()`; yayın için `booking_cutoff_at > now()`.
6. Araç çakışması: aynı araçta `status in (draft,published,closed,departed)` olan ve `[departure_at, arrival_eta)` aralığı kesişen başka sefer yoksa geçer. Kontrol, işlemde araç satırı `SELECT ... FOR UPDATE` ile okunduktan sonra yapılır (§2).
7. Güncellemede satışa açık miktar, `held + confirmed` altına inemez (her boyut). İnerse 409 `CAPACITY_BELOW_COMMITTED`.
8. Araç, `total_positions`, `max_gross_kg` veya `sellable_*` değişirse `capacity_version` artar. Bekleyen taleplerin yeniden değerlendirilmesi reservation spec'inde bu sürüm üzerinden yapılır (gereksinim 1.4).

## 5. Uygunluk (packages/domain, saf fonksiyon)

```ts
checkEligibility(trip, capacity, request, ctx) → { eligible: boolean, reasons: Reason[] }
```
Tüm kurallar değerlendirilir ve başarısız olanların hepsi döner (ilki değil). Neden kodları:

| Kod | Kural |
|---|---|
| `TRIP_NOT_PUBLISHED` | sefer `published` değil |
| `BOOKING_CUTOFF_PASSED` | `now > booking_cutoff_at` (sınır dahil izinli) |
| `INSUFFICIENT_PALLETS` | istenen > kalan palet |
| `INSUFFICIENT_KG` | istenen > kalan satış kg |
| `MAX_GROSS_EXCEEDED` | `internal_kg + held_kg + confirmed_kg + istenen > max_gross_kg` |
| `INSUFFICIENT_VOLUME` | istenen m³ > kalan m³ |
| `PRODUCT_CLASS_NOT_ACCEPTED` | taşıyıcı sınıfı kabul etmiyor (`carrier_product_classes.accepted=false`) |
| `PALLET_TYPE_NOT_ALLOWED` | ambalaj tipi palet değil (koli doğrudan kabul edilmez; karar #9) |
| `PALLET_TOO_TALL` | palet yüksekliği > palet tipinin azami yüksekliği veya araç iç yüksekliği |
| `PALLET_TOO_HEAVY` | `gross_kg / pallet_count > palet tipi max_gross_kg` |

Plandaki örnek: Başkent Nakliye 3 palet / 2.600 kg → `MAX_GROSS_EXCEEDED` (17.000 + 1.500 + 1.200 + 2.600 = 22.300 > 22.000) ve `INSUFFICIENT_KG` (kalan 2.300). Kapasite değişmez.

Hacim girilmezse `volume_m3 = pallet_count × (palet taban alanı × palet yüksekliği)` olarak hesaplanır ve müşteriye gösterilir.

## 6. Dinamik fiyat (packages/domain, saf fonksiyon)

```ts
priceQuote(policy, trip, capacity, palletCount, now) → { unitPriceMinor, totalPriceMinor, breakdown }
```
1. `utilization = (held_pallets + confirmed_pallets) / sellable_pallets` (sellable 0 ise uygun değil).
2. `demandMult` = `demand_tiers` içinde `minUtilization ≤ utilization` olan en yüksek basamak.
3. `hoursToCutoff = (booking_cutoff_at − now) / 1 saat`. `timeMult` = `maxHoursToCutoff ≥ hoursToCutoff` olan **en küçük** eşiğin çarpanı (yoksa 1.0). `utilization > time_decay_max_utilization` ise `timeMult = 1.0` (gereksinim 4.3).
4. `raw = base × demandMult × timeMult`; `[base × floor_ratio, base × ceiling_ratio]` aralığına kırp; `rounding_minor`'a en yakın değere yuvarla (yarım yukarı).
5. `total = unit × palletCount`.
6. Breakdown: `{ basePriceMinor, utilization, demandMultiplier, hoursToCutoff, timeMultiplier, timeDecayApplied, clampedTo?: "floor"|"ceiling", roundedFromMinor, policyVersion }`.

Deterministiktir: aynı politika sürümü, kapasite sayaçları, palet adedi ve `now` aynı sonucu verir (gereksinim 4.4). Hesap kuruş tamsayısıyla, çarpanlar binde bir hassasiyetle yapılır.

**Varsayılan politika (placeholder, taşıyıcı değiştirebilir):** taban 1.100 TL/palet; talep basamakları 0→1,00 · 0,50→1,10 · 0,75→1,20 · 0,90→1,35; zaman basamakları ≤24 saat→0,95 · ≤12 saat→0,90 · ≤6 saat→0,85; zaman indirimi doluluk ≤ %60 iken; alt %80, üst %150; 10 TL yuvarlama; teklif geçerliliği 15 dk.

**Plan değerleriyle ilişki:** Plandaki 1.250 / 1.100 / 950 TL palet fiyatları farklı anlarda kilitlenmiş tekliflerdir. Seed (L2) bu siparişleri plan tutarlarıyla, geçmiş teklif kaydı olarak yazar; formülün bugün aynı rakamları üretmesi beklenmez. Toplam 8.800 TL jüri gösterimi korunur.

## 7. Teklif (quote)
- `GET /customer/trips/{id}/quote-preview?...`: fiyat ve uygunluğu hesaplar, **hiçbir şey yazmaz** (gereksinim 4.6).
- `POST /customer/quotes` (Idempotency-Key): uygunsa `quotes` satırı yazar (`status=open`, `expires_at = min(now + ttl, booking_cutoff_at)`), kapasite değiştirmez. Uygun değilse 422 değil **200 + `eligible:false` + reasons** döner ve satır yazmaz (ekranda ret gerekçesi göstermek için; teklif hata değildir).
- Teklif kabulü (blokaj) reservation spec'indedir; orada `capacity_version` ve `expires_at` kontrol edilir (gereksinim reservation 1.2). Teklif fiyatı blokaj boyunca sabittir.
- Müşteri yalnız kendi tekliflerini görür.

## 8. Sefer araması (müşteri)
`GET /customer/trips?originCity=&destinationCity=&originFacilityId=&date=YYYY-MM-DD&pallets=&grossKg=&volumeM3=`
- Koşullar: `status='published'`, `booking_cutoff_at ≥ now`, taşıyıcı kiracısı `active`, `date` İstanbul saatine göre kalkış günü, kalan palet ≥ istenen.
- Her sonuç: sefer referansı, taşıyıcı adı, çıkış/varış tesisi (ad, şehir, adres, çalışma saatleri, kabul/alım penceresi), kalkış, tahmini varış, `bookingCutoffAt`, `intakeCutoffAt`, kalan palet/kg/m³, palet başı ve toplam fiyat (istenen palet adediyle), uygunluk özeti.
- **Gizlilik:** müşteri araması diğer müşterilerin firma adını, rezervasyonunu veya öncelik sırasını içermez; yalnız toplam kalan kapasite gösterilir.
- Arama kapasite ve fiyat durumunu değiştirmez; sonuçlardaki fiyat önizlemedir (gereksinim 3.2).
- Sayfalama `departure_at, id` imleciyle.

## 9. API

| Yöntem | Yol | Rol |
|---|---|---|
| GET/POST | `/carrier/pricing-policies` · GET/PUT/PATCH(status) `/{id}` | okuma: taşıyıcı rolleri · yazma: carrier_admin |
| GET/POST | `/carrier/trips` (POST = draft) | okuma: taşıyıcı rolleri · yazma: carrier_admin, carrier_planner |
| GET/PUT | `/carrier/trips/{id}` (If-Match) | aynı |
| POST | `/carrier/trips/{id}/publish` · `/close` · `/reopen` · `/cancel` (Idempotency-Key, If-Match) | carrier_admin, carrier_planner |
| GET | `/carrier/trips/{id}/capacity` | taşıyıcı rolleri, admin_viewer |
| GET | `/customer/trips` | customer_user (aktif firma) |
| GET | `/customer/trips/{id}/quote-preview` | customer_user |
| POST/GET | `/customer/quotes` · GET `/customer/quotes/{id}` | customer_user |

Plandaki `POST /operations/trips/{id}/publish` yolu, platform tasarımındaki `/carrier/*` önekine taşındı.

`GET /carrier/trips/{id}/capacity` yanıtı jüri ekranına da hizmet eder: üç boyut için satışa açık, bloke, onaylı, fiili, kalan; planlanan ve fiili palet doluluğu (`25/33` gibi) ayrı alanlar.

Tüm uçlar OpenAPI'ye (`API_OPERATIONS`) eklenir; yönlendirici=belge testi ve canlı sözleşme testi kapsar.

## 10. Kapasite değişiklik arayüzü (reservation spec'i kullanır)
```ts
applyCapacityDelta(c: PoolClient, tripId, carrierId, delta: { held?: Dim; confirmed?: Dim; loaded?: Dim }) → Capacity
```
- Tek `UPDATE trip_capacity ... RETURNING *` ile uygulanır; ardından sonuç `sellable` ile karşılaştırılır; aşım varsa `CapacityExceededError` fırlatılır ve işlem geri alınır. `CHECK` kısıtları negatif değeri DB'de de engeller.
- Aynı işlem içinde çağrılır; OCC çakışmasında `withTx` tüm işlemi yeniden dener (yeniden okuma ile).

## 11. Seed L2 (bu spec'in parçası)
Tarihler çalıştırma anına göre göreli (`anchor` = bugün 00:00 İstanbul).

| Sefer | Rota | Kalkış | Durum | Amaç |
|---|---|---|---|---|
| DNC-DEMO-GEB-ANK | Gebze TM → Ankara DM | yarın 18:00 | published | Plan senaryosu: 33 poz., 25 iç palet, 17.000 kg iç yük, azami 22.000 kg, satışa 8 palet / 5.000 kg / 12 m³ |
| DNC-GEB-BRS | Gebze → Bursa | yarın 20:00 | published | boş kapasite, kamyon |
| DNC-KMP-KNY | Kemalpaşa → Konya | 2 gün sonra 17:00 | published | uzun ufuk (zaman indirimi yok) |
| DNC-GEB-ADN | Gebze → Adana | bugün +5 saat | published | T−3 yaklaşırken zaman indirimi |
| DNC-GEB-KNY-CUT3 | Gebze → Konya | şimdi +2 saat | published | T−3 geçmiş: aramada görünmez |
| DNC-KMP-ANK-DRAFT | Kemalpaşa → Ankara | 3 gün sonra | draft | taslak |
| SVA-CRK-IZM | Çerkezköy → İzmir | yarın 19:00 | published | ikinci taşıyıcı, KIRILGAN kabul |
| SVA-MRS-GZT | Mersin → Gaziantep | yarın 16:00 | published | kamyonet, dar kapasite |
| SVA-CRK-ANK-PAST | Çerkezköy → Ankara | dün 18:00 | completed | geçmiş sefer |

Her taşıyıcıya bir varsayılan fiyat politikası. Rezervasyonlu doluluk durumları (yarı dolu, dolu, 3+2+3) reservation spec seed'inde eklenir, çünkü sayaçlar rezervasyon kayıtlarıyla tutarlı olmalı (`seed:verify` kontrol eder: `trip_capacity` = rezervasyon toplamları).

## 12. Test
- **Domain birim:** uygunluk (her neden kodu, plan reddi, sınır anı dahil), fiyat (her basamak, zaman indirimi doluluk eşiğinde kapanır, kırpma, yuvarlama, determinizm), kesim saatleri.
- **Entegrasyon (gerçek DSQL):** aynı araca eşzamanlı iki sefer → yalnız biri; `applyCapacityDelta` ile eşzamanlı son kapasite → yalnız biri; satışı onaylının altına indirme 409.
- **Smoke (deploy):** sefer oluştur → yayınla → müşteri arar → önizleme kapasiteyi değiştirmez → teklif yazılır, kapasite değişmez → Siva Dinçer seferini göremez/değiştiremez → T−3 geçmiş sefer aramada yok → bakımda araçla sefer 400 → plan reddi gerekçeleri.

## 13. Riskler
| Risk | Önlem |
|---|---|
| Sıcak `trip_capacity` satırında çok çakışma | İşlemler kısa; jitter'lı yeniden deneme; demo ölçeğinde sorun değil. Yüksek hacimde kapasite "dilimlere" bölünebilir (sonra). |
| Fiyat politikası değişirse açık teklifler | Teklif fiyatı satırda kilitli; politika sürümü breakdown'da. |
| Saat dilimi hataları (gün sınırı) | Arama tarihi İstanbul saatine göre `[gün 00:00, ertesi gün 00:00)` UTC aralığına çevrilir; testli. |
