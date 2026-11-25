// Jüri akışı uçtan uca (dağıtılmış API, gerçek token). Kullanım:
//   set -a; . ./.env.seed; set +a; NODE_PATH=packages/db/node_modules:node_modules npx tsx scripts/smoke-demo.mjs
// Sonunda demo seed yeniden çalıştırılır (demo sefer 25/33'e döner).
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
async function call(email, method, path, body, headers = {}) {
  const h = { "content-type": "application/json", ...headers };
  if (email) h.authorization = `Bearer ${await token(email)}`;
  if (method !== "GET" && !("idempotency-key" in headers)) h["idempotency-key"] = randomUUID();
  const r = await fetch(API_URL + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null, headers: r.headers };
}
let pass = 0, fail = 0;
const expect = (name, cond, detail) => { cond ? pass++ : fail++; console.log(`${cond ? "✓" : "✗"} ${name}${cond ? "" : "  → " + JSON.stringify(detail).slice(0, 400)}`); };

const YONETICI = "web.yonetici@cargopact.example.test", MYONETICI = "mobil.yonetici@cargopact.example.test";
const MARMARA = "web.musteri@cargopact.example.test", ANADOLU = "mobil.musteri@cargopact.example.test", BASKENT = "user@baskent.example.test", EGE = "user@ege.example.test";
const SIVA = "admin@siva.example.test";
const CARD = { holder: "Test Kullanıcı", number: "4242 4242 4242 4242", expiry: "12/30", cvc: "123" };

const dash = async () => (await call(YONETICI, "GET", "/carrier/dashboard")).body;
let d = await dash();
expect("demo sefer 25/33 ile başlar", d.trip.reference === "DNC-DEMO-GEB-ANK" && d.trip.capacity.plannedPallets === 25 && d.trip.capacity.totalPositions === 33 && d.trip.capacity.sellable.pallets === 8, d.trip.capacity);
const tripId = d.trip.id;
expect("başlangıçta bekleyen/rezervasyon yok", d.customers.length === 0 && d.trip.pendingCount === 0, d.customers);

const search = await call(MARMARA, "GET", "/customer/trips");
expect("müşteri sefer arar (published)", search.status === 200 && search.body.items.some((t) => t.id === tripId) && search.body.items.every((t) => t.price.unitPriceMinor > 0), search.body);
const filtered = await call(MARMARA, "GET", "/customer/trips?originCity=Kocaeli&destinationCity=Ankara&pallets=3");
expect("şehir filtresi", filtered.body.items.length >= 1 && filtered.body.items.every((t) => t.destination.city === "Ankara"), filtered.body);

async function quote(user, pallets, grossKg) {
  return call(user, "POST", `/customer/trips/${tripId}/quote`, { pallets, grossKg, productClassCode: "GENEL" });
}
async function reserve(user, pallets, grossKg, plan, card = CARD, key) {
  return call(user, "POST", "/customer/reservations", { tripId, pallets, grossKg, productClassCode: "GENEL", paymentPlan: plan, card }, key ? { "idempotency-key": key } : {});
}
const decide = (id, decision, reason) => call(YONETICI, "POST", `/carrier/reservations/${id}/decision`, { decision, reason });
const event = (user, id, type, extra = {}) => call(user, "POST", `/carrier/reservations/${id}/events`, { type, ...extra });

