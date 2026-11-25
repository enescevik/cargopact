/**
 * e-İrsaliye (UBL-TR DespatchAdvice) XML dosyasından yük beyanı önerisi çıkarır.
 * Tamamen tarayıcıda çalışır; dosya sunucuya gönderilmez.
 */
export type Declaration = {
  pallets: number | null; grossKg: number | null; volumeM3: number | null;
  productHint: string | null; items: string[]; despatchId: string | null; receiver: string | null;
};

const byLocal = (root: Document | Element, name: string) => Array.from(root.getElementsByTagNameNS("*", name));
const num = (s: string | null | undefined) => {
  if (!s) return null;
  const n = Number(s.replace(",", ".").trim());
  return Number.isFinite(n) ? n : null;
};

export function parseDespatchAdvice(xml: string): Declaration {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("Dosya okunamadı: geçerli bir XML değil.");
  if (!byLocal(doc, "DespatchAdvice").length && !byLocal(doc, "DespatchLine").length)
    throw new Error("Bu dosya bir e-İrsaliye (DespatchAdvice) değil.");

  const first = (name: string, root: Document | Element = doc) => byLocal(root, name)[0]?.textContent?.trim() ?? null;
  const shipment = byLocal(doc, "Shipment")[0] ?? doc;

  // Ağırlık: Shipment/GrossWeightMeasure (kg; TNE ise tona çevir)
  const gw = byLocal(shipment, "GrossWeightMeasure")[0];
  let grossKg = num(gw?.textContent);
  const unit = gw?.getAttribute("unitCode")?.toUpperCase();
  if (grossKg != null && unit === "TNE") grossKg *= 1000;

  const vol = byLocal(shipment, "GrossVolumeMeasure")[0];
  const volumeM3 = num(vol?.textContent);

  // Palet: TransportHandlingUnit sayısı veya TotalTransportHandlingUnitQuantity; yoksa PX/PLT birimli satırlar
  let pallets = num(first("TotalTransportHandlingUnitQuantity"));
  if (pallets == null) {
    const thu = byLocal(doc, "TransportHandlingUnit").length;
    if (thu) pallets = thu;
  }
  if (pallets == null) {
    const palletLines = byLocal(doc, "DeliveredQuantity").filter((q) => ["PX", "PLT", "PF"].includes((q.getAttribute("unitCode") ?? "").toUpperCase()));
    if (palletLines.length) pallets = palletLines.reduce((s, q) => s + (num(q.textContent) ?? 0), 0);
  }

  const items = byLocal(doc, "Item").map((i) => first("Name", i)).filter((x): x is string => !!x).slice(0, 8);
  const all = items.join(" ").toLocaleLowerCase("tr-TR");
  const productHint =
    /(adr|tehlikeli|yanıcı|asit|gaz tüp)/.test(all) ? "TEHLIKELI"
    : /(gıda|gida|makarna|un |bakliyat|konserve|içecek|su )/.test(all) ? "GIDA-AMBALAJLI"
    : items.length ? "GENEL" : null;

  const receiver = first("RegistrationName", byLocal(doc, "DeliveryCustomerParty")[0] ?? doc);
  return { pallets: pallets != null ? Math.max(1, Math.round(pallets)) : null, grossKg, volumeM3, productHint, items, despatchId: first("ID"), receiver };
}
