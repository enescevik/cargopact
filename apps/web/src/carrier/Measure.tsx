import { useState } from "react";
import { Ruler } from "lucide-react";
import { api } from "../api";
import { num } from "../format";
import { ErrorBox, Field, Modal } from "../ui";
import type { CarrierRes } from "./http";

const TOLERANCE = 3; // % kg
/** Sunucudaki kuralın ön izlemesi; nihai karar sunucuda verilir (uygunluk kapasiteye bağlıdır). */
function preview(r: CarrierRes, pallets: number, kg: number): { text: string; tone: "ok" | "warn" } {
  const dp = pallets - r.pallets, dk = kg - r.grossKg;
  if (dp === 0 && Math.abs(dk) * 100 <= TOLERANCE * r.grossKg) return { text: `Tolerans içinde (±%${TOLERANCE}): normal kabul.`, tone: "ok" };
  if (dp <= 0 && dk <= 0) return { text: "Beyandan az: kabul edilir, fark kapasiteden düşülür.", tone: "ok" };
  return { text: "Beyandan fazla: kapasite yeniden kontrol edilir. Yer yoksa inceleme (kısmi kabul / ret) gerekir.", tone: "warn" };
}
/** Depo kabulü: ölçüm formu (beyanla önceden dolu). INCELEME durumunda inceleme paneli. */
export function MeasureModal({ r, onClose, onDone }: { r: CarrierRes; onClose: () => void; onDone: (msg: string) => void }) {
  return r.status === "INCELEME" ? <ReviewPanel r={r} onClose={onClose} onDone={onDone} /> : <MeasureForm r={r} onClose={onClose} onDone={onDone} />;
}
function MeasureForm({ r, onClose, onDone }: { r: CarrierRes; onClose: () => void; onDone: (msg: string) => void }) {
  const [pallets, setPallets] = useState(String(r.pallets));
  const [kg, setKg] = useState(String(r.grossKg));
  const [height, setHeight] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Error | null>(null);
  const [key] = useState(() => crypto.randomUUID());
  const p = Number(pallets), k = Number(kg);
  const valid = Number.isInteger(p) && p >= 1 && Number.isInteger(k) && k >= 0 && (height === "" || Number(height) >= 0);
  const pv = valid ? preview(r, p, k) : null;
  async function submit() {
    setErr(null); setBusy(true);
    try {
      const res = await api<CarrierRes>("POST", `/carrier/reservations/${r.id}/events`, {
        type: "DEPO_KABUL",
        measurement: { measuredPallets: p, measuredKg: k, ...(height ? { measuredHeightMm: Number(height) } : {}), ...(note.trim() ? { note: note.trim() } : {}) },
      }, { idempotencyKey: key });
      onDone(res.status === "INCELEME" ? "Ölçüm farkı: inceleme gerekli." : `Depo kabulü kaydedildi: ${r.customer.name}`);
    } catch (e) { setErr(e as Error); } finally { setBusy(false); }
  }
  return (
    <Modal title={`Depoda kabul: ${r.customer.name}`} onClose={onClose}>
      <div className="col" style={{ gap: 14 }}>
        <div className="small muted">{r.orderNumber ?? r.reference} · Beyan: <b>{num(r.pallets)} palet · {num(r.grossKg)} kg</b>. Ölçülen değerleri girin.</div>
        <div className="row" style={{ gap: 12 }}>
          <Field label="Ölçülen palet"><input className="input" data-testid="measure-pallets" inputMode="numeric" value={pallets} onChange={(e) => setPallets(e.target.value.replace(/\D/g, ""))} autoFocus /></Field>
          <Field label="Ölçülen brüt kg"><input className="input" data-testid="measure-kg" inputMode="numeric" value={kg} onChange={(e) => setKg(e.target.value.replace(/\D/g, ""))} /></Field>
          <Field label="Yükseklik (mm)"><input className="input" inputMode="numeric" value={height} onChange={(e) => setHeight(e.target.value.replace(/\D/g, ""))} placeholder="isteğe bağlı" /></Field>
        </div>
        {valid && <div className="small">Fark: <b>{p - r.pallets >= 0 ? "+" : ""}{p - r.pallets} palet</b> · <b>{k - r.grossKg >= 0 ? "+" : ""}{num(k - r.grossKg)} kg</b> ({r.grossKg ? ((k - r.grossKg) / r.grossKg * 100).toFixed(1) : "0"}%)</div>}
        {pv && <div className={`alert ${pv.tone === "warn" ? "warn" : ""}`}>{pv.text}</div>}
        <Field label="Not"><input className="input" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></Field>
        {err && <ErrorBox error={err} />}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn" onClick={onClose} disabled={busy}>Vazgeç</button>
          <button className="btn primary" data-testid="measure-submit" disabled={busy || !valid} onClick={submit}><Ruler size={14} />Kabul et</button>
        </div>
      </div>
    </Modal>
  );
}
function ReviewPanel({ r, onClose, onDone }: { r: CarrierRes; onClose: () => void; onDone: (msg: string) => void }) {
  const m = r.measurement;
  const [accepted, setAccepted] = useState(String(Math.min(r.pallets, m?.measured.pallets ?? r.pallets)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Error | null>(null);
  const [key] = useState(() => crypto.randomUUID());
  const n = Number(accepted);
  async function send(body: object, msg: string) {
    setErr(null); setBusy(true);
    try { await api("POST", `/carrier/reservations/${r.id}/review`, body, { idempotencyKey: key + JSON.stringify(body) }); onDone(msg); }
    catch (e) { setErr(e as Error); } finally { setBusy(false); }
  }
  return (
    <Modal title={`Ölçüm incelemesi: ${r.customer.name}`} onClose={onClose}>
      <div className="col" style={{ gap: 14 }}>
        {m && <div className="alert warn">Beyan {num(m.declared.pallets)} palet / {num(m.declared.kg)} kg · ölçülen <b>{num(m.measured.pallets)} palet / {num(m.measured.kg)} kg</b> (fark {m.diff.pallets >= 0 ? "+" : ""}{m.diff.pallets} palet, {m.diff.kg >= 0 ? "+" : ""}{num(m.diff.kg)} kg). Sefer kapasitesi fazlayı karşılamıyor.</div>}
        <Field label="Kabul edilecek palet sayısı">
          <input className="input" data-testid="accept-pallets" inputMode="numeric" value={accepted} onChange={(e) => setAccepted(e.target.value.replace(/\D/g, ""))} />
        </Field>
        <div className="tiny">Kabul edilmeyen paletler için iade, iptal politikasına göre deftere yazılır; birim fiyat korunur.</div>
        {err && <ErrorBox error={err} />}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn danger" data-testid="review-reject" disabled={busy} onClick={() => send({ decision: "reject" }, "Yük depoda reddedildi.")}>Reddet</button>
          <button className="btn primary" data-testid="review-accept" disabled={busy || !(n >= 1)} onClick={() => send({ decision: "accept_partial", acceptedPallets: n }, `Kısmi kabul: ${n} palet.`)}>Kısmi kabul et</button>
        </div>
      </div>
    </Modal>
  );
}
