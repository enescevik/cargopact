/**
 * CargoPact mobil · Modern + Premium katmanı.
 * Web'deki (apps/web/src/components, premium.css) yönün React Native karşılığı:
 * seçerek ilerleyen kontroller, noir yüzeyler, tır haritası, fiyat takvimi, cüzdan kartı, karbon rozeti.
 */
import { ReactNode, useMemo } from "react";
import { Pressable, Share, Text, View, ViewStyle } from "react-native";
import QRCode from "qrcode";
import { c, mono, serif } from "./theme";
import { dt, money, place } from "./format";
import type { Facility, TripCard } from "./types";

/* ---------------- Tarih yardımcıları (İstanbul takvim günü) ---------------- */
const TZ = "Europe/Istanbul";
export const isoDay = (iso: string) => {
  try { return new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ }); } catch { return iso.slice(0, 10); }
};
export function addDays(d: string, n: number): string {
  const x = new Date(`${d}T12:00:00+03:00`);
  x.setUTCDate(x.getUTCDate() + n);
  return isoDay(x.toISOString());
}
export const today = () => isoDay(new Date().toISOString());
const WD = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
const MO = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
export const weekday = (d: string) => WD[new Date(`${d}T12:00:00+03:00`).getUTCDay()] ?? "";
export const dayNum = (d: string) => { const [, m, dd] = d.split("-"); return `${Number(dd)} ${MO[Number(m) - 1] ?? ""}`; };

/* ---------------- Tipografi ---------------- */
export function Eyebrow({ children, light, style }: { children: ReactNode; light?: boolean; style?: object }) {
  return <Text style={[{ fontSize: 11, fontWeight: "800", letterSpacing: 1.1, textTransform: "uppercase", color: light ? c.champagne : c.champagneInk }, style]}>{children}</Text>;
}
export function RouteTitle({ from, to, size = 28, light }: { from: string; to: string; size?: number; light?: boolean }) {
  return (
    <Text style={{ fontFamily: serif, fontSize: size, letterSpacing: -0.4, color: light ? "#fff" : c.cobalt900 }}>
      {from} <Text style={{ color: c.champagne }}>→</Text> {to}
    </Text>
  );
}

/* ---------------- Noir yüzey ---------------- */
export function Noir({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return (
    <View style={[{ backgroundColor: c.cobalt900, borderRadius: 22, padding: 18, gap: 12, overflow: "hidden", borderWidth: 1, borderColor: "rgba(201,183,143,0.28)" }, style]}>
      <View pointerEvents="none" style={{ position: "absolute", right: -60, top: -80, width: 220, height: 220, borderRadius: 110, backgroundColor: c.cobalt700, opacity: 0.45 }} />
      <View pointerEvents="none" style={{ position: "absolute", left: -40, bottom: -90, width: 180, height: 180, borderRadius: 90, backgroundColor: c.cobalt800, opacity: 0.6 }} />
      {children}
    </View>
  );
}
export function NoirKV({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.1)" }}>
      <Text style={{ color: "#B9C3EF", fontSize: 13 }}>{k}</Text>
      <Text style={{ color: "#fff", fontSize: 13, fontWeight: strong ? "800" : "600", flexShrink: 1, textAlign: "right" }}>{v}</Text>
    </View>
  );
}

/* ---------------- Seçim kontrolleri ---------------- */
/** − değer + : elle yazmadan sayı seçimi. */
export function Stepper({ value, onChange, min = 0, max = 9999, step = 1, unit, dark }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; unit?: string; dark?: boolean;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const btn = (label: string, next: number, off: boolean) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label === "−" ? "Azalt" : "Artır"} disabled={off} onPress={() => onChange(clamp(next))}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: dark ? "rgba(255,255,255,0.1)" : c.cobalt50, opacity: off ? 0.35 : pressed ? 0.7 : 1 })}>
      <Text style={{ fontSize: 22, fontWeight: "600", color: dark ? "#fff" : c.cobalt700, marginTop: -2 }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: dark ? "rgba(255,255,255,0.06)" : c.surface, borderRadius: 26, padding: 4, borderWidth: 1, borderColor: dark ? "rgba(255,255,255,0.14)" : c.line, alignSelf: "flex-start" }}>
      {btn("−", value - step, value <= min)}
      <Text style={{ minWidth: 64, textAlign: "center", fontSize: 18, fontWeight: "800", color: dark ? "#fff" : c.ink900, fontVariant: ["tabular-nums"] }}>
        {value.toLocaleString("tr-TR")}{unit ? <Text style={{ fontSize: 12, fontWeight: "600", color: dark ? "#B9C3EF" : c.ink500 }}>{unit}</Text> : null}
      </Text>
      {btn("+", value + step, value >= max)}
    </View>
  );
}

