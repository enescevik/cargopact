import { CONTRACT_TEMPLATE_V1 } from "./contract-template";

export const CONTRACT_CODE = "TASIMA";
export const CONTRACT_VERSION = "1.0-taslak";
export const CONTRACT_TITLE = "CargoPact Depo–Depo Paylaşımlı Taşıma Sözleşmesi";
export const CONTRACT_PLACEHOLDER = "—";

export interface ContractValues {
  customerName: string; carrierName: string; tripReference: string; originName: string; destinationName: string;
  departureAt: Date; bookingCutoffAt: Date; intakeCutoffAt: Date; pickupWindow: string | null;
  pallets: number; grossKg: number; volumeM3: number; productClass: string;
  unitPriceMinor: number; totalPriceMinor: number; paymentPlan: "full" | "deposit"; depositPercent: number;
  signerName?: string | null; acceptedAt?: Date | null; contractHash?: string | null;
}

const money = (minor: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(minor / 100);
const istanbul = (d: Date) => new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d) + " (İstanbul)";
const num = (n: number) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(n);

export const paymentPlanLabel = (plan: "full" | "deposit", pct: number) => (plan === "full" ? "Tamamı peşin (onayda)" : `%${pct} kapora onayda, kalan depo kabulünde`);

/** Şablonu gerçek değerlerle doldurur. İmza alanları verilmezse "—" kalır (önizleme). */
export function renderContract(v: ContractValues): string {
  const map: Record<string, string> = {
    customerName: v.customerName, carrierName: v.carrierName, tripReference: v.tripReference,
    originName: v.originName, destinationName: v.destinationName,
    departure: istanbul(v.departureAt), bookingCutoff: istanbul(v.bookingCutoffAt), intakeCutoff: istanbul(v.intakeCutoffAt),
    pickupWindow: v.pickupWindow || "Varış deposunun çalışma saatleri",
    pallets: String(v.pallets), grossKg: num(v.grossKg), volumeM3: num(v.volumeM3), productClass: v.productClass,
    unitPrice: money(v.unitPriceMinor), totalPrice: money(v.totalPriceMinor),
    paymentPlan: paymentPlanLabel(v.paymentPlan, v.depositPercent),
    signerName: v.signerName || CONTRACT_PLACEHOLDER,
    acceptedAt: v.acceptedAt ? istanbul(v.acceptedAt) : CONTRACT_PLACEHOLDER,
    contractHash: v.contractHash || CONTRACT_PLACEHOLDER,
  };
  return CONTRACT_TEMPLATE_V1.replace(/\{\{(\w+)\}\}/g, (m, k: string) => map[k] ?? m);
}

/** Saklanan önizleme metninin 11. bölümünü imza bilgisiyle doldurur (gövde değişmez; parmak izi önizleme metnindendir). */
export function signPreview(previewMd: string, sig: { signerName: string; acceptedAt: Date; contractHash: string }): string {
  const marker = "## 11. Onay";
  const head = previewMd.slice(0, Math.max(0, previewMd.indexOf(marker)));
  const tpl = CONTRACT_TEMPLATE_V1.slice(CONTRACT_TEMPLATE_V1.indexOf(marker));
  const map: Record<string, string> = { signerName: sig.signerName, acceptedAt: istanbul(sig.acceptedAt), contractHash: sig.contractHash };
  return head + tpl.replace(/\{\{(\w+)\}\}/g, (m, k: string) => map[k] ?? m);
}
