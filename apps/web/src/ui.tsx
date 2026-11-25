import { cloneElement, createContext, isValidElement, useId, type ReactElement, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import QRCode from "qrcode";
import { AlertCircle, Inbox, X } from "lucide-react";
import { ApiError } from "./api";
import type { Capacity, Dim, Price } from "./types";
import { tl } from "./format";

/* ---------- toasts ---------- */
type ToastKind = "ok" | "err" | "info";
const ToastCtx = createContext<(msg: string, kind?: ToastKind) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string; kind: ToastKind }[]>([]);
  const push = useCallback((msg: string, kind: ToastKind = "info") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, msg, kind }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">{items.map((i) => <div key={i.id} className={`toast ${i.kind}`}>{i.msg}</div>)}</div>
    </ToastCtx.Provider>
  );
}

/* ---------- async data ---------- */
export function useFetch<T>(fn: (signal: AbortSignal) => Promise<T>, deps: unknown[], pollMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const first = useRef(true);
  const depKey = JSON.stringify(deps);
  const prevKey = useRef(depKey);
  if (prevKey.current !== depKey) { prevKey.current = depKey; first.current = true; }
  useEffect(() => {
    const ac = new AbortController();
    if (first.current) setLoading(true);
    fn(ac.signal)
      .then((d) => { setData(d); setError(null); })
      .catch((e) => { if (e?.name !== "AbortError") setError(e instanceof ApiError ? e : new ApiError(String(e?.message ?? e), 0)); })
      .finally(() => { if (!ac.signal.aborted) { setLoading(false); first.current = false; } });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  useEffect(() => {
    if (!pollMs) return;
    const t = setInterval(() => setTick((x) => x + 1), pollMs);
    return () => clearInterval(t);
  }, [pollMs]);
  return { data, error, loading, reload: () => setTick((x) => x + 1), setData };
}

export function errText(e: unknown): string {
  return e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e);
}

/* ---------- basic ---------- */
export function Skeleton({ h = 20, w = "100%", r }: { h?: number; w?: number | string; r?: number }) {
  return <div className="sk" style={{ height: h, width: w, borderRadius: r }} />;
}
export function SkeletonCards({ n = 3, h = 130 }: { n?: number; h?: number }) {
  return <div className="col">{Array.from({ length: n }, (_, i) => <div key={i} className="card"><Skeleton h={h} /></div>)}</div>;
}
export function ErrorBox({ error, onRetry }: { error: ApiError | Error | string; onRetry?: () => void }) {
  const e = typeof error === "string" ? null : error;
  const msg = typeof error === "string" ? error : error.message;
  const cid = e instanceof ApiError ? e.correlationId : undefined;
  return (
    <div className="alert err" role="alert">
      <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
      <div className="grow">
        <div>{msg}</div>
        {cid && <div className="tiny" style={{ color: "#8f241c" }}>Referans: {cid}</div>}
      </div>
      {onRetry && <button className="link" onClick={onRetry}>Tekrar dene</button>}
    </div>
  );
}
export function Empty({ title, text, icon }: { title: string; text?: string; icon?: ReactNode }) {
  return (
    <div className="empty">
      <div className="ic">{icon ?? <Inbox size={26} />}</div>
      <div className="serif" style={{ fontSize: 20, color: "var(--i9)" }}>{title}</div>
      {text && <p style={{ marginTop: 6 }}>{text}</p>}
    </div>
  );
}
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="row between" style={{ marginBottom: 14 }}>
          <h3 className="serif" style={{ fontSize: 24 }}>{title}</h3>
          <button className="link" onClick={onClose} aria-label="Kapat"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const child = isValidElement(children) && !(children.props as { id?: string }).id ? cloneElement(children as ReactElement<{ id?: string }>, { id }) : children;
  return <div className="field"><label htmlFor={id}>{label}</label>{child}</div>;
}

const STATUS_TONE: Record<string, string> = {
  TASIYICI_ONAYI_BEKLIYOR: "pending", ONAYLI: "ok", DEPO_KABUL: "info", YUKLENDI: "info", VARISTA: "ok", TESLIM: "ok",
  SURESI_DOLDU: "warn", RET: "bad", IPTAL: "bad", EKSIK_HASAR: "warn", GELMEDI: "bad",
  published: "ok", draft: "", closed: "warn", departed: "info", completed: "ok", cancelled: "bad",
};
export const TRIP_LABEL: Record<string, string> = {
  published: "Yayında", draft: "Taslak", closed: "Kapalı", departed: "Yola çıktı", completed: "Tamamlandı", cancelled: "İptal",
};
export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <span className={`badge ${STATUS_TONE[status] ?? ""}`}>{label ?? TRIP_LABEL[status] ?? status}</span>;
}

