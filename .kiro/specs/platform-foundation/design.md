# Design – Platform Temeli

Bu belge `platform-foundation` ve `master-data-and-seed` spec'lerinin ortak teknik temelini tanımlar. Ana veri tabloları ve seed için bkz. `../master-data-and-seed/design.md`.

## 1. Doğrulanmış Aurora DSQL davranışları (25.11.2026, us-east-1, gerçek cluster'da denendi)

| Konu | Sonuç | Tasarım etkisi |
|---|---|---|
| Sürüm | PostgreSQL 16 uyumlu | Standart `pg` sürücüsü kullanılır. |
| Yabancı anahtar | **Oluşturulur ve uygulanır** (ihlalde `23503`, silmede de engeller) | FK kullanılır. Çakışmada OCC hatası olabilir, yeniden denenir. |
| `jsonb` kolon ve `->`, `->>` | Çalışır | Esnek alanlar için `jsonb` kullanılır. |
| Dizi kolonu (`text[]`) | **Desteklenmez** (`0A000`) | Çoklu değerler alt tablo veya `jsonb` ile. |
| `SERIAL` | **Yok** | UUID birincil anahtar. |
| `CREATE SEQUENCE` / identity | Yalnız açık `CACHE` ile çalışır | Sipariş numarası için sekans yerine yıllık sayaç tablosu (bkz. reservation design). |
| `CREATE INDEX` | **Yalnız `CREATE INDEX ASYNC`**; `job_id` döner | Migrasyon çalıştırıcı işin bitmesini bekler (`CALL sys.wait_for_job(job_id)`, prosedür; çalıştırıcıda doğrulanacak). |
| DDL | **Bir işlemde en çok bir DDL**; DDL ve DML aynı işlemde olamaz | Her DDL kendi işleminde; `schema_migrations` kaydı ayrı DML işleminde. |
| Trigger | **Desteklenmez** | Denetim ve türetilmiş alanlar uygulama katmanında. |
| `CHECK`, `UNIQUE`, partial unique index | Çalışır (`23514`, `23505`) | Alan kuralları DB'de de uygulanır. |
| `ON CONFLICT DO NOTHING/UPDATE ... RETURNING` | Çalışır | Idempotency ve upsert için kullanılır. |
| `SELECT ... FOR UPDATE` | Çalışır | Tek başına çakışmayı çözmez, OCC geçerlidir. |
| Eşzamanlı güncelleme | İlk commit başarılı, ikinci commit **`40001` (OC000)**; son değer tutarlı | Çift rezervasyon DB seviyesinde engellenir. Uygulama `40001`'i yeniden dener. |
| İşlem satır sınırı | **3000 satır/işlem** (3001'de `54000`) | Seed ve toplu işlemler ≤3000 satırlık parçalara bölünür. |
| `numeric`, `timestamptz`, `date`, `bigint`, `boolean` | Çalışır | Para: `bigint` kuruş. Zaman: `timestamptz` (UTC). |
| Saat dilimi | UTC | Yerel saat dönüşümü uygulamada (`Europe/Istanbul`). |

Bu tablo `tech.md` steering dosyasına da yansıtılmıştır.

## 2. Mimari

```
Web/Mobil ──HTTPS──> API Gateway (HTTP API, Cognito JWT authorizer)
                          │
                          ▼
                   Lambda "api" (tek yönlendiricili, TS)
                    ├─ auth: JWT sub → users/memberships → AuthContext{userId, tenantId, tenantType, role}
                    ├─ validate: zod şemaları (packages/contracts)
                    ├─ handlers → services (iş kuralları, packages/domain saf fonksiyonlar)
                    └─ db: packages/db (bağlantı, withTx, repository'ler)
                          │
                          ▼
                    Aurora DSQL (IAM token, rol cargopact_app)
```

Mevcut `chat` ve `health` Lambda'ları kalır. Yeni iş API'si tek `api` Lambda'sında yönlendiricidir (ortak bağlantı/ısınma, tek yetki katmanı). Ajan araçları aynı servis katmanını çağırır (agents-and-chat spec'i).

### Paket yapısı
| Paket | Sorumluluk |
|---|---|
| `packages/contracts` | OpenAPI 3 belgesi, zod şemaları, istemci tipleri. Mevcut `packages/shared` bu pakete taşınır (web/mobil içe aktarmaları güncellenir). |
| `packages/domain` | Saf iş kuralları: zaman sınırları (T−3/T−1), palet eşdeğeri, para yardımcıları. Yan etkisiz, birim testlenebilir. |
| `packages/db` | Bağlantı + IAM token, `withTx` (yeniden deneme), migrasyonlar, repository'ler, seed. |
| `services/api` | Lambda yönlendirici, handler'lar, auth ve hata katmanı. |

