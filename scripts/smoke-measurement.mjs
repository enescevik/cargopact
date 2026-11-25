// Depo ölçümü / kısmi kabul / ret uçtan uca (dağıtılmış API, gerçek token). Kullanım:
//   set -a; . ./.env.seed; set +a; NODE_PATH=packages/db/node_modules:node_modules npx tsx scripts/smoke-measurement.mjs
// Kendi taze seferini oluşturur; sonunda seferi iptal eder ve `npm run demo:reset` çalıştırır.
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
  return { status: r.status, body: text ? JSON.parse(text) : null };
}
let pass = 0, fail = 0;
const expect = (name, cond, detail) => { cond ? pass++ : fail++; console.log(`${cond ? "✓" : "✗"} ${name}${cond ? "" : "  → " + JSON.stringify(detail).slice(0, 500)}`); };
const YONETICI = "web.yonetici@cargopact.example.test";
const MARMARA = "web.musteri@cargopact.example.test", ANADOLU = "mobil.musteri@cargopact.example.test", BASKENT = "user@baskent.example.test", EGE = "user@ege.example.test";
const CARD = { holder: "Test Kullanıcı", number: "4242 4242 4242 4242", expiry: "12/30", cvc: "123" };
const sum = (res, t) => res.payment.entries.filter((e) => e.type === t).reduce((a, e) => a + e.amountMinor, 0);

// --- taze sefer (seed seferinin tesis/araç bilgisiyle, uzak tarihte) ---
const list = await call(YONETICI, "GET", "/carrier/trips");
const base = (list.body.items ?? list.body)[0];
let tripId;
for (let i = 0; i < 6 && !tripId; i++) {
  const dep = new Date(Date.now() + (60 + Math.floor(Math.random() * 600)) * 86_400_000);
  const arr = new Date(dep.getTime() + 6 * 3_600_000);
  const t = await call(YONETICI, "POST", "/carrier/trips", {
    originFacilityId: base.origin.id, destinationFacilityId: base.destination.id, vehicleId: base.vehicle.id,
    departureAt: dep.toISOString(), arrivalEta: arr.toISOString(), internalPallets: 0, internalKg: 0, maxGrossKg: 7000,
    sellablePallets: 10, sellableKg: 6000, sellableM3: 40, basePriceMinor: 100000, publish: true,
  });
  if (t.status === 201 || t.status === 200) tripId = t.body.id; else console.log("sefer oluşturulamadı:", t.status, JSON.stringify(t.body).slice(0, 200));
}
expect("taze sefer oluşturuldu", Boolean(tripId), base);
const trip = async () => (await call(YONETICI, "GET", `/carrier/trips/${tripId}`)).body;
const conf = async () => { const t = await trip(); return { p: t.capacity.confirmed.pallets, kg: t.capacity.confirmed.kg }; };
async function book(user) {
  const r = await call(user, "POST", "/customer/reservations", { tripId, pallets: 2, grossKg: 1000, productClassCode: "GENEL", paymentPlan: "full", card: CARD });
  if (r.status !== 201) return { id: null, r };
  const a = await call(YONETICI, "POST", `/carrier/reservations/${r.body.id}/decision`, { decision: "approve" });
  return { id: r.body.id, r, a };
}
const A = await book(MARMARA), B = await book(ANADOLU), C = await book(BASKENT), D = await book(EGE), E = await book(MARMARA);
expect("5 rezervasyon onaylandı (2 palet / 1000 kg)", [A, B, C, D, E].every((x) => x.a?.status === 200 && x.a.body.status === "ONAYLI"), [A, B, C, D, E].map((x) => x.r.status));
let c0 = await conf();
expect("onay sonrası onaylı kapasite 10 palet / 5000 kg", c0.p === 10 && c0.kg === 5000, c0);
const price = (x) => ({ unit: x.r.body.unitPriceMinor, total: x.r.body.totalPriceMinor });
const unit = price(A).unit, total = price(A).total;
const meas = (user, id, m) => call(user, "POST", `/carrier/reservations/${id}/events`, { type: "DEPO_KABUL", measurement: m });
const get = async (id) => (await call(YONETICI, "GET", `/carrier/trips/${tripId}`)).body.reservations.find((x) => x.id === id);

