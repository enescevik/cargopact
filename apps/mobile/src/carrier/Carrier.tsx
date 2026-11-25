import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api, uuid } from "../api";
import { postEvent, useQueue, useQueueFlusher, setOfflineSim } from "../queue";
import { Scanner } from "../scanner";
import { PodSheet } from "./Pod";
import { c, mono, serif } from "../theme";
import { dt, num } from "../format";
import { RouteHead } from "../common";
import { BackBar, Badge, Bar, Btn, Card, Chip, Empty, ErrorBox, Field, KV, Label, Row, Screen, Sheet, Skeletons, StatusBadge, Title, useLoad, useToast } from "../ui";
import type { CarrierReservation, CarrierTrip } from "../types";

type TripFull = CarrierTrip & { reservations: CarrierReservation[] };

function CapBars({ t }: { t: CarrierTrip }) {
  const k = t.capacity;
  return (
    <View style={{ gap: 8 }}>
      <Bar label="Palet" total={k.totalPositions}
        parts={[{ v: k.internalPallets, color: c.ink300 }, { v: k.confirmed.pallets, color: c.cobalt600 }, { v: k.held.pallets, color: c.cobalt100 }]}
        text={`${k.plannedPallets} / ${k.totalPositions} planlanan · fiili ${k.actualPallets}/${k.totalPositions}`} />
      <Bar label="Ağırlık" total={k.maxGrossKg}
        parts={[{ v: k.internalKg, color: c.ink300 }, { v: k.confirmed.kg, color: c.cobalt600 }, { v: k.held.kg, color: c.cobalt100 }]}
        text={`${num(k.plannedGrossKg)} / ${num(k.maxGrossKg)} kg`} />
      <Bar label="Hacim" total={k.sellable.m3 || 1}
        parts={[{ v: k.confirmed.m3, color: c.cobalt600 }, { v: k.held.m3, color: c.cobalt100 }]}
        text={`${k.confirmed.m3 + k.held.m3} / ${k.sellable.m3} m³ satışa açık`} />
    </View>
  );
}

export function Trips() {
  const [sel, setSel] = useState<string>();
  const list = useLoad(() => api<{ items: CarrierTrip[] }>("GET", "/carrier/trips"), [], 8000);
  if (sel) return <TripDetail id={sel} onBack={() => { setSel(undefined); void list.reload(true); }} />;
  return (
    <Screen>
      <Title sub="Planlı transferlerde boş palet alanınız.">Seferler</Title>
      {list.loading && !list.data ? <Skeletons n={3} h={190} /> : list.error && !list.data ? <ErrorBox message={list.error} onRetry={() => list.reload()} /> :
        !list.data?.items.length ? <Empty title="Sefer yok" /> :
          list.data.items.map((t) => (
            <Card key={t.id} onPress={() => setSel(t.id)} style={{ gap: 12 }}>
              <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}><RouteHead trip={t} size={22} /></View>
                {t.pendingCount > 0 && <Badge tone="pending" label={`${t.pendingCount} bekleyen`} />}
              </Row>
              <Text style={{ color: c.ink500, fontSize: 13 }}>{dt(t.departureAt)} · {t.vehicle.plate} · {t.vehicleType.name}</Text>
              <CapBars t={t} />
            </Card>
          ))}
    </Screen>
  );
}

function TripDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const toast = useToast();
  const { data: t, error, reload } = useLoad(() => api<TripFull>("GET", `/carrier/trips/${id}`), [id], 6000);
  const [busy, setBusy] = useState<string>();
  const [rejecting, setRejecting] = useState<CarrierReservation>();
  const [reason, setReason] = useState("");
  const [historyFor, setHistoryFor] = useState<CarrierReservation>();
  const [historyReply, setHistoryReply] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [historyBusy, setHistoryBusy] = useState(false);

  const decide = async (r: CarrierReservation, decision: "approve" | "reject", why?: string) => {
    setBusy(r.id);
    try {
      const res = await api<CarrierReservation>("POST", `/carrier/reservations/${r.id}/decision`, { decision, reason: why });
      toast(decision === "approve" ? `Onaylandı · ${res.orderNumber ?? ""}` : "Talep reddedildi");
      setRejecting(undefined); setReason("");
      await reload(true);
    } catch (e) { toast((e as Error).message, "err"); } finally { setBusy(undefined); }
  };

  const showHistoryInsight = async (r: CarrierReservation) => {
    setHistoryFor(r); setHistoryReply(""); setHistoryError(""); setHistoryBusy(true);
    const h = r.customerHistory;
    try {
      const response = await api<{ reply: string }>("POST", "/chat", {
        sessionId: `risk-${uuid()}`,
        message: `${t?.reference ?? id} seferindeki ${r.reference} numaralı ${r.customer.name} talebi için karar desteği hazırla. ` +
          `Önce trip_detail aracından customerHistory değerlerini doğrula: geçmiş sonuçlanmış talep ${h.historicalReservationCount}, doğrulanmış gelmeme ${h.verifiedNoShows}. ` +
          "Ardından carrier_knowledge aracını çağırarak öncelik kuralına etkisini kısa ve tarafsız açıkla; kaynak dosyayı belirt. Onay veya ret kararı verme.",
      });
      setHistoryReply(response.reply);
    } catch (e) { setHistoryError((e as Error).message); }
    finally { setHistoryBusy(false); }
  };

  if (!t) return <View style={{ flex: 1 }}><BackBar title="Seferler" onBack={onBack} /><Screen>{error ? <ErrorBox message={error} onRetry={() => reload()} /> : <Skeletons n={3} h={140} />}</Screen></View>;
  const pending = t.reservations.filter((r) => r.status === "TASIYICI_ONAYI_BEKLIYOR").sort((a, b) => a.priorityRank - b.priorityRank);
  const others = t.reservations.filter((r) => r.status !== "TASIYICI_ONAYI_BEKLIYOR");
  const k = t.capacity;

  return (
    <View style={{ flex: 1 }}>
      <BackBar title="Seferler" onBack={onBack} />
      <Screen>
        <RouteHead trip={t} size={30} />
        <Text style={{ color: c.ink500 }}>{dt(t.departureAt)} · {t.vehicle.plate}</Text>
        <Card>
          <Text style={{ fontSize: 22, fontWeight: "800", color: c.ink900 }}>{k.plannedPallets} / {k.totalPositions} <Text style={{ fontSize: 14, fontWeight: "500", color: c.ink500 }}>planlanan · fiili {k.actualPallets}/{k.totalPositions}</Text></Text>
          {k.heldPallets > 0 && <Text style={{ color: c.pending, fontSize: 13, fontWeight: "600" }}>{k.heldPallets} palet bloke (onay bekliyor)</Text>}
          <CapBars t={t} />
          <Row gap={8}><Chip label="İç yük" /><Chip tone="cobalt" label="Onaylı" /><Chip tone="mint" label="Kalan" /></Row>
        </Card>
        <Label>Bekleyen talepler (öncelik sırasıyla)</Label>
        {pending.length === 0 && <Empty title="Bekleyen talep yok" />}
        {pending.map((r) => (
          <Card key={r.id} style={{ gap: 10 }}>
            <Row style={{ justifyContent: "space-between" }}>
              <Row gap={8}>
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c.cobalt100, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontWeight: "800", color: c.cobalt700 }}>{r.priorityRank}</Text>
                </View>
                <Text style={{ fontSize: 17, fontWeight: "800", color: c.ink900 }}>{r.customer.name}</Text>
              </Row>
              {r.customerHistory.verifiedNoShows > 0 && <Badge tone="danger" label={`${r.customerHistory.verifiedNoShows} gelmeme`} />}
            </Row>
            {r.customerHistory.historicalReservationCount > 0 && (
              <View style={{ backgroundColor: "#FFF4D6", borderRadius: 12, padding: 10, gap: 6 }}>
                <Text style={{ color: "#765400", fontSize: 13 }}><Text style={{ fontWeight: "800" }}>Müşteri geçmişi:</Text> {r.customerHistory.historicalReservationCount} sonuçlanmış talep, {r.customerHistory.verifiedNoShows} doğrulanmış gelmeme.</Text>
                <Btn kind="ghost" title="Knowledge Base yorumunu göster" onPress={() => showHistoryInsight(r)} />
              </View>
            )}
            <Text style={{ color: c.ink700 }}>{r.pallets} palet · {num(r.grossKg)} kg · {r.productClass.name}</Text>
            <Badge tone={r.eligibility.eligible ? "success" : "danger"} label={r.eligibility.eligible ? "Uygun" : "Uygun değil"} />
            {r.eligibility.reasons.map((x, i) => <Text key={i} style={{ fontSize: 13, color: r.eligibility.eligible ? c.ink500 : c.danger }}>• {x.message}</Text>)}
            <Row>
              <Btn style={{ flex: 1 }} kind="mint" title="Onayla" loading={busy === r.id} onPress={() => decide(r, "approve")} />
              <Btn style={{ flex: 1 }} kind="outline" title="Reddet" disabled={busy === r.id} onPress={() => setRejecting(r)} />
            </Row>
          </Card>
        ))}
        {others.length > 0 && <Label>Diğer rezervasyonlar</Label>}
        {others.map((r) => (
          <Card key={r.id}>
            <Row style={{ justifyContent: "space-between" }}>
              <Text style={{ fontWeight: "700", color: c.ink900, flex: 1 }}>{r.customer.name}</Text>
              <StatusBadge status={r.status} label={r.statusLabel} />
            </Row>
            <Text style={{ color: c.ink500, fontSize: 13 }}>{r.pallets} palet · {num(r.grossKg)} kg · <Text style={{ fontFamily: mono }}>{r.orderNumber ?? r.reference}</Text></Text>
          </Card>
        ))}
      </Screen>
      {historyFor && (
        <Sheet onClose={() => setHistoryFor(undefined)}>
          <Text style={{ fontFamily: serif, fontSize: 24, color: c.ink900 }}>Müşteri geçmişi</Text>
          <Text style={{ color: c.ink700, fontWeight: "700" }}>{historyFor.customer.name}</Text>
          <View style={{ backgroundColor: "#FFF4D6", borderRadius: 12, padding: 12 }}>
            <Text style={{ color: "#765400" }}>{historyFor.customerHistory.historicalReservationCount} sonuçlanmış talebin {historyFor.customerHistory.verifiedNoShows} tanesinde onaylı yük zamanında getirilmedi.</Text>
          </View>
          <Text style={{ color: c.ink500, fontSize: 12 }}>Sayılar işlem API’sinden, yorum taşıyıcıya özel Bedrock Knowledge Base’den gelir. Otomatik karar verilmez.</Text>
          {historyBusy ? <Skeletons n={1} h={120} /> : historyError ? <ErrorBox message={historyError} /> : <Text style={{ color: c.ink700, lineHeight: 21 }}>{historyReply}</Text>}
          <Btn kind="ghost" title="Kapat" onPress={() => setHistoryFor(undefined)} />
        </Sheet>
      )}
      {rejecting && (
        <Sheet onClose={() => setRejecting(undefined)}>
          <Text style={{ fontFamily: serif, fontSize: 24, color: c.ink900 }}>Talebi reddet</Text>
          <Text style={{ color: c.ink500 }}>{rejecting.customer.name} · {rejecting.pallets} palet</Text>
          <Field label="Gerekçe (zorunlu)" value={reason} onChangeText={setReason} placeholder="Örn. kapasite yetersiz" />
          <Btn kind="danger" title="Reddet" disabled={!reason.trim()} loading={busy === rejecting.id} onPress={() => decide(rejecting, "reject", reason.trim())} />
          <Btn kind="ghost" title="Vazgeç" onPress={() => setRejecting(undefined)} />
        </Sheet>
      )}
    </View>
  );
}

