---
inclusion: always
---
# Teknik Yığın ve Kurallar

- **Monorepo:** npm workspaces (`apps/web`, `apps/mobile`, `packages/contracts`, `services/api`, `infra`) + Python (`agents/`).
- **Web:** React + Vite + TypeScript. **Mobil:** Expo (React Native) + TypeScript. Ortak tipler `@cargopact/contracts` içinde.
- **Auth:** Amazon Cognito User Pool (JWT). API Gateway HTTP API JWT authorizer ile korunur.
- **API:** Lambda (Node.js 22, TypeScript, esbuild ile bundle).
- **Veritabanı:** Aurora DSQL (PG16 uyumlu), IAM token, parola yok, parametreli sorgu. **Doğrulanmış (25.11.2026):** FK çalışır; jsonb çalışır; dizi kolonu ve SERIAL yok; sekans/identity yalnız açık CACHE ile; indeks yalnız `CREATE INDEX ASYNC`; bir işlemde en çok bir DDL ve DDL+DML karışmaz; trigger yok; ≤3000 satır/işlem; eşzamanlı yazımda ikinci commit `40001` (yeniden dene). Para bigint kuruş, zaman timestamptz UTC. Yetki: `GRANT USAGE ON SCHEMA public` desteklenmez (gerekmez); IAM eşlemesi `AWS IAM GRANT <rol> TO '<arn>'`; `sys.iam_pg_mappings` görünümü yok. Uygulama rolü `cargopact_app` ↔ IAM `cargopact-api-lambda`. Ayrıntı: `.kiro/specs/platform-foundation/design.md`.
- **Çok kiracılık:** `carrier` ve `customer` kiracıları; tenant kimliği JWT üyeliğinden türetilir, istemciden alınmaz.
- **Dosyalar:** S3 (özel bucket, presigned URL ile erişim).
- **Ajanlar:** Strands Agents (Python) + Amazon Bedrock AgentCore Runtime. Orkestratör ajan uzman ajanlara "agents as tools" ile yönlendirir. Oturum belleği AgentCore Memory.
- **IaC:** AWS CDK (TypeScript), `infra/`. Bölge `us-east-1`.
- **Sohbet:** Kendi React sohbet arayüzümüz -> `POST /chat` -> Lambda -> AgentCore Runtime. Amazon Quick sonradan bağlayıcı olarak eklenebilir.
- **Güvenlik:** En az yetki IAM, sır bilgisi koda yazılmaz, girdi sınırında doğrulama yapılır.
- **Hackathon:** Yalnızca hackathon için izin verilen AWS servisleri kullanılır. Yeni servis eklemeden önce listeyi kontrol et.

## Geliştirici komutları
- Ortam: `.env.seed` (gitignore'lu; DSQL_ENDPOINT, USER_POOL_ID, USER_POOL_CLIENT_ID, API_URL, SEED_USER_PASSWORD). Yükle: `set -a; . ./.env.seed; set +a`.
- `npm run db:migrate`, `npm run db:grant` (APP_ROLE_ARN), `npm run seed`, `npm run seed:users -w @cargopact/db`, `npm run seed:verify -w @cargopact/db`, `npm run seed:reset -w @cargopact/db`.
- Uçtan uca kontrol: `NODE_PATH=packages/db/node_modules:node_modules node scripts/smoke-master-data.mjs`.
- Seed test kullanıcıları: `l1-data.ts` içindeki `*.example.test` adresleri, parola `.env.seed` içinde.
