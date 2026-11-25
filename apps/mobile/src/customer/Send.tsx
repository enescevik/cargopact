import { ReactNode, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api, ApiError, uuid } from "../api";
import { c, serif } from "../theme";
import { dt, hm, money, num, place } from "../format";
import { Btn, Card, ErrorBox, KV, Row, Screen, Skeletons, useLoad, useToast } from "../ui";
import {
  CarbonBadge, ChipSelect, CTA, Eyebrow, Noir, NoirKV, OptionCard, PriceCalendar, RouteTitle, Segmented, Stepper, TruckMap,
  customerCells, isoDay, today,
} from "../premium";
import { loadAlarms, loadRecipients, rememberRecipient, saveAlarms, type Alarm } from "../alarms";
import type { Quote, Reservation, TripCard } from "../types";

type PC = { code: string; name: string };
type Pk = { id: string; name: string; kind: string };
type Est = { totalVolumeM3: number; totalWeightKg: number; estimatedPallets: number; warnings: string[] };

const CARDS = [
  { id: "ok", label: "Kurumsal kart", last4: "5556", holder: "ANADOLU PARSIYEL", number: "4000056655665556", expiry: "09/28", cvc: "314", note: "Varsayılan" },
  { id: "decline", label: "Yedek kart", last4: "0002", holder: "ANADOLU PARSIYEL", number: "4000000000000002", expiry: "09/28", cvc: "314", note: "Demo: reddedilir" },
] as const;
const KG_PRESETS = [250, 500, 750, 1000];
const HEIGHTS = [{ v: 1.2, l: "≤ 120 cm" }, { v: 1.6, l: "≤ 160 cm" }, { v: 1.8, l: "≤ 180 cm" }];
const FOOT = { EUR: { l: "Euro 80×120", a: 0.96 }, IND: { l: "Endüstriyel 100×120", a: 1.2 } } as const;
const routeKey = (t: TripCard) => `${t.origin.city}|${t.destination.city}`;

