// Dağıtılmış API'ye karşı uçtan uca + sözleşme kontrolü.
// Kullanım: set -a; . ./.env.seed; set +a; npm run smoke
import { randomUUID } from "node:crypto";
import { CognitoIdentityProviderClient, InitiateAuthCommand } from "@aws-sdk/client-cognito-identity-provider";
import * as C from "@cargopact/contracts";

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
  const res = { status: r.status, body: text ? JSON.parse(text) : null, headers: r.headers };
  // Sözleşme: her hata yanıtı Error şemasına uymalı.
  if (res.status >= 400) conform(`hata gövdesi ${method} ${path} ${res.status}`, res.status === 401 ? C.unauthorizedBody : C.errorBody, res.body);
  return res;
}

let pass = 0, fail = 0, cPass = 0, cFail = 0;
const expect = (name, cond, detail) => { cond ? pass++ : fail++; console.log(`${cond ? "✓" : "✗"} ${name}${cond ? "" : "  → " + JSON.stringify(detail).slice(0, 300)}`); };
function conform(name, schema, body) {
  const r = schema.safeParse(body);
  if (r.success) { cPass++; return; }
  cFail++;
  console.log(`✗ SÖZLEŞME ${name}: ${JSON.stringify(r.error.issues.slice(0, 3))}`);
}

const DADMIN = "admin@dincer.example.test", DPLAN = "planner@dincer.example.test", SADMIN = "admin@siva.example.test";
const CUST = "user@marmara.example.test", PENDING = "user@guney.example.test", PADMIN = "platform.admin@cargopact.example.test";

let r = await call(null, "GET", "/health");
expect("health açık", r.status === 200, r);
r = await call(null, "GET", "/carrier/facilities");
expect("token yoksa 401", r.status === 401, r);

conform("GET /health", C.health, (await call(null, "GET", "/health")).body);
r = await call(DADMIN, "GET", "/me");
conform("GET /me", C.meResponse, r.body);
expect("/me rol ve kiracı döner", r.status === 200 && r.body.active?.role === "carrier_admin" && r.body.active?.tenantType === "carrier", r.body);

r = await call(DADMIN, "GET", "/carrier/facilities?limit=200");
const dincerFacilities = r.body.items ?? [];
conform("GET /carrier/facilities", C.page(C.facility), r.body);
expect("Dinçer 6 seed tesisini görür, hepsi kendi", r.status === 200 && dincerFacilities.filter((f) => f.isDemo).length === 6 && dincerFacilities.every((f) => f.code.startsWith("DNC-")), r.body);
const seen = [];
let cursor;
for (let i = 0; i < 20; i++) {
  const p = await call(DADMIN, "GET", `/carrier/facilities?limit=4${cursor ? `&cursor=${cursor}` : ""}`);
  seen.push(...p.body.items.map((f) => f.id));
  cursor = p.body.nextCursor;
  if (!cursor) break;
}
expect("sayfalama: tekrar yok, toplam tam listeye eşit", new Set(seen).size === seen.length && seen.length === dincerFacilities.length, { seen: seen.length, all: dincerFacilities.length });

const gebze = dincerFacilities.find((f) => f.code === "DNC-GEB-TM");
r = await call(SADMIN, "GET", `/carrier/facilities/${gebze.id}`);
expect("Siva, Dinçer tesisini göremez (404)", r.status === 404, r);
r = await call(SADMIN, "GET", "/carrier/facilities");
expect("Siva yalnız kendi tesislerini görür", r.body.items?.filter((f) => f.isDemo).length === 6 && r.body.items.every((f) => f.code.startsWith("SVA-")), r.body);

r = await call(CUST, "GET", "/carrier/facilities");
expect("müşteri taşıyıcı tesis listesine erişemez (403)", r.status === 403, r);
r = await call(DPLAN, "POST", "/carrier/facilities", {});
expect("planlamacı tesis oluşturamaz (403)", r.status === 403, r);

