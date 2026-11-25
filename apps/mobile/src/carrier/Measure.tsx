import { useState } from "react";
import { Text } from "react-native";
import { api, uuid } from "../api";
import { c, serif } from "../theme";
import { num } from "../format";
import { Badge, Btn, ErrorBox, Field, Sheet } from "../ui";
import type { CarrierReservation } from "../types";

const TOLERANCE = 3;
const digits = (v: string) => v.replace(/\D/g, "");
/** Sunucu kuralının ön izlemesi; nihai karar sunucuda verilir. */
function preview(r: CarrierReservation, p: number, kg: number): { text: string; tone: "success" | "warning" } {
  const dp = p - r.pallets, dk = kg - r.grossKg;
  if (dp === 0 && Math.abs(dk) * 100 <= TOLERANCE * r.grossKg) return { text: `Tolerans içinde (±%${TOLERANCE}): normal kabul.`, tone: "success" };
  if (dp <= 0 && dk <= 0) return { text: "Beyandan az: kabul edilir, fark kapasiteden düşülür.", tone: "success" };
  return { text: "Beyandan fazla: kapasite yeniden kontrol edilir; yer yoksa inceleme gerekir.", tone: "warning" };
}
/** Depo kabul ölçüm sayfası (beyanla önceden dolu). onSubmit olayı kuyruk/idempotency ile gönderir. */
export function MeasureSheet({ r, busy, onClose, onSubmit }: { r: CarrierReservation; busy: boolean; onClose: () => void; onSubmit: (measurement: { measuredPallets: number; measuredKg: number; measuredHeightMm?: number; note?: string }) => void }) {
  const [pallets, setPallets] = useState(String(r.pallets));
  const [kg, setKg] = useState(String(r.grossKg));
  const [height, setHeight] = useState("");
  const [note, setNote] = useState("");
  const p = Number(pallets), k = Number(kg);
  const valid = p >= 1 && kg !== "";
  const pv = valid ? preview(r, p, k) : null;
  return (
    <Sheet onClose={onClose}>
      <Text style={{ fontFamily: serif, fontSize: 24, color: c.ink900 }}>Depoda kabul · ölçüm</Text>
      <Text style={{ color: c.ink700 }}>Beyan: {r.pallets} palet · {num(r.grossKg)} kg</Text>
      <Field label="Ölçülen palet" keyboardType="number-pad" value={pallets} onChangeText={(v) => setPallets(digits(v))} />
      <Field label="Ölçülen brüt kg" keyboardType="number-pad" value={kg} onChangeText={(v) => setKg(digits(v))} />
      <Field label="Yükseklik (mm, isteğe bağlı)" keyboardType="number-pad" value={height} onChangeText={(v) => setHeight(digits(v))} />
      <Field label="Not" value={note} onChangeText={setNote} />
      {valid && <Text style={{ color: c.ink900, fontWeight: "700" }}>Fark: {p - r.pallets >= 0 ? "+" : ""}{p - r.pallets} palet · {k - r.grossKg >= 0 ? "+" : ""}{num(k - r.grossKg)} kg</Text>}
      {pv && <Badge tone={pv.tone} label={pv.text} />}
      <Btn title="Kabul et" loading={busy} disabled={!valid} onPress={() => onSubmit({ measuredPallets: p, measuredKg: k, ...(height ? { measuredHeightMm: Number(height) } : {}), ...(note.trim() ? { note: note.trim() } : {}) })} style={{ minHeight: 56 }} />
      <Btn kind="ghost" title="Vazgeç" onPress={onClose} />
    </Sheet>
  );
}
/** INCELEME: kısmi kabul (palet sayısı) veya ret. */
export function ReviewSheet({ r, onClose, onDone }: { r: CarrierReservation; onClose: () => void; onDone: (msg: string) => void }) {
  const m = r.measurement;
  const [accepted, setAccepted] = useState(String(Math.min(r.pallets, m?.measured.pallets ?? r.pallets)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Error>();
  const [key] = useState(() => uuid());
  const n = Number(accepted);
  const send = async (body: object, msg: string) => {
    setErr(undefined); setBusy(true);
    try { await api("POST", `/carrier/reservations/${r.id}/review`, body, key + JSON.stringify(body)); onDone(msg); }
    catch (e) { setErr(e as Error); } finally { setBusy(false); }
  };
  return (
    <Sheet onClose={onClose}>
      <Text style={{ fontFamily: serif, fontSize: 24, color: c.ink900 }}>Ölçüm incelemesi</Text>
      {m && <Text style={{ color: c.ink700 }}>Beyan {m.declared.pallets} palet / {num(m.declared.kg)} kg · ölçülen {m.measured.pallets} palet / {num(m.measured.kg)} kg. Kapasite fazlayı karşılamıyor.</Text>}
      <Field label="Kabul edilecek palet" keyboardType="number-pad" value={accepted} onChangeText={(v) => setAccepted(digits(v))} />
      {err && <ErrorBox message={err.message} />}
      <Btn title="Kısmi kabul et" loading={busy} disabled={!(n >= 1)} onPress={() => send({ decision: "accept_partial", acceptedPallets: n }, `Kısmi kabul: ${n} palet`)} style={{ minHeight: 56 }} />
      <Btn kind="danger" title="Depoda reddet" loading={busy} onPress={() => send({ decision: "reject" }, "Yük depoda reddedildi")} />
      <Btn kind="ghost" title="Vazgeç" onPress={onClose} />
    </Sheet>
  );
}