/* ---------------- Depo ---------------- */
const NEXT: Record<string, { type: string; label: string }> = {
  ONAYLI: { type: "DEPO_KABUL", label: "Depoda kabul" },
  DEPO_KABUL: { type: "YUKLENDI", label: "Araca yüklendi" },
  YUKLENDI: { type: "VARISTA", label: "Varışta" },
  VARISTA: { type: "TESLIM", label: "Teslim" },
};
const WH_STATES = ["ONAYLI", "DEPO_KABUL", "YUKLENDI", "VARISTA", "TESLIM", "EKSIK_HASAR", "GELMEDI"];
const CODE_RE = /CP-\d{4}-\d{4,}(?:-P\d+)?/i;
export function QueuePill() {
  const { items } = useQueue();
  if (!items.length) return null;
  return <Badge tone="warning" label={`${items.length} işlem bekliyor`} />;
}
export function Warehouse() {
  const toast = useToast();
  const trips = useLoad(async () => {
    const l = await api<{ items: CarrierTrip[] }>("GET", "/carrier/trips");
    const trip = l.items.find((t) => t.reference === "DNC-DEMO-GEB-ANK") ?? l.items.find((t) => t.reference.includes("DEMO")) ?? l.items.find((t) => t.capacity.confirmed.pallets > 0) ?? l.items[0];
    if (!trip) return undefined;
    return api<TripFull>("GET", `/carrier/trips/${trip.id}`);
  }, [], 5000);
  const { items: queued, sim } = useQueue();
  useQueueFlusher(() => { void trips.reload(true); });
  const inflight = useRef(new Set<string>());
  const keys = useRef(new Map<string, string>()); // aynı eylem için sabit Idempotency-Key
  const [busy, setBusy] = useState<string>();
  const [note, setNote] = useState<CarrierReservation>();
  const [noteTxt, setNoteTxt] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState<{ code: string; id?: string }>();
  const [pod, setPod] = useState<CarrierReservation>();
  const [manual, setManual] = useState("");
  const qlen = queued.length;
  useEffect(() => { void trips.reload(true); }, [qlen]); // eslint-disable-line react-hooks/exhaustive-deps
  const fire = async (r: CarrierReservation, type: string, extra: Record<string, unknown> = {}) => {
    const g = r.id + type;
    if (inflight.current.has(g)) return; // arayüz çift dokunuş koruması
    inflight.current.add(g); setBusy(g);
    if (!keys.current.has(g)) keys.current.set(g, uuid());
    try {
      const res = await postEvent(r.id, type, extra, keys.current.get(g));
      if (res === "queued") toast("Bekliyor – sunucu teyidi yok", "err");
      else { toast("Kaydedildi"); keys.current.delete(g); }
      setNote(undefined); setNoteTxt(""); setPod(undefined);
      await trips.reload(true);
    } catch (e) { toast((e as Error).message, "err"); } finally { inflight.current.delete(g); setBusy(undefined); }
  };
  const t = trips.data;
  const all = t?.reservations ?? [];
  const items = all.filter((r) => WH_STATES.includes(r.status));
  const find = (code: string) => {
    const m = code.toUpperCase().match(CODE_RE)?.[0];
    if (!m) return undefined;
    return all.find((r) => r.orderNumber?.toUpperCase() === m || r.palletCodes.some((p) => p.toUpperCase() === m));
  };
  const onCode = (code: string) => {
    setScanning(false);
    const r = find(code);
    setScanned({ code, id: r?.id });
    if (!r) toast("Bu sefer için eşleşen yük bulunamadı", "err");
  };
  const hit = scanned?.id ? all.find((r) => r.id === scanned.id) : undefined;
  const card = (r: CarrierReservation, hl = false) => {
    const nx = NEXT[r.status];
    const pending = queued.filter((q) => q.reservationId === r.id);
    const pend = pending.some((q) => q.type === nx?.type);
    return (
      <Card key={(hl ? "hl-" : "") + r.id} style={{ gap: 10, ...(hl ? { borderWidth: 2, borderColor: c.mint500 } : {}) }}>
        <Row style={{ justifyContent: "space-between" }}>
          <Text style={{ fontSize: 17, fontWeight: "800", color: c.ink900, flex: 1 }}>{r.customer.name}</Text>
          <StatusBadge status={r.status} label={r.statusLabel} />
        </Row>
        <Text style={{ color: c.ink700 }}>{r.pallets} palet · {num(r.grossKg)} kg</Text>
        <Text style={{ fontFamily: mono, fontSize: 12, color: c.ink500 }}>{r.orderNumber}</Text>
        {r.palletCodes.length > 0 && <Text style={{ fontFamily: mono, fontSize: 11, color: c.ink300 }}>{r.palletCodes.join("  ")}</Text>}
        {pending.map((q) => <Badge key={q.idempotencyKey} tone="warning" label={`Bekliyor – sunucu teyidi yok (${q.type})`} />)}
        {nx && !pend && <Btn title={nx.label} loading={busy === r.id + nx.type} onPress={() => (nx.type === "TESLIM" ? setPod(r) : fire(r, nx.type))} style={{ minHeight: 60 }} />}
        {r.status === "ONAYLI" && !pending.length && <Btn kind="outline" small title="Gelmedi" loading={busy === r.id + "GELMEDI"} onPress={() => fire(r, "GELMEDI")} />}
        {["DEPO_KABUL", "YUKLENDI", "VARISTA"].includes(r.status) && !pending.length && <Btn kind="outline" small title="Eksik / hasar bildir" onPress={() => setNote(r)} />}
      </Card>
    );
  };
  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <View style={{ flex: 1 }}><Title sub="Kabul, yükleme, varış ve teslim olayları.">Depo</Title></View>
          <QueuePill />
        </Row>
        <Btn title="▣  QR okut" onPress={() => setScanning(true)} style={{ minHeight: 60 }} />
        <Row style={{ alignItems: "flex-end" }}>
          <Field label="Kodu elle gir" value={manual} onChangeText={setManual} placeholder="CP-2026-000123-P1" autoCapitalize="characters" onSubmitEditing={() => manual.trim() && onCode(manual.trim())} />
          <Btn kind="outline" small title="Bul" disabled={!manual.trim()} onPress={() => { onCode(manual.trim()); setManual(""); }} />
        </Row>
        <Pressable onPress={() => setOfflineSim(!sim)} style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 }}>
          <View style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: sim ? c.warning : c.line, padding: 3, alignItems: sim ? "flex-end" : "flex-start" }}>
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff" }} />
          </View>
          <Text style={{ color: c.ink700, fontSize: 13, flex: 1 }}>Çevrimdışı simülasyonu {sim ? "(açık: işlemler kuyruğa alınır)" : ""}</Text>
        </Pressable>
        {scanned && (
          <View style={{ gap: 8 }}>
            <Row style={{ justifyContent: "space-between" }}>
              <Text style={{ fontFamily: mono, fontSize: 13, color: c.ink700, flex: 1 }}>Okutulan: {scanned.code}</Text>
              <Pressable onPress={() => setScanned(undefined)} style={{ minHeight: 44, justifyContent: "center" }}><Text style={{ color: c.cobalt600, fontWeight: "700" }}>Temizle</Text></Pressable>
            </Row>
            {hit ? card(hit, true) : <ErrorBox message="Bu koda ait yük bu seferin rezervasyonlarında yok." />}
          </View>
        )}
        {trips.loading && !t ? <Skeletons n={3} h={150} /> : trips.error && !t ? <ErrorBox message={trips.error} onRetry={() => trips.reload()} /> : !t ? <Empty title="Sefer yok" /> : (
          <>
            <Card>
              <RouteHead trip={t} size={22} />
              <Text style={{ fontSize: 15, color: c.ink900, fontWeight: "700" }}>{t.capacity.plannedPallets} / {t.capacity.totalPositions} planlanan · fiili {t.capacity.actualPallets}/{t.capacity.totalPositions}</Text>
              <Text style={{ fontSize: 12, color: c.ink500 }}>Son kabul (T−1): {dt(t.intakeCutoffAt)}</Text>
            </Card>
            {items.length === 0 && <Empty title="İşlenecek yük yok" text="Onaylanan rezervasyonlar burada görünür." />}
            {items.map((r) => card(r))}
          </>
        )}
      </Screen>
      {note && (
        <Sheet onClose={() => setNote(undefined)}>
          <Text style={{ fontFamily: serif, fontSize: 24, color: c.ink900 }}>Eksik / hasar</Text>
          <Field label="Not" value={noteTxt} onChangeText={setNoteTxt} placeholder="Örn. 1 palette ezilme" />
          <Btn kind="danger" title="Kaydet" loading={busy === note.id + "EKSIK_HASAR"} onPress={() => fire(note, "EKSIK_HASAR", { note: noteTxt.trim() || undefined })} />
          <Btn kind="ghost" title="Vazgeç" onPress={() => setNote(undefined)} />
        </Sheet>
      )}
      {pod && <PodSheet r={pod} busy={busy === pod.id + "TESLIM"} onClose={() => setPod(undefined)} onSubmit={(recipientName, podKeys) => fire(pod, "TESLIM", { recipientName, podKeys })} />}
      {scanning && <Scanner onCode={onCode} onClose={() => setScanning(false)} />}
    </View>
  );
}