const code = "DNC-TST-" + Math.floor(Math.random() * 1e6);
const fac = { code, name: "Test Transfer Merkezi", kind: "transfer_center", city: "Kocaeli", address: "Test Caddesi No:1, Gebze", openingHours: { mon: [["08:00", "18:00"]] }, intakeWindow: { from: "08:00", to: "17:00" }, contactPhone: "+902620009999" };
r = await call(DADMIN, "POST", "/carrier/facilities", { ...fac, openingHours: { mon: [["18:00", "08:00"]] } });
expect("geçersiz saat aralığı 400", r.status === 400 && r.body.code === "VALIDATION_ERROR", r.body);
const key = randomUUID();
r = await call(DADMIN, "POST", "/carrier/facilities", fac, { "idempotency-key": key });
expect("tesis oluşturulur (201)", r.status === 201 && r.body.code === code && r.body.version === 1, r.body);
const created = r.body;
conform("POST /carrier/facilities", C.facility, r.body);
r = await call(DADMIN, "POST", "/carrier/facilities", fac, { "idempotency-key": key });
expect("aynı Idempotency-Key aynı yanıtı döner, ikinci kayıt yok", r.status === 201 && r.body.id === created.id && r.headers.get("idempotent-replay") === "true", r.body);
r = await call(DADMIN, "POST", "/carrier/facilities", { ...fac, name: "Farklı" }, { "idempotency-key": key });
expect("aynı anahtar farklı gövde → 422", r.status === 422, r.body);
r = await call(DADMIN, "POST", "/carrier/facilities", fac);
expect("aynı kod ikinci kez → 409", r.status === 409, r.body);
r = await call(DADMIN, "POST", "/carrier/facilities", fac, { "idempotency-key": "" });
expect("Idempotency-Key yoksa 400", r.status === 400, r.body);

r = await call(DADMIN, "PUT", `/carrier/facilities/${created.id}`, { ...fac, name: "Güncel Ad" }, { "if-match": "1" });
conform("PUT /carrier/facilities/{id}", C.facility, r.body);
expect("güncelleme sürümü artırır", r.status === 200 && r.body.version === 2 && r.body.name === "Güncel Ad", r.body);
r = await call(DADMIN, "PUT", `/carrier/facilities/${created.id}`, { ...fac, name: "Eski Sürüm" }, { "if-match": "1" });
expect("eski sürümle güncelleme 409", r.status === 409, r.body);
r = await call(SADMIN, "PUT", `/carrier/facilities/${created.id}`, fac, { "if-match": "2" });
expect("başka taşıyıcı güncelleyemez (404)", r.status === 404, r.body);
r = await call(DADMIN, "PATCH", `/carrier/facilities/${created.id}/status`, { status: "inactive" });
conform("PATCH /carrier/facilities/{id}/status", C.facility, r.body);
expect("pasife alma", r.status === 200 && r.body.status === "inactive", r.body);
r = await call(DADMIN, "GET", "/carrier/facilities?status=active&limit=200");
expect("aktif filtresinde pasif tesis yok", r.body.items?.every((f) => f.id !== created.id), r.body);

r = await call(DADMIN, "GET", "/carrier/vehicles?limit=200");
conform("GET /carrier/vehicles", C.page(C.vehicle), r.body);
expect("Dinçer 5 seed aracını görür, hepsi kendi", r.body.items?.filter((v) => v.isDemo).length === 5 && r.body.items.every((v) => v.plate.startsWith("41")), r.body);
r = await call(DADMIN, "GET", "/carrier/vehicle-types");
conform("GET /carrier/vehicle-types", C.page(C.vehicleType), r.body);
const tir = r.body.items?.find((t) => t.code === "TIR-136");
expect("taşıyıcı platform araç tiplerini görür", !!tir && tir.palletPositions === 33, r.body);
r = await call(DADMIN, "POST", "/carrier/vehicles", { vehicleTypeId: tir.id, plate: "99 XX 1" });
expect("geçersiz plaka 400", r.status === 400, r.body);
const plate = `41 TST ${100 + Math.floor(Math.random() * 899)}`;
r = await call(DADMIN, "POST", "/carrier/vehicles", { vehicleTypeId: tir.id, plate, driverPhone: "+905550000000" });
conform("POST /carrier/vehicles", C.vehicle, r.body);
expect("araç eklenir, plaka normalize", r.status === 201 && r.body.plate === plate.replace(/\s/g, ""), r.body);
r = await call(DADMIN, "POST", "/carrier/vehicles", { vehicleTypeId: tir.id, plate });
expect("aynı plaka 409", r.status === 409, r.body);
r = await call(DADMIN, "POST", "/carrier/vehicles", { vehicleTypeId: randomUUID(), plate: "41 TST 999" });
expect("görünmeyen araç tipi 400", r.status === 400, r.body);

