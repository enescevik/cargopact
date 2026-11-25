import { useState } from "react";
import { api } from "./api";
import { dt } from "./format";
import { Empty, ErrorBox, Field, Modal, SkeletonCards, errText, useFetch, useToast } from "./ui";

export type ExceptionItem = {
  id: string; type: string; severity: "high" | "medium" | "low"; title: string;
  reservation: { id: string; reference: string; orderNumber: string | null; customerName: string; pallets: number; status: string };
  tripId: string; tripReference: string; detectedAt: string; responsible: string; reasonCode: string; suggestedAction: string;
  status: "open" | "resolved"; resolution: { note: string; by: string | null; at: string } | null;
};
export const EXC_TYPES: Record<string, string> = {
  GELMEDI: "Gelmeme", EKSIK_HASAR: "Eksik / hasar", LATE_DROPOFF: "Geç bırakma", NOT_PICKED_UP: "Teslim alınmadı",
  NEEDS_REVIEW: "İnceleme bekliyor", MEASUREMENT_DIFF: "Ölçüm farkı", EXPIRED_HOLD: "Blokaj süresi doldu",
};
const SEV: Record<string, [string, string]> = { high: ["bad", "Yüksek"], medium: ["warn", "Orta"], low: ["info", "Düşük"] };

export function ExceptionsView({ onOpenTrip }: { onOpenTrip?: (id: string) => void }) {
  const [type, setType] = useState("");
  const [status, setStatus] = useState<"open" | "resolved" | "">("open");
  const [resolving, setResolving] = useState<ExceptionItem | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();
  const { data, error, loading, reload } = useFetch((s) => api<{ items: ExceptionItem[]; counts: { open: number; resolved: number } }>("GET", `/carrier/exceptions${status ? `?status=${status}` : ""}`, undefined, { signal: s }), [status], 15000);
  const items = (data?.items ?? []).filter((i) => !type || i.type === type);
  async function resolve() {
    if (!resolving) return;
    setBusy(true); setErr(null);
    try {
      await api("POST", `/carrier/exceptions/${encodeURIComponent(resolving.id)}/resolve`, { note: note.trim() });
      toast("İstisna çözüldü olarak işaretlendi");
      setResolving(null); setNote(""); reload();
    } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  }
  return (
    <div className="page">
      <div className="page-head">
        <div className="kicker">Operasyon</div>
        <h1 className="title">İstisnalar</h1>
        <div className="muted" style={{ marginTop: 6 }}>Gelmeme, geç bırakma, ölçüm farkı, hasar ve teslim alınmayan yükler. Kayıtlar mevcut sipariş verisinden hesaplanır.</div>
      </div>
      <div className="row wrap" style={{ gap: 10, marginBottom: 16 }}>
        <select className="input" style={{ width: 220 }} value={type} onChange={(e) => setType(e.target.value)} aria-label="Tür">
          <option value="">Tüm türler</option>
          {Object.entries(EXC_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select className="input" style={{ width: 180 }} value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Durum">
          <option value="open">Açık</option><option value="resolved">Çözülmüş</option><option value="">Tümü</option>
        </select>
        {data && <span className="chip">Açık <b>{data.counts.open}</b></span>}
        {data && <span className="chip">Çözülmüş <b>{data.counts.resolved}</b></span>}
      </div>
      {loading && !data ? <SkeletonCards n={3} h={110} /> : error && !data ? <ErrorBox error={error} onRetry={reload} /> :
        !items.length ? <Empty title="İstisna yok" text="Seçili filtrelerde kayıt bulunmuyor." /> : (
          <div className="col" style={{ gap: 12 }}>
            {items.map((x) => {
              const [tone, sevLabel] = SEV[x.severity];
              return (
                <div className="card" key={x.id}>
                  <div className="row between wrap" style={{ gap: 10 }}>
                    <div className="row wrap" style={{ gap: 8 }}>
                      <span className={`badge ${tone}`}>{sevLabel}</span>
                      <span className="chip">{EXC_TYPES[x.type] ?? x.type}</span>
                      <b>{x.title}</b>
                    </div>
                    {x.status === "resolved" ? <span className="badge ok">Çözüldü</span> : <button className="btn sm primary" onClick={() => { setResolving(x); setNote(""); setErr(null); }}>Çözüldü işaretle</button>}
                  </div>
                  <div className="muted small" style={{ marginTop: 8 }}>
                    {x.reservation.customerName} · {x.reservation.orderNumber ?? x.reservation.reference} · {x.reservation.pallets} palet ·{" "}
                    {onOpenTrip ? <button className="link small" onClick={() => onOpenTrip(x.tripId)}>{x.tripReference}</button> : x.tripReference} · {dt(x.detectedAt)}
                  </div>
                  <div className="small" style={{ marginTop: 8 }}>Sorumlu: <b>{x.responsible}</b> · Neden: <span className="mono">{x.reasonCode}</span></div>
                  <div className="small" style={{ marginTop: 4 }}>Önerilen işlem: {x.suggestedAction}</div>
                  {x.resolution && <div className="small muted" style={{ marginTop: 8 }}>Çözüm notu: {x.resolution.note} — {x.resolution.by ?? "bilinmiyor"}, {dt(x.resolution.at)}</div>}
                </div>
              );
            })}
          </div>
        )}
      {resolving && (
        <Modal title="İstisnayı çöz" onClose={() => setResolving(null)}>
          <div className="small muted" style={{ marginBottom: 10 }}>{resolving.title} · {resolving.reservation.customerName}</div>
          <Field label="Çözüm notu"><textarea className="input" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Ne yapıldı? Kimle görüşüldü?" /></Field>
          {err && <div className="small" style={{ color: "var(--danger)", marginTop: 8 }}>{err}</div>}
          <div className="row" style={{ marginTop: 14, justifyContent: "flex-end" }}>
            <button className="btn" onClick={() => setResolving(null)}>Vazgeç</button>
            <button className="btn primary" disabled={busy || !note.trim()} onClick={resolve}>{busy ? "Kaydediliyor…" : "Kaydet"}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
