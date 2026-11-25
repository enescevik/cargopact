import { useState } from "react";
import { Text, View } from "react-native";
import { api } from "../api";
import { c, mono, serif } from "../theme";
import { dt, money, place } from "../format";
import { RouteHead, WarehouseGuide } from "../common";
import { BackBar, Btn, Card, Chip, Divider, Empty, ErrorBox, Field, KV, Label, Row, Screen, Sheet, Skeletons, StatusBadge, Timeline, Title, useLoad, useToast } from "../ui";
import type { Recipient, Reservation, Tracking } from "../types";
import { QrTile } from "../qr";
import { CarbonBadge, customerCells, Eyebrow, Segmented, TruckMap, WalletCard } from "../premium";
import { CarbonCard, ContractViewer } from "../contract";

export function Reservations() {
  const [sel, setSel] = useState<string>();
  const [seg, setSeg] = useState<keyof typeof GROUPS>("active");
  const list = useLoad(() => api<{ items: Reservation[] }>("GET", "/customer/reservations"), [], 8000);
  const summary = useLoad(() => api<{ allocatedKg: number; declaredSavedKg: number; reservations: number }>("GET", "/customer/carbon/summary").catch(() => null), []);
  if (sel) {
    const r = list.data?.items.find((x) => x.id === sel);
    return <Detail id={sel} initial={r} onBack={() => { setSel(undefined); void list.reload(true); }} />;
  }
  const items = (list.data?.items ?? []).filter((r) => GROUPS[seg].includes(r.status));
  const count = (k: keyof typeof GROUPS) => (list.data?.items ?? []).filter((r) => GROUPS[k].includes(r.status)).length;
  return (
    <Screen>
      <Title sub="Teklifleriniz, siparişleriniz ve teslim kartlarınız.">Yüklerim</Title>
      <Segmented value={seg} onChange={setSeg} options={[{ value: "active", label: `Aktif ${count("active")}` }, { value: "pending", label: `Onay bekliyor ${count("pending")}` }, { value: "past", label: `Geçmiş ${count("past")}` }]} />
      {summary.data && summary.data.reservations > 0 && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: c.mint100, borderWidth: 1, borderColor: c.mint200 }}>
          <Text style={{ fontSize: 14 }}>🌿</Text>
          <Text style={{ flex: 1, color: c.ink900, fontSize: 12, fontWeight: "700" }} numberOfLines={2}>
            {summary.data.reservations} yükte ≈ {Math.round(summary.data.allocatedKg * 10) / 10} kg CO₂e{summary.data.declaredSavedKg > 0 ? ` · alternatifinize göre ≈ ${Math.round(summary.data.declaredSavedKg * 10) / 10} kg daha az` : ""}
          </Text>
          <Text style={{ color: c.ink500, fontSize: 10 }}>tahmini</Text>
        </View>
      )}
      {list.loading && !list.data ? <Skeletons n={3} h={110} /> : list.error && !list.data ? <ErrorBox message={list.error} onRetry={() => list.reload()} /> :
        !items.length ? <Empty title="Bu grupta yük yok" text="“Gönder” sekmesinden bir sefer seçin." /> :
          items.map((r) => (
            <Card key={r.id} onPress={() => setSel(r.id)}>
              <Row style={{ justifyContent: "space-between" }}>
                <Text style={{ fontFamily: mono, fontSize: 13, color: c.ink500 }}>{r.orderNumber ?? r.reference}</Text>
                <StatusBadge status={r.status} label={r.statusLabel} />
              </Row>
              <RouteHead trip={r.trip} size={22} />
              <Row style={{ justifyContent: "space-between" }}>
                <Text style={{ color: c.ink500, fontSize: 13 }}>{r.pallets} palet · {dt(r.trip.departureAt)}</Text>
                <Text style={{ fontWeight: "800", color: c.ink900 }}>{money(r.totalPriceMinor)}</Text>
              </Row>
            </Card>
          ))}
    </Screen>
  );
}