// 1) Marmara 3 palet / 1500 kg tam ödeme
let q = await quote(MARMARA, 3, 1500);
expect("Marmara quote uygun, fiyat dökümü var", q.status === 200 && q.body.eligible === true && q.body.price.breakdown.explanation.length > 0 && q.body.paymentPlans.length === 2, q.body);
const dBefore = await dash();
const key1 = randomUUID();
let r = await reserve(MARMARA, 3, 1500, "full", CARD, key1);
expect("Marmara rezervasyon 201 + bekliyor", r.status === 201 && r.body.status === "TASIYICI_ONAYI_BEKLIYOR" && r.body.payment.status === "authorized" && r.body.holdExpiresAt, r.body);
const marmara = r.body;
expect("fiyat sunucuda hesaplandı", marmara.unitPriceMinor === q.body.price.unitPriceMinor && marmara.totalPriceMinor === marmara.unitPriceMinor * 3, marmara);
const replay = await reserve(MARMARA, 3, 1500, "full", CARD, key1);
expect("aynı Idempotency-Key aynı rezervasyon", replay.body?.id === marmara.id, replay.body);
d = await dash();
expect("blokaj: held 3, planned hâlâ 25", d.trip.capacity.heldPallets === 3 && d.trip.capacity.plannedPallets === 25 && d.trip.pendingCount === 1, d.trip.capacity);
const detail = await call(YONETICI, "GET", `/carrier/trips/${tripId}`);
expect("taşıyıcı ayrıntı: CarrierReservation alanları", detail.body.reservations[0].priorityRank === 1 && detail.body.reservations[0].eligibility.eligible === true && "verifiedNoShows" in detail.body.reservations[0], detail.body.reservations?.[0]);
r = await decide(marmara.id, "approve");
expect("Marmara onay → ONAYLI + CP-… + palet kodları", r.status === 200 && r.body.status === "ONAYLI" && /^CP-\d{4}-\d{6}$/.test(r.body.orderNumber) && r.body.palletCodes.length === 3 && r.body.palletCodes[0] === `${r.body.orderNumber}-P1`, r.body);
expect("tam ödeme tahsil edildi", r.body.payment.status === "captured" && r.body.payment.paidMinor === marmara.totalPriceMinor, r.body.payment);
const marmaraOrder = r.body.orderNumber;
d = await dash();
expect("planlanan 28/33", d.trip.capacity.plannedPallets === 28 && d.trip.capacity.heldPallets === 0, d.trip.capacity);
r = await decide(marmara.id, "approve");
expect("çift onay aynı sipariş numarası", r.status === 200 && r.body.orderNumber === marmaraOrder, r.body);

// 2) Anadolu 2 palet / 1200 kg kapora
r = await reserve(ANADOLU, 2, 1200, "deposit");
expect("Anadolu rezervasyon (kapora)", r.status === 201 && r.body.paymentPlan === "deposit" && r.body.payment.entries[0].amountMinor === Math.floor(r.body.totalPriceMinor * 0.3), r.body);
const anadolu = r.body;
r = await decide(anadolu.id, "approve");
expect("Anadolu onay, %30 tahsil", r.body.status === "ONAYLI" && r.body.payment.paidMinor === Math.floor(anadolu.totalPriceMinor * 0.3) && r.body.payment.status === "partially_captured" && r.body.payment.dueMinor > 0, r.body.payment);
expect("sipariş numaraları farklı", r.body.orderNumber !== marmaraOrder, r.body.orderNumber);
const anadoluOrder = r.body.orderNumber;
d = await dash();
expect("planlanan 30/33", d.trip.capacity.plannedPallets === 30, d.trip.capacity);

// 3) Başkent 3 palet / 2600 kg → uygunsuz
q = await quote(BASKENT, 3, 2600);
const codes = (q.body.reasons ?? []).map((x) => x.code);
expect("Başkent 2600 kg uygunsuz (MAX_GROSS_EXCEEDED, INSUFFICIENT_KG)", q.status === 200 && q.body.eligible === false && codes.includes("MAX_GROSS_EXCEEDED") && codes.includes("INSUFFICIENT_KG"), q.body);
r = await reserve(BASKENT, 3, 2600, "full");
expect("uygunsuz talep rezervasyon 400 + reasons", r.status === 400 && r.body.details?.reasons?.length >= 1, r.body);
d = await dash();
expect("uygunsuz talep kapasiteyi değiştirmedi", d.trip.capacity.heldPallets === 0 && d.trip.capacity.plannedPallets === 30, d.trip.capacity);
q = await quote(BASKENT, 3, 1900);
expect("Başkent 1900 kg uygun", q.body.eligible === true, q.body);
const dp = d.trip.capacity;
r = await reserve(BASKENT, 3, 1900, "full");
const baskent = r.body;
expect("Başkent rezervasyon 201", r.status === 201, r.body);
r = await decide(baskent.id, "approve");
expect("Başkent onay", r.body.status === "ONAYLI", r.body);
const baskentOrder = r.body.orderNumber;
d = await dash();
expect("planlanan 33/33, kg dolu", d.trip.capacity.plannedPallets === 33 && d.trip.capacity.plannedGrossKg === 17000 + 1500 + 1200 + 1900, d.trip.capacity);
expect("dashboard geliri/maliyeti", d.grossRevenueMinor > 0 && d.variableCostMinor === 8 * 20000 && d.contributionMinor === d.grossRevenueMinor - d.variableCostMinor && d.customers.length === 3, d);

