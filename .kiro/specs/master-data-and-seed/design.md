# Design – Ana Veri ve Seed

Temel kurallar (DSQL kısıtları, kiracı kapsamı, migrasyon, idempotency, hata modeli) için bkz. `../platform-foundation/design.md`. Burada yalnız ana veri tabloları, API'ler, hesaplama kuralı ve seed tasarımı yer alır.

## 1. Veri modeli

Ortak alanlar: `id uuid pk`, `created_at`, `updated_at timestamptz`, `version int not null default 1` (iyimser sürüm), `is_demo boolean`. Durum alanı: `status text check (status in ('active','inactive'))`. Dizi kolonu yok; çoklu değerler `jsonb` veya alt tablo.

```sql
facilities(
  carrier_id uuid not null references tenants(id),
  code text not null,                     -- unique(carrier_id, code)
  name text not null,
  kind text not null check (kind in ('transfer_center','distribution_center','both')),
  city text not null, district text, address text not null,
  latitude numeric(9,6), longitude numeric(9,6),
  timezone text not null default 'Europe/Istanbul',
  opening_hours jsonb not null,           -- {"mon":[["08:00","20:00"]], ...}
  intake_window jsonb,                    -- çıkış kabul penceresi (günlük başlangıç/bitiş)
  pickup_window jsonb,                    -- varış alım penceresi
  daily_slot_limit int check (daily_slot_limit > 0),
  contact_name text, contact_phone text,
  status text not null default 'active'
)

vehicle_types(
  tenant_id uuid not null references tenants(id),     -- platform kiracısı = katalog
  code text not null,                                  -- unique(tenant_id, code)
  name text not null,
  pallet_positions int not null check (pallet_positions > 0),
  max_payload_kg int not null check (max_payload_kg > 0),
  cargo_volume_m3 numeric(6,2) not null check (cargo_volume_m3 > 0),
  inner_length_mm int, inner_width_mm int, inner_height_mm int,
  stackable boolean not null default false,            -- MVP'de daima false
  status text not null default 'active'
)

vehicles(
  carrier_id uuid not null references tenants(id),
  vehicle_type_id uuid not null references vehicle_types(id),
  plate text not null,                                 -- unique(carrier_id, plate), normalize: büyük harf, boşluksuz
  status text not null default 'active' check (status in ('active','maintenance','inactive')),
  driver_name text, driver_phone text
)

packaging_types(
  tenant_id uuid not null references tenants(id),
  code text not null,                                  -- unique(tenant_id, code)
  name text not null,
  kind text not null check (kind in ('pallet','carton','other')),
  length_mm int not null, width_mm int not null, height_mm int not null,
  max_gross_kg numeric(8,2) not null,
  usable_volume_m3 numeric(6,3),                       -- palet için: azami yükseklikte kullanılabilir hacim
  fill_factor numeric(3,2) check (fill_factor > 0 and fill_factor <= 1),
  stackable boolean not null default false,
  status text not null default 'active'
)

product_classes(
  tenant_id uuid not null references tenants(id),
  code text not null, name text not null,
  special_handling boolean not null default false,
  status text not null default 'active'
)

carrier_product_classes(
  carrier_id uuid not null references tenants(id),
  product_class_id uuid not null references product_classes(id),
  accepted boolean not null default true,
  primary key (carrier_id, product_class_id)
)
```

**İndeksler (hepsi `CREATE INDEX ASYNC`):** `facilities(carrier_id, status)`, `vehicles(carrier_id, status)`, `vehicle_types(tenant_id)`, `packaging_types(tenant_id, kind)`, benzersizler: `(carrier_id, code)`, `(carrier_id, plate)`, `(tenant_id, code)`.

**Silme yok, pasife alma:** FK'ler (doğrulandı: silmeyi engeller) referanslı kaydın silinmesini zaten bloklar; API `DELETE` yerine `status=inactive` yapar. Pasif tesis/araç yeni seferde seçilemez.

