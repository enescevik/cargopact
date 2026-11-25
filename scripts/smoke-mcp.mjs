// AgentCore Gateway (MCP) smoke: gerçek Cognito ID token ile araç listesi + çağrılar + /chat.
//   set -a; . ./.env.seed; set +a; GATEWAY_URL=... NODE_PATH=packages/db/node_modules:node_modules node scripts/smoke-mcp.mjs
import { CognitoIdentityProviderClient, InitiateAuthCommand } from "@aws-sdk/client-cognito-identity-provider";
const { API_URL, USER_POOL_CLIENT_ID, SEED_USER_PASSWORD, AWS_REGION } = process.env;
const GATEWAY_URL = process.env.GATEWAY_URL || "https://cargopact-gateway-qo5prbreci.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp";
const cog = new CognitoIdentityProviderClient({ region: AWS_REGION });
const tokens = {};
const token = async (e) => tokens[e] ??= (await cog.send(new InitiateAuthCommand({ AuthFlow: "USER_PASSWORD_AUTH", ClientId: USER_POOL_CLIENT_ID, AuthParameters: { USERNAME: e, PASSWORD: SEED_USER_PASSWORD } }))).AuthenticationResult.IdToken;
const DINCER = "web.yonetici@cargopact.example.test", MUSTERI = "web.musteri@cargopact.example.test";
let id = 0;
async function rpc(email, method, params, { userToken, noAuth } = {}) {
  const t = await token(email);
  const headers = { "content-type": "application/json", accept: "application/json, text/event-stream" };
  if (!noAuth) headers.authorization = `Bearer ${t}`;
  headers["x-user-token"] = userToken ?? t;
  const r = await fetch(GATEWAY_URL, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) });
  const text = await r.text();
  let body = null;
  try { body = JSON.parse(text.startsWith("event:") || text.startsWith("data:") ? text.split("\n").find((l) => l.startsWith("data:")).slice(5) : text); } catch {}
  return { status: r.status, body, text };
}
const callTool = async (email, name, args = {}, o) => {
  const r = await rpc(email, "tools/call", { name: `cargopact-mcp-tools___${name}`, arguments: args }, o);
  const txt = r.body?.result?.content?.[0]?.text;
  let data = null; try { data = JSON.parse(txt); } catch {}
  return { ...r, data };
};
let fail = 0;
const expect = (n, c, d) => { if (!c) fail++; console.log(`${c ? "✓" : "✗"} ${n}${c ? "" : "  → " + JSON.stringify(d).slice(0, 500)}`); };

const noauth = await rpc(MUSTERI, "tools/list", {}, { noAuth: true });
expect("Authorization olmadan 401", noauth.status === 401, noauth.status);
const list = await rpc(MUSTERI, "tools/list", {});
const names = (list.body?.result?.tools ?? []).map((t) => t.name.split("___").pop());
expect("tools/list 8 araç", names.length === 8 && ["search_trips", "carrier_trip_detail", "carrier_kpis"].every((n) => names.includes(n)), list.text.slice(0, 300));

const st = await callTool(MUSTERI, "search_trips", { pallets: 2 });
expect("müşteri search_trips seferleri döner", Array.isArray(st.data?.items) && st.data.items.length > 0, st.text.slice(0, 400));
const mr = await callTool(MUSTERI, "my_reservations");
expect("müşteri my_reservations", Array.isArray(mr.data?.items), mr.text.slice(0, 300));
const cust403 = await callTool(MUSTERI, "carrier_trips");
expect("müşteri carrier_trips -> backend 403", cust403.data?.error === true && cust403.data?.status === 403, cust403.text.slice(0, 300));
const ct = await callTool(DINCER, "carrier_trips");
const tripId = ct.data?.items?.[0]?.id;
expect("taşıyıcı carrier_trips", !!tripId, ct.text.slice(0, 300));
const cd = await callTool(DINCER, "carrier_trip_detail", { tripId });
expect("taşıyıcı carrier_trip_detail", cd.data?.id === tripId && Array.isArray(cd.data?.reservations), cd.text.slice(0, 300));
const cdash = await callTool(DINCER, "carrier_dashboard", {});
expect("taşıyıcı carrier_dashboard", cdash.data && !cdash.data.error, cdash.text.slice(0, 300));
const missing = await callTool(DINCER, "carrier_trip_detail", { tripId }, { userToken: "x.y.z" });
expect("geçersiz X-User-Token -> backend 401", missing.data?.error === true && missing.data?.status === 401, missing.text.slice(0, 300));

if (API_URL && process.env.WITH_CHAT !== "0") {
  const chat = async (email, message) => {
    const r = await fetch(API_URL + "/chat", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${await token(email)}` }, body: JSON.stringify({ message, sessionId: "smoke-mcp-" + Date.now() + "-0000000000000000000" }) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const t0 = Date.now();
  const c1 = await chat(MUSTERI, "Gebze'den Ankara'ya 2 palet için uygun seferler neler? Kısaca listele.");
  expect(`/chat müşteri yanıtı (${Date.now() - t0} ms)`, c1.status === 200 && !!c1.body.reply, c1);
  console.log("  reply:", String(c1.body.reply).slice(0, 300).replace(/\n/g, " "));
  const t1 = Date.now();
  const c2 = await chat(DINCER, "Bekleyen taleplerin öncelik sırası nedir? En yakın seferi özetle.");
  expect(`/chat taşıyıcı yanıtı (${Date.now() - t1} ms)`, c2.status === 200 && !!c2.body.reply, c2);
  console.log("  reply:", String(c2.body.reply).slice(0, 300).replace(/\n/g, " "));
}
console.log(fail ? `\n${fail} başarısız` : "\nTamam");
process.exit(fail ? 1 : 0);
