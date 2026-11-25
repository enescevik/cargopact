import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { api, ApiError, uuid } from "../api";
import { c, serif } from "../theme";
import { dt, money, num } from "../format";
import { CutoffChips, RouteHead, TripSummary } from "../common";
import { BackBar, Badge, Btn, Card, Chip, Divider, Empty, ErrorBox, Field, KV, Label, Row, Screen, Skeletons, StickyBar, Title, useLoad, useToast } from "../ui";
import type { Quote, Reservation, TripCard } from "../types";

type PC = { code: string; name: string };

export function Send({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [trip, setTrip] = useState<TripCard>();
  const [pallets, setPallets] = useState("3");
  const [kg, setKg] = useState("1500");
  const [m3, setM3] = useState("");
  const [pc, setPc] = useState("GENEL");
  const [quote, setQuote] = useState<Quote>();
  const [done, setDone] = useState<Reservation>();

  if (step === 4 && done) return <Success r={done} onDone={onDone} />;

  if (step === 1) {
    return <Search pallets={pallets} setPallets={setPallets} onPick={(t) => { setTrip(t); setStep(2); }} />;
  }
  if (step === 2 && trip) {
    return (
      <LoadStep trip={trip} pallets={pallets} setPallets={setPallets} kg={kg} setKg={setKg} m3={m3} setM3={setM3} pc={pc} setPc={setPc}
        onBack={() => setStep(1)} onNext={(q) => { setQuote(q); setStep(3); }} />
    );
  }
  if (step === 3 && trip && quote) {
    return (
      <OfferStep trip={trip} quote={quote} body={{ pallets: Number(pallets), grossKg: Number(kg), volumeM3: m3 ? Number(m3) : undefined, productClassCode: pc }}
        onBack={() => setStep(2)} onDone={(r) => { setDone(r); setStep(4); }} />
    );
  }
  return null;
}

function Steps({ n }: { n: number }) {
  return (
    <Row gap={6}>
      {["Sefer", "Yük", "Teklif"].map((l, i) => (
        <View key={l} style={{ flex: 1, gap: 4 }}>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: i < n ? c.cobalt600 : c.line }} />
          <Text style={{ fontSize: 11, fontWeight: "700", color: i < n ? c.cobalt700 : c.ink300 }}>{i + 1}. {l}</Text>
        </View>
      ))}
    </Row>
  );
}

function Search({ pallets, setPallets, onPick }: { pallets: string; setPallets: (v: string) => void; onPick: (t: TripCard) => void }) {
  const [o, setO] = useState("");
  const [d, setD] = useState("");
  const [date, setDate] = useState("");
  const [q, setQ] = useState({ o: "", d: "", date: "", p: "" });
  const { data, error, loading, reload } = useLoad(() => {
    const p = new URLSearchParams();
    if (q.o.trim()) p.set("originCity", q.o.trim());
    if (q.d.trim()) p.set("destinationCity", q.d.trim());
    if (/^\d{4}-\d{2}-\d{2}$/.test(q.date)) p.set("date", q.date);
    if (Number(q.p) > 0) p.set("pallets", q.p);
    return api<{ items: TripCard[] }>("GET", `/customer/trips?${p}`);
  }, [q]);
  return (
    <Screen>
      <Steps n={1} />
      <Title sub="Rotanıza uygun, boş palet yeri olan seferleri bulun.">Sefer ara</Title>
      <Card>
        <Row><Field label="Çıkış şehri" value={o} onChangeText={setO} placeholder="Gebze" /><Field label="Varış şehri" value={d} onChangeText={setD} placeholder="Ankara" /></Row>
        <Row>
          <Field label="Tarih (YYYY-AA-GG)" value={date} onChangeText={setDate} placeholder="2026-11-26" autoCapitalize="none" />
          <Field label="Palet" value={pallets} onChangeText={setPallets} keyboardType="number-pad" />
        </Row>
        <Btn title="Sefer ara" onPress={() => setQ({ o, d, date, p: pallets })} />
      </Card>
      {loading ? <Skeletons n={3} h={150} /> : error ? <ErrorBox message={error} onRetry={() => reload()} /> :
        !data?.items.length ? <Empty title="Uygun sefer bulunamadı" text="Şehir veya tarih filtresini değiştirmeyi deneyin." /> :
          data.items.map((t) => <TripSummary key={t.id} trip={t} onPress={() => onPick(t)} />)}
    </Screen>
  );
}

