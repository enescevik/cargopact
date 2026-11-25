// Asistan izlenebilirliği uçtan uca: POST /chat → correlationId → GET /carrier/agent-traces (tur + araç çağrıları).
// Kullanım: set -a; . ./.env.seed; set +a; NODE_PATH=packages/db/node_modules:node_modules node scripts/smoke-traces.mjs
import { CognitoIdentityProviderClient, InitiateAuthCommand } from "@aws-sdk/client-cognito-identity-provider";
const { API_URL, USER_POOL_CLIENT_ID, SEED_USER_PASSWORD, AWS_REGION = "us-east-1" } = process.env;
const cog = new CognitoIdentityProviderClient({ region: AWS_REGION });
const tokens = {};
async function token(email) {
  if (tokens[email]) return tokens[email];
  const r = await cog.send(new InitiateAuthCommand({ AuthFlow: "USER_PASSWORD_AUTH", ClientId: USER_POOL_CLIENT_ID, AuthParameters: { USERNAME: email, PASSWORD: SEED_USER_PASSWORD } }));
  return (tokens[email] = r.AuthenticationResult.IdToken);
}
async function call(email, method, path, body) {
  const r = await fetch(API_URL + path, {
    method, headers: { "content-type": "application/json", authorization: `Bearer ${await token(email)}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: r.status, body: parsed };
}
let pass = 0, fail = 0;
const expect = (name, cond, detail) => { cond ? pass++ : fail++; console.log(`${cond ? "✓" : "✗"} ${name}${cond ? "" : "  → " + String(JSON.stringify(detail)).slice(0, 500)}`); };
const YONETICI = "web.yonetici@cargopact.example.test", MUSTERI = "web.musteri@cargopact.example.test";

const sessionId = `sess-smoke-traces-${Date.now()}-0000000000`;
const asked = [];
for (const message of ["Seferlerimi listele", "DNC-DEMO-GEB-ANK seferinde bekleyen talepleri özetle"]) {
  const r = await call(YONETICI, "POST", "/chat", { message, sessionId });
  expect(`chat yanıtı correlationId döner: "${message}"`, r.status === 200 && typeof r.body?.correlationId === "string" && r.body.reply, r);
  if (r.body?.correlationId) asked.push(r.body.correlationId);
}
const t = await call(YONETICI, "GET", "/carrier/agent-traces?limit=20");
expect("taşıyıcı izleri okuyabilir (200)", t.status === 200 && Array.isArray(t.body?.items), t);
for (const id of asked) {
  const turn = t.body?.items?.find((x) => x.correlationId === id);
  expect(`tur ${id.slice(0, 8)} izde var`, !!turn, t.body?.items?.map((x) => x.correlationId));
  expect(`tur ${id.slice(0, 8)} araç çağrıları içerir`, (turn?.toolCalls?.length ?? 0) > 0 && turn.toolCalls.every((c) => c.method && c.path && c.status), turn);
  expect(`tur ${id.slice(0, 8)} tamamlandı (gecikme kaydı)`, typeof turn?.latencyMs === "number" && turn.ok === true, turn);
}
const c = await call(MUSTERI, "GET", "/carrier/agent-traces");
expect("müşteri taşıyıcı izlerini okuyamaz (403)", c.status === 403, c);
const spoof = await call(MUSTERI, "POST", `/agent/turns/${asked[0] ?? "xxxxxxxx-none"}/complete`, { latencyMs: 1, replyChars: 1, ok: false });
expect("müşteri başkasının turunu güncelleyemez", spoof.status === 200 && spoof.body?.recorded === false, spoof);
console.log(`\n${pass} geçti, ${fail} kaldı`);
process.exit(fail ? 1 : 0);
