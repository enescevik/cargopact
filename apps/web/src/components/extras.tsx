import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Info, Leaf, Printer, Share2, BellRing } from "lucide-react";
import type { Carbon, TripCard } from "../types";
import { addDays, dayNum, full, isoDay, place, time, tl, today, weekday } from "../format";
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

/* ---------------- Karbon (yalnız sunucu değerleri) ---------------- */
export const kgFmt = (kg: number) => {
  if (kg >= 1000) return `${(kg / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} t`;
  return `${kg.toLocaleString("tr-TR", { maximumFractionDigits: kg < 10 ? 1 : 0 })} kg`;
};
const SCENARIO: Record<string, string> = { dedicated: "ayrı araçla gönderim", groupage: "parsiyel / ambar ile gönderim" };
export function CarbonInfo({ carbon, dark }: { carbon: Carbon; dark?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <span className="pop carbon-info" ref={ref}>
      <button type="button" className="link" aria-label="Karbon hesabı hakkında" aria-expanded={open} onClick={() => setOpen((o) => !o)}><Info size={13} /></button>
      {open && (
        <div className="popbox" style={dark ? { color: "var(--i9)" } : undefined}>
          <b>Karbon hesabı</b> <span className="demo-tag">demo katsayıları · tahmini</span>
          <ul>
            <li>Yöntem: {carbon.method}</li>
            <li>Mesafe: ≈ {Math.round(carbon.distanceKm).toLocaleString("tr-TR")} km · araç sınıfı: {carbon.vehicleClass}</li>
            <li>Araç katsayısı: {carbon.vehicleFactorKgPerKm.toLocaleString("tr-TR")} kg CO₂e/km</li>
            {carbon.alternativeScenario && carbon.alternativeKg != null && <li>Alternatif ({SCENARIO[carbon.alternativeScenario]}): ≈ {kgFmt(carbon.alternativeKg)} CO₂e</li>}
          </ul>
          <div className="tiny muted">{carbon.note}</div>
        </div>
      )}
    </span>
  );
}
export function CarbonBadge({ carbon, variant }: { carbon?: Carbon | null; variant?: "dark" }) {
  if (!carbon) return null;
  return (
    <div className={`carbon-card ${variant ?? ""}`} data-testid="carbon">
      <Leaf size={16} className="cc-leaf" />
      <div className="cc-body">
        <div>Bu yükün payına düşen emisyon ≈ <b data-testid="carbon-allocated">{kgFmt(carbon.allocatedKg)} CO₂e</b> <CarbonInfo carbon={carbon} dark={variant === "dark"} /></div>
        {carbon.savedKg != null && <div className="cc-saved" data-testid="carbon-saved">Seçtiğiniz alternatife göre ≈ <b>{kgFmt(carbon.savedKg)}</b> daha az</div>}
        <small>demo katsayıları · tahmini</small>
      </div>
    </div>
  );
}
/** Sunucu değerleriyle sunum dostu büyük karbon kartı (jüri panosu, KPI sayfası). */
export function CarbonHero({ allocatedKg, declaredSavedKg, perPalletKg, withScenario, total, method, title = "Karbon ayak izi" }: {
  allocatedKg: number; declaredSavedKg: number; perPalletKg?: number; withScenario: number; total: number; method: string; title?: string;
}) {
  return (
    <div className="carbon-hero" data-testid="carbon-hero">
      <div className="ch-top"><span className="ch-ic"><Leaf size={20} /></span><div><div className="eyebrow light">{title}</div><span className="demo-tag">demo katsayıları · tahmini</span></div></div>
      <div className="ch-grid">
        <div><div className="ch-big" data-testid="carbon-hero-allocated">{kgFmt(allocatedKg)}</div><div className="ch-l">dış yükün payına düşen CO₂e</div></div>
        <div><div className="ch-big mint" data-testid="carbon-hero-saved">{kgFmt(declaredSavedKg)}</div><div className="ch-l">müşteri beyanına göre tasarruf</div></div>
        {perPalletKg != null && <div><div className="ch-mid">{kgFmt(perPalletKg)}</div><div className="ch-l">palet başına</div></div>}
        <div><div className="ch-mid">{withScenario} / {total}</div><div className="ch-l">senaryo beyan eden rezervasyon</div></div>
      </div>
      <div className="ch-foot">{method}</div>
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
          <div className="mono wallet-no" data-testid="order-number">{orderNumber}</div>
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