**Sefer–araç çakışması** (requirements 2.4) `trips` tablosu `capacity-and-pricing` spec'inde gelir; kural orada `vehicle_id` + zaman aralığı kontrolüyle uygulanır. Bu spec yalnız `vehicles.status='active'` garantisini verir.

## 2. Yetki
| Kaynak | customer_user | carrier_admin | carrier_planner / warehouse | platform_admin |
|---|---|---|---|---|
| facilities | yalnız ilgili sefer kapsamında okur (ad, adres, çalışma saatleri) | CRUD (kendi) | okur (kendi) | okur |
| vehicles, vehicle_types (taşıyıcı) | – | CRUD (kendi) | okur (kendi) | okur |
| platform kataloğu (tip/ambalaj/sınıf) | okur | okur | okur | CRUD |
| taşıyıcıya özel ambalaj/sınıf | seferdeki taşıyıcınınkini okur | CRUD | okur | okur |
| carrier_product_classes | seferdeki taşıyıcınınkini okur | CRUD | okur | okur |

Müşteri tesis okumaları sefer join'i üzerinden yapılır (capacity spec'i gelene kadar `/customer/*` tesis uç noktası yoktur).

## 3. API (bu spec)
```
GET/POST        /carrier/facilities            GET/PUT/PATCH(status) /carrier/facilities/{id}
GET/POST        /carrier/vehicle-types         GET/PUT/PATCH         /carrier/vehicle-types/{id}
GET/POST        /carrier/vehicles              GET/PUT/PATCH         /carrier/vehicles/{id}
GET/POST        /carrier/packaging-types       GET/PUT/PATCH         /carrier/packaging-types/{id}
GET/PUT         /carrier/product-classes       (kabul edilen sınıf listesi)
GET             /catalog/packaging-types       GET /catalog/product-classes   GET /catalog/vehicle-types
POST/PUT/PATCH  /platform/catalog/...          (platform_admin)
POST            /customer/shipments/estimate-pallets   (koli → tahmini palet, kayıt yazmaz)
```
`PUT` iyimser sürüm ister (`If-Match: version`); uyuşmazlıkta 409. Her yazma denetim kaydı + `Idempotency-Key`.

