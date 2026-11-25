import { Clock, MapPin, Navigation, Phone } from "lucide-react";
import type { Facility } from "./types";
import { full } from "./format";

const DAYS: [keyof NonNullable<Facility["openingHours"]>, string][] = [
  ["mon", "Pzt"], ["tue", "Sal"], ["wed", "Çar"], ["thu", "Per"], ["fri", "Cum"], ["sat", "Cmt"], ["sun", "Paz"],
];

export function WarehouseGuide({ title, facility, intakeCutoffAt }: { title: string; facility: Facility; intakeCutoffAt?: string }) {
  const destination = facility.latitude != null && facility.longitude != null
    ? `${facility.latitude},${facility.longitude}`
    : facility.address;
  const mapUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
  const hours = DAYS.flatMap(([key, label]) => (facility.openingHours?.[key] ?? []).map(([from, to]) => `${label} ${from}–${to}`));
  return (
    <div className="card">
      <div className="row between wrap" style={{ marginBottom: 12 }}>
        <div><div className="kicker">DEPO REHBERİ</div><h3 className="serif" style={{ fontSize: 22 }}>{title}</h3></div>
        <a className="btn primary sm" href={mapUrl} target="_blank" rel="noreferrer"><Navigation size={14} />Yol tarifi</a>
      </div>
      <div className="col" style={{ gap: 9 }}>
        <div className="row small"><MapPin size={16} style={{ flexShrink: 0, color: "var(--c6)" }} /><span><b>{facility.name}</b><br /><span className="muted">{facility.address} · {facility.district ? `${facility.district}, ` : ""}{facility.city}</span></span></div>
        {intakeCutoffAt && <div className="row small"><Clock size={16} style={{ flexShrink: 0, color: "var(--warn)" }} /><span>Son depo kabulü: <b>{full(intakeCutoffAt)}</b></span></div>}
        {hours.length > 0 && <div className="small muted">Çalışma saatleri: {hours.join(" · ")}</div>}
        {facility.contactPhone && <a className="link small" href={`tel:${facility.contactPhone}`}><Phone size={14} style={{ verticalAlign: -2 }} /> {facility.contactPhone}</a>}
      </div>
    </div>
  );
}
