import { Check, Clock } from "lucide-react";

export type CellState = "int" | "conf" | "held" | "standby" | "empty" | "mine" | "full";
export type Cell = { state: CellState; label?: string; title?: string; color?: string };

const LABEL: Record<CellState, string> = {
  int: "İç yük", conf: "Onaylı", held: "Bloke", standby: "Yedek", empty: "Boş", mine: "Sizin", full: "Dolu",
};

/**
 * Dorsenin üstten görünümü. Pozisyonlar önden (kabin) arkaya (kapı) doldurulur:
 * 1. sütun kabine en yakın sütundur; yükleme sırası önden arkaya.
 */
export function TruckMap({ cells, positions, operator = false, compact = false, caption }: {
  cells: Cell[]; positions: number; operator?: boolean; compact?: boolean; caption?: string;
}) {
  const lanes = positions >= 24 ? 3 : 2;
  const cols = Math.ceil(positions / lanes);
  const all: Cell[] = Array.from({ length: positions }, (_, i) => cells[i] ?? { state: "empty" });
  const counts = all.reduce<Record<string, number>>((m, c) => ((m[c.state] = (m[c.state] ?? 0) + 1), m), {});
  const empty = counts.empty ?? 0;
  const order: CellState[] = operator ? ["int", "conf", "held", "standby", "mine", "empty"] : ["full", "mine", "empty"];

  return (
    <figure className={`truck ${compact ? "compact" : ""}`}>
      <div className="truck-body" role="img" aria-label={`${positions} pozisyonun ${empty} tanesi boş${caption ? `. ${caption}` : ""}`}>
        <div className="truck-cab" aria-hidden><span>ÖN</span></div>
        <div className="truck-bed" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, ${compact ? 40 : 58}px))`, gridTemplateRows: `repeat(${lanes}, auto)` }}>
          {all.map((c, i) => {
            const col = Math.floor(i / lanes), lane = i % lanes;
            return (
              <div key={i} className={`cell s-${c.state}`} title={c.title ?? `${i + 1}. pozisyon · ${LABEL[c.state]}`}
                style={{ gridColumn: col + 1, gridRow: lane + 1, animationDelay: `${col * 22}ms`, ...(c.color && c.state === "conf" ? { background: c.color } : {}) }}>
                {operator && <i className="cell-n">{i + 1}</i>}
                {c.state === "mine" ? <Check size={compact ? 11 : 14} strokeWidth={3} />
                  : c.state === "standby" ? <Clock size={compact ? 10 : 12} />
                  : c.label ? <b>{c.label}</b> : null}
              </div>
            );
          })}
        </div>
        <div className="truck-door" aria-hidden><span>ARKA · kapı</span></div>
      </div>
      {!compact && (
        <figcaption className="truck-legend">
          {order.filter((s) => counts[s] || s === "empty").map((s) => (
            <span key={s}><i className={`cell s-${s}`} />{LABEL[s]} <b>{counts[s] ?? 0}</b></span>
          ))}
          <span className="truck-dir">Yükleme sırası: önden arkaya →</span>
        </figcaption>
      )}
    </figure>
  );
}

/** Müşteri görünümü: başka firmaların yükleri tek "Dolu" durumunda toplanır, yalnızca sayılar kullanılır. */
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
const LOADED = ["YUKLENDI", "VARISTA", "TESLIM"];
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toLocaleUpperCase("tr-TR")).join("");

export function operatorCells(internal: number, rs: { id: string; name: string; pallets: number; status: string }[], opts: { mode?: "planned" | "actual"; ghostId?: string | null } = {}): Cell[] {
  const color = new Map<string, string>();
  rs.forEach((r) => { if (!color.has(r.name)) color.set(r.name, FIRM_COLORS[color.size % FIRM_COLORS.length]!); });
  const cells: Cell[] = Array.from({ length: internal }, () => ({ state: "int" as const, title: "İç transfer yükü" }));
  for (const r of rs.filter((x) => CONFIRMED.includes(x.status))) {
    if (opts.mode === "actual" && !LOADED.includes(r.status)) continue;
    for (let i = 0; i < r.pallets; i++) cells.push({ state: "conf", label: initials(r.name), color: color.get(r.name), title: `${r.name} · onaylı` });
  }
  if (opts.mode !== "actual") {
    for (const r of rs.filter((x) => x.status === "TASIYICI_ONAYI_BEKLIYOR")) {
      for (let i = 0; i < r.pallets; i++) cells.push(r.id === opts.ghostId ? { state: "mine", title: `${r.name} · önizleme` } : { state: "held", label: initials(r.name), title: `${r.name} · bloke (onay bekliyor)` });
    }
  }
  return cells;
}