// 1) tolerans içi → ok
let r = await meas(YONETICI, A.id, { measuredPallets: 2, measuredKg: 1030 });
expect("tolerans içi (%3): DEPO_KABUL, outcome ok, fark kaydı", r.status === 200 && r.body.status === "DEPO_KABUL" && r.body.measurement.outcome === "ok" && r.body.measurement.diff.kg === 30 && r.body.measurement.declared.kg === 1000, r.body);
c0 = await conf();
expect("tolerans içinde kapasite değişmez", c0.p === 10 && c0.kg === 5000, c0);
r = await meas(YONETICI, A.id, { measuredPallets: 2, measuredKg: 1030 });
expect("aynı ölçüm tekrarı: aynı sonuç, çift kayıt yok", r.status === 200 && r.body.status === "DEPO_KABUL", r.body);

// 2) ağır ama uygun → DEPO_KABUL, kg güncellenir, fiyat sabit
r = await meas(YONETICI, B.id, { measuredPallets: 2, measuredKg: 1300, note: "kuru ağır" });
expect("ağır+uygun: DEPO_KABUL, grossKg 1300", r.status === 200 && r.body.status === "DEPO_KABUL" && r.body.grossKg === 1300 && r.body.measurement.outcome === "ok", r.body);
expect("palet adedi aynı: toplam fiyat/birim fiyat değişmez", r.body.totalPriceMinor === total && r.body.unitPriceMinor === unit && sum(r.body, "REFUNDED") === 0, r.body.payment);
c0 = await conf();
expect("onaylı kg +300 (5300)", c0.p === 10 && c0.kg === 5300, c0);

// 3) ağır ve uygun değil → INCELEME (kapasite değişmez)
r = await meas(YONETICI, C.id, { measuredPallets: 2, measuredKg: 2000 });
expect("ağır+uygun değil: INCELEME + 'İncelemede – ölçüm farkı'", r.status === 200 && r.body.status === "INCELEME" && r.body.statusLabel === "İncelemede – ölçüm farkı" && r.body.measurement.outcome === "review", r.body);
c0 = await conf();
expect("INCELEME kapasiteye dokunmaz", c0.p === 10 && c0.kg === 5300, c0);
const cv = await call(BASKENT, "GET", `/customer/reservations/${C.id}`);
expect("müşteri görünümünde ölçüm var", cv.body.measurement?.measured.kg === 2000 && cv.body.measurement.declared.pallets === 2 && cv.body.status === "INCELEME", cv.body);
r = await call(YONETICI, "POST", `/carrier/reservations/${C.id}/events`, { type: "YUKLENDI" });
expect("INCELEME'den YUKLENDI'ye geçilemez", r.status === 409, r.body);
r = await call(YONETICI, "POST", `/carrier/reservations/${A.id}/review`, { decision: "reject" });
expect("INCELEME dışındaki talepte review 409", r.status === 409, r.body);
r = await call(YONETICI, "POST", `/carrier/reservations/${C.id}/review`, { decision: "accept_partial", acceptedPallets: 3 });
expect("ölçülenden fazla palet kabulü reddedilir", r.status === 400 || r.status === 422, r.body);