export type Opt<T extends string | number> = { value: T; label: string; sub?: string; disabled?: boolean };
/** Hap (chip) şeklinde tekli seçim; yatay kaydırma yerine sarılır. */
export function ChipSelect<T extends string | number>({ options, value, onChange, small }: {
  options: Opt<T>[]; value: T | null; onChange: (v: T) => void; small?: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <Pressable key={String(o.value)} accessibilityRole="radio" accessibilityState={{ checked: on, disabled: o.disabled }} disabled={o.disabled} onPress={() => onChange(o.value)}
            style={({ pressed }) => ({
              minHeight: small ? 36 : 44, paddingHorizontal: small ? 12 : 14, borderRadius: 999, justifyContent: "center",
              backgroundColor: on ? c.cobalt900 : c.surface, borderWidth: 1, borderColor: on ? c.cobalt900 : c.line,
              opacity: o.disabled ? 0.4 : pressed ? 0.8 : 1,
            })}>
            <Text style={{ color: on ? "#fff" : c.ink700, fontSize: small ? 13 : 14, fontWeight: on ? "700" : "600" }}>{o.label}</Text>
            {!!o.sub && <Text style={{ color: on ? c.mint500 : c.ink500, fontSize: 11, fontWeight: "700" }}>{o.sub}</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={{ flexDirection: "row", backgroundColor: "#ECE7DA", borderRadius: 14, padding: 4, gap: 4 }} accessibilityRole="tablist">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(o.value)}
            style={{ flex: 1, minHeight: 38, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: on ? c.surface : "transparent", ...(on ? { shadowColor: "#0E1222", shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } } : {}) }}>
            <Text style={{ fontSize: 13, fontWeight: on ? "800" : "600", color: on ? c.ink900 : c.ink500 }} numberOfLines={1}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Büyük seçim kartı (ödeme planı, kart, sefer…). */
export function OptionCard({ on, onPress, children, disabled }: { on: boolean; onPress: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: on, disabled }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row", gap: 12, alignItems: "flex-start", padding: 14, borderRadius: 16,
        backgroundColor: on ? c.cobalt50 : c.surface, borderWidth: on ? 2 : 1, borderColor: on ? c.cobalt600 : c.line,
        opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
      })}>
      <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: on ? c.cobalt600 : c.ink300, alignItems: "center", justifyContent: "center", marginTop: 2 }}>
        {on && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.cobalt600 }} />}
      </View>
      <View style={{ flex: 1, gap: 2 }}>{children}</View>
    </Pressable>
  );
}

/* ---------------- Tır haritası (33 palet, üstten görünüm) ---------------- */
export type CellState = "int" | "conf" | "held" | "empty" | "mine" | "full";
export type Cell = { state: CellState; label?: string; color?: string };
const CELL: Record<CellState, { bg: string; border: string; label: string }> = {
  full: { bg: "#C9CFE3", border: "#B3BAD3", label: "Dolu" },
  int: { bg: "#8A93B5", border: "#7882A6", label: "İç yük" },
  conf: { bg: c.cobalt600, border: c.cobalt700, label: "Onaylı" },
  held: { bg: "#EFE6CF", border: c.champagne, label: "Bloke" },
  mine: { bg: c.mint500, border: c.mint600, label: "Sizin" },
  empty: { bg: "#FFFFFF", border: "#D9D2C1", label: "Boş" },
};