export function Send({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const all = useLoad(() => api<{ items: TripCard[] }>("GET", "/customer/trips"), [], 30000);
  const trips = all.data?.items ?? [];
  const routes = useMemo(() => {
    const m = new Map<string, { key: string; from: string; to: string; n: number; min: number; space: number }>();
    for (const t of trips) {
      const k = routeKey(t), cur = m.get(k);
      if (cur) { cur.n++; cur.min = Math.min(cur.min, t.price.unitPriceMinor); cur.space = Math.max(cur.space, t.remaining.pallets); }
      else m.set(k, { key: k, from: place(t.origin), to: place(t.destination), n: 1, min: t.price.unitPriceMinor, space: t.remaining.pallets });
    }
    // En çok boş yeri olan rotalar önce: demo açılışında uygun teklif gelsin.
    return [...m.values()].sort((a, b) => b.space - a.space || b.n - a.n);
  }, [trips]);

  const [route, setRoute] = useState<string | null>(null);
  const [pallets, setPallets] = useState(3);
  const [start, setStart] = useState(today());
  const [day, setDay] = useState<string>("");
  const [tripId, setTripId] = useState<string | null>(null);
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [done, setDone] = useState<Reservation>();

  useEffect(() => { void loadAlarms().then(setAlarms); }, []);
  useEffect(() => { if (!route && routes[0]) setRoute(routes[0].key); }, [routes, route]);

  const onRoute = trips.filter((t) => routeKey(t) === route);
  // İlk uygun günü otomatik seç.
  useEffect(() => {
    if (!onRoute.length) return;
    if (day && onRoute.some((t) => isoDay(t.departureAt) === day)) return;
    const first = onRoute.filter((t) => t.remaining.pallets >= pallets).sort((a, b) => a.departureAt.localeCompare(b.departureAt))[0] ?? onRoute[0]!;
    const d = isoDay(first.departureAt);
    setDay(d); setStart(d < today() ? today() : d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, trips.length]);
  const dayTrips = onRoute.filter((t) => isoDay(t.departureAt) === day).sort((a, b) => a.departureAt.localeCompare(b.departureAt));
  useEffect(() => {
    if (!dayTrips.length) { setTripId(null); return; }
    if (!dayTrips.some((t) => t.id === tripId)) setTripId((dayTrips.find((t) => t.remaining.pallets >= pallets) ?? dayTrips[0]!).id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, route, trips.length]);
  const trip = dayTrips.find((t) => t.id === tripId);

  const r = routes.find((x) => x.key === route);
  const hits = alarms.filter((a) => trips.some((t) => `${t.origin.city}|${t.destination.city}` === `${a.origin}|${a.destination}` && isoDay(t.departureAt) >= a.from && isoDay(t.departureAt) <= a.to && t.remaining.pallets >= a.pallets));

  const addAlarm = async (d: string) => {
    if (!r) return;
    const [o, de] = r.key.split("|");
    const a: Alarm = { id: uuid(), origin: o!, destination: de!, from: d, to: d, pallets, createdAt: new Date().toISOString() };
    const next = [a, ...alarms].slice(0, 10);
    setAlarms(next); await saveAlarms(next);
    toast(`Alarm kuruldu: ${r.from} → ${r.to}, ${d} · ${pallets} palet yer açılınca haber vereceğiz`);
  };
  const clearAlarm = async (id: string) => { const next = alarms.filter((a) => a.id !== id); setAlarms(next); await saveAlarms(next); };

  if (done) return <Success r={done} onDone={onDone} onAgain={() => { setDone(undefined); void all.reload(true); }} />;

  return (
    <Screen>
      <Noir>
        <Eyebrow light>Palet gönder · tek ekran</Eyebrow>
        <Text style={{ fontFamily: serif, color: "#fff", fontSize: 28, lineHeight: 32 }}>Boş yeri seçin,{"\n"}fiyat anında gelsin.</Text>
        <Text style={{ color: "#B9C3EF", fontSize: 13 }}>Yazmadan, dokunarak: rota → gün → sefer → yük.</Text>
        <Row style={{ justifyContent: "space-between", marginTop: 4 }}>
          <Text style={{ color: "#fff", fontWeight: "700" }}>Kaç palet?</Text>
          <Stepper value={pallets} onChange={setPallets} min={1} max={33} unit=" palet" dark />
        </Row>
      </Noir>

      {hits.length > 0 && (
        <Pressable onPress={() => { const a = hits[0]!; setRoute(`${a.origin}|${a.destination}`); setDay(a.from); setStart(a.from); }}
          style={{ flexDirection: "row", gap: 8, alignItems: "center", padding: 12, borderRadius: 14, backgroundColor: c.mint100, borderWidth: 1, borderColor: c.mint200 }}>
          <Text style={{ fontSize: 16 }}>🔔</Text>
          <Text style={{ flex: 1, color: "#0B6E4D", fontWeight: "700", fontSize: 13 }}>Alarmınız tuttu: {hits[0]!.origin} → {hits[0]!.destination}, {hits[0]!.from} için {hits[0]!.pallets} paletlik yer açıldı. Göster →</Text>
        </Pressable>
      )}

      {all.loading && !all.data ? <Skeletons n={3} h={110} /> : all.error && !all.data ? <ErrorBox message={all.error} onRetry={() => all.reload()} /> : !routes.length ? (
        <Card><Text style={{ color: c.ink500 }}>Şu an yayında sefer yok.</Text></Card>
      ) : (
        <>
          <Section n="1" title="Rota">
            <ChipSelect value={route} onChange={(v) => { setRoute(v); setDay(""); }} options={routes.map((x) => ({ value: x.key, label: `${x.from} → ${x.to}`, sub: `${x.n} sefer · ${money(x.min)}'den` }))} />
          </Section>

          <Section n="2" title="Gün" right={<Text style={{ fontSize: 11, color: c.ink500 }}>palet başı en düşük</Text>}>
            <PriceCalendar trips={onRoute} pallets={pallets} value={day} start={start} onStart={setStart} onSelect={setDay} onAlarm={addAlarm} />
            <Text style={{ fontSize: 11, color: c.ink500 }}>🔔 Dolu günlere dokunun: yer açılınca haber verelim.</Text>
          </Section>

          <Section n="3" title="Sefer">
            {!dayTrips.length ? <Text style={{ color: c.ink500 }}>Bu gün sefer yok. Takvimden başka bir gün seçin.</Text> : dayTrips.map((t) => {
              const fits = t.remaining.pallets >= pallets;
              return (
                <OptionCard key={t.id} on={t.id === tripId} disabled={!fits} onPress={() => setTripId(t.id)}>
                  <Row style={{ justifyContent: "space-between" }}>
                    <Text style={{ fontSize: 16, fontWeight: "800", color: c.ink900 }}>{hm(t.departureAt)} <Text style={{ color: c.ink300 }}>→</Text> {dt(t.arrivalEta)}</Text>
                    <Text style={{ fontSize: 16, fontWeight: "800", color: c.cobalt700 }}>{money(t.price.unitPriceMinor)}</Text>
                  </Row>
                  <Text style={{ fontSize: 12, color: c.ink500 }}>{t.carrier.name} · {t.vehicleType.name}</Text>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: fits ? c.mint600 : c.danger }}>{fits ? `${t.remaining.pallets} palet boş` : `Yalnız ${t.remaining.pallets} palet boş`}</Text>
                </OptionCard>
              );
            })}
          </Section>

          {trip && (
            <Card style={{ gap: 12 }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Eyebrow>Araçtaki yeriniz</Eyebrow>
                <Text style={{ fontSize: 12, color: c.ink500 }}>{trip.vehicleType.palletPositions} pozisyon</Text>
              </Row>
              <TruckMap positions={trip.vehicleType.palletPositions} cells={customerCells(trip.vehicleType.palletPositions, trip.sellable.pallets, trip.remaining.pallets, pallets)} />
              <Text style={{ fontSize: 11, color: c.ink500 }}>Diğer firmaların yükleri anonim gösterilir. Son rezervasyon (T−3) {dt(trip.bookingCutoffAt)} · depoya son kabul (T−1) {dt(trip.intakeCutoffAt)}.</Text>
              <CarbonBadge from={trip.origin} to={trip.destination} pallets={pallets} positions={trip.vehicleType.palletPositions} />
            </Card>
          )}

          {trip && <Load trip={trip} pallets={pallets} setPallets={setPallets} onBooked={setDone} />}

          {alarms.length > 0 && (
            <Section n="🔔" title="Boş yer alarmlarım">
              {alarms.map((a) => (
                <Row key={a.id} style={{ justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 13, color: c.ink700, flex: 1 }}>{a.origin} → {a.destination} · {a.from} · {a.pallets} palet</Text>
                  <Btn small kind="ghost" title="Kaldır" onPress={() => void clearAlarm(a.id)} />
                </Row>
              ))}
            </Section>
          )}
        </>
      )}
    </Screen>
  );
}

function Section({ n, title, right, children }: { n: string; title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <Card style={{ gap: 12 }}>
      <Row style={{ justifyContent: "space-between" }}>
        <Row gap={8}>
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: c.cobalt900, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: c.champagne, fontSize: 11, fontWeight: "900" }}>{n}</Text>
          </View>
          <Text style={{ fontSize: 15, fontWeight: "800", color: c.ink900 }}>{title}</Text>
        </Row>
        {right}
      </Row>
      {children}
    </Card>
  );
}

