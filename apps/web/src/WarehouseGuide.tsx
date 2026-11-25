import { MapPin, Navigation, Phone, Clock } from "lucide-react";
import type { Facility } from "./types";
import { full } from "./format";

type Hours = NonNullable<Facility["openingHours"]>;
const DAYS: [keyof Hours, string][] = [["mon", "Pzt"], ["tue", "Sal"], ["wed", "Çar"], ["thu", "Per"], ["fri", "Cum"], ["sat", "Cmt"], ["sun", "Paz"]];

export function hoursText(h?: Facility["openingHours"]) {
  if (!h) return null;
  const parts = DAYS.map(([k, l]) => { const r = h[k]; return r && r.length ? `${l} ${r.map(([a, b]) => `${a}–${b}`).join(", ")}` : null; }).filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

export function mapsUrl(f: Facility) {
  const q = f.latitude != null && f.longitude != null ? `${f.latitude},${f.longitude}` : `${f.name} ${f.address} ${f.city}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/** Depo yol tarifi kartı: adres, çalışma saatleri, son kabul ve tek tıkla harita / arama. */
export function WarehouseGuide({ title, facility, intakeCutoffAt }: { title: string; facility: Facility; intakeCutoffAt?: string }) {
  const hours = hoursText(facility.openingHours);
  return (
    <div className="sub-panel guide" data-testid="warehouse-guide">
      <span className="eyebrow">{title}</span>
      <div className="guide-name"><MapPin size={15} />{facility.name}</div>
      <div className="tiny">{facility.address}{facility.district ? `, ${facility.district}` : ""} / {facility.city}</div>
      {hours && <div className="tiny"><Clock size={12} /> {hours}</div>}
      {intakeCutoffAt && <div className="chip on" style={{ marginTop: 6 }}>Son kabul {full(intakeCutoffAt)}</div>}
      <div className="row" style={{ gap: 8, marginTop: 10 }}>
        <a className="btn sm" href={mapsUrl(facility)} target="_blank" rel="noreferrer"><Navigation size={14} />Yol tarifi</a>
        {facility.contactPhone && <a className="btn ghost sm" href={`tel:${facility.contactPhone}`}><Phone size={14} />{facility.contactPhone}</a>}
      </div>
    </div>
  );
}