function LoadStep(p: {
  trip: TripCard; pallets: string; setPallets: (v: string) => void; kg: string; setKg: (v: string) => void; m3: string; setM3: (v: string) => void;
  pc: string; setPc: (v: string) => void; onBack: () => void; onNext: (q: Quote) => void;
}) {
  const classes = useLoad(() => api<{ items: PC[] }>("GET", "/catalog/product-classes"), []);
  const [quote, setQuote] = useState<Quote>();
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  const pal = Number(p.pallets), kgN = Number(p.kg);
  const valid = pal > 0 && kgN > 0;

  useEffect(() => {
    if (!valid) { setQuote(undefined); return; }
    let alive = true;
    setBusy(true);
    const h = setTimeout(async () => {
      try {
        const r = await api<Quote>("POST", `/customer/trips/${p.trip.id}/quote`, {
          pallets: pal, grossKg: kgN, volumeM3: p.m3 ? Number(p.m3) : undefined, productClassCode: p.pc,
        });
        if (alive) { setQuote(r); setErr(undefined); }
      } catch (e) { if (alive) { setErr((e as Error).message); setQuote(undefined); } }
      finally { if (alive) setBusy(false); }
    }, 450);
    return () => { alive = false; clearTimeout(h); };
  }, [p.trip.id, pal, kgN, p.m3, p.pc, valid]);

  const items = classes.data?.items ?? [];
  return (
    <View style={{ flex: 1 }}>
      <BackBar title="Seferler" onBack={p.onBack} />
      <Screen>
        <Steps n={2} />
        <RouteHead trip={p.trip} size={28} />
        <Title sub="Yükünüzü beyan edin. Teklif anlık hesaplanır.">Yük bilgisi</Title>
        <Card>
          <Row><Field label="Palet" value={p.pallets} onChangeText={p.setPallets} keyboardType="number-pad" />
            <Field label="Brüt kg" value={p.kg} onChangeText={p.setKg} keyboardType="number-pad" />
            <Field label="m³ (ops.)" value={p.m3} onChangeText={p.setM3} keyboardType="decimal-pad" /></Row>
          <Label>Ürün sınıfı</Label>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(items.length ? items : [{ code: "GENEL", name: "Genel" }]).map((i) => (
              <Chip key={i.code} label={i.name} active={p.pc === i.code} onPress={() => p.setPc(i.code)} />
            ))}
          </View>
        </Card>
        <Card style={{ gap: 12 }}>
          <Row style={{ justifyContent: "space-between" }}><Label>Anlık uygunluk</Label>{busy && <Text style={{ color: c.ink500, fontSize: 12 }}>hesaplanıyor…</Text>}</Row>
          {!valid ? <Text style={{ color: c.ink500 }}>Palet ve kg girin.</Text> : err ? <Text style={{ color: c.danger }}>{err}</Text> : !quote ? <Skeletons n={1} h={60} /> : (
            <>
              <Badge label={quote.eligible ? "Bu sefer yükünüze uygun" : "Bu yük bu sefere uygun değil"} tone={quote.eligible ? "success" : "danger"} />
              {quote.reasons.map((r, i) => (
                <Text key={i} style={{ color: quote.eligible ? c.ink500 : c.danger, fontSize: 14 }}>• {r.message}</Text>
              ))}
              <Divider />
              <KV k="Toplam fiyat" v={money(quote.price.totalPriceMinor)} bold />
              <KV k="Palet başı" v={money(quote.price.unitPriceMinor)} />
            </>
          )}
        </Card>
      </Screen>
      <StickyBar>
        <Btn title="Teklifi gör" disabled={!quote?.eligible} onPress={() => quote && p.onNext(quote)} />
      </StickyBar>
    </View>
  );
}