// 4) Depo olayları
r = await event(YONETICI, marmara.id, "YUKLENDI");
expect("sıra dışı olay 409 INVALID_TRANSITION", r.status === 409 && r.body.details?.reason === "INVALID_TRANSITION", r.body);
r = await event(YONETICI, marmara.id, "GELMEDI");
expect("T−1 öncesi GELMEDI reddedilir", r.status === 409, r.body);
for (const id of [marmara.id, anadolu.id, baskent.id]) {
  const a = await event(MYONETICI, id, "DEPO_KABUL");
  const b = await event(MYONETICI, id, "YUKLENDI");
  expect(`depo kabul + yükleme (${id.slice(0, 6)})`, a.body?.status === "DEPO_KABUL" && b.body?.status === "YUKLENDI", [a.body, b.body]);
  if (id === anadolu.id) expect("depo kabulde kalan kapora tahsil", a.body.payment.status === "captured" && a.body.payment.dueMinor === 0, a.body.payment);
}
r = await event(MYONETICI, marmara.id, "YUKLENDI");
d = await dash();
expect("tekrarlanan olay çift hareket üretmez; fiili 33/33", r.status === 200 && d.trip.capacity.actualPallets === 33 && d.trip.capacity.loaded.pallets === 8, d.trip.capacity);
r = await event(MYONETICI, marmara.id, "VARISTA");
r = await event(MYONETICI, marmara.id, "TESLIM");
expect("TESLIM alıcı adı olmadan 400", r.status === 400 && r.body?.details?.field === "recipientName", r.body);
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const podUrl = (id, kind) => call(MYONETICI, "POST", `/carrier/reservations/${id}/pod-upload-url`, { kind, contentType: "image/png" });
const up1 = await podUrl(marmara.id, "photo"), up2 = await podUrl(marmara.id, "signature");
expect("pod-upload-url: anahtar pod/<taşıyıcı>/<rez>/<uuid>.png + 300 sn", up1.status === 200 && new RegExp(`^pod/[0-9a-f-]{36}/${marmara.id}/[0-9a-f-]{36}\\.png$`).test(up1.body.key) && up1.body.expiresIn === 300 && up1.body.uploadUrl.startsWith("https://"), up1.body);
for (const u of [up1, up2]) {
  const put = await fetch(u.body.uploadUrl, { method: "PUT", headers: { "content-type": "image/png" }, body: PNG });
  expect("presigned PUT 200", put.status === 200, put.status);
}
r = await event(MYONETICI, marmara.id, "TESLIM", { recipientName: "Ayşe Alıcı", podKeys: [`pod/${randomUUID()}/${randomUUID()}/${randomUUID()}.png`] });
expect("başka rezervasyon önekli podKey 400", r.status === 400 && r.body?.details?.field === "podKeys", r.body);
r = await event(MYONETICI, marmara.id, "TESLIM", { recipientName: "Ayşe Alıcı", podKeys: [up1.body.key, up2.body.key] });
expect("VARISTA → TESLIM (alıcı + 2 e-POD dosyası)", r.body?.status === "TESLIM" && r.body.pod?.recipientName === "Ayşe Alıcı" && r.body.pod.attachments.length === 2, r.body);
const podRes = await call(MARMARA, "GET", `/customer/reservations/${marmara.id}`);
const podAtt = podRes.body.pod?.attachments ?? [];
const teslimEv = podRes.body.events.find((e) => e.type === "TESLIM");
expect("müşteri kendi e-POD'unu görür (pod + events[].attachments)", podAtt.length === 2 && podAtt.map((a) => a.kind).sort().join() === "photo,signature" && teslimEv.attachments.length === 2 && podRes.body.pod.deliveredAt, podRes.body.pod);
const dl = await fetch(podAtt[0].url);
const dlBuf = Buffer.from(await dl.arrayBuffer());
expect("e-POD presigned GET 200 ve içerik aynı", dl.status === 200 && dlBuf.equals(PNG), dl.status);
r = await podUrl(marmara.id, "photo");
expect("TESLIM sonrası yeni e-POD URL'si 409", r.status === 409, r.body);