export function TruckMap({ cells, positions, legend = true, dark, operator }: { cells: Cell[]; positions: number; legend?: boolean; dark?: boolean; operator?: boolean }) {
  const lanes = positions >= 24 ? 3 : 2;
  const cols = Math.ceil(positions / lanes);
  const all: Cell[] = Array.from({ length: positions }, (_, i) => cells[i] ?? { state: "empty" });
  const counts = all.reduce<Record<string, number>>((m, x) => ((m[x.state] = (m[x.state] ?? 0) + 1), m), {});
  const order: CellState[] = operator ? ["int", "conf", "held", "mine", "empty"] : ["full", "mine", "empty"];
  const empty = counts.empty ?? 0;
  return (
    <View style={{ gap: 10 }} accessibilityLabel={`${positions} pozisyonun ${empty} tanesi boş`}>
      <View style={{ flexDirection: "row", alignItems: "stretch", maxWidth: 40 + cols * 34, width: "100%" }}>
        <View style={{ width: 22, borderTopLeftRadius: 10, borderBottomLeftRadius: 10, backgroundColor: dark ? "rgba(255,255,255,0.14)" : c.cobalt900, alignItems: "center", justifyContent: "center", marginRight: 3 }}>
          <Text style={{ color: dark ? "#fff" : c.champagne, fontSize: 8, fontWeight: "900", transform: [{ rotate: "-90deg" }], width: 40, textAlign: "center" }}>ÖN</Text>
        </View>
        <View style={{ flex: 1, flexDirection: "row", gap: 3, padding: 4, borderRadius: 6, backgroundColor: dark ? "rgba(255,255,255,0.06)" : "#F1ECE0", borderWidth: 1, borderColor: dark ? "rgba(255,255,255,0.14)" : c.line }}>
          {Array.from({ length: cols }, (_, col) => (
            <View key={col} style={{ flex: 1, gap: 3 }}>
              {Array.from({ length: lanes }, (_, lane) => {
                const cell = all[col * lanes + lane];
                if (!cell) return <View key={lane} style={{ aspectRatio: 0.82 }} />;
                const st = CELL[cell.state];
                return (
                  <View key={lane} style={{ aspectRatio: 0.82, borderRadius: 3, backgroundColor: cell.state === "conf" && cell.color ? cell.color : st.bg, borderWidth: 1, borderColor: st.border, alignItems: "center", justifyContent: "center" }}>
                    {cell.state === "mine" ? <Text style={{ color: c.cobalt900, fontSize: 9, fontWeight: "900" }}>✓</Text>
                      : cell.label ? <Text style={{ color: cell.state === "held" ? c.ink700 : "#fff", fontSize: 7, fontWeight: "800" }} numberOfLines={1}>{cell.label}</Text> : null}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
        <View style={{ width: 6, borderTopRightRadius: 3, borderBottomRightRadius: 3, backgroundColor: dark ? "rgba(255,255,255,0.3)" : c.ink300, marginLeft: 2 }} />
      </View>
      {legend && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          {order.filter((s) => counts[s] || s === "empty").map((s) => (
            <View key={s} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: CELL[s].bg, borderWidth: 1, borderColor: CELL[s].border }} />
              <Text style={{ fontSize: 11, color: dark ? "#B9C3EF" : c.ink500 }}>{CELL[s].label} <Text style={{ fontWeight: "800", color: dark ? "#fff" : c.ink900 }}>{counts[s] ?? 0}</Text></Text>
            </View>
          ))}
          <Text style={{ fontSize: 10, color: dark ? "#8F9BCF" : c.ink300 }}>Yükleme: önden arkaya →</Text>
        </View>
      )}
    </View>
  );
}

/** Müşteri görünümü: başka firmaların yükleri anonim "Dolu". */
export function customerCells(positions: number, sellable: number, remaining: number, mine: number): Cell[] {
  const occupied = Math.max(0, positions - sellable) + Math.max(0, sellable - remaining);
  const m = Math.max(0, Math.min(mine, positions - occupied));
  return [
    ...Array.from({ length: Math.min(occupied, positions) }, () => ({ state: "full" as const })),
    ...Array.from({ length: m }, () => ({ state: "mine" as const })),
  ];
}
export const FIRM_COLORS = ["#2547E0", "#0E8FB5", "#7A5AF8", "#1D3AB8", "#D6456B", "#C98A06", "#12A675"];
const CONFIRMED = ["ONAYLI", "INCELEME", "DEPO_KABUL", "YUKLENDI", "VARISTA", "TESLIM", "EKSIK_HASAR"];
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toLocaleUpperCase("tr-TR")).join("");
/** Operatör görünümü: iç yük, onaylı firmalar (baş harf + renk), onay bekleyenler bloke. */
export function operatorCells(internal: number, rs: { name: string; pallets: number; status: string }[]): Cell[] {
  const color = new Map<string, string>();
  rs.forEach((r) => { if (!color.has(r.name)) color.set(r.name, FIRM_COLORS[color.size % FIRM_COLORS.length]!); });
  const cells: Cell[] = Array.from({ length: internal }, () => ({ state: "int" as const }));
  for (const r of rs.filter((x) => CONFIRMED.includes(x.status))) for (let i = 0; i < r.pallets; i++) cells.push({ state: "conf", label: initials(r.name), color: color.get(r.name) });
  for (const r of rs.filter((x) => x.status === "TASIYICI_ONAYI_BEKLIYOR")) for (let i = 0; i < r.pallets; i++) cells.push({ state: "held", label: initials(r.name) });
  return cells;
}

/* ---------------- Esnek tarih fiyat takvimi ---------------- */
export function PriceCalendar({ trips, pallets, value, start, onStart, onSelect, onAlarm }: {
  trips: TripCard[]; pallets: number; value: string; start: string;
  onStart: (d: string) => void; onSelect: (d: string) => void; onAlarm?: (d: string) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const cells = days.map((d) => {
    const onDay = trips.filter((t) => isoDay(t.departureAt) === d);
    const fit = onDay.filter((t) => t.remaining.pallets >= pallets);
    const min = fit.length ? Math.min(...fit.map((t) => t.price.unitPriceMinor)) : null;
    return { d, any: onDay.length > 0, min };
  });
  const prices = cells.map((x) => x.min).filter((x): x is number => x != null);
  const best = prices.length ? Math.min(...prices) : null;
  const canBack = start > today();
  const nav = (label: string, off: boolean, fn: () => void) => (
    <Pressable accessibilityLabel={label} disabled={off} onPress={fn} style={{ width: 22, alignItems: "center", justifyContent: "center", opacity: off ? 0.25 : 1 }}>
      <Text style={{ fontSize: 20, color: c.cobalt700, fontWeight: "600" }}>{label === "Önceki" ? "‹" : "›"}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: "row", gap: 4, alignItems: "stretch" }}>
      {nav("Önceki", !canBack, () => onStart(addDays(start, -7) < today() ? today() : addDays(start, -7)))}
      {cells.map((x) => {
        const on = value === x.d;
        const full = x.min == null && x.any;
        return (
          <Pressable key={x.d} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => (full && onAlarm ? onAlarm(x.d) : onSelect(x.d))}
            style={({ pressed }) => ({
              flex: 1, minHeight: 74, borderRadius: 12, paddingVertical: 7, alignItems: "center", gap: 1,
              backgroundColor: on ? c.cobalt900 : x.min != null ? c.surface : "#F3EFE6", borderWidth: 1, borderColor: on ? c.cobalt900 : x.min != null && x.min === best ? c.mint500 : c.line,
              opacity: pressed ? 0.8 : 1,
            })}>
            <Text style={{ fontSize: 10, fontWeight: "700", color: on ? c.champagne : c.ink500 }}>{weekday(x.d)}</Text>
            <Text style={{ fontSize: 12, fontWeight: "800", color: on ? "#fff" : c.ink900 }} numberOfLines={1}>{dayNum(x.d).split(" ")[0]}</Text>
            <Text style={{ fontSize: 9.5, fontWeight: "800", color: on ? c.mint500 : x.min != null ? c.cobalt700 : full ? c.warning : c.ink300 }} numberOfLines={1} adjustsFontSizeToFit>
              {x.min != null ? money(x.min).replace(/\s?₺|₺\s?/, "") : full ? "🔔" : "—"}
            </Text>
            {x.min != null && x.min === best && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.mint500, marginTop: 1 }} />}
          </Pressable>
        );
      })}
      {nav("Sonraki", false, () => onStart(addDays(start, 7)))}
    </View>
  );
}

