// Uç nokta gecikme ölçümü (gerçek token'larla). Her uç 5 kez çağrılır; ilk (olası soğuk) ve sıcak medyan raporlanır.
// Kullanım: set -a; . ./.env.seed; set +a; NODE_PATH=packages/db/node_modules:node_modules npx tsx scripts/perf-probe.mjs
import { CognitoIdentityProviderClient, InitiateAuthCommand } from "@aws-sdk/client-cognito-identity-provider";
const { USER_POOL_CLIENT_ID, SEED_USER_PASSWORD } = process.env;
const API_URL = process.env.PERF_BASE ?? process.env.API_URL;
const cog = new CognitoIdentityProviderClient({ region: "us-east-1" });
const tok = async (u) => (await cog.send(new InitiateAuthCommand({ AuthFlow: "USER_PASSWORD_AUTH", ClientId: USER_POOL_CLIENT_ID, AuthParameters: { USERNAME: u, PASSWORD: SEED_USER_PASSWORD } }))).AuthenticationResult.IdToken;
const C = await tok("web.musteri@cargopact.example.test"), M = await tok("web.yonetici@cargopact.example.test");
async function t(label, token, path, n = 5) {
  const ms = [];
  let size = 0, status = 0;
  for (let i = 0; i < n; i++) {
    const s = performance.now();
    const r = await fetch(API_URL + path, { headers: { authorization: `Bearer ${token}` } });
    const b = await r.text(); size = b.length; status = r.status;
    ms.push(performance.now() - s);
  }
  const warm = ms.slice(1).sort((a, b) => a - b);
  console.log(`${label.padEnd(34)} ${String(status).padEnd(4)} ilk ${ms[0].toFixed(0).padStart(5)} ms · sıcak medyan ${warm[Math.floor(warm.length / 2)].toFixed(0).padStart(5)} ms · ${(size / 1024).toFixed(0)} KB`);
}
await t("GET /health", C, "/health");
await t("GET /me", C, "/me");
await t("GET /customer/trips", C, "/customer/trips?pallets=3");
await t("GET /customer/reservations", C, "/customer/reservations");
await t("GET /catalog/product-classes", C, "/catalog/product-classes");
await t("GET /notifications", C, "/notifications");
await t("GET /carrier/trips", M, "/carrier/trips");
const trips = (await (await fetch(API_URL + "/carrier/trips", { headers: { authorization: `Bearer ${M}` } })).json()).items;
const demo = trips.find((x) => x.reference === "DNC-DEMO-GEB-ANK");
await t("GET /carrier/trips/{demo}", M, `/carrier/trips/${demo.id}`);
await t("GET /carrier/dashboard", M, "/carrier/dashboard");
await t("GET /carrier/kpis", M, "/carrier/kpis");
await t("GET /carrier/exceptions", M, "/carrier/exceptions");
await t("GET /carrier/customers", M, "/carrier/customers");
