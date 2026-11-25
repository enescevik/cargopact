import { useState } from "react";
import { Text, View } from "react-native";
import { api } from "../api";
import { c } from "../theme";
import { dt } from "../format";
import { Badge, Btn, Card, Chip, Empty, ErrorBox, Field, Row, Screen, Sheet, Skeletons, Title, useLoad, useToast } from "../ui";

type Exc = {
  id: string; type: string; severity: "high" | "medium" | "low"; title: string;
  reservation: { reference: string; orderNumber: string | null; customerName: string; pallets: number };
  tripReference: string; detectedAt: string; responsible: string; reasonCode: string; suggestedAction: string;
  status: "open" | "resolved"; resolution: { note: string; by: string | null; at: string } | null;
};
const SEV = { high: ["danger", "Yüksek"], medium: ["warning", "Orta"], low: ["info", "Düşük"] } as const;
export function Exceptions() {
  const toast = useToast();
  const [status, setStatus] = useState<"open" | "resolved">("open");
  const [sel, setSel] = useState<Exc>();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const list = useLoad(() => api<{ items: Exc[] }>("GET", `/carrier/exceptions?status=${status}`), [status], 15000);
  const resolve = async () => {
    if (!sel) return;
    setBusy(true);
    try {
      await api("POST", `/carrier/exceptions/${encodeURIComponent(sel.id)}/resolve`, { note: note.trim() });
      toast("İstisna çözüldü"); setSel(undefined); setNote(""); await list.reload(true);
    } catch (e) { toast((e as Error).message, "err"); } finally { setBusy(false); }
  };
  return (
    <Screen>
      <Title sub="Gelmeme, hasar, geç bırakma ve ölçüm farkları.">İstisnalar</Title>
      <Row><Chip label="Açık" active={status === "open"} onPress={() => setStatus("open")} /><Chip label="Çözülmüş" active={status === "resolved"} onPress={() => setStatus("resolved")} /></Row>
      {list.loading && !list.data ? <Skeletons n={3} h={110} /> : list.error && !list.data ? <ErrorBox message={list.error} onRetry={() => list.reload()} /> :
        !list.data?.items.length ? <Empty title="İstisna yok" /> :
          list.data.items.map((x) => (
            <Card key={x.id} onPress={x.status === "open" ? () => { setSel(x); setNote(""); } : undefined} style={{ gap: 6 }}>
              <Row style={{ justifyContent: "space-between" }}><Badge tone={SEV[x.severity][0]} label={SEV[x.severity][1]} /><Text style={{ color: c.ink500, fontSize: 12 }}>{x.responsible}</Text></Row>
              <Text style={{ fontWeight: "700", fontSize: 15, color: c.ink900 }}>{x.title}</Text>
              <Text style={{ color: c.ink500, fontSize: 13 }}>{x.reservation.customerName} · {x.reservation.orderNumber ?? x.reservation.reference} · {x.reservation.pallets} palet · {x.tripReference}</Text>
              <Text style={{ color: c.ink500, fontSize: 12 }}>{dt(x.detectedAt)}</Text>
              {x.resolution && <Text style={{ color: c.ink500, fontSize: 12 }}>Çözüm: {x.resolution.note}</Text>}
            </Card>
          ))}
      {sel && (
        <Sheet onClose={() => setSel(undefined)}>
          <View style={{ gap: 10 }}>
            <Text style={{ fontWeight: "800", fontSize: 18, color: c.ink900 }}>{sel.title}</Text>
            <Text style={{ color: c.ink500, fontSize: 13 }}>Önerilen işlem: {sel.suggestedAction}</Text>
            <Field label="Çözüm notu" value={note} onChangeText={setNote} multiline maxLength={500} />
            <Btn title="Çözüldü işaretle" onPress={resolve} loading={busy} disabled={!note.trim()} />
          </View>
        </Sheet>
      )}
    </Screen>
  );
}
