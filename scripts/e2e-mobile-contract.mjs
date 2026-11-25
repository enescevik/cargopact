// Mobil karbon + sözleşme akışı. Çalıştır: cd /tmp/pw && set -a && . /workshop/.env.seed && set +a && node /workshop/scripts/e2e-mobile-contract.mjs
import { chromium } from "/tmp/pw/node_modules/playwright/index.mjs";
import { mkdirSync } from "node:fs";
const BASE = process.env.BASE_URL ?? "https://d1xysc2r88pheq.cloudfront.net";
const M = `${BASE}/m/`;
const PASS = process.env.SEED_USER_PASSWORD;
const SHOTS = "/tmp/pw/shots-mc";
const TRIP = "DNC-DEMO-GEB-ANK";
mkdirSync(SHOTS, { recursive: true });
if (!PASS) { console.error("SEED_USER_PASSWORD yok"); process.exit(2); }
const browser = await chromium.launch();
const results = []; const consoleErrors = [];
let n = 0;
async function step(page, name, fn) {
  const id = String(++n).padStart(2, "0");
  try { await fn(); results.push({ id, name, ok: true }); console.log(`PASS ${id} ${name}`); }
  catch (e) { results.push({ id, name, ok: false }); console.log(`FAIL ${id} ${name}: ${String(e.message).split("\n")[0]}`); }
  await page.screenshot({ path: `${SHOTS}/${id}-${name.replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}.png` }).catch(() => {});
  if (!results.at(-1).ok) throw new Error("abort");
}
async function newCtx(label) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
  const page = await ctx.newPage();
  page.opened = [];
  await page.addInitScript(() => { window.__opened = []; window.open = (u) => { window.__opened.push(String(u)); return null; }; });
  page.json = {};
  page.on("pageerror", (e) => consoleErrors.push(`[${label}] pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/favicon|fonts\.g/.test(m.text())) consoleErrors.push(`[${label}] ${m.text()}`); });
  page.on("response", async (r) => {
    const u = new URL(r.url());
    if (!u.hostname.includes("execute-api") && !u.pathname.startsWith("/api/")) return;
    if (r.request().method() === "POST" && u.pathname.endsWith("/customer/reservations")) { try { page.created = await r.json(); } catch { /* */ } return; }
    if (r.request().method() !== "GET") return;
    try { const j = await r.json(); page.json[u.pathname] = j; if (u.search.includes("date=")) page.json[u.pathname + "?date"] = j; } catch { /* json değil */ }
  });
  return page;
}
async function login(page, email) {
  await page.goto(M, { waitUntil: "networkidle" });
  // Yeni tasarım: rol kartları; e-posta formu "E-posta ve parola ile giriş" bağlantısının arkasında.
  const link = page.getByText("E-posta ve parola ile giriş").first();
  if (await link.isVisible().catch(() => false)) await link.click();
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Parola").fill(PASS);
  await page.getByRole("button", { name: "Giriş yap" }).click();
}
const tab = (p, label) => p.getByText(label, { exact: true }).last().click();
const tomorrow = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date(Date.now() + 864e5));
const T0 = Date.now();
try {
  const c = await newCtx("musteri");
  await step(c, "musteri-giris", async () => {
    await login(c, "mobil.musteri@cargopact.example.test");
    await c.getByText("Sefer ara", { exact: true }).first().waitFor({ timeout: 20000 });
  });
  await step(c, "arama-gebze-ankara-yarin-2palet", async () => {
    await c.getByLabel("Çıkış şehri").fill("Gebze");
    await c.getByLabel("Varış şehri").fill("Ankara");
    await c.getByLabel("Tarih (YYYY-AA-GG)").fill(tomorrow());
    await c.getByLabel("Palet", { exact: true }).fill("2");
    const resp = c.waitForResponse((r) => r.url().includes("/customer/trips?") && r.url().includes("date="), { timeout: 15000 });
    await c.getByRole("button", { name: "Sefer ara" }).click();
    await resp; await c.waitForTimeout(500);
    await c.getByText("Boş yer").first().waitFor({ timeout: 15000 });
  });
  await step(c, "demo-seferi-sec", async () => {
    const list = Object.entries(c.json).find(([k]) => k.endsWith("/customer/trips?date"))?.[1];
    const shown = list?.items.filter((t) => /gebze/i.test(`${t.origin.city} ${t.origin.district}`) && /ankara/i.test(`${t.destination.city} ${t.destination.district}`));
    const idx = shown?.findIndex((t) => t.reference === TRIP);
    if (idx == null || idx < 0) throw new Error(`${TRIP} arama sonucunda yok`);
    await c.getByText("Boş yer").nth(idx).click();
    await c.getByText("Yük bilgisi").first().waitFor({ timeout: 10000 });
  });
  await step(c, "yuk-1200kg-alternatif-ayri-arac-karbon", async () => {
    await c.getByLabel("Palet", { exact: true }).fill("2");
    await c.getByLabel("Brüt kg").fill("1200");
    await c.getByText(/^Genel/).first().click();
    await c.getByText("CargoPact olmasaydı nasıl gönderirdiniz?", { exact: false }).waitFor();
    await c.getByText("Parsiyel / ambar", { exact: true }).waitFor();
    await c.getByText("Belirtmek istemiyorum", { exact: true }).waitFor();
    await c.getByText("Ayrı araçla", { exact: true }).click();
    await c.getByText("Bu sefer yükünüze uygun").waitFor({ timeout: 15000 });
    await c.getByText(/Bu yükün payına düşen emisyon ≈ [\d.,]+ kg CO₂e/).first().waitFor({ timeout: 15000 });
    await c.getByText(/Alternatifinize göre ≈ [\d.,]+ kg daha az/).first().waitFor({ timeout: 15000 });
  });
  await step(c, "karbon-bilgi-sayfasi", async () => {
    await c.getByText(/Bu yükün payına düşen emisyon/).first().click();
    await c.getByText("Emisyon nasıl hesaplandı?").waitFor({ timeout: 5000 });
    await c.getByText("demo katsayıları · tahmini", { exact: true }).waitFor();
    await c.getByRole("button", { name: "Kapat" }).click();
  });
  await step(c, "teklif-kapora-sozlesme-ekrani", async () => {
    await c.getByRole("button", { name: "Teklifi gör" }).click();
    await c.getByText("Ödeme planı").waitFor({ timeout: 10000 });
    await c.getByText(/kapora/i).first().click();
    await c.getByRole("button", { name: "Teklifi kabul et" }).click();
    await c.getByText("TASLAK · DRAFT").waitFor({ timeout: 20000 });
    await c.getByText("Okudum, onaylıyorum").waitFor();
  });
  await step(c, "imza-ve-kabul", async () => {
    const name = c.getByLabel("Ad Soyad (imzalayan)");
    await name.waitFor();
    for (let i = 0; i < 20 && !(await name.inputValue()); i++) await c.waitForTimeout(250);
    if (!(await name.inputValue())) await name.fill("Mobil Müşteri");
    await c.getByText("Okudum, onaylıyorum").click();
    await c.getByRole("button", { name: "İmzala ve teklifi kabul et" }).click();
    await c.getByText("Teklifiniz iletildi").waitFor({ timeout: 30000 });
    await c.getByText("Taşıyıcı onayı bekliyor").first().waitFor({ timeout: 5000 });
    if (!c.created?.id) throw new Error("rezervasyon yanıtı yakalanamadı");
  });
  await step(c, "rezervasyon-detay-sozlesme-ve-karbon", async () => {
    await c.getByRole("button", { name: "Rezervasyonlarıma git" }).click();
    await c.getByText(c.created.reference, { exact: true }).first().click();
    await c.getByText(/Sözleşme ✓/).waitFor({ timeout: 15000 });
    await c.getByText(/Bu yükün payına düşen emisyon/).first().waitFor();
    await c.getByText(/Alternatifinize göre/).first().waitFor();
    await c.getByRole("button", { name: "Görüntüle" }).click();
    await c.getByText("TASLAK · DRAFT").waitFor({ timeout: 15000 });
    await c.getByText("İmzalayan", { exact: true }).first().waitFor();
    await c.getByRole("button", { name: "Kapat" }).click();
  });
} catch (e) { if (e.message !== "abort") console.log("HATA", e.message); }
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} adım geçti · ${Math.round((Date.now() - T0) / 1000)} sn · konsol hataları: ${consoleErrors.length}`);
consoleErrors.slice(0, 8).forEach((x) => console.log("  ", x.slice(0, 200)));
await browser.close();
process.exit(failed || results.length < 8 ? 1 : 0);
