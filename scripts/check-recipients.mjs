// Yetkili alıcı kontrolü: seed verisi + firma rehberi + alıcı seçilmeden yapılan rezervasyona varsayılan atama.
// Kullanım: set -a; . ./.env.seed; set +a; NODE_PATH=packages/db/node_modules:node_modules npx tsx scripts/check-recipients.mjs
import { CognitoIdentityProviderClient, InitiateAuthCommand } from "@aws-sdk/client-cognito-identity-provider";
import { createPool } from "../packages/db/src/connection.ts";
const { API_URL, USER_POOL_CLIENT_ID, SEED_USER_PASSWORD } = process.env;
const pool = createPool({ user: "admin", max: 1 });
let pass = 0, fail = 0;
const expect = (n, c, d) => { c ? pass++ : fail++; console.log(`${c ? "✓" : "✗"} ${n}${c ? "" : "  → " + JSON.stringify(d).slice(0, 300)}`); };

const empty = (await pool.query("select count(*) n from reservations where pickup_recipients is null or pickup_recipients = '[]'::jsonb")).rows[0].n;
expect("her rezervasyonda en az bir yetkili alıcı var", Number(empty) === 0, { empty });
const per = (await pool.query("select c.name, r.pickup_recipients from reservations r join tenants c on c.id = r.customer_id order by c.name")).rows;
const byCust = new Map(); for (const r of per) byCust.set(r.name, r.pickup_recipients);
console.log("  örnek:", [...byCust.entries()].slice(0, 4).map(([n, l]) => `${n}: ${l.map((x) => x.name).join(", ")}`).join(" · "));
expect("firmalara farklı yetkililer atanmış (tek tip isim yok)", new Set([...byCust.values()].map((l) => l[0]?.name)).size > 3);

const cog = new CognitoIdentityProviderClient({ region: "us-east-1" });
const tok = async (u) => (await cog.send(new InitiateAuthCommand({ AuthFlow: "USER_PASSWORD_AUTH", ClientId: USER_POOL_CLIENT_ID, AuthParameters: { USERNAME: u, PASSWORD: SEED_USER_PASSWORD } }))).AuthenticationResult.IdToken;
for (const u of ["web.musteri@cargopact.example.test", "mobil.musteri@cargopact.example.test"]) {
  const r = await fetch(API_URL + "/customer/recipients", { headers: { authorization: `Bearer ${await tok(u)}` } });
  const j = await r.json();
  expect(`${u.split("@")[0]}: rehber dolu (${j.items?.map((x) => x.name).join(", ")}) · ben=${j.self?.name}`, r.status === 200 && j.items?.length >= 2 && !!j.self?.name, j);
}
const m = await tok("web.yonetici@cargopact.example.test");
const rr = await fetch(API_URL + "/customer/recipients", { headers: { authorization: `Bearer ${m}` } });
expect("taşıyıcı müşteri rehberine erişemez (403)", rr.status === 403);

// Alıcı seçmeden rezervasyon → firmanın yetkilileri atanır
const C = await tok("web.musteri@cargopact.example.test");
const call = async (method, path, body) => { const r = await fetch(API_URL + path, { method, headers: { authorization: `Bearer ${C}`, "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json() }; };
const trips = (await call("GET", "/customer/trips?pallets=1")).body.items;
const t = trips.find((x) => x.reference === "DNC-GEB-BRS") ?? trips[0];
const decl = { pallets: 1, grossKg: 300, productClassCode: "GENEL", paymentPlan: "full" };
const pv = (await call("POST", `/customer/trips/${t.id}/contract-preview`, decl)).body;
const res = await call("POST", "/customer/reservations", { tripId: t.id, ...decl, card: { holder: "Test", number: "4242 4242 4242 4242", expiry: "12/30", cvc: "123" }, contract: { version: pv.version, renderedHash: pv.renderedHash, signerName: "Test", accepted: true } });
expect("alıcı seçilmeden rezervasyon: firmanın yetkilileri atandı", res.status === 201 && (res.body.pickup?.recipients?.length ?? 0) >= 1, { status: res.status, pickup: res.body.pickup, err: res.body.message });
console.log(`\n${pass} geçti, ${fail} kaldı (not: sonda npm run demo:reset çalıştırın)`);
await pool.end();
process.exit(fail ? 1 : 0);
