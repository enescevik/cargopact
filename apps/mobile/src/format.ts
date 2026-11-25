export function money(minor: number): string {
  const v = (minor ?? 0) / 100;
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: v % 1 === 0 ? 0 : 2 }).format(v);
  } catch {
    return `${v.toFixed(2)} ₺`;
  }
}

const TZ = "Europe/Istanbul";
export function dt(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("tr-TR", { timeZone: TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}
export function hm(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("tr-TR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}
export function dayLabel(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("tr-TR", { timeZone: TZ, weekday: "short", day: "numeric", month: "long" });
  } catch { return iso; }
}
export const num = (n: number) => (n ?? 0).toLocaleString("tr-TR");

export function statusTone(s: string): "success" | "pending" | "danger" | "warning" | "info" | "neutral" {
  switch (s) {
    case "ONAYLI": case "TESLIM": return "success";
    case "TASIYICI_ONAYI_BEKLIYOR": return "pending";
    case "RET": case "IPTAL": case "GELMEDI": return "danger";
    case "SURESI_DOLDU": case "EKSIK_HASAR": return "warning";
    case "DEPO_KABUL": case "YUKLENDI": case "VARISTA": return "info";
    default: return "neutral";
  }
}
