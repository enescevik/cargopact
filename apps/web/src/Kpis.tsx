import { useMemo, useState } from "react";
import { CheckCircle2, AlertTriangle, Leaf } from "lucide-react";
import { ChipSelect } from "./components/controls";
import { co2Saved, roadKm } from "./lib/carbon";
import type { CarrierTrip } from "./types";
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
  const [preset, setPreset] = useState<"7" | "30" | "90" | "custom">("30");
  const pickPreset = (p: "7" | "30" | "90" | "custom") => {
    setPreset(p);
    if (p !== "custom") { setFrom(ymd(new Date(Date.now() - Number(p) * 86_400_000))); setTo(ymd(new Date(Date.now() + 7 * 86_400_000))); }
  };
  const { data, error, loading, reload } = useKpis(from, to);
  const trips = useFetch((s) => api<{ items: CarrierTrip[] }>("GET", "/carrier/trips", undefined, { signal: s }), []);

  // Karbon: dış paletler ayrı araçlarla gitseydi vs paylaşımlı araçta (tahmini, GLEC yaklaşımı)
  const carbon = useMemo(() => {
    if (!data) return null;
    const geo = new Map((trips.data?.items ?? []).map((t) => [t.id, t]));
    const rows = data.trips.map((k) => {
      const t = geo.get(k.tripId);
      const km = t ? roadKm(t.origin, t.destination) : null;
      const pallets = k.actual.pallets || k.planned.pallets;
      const positions = t?.capacity.totalPositions ?? 33;
      const c = km && pallets ? co2Saved(km, pallets, positions) : null;
      return { k, km, pallets, c };
    });
    const known = rows.filter((r) => r.c);
    return {
      rows,
      saved: known.reduce((a, r) => a + r.c!.savedKg, 0),
      shared: known.reduce((a, r) => a + r.c!.sharedKg, 0),
      dedicated: known.reduce((a, r) => a + r.c!.dedicatedKg, 0),
      km: known.reduce((a, r) => a + (r.km ?? 0), 0),
      missing: rows.length - known.length,
    };
  }, [data, trips.data]);

  const m = data?.metrics ?? {};
  const v = (k: string) => m[k]?.value ?? null;
  const gross = v("grossRevenueMinor") ?? 0, contrib = v("contributionMinor") ?? 0, cost = v("variableCostMinor") ?? 0;

  return (
    <div className="page rep" style={{ maxWidth: 1400 }}>
      <div className="page-head row between wrap">
        <div><span className="kicker">Rapor</span><h1 className="title">Performans</h1>
          <div className="muted small">{data ? `${day(data.from)} – ${day(data.to)} · ${data.scope === "all-carriers" ? "tüm taşıyıcılar" : "firmanız"} · ${num(data.counts.trips)} sefer` : "Yükleniyor…"}</div></div>
        <div className="col" style={{ gap: 8, alignItems: "flex-end" }}>
          <ChipSelect size="sm" ariaLabel="Dönem" value={preset} onChange={pickPreset} options={[
            { value: "7", label: "Son 7 gün" }, { value: "30", label: "Son 30 gün" }, { value: "90", label: "Son 90 gün" }, { value: "custom", label: "Özel aralık" },
          ]} />
          {preset === "custom" && (
            <div className="row" style={{ gap: 8 }}>
              <input className="input sm" type="date" aria-label="Başlangıç" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
              <input className="input sm" type="date" aria-label="Bitiş" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} />
            </div>
          )}
        </div>
      </div>
      {loading && !data && <SkeletonCards n={2} h={160} />}
      {error && !data && <ErrorBox error={error} onRetry={reload} />}
      {data && (
        <>
          {/* ---- özet ---- */}
          <div className="rep-hero">
            <div className="rep-tile noir">
              <span className="eyebrow light">Katkı payı</span>
              <b>{tl0(contrib)}</b>
              <span className="tiny light">Brüt gelirin %{gross ? Math.round((contrib / gross) * 100) : 0}'i · gelir {tl0(gross)}</span>
            </div>
            <Tile label="Dış palet doluluğu" value={pct(v("soldExternalPallets"))} sub={`${num(m.soldExternalPallets?.numerator ?? 0)} / ${num(m.soldExternalPallets?.denominator ?? 0)} satılabilir palet satıldı`} title={m.soldExternalPallets?.formula} />
            <Tile label="Teklif → rezervasyon" value={pct(v("quoteToReservation"))} sub={`${num(data.counts.reservations)} rezervasyon / ${num(data.counts.eligibleQuotes)} uygun teklif`} title={m.quoteToReservation?.formula} />
            <div className="rep-tile green">
              <span className="eyebrow"><Leaf size={12} /> CO₂ tasarrufu</span>
              <b>{carbon ? `${num(Math.round(carbon.saved))} kg` : "—"}</b>
              <span className="tiny">tahmini · ayrı araçlara göre %{carbon && carbon.dedicated ? Math.round((carbon.saved / carbon.dedicated) * 100) : 0} daha az</span>
            </div>
          </div>

          {/* ---- huni + kalite ---- */}
          <div className="rep-row">
            <section className="rep-card">
              <h3>Satış hunisi</h3>
              <p className="tiny">Gelen tekliften onaylı yüke kadar kaç talep ilerledi.</p>
              <Funnel steps={[
                ["Teklif", data.counts.quotes], ["Kapasiteye uygun", data.counts.eligibleQuotes],
                ["Rezervasyon", data.counts.reservations], ["Taşıyıcı onayı", m.reservationToApproval?.numerator ?? 0],
              ]} />
            </section>
            <section className="rep-card">
              <h3>Hizmet kalitesi</h3>
              <p className="tiny">Hedef çizgisi: zamanında oranlar için %95, kayıp oranları için %5.</p>
              <div className="quality">
                <Quality label="Zamanında depo bırakma" m={m.onTimeDropoff} good="high" />
                <Quality label="Zamanında teslim alma" m={m.onTimePickup} good="high" />
                <Quality label="Eksik / hasar" m={m.damageRate} good="low" />
                <Quality label="Gelmeme" m={m.noShowRate} good="low" />
              </div>
              <div className="rep-mini">
                <span>Ort. karar süresi <b>{fmtM(m.decisionMinutesAvg)}</b></span>
                <span>Medyan <b>{fmtM(m.decisionMinutesMedian)}</b></span>
                <span>İç rezerv ihlali <b className={(v("internalReserveViolations") ?? 0) > 0 ? "bad" : ""}>{fmtM(m.internalReserveViolations)}</b></span>
                <span>Çift rezervasyon <b className={(v("doubleBookings") ?? 0) > 0 ? "bad" : ""}>{fmtM(m.doubleBookings)}</b></span>
              </div>
            </section>
          </div>

          {/* ---- sefer doluluğu ---- */}
          <section className="rep-card">
            <div className="row between wrap"><h3>Sefer bazında doluluk</h3>
              <div className="legend"><span><i className="sw" style={{ background: C_PLAN }} />Planlanan (onaylı)</span><span><i className="sw" style={{ background: C_ACT }} />Fiili yüklenen</span></div></div>
            <p className="tiny">Satılabilir dış palet kapasitesine oranla. Çubukların üzerine gelince ayrıntı görünür.</p>
            {data.trips.length === 0 ? <Empty title="Bu aralıkta sefer yok" /> : <FillChart trips={data.trips} />}
          </section>

          {/* ---- gelir + karbon ---- */}
          <div className="rep-row">
            <section className="rep-card">
              <h3>Gelir dağılımı</h3>
              <p className="tiny">Brüt gelirden değişken maliyet düşülünce kalan katkı.</p>
              {gross <= 0 && <div className="note">Bu dönemde onaylı rezervasyon geliri yok.</div>}
              {gross > 0 && <div className="split-bar big" role="img" aria-label={`Değişken maliyet ${tl0(cost)}, katkı ${tl0(contrib)}`}>
                <i className="cost" style={{ width: `${gross ? (cost / gross) * 100 : 0}%` }} />
                <i className="contrib" style={{ width: `${Math.max(0, (contrib / gross) * 100)}%` }} />
              </div>}
              <div className="rep-kv">
                <div><span><i className="sw" style={{ background: "#2547E0" }} />Brüt gelir</span><b>{tl0(gross)}</b></div>
                <div><span><i className="sw cost" />Değişken maliyet</span><b>{tl0(cost)}</b></div>
                <div><span><i className="sw contrib" />Katkı payı</span><b>{tl0(contrib)}</b></div>
              </div>
            </section>
            <section className="rep-card">
              <h3><Leaf size={16} /> Karbon emisyonu</h3>
              <p className="tiny">Aynı dış yükler ayrı (özel) araçlarla taşınsaydı oluşacak emisyon ile paylaşımlı araçtaki payı.</p>
              {carbon && carbon.dedicated > 0 ? (
                <>
                  <CompareBars rows={[["Ayrı araçlarla", carbon.dedicated, "#9AA0AE"], ["CargoPact paylaşımlı", carbon.shared, C_ACT]]} unit="kg CO₂e" />
                  <div className="rep-kv">
                    <div><span>Önlenen emisyon</span><b className="good">{num(Math.round(carbon.saved))} kg CO₂e</b></div>
                    <div><span>Toplam yol</span><b>{num(Math.round(carbon.km))} km</b></div>
                    <div><span>≈ ağaç eşdeğeri</span><b>{num(Math.round(carbon.saved / 21))} ağaç/yıl</b></div>
                  </div>
                  <p className="tiny">Tahmin: yol ≈ kuş uçuşu × 1,25; araç sınıfına göre 0,32 / 0,55 / 0,9 kg CO₂e/km (GLEC yaklaşımı). Bir ağaç yılda ≈ 21 kg CO₂ tutar.{carbon.missing ? ` ${carbon.missing} seferin konumu eksik, hesaba katılmadı.` : ""}</p>
                </>
              ) : <Empty title="Karbon hesabı için veri yok" text="Seçili dönemde dış yük taşıyan, konumu bilinen sefer bulunamadı." />}
            </section>
          </div>

          <details className="rep-card">
            <summary><h3 style={{ display: "inline" }}>Sefer ayrıntı tablosu</h3> <span className="tiny">palet · kg · m³</span></summary>
            <table style={{ marginTop: 10 }}>
              <thead><tr><th>Sefer</th><th>Kalkış</th><th>Palet</th><th>Kg</th><th>m³</th><th>CO₂ tasarrufu</th><th>Kontrol</th></tr></thead>
              <tbody>{(carbon?.rows ?? []).map(({ k: t, c }) => (
                <tr key={t.tripId}>
                  <td><b>{t.reference}</b><div className="tiny muted">{t.route}</div></td>
                  <td className="small">{day(t.departureAt)}</td>
                  <td><Bar label="Palet" planned={t.planned.pallets} held={t.held.pallets} actual={t.actual.pallets} cap={t.sellable.pallets} unit="palet" /></td>
                  <td><Bar label="Kg" planned={t.planned.kg} held={t.held.kg} actual={t.actual.kg} cap={t.sellable.kg} unit="kg" /></td>
                  <td><Bar label="m³" planned={t.planned.m3} held={t.held.m3} actual={t.actual.m3} cap={t.sellable.m3} unit="m³" /></td>
                  <td className="small">{c ? `${num(Math.round(c.savedKg))} kg` : "—"}</td>
                  <td className="small">{t.internalReserveViolation || t.doubleBooking ? <span style={{ color: "#D6456B" }}>İhlal</span> : "Temiz"}</td>
                </tr>
              ))}</tbody>
            </table>
          </details>
        </>
      )}
    </div>
  );
}