function Load({ trip, pallets, setPallets, onBooked }: { trip: TripCard; pallets: number; setPallets: (n: number) => void; onBooked: (r: Reservation) => void }) {
  const toast = useToast();
  const classes = useLoad(() => api<{ items: PC[] } | PC[]>("GET", "/catalog/product-classes"), []);
  const pcs: PC[] = (Array.isArray(classes.data) ? classes.data : classes.data?.items) ?? [];
  const [mode, setMode] = useState<"pick" | "carton">("pick");
  const [foot, setFoot] = useState<keyof typeof FOOT>("EUR");
  const [height, setHeight] = useState(1.6);
  const [kgPer, setKgPer] = useState(500);
  const [kgOverride, setKgOverride] = useState<number | null>(null);
  const [m3Override, setM3Override] = useState<number | null>(null);
  const [pc, setPc] = useState("GENEL");
  const [plan, setPlan] = useState<"full" | "deposit">("full");
  const [cardId, setCardId] = useState<(typeof CARDS)[number]["id"]>("ok");
  const [recips, setRecips] = useState<string[]>([]);
  const [recipient, setRecipient] = useState("");
  const [quote, setQuote] = useState<Quote>();
  const [qErr, setQErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(uuid);
  const [why, setWhy] = useState(false);

  useEffect(() => { void loadRecipients().then(setRecips); }, []);
  useEffect(() => { if (pcs.length && !pcs.some((x) => x.code === pc)) setPc(pcs[0]!.code); }, [pcs, pc]);

  const grossKg = kgOverride ?? pallets * kgPer;
  const volumeM3 = m3Override ?? Math.round(pallets * FOOT[foot].a * height * 100) / 100;

  useEffect(() => {
    let alive = true;
    setQuote(undefined);
    const h = setTimeout(async () => {
      try {
        const q = await api<Quote>("POST", `/customer/trips/${trip.id}/quote`, { pallets, grossKg, volumeM3, productClassCode: pc });
        if (alive) { setQuote(q); setQErr(undefined); }
      } catch (e) { if (alive) setQErr((e as Error).message); }
    }, 350);
    return () => { alive = false; clearTimeout(h); };
  }, [trip.id, pallets, grossKg, volumeM3, pc]);

  const submit = async () => {
    if (!quote) return;
    const card = CARDS.find((x) => x.id === cardId)!;
    setBusy(true);
    try {
      const r = await api<Reservation>("POST", "/customer/reservations", {
        tripId: trip.id, pallets, grossKg, volumeM3, productClassCode: pc, paymentPlan: plan,
        ...(recipient ? { recipientName: recipient } : {}),
        card: { holder: card.holder, number: card.number, expiry: card.expiry, cvc: card.cvc },
      }, key);
      if (recipient) void rememberRecipient(recipient);
      toast("Teklifiniz taşıyıcıya iletildi");
      onBooked(r);
    } catch (e) {
      const er = e as ApiError;
      setKey(uuid());
      toast(er.reason === "PAYMENT_DECLINED" ? "Kart reddedildi. Kurumsal kartı seçip tekrar deneyin." : er.message, "err");
    } finally { setBusy(false); }
  };

  const pp = quote?.paymentPlans.find((x) => x.code === plan);
  const b = quote?.price.breakdown;
  return (
    <>
      <Section n="4" title="Yük">
        <Segmented value={mode} onChange={setMode} options={[{ value: "pick", label: "Seçerek" }, { value: "carton", label: "Koliden hesapla" }]} />
        {mode === "pick" ? (
          <View style={{ gap: 10 }}>
            <Sub>Palet tipi</Sub>
            <ChipSelect small value={foot} onChange={(v) => { setFoot(v); setM3Override(null); }} options={(Object.keys(FOOT) as (keyof typeof FOOT)[]).map((k) => ({ value: k, label: FOOT[k].l }))} />
            <Sub>Yükseklik</Sub>
            <ChipSelect small value={m3Override == null ? height : null} onChange={(v) => { setHeight(v); setM3Override(null); }} options={HEIGHTS.map((h) => ({ value: h.v, label: h.l }))} />
            <Sub>Palet başı ağırlık</Sub>
            <ChipSelect small value={kgOverride == null ? kgPer : null} onChange={(v) => { setKgPer(v); setKgOverride(null); }} options={KG_PRESETS.map((k) => ({ value: k, label: `${k} kg` }))} />
            <Row style={{ justifyContent: "space-between" }}>
              <Text style={{ fontSize: 13, color: c.ink500 }}>Toplam brüt</Text>
              <Stepper value={grossKg} onChange={(v) => setKgOverride(v)} min={50} max={trip.remaining.kg || 30000} step={50} unit=" kg" />
            </Row>
          </View>
        ) : (
          <CartonCalc onApply={(e) => { setPallets(Math.max(1, e.estimatedPallets)); setKgOverride(Math.round(e.totalWeightKg)); setM3Override(Math.round(e.totalVolumeM3 * 100) / 100); setMode("pick"); toast(`Koliden hesaplandı: ${e.estimatedPallets} palet`); }} />
        )}
        <Sub>Ürün sınıfı</Sub>
        <ChipSelect small value={pc} onChange={setPc} options={(pcs.length ? pcs : [{ code: "GENEL", name: "Genel" }]).map((x) => ({ value: x.code, label: x.name }))} />
        <Text style={{ fontSize: 12, color: c.ink500 }}>{pallets} palet · {num(grossKg)} kg · {volumeM3.toLocaleString("tr-TR")} m³{m3Override != null || kgOverride != null ? " · ince ayarlı" : ""}</Text>
      </Section>

      <Noir>
        <Row style={{ justifyContent: "space-between" }}>
          <Eyebrow light>Teklif</Eyebrow>
          {quote && <Text style={{ fontSize: 11, fontWeight: "800", color: quote.eligible ? c.mint500 : "#FF9A90" }}>{quote.eligible ? "✓ YÜKÜNÜZE UYGUN" : "UYGUN DEĞİL"}</Text>}
        </Row>
        <RouteTitle from={place(trip.origin)} to={place(trip.destination)} size={22} light />
        {qErr ? <Text style={{ color: "#FF9A90" }}>{qErr}</Text> : !quote ? <Text style={{ color: "#B9C3EF" }}>Fiyat hesaplanıyor…</Text> : (
          <>
            <Text style={{ color: "#fff", fontSize: 38, fontWeight: "800", letterSpacing: -1 }}>{money(quote.price.totalPriceMinor)}</Text>
            <Text style={{ color: "#B9C3EF", fontSize: 13 }}>{pallets} palet × {money(quote.price.unitPriceMinor)} · kalkış {dt(trip.departureAt)}</Text>
            {!quote.eligible && quote.reasons.map((x, i) => <Text key={i} style={{ color: "#FFB4AC", fontSize: 13 }}>• {x.message}</Text>)}
            <CarbonBadge from={trip.origin} to={trip.destination} pallets={pallets} positions={trip.vehicleType.palletPositions} dark />
            <Pressable onPress={() => setWhy(!why)}><Text style={{ color: c.champagne, fontWeight: "700", fontSize: 13 }}>Fiyat neden böyle? {why ? "▲" : "▼"}</Text></Pressable>
            {why && b && (
              <View>
                <NoirKV k="Taban fiyat (palet)" v={money(b.basePriceMinor)} />
                <NoirKV k="Doluluk" v={`%${Math.round(b.utilization * 100)}`} />
                <NoirKV k="Talep katsayısı" v={`× ${b.demandMultiplier}`} />
                <NoirKV k="Zaman katsayısı" v={`× ${b.timeMultiplier}${b.timeDecayApplied ? " (indirim)" : ""}`} />
                {b.explanation.map((e, i) => <Text key={i} style={{ color: "#B9C3EF", fontSize: 12, marginTop: 4 }}>• {e}</Text>)}
              </View>
            )}
          </>
        )}
      </Noir>

      {quote?.eligible && (
        <Section n="5" title="Ödeme ve alıcı">
          {quote.paymentPlans.map((pl) => (
            <OptionCard key={pl.code} on={plan === pl.code} onPress={() => setPlan(pl.code)}>
              <Row style={{ justifyContent: "space-between" }}>
                <Text style={{ fontWeight: "700", color: c.ink900, flex: 1 }}>{pl.label}</Text>
                <Text style={{ fontWeight: "800", color: c.cobalt700 }}>{money(pl.dueNowMinor)}</Text>
              </Row>
              {pl.code === "deposit" && pl.remainingMinor != null && <Text style={{ color: c.ink500, fontSize: 12 }}>Kalan {money(pl.remainingMinor)} kalkıştan önce</Text>}
            </OptionCard>
          ))}
          <Sub>Kayıtlı kart</Sub>
          <Row>
            {CARDS.map((k) => (
              <Pressable key={k.id} onPress={() => setCardId(k.id)} style={{ flex: 1, padding: 12, borderRadius: 14, minHeight: 84, justifyContent: "space-between", backgroundColor: cardId === k.id ? c.cobalt900 : c.surface, borderWidth: cardId === k.id ? 0 : 1, borderColor: c.line }}>
                <Row style={{ justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 11, fontWeight: "900", color: cardId === k.id ? c.champagne : c.ink500 }}>VISA</Text>
                  {cardId === k.id && <Text style={{ color: c.mint500, fontWeight: "900" }}>✓</Text>}
                </Row>
                <Text style={{ fontWeight: "700", color: cardId === k.id ? "#fff" : c.ink900 }}>•••• {k.last4}</Text>
                <Text style={{ fontSize: 11, color: cardId === k.id ? "#B9C3EF" : c.ink500 }}>{k.label} · {k.note}</Text>
              </Pressable>
            ))}
          </Row>
          <Sub>Yetkili alıcı</Sub>
          <ChipSelect small value={recipient} onChange={setRecipient} options={[{ value: "", label: "Firma yetkilisi" }, ...recips.map((x) => ({ value: x, label: x })), ...(["Depo sorumlusu", "Sevkiyat şefi"].filter((x) => !recips.includes(x)).map((x) => ({ value: x, label: x })))]} />
          <View style={{ gap: 4 }}>
            {quote.cancellationPolicy.map((x, i) => <KV key={i} k={x.label} v={`%${x.refundPercent} iade`} />)}
          </View>
        </Section>
      )}

      <CTA title={quote?.eligible ? `Teklifi gönder · ${money(pp?.dueNowMinor ?? quote.price.totalPriceMinor)}` : "Uygun teklif bekleniyor"} sub={quote?.eligible ? "Taşıyıcı onaylayana kadar yalnız provizyon alınır" : undefined}
        disabled={!quote?.eligible} loading={busy} onPress={submit} />
    </>
  );
}

const Sub = ({ children }: { children: ReactNode }) => <Text style={{ fontSize: 12, fontWeight: "700", color: c.ink500 }}>{children}</Text>;

function CartonCalc({ onApply }: { onApply: (e: Est) => void }) {
  const pk = useLoad(() => api<{ items: Pk[] }>("GET", "/catalog/packaging-types"), []);
  const items = pk.data?.items ?? [];
  const palletsT = items.filter((x) => x.kind === "pallet");
  const cartons = items.filter((x) => x.kind === "carton");
  const [pal, setPal] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [res, setRes] = useState<Est>();
  const [err, setErr] = useState<string>();
  useEffect(() => { if (!pal && palletsT[0]) setPal(palletsT[0].id); }, [palletsT, pal]);
  const lines = Object.entries(counts).filter(([, n]) => n > 0);
  const sig = JSON.stringify(lines);
  useEffect(() => {
    if (!pal || !lines.length) { setRes(undefined); return; }
    let alive = true;
    const h = setTimeout(() => api<Est>("POST", "/customer/shipments/estimate-pallets", { palletTypeId: pal, cartons: lines.map(([id, count]) => ({ packagingTypeId: id, count })) })
      .then((r) => { if (alive) { setRes(r); setErr(undefined); } }).catch((e) => { if (alive) setErr((e as Error).message); }), 300);
    return () => { alive = false; clearTimeout(h); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pal, sig]);
  if (pk.loading) return <Skeletons n={1} h={60} />;
  if (pk.error) return <ErrorBox message={pk.error} />;
  return (
    <View style={{ gap: 10 }}>
      <ChipSelect small value={pal} onChange={setPal} options={palletsT.map((p) => ({ value: p.id, label: p.name }))} />
      {cartons.map((k) => (
        <Row key={k.id} style={{ justifyContent: "space-between" }}>
          <Text style={{ fontSize: 13, color: c.ink700, flex: 1 }}>{k.name}</Text>
          <Stepper value={counts[k.id] ?? 0} onChange={(v) => setCounts((x) => ({ ...x, [k.id]: v }))} min={0} max={100000} step={10} />
        </Row>
      ))}
      {err && <Text style={{ color: c.danger }}>{err}</Text>}
      {res && (
        <View style={{ padding: 12, borderRadius: 12, backgroundColor: c.cobalt50, gap: 6 }}>
          <Text style={{ fontWeight: "800", color: c.ink900 }}>≈ {res.estimatedPallets} palet · {num(Math.round(res.totalWeightKg))} kg · {res.totalVolumeM3.toLocaleString("tr-TR")} m³</Text>
          {res.warnings.map((w, i) => <Text key={i} style={{ fontSize: 12, color: c.warning }}>• {w}</Text>)}
          <Btn small title="Bu değerleri kullan" onPress={() => onApply(res)} />
        </View>
      )}
    </View>
  );
}

function Success({ r, onDone, onAgain }: { r: Reservation; onDone: () => void; onAgain: () => void }) {
  return (
    <Screen>
      <Noir style={{ alignItems: "center", paddingVertical: 28 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.mint500, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 34, color: c.cobalt900, fontWeight: "900" }}>✓</Text>
        </View>
        <Text style={{ fontFamily: serif, fontSize: 28, color: "#fff", textAlign: "center" }}>Teklifiniz iletildi</Text>
        <Text style={{ color: "#B9C3EF", textAlign: "center" }}>Taşıyıcı onayladığında sipariş numaranız, palet QR kodlarınız ve teslim kartınız hazır olur.</Text>
      </Noir>
      <Card>
        <KV k="Başvuru no" v={r.reference} bold />
        <KV k="Durum" v={r.statusLabel} />
        <KV k="Güzergâh" v={`${place(r.trip.origin)} → ${place(r.trip.destination)}`} />
        <KV k="Kalkış" v={dt(r.trip.departureAt)} />
        <KV k="Tutar" v={money(r.totalPriceMinor)} />
      </Card>
      <CarbonBadge from={r.trip.origin} to={r.trip.destination} pallets={r.pallets} positions={r.trip.vehicleType.palletPositions} />
      <Btn title="Yüklerime git" onPress={onDone} />
      <Btn kind="ghost" title="Yeni gönderi" onPress={onAgain} />
    </Screen>
  );
}
