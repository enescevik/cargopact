// KPI panosu uçtan uca kontrol. Kullanım: set -a; . ./.env.seed; set +a; node scripts/smoke-kpis.mjs
import { CognitoIdentityProviderClient, InitiateAuthCommand } from "@aws-sdk/client-cognito-identity-provider";
const { API_URL, USER_POOL_CLIENT_ID, SEED_USER_PASSWORD, AWS_REGION } = process.env;
const cog = new CognitoIdentityProviderClient({ region: AWS_REGION });
const call = async (email, path) => {
  const t = (await cog.send(new InitiateAuthCommand({ AuthFlow: "USER_PASSWORD_AUTH", ClientId: USER_POOL_CLIENT_ID, AuthParameters: { USERNAME: email, PASSWORD: SEED_USER_PASSWORD } }))).AuthenticationResult.IdToken;
  const r = await fetch(API_URL + path, { headers: { authorization: `Bearer ${t}` } });
  return { status: r.status, body: await r.json().catch(() => null) };
};
let fail = 0;
const expect = (n, c, d) => { if (!c) fail++; console.log(`${c ? "✓" : "✗"} ${n}${c ? "" : "  → " + JSON.stringify(d).slice(0, 300)}`); };
const shape = (m) => m && "value" in m && typeof m.numerator === "number" && typeof m.denominator === "number" && typeof m.formula === "string" && m.formula.length > 5;

let r = await call("web.yonetici@cargopact.example.test", "/carrier/kpis");
expect("yönetici 200", r.status === 200, r);
const k = r.body, m = k?.metrics ?? {};
expect("kapsam: firmanın kendisi", k?.scope === "carrier" && k.trips.every((t) => t.reference.startsWith("DNC")), k?.scope);
expect("tüm metrikler {value,numerator,denominator,formula}", Object.keys(m).length >= 14 && Object.values(m).every(shape), Object.keys(m));
expect("gelmeme: pay ≥ 3 (Başkent + Marmara×2), payda ≥ pay", m.noShowRate.numerator >= 3 && m.noShowRate.denominator >= m.noShowRate.numerator, m.noShowRate);
expect("gelmeme değeri = pay/payda", Math.abs(m.noShowRate.value - Math.round((m.noShowRate.numerator / m.noShowRate.denominator) * 1000) / 10) < 0.01, m.noShowRate);
expect("iç rezerv ihlali = 0", m.internalReserveViolations.value === 0, m.internalReserveViolations);
expect("çift rezervasyon = 0", m.doubleBookings.value === 0, m.doubleBookings);
expect("huni: uygun teklif > 0 ve oran hesaplı", m.quoteToReservation.denominator > 0 && m.quoteToReservation.value !== null, m.quoteToReservation);
expect("eksik/hasar ≥ 1 (seed)", m.damageRate.numerator >= 1, m.damageRate);
expect("karar süresi medyan > 0", m.decisionMinutesMedian.value > 0, m.decisionMinutesMedian);
expect("gelir − maliyet = katkı", m.grossRevenueMinor.value - m.variableCostMinor.value === m.contributionMinor.value, [m.grossRevenueMinor.value, m.variableCostMinor.value, m.contributionMinor.value]);
expect("maliyet = onaylı palet × 20000", m.variableCostMinor.value === m.variableCostMinor.numerator * 20000, m.variableCostMinor);
expect("sefer tablosu: palet/kg/m³ ayrı", k.trips.length > 0 && k.trips.every((t) => t.planned && t.actual && t.sellable && "m3" in t.planned && "m3" in t.actual), k.trips[0]);
expect("sefer: onaylı+bloke ≤ satılabilir", k.trips.every((t) => t.planned.pallets + t.held.pallets <= t.sellable.pallets), k.trips.map((t) => t.reference));

r = await call("platform.admin@cargopact.example.test", "/carrier/kpis");
expect("platform yöneticisi: tüm taşıyıcılar (Siva dahil)", r.status === 200 && r.body.scope === "all-carriers" && r.body.trips.some((t) => t.reference.startsWith("SVA")) && r.body.trips.some((t) => t.reference.startsWith("DNC")), r.body?.scope);
r = await call("web.yonetici@cargopact.example.test", "/carrier/kpis?from=2000-01-01&to=2000-01-02");
expect("boş aralık: 200, oran null", r.status === 200 && r.body.metrics.quoteToReservation.value === null && r.body.trips.length === 0, r.body);
r = await call("web.yonetici@cargopact.example.test", "/carrier/kpis?from=bad");
expect("geçersiz tarih 400", r.status === 400, r.status);
r = await call("user@marmara.example.test", "/carrier/kpis");
expect("müşteri 403", r.status === 403, r.status);
console.log(fail ? `\n${fail} BAŞARISIZ` : "\nTümü geçti");
process.exit(fail ? 1 : 0);
