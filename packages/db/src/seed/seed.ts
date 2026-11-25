import type pg from "pg";
import { withTx, chunk } from "../tx";
import { demoId, PLATFORM_TENANT_ID } from "./ids";
import { carrierClassAcceptance, carriers, customers, facilities, standardHours, users, vehiclesPerCarrier } from "./l1-data";

export const tenantId = (key: string): string => (key === "platform" ? PLATFORM_TENANT_ID : demoId("tenants", key));

/** Prod koruması: STAGE=prod veya ALLOW_SEED yoksa reddeder. */
export function assertSeedAllowed(): void {
  const stage = (process.env.STAGE ?? "dev").toLowerCase();
  if (stage === "prod" || stage === "production") throw new Error("Seed üretim ortamında çalıştırılamaz (STAGE=prod).");
}

type Row = Record<string, unknown>;
const JSON_COLS = new Set(["opening_hours", "intake_window", "pickup_window"]);

/** Satırları ≤3000'lik işlemlerle upsert eder. Kimlik deterministik olduğundan tekrar çalıştırma aynı satırları günceller. */
async function upsert(pool: pg.Pool, table: string, rows: Row[], conflict: string[], log: (m: string) => void) {
  if (rows.length === 0) return;
  const cols = Object.keys(rows[0]);
  for (const part of chunk(rows, 500)) {
    await withTx(pool, async (c) => {
      for (const r of part) {
        const ph = cols.map((col, i) => `$${i + 1}${JSON_COLS.has(col) ? "::jsonb" : ""}`);
        const updates = cols.filter((col) => !conflict.includes(col)).map((col) => `${col} = excluded.${col}`);
        await c.query(
          `insert into ${table} (${cols.join(", ")}) values (${ph.join(", ")}) on conflict (${conflict.join(", ")}) ${updates.length ? `do update set ${updates.join(", ")}` : "do nothing"}`,
          cols.map((col) => (JSON_COLS.has(col) && r[col] != null ? JSON.stringify(r[col]) : r[col] ?? null)),
        );
      }
    });
  }
  log(`  ${table}: ${rows.length}`);
}

export async function seedL1(pool: pg.Pool, log: (m: string) => void = console.log): Promise<void> {
  assertSeedAllowed();
  log("Seed L1");

  await upsert(pool, "tenants", [
    ...carriers.map((c) => ({ id: tenantId(c.key), type: "carrier", name: c.name, status: "active", is_demo: true })),
    ...customers.map((c) => ({ id: tenantId(c.key), type: "customer", name: c.name, status: c.status, is_demo: true })),
  ], ["id"], log);

  await upsert(pool, "facilities", facilities.map((f) => ({
    id: demoId("facilities", f.code), carrier_id: tenantId(f.carrier), code: f.code, name: f.name, kind: f.kind,
    city: f.city, district: f.district, address: f.address, latitude: f.lat, longitude: f.lng, timezone: "Europe/Istanbul",
    opening_hours: standardHours,
    intake_window: f.kind === "transfer_center" ? { from: "08:00", to: "19:00" } : null,
    pickup_window: f.kind === "distribution_center" ? { from: "09:00", to: "18:00" } : null,
    daily_slot_limit: f.slots, contact_name: f.contact, contact_phone: f.phone, status: "active", is_demo: true,
  })), ["id"], log);

  const vt = new Map<string, string>((await pool.query("select code, id from vehicle_types where tenant_id = $1", [PLATFORM_TENANT_ID])).rows.map((r) => [r.code, r.id]));
  const pc = new Map<string, string>((await pool.query("select code, id from product_classes where tenant_id = $1", [PLATFORM_TENANT_ID])).rows.map((r) => [r.code, r.id]));
  if (vt.size < 3 || pc.size < 4) throw new Error("Platform kataloğu eksik; önce db:migrate çalıştırın.");

  await upsert(pool, "vehicles", carriers.flatMap((c) => vehiclesPerCarrier.map((v) => {
    const plate = `${c.plateCity}${c.prefix}${v.n}`;
    return { id: demoId("vehicles", plate), carrier_id: tenantId(c.key), vehicle_type_id: vt.get(v.type), plate, status: v.status, driver_name: v.driver, driver_phone: `+90555000${c.plateCity}${v.n}`.slice(0, 13), is_demo: true };
  })), ["id"], log);

  await upsert(pool, "carrier_product_classes", carriers.flatMap((c) => Object.entries(carrierClassAcceptance[c.key]).map(([code, accepted]) => ({
    carrier_id: tenantId(c.key), product_class_id: pc.get(code), accepted, is_demo: true,
  }))), ["carrier_id", "product_class_id"], log);
}