const C_PLAN = "#2547E0", C_ACT = "#12A675";
const tl0 = (v: number) => tl(v).replace(",00", "");
const pct = (x: number | null) => (x === null ? "—" : `%${num(Math.round(x))}`);
const fmtM = (m?: Metric) => (m ? fmt(m) : "—");

function Tile({ label, value, sub, title }: { label: string; value: string; sub: string; title?: string }) {
  return <div className="rep-tile" title={title}><span className="eyebrow">{label}</span><b>{value}</b><span className="tiny">{sub}</span></div>;
}

function Funnel({ steps }: { steps: [string, number][] }) {
  const max = Math.max(1, ...steps.map(([, n]) => n));
  const shades = ["#2547E0", "#3B5BFF", "#6F88FF", "#9DB0FF"];
  return (
    <div className="funnel">
      {steps.map(([l, n], i) => {
        const prev = i > 0 ? steps[i - 1]![1] : null;
        return (
          <div key={l} className="funnel-row" title={`${l}: ${num(n)}${prev ? ` (önceki adımın %${Math.round((n / Math.max(prev, 1)) * 100)}'i)` : ""}`}>
            <span className="funnel-l">{l}</span>
            <span className="funnel-track"><i style={{ width: `${(n / max) * 100}%`, background: shades[i] }} /></span>
            <b>{num(n)}</b>
            <span className="tiny">{prev && n <= prev ? `%${Math.round((n / prev) * 100)}` : ""}</span>
          </div>
        );
      })}
    </div>
  );
}

function Quality({ label, m, good }: { label: string; m?: Metric; good: "high" | "low" }) {
  const val = m?.value ?? null;
  const target = good === "high" ? 95 : 5;
  const ok = val === null ? null : good === "high" ? val >= target : val <= target;
  return (
    <div className="q-row" title={m?.formula}>
      <span className="q-l">{ok === null ? null : ok ? <CheckCircle2 size={14} className="q-ok" /> : <AlertTriangle size={14} className="q-bad" />}{label}</span>
      <span className="q-track"><i style={{ width: `${Math.min(100, val ?? 0)}%` }} className={ok === false ? "bad" : ""} /><em style={{ left: `${target}%` }} /></span>
      <b>{val === null ? "—" : `%${num(Math.round(val * 10) / 10)}`}</b>
      <span className="tiny">{m ? `${num(m.numerator)}/${num(m.denominator)}` : ""}</span>
    </div>
  );
}

function CompareBars({ rows, unit }: { rows: [string, number, string][]; unit: string }) {
  const max = Math.max(1, ...rows.map(([, v]) => v));
  return (
    <div className="cmp">
      {rows.map(([l, v, c]) => (
        <div key={l} className="cmp-row"><span>{l}</span><span className="cmp-track"><i style={{ width: `${(v / max) * 100}%`, background: c }} /></span><b>{num(Math.round(v))} <small>{unit}</small></b></div>
      ))}
    </div>
  );
}

function FillChart({ trips }: { trips: KpiTrip[] }) {
  const [hov, setHov] = useState<number | null>(null);
  const list = [...trips].sort((a, b) => a.departureAt.localeCompare(b.departureAt)).slice(-14);
  const H = 180, pctOf = (v: number, c: number) => (c > 0 ? Math.min(100, (v / c) * 100) : 0);
  return (
    <div className="fillchart" onMouseLeave={() => setHov(null)}>
      <div className="fc-grid">{[100, 75, 50, 25, 0].map((g) => <div key={g} style={{ bottom: `${(g / 100) * H}px` }}><span>%{g}</span></div>)}</div>
      <div className="fc-bars" style={{ height: H }}>
        {list.map((t, i) => {
          const p = pctOf(t.planned.pallets, t.sellable.pallets), a = pctOf(t.actual.pallets, t.sellable.pallets);
          return (
            <div key={t.tripId} className={`fc-col ${hov === i ? "on" : ""}`} onMouseEnter={() => setHov(i)} onFocus={() => setHov(i)} tabIndex={0}
              aria-label={`${t.reference}: planlanan %${Math.round(p)}, fiili %${Math.round(a)}`}>
              <i style={{ height: `${p}%`, background: C_PLAN }} />
              <i style={{ height: `${a}%`, background: C_ACT }} />
              {hov === i && (
                <div className="fc-tip">
                  <b>{t.reference}</b><div className="tiny">{t.route} · {day(t.departureAt)}</div>
                  <div><i className="sw" style={{ background: C_PLAN }} />Planlanan {t.planned.pallets}/{t.sellable.pallets} palet · %{Math.round(p)}</div>
                  <div><i className="sw" style={{ background: C_ACT }} />Fiili {t.actual.pallets}/{t.sellable.pallets} palet · %{Math.round(a)}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="fc-x">{list.map((t) => <span key={t.tripId} title={t.route}>{day(t.departureAt).split(" ").slice(0, 2).join(" ")}<small>{t.reference.split("-").slice(-2).join("›")}</small></span>)}</div>
    </div>
  );
}
