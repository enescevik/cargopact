import { useState } from "react";
import { api } from "./api";
import type { Dashboard } from "./types";
import { full, initials, place, num, time, tl } from "./format";
import { TracesPanel } from "./Traces";
import { FIRM_COLORS, TruckMap, operatorCells } from "./components/TruckMap";
import { Empty, ErrorBox, SkeletonCards, StatusBadge, useFetch } from "./ui";

const COLORS = ["#2547E0", "#12A675", "#C98A06", "#7A5AF8", "#D6456B", "#0E8FB5", "#E2772B"];
const LOADED = ["YUKLENDI", "VARISTA", "TESLIM"];
const DEAD = ["RET", "IPTAL", "SURESI_DOLDU", "GELMEDI"];

export function DashboardView() {
  const [mode, setMode] = useState<"planned" | "actual">("planned");
  const { data: d, error, loading, reload } = useFetch((s) => api<Dashboard>("GET", "/carrier/dashboard", undefined, { signal: s }), [], 4000);

  if (loading) return <div className="page"><SkeletonCards n={2} h={200} /></div>;
  if (error && !d) return <div className="page"><ErrorBox error={error} onRetry={reload} /></div>;
  if (!d) return <div className="page"><Empty title="Pano verisi yok" /></div>;

  const cap = d.trip.capacity;
  const total = cap.totalPositions;
  const custs = d.customers.filter((c) => !DEAD.includes(c.status));
  const colorOf = new Map<string, string>();
  d.customers.forEach((c) => { if (!colorOf.has(c.name)) colorOf.set(c.name, FIRM_COLORS[colorOf.size % FIRM_COLORS.length]!); });

  type Cell = { kind: "int" | "cust" | "empty"; name?: string; held?: boolean };
  const cells: Cell[] = [];
  for (let i = 0; i < cap.internalPallets; i++) cells.push({ kind: "int" });
  for (const c of custs) {
    if (mode === "actual" && !LOADED.includes(c.status)) continue;
    for (let i = 0; i < c.pallets; i++) cells.push({ kind: "cust", name: c.name, held: c.status === "TASIYICI_ONAYI_BEKLIYOR" });
  }
  while (cells.length < total) cells.push({ kind: "empty" });

  const plannedPct = Math.round((cap.plannedPallets / total) * 100);
  const actualPct = Math.round((cap.actualPallets / total) * 100);

  return (
    <div className="page" style={{ maxWidth: 1400 }}>
      <div className="page-head row between wrap">
        <div>
          <div className="row"><span className="kicker">Jüri panosu</span><span className="row tiny"><span className="live" /> her 4 sn yenilenir</span></div>
          <h1 className="title" style={{ fontSize: 52 }}>{place(d.trip.origin)} → {place(d.trip.destination)}</h1>
          <div className="muted">{d.trip.origin.city} → {d.trip.destination.city} · {d.trip.reference} · kalkış {full(d.trip.departureAt)} · {d.trip.vehicle.plate}</div>
        </div>
        <div className="tabs">
          <button className={mode === "planned" ? "on" : ""} onClick={() => setMode("planned")}>Planlanan</button>
          <button className={mode === "actual" ? "on" : ""} onClick={() => setMode("actual")}>Fiili</button>
        </div>
      </div>
      {error && <div style={{ marginBottom: 12 }}><ErrorBox error={error} /></div>}

      <div className="kpis">
        <div className="kpi"><div className="muted small">Planlanan doluluk</div><div className="v">{cap.plannedPallets} / {total}</div><div className="small muted">{`%${plannedPct}`}{cap.heldPallets ? ` · +${cap.heldPallets} bloke` : ""}</div></div>
        <div className="kpi"><div className="muted small">Fiili doluluk</div><div className="v">{cap.actualPallets} / {total}</div><div className="small muted">{`%${actualPct}`} · araca yüklenen</div></div>
        <div className="kpi"><div className="muted small">Brüt gelir</div><div className="v">{tl(d.grossRevenueMinor)}</div><div className="small muted">onaylı rezervasyonlar</div></div>
        <div className="kpi"><div className="muted small">Değişken maliyet</div><div className="v">{tl(d.variableCostMinor)}</div><div className="small muted">{tl(d.costPerPalletMinor)} / satılan palet</div></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.7fr) minmax(0, 1fr)", gap: 16, marginTop: 16 }}>
        <div className="card">
          <div className="row between" style={{ marginBottom: 16 }}>
            <h3 className="serif" style={{ fontSize: 24 }}>Araç yerleşimi · {mode === "planned" ? "planlanan" : "fiili"}</h3>
            <span className="muted small">{cells.filter((c) => c.kind !== "empty").length} / {total} pozisyon dolu</span>
          </div>
          <TruckMap operator positions={total} caption={mode === "planned" ? "planlanan" : "fiili"}
            cells={operatorCells(cap.internalPallets, d.customers.map((c, i) => ({ id: String(i), name: c.name, pallets: c.pallets, status: c.status })), { mode })} />
        </div>

        <div className="col">
          <div className="kpi hl">
            <div className="muted small">Katkı</div>
            <div className="v" style={{ fontSize: 44 }}>{tl(d.contributionMinor)}</div>
            <div className="small muted">Katkı = brüt gelir − (satılan palet × {tl(d.costPerPalletMinor)} değişken maliyet)</div>
            <div className="mono small" style={{ marginTop: 6, color: "var(--m2)" }}>{tl(d.grossRevenueMinor)} − {tl(d.variableCostMinor)}</div>
          </div>
          <div className="card">
            <h3 className="serif" style={{ fontSize: 22, marginBottom: 6 }}>Zaman çizelgesi</h3>
            {d.timeline.length === 0 ? <Empty title="Henüz olay yok" /> : (
              <div className="vtl" style={{ marginTop: 10, maxHeight: 260, overflowY: "auto" }}>
                {[...d.timeline].reverse().map((e, i) => <div key={i}><b className="small">{e.label}</b> <span className="tiny">{time(e.at)}</span></div>)}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 className="serif" style={{ fontSize: 24, marginBottom: 6 }}>Müşteriler</h3>
        {d.customers.length === 0 ? <Empty title="Henüz müşteri yok" text="Demo akışı: bir müşteri teklif gönderir, planlamacı onaylar." /> : (
          <table>
            <thead><tr><th>Müşteri</th><th>Palet</th><th>Ağırlık</th><th>Tutar</th><th>Durum</th></tr></thead>
            <tbody>{d.customers.map((c) => (
              <tr key={c.name}>
                <td><span className="row"><span style={{ width: 12, height: 12, borderRadius: 4, background: colorOf.get(c.name) }} /><b>{c.name}</b></span></td>
                <td>{num(c.pallets)}</td><td>{num(c.kg)} kg</td><td><b>{tl(c.totalMinor)}</b></td>
                <td><StatusBadge status={c.status} label={c.statusLabel} /></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
      <TracesPanel />
    </div>
  );
}
