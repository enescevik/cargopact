---
inclusion: always
---
# Dizin Yapısı

- `apps/web` – React web uygulaması (S3 + CloudFront'a deploy edilir)
- `apps/mobile` – Expo mobil uygulaması
- `packages/shared` – ortak TypeScript tipleri ve API sözleşmesi
- `services/api` – Lambda handler'ları
- `agents` – Strands çoklu ajan kodu, Dockerfile, AgentCore deploy
- `infra` – CDK stack'leri: Auth, Data, Api, Web, Agents
- `.kiro/steering` – Kiro knowledge base (bu dosyalar)

Yeni API alanı eklerken önce `packages/shared` sözleşmesini güncelle.