// 5) Takip ve kiracı izolasyonu
let tr = await call(MARMARA, "GET", `/customer/orders/${marmaraOrder}/tracking`);
expect("takip: TESLIM, adımlar, palet kodları", tr.status === 200 && tr.body.status === "TESLIM" && tr.body.steps.filter((s) => s.done).length >= 5 && tr.body.palletCodes.length === 3 && tr.body.destination.city === "Ankara", tr.body);
tr = await call(ANADOLU, "GET", `/customer/orders/${marmaraOrder}/tracking`);
expect("başka müşterinin siparişi 404", tr.status === 404, tr.body);
tr = await call(ANADOLU, "GET", `/customer/reservations/${marmara.id}`);
expect("başka müşterinin rezervasyonu 404", tr.status === 404, tr.body);
tr = await call(ANADOLU, "GET", `/customer/orders/${anadoluOrder}/tracking`);
expect("kendi siparişi: YUKLENDI", tr.status === 200 && tr.body.status === "YUKLENDI" && tr.body.nextStep.length > 0, tr.body);
const list = await call(ANADOLU, "GET", "/customer/reservations");
expect("müşteri listesi yalnız kendi + 'verifiedNoShows' sızmaz", list.body.items.every((x) => x.customer.name === "Anadolu Parsiyel" && !("verifiedNoShows" in x)), list.body.items.map((x) => x.customer));
r = await call(SIVA, "GET", `/carrier/trips/${tripId}`);
expect("Siva yöneticisi Dinçer seferini göremez (404)", r.status === 404, r.body);
r = await call(SIVA, "POST", `/carrier/reservations/${marmara.id}/decision`, { decision: "approve" });
expect("Siva başka taşıyıcının rezervasyonunu onaylayamaz (404)", r.status === 404, r.body);
r = await call(MARMARA, "GET", "/carrier/trips");
expect("müşteri taşıyıcı uçlarına giremez (403)", r.status === 403, r.body);

// 6) Reddedilen kart
d = await dash();
const capBefore = JSON.stringify(d.trip.capacity);
r = await reserve(MARMARA, 1, 500, "full", { ...CARD, number: "4000000000000002" });
d = await dash();
expect("reddedilen kart: 400 PAYMENT_DECLINED, kapasite değişmez", r.status === 400 && r.body.details?.reason === "PAYMENT_DECLINED" && JSON.stringify(d.trip.capacity) === capBefore, r.body);

// 7) Ret + süre/iptal akışı (BRS seferinde)
const brs = search.body.items.find((t) => t.reference === "DNC-GEB-BRS");
const brsBefore = (await call(MARMARA, "GET", `/customer/trips/${brs.id}`)).body.remaining.pallets;
r = await call(MARMARA, "POST", "/customer/reservations", { tripId: brs.id, pallets: 1, grossKg: 300, productClassCode: "GENEL", paymentPlan: "full", card: CARD });
expect("BRS rezervasyonu", r.status === 201, r.body);
const brsRes = r.body;
const pv = await call(MARMARA, "GET", `/customer/reservations/${brsRes.id}/cancel-preview`);
expect("iptal önizleme (onay öncesi tam serbest)", pv.status === 200 && pv.body.feeMinor === 0 && pv.body.refundMinor === brsRes.totalPriceMinor, pv.body);
r = await call(YONETICI, "POST", `/carrier/reservations/${brsRes.id}/decision`, { decision: "reject" });
expect("ret gerekçesiz 400", r.status === 400, r.body);
r = await decide(brsRes.id, "reject", "Araç dolu");
expect("ret: RET + provizyon serbest", r.body.status === "RET" && r.body.payment.status === "released" && r.body.decisionReason === "Araç dolu", r.body);
r = await decide(brsRes.id, "reject", "Araç dolu");
const brsAfter = (await call(MARMARA, "GET", `/customer/trips/${brs.id}`)).body.remaining.pallets;
expect("ret kapasiteyi bir kez iade eder", r.status === 200 && brsAfter === brsBefore, [brsBefore, brsAfter]);
r = await call(MARMARA, "POST", "/customer/reservations", { tripId: brs.id, pallets: 1, grossKg: 300, productClassCode: "GENEL", paymentPlan: "full", card: CARD });
const c2 = r.body;
r = await call(MARMARA, "POST", `/customer/reservations/${c2.id}/cancel`, { reason: "Vazgeçtim" });
const cancelRes = r.body;
const again = await call(MARMARA, "POST", `/customer/reservations/${c2.id}/cancel`, {});
const brsAfter2 = (await call(MARMARA, "GET", `/customer/trips/${brs.id}`)).body.remaining.pallets;
expect("müşteri iptali: IPTAL, tekrar aynı, kapasite bir kez iade", cancelRes.status === "IPTAL" && again.body.status === "IPTAL" && brsAfter2 === brsBefore, [cancelRes.status, brsAfter2]);

