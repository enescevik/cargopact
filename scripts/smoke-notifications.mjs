// Uygulama içi bildirimler uçtan uca (dağıtılmış API, gerçek token). Kullanım:
//   set -a; . ./.env.seed; set +a; NODE_PATH=packages/db/node_modules:node_modules npx tsx scripts/smoke-notifications.mjs
// Sonunda `npm run demo:reset` çalıştırılır.
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { CognitoIdentityProviderClient, InitiateAuthCommand } from "@aws-sdk/client-cognito-identity-provider";
const { API_URL, USER_POOL_CLIENT_ID, SEED_USER_PASSWORD, AWS_REGION } = process.env;
const cog = new CognitoIdentityProviderClient({ region: AWS_REGION });
const tokens = {};
async function token(email) {
  if (tokens[email]) return tokens[email];
  const r = await cog.send(new InitiateAuthCommand({ AuthFlow: "USER_PASSWORD_AUTH", ClientId: USER_POOL_CLIENT_ID, AuthParameters: { USERNAME: email, PASSWORD: SEED_USER_PASSWORD } }));
  return (tokens[email] = r.AuthenticationResult.IdToken);
}
async function call(email, method, path, body) {
  if (method === "POST" && path === "/customer/reservations" && body && !("contract" in body)) {
    const pv = await call(email, "POST", `/customer/trips/${body.tripId}/contract-preview`, { pallets: body.pallets, grossKg: body.grossKg, volumeM3: body.volumeM3, productClassCode: body.productClassCode, paymentPlan: body.paymentPlan });
    if (pv.status !== 200) return pv;
    body = { ...body, contract: { version: pv.body.version, renderedHash: pv.body.renderedHash, signerName: "Test İmzacı", accepted: true } };
  }
  const h = { "content-type": "application/json", authorization: `Bearer ${await token(email)}` };
  if (method !== "GET") h["idempotency-key"] = randomUUID();
  const r = await fetch(API_URL + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
}
let pass = 0, fail = 0;
const expect = (name, cond, detail) => { cond ? pass++ : fail++; console.log(`${cond ? "✓" : "✗"} ${name}${cond ? "" : "  → " + JSON.stringify(detail).slice(0, 400)}`); };
const CARRIER = "web.yonetici@cargopact.example.test", CUSTOMER = "web.musteri@cargopact.example.test", OTHER = "user@baskent.example.test";
const CARD = { holder: "Test Kullanıcı", number: "4242 4242 4242 4242", expiry: "12/30", cvc: "123" };
const list = async (u, q = "") => (await call(u, "GET", "/notifications" + q)).body;
try {
  const tripId = (await call(CARRIER, "GET", "/carrier/dashboard")).body.trip.id;
  const cBefore = await list(CARRIER), uBefore = await list(CUSTOMER);
  const res = await call(CUSTOMER, "POST", "/customer/reservations", { tripId, pallets: 3, grossKg: 900, productClassCode: "GENEL", paymentPlan: "full", card: CARD });
  expect("rezervasyon oluşur", res.status === 201, res.body);
  const rid = res.body.id;
  const cAfter = await list(CARRIER);
  const req = cAfter.items.find((n) => n.reservationId === rid);
  expect("taşıyıcı 'Yeni talep' bildirimi alır", req && /^Yeni talep: .+ 3 palet$/.test(req.title) && req.audience === "carrier" && !req.readAt, cAfter.items.slice(0, 2));
  expect("taşıyıcı okunmamış sayısı artar", cAfter.unreadCount === cBefore.unreadCount + 1, [cBefore.unreadCount, cAfter.unreadCount]);
  expect("müşteri bu aşamada taşıyıcı bildirimini görmez", !(await list(CUSTOMER)).items.some((n) => n.id === req.id));
  expect("başka müşteri göremez", !(await list(OTHER)).items.some((n) => n.reservationId === rid));
  const appr = await call(CARRIER, "POST", `/carrier/reservations/${rid}/decision`, { decision: "approve" });
  expect("onay", appr.status === 200, appr.body);
  const uAfter = await list(CUSTOMER);
  const ok = uAfter.items.find((n) => n.reservationId === rid && n.type === "RESERVATION_APPROVED");
  expect("müşteri 'onaylandı' bildirimi alır (CP-…, son kabul)", ok && /onaylandı · CP-\d{4}-\d{6}, son kabul \d{2}:\d{2}/.test(ok.title) && ok.audience === "customer", uAfter.items.slice(0, 2));
  await call(CARRIER, "POST", `/carrier/reservations/${rid}/decision`, { decision: "approve" });
  expect("onay tekrarı ikinci bildirim üretmez", (await list(CUSTOMER)).items.filter((n) => n.reservationId === rid && n.type === "RESERVATION_APPROVED").length === 1);
  const unreadOnly = await list(CUSTOMER, "?unread=true");
  expect("unread filtresi", unreadOnly.items.every((n) => !n.readAt) && unreadOnly.items.some((n) => n.id === ok.id), unreadOnly);
  // yetki: müşteri taşıyıcı bildirimini okuyamaz, başka firma da müşterinin bildirimini
  const x1 = await call(CUSTOMER, "POST", `/notifications/${req.id}/read`);
  expect("müşteri taşıyıcı bildirimini okuyamaz (404)", x1.status === 404, x1);
  const x2 = await call(OTHER, "POST", `/notifications/${ok.id}/read`);
  expect("başka firma müşteri bildirimini okuyamaz (404)", x2.status === 404, x2);
  expect("taşıyıcı bildirimi hâlâ okunmamış", (await list(CARRIER)).items.find((n) => n.id === req.id).readAt === null);
  const r1 = await call(CUSTOMER, "POST", `/notifications/${ok.id}/read`);
  const r2 = await call(CUSTOMER, "POST", `/notifications/${ok.id}/read`);
  expect("okundu işaretle (idempotent)", r1.status === 200 && r2.status === 200 && (await list(CUSTOMER)).items.find((n) => n.id === ok.id).readAt, [r1, r2]);
  const ra = await call(CARRIER, "POST", "/notifications/read-all");
  const ra2 = await call(CARRIER, "POST", "/notifications/read-all");
  const after = await list(CARRIER);
  expect("read-all: hepsi okundu, tekrarı 0 günceller", ra.status === 200 && ra2.body.updated === 0 && after.unreadCount === 0 && after.items.every((n) => n.readAt), [ra.body, ra2.body, after.unreadCount]);
  expect("read-all müşteri bildirimlerine dokunmaz", (await list(CUSTOMER, "?unread=true")).unreadCount === (await list(CUSTOMER)).unreadCount);
  expect("geçersiz id 404", (await call(CUSTOMER, "POST", "/notifications/not-a-uuid/read")).status === 404);
  await call(CUSTOMER, "POST", `/customer/reservations/${rid}/cancel`, { reason: "smoke" });
  expect("müşteri iptali taşıyıcıya bildirim", (await list(CARRIER)).items.some((n) => n.reservationId === rid && n.type === "RESERVATION_CANCELLED"));
} finally {
  console.log("temizlik: demo:reset");
  try { execSync("npm run demo:reset", { stdio: "ignore", cwd: new URL("..", import.meta.url).pathname }); } catch (e) { console.log("demo:reset başarısız:", e.message); }
}
console.log(`\n${pass} geçti, ${fail} kaldı`);
process.exit(fail ? 1 : 0);
