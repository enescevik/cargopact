// İstisna kuyruğu + manifest smoke (dağıtılmış API, gerçek token). Kullanım:
//   set -a; . ./.env.seed; set +a; NODE_PATH=packages/db/node_modules:node_modules node scripts/smoke-exceptions.mjs
import { CognitoIdentityProviderClient, InitiateAuthCommand } from "@aws-sdk/client-cognito-identity-provider";
const { API_URL, USER_POOL_CLIENT_ID, SEED_USER_PASSWORD, AWS_REGION } = process.env;
const cog = new CognitoIdentityProviderClient({ region: AWS_REGION });
const tokens = {};
const token = async (email) => tokens[email] ??= (await cog.send(new InitiateAuthCommand({ AuthFlow: "USER_PASSWORD_AUTH", ClientId: USER_POOL_CLIENT_ID, AuthParameters: { USERNAME: email, PASSWORD: SEED_USER_PASSWORD } }))).AuthenticationResult.IdToken;
async function call(email, method, path, body) {
  const r = await fetch(API_URL + path, { method, headers: { "content-type": "application/json", authorization: `Bearer ${await token(email)}` }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  return { status: r.status, body: t ? JSON.parse(t) : null };
}
let fail = 0;
const expect = (n, c, d) => { if (!c) fail++; console.log(`${c ? "✓" : "✗"} ${n}${c ? "" : "  → " + JSON.stringify(d).slice(0, 400)}`); };
const DINCER = "web.yonetici@cargopact.example.test", SIVA = "admin@siva.example.test", MUSTERI = "web.musteri@cargopact.example.test";

const list = await call(DINCER, "GET", "/carrier/exceptions");
expect("taşıyıcı listeyi görür", list.status === 200 && Array.isArray(list.body.items), list);
const items = list.body?.items ?? [];
const types = new Set(items.map((i) => i.type));
expect("GELMEDI ve EKSIK_HASAR seed istisnaları var", types.has("GELMEDI") && types.has("EKSIK_HASAR"), [...types]);
const it0 = items[0] ?? {};
expect("öğe alanları tam", ["id", "type", "severity", "title", "reservation", "tripReference", "detectedAt", "responsible", "reasonCode", "suggestedAction", "status"].every((k) => k in it0), it0);
expect("id deterministik (tür:rezervasyon)", it0.id === `${it0.type}:${it0.reservation?.id}`, it0.id);
expect("müşteri 403", (await call(MUSTERI, "GET", "/carrier/exceptions")).status === 403);
expect("müşteri manifest 403", (await call(MUSTERI, "GET", `/carrier/trips/${it0.tripId}/manifest`)).status === 403);
const siva = await call(SIVA, "GET", "/carrier/exceptions");
const mine = new Set(items.map((i) => i.id));
expect("Siva yöneticisi Dinçer istisnalarını görmez", siva.status === 200 && siva.body.items.every((i) => !mine.has(i.id)), siva.body);
const resolveCross = await call(SIVA, "POST", `/carrier/exceptions/${encodeURIComponent(it0.id)}/resolve`, { note: "yetkisiz" });
expect("Siva başkasının istisnasını çözemez (404)", resolveCross.status === 404, resolveCross);
expect("tripId filtresi", (await call(DINCER, "GET", `/carrier/exceptions?tripId=${it0.tripId}`)).body.items.every((i) => i.tripId === it0.tripId));
expect("geçersiz status 400", (await call(DINCER, "GET", "/carrier/exceptions?status=x")).status === 400);

const target = items.find((i) => i.type === "EKSIK_HASAR" && i.status === "open") ?? items.find((i) => i.status === "open");
const path = `/carrier/exceptions/${encodeURIComponent(target.id)}/resolve`;
expect("not zorunlu", (await call(DINCER, "POST", path, { note: "" })).status === 400);
const r1 = await call(DINCER, "POST", path, { note: "Müşteriyle görüşüldü, kısmi iade yapıldı." });
expect("çözümleme çalışır", r1.status === 200 && r1.body.status === "resolved" && r1.body.resolution.note.startsWith("Müşteriyle") && r1.body.alreadyResolved === false, r1);
const r2 = await call(DINCER, "POST", path, { note: "farklı not" });
expect("tekrar çözümleme idempotent (ilk not korunur)", r2.status === 200 && r2.body.alreadyResolved === true && r2.body.resolution.note.startsWith("Müşteriyle") && r2.body.resolution.at === r1.body.resolution.at, r2);
const res = await call(DINCER, "GET", "/carrier/exceptions?status=resolved");
expect("resolved filtresi çözümlenmişi içerir", res.body.items.some((i) => i.id === target.id && i.resolution?.by), res.body);
expect("open filtresi çözümlenmişi içermez", (await call(DINCER, "GET", "/carrier/exceptions?status=open")).body.items.every((i) => i.id !== target.id));
expect("bilinmeyen istisna 404", (await call(DINCER, "POST", "/carrier/exceptions/GELMEDI:00000000-0000-4000-8000-000000000000/resolve", { note: "x" })).status === 404);

const past = items.find((i) => i.tripReference === "DNC-PAST-GEB-ANK");
const mf = await call(DINCER, "GET", `/carrier/trips/${past.tripId}/manifest`);
const withCodes = (mf.body?.items ?? []).filter((r) => r.palletCodes.length > 0);
expect("manifest palet kodlarını listeler", mf.status === 200 && withCodes.length > 0 && withCodes.every((r) => r.palletCodes.length === r.pallets && /^CP-\d{4}-\d{6}-P1$/.test(r.palletCodes[0])), mf);
expect("manifest toplamlar tutarlı", mf.body.totals.pallets === mf.body.items.reduce((a, r) => a + r.pallets, 0) && mf.body.items.every((r) => !["RET", "IPTAL", "GELMEDI", "TASIYICI_ONAYI_BEKLIYOR"].includes(r.status)), mf.body.totals);
expect("manifest başka taşıyıcıda 404", (await call(SIVA, "GET", `/carrier/trips/${past.tripId}/manifest`)).status === 404);
console.log(fail ? `\n${fail} BAŞARISIZ` : "\nTümü geçti");
process.exit(fail ? 1 : 0);
