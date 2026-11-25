import { ChevronLeft, ChevronRight, Leaf, Printer, Share2, BellRing } from "lucide-react";
import type { Facility, TripCard } from "../types";
import { addDays, dayNum, full, isoDay, place, time, tl, today, weekday } from "../format";
import { co2Saved, roadKm } from "../lib/carbon";
import { QrVisual, useToast } from "../ui";

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
    return { d, any: onDay.length > 0, min, n: fit.length };
  });
  const prices = cells.map((c) => c.min).filter((x): x is number => x != null);
  const best = prices.length ? Math.min(...prices) : null;
  const canBack = start > today();
  return (
    <div className="fares" role="listbox" aria-label="Esnek tarih fiyat takvimi">
      <button type="button" className="fare-nav" aria-label="Önceki günler" disabled={!canBack} onClick={() => onStart(addDays(start, -7) < today() ? today() : addDays(start, -7))}><ChevronLeft size={16} /></button>
      {cells.map((c) => (
        <button key={c.d} type="button" role="option" aria-selected={value === c.d}
          className={`fare ${value === c.d ? "on" : ""} ${c.min == null ? (c.any ? "full" : "none") : ""}`}
          onClick={() => (c.min == null && c.any && onAlarm ? onAlarm(c.d) : onSelect(c.d))}>
          <span className="fare-wd">{weekday(c.d)}</span>
          <span className="fare-d">{dayNum(c.d)}</span>
          <span className="fare-p">
            {c.min != null ? tl(c.min).replace(",00", "") : c.any ? <><BellRing size={11} /> Dolu</> : "—"}
          </span>
          {c.min != null && c.min === best && <span className="fare-best">En uygun</span>}
        </button>
      ))}
      <button type="button" className="fare-nav" aria-label="Sonraki günler" onClick={() => onStart(addDays(start, 7))}><ChevronRight size={16} /></button>
    </div>
  );
}

/* ---------------- Karbon rozeti ---------------- */
export function CarbonBadge({ from, to, pallets, positions, variant }: { from: Facility; to: Facility; pallets: number; positions: number; variant?: "dark" }) {
  const km = roadKm(from, to);
  if (km == null || pallets <= 0) return null;
  const { savedKg } = co2Saved(km, pallets, positions);
  if (savedKg < 1) return null;
  const fmt = savedKg >= 1000 ? `${(savedKg / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} t` : `${Math.round(savedKg).toLocaleString("tr-TR")} kg`;
  return (
    <div className={`carbon ${variant ?? ""}`} title={`Tahmini: ~${Math.round(km)} km yol, paylaşımlı tır payı ile ayrı araç karşılaştırması (GLEC yaklaşımı, varsayılan katsayılar).`}>
      <Leaf size={14} />
      <span>≈ <b>{fmt}</b> CO₂ tasarrufu <small>tahmini</small></span>
    </div>
  );
}

/* ---------------- Alıcı cüzdan kartı ---------------- */
export function WalletCard({ orderNumber, trip, recipients, pallets, code }: {
  orderNumber: string; trip: TripCard; recipients: string[]; pallets: number; code?: string | null;
}) {
  const toast = useToast();
  const d = trip.destination;
  const win = d.pickupWindow ? `${d.pickupWindow.from} – ${d.pickupWindow.to}` : "Depo çalışma saatleri";
  const text = `CargoPact teslim kartı\nSipariş: ${orderNumber}\n${place(trip.origin)} → ${place(d)} · ${pallets} palet\n` +
    `Teslim noktası: ${d.name}, ${d.address}\nAlım penceresi: ${win} (varıştan itibaren)\nTahmini varış: ${full(trip.arrivalEta)}\n` +
    `Yetkili alıcı: ${recipients.length ? recipients.join(", ") : "Rezervasyon sahibi firma"}\nDepoda bu kartın QR kodunu gösterin.`;
  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: `Teslim kartı ${orderNumber}`, text });
      else { await navigator.clipboard.writeText(text); toast("Kart bilgileri panoya kopyalandı.", "ok"); }
    } catch { /* kullanıcı vazgeçti */ }
  }
  return (
    <div className="wallet" data-testid="wallet-card">
      <div className="wallet-top">
        <div>
          <div className="eyebrow light">Teslim kartı · yetkili alıcı</div>
          <div className="wallet-route">{place(trip.origin)} → {place(d)}</div>
          <div className="mono wallet-no">{orderNumber}</div>
        </div>
        <div className="wallet-qr"><QrVisual code={orderNumber} size={92} /></div>
      </div>
      <div className="wallet-perf" aria-hidden />
      {code && (
        <div className="wallet-code"><span className="eyebrow light">Teslim kodu</span><b className="mono" data-testid="pickup-code">{code}</b><small>Yalnız yetkili alıcıyla paylaşın</small></div>
      )}
      <dl className="wallet-grid">
        <div><dt>Alıcı</dt><dd>{recipients.length ? recipients.join(", ") : "Firma yetkilisi"}</dd></div>
        <div><dt>Palet</dt><dd>{pallets}</dd></div>
        <div><dt>Tahmini varış</dt><dd>{full(trip.arrivalEta)}</dd></div>
        <div><dt>Alım penceresi</dt><dd>{win}</dd></div>
        <div className="wide"><dt>Teslim noktası</dt><dd>{d.name}<small>{d.address}</small></dd></div>
      </dl>
      <div className="wallet-actions">
        <button type="button" className="btn ghost-light sm" onClick={share}><Share2 size={14} />Paylaş</button>
        <button type="button" className="btn ghost-light sm" onClick={() => window.print()}><Printer size={14} />Yazdır / PDF</button>
        <span className="tiny light">Kalkış {time(trip.departureAt)}</span>
      </div>
    </div>
  );
}
