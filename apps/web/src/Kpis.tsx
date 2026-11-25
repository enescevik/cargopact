import { useState } from "react";
import { api } from "./api";
import { day, num, tl } from "./format";
import { Empty, ErrorBox, SkeletonCards, useFetch } from "./ui";

interface Metric { value: number | null; numerator: number; denominator: number; formula: string; unit: "percent" | "minutes" | "count" | "minor" | "pallets" }
interface Triple { pallets: number; kg: number; m3: number }
interface KpiTrip { tripId: string; reference: string; route: string; status: string; departureAt: string; sellable: Triple; held: Triple; planned: Triple; actual: Triple; internalReserveViolation: boolean; doubleBooking: boolean }
export interface KpiResponse {
  from: string; to: string; scope: string; counts: { quotes: number; eligibleQuotes: number; reservations: number; trips: number };
  metrics: Record<string, Metric>; trips: KpiTrip[];
}
const fmt = (m: Metric) => {
  if (m.value === null) return "—";
  switch (m.unit) {
    case "percent": return `%${num(m.value)}`;
    case "minutes": return `${num(m.value)} dk`;
    case "minor": return tl(m.value);
    default: return num(m.value);
  }
};
const sub = (m: Metric) => (m.unit === "minor" || m.unit === "minutes" ? "" : `${num(m.numerator)} / ${num(m.denominator)}`);
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const ORDER: [string, string][] = [
  ["quoteToReservation", "Teklif → rezervasyon"], ["reservationToApproval", "Rezervasyon → onay"], ["decisionMinutesAvg", "Ort. karar süresi"], ["decisionMinutesMedian", "Medyan karar süresi"],
  ["onTimeDropoff", "Zamanında depo bırakma"], ["onTimePickup", "Zamanında teslim alma"], ["damageRate", "Eksik/hasar oranı"], ["noShowRate", "Gelmeme oranı"],
  ["soldExternalPallets", "Satılan dış palet"], ["loadedExternalPallets", "Yüklenen dış palet"], ["internalReserveViolations", "İç rezerv ihlali"], ["doubleBookings", "Çift rezervasyon"],
  ["grossRevenueMinor", "Brüt gelir"], ["variableCostMinor", "Değişken maliyet"], ["contributionMinor", "Katkı payı"],
];
export const useKpis = (from: string, to: string, poll?: number) =>
  useFetch((s) => api<KpiResponse>("GET", `/carrier/kpis?from=${from}&to=${to}`, undefined, { signal: s }), [from, to], poll);

function Bar({ label, planned, held, actual, cap, unit }: { label: string; planned: number; held: number; actual: number; cap: number; unit: string }) {
  const w = (v: number) => `${cap > 0 ? Math.min(100, (v / cap) * 100) : 0}%`;
  return (
    <div style={{ minWidth: 120 }} title={`${label}: onaylı ${num(planned)}, bloke ${num(held)}, fiili ${num(actual)} / satılabilir ${num(cap)} ${unit}`}>
      <div className="bar xs" style={{ position: "relative" }}>
        <div style={{ width: w(planned), background: "var(--c5, #2547E0)" }} />
        <div style={{ width: w(held), background: "#C98A06", opacity: .6 }} />
      </div>
      <div className="bar xs" style={{ marginTop: 2 }}><div style={{ width: w(actual), background: "#12A675" }} /></div>
      <div className="tiny muted">{num(planned)}{held ? `+${num(held)}` : ""} / {num(cap)} {unit} · fiili {num(actual)}</div>
    </div>
  );
}

