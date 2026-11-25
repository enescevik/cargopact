import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api, uuid } from "../api";
import { postEvent, useQueue, useQueueFlusher, setOfflineSim } from "../queue";
import { Scanner } from "../scanner";
import { PodSheet } from "./Pod";
import { MeasureSheet, ReviewSheet } from "./Measure";
import { c, mono, sansBold, serif } from "../theme";
import { dt, num } from "../format";
import { RouteHead } from "../common";
import { BackBar, Badge, Bar, Btn, Card, Chip, Empty, ErrorBox, Field, KV, Label, Row, Screen, Sheet, Skeletons, StatusBadge, Title, useLoad, useToast } from "../ui";
import type { CarrierReservation, CarrierTrip } from "../types";
import { addDays, ChipSelect, dayNum, Eyebrow, isoDay, Noir, operatorCells, RouteTitle, Segmented, today, TruckMap, weekday } from "../premium";
import { NewTrip } from "./NewTrip";
import { place } from "../format";

const REJECT_REASONS = ["Kapasite yetersiz", "Ürün sınıfı uygun değil", "Ağırlık sınırı aşılıyor", "Rota/zaman uyumsuz", "Müşteri geçmişi riskli"];

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
  const [creating, setCreating] = useState(false);
  const list = useLoad(() => api<{ items: CarrierTrip[] }>("GET", "/carrier/trips"), [], 8000);
  if (creating) return <NewTrip onBack={() => setCreating(false)} onCreated={(id) => { setCreating(false); setSel(id); void list.reload(true); }} />;
  if (sel) return <TripDetail id={sel} onBack={() => { setSel(undefined); void list.reload(true); }} />;
  // Önce yaklaşan seferler (yakından uzağa), sonra geçmiş (yeniden eskiye).
  const now = new Date().toISOString();
  const all = list.data?.items ?? [];
  const items = [
    ...all.filter((t) => t.departureAt >= now).sort((a, b) => a.departureAt.localeCompare(b.departureAt)),
    ...all.filter((t) => t.departureAt < now).sort((a, b) => b.departureAt.localeCompare(a.departureAt)),
  ];
  const pending = items.reduce((n, t) => n + t.pendingCount, 0);
  const planned = items.reduce((n, t) => n + t.capacity.plannedPallets, 0), total = items.reduce((n, t) => n + t.capacity.totalPositions, 0);
  const groups = new Map<string, CarrierTrip[]>();
  for (const t of items) { const d = isoDay(t.departureAt); groups.set(d, [...(groups.get(d) ?? []), t]); }
  const dayTitle = (d: string) => d === today() ? "Bugün" : d === addDays(today(), 1) ? "Yarın" : `${weekday(d)} ${dayNum(d)}`;
  return (
    <Screen>
      <Noir>
        <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Eyebrow light>Operasyon kokpiti</Eyebrow>
            <Text style={{ fontFamily: serif, color: "#fff", fontSize: 26 }}>{items.length} sefer</Text>
          </View>
          <Pressable onPress={() => setCreating(true)} style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 14, borderRadius: 14, backgroundColor: c.mint500, justifyContent: "center", opacity: pressed ? 0.85 : 1 })}>
            <Text style={{ fontFamily: sansBold, color: c.cobalt900 }}>+ Aracım var</Text>
          </Pressable>
        </Row>
        <Text style={{ color: "#B9C3EF", fontSize: 12 }}>{planned}/{total} palet planlı · <Text style={{ color: pending ? c.champagne : "#B9C3EF", fontWeight: "800" }}>{pending} talep bekliyor</Text></Text>
      </Noir>
      {list.loading && !list.data ? <Skeletons n={3} h={80} /> : list.error && !list.data ? <ErrorBox message={list.error} onRetry={() => list.reload()} /> :
        !items.length ? <Empty title="Sefer yok" text="“Aracım var” ile ilk seferinizi açın." /> :
          [...groups.entries()].map(([d, ts]) => (
            <View key={d} style={{ gap: 8 }}>
              <Eyebrow>{dayTitle(d)}</Eyebrow>
              {ts.map((t) => {
                const k = t.capacity, pct = k.totalPositions ? k.plannedPallets / k.totalPositions : 0;
                return (
                  <Pressable key={t.id} onPress={() => setSel(t.id)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 18, backgroundColor: c.surface, borderWidth: 1, borderColor: t.pendingCount ? c.champagne : c.line, opacity: pressed ? 0.85 : 1 })}>
                    <View style={{ width: 52, height: 52, borderRadius: 26, borderWidth: 5, borderColor: pct >= 0.95 ? c.mint500 : pct >= 0.7 ? c.cobalt600 : c.cobalt100, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontFamily: sansBold, fontSize: 12, color: c.cobalt900 }}>%{Math.round(pct * 100)}</Text>
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ fontFamily: sansBold, fontSize: 15, color: c.cobalt900 }} numberOfLines={1}>{place(t.origin)} <Text style={{ color: c.champagneInk }}>→</Text> {place(t.destination)}</Text>
                      <Text style={{ fontSize: 12, color: c.ink500 }} numberOfLines={1}>{dt(t.departureAt)} · {t.vehicle.plate} · {k.plannedPallets}/{k.totalPositions} palet</Text>
                    </View>
                    {t.pendingCount > 0 ? <Badge tone="pending" label={`${t.pendingCount}`} /> : <Text style={{ color: c.ink300, fontSize: 20 }}>›</Text>}
                  </Pressable>
                );
              })}
            </View>
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
  const [tab, setTab] = useState<"req" | "ok">("req");
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
        <Noir>
          <Eyebrow light>Operasyon kokpiti · {t.vehicle.plate}</Eyebrow>
          <RouteTitle from={place(t.origin)} to={place(t.destination)} size={26} light />
          <Text style={{ color: "#B9C3EF", fontSize: 13 }}>{dt(t.departureAt)} · {t.vehicleType.name}</Text>
          <TruckMap dark operator positions={k.totalPositions}
            cells={operatorCells(k.internalPallets, t.reservations.map((r) => ({ name: r.customer.name, pallets: r.pallets, status: r.status })))} />
        </Noir>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {[
            ["Palet", k.plannedPallets, k.totalPositions, ""],
            ["Ağırlık (t)", Math.round(k.plannedGrossKg / 100) / 10, Math.round(k.maxGrossKg / 100) / 10, ""],
            ["Hacim", Math.round((k.confirmed.m3 + k.held.m3) * 10) / 10, k.sellable.m3 || 1, " m³"],
          ].map(([l, v, tot, u]) => {
            const pct = Math.min(1, Number(v) / Math.max(1, Number(tot)));
            return (
              <View key={String(l)} style={{ flex: 1, padding: 10, borderRadius: 14, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, gap: 4 }}>
                <Text style={{ fontSize: 10, fontWeight: "800", color: c.ink500, letterSpacing: 0.6 }}>{String(l).toLocaleUpperCase("tr-TR")}</Text>
                <Text style={{ fontFamily: sansBold, fontSize: 14, color: c.cobalt900 }} numberOfLines={1}>{num(Number(v))}<Text style={{ fontSize: 10, color: c.ink500 }}>/{num(Number(tot))}{u}</Text></Text>
                <View style={{ height: 5, borderRadius: 3, backgroundColor: "#EEE9DC", overflow: "hidden" }}><View style={{ width: `${pct * 100}%`, height: 5, backgroundColor: pct >= 0.95 ? c.mint500 : c.cobalt600 }} /></View>
              </View>
            );
          })}
        </View>
        {k.heldPallets > 0 && <Text style={{ color: c.pending, fontSize: 12, fontWeight: "700" }}>{k.heldPallets} palet bloke (onay bekliyor)</Text>}
        <Segmented value={tab} onChange={setTab} options={[{ value: "req", label: `Talepler ${pending.length}` }, { value: "ok", label: `Onaylı yükler ${others.length}` }]} />
        {tab === "req" && pending.length === 0 && <Empty title="Bekleyen talep yok" />}
        {tab === "req" && pending.map((r) => (
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
        {tab === "ok" && others.length === 0 && <Empty title="Henüz onaylı yük yok" />}
        {tab === "ok" && others.map((r) => (
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
          <ChipSelect small value={REJECT_REASONS.includes(reason) ? reason : null} onChange={setReason} options={REJECT_REASONS.map((x) => ({ value: x, label: x }))} />
          <Field label="Gerekçe (seçin veya yazın)" value={reason} onChangeText={setReason} placeholder="Örn. kapasite yetersiz" />
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
const WH_STATES = ["ONAYLI", "INCELEME", "DEPO_KABUL", "YUKLENDI", "VARISTA", "TESLIM", "EKSIK_HASAR", "GELMEDI"];
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
  const [meas, setMeas] = useState<CarrierReservation>();
  const [rev, setRev] = useState<CarrierReservation>();
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
      setNote(undefined); setNoteTxt(""); setPod(undefined); setMeas(undefined);
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
    setScanned({ code });
    if (!find(code)) void trips.reload(true).then(() => undefined); // liste eski olabilir (yeni onaylanan yük): tazele
  };
  const hit = scanned ? find(scanned.code) : undefined; // liste tazelendikçe yeniden eşleşir
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
        {nx && !pend && <Btn title={nx.label} loading={busy === r.id + nx.type} onPress={() => (nx.type === "TESLIM" ? setPod(r) : nx.type === "DEPO_KABUL" ? setMeas(r) : fire(r, nx.type))} style={{ minHeight: 60 }} />}
        {r.status === "INCELEME" && <Btn title="Ölçüm farkını incele" onPress={() => setRev(r)} style={{ minHeight: 60 }} />}
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
      {meas && <MeasureSheet r={meas} busy={busy === meas.id + "DEPO_KABUL"} onClose={() => setMeas(undefined)} onSubmit={(measurement) => fire(meas, "DEPO_KABUL", { measurement })} />}
      {rev && <ReviewSheet r={rev} onClose={() => setRev(undefined)} onDone={(msg) => { toast(msg); setRev(undefined); void trips.reload(true); }} />}
      {pod && <PodSheet r={all.find((x) => x.id === pod.id) ?? pod} busy={busy === pod.id + "TESLIM"} onClose={() => setPod(undefined)} onSubmit={(recipientName, podKeys, pickupCode) => fire(pod, "TESLIM", { recipientName, podKeys, pickupCode })} />}
      {scanning && <Scanner onCode={onCode} onClose={() => setScanning(false)} />}
    </View>
  );
}
