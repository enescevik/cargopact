# CargoPact

Web (React/Vite) + mobil (Expo) uygulaması; sohbet arayüzü, Strands çoklu ajan, AWS (Cognito, Lambda, Aurora DSQL, S3, AgentCore).

```
apps/web  apps/mobile  packages/contracts  services/api  agents  infra  .kiro/steering
```

## Başlangıç
```bash
npm install
npm run typecheck
npm run synth            # CDK şablonlarını üretir
npx -w @cargopact/infra cdk bootstrap aws://<ACCOUNT>/us-east-1   # bir kez
npm run deploy           # Auth, Data, Agents(ECR+Memory), Api, Web
```
Ajan imajı ve Runtime için bkz. `agents/README.md`. Deploy çıktılarını `.env.example` içindeki değişkenlere yazın.

## Kiro
- Knowledge base: `.kiro/steering/*.md` (proje planı gelince `product.md` güncellenir).
- GitHub MCP: `.kiro/settings/mcp.json`, `GITHUB_TOKEN` ortam değişkeni gerekir.
