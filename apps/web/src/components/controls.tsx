import { useEffect, useRef, useState, type ReactNode } from "react";
import { Minus, Plus } from "lucide-react";

/** − değer + : elle yazmadan sayı seçimi. İsteğe bağlı olarak değere tıklayıp ince ayar yapılabilir. */
export function Stepper({ value, onChange, min = 0, max = 9999, step = 1, unit, label, testId }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; unit?: string; label?: string; testId?: string;
}) {
  const [edit, setEdit] = useState(false);
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  return (
    <div className="stepper" aria-label={label} data-testid={testId}>
      <button type="button" aria-label="Azalt" disabled={value <= min} onClick={() => onChange(clamp(value - step))}><Minus size={15} /></button>
      {edit ? (
        <input autoFocus type="number" defaultValue={value} min={min} max={max}
          onBlur={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) onChange(clamp(n)); setEdit(false); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEdit(false); }} />
      ) : (
        <span className="val" title="İnce ayar için tıklayın" onClick={() => setEdit(true)}>
          {new Intl.NumberFormat("tr-TR").format(value)}{unit && <small>{unit}</small>}
        </span>
      )}
      <button type="button" aria-label="Artır" disabled={value >= max} onClick={() => onChange(clamp(value + step))}><Plus size={15} /></button>
    </div>
  );
}

export type Opt<T extends string | number> = { value: T; label: ReactNode; sub?: ReactNode; disabled?: boolean; title?: string };

/** Hap (chip) şeklinde tekli seçim. */
export function ChipSelect<T extends string | number>({ options, value, onChange, size, ariaLabel }: {
  options: Opt<T>[]; value: T | null; onChange: (v: T) => void; size?: "sm"; ariaLabel?: string;
}) {
  return (
    <div className={`chips ${size ?? ""}`} role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={value === o.value} title={o.title}
          className={`pick ${value === o.value ? "on" : ""}`} disabled={o.disabled} onClick={() => onChange(o.value)}>
          {o.label}{o.sub != null && <span className="pick-sub">{o.sub}</span>}
        </button>
      ))}
    </div>
  );
}

/** Kaydırmalı segment kontrolü. */
export function Segmented<T extends string>({ options, value, onChange, ariaLabel }: {
  options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; ariaLabel?: string;
}) {
  return (
    <div className="seg-ctl" role="tablist" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} className={value === o.value ? "on" : ""} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

/** Büyük seçim kartı (ödeme planı, araç, tesis…). */
export function OptionCard({ on, onClick, children, disabled, testId }: { on: boolean; onClick: () => void; children: ReactNode; disabled?: boolean; testId?: string }) {
  return (
    <button type="button" className={`opt ${on ? "on" : ""}`} aria-pressed={on} onClick={onClick} disabled={disabled} data-testid={testId}>
      <span className="opt-dot" aria-hidden />
      <span className="opt-body">{children}</span>
    </button>
  );
}

/** Kalan süre: "2 sa 14 dk". */
export function Countdown({ to, prefix }: { to: string; prefix?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  const ms = Date.parse(to) - now;
  if (ms <= 0) return <span className="cd over">{prefix} süresi doldu</span>;
  const m = Math.floor(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  const txt = d > 0 ? `${d} g ${h} sa` : h > 0 ? `${h} sa ${mm} dk` : `${mm} dk`;
  return <span className={`cd ${ms < 3 * 3600e3 ? "soon" : ""}`}>{prefix} {txt}</span>;
}

/** Fiyat gibi sayılarda kısa yuvarlanma animasyonu. */
export function RollNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || from.current === value) { setShown(value); from.current = value; return; }
    const start = performance.now(), a = from.current, dur = 320;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / dur), e = 1 - (1 - k) ** 3;
      setShown(Math.round(a + (value - a) * e));
      if (k < 1) raf = requestAnimationFrame(tick); else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format(shown)}</>;
}