/* ---------------- Karbon tahmini (GLEC yaklaşımı, varsayılan katsayılar) ---------------- */
type Point = { latitude?: number | null; longitude?: number | null };
export function roadKm(a: Point, b: Point): number | null {
  if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) return null;
  const R = 6371, rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude), dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h)) * 1.25;
}
const KG_PER_KM = (p: number) => (p <= 6 ? 0.32 : p <= 18 ? 0.55 : 0.9);
export function co2SavedKg(km: number, pallets: number, positions = 33) {
  return Math.max(0, km * KG_PER_KM(pallets) - km * KG_PER_KM(positions) * (pallets / Math.max(positions, 1)));
}
export function CarbonBadge({ from, to, pallets, positions, dark }: { from: Facility; to: Facility; pallets: number; positions: number; dark?: boolean }) {
  const km = roadKm(from, to);
  if (km == null || pallets <= 0) return null;
  const kg = co2SavedKg(km, pallets, positions);
  if (kg < 1) return null;
  const fmt = kg >= 1000 ? `${(kg / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} t` : `${Math.round(kg).toLocaleString("tr-TR")} kg`;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: dark ? "rgba(47,211,154,0.14)" : c.mint100, borderWidth: 1, borderColor: dark ? "rgba(47,211,154,0.35)" : c.mint200 }}>
      <Text style={{ fontSize: 12 }}>🌿</Text>
      <Text style={{ fontSize: 12, color: dark ? c.mint500 : "#0B6E4D" }}>≈ <Text style={{ fontWeight: "800" }}>{fmt}</Text> CO₂ tasarrufu <Text style={{ fontSize: 10, opacity: 0.8 }}>tahmini · ~{Math.round(km)} km</Text></Text>
    </View>
  );
}