r = await call(DADMIN, "GET", "/carrier/product-classes");
const kir = r.body.items?.find((x) => x.code === "KIRILGAN");
expect("Dinçer KIRILGAN kabul etmez", kir && kir.accepted === false, r.body);
r = await call(SADMIN, "GET", "/carrier/product-classes");
expect("Siva KIRILGAN kabul eder", r.body.items?.find((x) => x.code === "KIRILGAN")?.accepted === true, r.body);

r = await call(CUST, "GET", "/catalog/packaging-types");
conform("GET /catalog/packaging-types", C.page(C.packagingType), r.body);
const eur = r.body.items?.find((x) => x.code === "EUR-PALET"), koliM = r.body.items?.find((x) => x.code === "KOLI-M");
expect("müşteri ambalaj kataloğunu görür", r.status === 200 && !!eur && !!koliM, r.body);
r = await call(CUST, "POST", "/customer/shipments/estimate-pallets", { palletTypeId: eur.id, cartons: [{ packagingTypeId: koliM.id, count: 200 }] });
conform("POST /customer/shipments/estimate-pallets", C.estimatePalletsResponse, r.body);
expect("200 orta koli → 6 EUR palet", r.status === 200 && r.body.estimatedPallets === 6 && r.body.totalVolumeM3 === 7.2, r.body);
r = await call(CUST, "POST", "/customer/shipments/estimate-pallets", { palletTypeId: koliM.id, cartons: [{ packagingTypeId: koliM.id, count: 1 }] });
expect("koli palet tipi olarak verilemez 400", r.status === 400, r.body);
r = await call(DADMIN, "POST", "/customer/shipments/estimate-pallets", { palletTypeId: eur.id, cartons: [{ packagingTypeId: koliM.id, count: 1 }] });
expect("taşıyıcı müşteri ucunu çağıramaz 403", r.status === 403, r.body);

r = await call(PENDING, "GET", "/me");
expect("onaysız firma /me'de pending görünür", r.status === 200 && r.body.active?.tenantStatus === "pending", r.body);
r = await call(PENDING, "GET", "/catalog/packaging-types");
expect("onaysız firma işlem yapamaz (403)", r.status === 403, r.body);

r = await call(DADMIN, "POST", "/platform/catalog/packaging-types", {});
expect("taşıyıcı platform kataloğuna yazamaz (403)", r.status === 403, r.body);
r = await call(PADMIN, "GET", "/platform/tenants?status=pending");
conform("GET /platform/tenants", C.page(C.tenantSummary), r.body);
expect("platform admin bekleyen firmaları görür", r.status === 200 && r.body.items?.some((t) => t.name === "Güney Lojistik Pazarlama"), r.body);
r = await call(PADMIN, "GET", "/carrier/facilities");
expect("platform admin taşıyıcı verisini görmez (boş liste)", r.status === 200 && r.body.items?.length === 0, r.body);

for (const p of ["/catalog/vehicle-types", "/catalog/product-classes"]) {
  const x = await call(CUST, "GET", p);
  conform(`GET ${p}`, p.includes("vehicle") ? C.page(C.vehicleType) : C.page(C.productClass), x.body);
}
r = await call(DADMIN, "GET", "/does-not-exist");
expect("bilinmeyen uç 404 + correlationId", r.status === 404 && !!r.body.correlationId, r.body);

console.log(`\nDavranış: ${pass} geçti, ${fail} başarısız · Sözleşme: ${cPass} geçti, ${cFail} başarısız`);
process.exitCode = fail || cFail ? 1 : 0;
