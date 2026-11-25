import { useEffect, useRef, useState } from "react";
import { Camera, Eraser } from "lucide-react";
import { api, ApiError } from "../api";
import { ErrorBox, Field, Modal } from "../ui";
import { uploadToS3, type CarrierRes, type PodFile } from "./http";

const OK_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Fare/dokunmatik imza tuvali. */
function SignaturePad({ onChange }: { onChange: (blank: boolean) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = ref.current!, b = c.getBoundingClientRect();
    return { x: ((e.clientX - b.left) * c.width) / b.width, y: ((e.clientY - b.top) * c.height) / b.height };
  };
  useEffect(() => {
    const ctx = ref.current!.getContext("2d")!;
    ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.strokeStyle = "#101a4a";
  }, []);
  return (
    <div>
      <canvas ref={ref} width={560} height={180} data-testid="signature-pad"
        style={{ width: "100%", height: 150, border: "1px dashed #98a2c9", borderRadius: 10, background: "#fff", touchAction: "none", cursor: "crosshair" }}
        onPointerDown={(e) => { drawing.current = true; e.currentTarget.setPointerCapture(e.pointerId); const p = pos(e); const x = ref.current!.getContext("2d")!; x.beginPath(); x.moveTo(p.x, p.y); x.lineTo(p.x + 0.1, p.y + 0.1); x.stroke(); onChange(false); }}
        onPointerMove={(e) => { if (!drawing.current) return; const p = pos(e); const x = ref.current!.getContext("2d")!; x.lineTo(p.x, p.y); x.stroke(); }}
        onPointerUp={() => { drawing.current = false; }} onPointerCancel={() => { drawing.current = false; }} />
      <button type="button" className="btn sm" style={{ marginTop: 6 }} onClick={() => { const c = ref.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); onChange(true); }}><Eraser size={14} />Temizle</button>
    </div>
  );
}
const canvasBlob = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("İmza okunamadı."))), "image/png"));

/** Teslim: alıcı adı + fotoğraf + imza → presigned URL ile S3 → TESLIM olayı. */
export function TeslimModal({ r, onClose, onDone }: { r: CarrierRes; onClose: () => void; onDone: () => void }) {
  const recips = r.pickup?.recipients ?? [];
  const [name, setName] = useState(recips.length === 1 ? recips[0].name : "");
  const [code, setCode] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [blank, setBlank] = useState(true);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const [err, setErr] = useState<Error | null>(null);
  const [key] = useState(() => crypto.randomUUID());
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function submit() {
    setErr(null);
    if (photo && !OK_TYPES.includes(photo.type)) { setErr(new Error("Fotoğraf JPEG, PNG veya WebP olmalı.")); return; }
    setBusy(true);
    try {
      const keys: string[] = [];
      const send = async (kind: "photo" | "signature", blob: Blob, contentType: string) => {
        setStep(kind === "photo" ? "Fotoğraf yükleniyor…" : "İmza yükleniyor…");
        const u = await api<{ uploadUrl: string; key: string }>("POST", `/carrier/reservations/${r.id}/pod-upload-url`, { kind, contentType });
        await uploadToS3(u.uploadUrl, blob, contentType);
        keys.push(u.key);
      };
      if (photo) await send("photo", photo, photo.type);
      const canvas = document.querySelector<HTMLCanvasElement>("canvas[data-testid=signature-pad]");
      if (canvas && !blank) await send("signature", await canvasBlob(canvas), "image/png");
      setStep("Teslim kaydediliyor…");
      await api("POST", `/carrier/reservations/${r.id}/events`, { type: "TESLIM", recipientName: name.trim(), pickupCode: code.trim(), ...(keys.length ? { podKeys: keys } : {}) }, { idempotencyKey: key });
      onDone();
    } catch (e) { setErr(e as Error); } finally { setBusy(false); setStep(""); }
  }

  return (
    <Modal title={`Teslim (e-POD): ${r.customer.name}`} onClose={onClose}>
      <div className="col" style={{ gap: 14 }}>
        <div className="small muted">{r.orderNumber ?? r.reference} · {r.pallets} palet · teslim alan kişinin bilgilerini ve kanıtı kaydedin.</div>
        <Field label="Yetkili alıcı (zorunlu)">
          {recips.length > 0 ? (
            <select className="input" data-testid="recipient-select" value={name} onChange={(e) => setName(e.target.value)} autoFocus>
              <option value="">Seçin…</option>
              {recips.map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
            </select>
          ) : <div className="small muted">Müşteri yetkili alıcı tanımlamamış; teslim yapılamaz.</div>}
        </Field>
        <Field label="Müşterinin teslim kodu (6 hane, zorunlu)">
          <input className="input mono" data-testid="pickup-code-input" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="••••••" />
        </Field>
        <Field label="Teslim fotoğrafı">
          <input type="file" accept="image/*" capture="environment" className="input"
            onChange={(e) => { const f = e.target.files?.[0] ?? null; setPhoto(f); setPreview(f ? URL.createObjectURL(f) : null); }} />
        </Field>
        {preview && <img src={preview} alt="Teslim fotoğrafı önizleme" style={{ maxHeight: 160, borderRadius: 10, objectFit: "cover", alignSelf: "flex-start" }} />}
        <Field label="Alıcı imzası"><SignaturePad onChange={setBlank} /></Field>
        {err && <ErrorBox error={err instanceof ApiError ? err : err} />}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          {step && <span className="small muted">{step}</span>}
          <button className="btn" onClick={onClose} disabled={busy}>Vazgeç</button>
          <button className="btn primary" disabled={busy || name.trim().length < 2 || code.length !== 6 || r.pickup?.locked === true} onClick={submit}><Camera size={14} />Teslimi kaydet</button>
        </div>
      </div>
    </Modal>
  );
}

/** Rezervasyon satırında e-POD küçük resimleri. */
export function PodThumbs({ files, recipient }: { files: PodFile[]; recipient?: string | null }) {
  if (!files.length && !recipient) return null;
  return (
    <div className="row" style={{ gap: 6, marginTop: 6, alignItems: "center" }}>
      {files.map((f, i) => (
        <a key={i} href={f.url} target="_blank" rel="noreferrer" title={f.kind === "signature" ? "İmza" : "Teslim fotoğrafı"}>
          <img src={f.url} alt={f.kind === "signature" ? "İmza" : "Teslim fotoğrafı"} style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 8, border: "1px solid #d5dbf0", background: "#fff" }} />
        </a>
      ))}
      {recipient && <span className="tiny">Teslim alan: <b>{recipient}</b></span>}
    </div>
  );
}
