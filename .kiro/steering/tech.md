---
inclusion: always
---
# Teknik Yığın ve Kurallar

- **Monorepo:** npm workspaces (`apps/web`, `apps/mobile`, `packages/shared`, `services/api`, `infra`) + Python (`agents/`).
- **Web:** React + Vite + TypeScript. **Mobil:** Expo (React Native) + TypeScript. Ortak tipler `@cargopact/shared` içinde.
- **Auth:** Amazon Cognito User Pool (JWT). API Gateway HTTP API JWT authorizer ile korunur.
- **API:** Lambda (Node.js 22, TypeScript, esbuild ile bundle).
- **Veritabanı:** Aurora DSQL (PostgreSQL uyumlu). Bağlantı IAM token ile; parola yok. Parametreli sorgu kullan.
- **Dosyalar:** S3 (özel bucket, presigned URL ile erişim).
- **Ajanlar:** Strands Agents (Python) + Amazon Bedrock AgentCore Runtime. Orkestratör ajan uzman ajanlara "agents as tools" ile yönlendirir. Oturum belleği AgentCore Memory.
- **IaC:** AWS CDK (TypeScript), `infra/`. Bölge `us-east-1`.
- **Sohbet:** Kendi React sohbet arayüzümüz -> `POST /chat` -> Lambda -> AgentCore Runtime. Amazon Quick sonradan bağlayıcı olarak eklenebilir.
- **Güvenlik:** En az yetki IAM, sır bilgisi koda yazılmaz, girdi sınırında doğrulama yapılır.
- **Hackathon:** Yalnızca hackathon için izin verilen AWS servisleri kullanılır. Yeni servis eklemeden önce listeyi kontrol et.
