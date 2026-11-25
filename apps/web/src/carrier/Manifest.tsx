import { api } from "../api";
import { dt, full, num } from "../format";
import { ErrorBox, SkeletonCards, useFetch } from "../ui";

type Manifest = {
  trip: { reference: string; plate: string; departureAt: string; arrivalEta: string; origin: { name: string; city: string }; destination: { name: string; city: string } };
  items: { reservationId: string; reference: string; orderNumber: string | null; customerName: string; status: string; pallets: number; grossKg: number; volumeM3: number; palletCodes: string[]; recipients: string[] }[];
  totals: { reservations: number; pallets: number; grossKg: number; volumeM3: number };
  generatedAt: string;
};
const PRINT_CSS = `@media print {
  .side, .no-print, .toasts { display: none !important; }
  .shell { display: block !important; } .main { padding: 0 !important; margin: 0 !important; }
  .page { max-width: none !important; padding: 0 !important; }
  .manifest table { font-size: 11px; } .manifest tr { break-inside: avoid; }
  body { background: #fff !important; }
}`;
export function ManifestView({ tripId, onBack }: { tripId: string; onBack: () => void }) {
  const { data, error, loading, reload } = useFetch((s) => api<Manifest>("GET", `/carrier/trips/${tripId}/manifest`, undefined, { signal: s }), [tripId]);
  return (
    <div className="page manifest">
      <style>{PRINT_CSS}</style>
      <div className="row between no-print" style={{ marginBottom: 14 }}>
        <button className="link small" onClick={onBack}>← Sefere dön</button>
        <button className="btn primary" onClick={() => window.print()} disabled={!data}>Yazdır</button>
      </div>
      {loading && !data ? <SkeletonCards n={2} h={120} /> : error && !data ? <ErrorBox error={error} onRetry={reload} /> : data && (
        <>
          <h1 className="title" style={{ fontSize: 34 }}>Sefer manifestosu · {data.trip.reference}</h1>
          <div className="muted" style={{ margin: "6px 0 14px" }}>
            {data.trip.origin.name} → {data.trip.destination.name} · Plaka {data.trip.plate} · Kalkış {full(data.trip.departureAt)} · Tahmini varış {dt(data.trip.arrivalEta)}
          </div>
          {!data.items.length ? <div className="muted">Onaylı rezervasyon yok.</div> : (
            <table style={{ width: "100%" }}>
              <thead><tr><th>Sipariş</th><th>Müşteri</th><th>Durum</th><th>Palet kodları</th><th style={{ textAlign: "right" }}>kg</th><th style={{ textAlign: "right" }}>m³</th><th>Alıcılar</th></tr></thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.reservationId}>
                    <td>{r.orderNumber ?? r.reference}</td><td>{r.customerName}</td><td>{r.status}</td>
                    <td className="mono">{r.palletCodes.length ? r.palletCodes.join(", ") : "—"}</td>
                    <td style={{ textAlign: "right" }}>{num(r.grossKg)}</td><td style={{ textAlign: "right" }}>{r.volumeM3}</td>
                    <td>{r.recipients.join(", ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><th colSpan={3}>Toplam · {data.totals.reservations} sipariş</th><th>{data.totals.pallets} palet</th><th style={{ textAlign: "right" }}>{num(data.totals.grossKg)}</th><th style={{ textAlign: "right" }}>{data.totals.volumeM3}</th><th /></tr></tfoot>
            </table>
          )}
          <div className="tiny muted" style={{ marginTop: 12 }}>Oluşturulma: {dt(data.generatedAt)}</div>
        </>
      )}
    </div>
  );
}