Doğrulama: ölçüler pozitif, plaka düzeni (TR plaka regex'i, uyarı düzeyinde), telefon E.164, koordinat aralığı, saat dilimi IANA, pencere biçimi `HH:MM` ve başlangıç < bitiş.

## 4. Palet eşdeğeri (packages/domain)
```ts
estimatePallets({ palletType, cartons: [{ packagingTypeId, count }] })
 → { totalVolumeM3, totalWeightKg, estimatedPallets, perPalletUsableM3, warnings[] }
estimatedPallets = ceil( totalVolumeM3 / (palletType.usable_volume_m3 × palletType.fill_factor) )
```
Ağırlık kontrolü: `totalWeightKg / estimatedPallets` palet azami brüt ağırlığını aşarsa `estimatedPallets` ağırlığa göre artırılır (`ceil(totalWeightKg / max_gross_kg)` ile `max`). Sonuç yalnız **tahmindir**; müşteri nihai palet adedini ve paletlerin ağırlık/ölçü beyanını girer (requirements 3.5). Kapasite, fiyat ve depo kabulü yalnız palet adedi üzerindendir. Saf fonksiyon, para/ondalık hatasına karşı hacimler mikro-m³ tamsayısıyla hesaplanır.

## 5. Seed tasarımı

### 5.1 Yapı
`packages/db/seed/` altında katmanlı betikler; her katman kendi spec'i uygulanınca eklenir:

| Katman | İçerik | Gerektirdiği spec |
|---|---|---|
| L1 | tenants, users, memberships, facilities, vehicle_types, vehicles, packaging_types, product_classes | platform-foundation + bu spec |
| L2 | trips, kapasite, teklif/blokaj/rezervasyon/sipariş | capacity-and-pricing, reservation-and-approval |
| L3 | ödeme defteri, iptal/iade | payments-and-cancellation |
| L4 | palet olayları, e-POD, gelmeme kayıtları | warehouse-and-tracking |

Komutlar: `npm run seed -- --layer=L1`, `seed:verify`, `seed:reset`. `--layer` verilmezse uygulanmış tüm katmanları sırayla çalıştırır.

### 5.2 İlkeler
- **Deterministik kimlik:** `id = uuidv5(NAMESPACE_CARGOPACT_DEMO, "<tablo>:<doğal anahtar>")`. Yeniden çalıştırma `INSERT ... ON CONFLICT (id) DO UPDATE` ile aynı satırları yazar.
- **Göreli zaman:** `anchor = bugün 00:00 Europe/Istanbul`. Fixture'lar `anchor + offset` ile tanımlanır (ör. "yarın 18:00"). Betik çalıştığında hep ileriye dönük seferler üretir.
- **Koruma:** `STAGE !== 'prod'` ve cluster etiketi `Environment != production` değilse çalışır; aksi halde hata. `seed:reset` yalnız `is_demo = true` satırları, çocuk tablolardan başlayarak ≤3000 satırlık işlemlerle siler. Platform kataloğu ve migrasyon verisi silinmez (`is_demo=false`).
- **Parçalama:** Her yazma işlemi ≤3000 satır.
- **Cognito kullanıcıları:** `seed:users` betiği `AdminCreateUser` + `AdminSetUserPassword` ile oluşturur. Parola `SEED_USER_PASSWORD` ortam değişkeninden veya gitignore'lu yerel dosyadan okunur; repoya yazılmaz. Çıktıda parola basılmaz.
- **Tutarlılık doğrulama (`seed:verify`):** her katman için değişmezler: kiracı sınırı (hiçbir satır başka kiracının varlığına referans vermez), FK bütünlüğü, kapasite toplamları (L2+), defter bakiyeleri (L3+), tekil sipariş numaraları.

### 5.3 L1 veri seti (kurgusal)
**Kiracılar:** platform (sabit UUID); taşıyıcılar *Dinçer Lojistik*, *Siva Taşımacılık*; müşteriler *Marmara Ambar*, *Anadolu Parsiyel*, *Başkent Nakliye*, *Ege Depo Hizmetleri*, *Karadeniz Parsiyel*, *Güney Lojistik Pazarlama* (biri `pending`: Güney; biri ileride gelmeme geçmişli: Başkent).

**Tesisler** (adresler kurgusaldır; koordinatlar şehir merkezine yakın örnek değerlerdir):
| Taşıyıcı | Kod | Ad | Tür | Şehir |
|---|---|---|---|---|
| Dinçer | DNC-GEB-TM | Dinçer Gebze Transfer Merkezi | transfer_center | Kocaeli/Gebze |
| Dinçer | DNC-KMP-TM | Dinçer Kemalpaşa Transfer Merkezi | transfer_center | İzmir/Kemalpaşa |
| Dinçer | DNC-ANK-DM | Dinçer Ankara Dağıtım Merkezi | distribution_center | Ankara/Sincan |
| Dinçer | DNC-BRS-DM | Dinçer Bursa Dağıtım Merkezi | distribution_center | Bursa/Nilüfer |
| Dinçer | DNC-KNY-DM | Dinçer Konya Dağıtım Merkezi | distribution_center | Konya/Selçuklu |
| Dinçer | DNC-ADN-DM | Dinçer Adana Dağıtım Merkezi | distribution_center | Adana/Seyhan |
| Siva | SVA-CRK-TM | Siva Çerkezköy Transfer Merkezi | transfer_center | Tekirdağ/Çerkezköy |
| Siva | SVA-MRS-TM | Siva Mersin Transfer Merkezi | transfer_center | Mersin/Tarsus |
| Siva | SVA-ANK-DM | Siva Ankara Dağıtım Merkezi | distribution_center | Ankara/Gölbaşı |
| Siva | SVA-IZM-DM | Siva İzmir Dağıtım Merkezi | distribution_center | İzmir/Çiğli |
| Siva | SVA-GZT-DM | Siva Gaziantep Dağıtım Merkezi | distribution_center | Gaziantep/Şehitkamil |
| Siva | SVA-SMS-DM | Siva Samsun Dağıtım Merkezi | distribution_center | Samsun/Canik |

Çalışma saatleri hafta içi 07:00–21:00, Cumartesi 08:00–16:00; kabul penceresi 08:00–19:00; alım penceresi 09:00–18:00; günlük slot 40–60.

**Araç tipleri (platform kataloğu, örnek değerler):**
| Kod | Ad | Palet | Azami net yük | Hacim |
|---|---|---|---|---|
| TIR-136 | Tır (13,6 m tenteli) | 33 | 24.000 kg | 86 m³ |
| KAMYON-10T | Kamyon (10 tekerli) | 18 | 10.000 kg | 45 m³ |
| KAMYONET | Kamyonet | 6 | 3.000 kg | 14 m³ |

Plandaki demo seferinin 22.000 kg azami yükü, sefer düzeyinde tanımlanır (araç tipinden düşük; requirements 2.3). Taşıyıcı başına 5 araç: 3 tır, 1 kamyon, 1 kamyonet (biri bakımda). Plakalar kurgusal ve geçerli biçimde (ör. `41 DNC 101`).

**Ambalaj tipleri (platform):** `EUR-PALET` 1200×800, azami 1.000 kg, kullanılabilir hacim 1,728 m³ (1,8 m yükseklik), doluluk 0,80; `END-PALET` 1200×1000, azami 1.000 kg, 2,160 m³, 0,80; `KOLI-S` 300×200×200 mm, ~5 kg; `KOLI-M` 400×300×300 mm, ~12 kg; `KOLI-L` 600×400×400 mm, ~20 kg.

**Ürün sınıfları:** `GENEL` (genel kuru yük), `GIDA-AMBALAJLI`, `KIRILGAN`, `TEHLIKELI` (ADR). Dinçer ve Siva `TEHLIKELI` sınıfını kabul etmez; Siva `KIRILGAN`'ı kabul eder, Dinçer etmez.

**Kullanıcılar** (e-posta alanı `@example.test`): her taşıyıcıda admin, planlamacı, depo personeli; her müşteride bir kullanıcı; bir platform admin ve bir izleyici. Roller üyeliklerle bağlanır.

### 5.4 Sonraki katmanlar (özet; ilgili spec'lerin design'ında detaylanır)
L2: plandaki Gebze→Ankara seferi (33 poz., 25 iç palet, 17.000 kg iç yük, azami 22.000 kg, satışa 8 palet/5.000 kg/12 m³) ve 3+2+3 siparişleri; diğer rotalarda boş, yarı dolu, dolu seferler; T−3 geçmiş, T−1 geçmiş ve tamamlanmış birer sefer; her sipariş durumundan örnek; süresi dolmuş blokaj. L3: tam ödeme, kapora+kalan, ücretsiz/ücretli iptal, taşıyıcı iptali iadesi, gelmeme ücreti, hasar iadesi. L4: palet olayları, e-POD, doğrulanmış gelmeme kayıtları (Başkent Nakliye'de) ve eşdeğer iki talepli sıralama senaryosu.

## 6. Test
- `estimatePallets`: koli → palet (hacim sınırlı, ağırlık sınırlı, tam sınır, sıfır adet, farklı koli karışımı).
- Repository: kiracı izolasyonu, pasife alma + FK ile silme engeli, plaka tekilliği, iyimser sürüm çakışması.
- Seed: iki kez çalıştırma sonucu satır sayısı değişmez; `reset` yalnız demo satırlarını siler; prod korumasının reddi; `verify` geçer.