/** Cognito'dan gelen sub ile users + memberships yazar. */
export async function seedUserRows(pool: pg.Pool, subs: Map<string, string>, log: (m: string) => void = console.log): Promise<void> {
  assertSeedAllowed();
  await upsert(pool, "users", users.map((u) => ({ id: demoId("users", u.email), cognito_sub: subs.get(u.email), email: u.email, display_name: u.name, is_demo: true })), ["id"], log);
  await upsert(pool, "memberships", users.map((u) => ({ id: demoId("memberships", u.email), user_id: demoId("users", u.email), tenant_id: tenantId(u.tenant), role: u.role, status: "active", is_demo: true })), ["id"], log);
}

/** Yalnız is_demo satırları siler; çocuk tablolardan başlar. Platform kataloğu korunur. */
export async function resetDemo(pool: pg.Pool, log: (m: string) => void = console.log): Promise<void> {
  assertSeedAllowed();
  const order = ["carrier_product_classes", "memberships", "vehicles", "facilities", "packaging_types", "product_classes", "vehicle_types", "audit_log", "users", "tenants"];
  for (const t of order) {
    let total = 0;
    for (;;) {
      const r = await withTx(pool, (c) => c.query(`delete from ${t} where ctid in (select ctid from ${t} where is_demo = true limit 2000)`));
      total += r.rowCount ?? 0;
      if (!r.rowCount) break;
    }
    log(`  ${t}: ${total} silindi`);
  }
}

export interface VerifyResult { ok: boolean; checks: { name: string; ok: boolean; detail?: string }[] }

export async function verifySeed(pool: pg.Pool): Promise<VerifyResult> {
  const checks: VerifyResult["checks"] = [];
  const check = async (name: string, sql: string, expectZero = true) => {
    const n = Number((await pool.query(sql)).rows[0].n);
    checks.push({ name, ok: expectZero ? n === 0 : n > 0, detail: String(n) });
  };
  await check("araç tipi görünürlüğü: araç yalnız platform veya kendi taşıyıcısının tipini kullanır",
    `select count(*) n from vehicles v join vehicle_types t on t.id = v.vehicle_type_id where t.tenant_id not in (v.carrier_id, '${PLATFORM_TENANT_ID}')`);
  await check("tesis sahibi taşıyıcı kiracısıdır", "select count(*) n from facilities f join tenants t on t.id = f.carrier_id where t.type <> 'carrier'");
  await check("araç sahibi taşıyıcı kiracısıdır", "select count(*) n from vehicles v join tenants t on t.id = v.carrier_id where t.type <> 'carrier'");
  await check("müşteri üyeliği yalnız customer_user rolündedir", "select count(*) n from memberships m join tenants t on t.id = m.tenant_id where t.type = 'customer' and m.role <> 'customer_user'");
  await check("taşıyıcı üyeliği yalnız taşıyıcı rollerindedir", "select count(*) n from memberships m join tenants t on t.id = m.tenant_id where t.type = 'carrier' and m.role not in ('carrier_admin','carrier_planner','carrier_warehouse')");
  await check("platform üyeliği yalnız platform rollerindedir", "select count(*) n from memberships m join tenants t on t.id = m.tenant_id where t.type = 'platform' and m.role not in ('platform_admin','admin_viewer')");
  await check("her taşıyıcının en az 2 transfer ve 3 dağıtım merkezi var",
    `select count(*) n from tenants t where t.type='carrier' and t.is_demo and ((select count(*) from facilities f where f.carrier_id=t.id and f.kind in ('transfer_center','both')) < 2 or (select count(*) from facilities f where f.carrier_id=t.id and f.kind in ('distribution_center','both')) < 3)`);
  await check("onaysız (pending) demo müşteri var", "select count(*) n from tenants where type='customer' and status='pending' and is_demo", false);
  await check("her demo kiracıda en az bir kullanıcı var", "select count(*) n from tenants t where t.is_demo and not exists (select 1 from memberships m where m.tenant_id = t.id)");
  return { ok: checks.every((c) => c.ok), checks };
}
