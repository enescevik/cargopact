import { useState } from "react";
import { ApiError, api } from "../api";
import { ErrorBox, Field, Modal, useFetch } from "../ui";
import { apiPut, type CarrierTripV, type TripUpdateResult } from "./http";

export function EditTripModal({ trip, onClose, onSaved }: { trip: CarrierTripV; onClose: () => void; onSaved: (r: TripUpdateResult) => void }) {
  const veh = useFetch((s) => api<{ items: any[] }>("GET", "/carrier/vehicles?limit=200", undefined, { signal: s }), []); // eslint-disable-line @typescript-eslint/no-explicit-any
  const s = trip.capacity.sellable;
  const [f, setF] = useState({ vehicle: trip.vehicle.id, sP: String(s.pallets), sKg: String(s.kg), sM3: String(s.m3), maxKg: String(trip.capacity.maxGrossKg) });
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);
  const [result, setResult] = useState<TripUpdateResult | null>(null);
  const [key] = useState(() => crypto.randomUUID());
  const vehicles = (veh.data?.items ?? []).filter((v) => v.status !== "inactive" || v.id === trip.vehicle.id);

  async function submit() {
    setBusy(true); setErr(null);
    try {
      const body: Record<string, unknown> = {};
      if (f.vehicle !== trip.vehicle.id) body.vehicleId = f.vehicle;
      if (Number(f.sP) !== s.pallets) body.sellablePallets = Number(f.sP);
      if (Number(f.sKg) !== s.kg) body.sellableKg = Number(f.sKg);
      if (Number(f.sM3) !== s.m3) body.sellableM3 = Number(f.sM3);
      if (Number(f.maxKg) !== trip.capacity.maxGrossKg) body.maxGrossKg = Number(f.maxKg);
      if (Object.keys(body).length === 0) { setErr(new ApiError("Değişiklik yapılmadı.", 400)); return; }
      const r = await apiPut<TripUpdateResult>(`/carrier/trips/${trip.id}`, body, trip.version, key);
      setResult(r);
      onSaved(r);
    } catch (e) { setErr(e as ApiError); } finally { setBusy(false); }
  }
  const n = (k: string, label: string) => <Field label={label}><input type="number" className="input" value={(f as Record<string, string>)[k]} onChange={(e) => set(k, e.target.value)} /></Field>;

  if (result) {
    const bad = result.reevaluated.filter((x) => !x.eligible);
    return (
      <Modal title="Sefer güncellendi" onClose={onClose}>
        <div className="col" style={{ gap: 10 }}>
          <div>Kapasite sürümü: <b>{result.capacityVersion}</b>. Bekleyen {result.reevaluated.length} talep yeniden değerlendirildi.</div>
          {result.reevaluated.length === 0 && <div className="muted small">Bekleyen talep yok.</div>}
          {result.reevaluated.map((x) => (
            <div key={x.reservationId} className={`alert ${x.eligible ? "info" : "warn"}`}>
              <b>{x.customer}</b> <span className="tiny mono">{x.reference}</span> — {x.eligible ? "Uygun" : "Yeniden değerlendirme gerekli"}
              {!x.eligible && x.reasons.map((r) => <div key={r.code} className="small">• {r.message}</div>)}
            </div>
          ))}
          {bad.length > 0 && <div className="small muted">İşaretli talepler onaylanamaz; reddedin veya kapasiteyi geri açın.</div>}
          <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn primary" onClick={onClose}>Kapat</button></div>
        </div>
      </Modal>
    );
  }
  return (
    <Modal title={`Seferi düzenle: ${trip.reference}`} onClose={onClose}>
      <div className="col" style={{ gap: 14 }}>
        <div className="small muted">Bloke ve onaylı yükün altına inilemez. Bekleyen talepler değişiklikten sonra yeniden değerlendirilir.</div>
        <Field label="Araç">
          <select className="input" value={f.vehicle} onChange={(e) => set("vehicle", e.target.value)}>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate}{v.vehicleType?.name ? ` · ${v.vehicleType.name}` : ""}</option>)}
            {!vehicles.some((v) => v.id === trip.vehicle.id) && <option value={trip.vehicle.id}>{trip.vehicle.plate}</option>}
          </select>
        </Field>
        <div className="grid2" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
          {n("sP", "Satışa açık palet")}{n("sKg", "Satışa açık kg")}{n("sM3", "Satışa açık m³")}{n("maxKg", "Azami brüt (kg)")}
        </div>
        {err && <ErrorBox error={err} />}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn" onClick={onClose} disabled={busy}>Vazgeç</button>
          <button className="btn primary" disabled={busy} onClick={submit}>{busy ? "Kaydediliyor…" : "Kaydet ve yeniden değerlendir"}</button>
        </div>
      </div>
    </Modal>
  );
}