export function KpiView() {
  const [from, setFrom] = useState(() => ymd(new Date(Date.now() - 30 * 86_400_000)));
  const [to, setTo] = useState(() => ymd(new Date(Date.now() + 7 * 86_400_000)));
  const { data, error, loading, reload } = useKpis(from, to);
  return (
    <div className="page" style={{ maxWidth: 1400 }}>
      <div className="page-head row between wrap">
        <div><span className="kicker">Performans</span><h1 className="title">Performans (KPI)</h1>
          <div className="muted small">Metriğin üzerine gelince hesaplama formülü görünür.{data ? ` Kapsam: ${data.scope === "all-carriers" ? "tüm taşıyıcılar" : "firmanız"}.` : ""}</div></div>
        <div className="row" style={{ gap: 8 }}>
          <label className="small muted">Başlangıç <input className="input" type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} /></label>
          <label className="small muted">Bitiş <input className="input" type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} /></label>
        </div>
      </div>
      {loading && !data && <SkeletonCards n={2} h={160} />}
      {error && !data && <ErrorBox error={error} onRetry={reload} />}
      {data && (
        <>
          <div className="tiny muted" style={{ marginBottom: 8 }}>{num(data.counts.quotes)} teklif ({num(data.counts.eligibleQuotes)} uygun) · {num(data.counts.reservations)} rezervasyon · {num(data.counts.trips)} sefer</div>
          <div className="kpis" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))" }}>
            {ORDER.map(([k, label]) => {
              const m = data.metrics[k];
              if (!m) return null;
              const bad = (k === "internalReserveViolations" || k === "doubleBookings") && (m.value ?? 0) > 0;
              return (
                <div key={k} className="kpi" title={m.formula} data-metric={k}>
                  <div className="muted small">{label} <span title={m.formula} style={{ cursor: "help" }}>ⓘ</span></div>
                  <div className="v" style={{ fontSize: 30, color: bad ? "#D6456B" : undefined }}>{fmt(m)}</div>
                  <div className="tiny muted">{sub(m) || "\u00a0"}</div>
                </div>
              );
            })}
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <div className="serif" style={{ fontSize: 20 }}>Sefer bazında doluluk</div>
            <div className="tiny muted">Palet, kg ve m³ ayrı gösterilir. Üst çubuk: onaylı (mavi) + bloke (sarı); alt çubuk: fiili yüklenen (yeşil). Payda: satılabilir kapasite.</div>
            {data.trips.length === 0 ? <Empty title="Bu aralıkta sefer yok" /> : (
              <table style={{ marginTop: 10 }}>
                <thead><tr><th>Sefer</th><th>Kalkış</th><th>Palet</th><th>Kg</th><th>m³</th><th>Kontrol</th></tr></thead>
                <tbody>{data.trips.map((t) => (
                  <tr key={t.tripId}>
                    <td><b>{t.reference}</b><div className="tiny muted">{t.route}</div></td>
                    <td className="small">{day(t.departureAt)}</td>
                    <td><Bar label="Palet" planned={t.planned.pallets} held={t.held.pallets} actual={t.actual.pallets} cap={t.sellable.pallets} unit="palet" /></td>
                    <td><Bar label="Kg" planned={t.planned.kg} held={t.held.kg} actual={t.actual.kg} cap={t.sellable.kg} unit="kg" /></td>
                    <td><Bar label="m³" planned={t.planned.m3} held={t.held.m3} actual={t.actual.m3} cap={t.sellable.m3} unit="m³" /></td>
                    <td className="small">{t.internalReserveViolation || t.doubleBooking ? <span style={{ color: "#D6456B" }}>İhlal</span> : "Temiz"}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Jüri panosu için kompakt KPI şeridi (son 30 gün). */
export function KpiStrip() {
  const [from] = useState(() => ymd(new Date(Date.now() - 30 * 86_400_000)));
  const [to] = useState(() => ymd(new Date(Date.now() + 7 * 86_400_000)));
  const { data } = useKpis(from, to, 30000);
  if (!data) return null;
  const keys: [string, string][] = [["quoteToReservation", "Teklif→rezervasyon"], ["reservationToApproval", "Onay oranı"], ["decisionMinutesMedian", "Medyan karar"], ["onTimeDropoff", "Zamanında bırakma"], ["noShowRate", "Gelmeme"], ["internalReserveViolations", "İç rezerv ihlali"], ["contributionMinor", "Katkı"]];
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="row between"><div className="serif" style={{ fontSize: 20 }}>Performans (KPI)</div><span className="tiny muted">son 30 gün</span></div>
      <div className="row wrap" style={{ gap: 24, marginTop: 8 }}>
        {keys.map(([k, l]) => { const m = data.metrics[k]; return m ? (
          <div key={k} title={m.formula}><div className="tiny muted">{l}</div><div style={{ fontSize: 22, fontWeight: 700 }}>{fmt(m)}</div></div>) : null; })}
      </div>
    </div>
  );
}