/* ---------- capacity ---------- */
export function MiniBars({ remaining, sellable }: { remaining: Dim; sellable: Dim }) {
  const rows: [string, number, number, string][] = [
    ["Palet", remaining.pallets, sellable.pallets, ""], ["Ağırlık", remaining.kg, sellable.kg, " kg"], ["Hacim", remaining.m3, sellable.m3, " m³"],
  ];
  return (
    <div className="mini">
      {rows.map(([l, r, t, u]) => (
        <div key={l}>
          <div className="l"><span>{l}</span><span><b>{Math.round(r * 10) / 10}</b> / {Math.round(t * 10) / 10}{u} boş</span></div>
          <div className="bar xs"><div className="seg seg-fill" style={{ width: `${t ? Math.max(0, Math.min(100, (r / t) * 100)) : 0}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

function CapBar({ label, total, internal, confirmed, held, unit, extra }: {
  label: string; total: number; internal: number; confirmed: number; held: number; unit: string; extra?: string;
}) {
  const p = (v: number) => `${total ? Math.max(0, (v / total) * 100) : 0}%`;
  const r = (v: number) => Math.round(v * 10) / 10;
  return (
    <div>
      <div className="row between small" style={{ marginBottom: 6 }}>
        <b>{label}</b>
        <span className="muted">
          {r(internal + confirmed)} / {r(total)}{unit} planlanan{held > 0 ? ` · ${r(held)}${unit} bloke` : ""}{extra ? ` · ${extra}` : ""}
        </span>
      </div>
      <div className="bar lg">
        <div className="seg seg-int" style={{ width: p(internal) }} title="İç yük" />
        <div className="seg seg-conf" style={{ width: p(confirmed) }} title="Onaylı" />
        <div className="seg seg-held" style={{ width: p(held) }} title="Bloke" />
      </div>
    </div>
  );
}
/** Üç ayrı çubuk: palet, kg, m³ */
export function CapacityBars({ cap, m3Total, internalM3 = 0 }: { cap: Capacity; m3Total?: number; internalM3?: number }) {
  const m3Cap = m3Total ?? cap.sellable.m3;
  return (
    <div className="col" style={{ gap: 18 }}>
      <CapBar label="Palet" total={cap.totalPositions} internal={cap.internalPallets} confirmed={cap.confirmed.pallets} held={cap.held.pallets} unit=""
        extra={`fiili ${cap.actualPallets}/${cap.totalPositions}`} />
      <CapBar label="Ağırlık (brüt kg)" total={cap.maxGrossKg} internal={cap.internalKg} confirmed={cap.confirmed.kg} held={cap.held.kg} unit=" kg" />
      <CapBar label="Hacim (satışa açık m³)" total={m3Cap} internal={internalM3} confirmed={cap.confirmed.m3} held={cap.held.m3} unit=" m³" />
      <div className="legend">
        <span><i className="seg-int" />İç yük</span><span><i style={{ background: "var(--c6)" }} />Onaylı</span>
        <span><i className="seg-held" />Bloke</span><span><i style={{ background: "#eceff5" }} />Kalan</span>
      </div>
    </div>
  );
}
export function TripBarCompact({ cap }: { cap: Capacity }) {
  const p = (v: number) => `${(v / cap.totalPositions) * 100}%`;
  return (
    <div>
      <div className="bar"><div className="seg seg-int" style={{ width: p(cap.internalPallets) }} /><div className="seg seg-conf" style={{ width: p(cap.confirmed.pallets) }} /><div className="seg seg-held" style={{ width: p(cap.held.pallets) }} /></div>
      <div className="tiny" style={{ marginTop: 4 }}>{cap.plannedPallets} / {cap.totalPositions} planlanan{cap.heldPallets ? ` · ${cap.heldPallets} bloke` : ""} · fiili {cap.actualPallets}/{cap.totalPositions}</div>
    </div>
  );
}

/* ---------- price popover ---------- */
export function PricePop({ price }: { price: Price }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const b = price.breakdown;
  return (
    <div className="pop" ref={ref}>
      <button className="link small" onClick={() => setOpen((o) => !o)}>Fiyat neden böyle?</button>
      {open && (
        <div className="popbox">
          <b>Fiyat dökümü</b>
          <div className="small muted" style={{ marginTop: 4 }}>
            Taban {tl(b.basePriceMinor)} × talep {b.demandMultiplier.toFixed(2)} × zaman {b.timeMultiplier.toFixed(2)}
            {b.clampedTo ? ` · ${b.clampedTo === "floor" ? "alt" : "üst"} sınıra çekildi` : ""}
          </div>
          <ul>{b.explanation.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

/* ---------- QR-like ---------- */
export function QrVisual({ code, size = 120 }: { code: string; size?: number }) {
  const [url, setUrl] = useState<string>("");
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(code, { margin: 1, width: size * 2, errorCorrectionLevel: "M" }).then((u) => live && setUrl(u)).catch(() => {});
    return () => { live = false; };
  }, [code, size]);
  return url
    ? <img src={url} width={size} height={size} alt={`QR ${code}`} data-testid="qr" style={{ borderRadius: 8, border: "1px solid var(--line)", background: "#fff" }} />
    : <div style={{ width: size, height: size }} aria-label={`QR ${code}`} />;
}
