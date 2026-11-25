import { useState } from "react";
import { Leaf, TrendingUp } from "lucide-react";
import { api } from "../api";
import type { Dashboard } from "../types";
import { num, time, tl } from "../format";
import { Skeleton, StatusBadge, useFetch } from "../ui";
import { FIRM_COLORS } from "../components/TruckMap";
import { co2Saved, roadKm } from "../lib/carbon";

const DEAD = ["RET", "IPTAL", "SURESI_DOLDU", "GELMEDI"];

/** Sefer kârlılığı: eski jüri panosunun verisi, kokpitte seçili sefer için. */
export function TripProfit({ tripId }: { tripId: string }) {
  const { data: d } = useFetch((s) => api<Dashboard>("GET", `/carrier/dashboard?tripId=${encodeURIComponent(tripId)}`, undefined, { signal: s }), [tripId], 8000);
  const [showAll, setShowAll] = useState(false);
  if (!d) return <section className="profit" aria-busy="true"><Skeleton h={150} /></section>;

  const cap = d.trip.capacity, total = cap.totalPositions;
  const gross = d.grossRevenueMinor, cost = d.variableCostMinor, contrib = d.contributionMinor;
  const margin = gross > 0 ? Math.round((contrib / gross) * 100) : 0;
  const costPct = gross > 0 ? Math.min(100, (cost / gross) * 100) : 0;
  const ext = d.customers.filter((c) => !DEAD.includes(c.status));
  const extPallets = ext.reduce((a, c) => a + c.pallets, 0);
  const km = roadKm(d.trip.origin, d.trip.destination);
  const co2 = km && extPallets ? co2Saved(km, extPallets, total) : null;
  const colorOf = new Map<string, string>();
  d.customers.forEach((c) => { if (!colorOf.has(c.name)) colorOf.set(c.name, FIRM_COLORS[colorOf.size % FIRM_COLORS.length]!); });
  const tl0 = (v: number) => tl(v).replace(",00", "");
  const events = [...d.timeline].reverse();

  return (
    <section className="profit" aria-label="Sefer kârlılığı">
      <div className="row between"><span className="eyebrow"><TrendingUp size={13} /> Sefer kârlılığı</span><span className="tiny">dış yük · onaylı rezervasyonlar</span></div>
      <div className="profit-top">
        <div className="profit-hero">
          <span className="tiny">Katkı payı</span>
          <b>{tl0(contrib)}</b>
          <span className="tiny">marj %{margin}</span>
        </div>
        <div className="profit-split">
          <div className="split-bar" role="img" aria-label={`Brüt gelir ${tl0(gross)}: değişken maliyet ${tl0(cost)}, katkı ${tl0(contrib)}`}>
            <i className="cost" style={{ width: `${costPct}%` }} title={`Değişken maliyet ${tl0(cost)}`} />
            <i className="contrib" style={{ width: `${100 - costPct}%` }} title={`Katkı ${tl0(contrib)}`} />
          </div>
          <div className="split-legend">
            <span><i className="sw cost" />Değişken maliyet <b>{tl0(cost)}</b></span>
            <span><i className="sw contrib" />Katkı <b>{tl0(contrib)}</b></span>
            <span className="muted">Brüt gelir <b>{tl0(gross)}</b></span>
          </div>
          <div className="tiny">Maliyet = satılan palet × {tl0(d.costPerPalletMinor)}</div>
        </div>
        <div className="profit-fill">
          {([["Planlanan", cap.plannedPallets], ["Fiili yüklenen", cap.actualPallets]] as [string, number][]).map(([l, v]) => (
            <div key={l} className="fill-row">
              <span className="tiny">{l}</span>
              <span className="meter-b"><i style={{ width: `${Math.min(100, (v / total) * 100)}%` }} className={l === "Planlanan" ? "" : "act"} /></span>
              <b>{v}/{total}</b>
            </div>
          ))}
          {co2 && co2.savedKg >= 1 && <div className="co2-line"><Leaf size={13} /> ≈ {num(Math.round(co2.savedKg))} kg CO₂ tasarrufu <small>tahmini</small></div>}
        </div>
      </div>
      <div className="profit-bottom">
        <div>
          <span className="mini-l">Müşteriler</span>
          {d.customers.length === 0 ? <p className="tiny">Henüz müşteri yok.</p> : (
            <div className="cust-list">
              {(showAll ? d.customers : d.customers.slice(0, 5)).map((c) => (
                <div key={c.name + c.status} className="cust-row">
                  <i className="sw" style={{ background: colorOf.get(c.name) }} />
                  <span className="cust-name"><b title={c.name}>{c.name}</b><span className="tiny">{num(c.pallets)} palet · {num(c.kg)} kg</span></span>
                  <b className="num">{tl0(c.totalMinor)}</b>
                  <StatusBadge status={c.status} label={c.statusLabel} />
                </div>
              ))}
              {d.customers.length > 5 && <button className="link small" onClick={() => setShowAll((x) => !x)}>{showAll ? "Daha az" : `+${d.customers.length - 5} müşteri daha`}</button>}
            </div>
          )}
        </div>
        <div>
          <span className="mini-l">Son olaylar</span>
          {events.length === 0 ? <p className="tiny">Henüz olay yok.</p> : (
            <div className="vtl compact">
              {events.slice(0, 5).map((e, i) => <div key={i}><b className="small">{e.label}</b> <span className="tiny">{time(e.at)}</span></div>)}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