// 4) kısmi kabul
r = await call(YONETICI, "POST", `/carrier/reservations/${C.id}/review`, { decision: "accept_partial", acceptedPallets: 1 });
expect("kısmi kabul: DEPO_KABUL, 1 palet, palletCodes kırpıldı", r.status === 200 && r.body.status === "DEPO_KABUL" && r.body.pallets === 1 && r.body.palletCodes.length === 1 && r.body.measurement.outcome === "partial", r.body);
expect("kısmi kabul: toplam = birim × 1, iade 'Kısmi kabul'", r.body.totalPriceMinor === price(C).unit && sum(r.body, "REFUNDED") === price(C).total - price(C).unit && r.body.payment.entries.some((e) => e.type === "REFUNDED" && e.reason.startsWith("Kısmi kabul")), r.body.payment);
c0 = await conf();
expect("kısmi kabul: onaylı kapasite 9 palet / 5300 kg (1 palet iade, kg aynı)", c0.p === 9 && c0.kg === 5300, c0);
const again = await call(YONETICI, "POST", `/carrier/reservations/${C.id}/review`, { decision: "accept_partial", acceptedPallets: 1 });
c0 = await conf();
expect("kısmi kabul tekrarı: kapasite/defter çift iade etmez", again.status === 200 && c0.p === 9 && c0.kg === 5300 && sum(again.body, "REFUNDED") === price(C).total - price(C).unit, { again: again.body?.payment, c0 });

// 5) ret yolu
r = await meas(YONETICI, D.id, { measuredPallets: 2, measuredKg: 2000 });
expect("D: INCELEME", r.body.status === "INCELEME", r.body);
r = await call(YONETICI, "POST", `/carrier/reservations/${D.id}/review`, { decision: "reject", reason: "Ağırlık beyanın iki katı" });
expect("ret: RET_DEPO 'Depoda reddedildi'", r.status === 200 && r.body.status === "RET_DEPO" && r.body.statusLabel === "Depoda reddedildi" && r.body.measurement.outcome === "rejected", r.body);
expect("ret: politika iadesi (REFUNDED toplam, tam)", sum(r.body, "REFUNDED") + sum(r.body, "RETAINED") === price(D).total && sum(r.body, "REFUNDED") > 0, r.body.payment);
c0 = await conf();
expect("ret: kapasite bir kez iade (7 palet / 4300 kg)", c0.p === 7 && c0.kg === 4300, c0);
const rej2 = await call(YONETICI, "POST", `/carrier/reservations/${D.id}/review`, { decision: "reject" });
c0 = await conf();
expect("ret tekrarı (farklı anahtar): kapasite ikinci kez düşmez", rej2.status === 200 && c0.p === 7 && c0.kg === 4300 && sum(rej2.body, "REFUNDED") === sum(r.body, "REFUNDED"), { c0 });

// 6) ölçülen < beyan → ok, fark kaydı, kapasite iadesi
r = await meas(YONETICI, E.id, { measuredPallets: 1, measuredKg: 400 });
expect("hafif ölçüm: DEPO_KABUL, ok, fark -1 palet/-600 kg", r.status === 200 && r.body.status === "DEPO_KABUL" && r.body.measurement.outcome === "ok" && r.body.measurement.diff.pallets === -1 && r.body.measurement.diff.kg === -600 && r.body.pallets === 1, r.body);
expect("hafif ölçüm: toplam birim × 1, fark iade", r.body.totalPriceMinor === price(E).unit && sum(r.body, "REFUNDED") === price(E).total - price(E).unit, r.body.payment);
c0 = await conf();
expect("hafif ölçüm: kapasite farkı iade (6 palet / 3700 kg)", c0.p === 6 && c0.kg === 3700, c0);

// 7) devam akışı: kısmi kabul edilen yük araca yüklenir (kapasite yüklenen değerlerle)
r = await call(YONETICI, "POST", `/carrier/reservations/${C.id}/events`, { type: "YUKLENDI" });
expect("kısmi kabul sonrası YUKLENDI", r.status === 200 && r.body.status === "YUKLENDI", r.body);

// temizlik
await call(YONETICI, "POST", `/carrier/trips/${tripId}/status`, { action: "cancel" });
console.log(`\n${pass} geçti, ${fail} başarısız`);
console.log("demo:reset çalışıyor…");
execSync("npm run demo:reset", { stdio: "inherit" });
process.exit(fail ? 1 : 0);