// 8) Yarış: son palet için iki müşteri
const facs = (await call(YONETICI, "GET", "/carrier/facilities?limit=200")).body.items;
const vehs = (await call(YONETICI, "GET", "/carrier/vehicles?limit=200")).body.items;
const o = facs.find((f) => f.code === "DNC-GEB-TM"), de = facs.find((f) => f.code === "DNC-BRS-DM"), v = vehs.find((x) => x.plate === "41DNC201");
const day = 20 + Math.floor(Math.random() * 300);
const dep = new Date(Date.now() + day * 86_400_000), arr = new Date(dep.getTime() + 3 * 3_600_000);
r = await call(YONETICI, "POST", "/carrier/trips", {
  originFacilityId: o.id, destinationFacilityId: de.id, vehicleId: v.id, departureAt: dep.toISOString(), arrivalEta: arr.toISOString(),
  internalPallets: 1, internalKg: 500, maxGrossKg: 5000, sellablePallets: 1, sellableKg: 800, sellableM3: 3, basePriceMinor: 50000, publish: true,
});
expect("POST /carrier/trips 201 (aracım var, yük ekle)", r.status === 201 && r.body.status === "published" && r.body.capacity.remaining.pallets === 1, r.body);
const raceTrip = r.body;
r = await call(YONETICI, "POST", "/carrier/trips", {
  originFacilityId: o.id, destinationFacilityId: de.id, vehicleId: v.id, departureAt: dep.toISOString(), arrivalEta: arr.toISOString(),
  internalPallets: 1, internalKg: 500, maxGrossKg: 5000, sellablePallets: 1, sellableKg: 800, sellableM3: 3, basePriceMinor: 50000, publish: true,
});
expect("aynı araç aynı aralık: 409 VEHICLE_OVERLAP", r.status === 409, r.body);
const body = { tripId: raceTrip.id, pallets: 1, grossKg: 400, productClassCode: "GENEL", paymentPlan: "full", card: CARD };
const [a, b] = await Promise.all([call(MARMARA, "POST", "/customer/reservations", body), call(EGE, "POST", "/customer/reservations", body)]);
const wins = [a, b].filter((x) => x.status === 201).length;
const losers = [a, b].filter((x) => x.status !== 201);
expect("son palet yarışı: yalnız biri kazanır, diğeri 409/400", wins === 1 && losers.length === 1 && [409, 400].includes(losers[0].status), [a.status, b.status, losers[0]?.body]);
const rt = (await call(YONETICI, "GET", `/carrier/trips/${raceTrip.id}`)).body;
expect("yarış sonrası held = 1, taşma yok", rt.capacity.heldPallets === 1 && rt.capacity.remaining.pallets === 0 && rt.reservations.length === 1, rt.capacity);
r = await call(YONETICI, "POST", `/carrier/trips/${raceTrip.id}/status`, { action: "cancel" });
const rt2 = (await call(YONETICI, "GET", `/carrier/trips/${raceTrip.id}`)).body;
expect("sefer iptali: bekleyen talep iade, sefer cancelled", r.body.status === "cancelled" && rt2.capacity.heldPallets === 0 && rt2.reservations[0].status === "IPTAL" && rt2.reservations[0].payment.status === "released", rt2);

