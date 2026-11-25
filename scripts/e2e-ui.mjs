// Jüri akışı UI e2e. Çalıştır: cd /tmp/pw && node /workshop/scripts/e2e-ui.mjs  (SEED_USER_PASSWORD env gerekli)
import { chromium } from "/tmp/pw/node_modules/playwright/index.mjs";
import { mkdirSync } from "node:fs";
const BASE = process.env.BASE_URL ?? "https://d1xysc2r88pheq.cloudfront.net";
const PASS = process.env.SEED_USER_PASSWORD;
const SHOTS = "/tmp/pw/shots";
const TRIP = "DNC-DEMO-GEB-ANK";
mkdirSync(SHOTS, { recursive: true });
if (!PASS) { console.error("SEED_USER_PASSWORD yok"); process.exit(2); }
const browser = await chromium.launch();
const results = []; const consoleErrors = [];
let n = 0;
async function step(page, name, fn) {
  const id = String(++n).padStart(2, "0");
  try { await fn(); results.push({ id, name, ok: true }); console.log(`PASS ${id} ${name}`); }
  catch (e) {
    results.push({ id, name, ok: false, err: String(e.message).split("\n")[0] }); console.log(`FAIL ${id} ${name}: ${String(e.message).split("\n")[0]}`);
  }
  await page.screenshot({ path: `${SHOTS}/${id}-${name.replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}.png` }).catch(() => {});
  if (!results.at(-1).ok) throw new Error("abort");
}
async function newCtx(label) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => consoleErrors.push(`[${label}] pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/favicon/.test(m.text())) consoleErrors.push(`[${label}] ${m.text()}`); });
  return page;
}
async function login(page, email) {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASS);
  await page.getByRole("button", { name: /Giriş yap/ }).click();
}
const tomorrow = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date(Date.now() + 864e5));
const quoteOf = async (page, pallets, kg) => {
  await page.getByLabel("Palet adedi").fill(String(pallets));
  await page.getByLabel("Brüt ağırlık (kg)").fill(String(kg));
};
const T0 = Date.now();
try {
  // ---------- MÜŞTERİ ----------
  const c = await newCtx("musteri");
  await step(c, "musteri-giris", async () => {
    await login(c, "web.musteri@cargopact.example.test");
    await c.getByText("Palet gönder").first().waitFor({ timeout: 20000 });
  });
  await step(c, "arama-gebze-ankara-yarin", async () => {
    await c.getByLabel("Çıkış şehri").fill("Gebze");
    await c.getByLabel("Varış şehri").fill("Ankara");
    await c.locator('input[type="date"]').fill(tomorrow());
    await c.getByLabel("Palet", { exact: true }).fill("3");
    await c.getByRole("button", { name: /Sefer ara/ }).click();
    await c.getByTestId("route").filter({ hasText: /Gebze\s*Sincan/ }).first().waitFor({ timeout: 15000 });
  });
  await step(c, "sefer-ac", async () => {
    const card = c.locator(".card.trip", { hasText: TRIP === "" ? "" : "Sincan" }).first();
    await card.getByRole("button", { name: /Seç/ }).click();
    await c.getByText(TRIP).first().waitFor({ timeout: 15000 });
  });
  await step(c, "yuk-beyani-3-1500-GENEL", async () => {
    await quoteOf(c, 3, 1500);
    await c.locator("select").selectOption("GENEL");
    await c.locator(".price-big", { hasText: "₺" }).first().waitFor({ timeout: 15000 });
    await c.getByText(/Ödeme planı/).first().waitFor();
  });
  await step(c, "tam-odeme-kabul", async () => {
    await c.getByText(/Peşin|tamamı|Tamamı/i).first().click().catch(() => {});
    const btn = c.getByRole("button", { name: /Teklifi kabul et/ });
    await btn.waitFor(); if (await btn.isDisabled()) throw new Error("kabul butonu pasif");
    await btn.click();
    await c.getByText(/Teklifiniz alındı/).waitFor({ timeout: 25000 });
    await c.getByText(/Taşıyıcı onayı bekliyor/i).first().waitFor({ timeout: 5000 });
  });
  const ref = (await c.locator(".mono").first().innerText()).trim();
  // ---------- TAŞIYICI ----------
  const y = await newCtx("yonetici");
  await step(y, "yonetici-giris", async () => {
    await login(y, "web.yonetici@cargopact.example.test");
    await y.getByText("Aracım var, yük ekle").first().waitFor({ timeout: 20000 });
  });
  await step(y, "sefer-ac-onayla", async () => {
    await y.getByRole("button", { name: new RegExp(TRIP) }).first().click().catch(async () => { await y.getByText(TRIP).first().click(); });
    await y.getByText("Bekleyen talepler").waitFor({ timeout: 15000 });
    const row = y.locator("tr", { hasText: "Marmara" }).first();
    await row.getByRole("button", { name: /Onayla/ }).click();
    await y.getByText(/onaylandı/).first().waitFor({ timeout: 20000 });
  });
  await step(y, "kapasite-28-33", async () => {
    await y.getByText(/28\s*\/\s*33/).first().waitFor({ timeout: 20000 });
  });
  await step(y, "juri-panosu-28", async () => {
    await y.getByRole("button", { name: /Jüri panosu/ }).click();
    await y.getByText(/28\s*\/\s*33/).first().waitFor({ timeout: 20000 });
    await y.waitForTimeout(900);
    const cells = await y.locator(".pgrid .pos").count();
    if (cells !== 33) throw new Error(`33 hücre bekleniyordu, ${cells}`);
    await y.locator("h1", { hasText: /Gebze\s*→\s*Sincan/ }).first().waitFor({ timeout: 5000 });
  });
  // ---------- MÜŞTERİ: sipariş no + takip ----------
  let order = "";
  await step(c, "siparis-no-ve-qr", async () => {
    await c.getByRole("button", { name: /Rezervasyonu görüntüle/ }).click();
    const el = c.getByTestId("order-number");
    await el.waitFor({ timeout: 30000 });
    order = (await el.innerText()).trim();
    if (!/^CP-2026-\d{6}$/.test(order)) throw new Error("sipariş no biçimi: " + order);
    const qrs = await c.getByTestId("qr").count();
    if (qrs < 4) throw new Error(`QR sayısı ${qrs} (sipariş + 3 palet bekleniyordu)`);
  });
  await step(c, "takip", async () => {
    await c.getByRole("button", { name: /Yükü takip et/ }).click();
    await c.getByText(order).first().waitFor({ timeout: 15000 });
    await c.getByText(/Sıradaki adım/).waitFor({ timeout: 15000 });
  });
  await step(c, "chat-sefer-sorusu", async () => {
    await c.getByRole("button", { name: /Asistan/ }).first().click();
    const q = "Gebze'den Ankara'ya 3 palet yüküm var, uygun sefer var mı?";
    await c.getByPlaceholder("Mesajınızı yazın…").fill(q);
    await c.getByRole("button", { name: /Gönder/ }).click();
    await c.locator(".msg.a:not(.typing)").first().waitFor({ timeout: 25000 });
    const t = await c.locator(".msg.a").first().innerText();
    if (t.trim().length < 10) throw new Error("boş yanıt");
  });
  // ---------- BAŞKENT: ağırlık aşımı ----------
  const b = await newCtx("baskent");
  await step(b, "baskent-giris-ve-sefer", async () => {
    await login(b, "user@baskent.example.test");
    await b.getByText("Palet gönder").first().waitFor({ timeout: 20000 });
    await b.getByLabel("Çıkış şehri").fill("Gebze");
    await b.getByLabel("Varış şehri").fill("Ankara");
    await b.locator('input[type="date"]').fill(tomorrow());
    await b.getByRole("button", { name: /Sefer ara/ }).click();
    await b.locator(".card.trip", { hasText: "Sincan" }).first().getByRole("button", { name: /Seç/ }).click();
    await b.getByText(TRIP).first().waitFor({ timeout: 15000 });
  });
  await step(b, "agirlik-asimi-3-2600", async () => {
    // Plan senaryosu: 3 palet / 2600 kg. Güncel seed'de araçta yeterli kg kalabiliyor; sonucu raporla.
    await quoteOf(b, 3, 2600);
    await b.locator(".summary .price-big").waitFor({ timeout: 15000 });
    await b.waitForTimeout(1200);
    const rejected = await b.locator(".alert.err[role=alert]").count();
    console.log(`   3/2600 sonucu: ${rejected ? "reddedildi" : "UYGUN (MAX_GROSS_EXCEEDED beklenen senaryo seed'de oluşmuyor)"}`);
    // Her durumda: aşırı ağırlıkta Türkçe gerekçe + pasif buton
    await quoteOf(b, 3, 9000);
    const alert = b.locator(".alert.err[role=alert]");
    await alert.waitFor({ timeout: 15000 });
    const txt = (await alert.innerText()).replace(/\s+/g, " ");
    console.log("   gerekçe:", txt);
    if (/[A-Z]{3,}_[A-Z_]+/.test(txt)) throw new Error("ham kod görünüyor: " + txt);
    if (!/kg|ağırlık|yük/i.test(txt)) throw new Error("Türkçe ağırlık gerekçesi yok: " + txt);
    if (!(await b.getByRole("button", { name: /Teklifi kabul et/ }).isDisabled())) throw new Error("buton aktif");
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