function OfferStep({ trip, quote, body, onBack, onDone }: {
  trip: TripCard; quote: Quote; body: { pallets: number; grossKg: number; volumeM3?: number; productClassCode: string };
  onBack: () => void; onDone: (r: Reservation) => void;
}) {
  const toast = useToast();
  const [plan, setPlan] = useState<"full" | "deposit">("full");
  const [why, setWhy] = useState(false);
  const [holder, setHolder] = useState("ANADOLU PARSIYEL");
  const [number, setNumber] = useState("4000 0566 5566 5556");
  const [expiry, setExpiry] = useState("09/28");
  const [cvc, setCvc] = useState("314");
  const [recipient, setRecipient] = useState("");
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(uuid);
  const pp = quote.paymentPlans.find((x) => x.code === plan);
  const b = quote.price.breakdown;

  const submit = async () => {
    setBusy(true);
    try {
      const r = await api<Reservation>("POST", "/customer/reservations", {
        tripId: trip.id, ...body, paymentPlan: plan, recipientName: recipient.trim() || undefined,
        card: { holder, number: number.replace(/\s/g, ""), expiry, cvc },
      }, key);
      toast("Teklifiniz taşıyıcıya iletildi");
      onDone(r);
    } catch (e) {
      const er = e as ApiError;
      setKey(uuid()); // başarısız denemeden sonra yeni eylem (kart/plan değişmiş olabilir)
      toast(er.reason === "PAYMENT_DECLINED" ? "Kart reddedildi. Başka bir kart deneyin." : er.message, "err");
    } finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1 }}>
      <BackBar title="Yük bilgisi" onBack={onBack} />
      <Screen>
        <Steps n={3} />
        <RouteHead trip={trip} size={28} />
        <CutoffChips trip={trip} />
        <Card>
          <Label>Fiyat</Label>
          <Text style={{ fontSize: 34, fontWeight: "800", color: c.ink900 }}>{money(quote.price.totalPriceMinor)}</Text>
          <Text style={{ color: c.ink500 }}>{body.pallets} palet × {money(quote.price.unitPriceMinor)} · {num(body.grossKg)} kg</Text>
          <Btn kind="ghost" small title={why ? "Fiyat neden böyle? ▲" : "Fiyat neden böyle? ▼"} onPress={() => setWhy(!why)} style={{ alignSelf: "flex-start", paddingHorizontal: 0 }} />
          {why && (
            <View style={{ gap: 6, backgroundColor: c.cobalt50, padding: 12, borderRadius: 12 }}>
              <KV k="Taban fiyat (palet)" v={money(b.basePriceMinor)} />
              <KV k="Doluluk" v={`%${Math.round(b.utilization * 100)}`} />
              <KV k="Talep katsayısı" v={`× ${b.demandMultiplier}`} />
              <KV k="T−3'e kalan süre" v={`${Math.round(b.hoursToCutoff * 10) / 10} saat`} />
              <KV k="Zaman katsayısı" v={`× ${b.timeMultiplier}${b.timeDecayApplied ? " (indirim)" : ""}`} />
              {b.clampedTo && <KV k="Sınır" v={b.clampedTo === "floor" ? "Alt sınıra çekildi" : "Üst sınıra çekildi"} />}
              {b.explanation.map((e, i) => <Text key={i} style={{ color: c.ink700, fontSize: 13 }}>• {e}</Text>)}
              <Text style={{ color: c.ink500, fontSize: 12 }}>Fiyat sunucuda hesaplanır; teklif süresince sabittir.</Text>
            </View>
          )}
        </Card>
        <Card>
          <Label>Ödeme planı</Label>
          {quote.paymentPlans.map((pl) => (
            <Card key={pl.code} onPress={() => setPlan(pl.code)} style={{ borderColor: plan === pl.code ? c.cobalt600 : c.line, borderWidth: plan === pl.code ? 2 : 1, backgroundColor: plan === pl.code ? c.cobalt50 : c.surface, shadowOpacity: 0 }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Text style={{ fontWeight: "700", color: c.ink900, flex: 1 }}>{pl.label}</Text>
                <Text style={{ fontWeight: "800", color: c.cobalt700 }}>{money(pl.dueNowMinor)}</Text>
              </Row>
              {pl.code === "deposit" && pl.remainingMinor != null && <Text style={{ color: c.ink500, fontSize: 13 }}>Kalan {money(pl.remainingMinor)} kalkıştan önce</Text>}
            </Card>
          ))}
        </Card>
        <Card>
          <Row style={{ justifyContent: "space-between" }}><Label>Kart (simüle)</Label><Badge label="Demo ödeme" tone="info" /></Row>
          <Field label="Kart sahibi" value={holder} onChangeText={setHolder} autoCapitalize="characters" />
          <Field label="Kart numarası" value={number} onChangeText={setNumber} keyboardType="number-pad" />
          <Row><Field label="SKT" value={expiry} onChangeText={setExpiry} /><Field label="CVC" value={cvc} onChangeText={setCvc} keyboardType="number-pad" /></Row>
          <Field label="Yetkili alıcı (ops.)" value={recipient} onChangeText={setRecipient} placeholder="Teslim alacak kişi" />
        </Card>
        <Card>
          <Label>İptal koşulları</Label>
          {quote.cancellationPolicy.map((x, i) => <KV key={i} k={x.label} v={`%${x.refundPercent} iade`} />)}
          <Text style={{ color: c.ink500, fontSize: 12 }}>Teklif geçerlilik: {dt(quote.quoteExpiresAt)}</Text>
        </Card>
      </Screen>
      <StickyBar>
        <Row style={{ justifyContent: "space-between" }}>
          <View><Text style={{ fontSize: 12, color: c.ink500 }}>Şimdi ödenecek</Text><Text style={{ fontSize: 22, fontWeight: "800", color: c.ink900 }}>{money(pp?.dueNowMinor ?? quote.price.totalPriceMinor)}</Text></View>
          <Text style={{ color: c.ink500, fontSize: 12 }}>Toplam {money(quote.price.totalPriceMinor)}</Text>
        </Row>
        <Btn kind="mint" title="Teklifi kabul et" loading={busy} onPress={submit} />
      </StickyBar>
    </View>
  );
}

function Success({ r, onDone }: { r: Reservation; onDone: () => void }) {
  return (
    <Screen>
      <View style={{ alignItems: "center", gap: 10, paddingTop: 24 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.mint100, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 34, color: c.mint600 }}>✓</Text>
        </View>
        <Text style={{ fontFamily: serif, fontSize: 28, color: c.ink900, textAlign: "center" }}>Teklifiniz iletildi</Text>
        <Text style={{ color: c.ink500, textAlign: "center" }}>Taşıyıcı onayladığında sipariş numaranız oluşur ve palet kodlarınız hazır olur.</Text>
      </View>
      <Card>
        <KV k="Başvuru no" v={r.reference} bold />
        <KV k="Durum" v={r.statusLabel} />
        <KV k="Güzergâh" v={`${r.trip.origin.city} → ${r.trip.destination.city}`} />
        <KV k="Tutar" v={money(r.totalPriceMinor)} />
      </Card>
      <Btn title="Rezervasyonlarıma git" onPress={onDone} />
    </Screen>
  );
}
