// Asistan gecikmesi: soğuk oturum (ısınmasız) vs ısınmış oturum, CloudFront /api üzerinden.
// Kullanım: set -a; . ./.env.seed; set +a; NODE_PATH=packages/db/node_modules:node_modules npx tsx scripts/perf-chat.mjs
import { CognitoIdentityProviderClient, InitiateAuthCommand } from "@aws-sdk/client-cognito-identity-provider";
const BASE = process.env.PERF_BASE ?? "https://d1xysc2r88pheq.cloudfront.net/api";
const cog = new CognitoIdentityProviderClient({ region: "us-east-1" });
const T = (await cog.send(new InitiateAuthCommand({ AuthFlow: "USER_PASSWORD_AUTH", ClientId: process.env.USER_POOL_CLIENT_ID, AuthParameters: { USERNAME: "web.musteri@cargopact.example.test", PASSWORD: process.env.SEED_USER_PASSWORD } }))).AuthenticationResult.IdToken;
const post = async (body) => { const s = performance.now(); const r = await fetch(BASE + "/chat", { method: "POST", headers: { authorization: `Bearer ${T}`, "content-type": "application/json" }, body: JSON.stringify(body) }); const j = await r.json(); return { ms: performance.now() - s, j }; };
const Q = ["Yarın Gebze'den Ankara'ya 3 palet için uygun sefer var mı?", "Rezervasyonlarımı listele."];
const sid = () => `sess-perf-${Date.now()}-${Math.random().toString(36).slice(2)}`.padEnd(40, "0");

const cold = sid();
for (const q of Q) { const r = await post({ message: q, sessionId: cold }); console.log(`ısınmasız   ${(r.ms / 1000).toFixed(1)} sn  ${q}`); }
const warm = sid();
const w = await post({ warmup: true, sessionId: warm });
console.log(`ısınma çağrısı ${(w.ms / 1000).toFixed(1)} sn (kullanıcı beklemez; arka planda) warmed=${w.j.warmed}`);
for (const q of Q) { const r = await post({ message: q, sessionId: warm }); console.log(`ısınmış     ${(r.ms / 1000).toFixed(1)} sn  ${q}`); }
