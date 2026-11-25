import { useState } from "react";
import { KeyRound, Plus, Trash2 } from "lucide-react";
import { ApiError } from "./api";
import { apiPut } from "./carrier/http";
import type { Recipient, Reservation } from "./types";
import { ErrorBox, useToast } from "./ui";

const CLOSED = ["RET", "IPTAL", "SURESI_DOLDU", "GELMEDI"];

/** Teslim kodu + yetkili alıcılar (müşteri). Kod yalnız müşteri yanıtında gelir; TESLIM'e kadar alıcılar düzenlenebilir. */
export function PickupCard({ r, onSaved }: { r: Reservation; onSaved: () => void }) {
  const toast = useToast();
  const p = r.pickup;
  const [list, setList] = useState<Recipient[]>(() => p?.recipients ?? []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);
  if (CLOSED.includes(r.status)) return null;
  const editable = r.status !== "TESLIM";
  const set = (i: number, patch: Partial<Recipient>) => setList((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  async function save() {
    setBusy(true); setErr(null);
    try {
      const clean = list.map((x) => ({ name: x.name.trim(), ...(x.phone?.trim() ? { phone: x.phone.trim() } : {}) })).filter((x) => x.name);
      await apiPut(`/customer/reservations/${r.id}/recipients`, { recipients: clean }, 0, crypto.randomUUID());
      toast("Yetkili alıcılar kaydedildi.", "ok"); onSaved();
    } catch (e) { setErr(e as ApiError); } finally { setBusy(false); }
  }
  return (
    <div className="card" data-testid="pickup-card">
      <h3 className="serif" style={{ fontSize: 22, marginBottom: 10 }}><KeyRound size={18} style={{ verticalAlign: -2 }} /> Teslim kodu ve yetkili alıcılar</h3>
      {p?.code ? (
        <div style={{ marginBottom: 12 }}>
          <div className="tiny">TESLİM KODU</div>
          <div className="mono" data-testid="pickup-code" style={{ fontSize: 34, letterSpacing: 6 }}>{p.code}</div>
          <div className="tiny">Varış merkezinde teslim alırken yetkili alıcı bu kodu söylemelidir. Kodu yalnız yetkili alıcıyla paylaşın.</div>
        </div>
      ) : r.status === "TASIYICI_ONAYI_BEKLIYOR" ? <div className="small muted" style={{ marginBottom: 12 }}>Teslim kodu taşıyıcı onayından sonra burada görünür.</div> : null}
      {p?.locked && <div className="alert err" style={{ marginBottom: 10 }}><div>Çok sayıda hatalı deneme nedeniyle teslim kilitlendi. Taşıyıcı operasyonuyla iletişime geçin.</div></div>}
      <div className="tiny" style={{ marginBottom: 6 }}>YETKİLİ ALICILAR (EN ÇOK 3)</div>
      <div className="col" style={{ gap: 8 }}>
        {list.length === 0 && <span className="small muted">Henüz yetkili alıcı yok. Alıcı eklemeden teslim yapılamaz.</span>}
        {list.map((x, i) => (
          <div key={i} className="row" style={{ gap: 8 }}>
            <input className="input" placeholder="Ad Soyad" value={x.name} disabled={!editable} onChange={(e) => set(i, { name: e.target.value })} />
            <input className="input" placeholder="Telefon (isteğe bağlı)" value={x.phone ?? ""} disabled={!editable} onChange={(e) => set(i, { phone: e.target.value })} />
            {editable && <button className="btn sm" aria-label="Alıcıyı sil" onClick={() => setList((l) => l.filter((_, j) => j !== i))}><Trash2 size={14} /></button>}
          </div>
        ))}
      </div>
      {err && <div style={{ marginTop: 10 }}><ErrorBox error={err} /></div>}
      {editable && (
        <div className="row" style={{ marginTop: 12 }}>
          {list.length < 3 && <button className="btn sm" onClick={() => setList((l) => [...l, { name: "" }])}><Plus size={14} />Alıcı ekle</button>}
          <button className="btn primary sm" disabled={busy} onClick={save}>Kaydet</button>
        </div>
      )}
    </div>
  );
}