## 3. Kimlik ve yetki
- Cognito JWT API Gateway'de doğrulanır; Lambda `sub` ile `users` ve `memberships` tablosundan `AuthContext` kurar. İstemciden gelen `tenantId`, `role` alanları yok sayılır.
- Bir kullanıcı birden fazla kiracıda üyelik taşıyabilir; istek `x-tenant-id` başlığıyla **seçim** yapar ve seçilen kiracı üyeliklerde doğrulanır (yoksa 403).
- Yeni müşteri kaydı: Cognito self-signup → ilk girişte `users` kaydı + `tenants(type=customer,status=pending)` ve `memberships`. `pending` firma sefer listesine erişemez. Taşıyıcı ve platform kullanıcıları yalnız yönetici/seed ile oluşturulur.
- Yetki matrisi `packages/contracts` içinde sabit bir tabloda (rol × uç nokta). Rol yetersizse 403; başka kiracı kaydı 404 + denetim kaydı.
- Satır düzeyi güvenlik (RLS) varsayılmaz. **Tüm sorgular `TenantScope` yardımcısıyla** yazılır: repository fonksiyonları `tenantId` parametresini zorunlu alır ve `WHERE tenant_id = $1` ekler. Kiracı sızıntısı testi bu kuralı denetler.

## 4. Veri erişimi
- `getPool()`: `@aws-sdk/dsql-signer` ile kısa ömürlü IAM token, token süresine göre bağlantı yenileme, TLS zorunlu. Lambda rolü yalnız `dsql:DbConnect` ile `cargopact_app` veritabanı rolüne eşlenir (`CREATE ROLE` + `AWS IAM GRANT`, migrasyon 0001'in admin adımı).
- `withTx(fn, {maxRetries: 5})`: `40001` ve bağlantı kaynaklı geçici hatalarda üstel + jitter geri çekilmeyle yeniden dener; tükenirse `ConflictError` → 409. İşlem gövdesi yeniden çalışabilir (yan etkisiz) yazılır; dış çağrılar (ödeme vb.) işlem dışında yapılır.
- Her işlemde en çok 3000 satır yazılır.

### Idempotency
Tablo `idempotency_keys(tenant_id, scope, key)` PK. Yazan uç nokta, mutasyonla **aynı işlemde**: anahtarı `INSERT ... ON CONFLICT DO NOTHING`; satır zaten varsa kayıtlı `request_hash` ile karşılaştırır (farklıysa 422), aynıysa saklı yanıtı döner ve mutasyon yapmaz; yeni ise mutasyonu uygular ve yanıtı aynı işlemde yazar. Eşzamanlı aynı anahtar → OCC çakışması → yeniden deneme → saklı yanıtı bulur.

### Denetim izi
`audit_log` yalnız ekleme. Trigger olmadığından her servis fonksiyonu `audit()` yardımcısını **aynı işlemde** çağırır. `cargopact_app` rolüne tabloda yalnız `INSERT, SELECT` verilir (UPDATE/DELETE verilmez; grant davranışı migrasyon testinde doğrulanır).

## 5. Çekirdek şema (bu spec)

Tüm tablolarda `id uuid primary key default gen_random_uuid()`, `created_at timestamptz not null default now()`, ve demo verisi için `is_demo boolean not null default false` bulunur. Aşağıda yalnız ek alanlar gösterilmiştir. Ana veri tabloları master-data design'ındadır.

```sql
tenants(
  type text not null check (type in ('platform','carrier','customer')),
  name text not null, status text not null check (status in ('pending','active','suspended')),
  tax_no text
)
users(cognito_sub text not null, email text not null, display_name text)           -- unique(cognito_sub), unique(email) async index
memberships(user_id uuid not null references users(id), tenant_id uuid not null references tenants(id),
            role text not null check (role in ('customer_user','carrier_admin','carrier_planner','carrier_warehouse','admin_viewer','platform_admin')),
            status text not null default 'active')                                  -- unique(user_id, tenant_id)
audit_log(tenant_id uuid not null, actor_user_id uuid, actor_role text, action text not null,
          entity_type text not null, entity_id uuid, before_state jsonb, after_state jsonb,
          reason text, correlation_id text not null)                                 -- index (tenant_id, created_at), (entity_type, entity_id)
idempotency_keys(tenant_id uuid not null, scope text not null, key text not null, request_hash text not null,
                 status_code int not null, response_body jsonb not null, primary key (tenant_id, scope, key))
schema_migrations(version text primary key, applied_at timestamptz not null default now(), checksum text not null)
```
Gelmeme sayısı tabloda saklanmaz; olaylardan türetilir (warehouse-and-tracking spec'i).

Platform kataloğu için sabit UUID'li bir `platform` kiracısı vardır (migrasyon 0002 seed'i). Böylece katalog satırlarında `tenant_id` hiç NULL olmaz ve `unique(tenant_id, code)` çalışır.

## 6. Migrasyonlar
- Dizin: `packages/db/migrations/NNNN_ad.sql`. Her dosya **tek ifade** (tek DDL) veya yalnız DML içerir; çalıştırıcı dosyaları sırayla ve otomatik-commit ile çalıştırır.
- `CREATE INDEX ASYNC` sonrası çalıştırıcı `job_id`'yi izler (`sys.jobs`) ve bitmeden sonrakine geçmez; başarısız (INVALID) indeksi düşürüp yeniden kurar.
- Çalıştırıcı: `npm run db:migrate` (yerel ve CI). Her dosyanın `checksum`'ı `schema_migrations`'a yazılır; değişmiş dosya hata verir. Idempotent: uygulanmış sürümleri atlar.
- Yönetici adımları (rol oluşturma) `admin` token'ı ile, uygulama adımları `cargopact_app` ile değil yine migrasyon kimliğiyle çalışır.

## 7. API konvansiyonları
- Yollar: `/me`, `/carrier/*`, `/customer/*`, `/warehouse/*`, `/catalog/*` (plan §6 ile uyumlu).
- Hata gövdesi: `{ code, message, correlationId, details? }`. Kodlar: `VALIDATION_ERROR` 400, `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `CONFLICT` 409, `IDEMPOTENCY_MISMATCH` 422, `INTERNAL` 500.
- `correlationId`: `x-correlation-id` varsa o, yoksa API Gateway `requestId`; log satırlarına ve denetim kaydına yazılır. Yapılandırılmış JSON log.
- Yazan uç noktalar `Idempotency-Key` başlığı ister (yoksa 400).
- Sayfalama: `limit` (varsayılan 50, azami 200) + `cursor`.
- Zaman: ISO 8601 UTC. Para: `{ amountMinor: number, currency: "TRY" }`.

## 8. Altyapı (CDK) değişiklikleri
- `DataStack`: `CfnCluster` mevcut. Migrasyon sonrası uygulama rolü için `AWS IAM GRANT` adımı `db:migrate` içinde.
- `ApiStack`: `api` Lambda (`dsql:DbConnect` yalnız bu cluster ARN'ine), ortam: `DSQL_ENDPOINT`, `STAGE`. Rotalar: JWT authorizer'lı `ANY /{proxy+}`; `/health` açık kalır.
- Cognito: `AuthStack` değişmez (JWT aud = app client).
- Kimlik bilgisi/sır yok; yalnız IAM.

## 9. Test stratejisi
- `packages/domain`: saf fonksiyon birim testleri.
- `packages/db`: gerçek DSQL'e karşı entegrasyon testleri (geçici şema/tablolar, CI'da `DSQL_TEST_ENDPOINT` varsa çalışır): FK, `40001` yeniden deneme, idempotency, 3000 satır sınırı.
- Kiracı izolasyon testi: iki kiracı verisi, her repository fonksiyonu çapraz erişimde boş/404 döner.
- API sözleşme testi: OpenAPI'ye karşı yanıt şeması doğrulaması.
- Yazılacak testlerin kapsamı `tasks.md`'de listelenir.

## 10. Riskler
| Risk | Önlem |
|---|---|
| Çok sayıda OCC çakışması sıcak satırlarda (sefer kapasitesi) | Kapasite tek satır ama yazımlar kısa işlem; yeniden deneme ve jitter. Yük testi capacity design'ında. |
| `CALL sys.wait_for_job` sözdizimi | Çalıştırıcının ilk görevinde doğrulanacak; yedek: `sys.jobs` yoklama. |
| `AWS IAM GRANT` / tablo yetkileri davranışı | Migrasyon 0001'de gerçek cluster'da denenecek. |
| Cognito pending firma akışı | Seed ve e2e testte örneklenir. |
