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

## Spec-driven geliştirme
Özellikler `.kiro/specs/<ad>/` altında: `requirements.md` (EARS) → `design.md` → `tasks.md`. Her aşama onay ister; onaylanmamış aşamayı atlama. Spec'ler: platform-foundation, master-data-and-seed, capacity-and-pricing, reservation-and-approval, payments-and-cancellation, warehouse-and-tracking, agents-and-chat. Uygulama sırası bu listedir (ilk üçü MVP çekirdeği). İnsan okuması için ilerleme `docs/PROGRESS.md` içinde tutulur.