const GROUPS = {
  active: ["ONAYLI", "INCELEME", "DEPO_KABUL", "YUKLENDI", "VARISTA", "EKSIK_HASAR"],
  pending: ["TASIYICI_ONAYI_BEKLIYOR"],
  past: ["TESLIM", "RET", "IPTAL", "SURESI_DOLDU", "GELMEDI", "RET_DEPO"],
};
const FLOW = ["TASIYICI_ONAYI_BEKLIYOR", "ONAYLI", "DEPO_KABUL", "YUKLENDI", "VARISTA", "TESLIM"];
const FLOW_LABEL: Record<string, string> = {
  TASIYICI_ONAYI_BEKLIYOR: "Taşıyıcı onayı bekliyor", ONAYLI: "Onaylandı", DEPO_KABUL: "Çıkış deposunda kabul edildi",
  YUKLENDI: "Araca yüklendi", VARISTA: "Varışta teslime hazır", TESLIM: "Teslim edildi",
};

/** Teslim kodu + yetkili alıcılar (müşteri). Kod yalnız müşteri yanıtında gelir. */
function PickupCard({ r, onSaved }: { r: Reservation; onSaved: (r: Reservation) => void }) {
  const toast = useToast();
  const [list, setList] = useState<Recipient[]>(r.pickup?.recipients ?? []);
  const [busy, setBusy] = useState(false);
  if (["RET", "IPTAL", "SURESI_DOLDU", "GELMEDI"].includes(r.status)) return null;
  const editable = r.status !== "TESLIM";
  const set = (i: number, p: Partial<Recipient>) => setList((l) => l.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const save = async () => {
    setBusy(true);
    try {
      const clean = list.map((x) => ({ name: x.name.trim(), ...(x.phone?.trim() ? { phone: x.phone.trim() } : {}) })).filter((x) => x.name);
      onSaved(await api<Reservation>("PUT", `/customer/reservations/${r.id}/recipients`, { recipients: clean }));
      toast("Yetkili alıcılar kaydedildi");
    } catch (e) { toast((e as Error).message, "err"); } finally { setBusy(false); }
  };
  return (
    <Card style={{ gap: 10 }}>
      <Label>Teslim kodu</Label>
      {r.pickup?.code ? (
        <>
          <Text style={{ fontFamily: mono, fontSize: 34, letterSpacing: 6, fontWeight: "800", color: c.ink900 }}>{r.pickup.code}</Text>
          <Text style={{ color: c.ink500, fontSize: 12 }}>Varış merkezinde yetkili alıcı bu kodu söylemelidir. Yalnız yetkili alıcıyla paylaşın.</Text>
        </>
      ) : <Text style={{ color: c.ink500 }}>{r.status === "TESLIM" ? "Teslim tamamlandı." : "Kod taşıyıcı onayından sonra görünür."}</Text>}
      {r.pickup?.locked && <Text style={{ color: c.warning, fontWeight: "700" }}>Çok sayıda hatalı deneme: teslim kilitlendi. Taşıyıcıyla iletişime geçin.</Text>}
      <Label>Yetkili alıcılar (en çok 3)</Label>
      {list.length === 0 && <Text style={{ color: c.ink500 }}>Henüz yetkili alıcı yok; alıcı eklemeden teslim yapılamaz.</Text>}
      {list.map((x, i) => (
        <View key={i} style={{ gap: 6 }}>
          <Field label={`Alıcı ${i + 1}`} value={x.name} editable={editable} onChangeText={(t) => set(i, { name: t })} placeholder="Ad Soyad" />
          <Field label="Telefon (ops.)" value={x.phone ?? ""} editable={editable} onChangeText={(t) => set(i, { phone: t })} keyboardType="phone-pad" />
          {editable && <Btn kind="ghost" small title="Alıcıyı sil" onPress={() => setList((l) => l.filter((_, j) => j !== i))} />}
        </View>
      ))}
      {editable && (
        <>
          {list.length < 3 && <Btn kind="outline" small title="Alıcı ekle" onPress={() => setList((l) => [...l, { name: "" }])} />}
          <Btn title="Alıcıları kaydet" loading={busy} onPress={save} />
        </>
      )}
    </Card>
  );
}
function Detail({ id, initial, onBack }: { id: string; initial?: Reservation; onBack: () => void }) {
  const toast = useToast();
  const { data, error, reload, setData } = useLoad(() => api<Reservation>("GET", `/customer/reservations/${id}`), [id], 6000);
  const r = data ?? initial;
  const [cancelOpen, setCancelOpen] = useState(false);
  const [preview, setPreview] = useState<{ refundMinor: number; feeMinor: number; rule: string }>();
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");

  const openCancel = async () => {
    setCancelOpen(true); setPreview(undefined);
    try { setPreview(await api("GET", `/customer/reservations/${id}/cancel-preview`)); }
    catch (e) { toast((e as Error).message, "err"); setCancelOpen(false); }
  };
  const doCancel = async () => {
    setBusy(true);
    try {
      setData(await api<Reservation>("POST", `/customer/reservations/${id}/cancel`, { reason: reason.trim() || undefined }));
      toast("Rezervasyon iptal edildi"); setCancelOpen(false);
    } catch (e) { toast((e as Error).message, "err"); } finally { setBusy(false); }
  };

  if (!r) return <View style={{ flex: 1 }}><BackBar title="Geri" onBack={onBack} /><Screen>{error ? <ErrorBox message={error} onRetry={() => reload()} /> : <Skeletons n={3} h={120} />}</Screen></View>;

  const idx = FLOW.indexOf(r.status);
  const failed = idx < 0;
  const stamp = (t: string) => r.events.find((e) => e.type === t)?.at;
  const steps = failed
    ? [{ label: "Teklif verildi", done: true, at: dt(r.createdAt) }, { label: r.statusLabel, done: true, at: r.decisionReason ?? undefined }]
    : FLOW.map((st, i) => ({ label: FLOW_LABEL[st], done: i <= idx, at: stamp(st) ? dt(stamp(st)) : i === 0 ? dt(r.createdAt) : undefined }));
  const cancellable = ["TASIYICI_ONAYI_BEKLIYOR", "ONAYLI"].includes(r.status);

  return (
    <View style={{ flex: 1 }}>
      <BackBar title="Rezervasyonlarım" onBack={onBack} />
      <Screen>
        <Row style={{ justifyContent: "space-between" }}>
          <Text style={{ fontFamily: mono, fontSize: 14, color: c.ink700 }}>{r.orderNumber ?? r.reference}</Text>
          <StatusBadge status={r.status} label={r.statusLabel} />
        </Row>
        <RouteHead trip={r.trip} size={30} />
        {r.orderNumber && !["RET", "IPTAL", "SURESI_DOLDU", "GELMEDI"].includes(r.status) && (
          <WalletCard orderNumber={r.orderNumber} trip={r.trip} pallets={r.pallets} code={r.pickup?.code}
            recipients={(r.pickup?.recipients ?? []).map((x) => x.name).filter(Boolean)} />
        )}
        <Card style={{ gap: 12 }}>
          <Eyebrow>Araçtaki yeriniz</Eyebrow>
          <TruckMap positions={r.trip.vehicleType.palletPositions} cells={customerCells(r.trip.vehicleType.palletPositions, r.trip.sellable.pallets, Math.min(r.trip.sellable.pallets, r.trip.remaining.pallets + r.pallets), r.pallets)} />
          <CarbonBadge from={r.trip.origin} to={r.trip.destination} pallets={r.pallets} positions={r.trip.vehicleType.palletPositions} />
        </Card>
        <Card>
          <KV k="Kalkış" v={dt(r.trip.departureAt)} />
          <KV k="Yük" v={`${r.pallets} palet · ${r.grossKg} kg · ${r.productClass.name}`} />
          {r.measurement && <KV k="Depo ölçümü" v={`Beyan ${r.measurement.declared.pallets} palet / ${r.measurement.declared.kg} kg · ölçülen ${r.measurement.measured.pallets} palet / ${r.measurement.measured.kg} kg · ${({ ok: "kabul", review: "inceleniyor", partial: "kısmi kabul", rejected: "reddedildi" } as Record<string, string>)[r.measurement.outcome]}`} />}
          <KV k="Tutar" v={money(r.totalPriceMinor)} bold />
          {r.status === "TASIYICI_ONAYI_BEKLIYOR" && r.holdExpiresAt && <KV k="Blokaj bitişi" v={dt(r.holdExpiresAt)} />}
          {!!r.decisionReason && <KV k="Taşıyıcı notu" v={r.decisionReason} />}
        </Card>
        <Card><Label>Durum</Label><Timeline steps={steps} /></Card>
        <ContractCard r={r} />
        <CarbonCard carbon={r.carbon} />
        <PickupCard key={r.id + (r.pickup?.code ?? "")} r={r} onSaved={setData} />
        {["TASIYICI_ONAYI_BEKLIYOR", "ONAYLI", "DEPO_KABUL"].includes(r.status) && (
          <WarehouseGuide title="Depoya nasıl giderim?" facility={r.trip.origin} intakeCutoffAt={r.trip.intakeCutoffAt} />
        )}
        {r.status === "VARISTA" && <WarehouseGuide title="Teslim alma adresi" facility={r.trip.destination} />}
        <Card style={{ gap: 12 }}>
          <Label>Palet kodları</Label>
          {r.orderNumber && (
            <View style={{ flexDirection: "row", gap: 12, alignItems: "center", padding: 10, borderRadius: 12, backgroundColor: c.cobalt50, borderWidth: 1, borderColor: c.line }}>
              <QrTile value={r.orderNumber} caption="Sipariş QR" size={84} />
              <View style={{ flex: 1 }}><Text style={{ fontSize: 11, color: c.ink500 }}>Sipariş no</Text><Text style={{ fontFamily: mono, fontSize: 14, fontWeight: "700", color: c.ink900 }}>{r.orderNumber}</Text></View>
            </View>
          )}
          {r.palletCodes.length === 0 ? <Text style={{ color: c.ink500 }}>Kodlar taşıyıcı onayından sonra oluşur.</Text> :
            r.palletCodes.map((code) => (
              <View key={code} style={{ flexDirection: "row", gap: 12, alignItems: "center", padding: 10, borderRadius: 12, backgroundColor: c.porcelain, borderWidth: 1, borderColor: c.line }}>
                <QrTile value={code} caption="Palet QR" size={84} />
                <Text style={{ fontFamily: mono, fontSize: 14, fontWeight: "700", color: c.ink900, flex: 1 }}>{code}</Text>
              </View>
            ))}
        </Card>
        <Card>
          <Label>Ödeme</Label>
          <KV k="Durum" v={payLabel(r.payment.status)} />
          <KV k="Ödenen" v={money(r.payment.paidMinor)} />
          {r.payment.refundedMinor > 0 && <KV k="İade" v={money(r.payment.refundedMinor)} />}
          {r.payment.retainedMinor > 0 && <KV k="Kesinti" v={money(r.payment.retainedMinor)} />}
          {r.payment.dueMinor > 0 && <KV k="Kalan" v={money(r.payment.dueMinor)} />}
          {r.payment.entries.length > 0 && <Divider />}
          {r.payment.entries.map((e, i) => (
            <Row key={i} style={{ justifyContent: "space-between" }}>
              <Text style={{ fontSize: 12, color: c.ink500, flex: 1 }}>{e.type} · {dt(e.at)}</Text>
              <Text style={{ fontSize: 13, fontWeight: "700", color: c.ink900 }}>{money(e.amountMinor)}</Text>
            </Row>
          ))}
        </Card>
        {cancellable && <Btn kind="outline" title="Rezervasyonu iptal et" onPress={openCancel} />}
      </Screen>
      {cancelOpen && (
        <Sheet onClose={() => setCancelOpen(false)}>
          <Text style={{ fontFamily: serif, fontSize: 24, color: c.ink900 }}>İptal önizlemesi</Text>
          {!preview ? <Skeletons n={1} h={80} /> : (
            <Card>
              <KV k="İade edilecek" v={money(preview.refundMinor)} bold />
              <KV k="İptal ücreti" v={money(preview.feeMinor)} />
              <Text style={{ color: c.ink500, fontSize: 13 }}>{preview.rule}</Text>
            </Card>
          )}
          <Field label="Neden (ops.)" value={reason} onChangeText={setReason} />
          <Btn kind="danger" title="İptali onayla" loading={busy} disabled={!preview} onPress={doCancel} />
          <Btn kind="ghost" title="Vazgeç" onPress={() => setCancelOpen(false)} />
        </Sheet>
      )}
    </View>
  );
}

function ContractCard({ r }: { r: Reservation }) {
  const [open, setOpen] = useState(false);
  const k = r.contract;
  return (
    <Card style={{ gap: 6 }}>
      <Label>Sözleşme</Label>
      {!k ? <Text style={{ color: c.ink500 }}>Sözleşme kaydı yok.</Text> : (
        <>
          <Text style={{ color: c.success, fontWeight: "800" }}>Sözleşme ✓ {k.version}</Text>
          <KV k="İmzalayan" v={k.signerName} />
          <KV k="Kabul zamanı" v={dt(k.acceptedAt)} />
          <KV k="Özet (hash)" v={k.renderedHash.slice(0, 12)} />
          <Btn kind="outline" small title="Görüntüle" onPress={() => setOpen(true)} />
        </>
      )}
      {open && <ContractViewer path={`/customer/reservations/${r.id}/contract`} onClose={() => setOpen(false)} />}
    </Card>
  );
}
function payLabel(s: string) {
  return ({ authorized: "Provizyon alındı", captured: "Tahsil edildi", partially_captured: "Kısmen tahsil edildi", refunded: "İade edildi", released: "Provizyon serbest", failed: "Başarısız" } as Record<string, string>)[s] ?? s;
}

export function TrackingScreen({ initial }: { initial?: string }) {
  const [no, setNo] = useState(initial ?? "");
  const [res, setRes] = useState<Tracking>();
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  const mine = useLoad(() => api<{ items: Reservation[] }>("GET", "/customer/reservations"), []);
  const orders = (mine.data?.items ?? []).filter((x) => x.orderNumber).map((x) => x.orderNumber as string);
  const search = async (override?: string) => {
    const n = (typeof override === "string" ? override : no).trim().toUpperCase();
    if (!n) return;
    setBusy(true); setErr(undefined);
    try { setRes(await api<Tracking>("GET", `/customer/orders/${encodeURIComponent(n)}/tracking`)); }
    catch (e) { setRes(undefined); setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Screen>
      <Title sub="Sipariş numaranızla yükünüzün nerede olduğunu görün.">Takip</Title>
      <Card>
        <Field label="Sipariş no" value={no} onChangeText={setNo} placeholder="CP-2026-000123" autoCapitalize="characters" onSubmitEditing={() => search()} />
        {orders.length > 0 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {orders.map((o) => <Chip key={o} label={o} onPress={() => { setNo(o); void search(o); }} />)}
          </View>
        )}
        <Btn title="Sorgula" loading={busy} onPress={() => search()} />
      </Card>
      {err && <ErrorBox message={err} />}
      {res && (
        <>
          <Card>
            <Row style={{ justifyContent: "space-between" }}>
              <Text style={{ fontFamily: mono, color: c.ink700 }}>{res.orderNumber}</Text>
              <StatusBadge status={res.status} label={res.statusLabel} />
            </Row>
            <Text style={{ fontFamily: serif, fontSize: 24, color: c.ink900 }}>{place(res.origin)} → {place(res.destination)}</Text>
            <Text style={{ color: c.ink500, fontSize: 13 }}>Son güncelleme {dt(res.updatedAt)}</Text>
            <View style={{ backgroundColor: c.mint100, padding: 12, borderRadius: 12 }}><Text style={{ color: c.ink900, fontWeight: "600" }}>Sıradaki adım: {res.nextStep}</Text></View>
          </Card>
          <Card><Timeline steps={res.steps.map((s) => ({ label: s.label, done: s.done, at: s.at ? dt(s.at) : undefined }))} /></Card>
          <Card>
            <KV k="Çıkış deposu son kabul" v={dt(res.intakeCutoffAt)} />
            {res.pickupWindow && <KV k="Varışta teslim penceresi" v={`${dt(res.pickupWindow.from)} – ${dt(res.pickupWindow.to)}`} />}
            <KV k="Varış deposu" v={res.destination.name} />
            {res.palletCodes.map((p) => <Text key={p} style={{ fontFamily: mono, color: c.ink700, fontSize: 13 }}>{p}</Text>)}
          </Card>
        </>
      )}
    </Screen>
  );
}