/* ---------------- QR (saf JS matris; native'de canvas gerektirmez) ---------------- */
export function QrMatrix({ value, size = 96, color = c.cobalt900 }: { value: string; size?: number; color?: string }) {
  const mods = useMemo(() => {
    try { const q = QRCode.create(value, { errorCorrectionLevel: "M" }); return { n: q.modules.size, data: q.modules.data }; }
    catch { return null; }
  }, [value]);
  if (!mods) return <View style={{ width: size, height: size, backgroundColor: "#fff" }} />;
  const quiet = 2, n = mods.n + quiet * 2, px = size / n;
  return (
    <View style={{ width: size, height: size, backgroundColor: "#fff", borderRadius: 6, padding: px * quiet }}>
      {Array.from({ length: mods.n }, (_, y) => {
        // Yatay koşuları tek View'da birleştir: native'de görünüm sayısını ciddi azaltır.
        const runs: [number, number][] = [];
        for (let x = 0; x < mods.n; x++) {
          if (!mods.data[y * mods.n + x]) continue;
          const last = runs[runs.length - 1];
          if (last && last[0] + last[1] === x) last[1]++; else runs.push([x, 1]);
        }
        return (
          <View key={y} style={{ height: px }}>
            {runs.map(([x, w]) => <View key={x} style={{ position: "absolute", left: x * px, width: w * px + 0.5, height: px + 0.5, backgroundColor: color }} />)}
          </View>
        );
      })}
    </View>
  );
}

