// Asistanla işlem (uçtan uca, canlı POST /chat): müşteri eksik bilgiyi tamamlar → önizleme → teyit → rezervasyon;
// yönetici asistanla onaylar → sipariş no. Teyit olmadan yazma yapılmadığı da doğrulanır. Sonunda verileri sıfırlamaz (npm run demo:reset).
// Kullanım: set -a; . ./.env.seed; set +a; NODE_PATH=packages/db/node_modules:node_modules npx tsx scripts/smoke-assistant.mjs
import { CognitoIdentityProviderClient, InitiateAuthCommand } from "@aws-sdk/client-cognito-identity-provider";
const { API_URL, USER_POOL_CLIENT_ID, SEED_USER_PASSWORD, AWS_REGION = "us-east-1" } = process.env;
const cog = new CognitoIdentityProviderClient({ region: AWS_REGION });
const tok = {};
const token = async (u) => (tok[u] ??= (await cog.send(new InitiateAuthCommand({ AuthFlow: "USER_PASSWORD_AUTH", ClientId: USER_POOL_CLIENT_ID, AuthParameters: { USERNAME: u, PASSWORD: SEED_USER_PASSWORD } }))).AuthenticationResult.IdToken);
const call = async (u, method, path, body) => {
  const r = await fetch(API_URL + path, { method, headers: { authorization: `Bearer ${await token(u)}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
let pass = 0, fail = 0;
const expect = (n, c, d) => { c ? pass++ : fail++; console.log(`${c ? "✓" : "✗"} ${n}${c ? "" : "  → " + String(JSON.stringify(d)).slice(0, 400)}`); };
async function chat(u, sessionId, message) {
  const t0 = Date.now();
  const r = await call(u, "POST", "/chat", { message, sessionId });
  console.log(`  👤 ${message}\n  🤖 (${((Date.now() - t0) / 1000).toFixed(1)}s) ${String(r.body?.reply ?? JSON.stringify(r.body)).replace(/\s+/g, " ").slice(0, 260)}`);
  return r;
}
const demoRes = async (u) => ((await call(u, "GET", "/customer/reservations")).body?.items ?? []).filter((x) => x.trip?.reference === "DNC-DEMO-GEB-ANK");

const CUST = "web.musteri@cargopact.example.test", MGR = "web.yonetici@cargopact.example.test";
const before = (await demoRes(CUST)).length;
const s1 = `sess-smoke-assist-${Date.now()}-cust000000`;
let r = await chat(CUST, s1, "Yarın Gebze'den Ankara'ya 3 palet göndermek istiyorum.");
expect("asistan eksik bilgileri soruyor (kg / ürün sınıfı / ödeme)", r.status === 200 && /kg|ağırlık/i.test(r.body?.reply) && /ödeme|peşin|kapora/i.test(r.body?.reply), r.body);
expect("henüz rezervasyon yok", (await demoRes(CUST)).length === before);
r = await chat(CUST, s1, "Toplam 1500 kg, genel kargo, tamamını peşin ödeyeceğim.");
expect("sunucu özetiyle teyit istiyor", r.status === 200 && /onaylıyor musunuz|onaylar mısınız|teyit/i.test(r.body?.reply) && /3\.750/.test(r.body?.reply), r.body);
expect("teyitten önce yazma yok", (await demoRes(CUST)).length === before);
r = await chat(CUST, s1, "Evet, onaylıyorum.");
const after = await demoRes(CUST);
const created = after.find((x) => x.pallets === 3 && x.grossKg === 1500 && x.status === "TASIYICI_ONAYI_BEKLIYOR");
expect("teyit sonrası rezervasyon oluştu (3 palet / 1500 kg / 3.750 TL)", !!created && created.totalPriceMinor === 375000, after);
expect("yanıt referansı içeriyor", !!created && r.body?.reply?.includes(created.reference), r.body);
await chat(CUST, s1, "Evet.");
expect("fazladan teyit ikinci kayıt açmıyor", (await demoRes(CUST)).length === after.length);

const s2 = `sess-smoke-assist-${Date.now()}-mgr0000000`;
await chat(MGR, s2, "DNC-DEMO-GEB-ANK seferinde bekleyen talepleri göster.");
r = await chat(MGR, s2, `${created?.reference ?? "Marmara Ambar"} talebini onayla.`);
expect("yönetici: onay özeti ve teyit sorusu", /onaylıyor musunuz|teyit/i.test(r.body?.reply ?? ""), r.body);
const mid = (await demoRes(CUST)).find((x) => x.id === created?.id);
expect("teyitten önce onay yok", mid?.status === "TASIYICI_ONAYI_BEKLIYOR", mid);
r = await chat(MGR, s2, "Evet onaylıyorum.");
const fin = (await demoRes(CUST)).find((x) => x.id === created?.id);
expect("teyit sonrası onaylandı ve sipariş no var", fin?.status === "ONAYLI" && /^CP-\d{4}-\d{6}$/.test(fin?.orderNumber ?? ""), fin);
expect("yanıtta sipariş no", !!fin?.orderNumber && r.body?.reply?.includes(fin.orderNumber), r.body);

const s3 = `sess-smoke-assist-${Date.now()}-neg0000000`;
await chat(CUST, s3, "Evet onaylıyorum, rezervasyonu yap.");
expect("önizleme olmadan 'evet' yazma yapmaz", (await demoRes(CUST)).length === after.length);

console.log(`\n${pass} geçti, ${fail} kaldı`);
process.exit(fail ? 1 : 0);
