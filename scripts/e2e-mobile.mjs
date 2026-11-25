// Mobil (Expo web, 390x844) uçtan uca. Çalıştır: cd /tmp/pw && set -a && . /workshop/.env.seed && set +a && node /workshop/scripts/e2e-mobile.mjs
import { chromium } from "/tmp/pw/node_modules/playwright/index.mjs";
import { mkdirSync } from "node:fs";
const BASE = process.env.BASE_URL ?? "https://d1xysc2r88pheq.cloudfront.net";
const M = `${BASE}/m/`;
const PASS = process.env.SEED_USER_PASSWORD;
const SHOTS = "/tmp/pw/shots-m";
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
    if (!u.hostname.includes("execute-api")) return;
    if (r.request().method() === "POST" && u.pathname.endsWith("/customer/reservations")) { try { page.created = await r.json(); } catch { /* */ } return; }
    if (r.request().method() !== "GET") return;
    try { const j = await r.json(); page.json[u.pathname] = j; if (u.search.includes("date=")) page.json[u.pathname + "?date"] = j; } catch { /* json değil */ }
  });
  return page;
}
async function login(page, email) {
  await page.goto(M, { waitUntil: "networkidle" });
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Parola").fill(PASS);
  await page.getByRole("button", { name: "Giriş yap" }).click();
}
const tab = (p, label) => p.getByText(label, { exact: true }).last().click();
const tomorrow = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date(Date.now() + 864e5));
const T0 = Date.now();
let order = "", resId = "";
try {
  // ---------- MÜŞTERİ: gönder ----------
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
  await step(c, "depoya-nasil-giderim-karti", async () => {
    await c.getByText("Depoya nasıl giderim?").waitFor({ timeout: 10000 });
    for (const t of ["Google Haritalar", "Apple Haritalar", "Son kabul (T−1)", "Çalışma saatleri", "Kabul penceresi"]) await c.getByText(t, { exact: false }).first().waitFor({ timeout: 5000 });
    await c.getByText("Google Haritalar").click();
    await c.getByText("Apple Haritalar").click();
    const o = await c.evaluate(() => window.__opened);
    if (!o.some((u) => /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=-?\d+\.\d+,-?\d+\.\d+$/.test(u))) throw new Error("Google linki yok: " + o);
    if (!o.some((u) => /^https:\/\/maps\.apple\.com\/\?daddr=-?\d+\.\d+,-?\d+\.\d+$/.test(u))) throw new Error("Apple linki yok: " + o);
  });
  await step(c, "yuk-2palet-1200kg-GENEL", async () => {
    await c.getByLabel("Palet", { exact: true }).fill("2");
    await c.getByLabel("Brüt kg").fill("1200");
    await c.getByText(/^Genel/).first().click();
    await c.getByText("Bu sefer yükünüze uygun").waitFor({ timeout: 15000 });
    await c.getByRole("button", { name: "Teklifi gör" }).click();
    await c.getByText("Ödeme planı").waitFor({ timeout: 10000 });
  });
  await step(c, "kapora-plani-kabul", async () => {
    await c.getByText(/kapora/i).first().click();
    await c.getByRole("button", { name: "Teklifi kabul et" }).click();
    await c.getByText("Teklifiniz iletildi").waitFor({ timeout: 30000 });
    await c.getByText("Taşıyıcı onayı bekliyor").first().waitFor({ timeout: 5000 });
  });
  await step(c, "rezervasyon-detay-bekliyor", async () => {
    await c.getByRole("button", { name: "Rezervasyonlarıma git" }).click();
    resId = c.created?.id ?? "";
    if (!resId) throw new Error("oluşan rezervasyon yanıtı yakalanamadı");
    await c.getByText(c.created.reference, { exact: true }).first().click();
    await c.getByText("Depoya nasıl giderim?").waitFor({ timeout: 10000 });
    await c.getByText(/Son kabul \(T−1\)/).first().waitFor();
    await c.getByText("Taşıyıcı onayı bekliyor").first().waitFor();
  });
  // ---------- YÖNETİCİ ----------
  const y = await newCtx("yonetici");
  let planned0 = null;
  await step(y, "yonetici-giris-seferler", async () => {
    await login(y, "mobil.yonetici@cargopact.example.test");
    await y.getByText("Planlı transferlerde boş palet alanınız.").waitFor({ timeout: 20000 });
  });
  await step(y, "demo-seferi-ac-ve-onayla", async () => {
    await y.getByText("bekleyen", { exact: false }).first().waitFor({ timeout: 15000 }).catch(() => {});
    await y.getByText("planlanan", { exact: false }).first().waitFor({ timeout: 15000 });
    const list = Object.entries(y.json).find(([k]) => k.endsWith("/carrier/trips"))?.[1];
    const t = list?.items.find((x) => x.reference === TRIP);
    if (!t) throw new Error("demo sefer yok");
    planned0 = t.capacity.plannedPallets;
    await y.getByText(t.vehicle.plate, { exact: false }).first().click();
    await y.getByText("Bekleyen talepler", { exact: false }).waitFor({ timeout: 15000 });
    const card = y.getByText(/Anadolu/).first().locator('xpath=ancestor::div[.//*[@role="button"][normalize-space(.)="Onayla"]][1]');
    await card.getByRole("button", { name: "Onayla", exact: true }).click();
    const toast = await y.getByText(/Onaylandı · CP-2026-\d+/).first().innerText({ timeout: 20000 });
    order = toast.match(/CP-2026-\d+/)[0];
  });
  await step(y, "planlanan-27-33", async () => {
    await y.getByText(/27 \/ 33/).first().waitFor({ timeout: 20000 });
    console.log(`   önceki planlanan: ${planned0}`);
  });
  await step(y, "depo-sekmesi-elle-kod", async () => {
    await tab(y, "Depo");
    await y.getByLabel("Kodu elle gir").fill(order);
    await y.getByRole("button", { name: "Bul" }).click();
    await y.getByText(`Okutulan: ${order}`).waitFor({ timeout: 10000 });
  });
  await step(y, "depoda-kabul", async () => {
    await y.getByRole("button", { name: "Depoda kabul", exact: true }).first().click();
    const ks = y.getByRole("button", { name: "Kabul et", exact: true });
    if (await ks.waitFor({ timeout: 3000 }).then(() => true, () => false)) await ks.click(); // ölçüm sayfası (beyanla aynı)
    await y.getByText("Kaydedildi").first().waitFor({ timeout: 15000 });
    await y.getByRole("button", { name: "Araca yüklendi", exact: true }).first().waitFor({ timeout: 15000 });
  });
  await step(y, "araca-yuklendi-fiili-27", async () => {
    await y.getByRole("button", { name: "Araca yüklendi", exact: true }).first().click();
    await y.getByRole("button", { name: "Varışta", exact: true }).first().waitFor({ timeout: 15000 });
    await y.getByText(/fiili 27\/33/).first().waitFor({ timeout: 15000 });
  });
  await step(y, "cevrimdisi-kuyruk-ve-senkron", async () => {
    await y.getByText(/Çevrimdışı simülasyonu/).click();
    await y.getByRole("button", { name: "Varışta", exact: true }).first().click();
    await y.getByText("Bekliyor – sunucu teyidi yok").first().waitFor({ timeout: 10000 });
    await y.screenshot({ path: `${SHOTS}/offline-queued.png` });
    await y.getByText(/Çevrimdışı simülasyonu/).click();
    await y.getByRole("button", { name: "Teslim", exact: true }).first().waitFor({ timeout: 25000 });
    if (await y.getByText(/Bekliyor – sunucu teyidi yok \(/).count()) throw new Error("kuyruk boşalmadı");
  });
  // müşteri tarafı: teslim kodu/alma adresi (Rezervasyonlarım detay)
  let pickupCode = "";
  await step(c, "musteri-varista-teslim-alma-adresi", async () => {
    await c.getByText("Teslim alma adresi").waitFor({ timeout: 25000 });
    const d = c.json[`/customer/reservations/${resId}`];
    pickupCode = d?.pickup?.code ?? "";
    if (!/^\d{6}$/.test(pickupCode)) throw new Error("teslim kodu yok/6 hane değil");
  });
  await step(c, "musteri-yetkili-alici-ekle", async () => {
    await c.getByRole("button", { name: "Alıcı ekle" }).click();
    await c.getByLabel("Alıcı 1").fill("Ayşe Yılmaz");
    await c.getByRole("button", { name: "Alıcıları kaydet" }).click();
    await c.getByText("Yetkili alıcılar kaydedildi").waitFor({ timeout: 15000 });
  });
  await step(y, "teslim", async () => {
    await y.getByRole("button", { name: "Teslim", exact: true }).first().click();
    await y.getByText("Ayşe Yılmaz", { exact: true }).click();
    await y.getByLabel(/teslim kodu/i).fill(pickupCode);
    await y.screenshot({ path: `${SHOTS}/teslim-sheet.png` });
    await y.getByRole("button", { name: "Teslimi kaydet" }).click();
    await y.getByText("Teslim edildi").first().waitFor({ timeout: 25000 });
  });
  await step(c, "musteri-takip-teslim-edildi", async () => {
    await tab(c, "Takip");
    await c.getByText(order, { exact: true }).first().click();
    await c.getByText("Teslim edildi").first().waitFor({ timeout: 20000 });
  });
  await step(c, "asistan-yanit", async () => {
    await tab(c, "Asistan");
    const q = "Fiyat nasıl hesaplanıyor?";
    await c.getByPlaceholder("Mesajınızı yazın…").fill(q);
    await c.getByPlaceholder("Mesajınızı yazın…").press("Enter");
    await c.waitForFunction((qq) => { const t = document.body.innerText; const tail = t.split(qq).pop() ?? ""; return tail.replace(/Mesajınızı yazın…/, "").trim().length > 25 && !t.includes("●"); }, q, { timeout: 60000 });
    if (await c.getByText(/Üzgünüm, yanıt alınamadı/).count()) throw new Error("asistan hata döndü");
  });
} catch (e) { if (e.message !== "abort") console.log("HATA", e.message); }
finally {
  console.log(`\nSüre ${Math.round((Date.now() - T0) / 1000)} sn, konsol hataları: ${consoleErrors.length}`);
  consoleErrors.slice(0, 10).forEach((x) => console.log("  ", x));
  await browser.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `SONUÇ: BAŞARISIZ (${failed})` : `SONUÇ: YEŞİL (${results.length} adım)`);
process.exit(failed ? 1 : 0);
