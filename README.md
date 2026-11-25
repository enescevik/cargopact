# CargoPact

Planlı depo-depo transferlerinde boş kalan palet alanını yayınlayan, farklı müşterilerin yüklerini aynı araçta birleştiren ve her paleti izleyen platform. Taşıyıcı "Aracım var, yük ekle" ile kapasiteyi açar; müşteri fiyatı görüp yer ayırır; taşıyıcı onaylar ve sipariş numarası (`CP-2026-000123`) üretilir. Web, mobil ve sohbet asistanı aynı backend'i kullanır.

Hackathon projesidir. Tüm veriler (firmalar, tutarlar, adresler) kurgusaldır.

## Canlı adresler (dev, us-east-1)

| Ne | Adres |
|---|---|
| Web | https://d1xysc2r88pheq.cloudfront.net |
| Mobil (Expo web çıktısı) | https://d1xysc2r88pheq.cloudfront.net/m/ |
| API | https://765h182ijf.execute-api.us-east-1.amazonaws.com (`GET /health` açık, diğerleri Cognito JWT ister) |

## Demo hesapları

Parola: `Cargopact2026!` (kurgusal demo hesapları)

| Kanal | Rol | E-posta | Firma |
|---|---|---|---|
| Web | Müşteri | web.musteri@cargopact.example.test | Marmara Ambar |
| Web | Transfer merkezi | web.yonetici@cargopact.example.test | Dinçer Lojistik |
| Mobil | Müşteri | mobil.musteri@cargopact.example.test | Anadolu Parsiyel |
| Mobil | Transfer merkezi | mobil.yonetici@cargopact.example.test | Dinçer Lojistik |
| Yedek | Müşteri | user@baskent.example.test | Başkent Nakliye |

Demo senaryosu: [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md).

## Depo yapısı

```
apps/web            React + Vite web uygulaması (S3 + CloudFront)
apps/mobile         Expo (React Native) mobil uygulaması
packages/contracts  Ortak tipler, zod şemaları, OpenAPI (openapi.json)
packages/domain     Saf iş kuralları: zaman sınırları, uygunluk, fiyat
packages/db         Aurora DSQL bağlantısı, migrasyonlar, seed
services/api        Lambda handler'ları (iş API'si, chat, health)
agents              Strands çoklu ajan (Python), Dockerfile, AgentCore deploy
infra               AWS CDK yığınları: Auth, Data, Agents, Api, Web
scripts             Uçtan uca smoke testleri
docs                Plan, mimari, demo ve sunum belgeleri
.kiro               Steering (bilgi tabanı) ve spec'ler
```

## Teknoloji

Cognito (JWT) · API Gateway HTTP API · Lambda (Node.js 22, TypeScript, esbuild) · Aurora DSQL (IAM token, parola yok) · S3 + CloudFront · Amazon Bedrock · Bedrock AgentCore Runtime ve Memory · Strands Agents · ECR · AWS CDK · GitHub Actions.

## Çalıştırma

Gereksinim: Node 22 (`.nvmrc`), npm workspaces. Ajanlar için Python 3.12.

```bash
npm install
npm run typecheck
npm test                 # birim testleri (DSQL gerektirmez)
npm run dev:web          # web geliştirme sunucusu
npm run dev:mobile       # Expo
npm run synth            # CDK şablonlarını üretir
```

Ortam değişkenleri için `.env.example` dosyasına bakın. Seed ve smoke için yerelde `.env.seed` oluşturun (gitignore'lu: `DSQL_ENDPOINT`, `USER_POOL_ID`, `USER_POOL_CLIENT_ID`, `API_URL`, `SEED_USER_PASSWORD`).

## Deploy

```bash
npx -w @cargopact/infra cdk bootstrap aws://<ACCOUNT>/us-east-1   # bir kez
npm run build:web        # önce web derlemesi (CDK apps/web/dist ve apps/mobile/dist'i yayınlar)
npm run deploy           # Auth, Data, Agents (ECR + Memory), Api, Web
```

Ajan imajı ve Runtime (iki aşamalı) için [agents/README.md](agents/README.md). GitHub Actions: `ci.yml` (typecheck, test, build, synth), `deploy.yml` (elle tetiklenir, OIDC).

## Veritabanı, seed ve test

```bash
set -a; . ./.env.seed; set +a
npm run db:migrate                          # migrasyonlar (idempotent)
npm run db:grant                            # APP_ROLE_ARN ile IAM -> cargopact_app eşlemesi
npm run seed                                # demo verisi
npm run seed:users -w @cargopact/db         # Cognito demo kullanıcıları
npm run seed:verify -w @cargopact/db        # seed doğrulaması
npm run seed:reset -w @cargopact/db         # seed verisini sil
npm run smoke                               # uçtan uca kontrol (canlı API), sonunda smoke kayıtlarını temizler
npm run test:integration                    # gerçek DSQL'de eşzamanlılık testi (DSQL_TEST_ENDPOINT gerekir)
npm run openapi                             # OpenAPI belgesini zod şemalarından üretir
```

Demo verisini sıfırlama: `cd /workshop && set -a && . ./.env.seed && set +a && npm run demo:reset`

## Kiro

- Bilgi tabanı: `.kiro/steering/*.md` (ürün, alan kuralları, teknik yığın, dizin yapısı, açık kararlar).
- Spec-driven geliştirme: `.kiro/specs/<ad>/` altında requirements (EARS) → design → tasks.
- GitHub MCP: `.kiro/settings/mcp.json`, `GITHUB_TOKEN` ortam değişkeni gerekir.

## Belgeler

| Belge | İçerik |
|---|---|
| [docs/PRESENTATION.md](docs/PRESENTATION.md) | Sunum slaytları ve konuşmacı notları |
| [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) | Dakika dakika canlı demo, yedek planlar |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Bileşen, rezervasyon ve sohbet diyagramları |
| [docs/REVIEW_CHECKLIST.md](docs/REVIEW_CHECKLIST.md) | Sunum öncesi inceleme ve prova listesi |
| [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md) | Orijinal ürün ve uygulama planı (v1.3) |
| [docs/OVERVIEW.md](docs/OVERVIEW.md) | Kapsam, roller, akış |
| [docs/PROGRESS.md](docs/PROGRESS.md) | İlerleme ve doğrulama sonuçları |
| [docs/DEMO_API.md](docs/DEMO_API.md) | Web, mobil ve ajanların ortak API sözleşmesi |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | Tasarım belirteçleri ve bileşen kuralları |

## Güvenlik notları (demo)

Cognito istemcisinde `USER_PASSWORD_AUTH` demo/seed için açık, CORS `*`. Demo parolası kurgusal hesaplara aittir. Üretimde kapatılmalı/daraltılmalıdır. Ayrıntı: [docs/REVIEW_CHECKLIST.md](docs/REVIEW_CHECKLIST.md).