// 8b) Sefer düzenleme + yeniden değerlendirme
const v2 = vehs.find((x) => x.plate === "41DNC201");
r = await call(YONETICI, "POST", "/carrier/trips", {
  originFacilityId: o.id, destinationFacilityId: de.id, vehicleId: v2.id, departureAt: dep.toISOString(), arrivalEta: arr.toISOString(),
  internalPallets: 1, internalKg: 500, maxGrossKg: 5000, sellablePallets: 2, sellableKg: 1000, sellableM3: 4, basePriceMinor: 50000, publish: true,
});
expect("yeniden değerlendirme için taze sefer", r.status === 201 && r.body.version >= 1 && r.body.capacityVersion >= 1, r.body);
const ed = r.body;
const put = (body, ver = ed.version) => call(YONETICI, "PUT", `/carrier/trips/${ed.id}`, body, { "if-match": String(ver) });
r = await call(MARMARA, "POST", "/customer/reservations", { tripId: ed.id, pallets: 1, grossKg: 400, productClassCode: "GENEL", paymentPlan: "full", card: CARD });
expect("taze seferde bekleyen talep", r.status === 201, r.body);
const pend = r.body;
r = await put({ sellablePallets: 0 });
expect("PUT sellable < bloke → 409 CAPACITY_BELOW_COMMITTED", r.status === 409 && r.body.details?.reason === "CAPACITY_BELOW_COMMITTED", r.body);
r = await call(MARMARA, "PUT", `/carrier/trips/${ed.id}`, { sellablePallets: 3 }, { "if-match": String(ed.version) });
expect("müşteri PUT /carrier/trips 403", r.status === 403, r.body);
r = await put({ maxGrossKg: 800 }, ed.version + 5);
expect("PUT eski sürüm → 409 VERSION_MISMATCH", r.status === 409 && r.body.details?.reason === "VERSION_MISMATCH", r.body);
r = await put({ maxGrossKg: 800 });
expect("PUT maxGross düşür → sürüm/capacityVersion artar, bekleyen needsReview", r.status === 200 && r.body.version === ed.version + 1 && r.body.capacityVersion === ed.capacityVersion + 1 && r.body.needsReviewCount === 1 && r.body.reevaluated[0].eligible === false, r.body);
let edDetail = (await call(YONETICI, "GET", `/carrier/trips/${ed.id}`)).body;
const pr = edDetail.reservations.find((x) => x.id === pend.id);
expect("CarrierReservation.needsReview + gerekçe + denetim olayı", pr.needsReview === true && pr.eligibility.eligible === false && pr.events.some((e) => e.type === "YENIDEN_DEGERLENDIRME"), pr);
const custView = (await call(MARMARA, "GET", `/customer/reservations/${pend.id}`)).body;
expect("müşteri görünümünde needsReview/iç olay yok", !("needsReview" in custView) && !custView.events.some((e) => e.type === "YENIDEN_DEGERLENDIRME"), custView.events);
r = await decide(pend.id, "approve");
expect("needsReview talep onayı → 409 NOT_ELIGIBLE", r.status === 409 && r.body.details?.reason === "NOT_ELIGIBLE", r.body);
r = await put({ maxGrossKg: 5000 }, ed.version + 1);
edDetail = (await call(YONETICI, "GET", `/carrier/trips/${ed.id}`)).body;
expect("kapasite geri açılınca needsReview kalkar", r.status === 200 && r.body.needsReviewCount === 0 && edDetail.reservations.find((x) => x.id === pend.id).needsReview === false, r.body);
r = await call(YONETICI, "POST", `/carrier/trips/${ed.id}/status`, { action: "cancel" });
expect("taze sefer temizlendi (iptal)", r.body.status === "cancelled", r.body);

// 9) Demo seed'i yeniden çalıştır → 25/33
try {
  execSync("npx tsx packages/db/src/cli.ts seed-demo", { stdio: "pipe", env: process.env, cwd: process.cwd() });
  d = await dash();
  expect("demo seed sonrası 25/33 ve rezervasyonsuz", d.trip.capacity.plannedPallets === 25 && d.trip.capacity.heldPallets === 0 && d.customers.length === 0, d.trip.capacity);
} catch (e) {
  expect("demo seed yeniden çalıştırıldı", false, String(e.stderr ?? e));
}
console.log(`\nSONUÇ: ${pass} geçti, ${fail} kaldı`);
process.exit(fail ? 1 : 0);
