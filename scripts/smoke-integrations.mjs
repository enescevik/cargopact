// Entegrasyon katmanı uçtan uca: TMS içe aktarma, WMS palet olayı, EventBridge → SQS.
// Kullanım: set -a; . ./.env.seed; set +a; NODE_PATH=packages/db/node_modules:node_modules node scripts/smoke-integrations.mjs
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { CognitoIdentityProviderClient, InitiateAuthCommand } from "@aws-sdk/client-cognito-identity-provider";
const { API_URL, USER_POOL_CLIENT_ID, SEED_USER_PASSWORD, AWS_REGION = "us-east-1" } = process.env;
const QUEUE_URL = process.env.SUBSCRIBER_QUEUE_URL ?? "https://sqs.us-east-1.amazonaws.com/283216208163/cargopact-wms-erp-subscriber";
const cog = new CognitoIdentityProviderClient({ region: AWS_REGION });
const tokens = {};
async function token(email) {
  if (tokens[email]) return tokens[email];
  const r = await cog.send(new InitiateAuthCommand({ AuthFlow: "USER_PASSWORD_AUTH", ClientId: USER_POOL_CLIENT_ID, AuthParameters: { USERNAME: email, PASSWORD: SEED_USER_PASSWORD } }));
  return (tokens[email] = r.AuthenticationResult.IdToken);
}
async function call(email, method, path, body, headers = {}) {
  const h = { "content-type": "application/json", authorization: `Bearer ${await token(email)}`, ...headers };
  if (method !== "GET" && !("idempotency-key" in headers)) h["idempotency-key"] = randomUUID();
  const r = await fetch(API_URL + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
}
let pass = 0, fail = 0;
const expect = (name, cond, detail) => { cond ? pass++ : fail++; console.log(`${cond ? "✓" : "✗"} ${name}${cond ? "" : "  → " + JSON.stringify(detail).slice(0, 400)}`); };
const YONETICI = "web.yonetici@cargopact.example.test", MUSTERI = "web.musteri@cargopact.example.test";
const CARD = { holder: "Test Kullanıcı", number: "4242 4242 4242 4242", expiry: "12/30", cvc: "123" };

const run = Date.now().toString(36).toUpperCase();
const extNo = `TMS-SMOKE-${run}`;
const day = 86_400_000;
const dep = new Date(Date.now() + 45 * day);
const tms = { externalTripNo: extNo, originCode: "DNC-GEB-TM", destinationCode: "DNC-ANK-DM", plate: "41DNC101",
  plannedDeparture: dep.toISOString(), plannedArrival: new Date(dep.getTime() + 8 * 3_600_000).toISOString(), internalPallets: 10, internalKg: 6000, maxGrossKg: 24000 };
let tripId, resId;
try {
  let r = await call(YONETICI, "GET", "/carrier/integrations/status");
  expect("durum uç noktası bus adını döner", r.status === 200 && r.body.bus === "cargopact-events", r);
  const before = r.body.publishedCount;

  r = await call(MUSTERI, "POST", "/carrier/integrations/tms/trips", tms);
  expect("müşteri TMS uç noktasına erişemez (403)", r.status === 403, r);
  r = await call(YONETICI, "POST", "/carrier/integrations/tms/trips", { ...tms, originCode: "YOK-123" });
  expect("bilinmeyen tesis kodu 400", r.status === 400, r);

  r = await call(YONETICI, "POST", "/carrier/integrations/tms/trips", tms);
  tripId = r.body?.trip?.id;
  expect("TMS içe aktarma taslak sefer oluşturur (201)", r.status === 201 && r.body.created === true && r.body.trip.status === "draft" && r.body.trip.reference === extNo, r);
  r = await call(YONETICI, "POST", "/carrier/integrations/tms/trips", tms);
  expect("tekrar aynı seferi döner (idempotent, created=false)", r.status === 200 && r.body.created === false && r.body.trip.id === tripId, r);

  r = await call(YONETICI, "POST", `/carrier/trips/${tripId}/status`, { action: "publish" });
  expect("sefer yayınlandı", r.status === 200, r);
  r = await call(MUSTERI, "POST", "/customer/reservations", { tripId, pallets: 2, grossKg: 800, productClassCode: "GENEL", paymentPlan: "full", card: CARD });
  resId = r.body?.id;
  expect("müşteri rezervasyonu oluşturdu", r.status === 201, r);
  r = await call(YONETICI, "POST", `/carrier/reservations/${resId}/decision`, { decision: "approve" });
  const order = r.body?.orderNumber, codes = r.body?.palletCodes ?? [];
  expect("onay: sipariş no + 2 palet kodu", r.status === 200 && order && codes.length === 2, r);

  // WMS: tüm paletler bildirilince rezervasyon DEPO_KABUL olur.
  const at = new Date().toISOString();
  r = await call(YONETICI, "POST", "/warehouse/integrations/wms/pallet-events", { palletCode: codes[0], eventType: "RECEIVED", occurredAt: at });
  expect("WMS ilk palet: henüz geçiş yok", r.status === 200 && r.body.transitioned === false && r.body.palletsSeen === 1, r);
  r = await call(YONETICI, "POST", "/warehouse/integrations/wms/pallet-events", { palletCode: codes[0], eventType: "RECEIVED", occurredAt: at });
  expect("WMS aynı okutma tekrarı çift sayılmaz", r.status === 200 && r.body.palletsSeen === 1, r);
  r = await call(YONETICI, "POST", "/warehouse/integrations/wms/pallet-events", { palletCode: codes[1], eventType: "RECEIVED", occurredAt: at });
  expect("WMS son palet: DEPO_KABUL uygulandı", r.status === 200 && r.body.transitioned === true && r.body.reservationStatus === "DEPO_KABUL", r);
  r = await call(YONETICI, "POST", "/warehouse/integrations/wms/pallet-events", { palletCode: "CP-2026-999999-P1", eventType: "RECEIVED", occurredAt: at });
  expect("bilinmeyen palet 404", r.status === 404, r);
  r = await call(YONETICI, "POST", "/warehouse/integrations/wms/pallet-events", { palletCode: codes[0], eventType: "DELIVERED", occurredAt: at });
  expect("WMS DELIVERED alıcı kontrolünü atlayamaz (409 RECIPIENT_CHECK_REQUIRED)", r.status === 409 && r.body.details?.reason === "RECIPIENT_CHECK_REQUIRED", r);
  r = await call(MUSTERI, "POST", "/warehouse/integrations/wms/pallet-events", { palletCode: codes[0], eventType: "LOADED", occurredAt: at });
  expect("müşteri WMS uç noktasına erişemez (403)", r.status === 403, r);

  // EventBridge → SQS: zamanlanmış işçi ≤ ~90 sn içinde yayınlar.
  console.log("… SQS bekleniyor (en çok 120 sn)");
  const want = new Set(["reservation.requested", "reservation.approved", "warehouse.received"]);
  const got = new Set();
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline && got.size < want.size) {
    const out = execFileSync("aws", ["sqs", "receive-message", "--queue-url", QUEUE_URL, "--max-number-of-messages", "10", "--wait-time-seconds", "10", "--visibility-timeout", "2", "--region", AWS_REGION, "--output", "json"], { encoding: "utf8" });
    for (const m of JSON.parse(out || "{}").Messages ?? []) {
      const ev = JSON.parse(m.Body);
      if (ev.detail?.entityId === resId && ev["detail-type"]) got.add(ev["detail-type"]);
      if (ev.detail?.entityId === resId && ev["detail-type"] === "reservation.approved") {
        expect("olay kaynağı ve kişisel veri içermeyen gövde", ev.source === "cargopact.api" && ev.detail.orderNumber === order && !JSON.stringify(ev.detail).match(/@|iban|card/i), ev);
      }
    }
  }
  for (const t of want) expect(`SQS'te ${t} olayı göründü`, got.has(t), [...got]);
  r = await call(YONETICI, "GET", "/carrier/integrations/status");
  expect("yayın sayacı arttı, hata yok", r.body.publishedCount > before && r.body.lastPublishedAt && !r.body.lastError, r.body);
} finally {
  if (tripId) {
    const r = await call(YONETICI, "POST", `/carrier/trips/${tripId}/status`, { action: "cancel" });
    expect("temizlik: test seferi iptal edildi", r.status === 200 && r.body.status === "cancelled", r);
  }
}
console.log(`\n${pass} geçti, ${fail} kaldı`);
process.exit(fail ? 1 : 0);