/* ---------------- Alıcı cüzdan (teslim) kartı ---------------- */
export function WalletCard({ orderNumber, trip, recipients, pallets, code }: { orderNumber: string; trip: TripCard; recipients: string[]; pallets: number; code?: string | null }) {
  const d = trip.destination;
  const win = d.pickupWindow ? `${d.pickupWindow.from} – ${d.pickupWindow.to}` : "Depo çalışma saatleri";
  const share = () => {
    const text = `CargoPact teslim kartı\nSipariş: ${orderNumber}\n${place(trip.origin)} → ${place(d)} · ${pallets} palet\n` +
      `Teslim noktası: ${d.name}, ${d.address}\nAlım penceresi: ${win}\nTahmini varış: ${dt(trip.arrivalEta)}\n` +
      `Yetkili alıcı: ${recipients.length ? recipients.join(", ") : "henüz eklenmedi (Yüklerim > yük detayı)"}\nDepoda sipariş QR kodunu gösterin.`;
    Share.share({ message: text, title: `Teslim kartı ${orderNumber}` }).catch(() => undefined);
  };
  return (
    <Noir style={{ padding: 0, gap: 0 }}>
      <View style={{ flexDirection: "row", gap: 14, padding: 18, alignItems: "center" }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Eyebrow light>Teslim kartı · yetkili alıcı</Eyebrow>
          <RouteTitle from={place(trip.origin)} to={place(d)} size={22} light />
          <Text style={{ fontFamily: mono, color: "#B9C3EF", fontSize: 12 }}>{orderNumber}</Text>
        </View>
        <QrMatrix value={orderNumber} size={92} />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: c.porcelain, marginLeft: -8 }} />
        <View style={{ flex: 1, borderTopWidth: 1, borderStyle: "dashed", borderColor: "rgba(255,255,255,0.25)" }} />
        <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: c.porcelain, marginRight: -8 }} />
      </View>
      <View style={{ padding: 18, gap: 8 }}>
        {code ? (
          <View style={{ gap: 2 }}>
            <Eyebrow light>Teslim kodu</Eyebrow>
            <Text style={{ fontFamily: mono, color: "#fff", fontSize: 32, letterSpacing: 6, fontWeight: "800" }}>{code}</Text>
            <Text style={{ color: "#8F9BCF", fontSize: 11 }}>Yalnız yetkili alıcıyla paylaşın</Text>
          </View>
        ) : null}
        <NoirKV k="Alıcı" v={recipients.length ? recipients.join(", ") : "Eklenmedi ⚠︎"} />
        <NoirKV k="Palet" v={String(pallets)} />
        <NoirKV k="Tahmini varış" v={dt(trip.arrivalEta)} />
        <NoirKV k="Alım penceresi" v={win} />
        <Text style={{ color: "#B9C3EF", fontSize: 12 }}>{d.name} · {d.address}</Text>
        <Pressable onPress={share} style={({ pressed }) => ({ marginTop: 4, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.22)", backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center", opacity: pressed ? 0.8 : 1 })}>
          <Text style={{ color: "#fff", fontWeight: "700" }}>Kartı paylaş</Text>
        </Pressable>
      </View>
    </Noir>
  );
}

/* ---------------- CTA ---------------- */
export function CTA({ title, sub, onPress, disabled, loading }: { title: string; sub?: string; onPress: () => void; disabled?: boolean; loading?: boolean }) {
  const off = disabled || loading;
  return (
    <Pressable accessibilityRole="button" disabled={off} onPress={onPress}
      style={({ pressed }) => ({ minHeight: 54, borderRadius: 16, backgroundColor: c.mint500, alignItems: "center", justifyContent: "center", paddingHorizontal: 18, opacity: off ? 0.45 : pressed ? 0.85 : 1, shadowColor: c.mint600, shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } })}>
      <Text style={{ color: c.cobalt900, fontSize: 16, fontWeight: "900" }}>{loading ? "Gönderiliyor…" : title}</Text>
      {!!sub && <Text style={{ color: c.cobalt800, fontSize: 11, fontWeight: "700" }}>{sub}</Text>}
    </Pressable>
  );
}
