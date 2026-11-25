import { useEffect, useRef, useState } from "react";
import { Platform, Text, View } from "react-native";
import { createElement } from "react";
import { api, ApiError } from "../api";
import { c, serif } from "../theme";
import { Btn, Field, Sheet } from "../ui";
import type { CarrierReservation } from "../types";

type Up = { uploadUrl: string; key: string };
async function upload(id: string, kind: "photo" | "signature", blob: Blob): Promise<string> {
  const u = await api<Up>("POST", `/carrier/reservations/${id}/pod-upload-url`, { kind, contentType: blob.type || "application/octet-stream" });
  let res: Response;
  try { res = await fetch(u.uploadUrl, { method: "PUT", headers: { "content-type": blob.type || "application/octet-stream" }, body: blob }); }
  catch { throw new ApiError("Dosya yüklenemedi (ağ hatası).", 0); }
  if (!res.ok) throw new ApiError(`Dosya yüklenemedi (HTTP ${res.status}).`, res.status);
  return u.key;
}
export function PodSheet({ r, busy, onClose, onSubmit }: { r: CarrierReservation; busy: boolean; onClose: () => void; onSubmit: (recipient: string, keys: string[]) => void }) {
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState<File>();
  const [signed, setSigned] = useState(false);
  const [working, setWorking] = useState(false);
  const [msg, setMsg] = useState<string>();
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const web = Platform.OS === "web";
  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.strokeStyle = "#0B1A4A";
    let down = false;
    const pos = (e: PointerEvent) => { const b = cv.getBoundingClientRect(); return [((e.clientX - b.left) * cv.width) / b.width, ((e.clientY - b.top) * cv.height) / b.height] as const; };
    const d = (e: PointerEvent) => { down = true; cv.setPointerCapture(e.pointerId); const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); e.preventDefault(); };
    const m = (e: PointerEvent) => { if (!down) return; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); setSigned(true); e.preventDefault(); };
    const u = () => { down = false; };
    cv.addEventListener("pointerdown", d); cv.addEventListener("pointermove", m); cv.addEventListener("pointerup", u); cv.addEventListener("pointercancel", u);
    return () => { cv.removeEventListener("pointerdown", d); cv.removeEventListener("pointermove", m); cv.removeEventListener("pointerup", u); cv.removeEventListener("pointercancel", u); };
  }, []);
  const clear = () => { const cv = canvas.current; cv?.getContext("2d")?.clearRect(0, 0, cv.width, cv.height); setSigned(false); };
  const submit = async () => {
    setMsg(undefined); setWorking(true);
    const keys: string[] = [];
    try {
      if (photo) keys.push(await upload(r.id, "photo", photo));
      if (signed && canvas.current) {
        const blob = await new Promise<Blob | null>((res) => canvas.current!.toBlob(res, "image/png"));
        if (blob) keys.push(await upload(r.id, "signature", blob));
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setMsg("Kanıt yükleme servisi henüz yayında değil; teslim yalnız alıcı adıyla kaydedildi.");
        keys.length = 0;
      } else { setMsg((e as Error).message); setWorking(false); return; }
    }
    setWorking(false);
    onSubmit(name.trim(), keys);
  };
  return (
    <Sheet onClose={onClose}>
      <Text style={{ fontFamily: serif, fontSize: 24, color: c.ink900 }}>Teslim kanıtı (e-POD)</Text>
      <Text style={{ color: c.ink500 }}>{r.customer.name} · {r.orderNumber}</Text>
      <Field label="Teslim alan kişi (zorunlu)" value={name} onChangeText={setName} placeholder="Ad Soyad" />
      {web && (
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 1, color: c.ink500 }}>FOTOĞRAF</Text>
          {createElement("input", { type: "file", accept: "image/*", capture: "environment", onChange: (e: { target: { files?: FileList | null } }) => setPhoto(e.target.files?.[0]), style: { fontSize: 14 } })}
          {photo && <Text style={{ fontSize: 12, color: c.mint600 }}>Seçildi: {photo.name}</Text>}
          <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 1, color: c.ink500, marginTop: 6 }}>İMZA</Text>
          {createElement("canvas", { ref: canvas, width: 600, height: 220, style: { width: "100%", height: 110, backgroundColor: "#fff", border: "1px solid #E6DDCB", borderRadius: 12, touchAction: "none" } })}
          <Btn kind="ghost" small title="İmzayı temizle" onPress={clear} />
        </View>
      )}
      {!!msg && <Text style={{ color: c.warning, fontSize: 13, fontWeight: "600" }}>{msg}</Text>}
      <Btn title="Teslimi kaydet" disabled={!name.trim()} loading={working || busy} onPress={submit} />
      <Btn kind="ghost" title="Vazgeç" onPress={onClose} />
    </Sheet>
  );
}
