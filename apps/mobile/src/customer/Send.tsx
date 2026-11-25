import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { api, ApiError, uuid } from "../api";
import { c, sansBold, serif } from "../theme";
import { dt, hm, money, num, place } from "../format";
import { Btn, ErrorBox, KV, Row, Screen, Sheet, Skeletons, useLoad, useScrollToFocused, useToast } from "../ui";
import {
  CarbonBadge, ChipSelect, Eyebrow, Noir, NoirKV, OptionCard, PriceCalendar, RouteTitle, Segmented, Stepper, TruckMap,
  customerCells, dayNum, isoDay, today, weekday,
} from "../premium";
import { loadAlarms, loadRecipients, rememberRecipient, saveAlarms, type Alarm } from "../alarms";
import { success, tap } from "../haptics";
import type { Quote, Reservation, TripCard } from "../types";

type PC = { code: string; name: string };
type Pk = { id: string; name: string; kind: string };
type Est = { totalVolumeM3: number; totalWeightKg: number; estimatedPallets: number; warnings: string[] };

const CARDS = [
  { id: "ok", label: "Kurumsal", last4: "5556", holder: "ANADOLU PARSIYEL", number: "4000056655665556", expiry: "09/28", cvc: "314", note: "Varsayılan" },
  { id: "decline", label: "İkincil", last4: "0002", holder: "ANADOLU PARSIYEL", number: "4000000000000002", expiry: "09/28", cvc: "314", note: "Yedek kart" },
] as const;
const KG_PRESETS = [250, 500, 750, 1000];
const HEIGHTS = [{ v: 1.2, l: "≤120 cm" }, { v: 1.6, l: "≤160 cm" }, { v: 1.8, l: "≤180 cm" }];
const FOOT = { EUR: { l: "Euro 80×120", a: 0.96 }, IND: { l: "Endüstriyel", a: 1.2 } } as const;
const STEPS = ["Rota", "Gün", "Yük", "Ödeme"] as const;
const routeKey = (t: TripCard) => `${t.origin.city}|${t.destination.city}`;
const nativeDriver = Platform.OS !== "web";

/**
 * Palet gönder: dört kısa adım, her biri tek ekrana sığar (kaydırma yok).
 * Altta canlı "bilet" çubuğu: seçim özeti + anlık fiyat + ilerle düğmesi.
 */
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
    return [...m.values()].sort((a, b) => b.space - a.space || b.n - a.n);
  }, [trips]);

  const [step, setStep] = useState(0);
  const [route, setRoute] = useState<string | null>(null);
  const [pallets, setPallets] = useState(3);
  const [start, setStart] = useState(today());
  const [day, setDay] = useState("");
  const [tripId, setTripId] = useState<string | null>(null);
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [alarmsOpen, setAlarmsOpen] = useState(false);
  const [done, setDone] = useState<Reservation>();

  // yük
  const classes = useLoad(() => api<{ items: PC[] } | PC[]>("GET", "/catalog/product-classes"), []);
  const pcs: PC[] = (Array.isArray(classes.data) ? classes.data : classes.data?.items) ?? [];
  const [mode, setMode] = useState<"pick" | "carton">("pick");
  const [foot, setFoot] = useState<keyof typeof FOOT>("EUR");
  const [height, setHeight] = useState(1.6);
  const [kgPer, setKgPer] = useState(500);
  const [kgOverride, setKgOverride] = useState<number | null>(null);
  const [m3Override, setM3Override] = useState<number | null>(null);
  const [pc, setPc] = useState("GENEL");
  // ödeme
  const [plan, setPlan] = useState<"full" | "deposit">("full");
  const [cardId, setCardId] = useState<(typeof CARDS)[number]["id"]>("ok");
  const [recips, setRecips] = useState<string[]>([]);
  const [recipient, setRecipient] = useState("");
  const [quote, setQuote] = useState<Quote>();
  const [qErr, setQErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(uuid);
  const [why, setWhy] = useState(false);

  useEffect(() => { void loadAlarms().then(setAlarms); void loadRecipients().then(setRecips); }, []);
  useEffect(() => { if (!route && routes[0]) setRoute(routes[0].key); }, [routes, route]);
  useEffect(() => { if (pcs.length && !pcs.some((x) => x.code === pc)) setPc(pcs[0]!.code); }, [pcs, pc]);

  const onRoute = trips.filter((t) => routeKey(t) === route);
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
    const cur = dayTrips.find((t) => t.id === tripId);
    if (!cur || cur.remaining.pallets < pallets) setTripId((dayTrips.find((t) => t.remaining.pallets >= pallets) ?? cur ?? dayTrips[0]!).id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, route, trips.length, pallets]);
  const trip = dayTrips.find((t) => t.id === tripId);
  const r = routes.find((x) => x.key === route);

  const grossKg = kgOverride ?? pallets * kgPer;
  const volumeM3 = m3Override ?? Math.round(pallets * FOOT[foot].a * height * 100) / 100;

  useEffect(() => {
    if (!trip) { setQuote(undefined); return; }
    let alive = true;
    setQuote(undefined); setQErr(undefined);
    const h = setTimeout(async () => {
      try {
        const q = await api<Quote>("POST", `/customer/trips/${trip.id}/quote`, { pallets, grossKg, volumeM3, productClassCode: pc });
        if (alive) { setQuote(q); setQErr(undefined); }
      } catch (e) { if (alive) setQErr((e as Error).message); }
    }, 300);
    return () => { alive = false; clearTimeout(h); };
  }, [trip?.id, pallets, grossKg, volumeM3, pc]); // eslint-disable-line react-hooks/exhaustive-deps

  const hits = alarms.filter((a) => trips.some((t) => routeKey(t) === `${a.origin}|${a.destination}` && isoDay(t.departureAt) >= a.from && isoDay(t.departureAt) <= a.to && t.remaining.pallets >= a.pallets));
  const addAlarm = async (d: string) => {
    if (!r) return;
    const [o, de] = r.key.split("|");
    const a: Alarm = { id: uuid(), origin: o!, destination: de!, from: d, to: d, pallets, createdAt: new Date().toISOString() };
    const next = [a, ...alarms].slice(0, 10);
    setAlarms(next); await saveAlarms(next); success();
    toast(`Alarm kuruldu: ${dayNum(d)} için ${pallets} palet yer açılınca haber vereceğiz`);
  };
  const clearAlarm = async (id: string) => { const next = alarms.filter((a) => a.id !== id); setAlarms(next); await saveAlarms(next); };

  const submit = async () => {
    if (!quote || !trip) return;
    const card = CARDS.find((x) => x.id === cardId)!;
    setBusy(true);
    try {
      const res = await api<Reservation>("POST", "/customer/reservations", {
        tripId: trip.id, pallets, grossKg, volumeM3, productClassCode: pc, paymentPlan: plan,
        ...(recipient ? { recipientName: recipient } : {}),
        card: { holder: card.holder, number: card.number, expiry: card.expiry, cvc: card.cvc },
      }, key);
      if (recipient) void rememberRecipient(recipient);
      success(); setKey(uuid()); setDone(res);
    } catch (e) {
      const er = e as ApiError;
      setKey(uuid());
      toast(er.reason === "PAYMENT_DECLINED" ? "Kart reddedildi. Kurumsal kartı seçip tekrar deneyin." : er.message, "err");
    } finally { setBusy(false); }
  };

  // adım geçiş animasyonu
  const fade = useRef(new Animated.Value(1)).current;
  const stepScroll = useScrollToFocused();
  const go = (n: number) => {
    tap();
    fade.setValue(0);
    setStep(n);
    Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: nativeDriver }).start();
  };

  if (done) return <Success r={done} onDone={onDone} onAgain={() => { setDone(undefined); go(0); void all.reload(true); }} />;
  if (all.loading && !all.data) return <Screen><Skeletons n={4} h={110} /></Screen>;
  if (all.error && !all.data) return <Screen><ErrorBox message={all.error} onRetry={() => all.reload()} /></Screen>;
  if (!routes.length) return <Screen><Text style={{ color: c.ink500 }}>Şu an yayında sefer yok.</Text></Screen>;

  const pp = quote?.paymentPlans.find((x) => x.code === plan);
  const canNext = step === 0 ? !!route : step === 1 ? !!trip && trip.remaining.pallets >= pallets : step === 2 ? !!quote?.eligible : !!quote?.eligible;

  return (
    <View style={{ flex: 1 }}>
      {/* adım çubuğu */}
      <View style={{ flexDirection: "row", gap: 6, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
        {STEPS.map((l, i) => (
          <Pressable key={l} disabled={i > step} onPress={() => go(i)} style={{ flex: 1, gap: 5 }} accessibilityRole="tab" accessibilityState={{ selected: i === step }}>
            <View style={{ height: 4, borderRadius: 2, backgroundColor: i < step ? c.mint500 : i === step ? c.cobalt900 : c.line }} />
            <Text style={{ fontSize: 11, fontFamily: sansBold, color: i === step ? c.cobalt900 : i < step ? c.mint600 : c.ink500 }}>{i < step ? "✓ " : `${i + 1}. `}{l}</Text>
          </Pressable>
        ))}
        {alarms.length > 0 && (
          <Pressable onPress={() => setAlarmsOpen(true)} style={{ marginLeft: 4, paddingHorizontal: 8, height: 26, borderRadius: 13, backgroundColor: hits.length ? c.mint500 : c.cobalt50, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 11, fontWeight: "800", color: c.cobalt900 }}>🔔 {alarms.length}</Text>
          </Pressable>
        )}
      </View>

      <Animated.View style={{ flex: 1, opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}>
        <ScrollView ref={stepScroll} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12, gap: 12 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" showsVerticalScrollIndicator={false}>
          {step === 0 && (
            <>
              <Head eyebrow="Adım 1 · rota" title="Nereye gönderiyoruz?" />
              {hits.length > 0 && (
                <Pressable onPress={() => { const a = hits[0]!; setRoute(`${a.origin}|${a.destination}`); setDay(a.from); setStart(a.from); go(1); }}
                  style={{ flexDirection: "row", gap: 8, alignItems: "center", padding: 10, borderRadius: 14, backgroundColor: c.mint100, borderWidth: 1, borderColor: c.mint200 }}>
                  <Text>🔔</Text>
                  <Text style={{ flex: 1, color: "#0B6E4D", fontWeight: "700", fontSize: 12 }}>Alarmınız tuttu: {hits[0]!.origin} → {hits[0]!.destination} için yer açıldı. Göster →</Text>
                </Pressable>
              )}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {routes.slice(0, 6).map((x) => {
                  const on = x.key === route;
                  return (
                    <Pressable key={x.key} disabled={x.space < 1} onPress={() => { tap(); if (x.key !== route) { setRoute(x.key); setDay(""); } }} accessibilityRole="radio" accessibilityState={{ checked: on }}
                      style={({ pressed }) => ({ opacity: x.space < 1 ? 0.45 : 1, width: "48.4%", minHeight: 92, borderRadius: 18, padding: 12, justifyContent: "space-between", backgroundColor: on ? c.cobalt900 : c.surface, borderWidth: 1, borderColor: on ? c.cobalt900 : c.line, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
                      <View>
                        <Text style={{ fontFamily: sansBold, fontSize: 15, color: on ? "#fff" : c.ink900 }} numberOfLines={1}>{x.from}</Text>
                        <Text style={{ fontFamily: sansBold, fontSize: 15, color: on ? c.champagne : c.cobalt700 }} numberOfLines={1}>→ {x.to}</Text>
                      </View>
                      <Row style={{ justifyContent: "space-between" }}>
                        <Text style={{ fontSize: 11, color: on ? "#B9C3EF" : c.ink500 }}>{x.space < 1 ? "Dolu" : `${x.space} palet boş`}</Text>
                        <Text style={{ fontSize: 12, fontWeight: "800", color: on ? c.mint500 : c.mint600 }}>{money(x.min)}</Text>
                      </Row>
                    </Pressable>
                  );
                })}
              </View>
              <Noir style={{ padding: 14, gap: 8 }}>
                <Row style={{ justifyContent: "space-between" }}>
                  <View><Eyebrow light>Kaç palet?</Eyebrow><Text style={{ color: "#B9C3EF", fontSize: 12, marginTop: 2 }}>{r ? `${r.from} → ${r.to}` : ""}</Text></View>
                  <Stepper value={pallets} onChange={(v) => { tap(); setPallets(v); setKgOverride(null); setM3Override(null); }} min={1} max={33} unit=" palet" dark />
                </Row>
              </Noir>
            </>
          )}

          {step === 1 && (
            <>
              <Head eyebrow="Adım 2 · gün ve sefer" title="Ne zaman yola çıksın?" />
              <PriceCalendar trips={onRoute} pallets={pallets} value={day} start={start} onStart={setStart} onSelect={(d) => { tap(); setDay(d); }} onAlarm={addAlarm} />
              {!dayTrips.length ? <Text style={{ color: c.ink500, fontSize: 13 }}>Bu gün sefer yok. Başka bir gün seçin; 🔔 dolu günlere alarm kurulur.</Text> : dayTrips.slice(0, 2).map((t) => {
                const fits = t.remaining.pallets >= pallets;
                return (
                  <OptionCard key={t.id} on={t.id === tripId} disabled={!fits} onPress={() => { tap(); setTripId(t.id); }}>
                    <Row style={{ justifyContent: "space-between" }}>
                      <Text style={{ fontFamily: sansBold, fontSize: 15, color: c.ink900 }}>{hm(t.departureAt)} <Text style={{ color: c.ink300 }}>→</Text> {dt(t.arrivalEta)}</Text>
                      <Text style={{ fontFamily: sansBold, fontSize: 15, color: c.cobalt700 }}>{money(t.price.unitPriceMinor)}</Text>
                    </Row>
                    <Text style={{ fontSize: 12, color: c.ink500 }}>{t.carrier.name} · {t.vehicleType.name} · <Text style={{ fontWeight: "700", color: fits ? c.mint600 : c.danger }}>{t.remaining.pallets} palet boş</Text></Text>
                  </OptionCard>
                );
              })}
              {trip && (
                <View style={{ padding: 12, borderRadius: 18, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, gap: 8 }}>
                  <Row style={{ justifyContent: "space-between" }}>
                    <Eyebrow>Araçtaki yeriniz</Eyebrow>
                    <Text style={{ fontSize: 11, color: c.ink500 }}>T−3 {hm(trip.bookingCutoffAt)} · depo T−1 {hm(trip.intakeCutoffAt)}</Text>
                  </Row>
                  <TruckMap positions={trip.vehicleType.palletPositions} cells={customerCells(trip.vehicleType.palletPositions, trip.sellable.pallets, trip.remaining.pallets, pallets)} />
                  <CarbonBadge from={trip.origin} to={trip.destination} pallets={pallets} positions={trip.vehicleType.palletPositions} />
                </View>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <Head eyebrow="Adım 3 · yük" title="Ne taşıyoruz?" />
              <Segmented value={mode} onChange={setMode} options={[{ value: "pick", label: "Seçerek" }, { value: "carton", label: "Koliden hesapla" }]} />
              {mode === "pick" ? (
                <View style={{ gap: 9 }}>
                  <Line label="Palet"><ChipSelect small value={foot} onChange={(v) => { tap(); setFoot(v); setM3Override(null); }} options={(Object.keys(FOOT) as (keyof typeof FOOT)[]).map((k) => ({ value: k, label: FOOT[k].l }))} /></Line>
                  <Line label="Yükseklik"><ChipSelect small value={m3Override == null ? height : null} onChange={(v) => { tap(); setHeight(v); setM3Override(null); }} options={HEIGHTS.map((h) => ({ value: h.v, label: h.l }))} /></Line>
                  <Line label="Palet başı"><ChipSelect small value={kgOverride == null ? kgPer : null} onChange={(v) => { tap(); setKgPer(v); setKgOverride(null); }} options={KG_PRESETS.map((k) => ({ value: k, label: `${k} kg` }))} /></Line>
                  <Line label="Ürün"><ChipSelect small value={pc} onChange={(v) => { tap(); setPc(v); }} options={(pcs.length ? pcs : [{ code: "GENEL", name: "Genel" }]).map((x) => ({ value: x.code, label: x.name }))} /></Line>
                  <Row style={{ justifyContent: "space-between", marginTop: 2 }}>
                    <Text style={{ fontSize: 12, color: c.ink500 }}>Toplam brüt</Text>
                    <Stepper value={grossKg} onChange={(v) => setKgOverride(v)} min={50} max={Math.max(50, trip?.remaining.kg ?? 30000)} step={50} unit=" kg" />
                  </Row>
                </View>
              ) : (
                <CartonCalc onApply={(e) => { setPallets(Math.max(1, e.estimatedPallets)); setKgOverride(Math.round(e.totalWeightKg)); setM3Override(Math.round(e.totalVolumeM3 * 100) / 100); setMode("pick"); success(); toast(`Koliden hesaplandı: ${e.estimatedPallets} palet`); }} />
              )}
              {quote && !quote.eligible && quote.reasons.map((x, i) => <Text key={i} style={{ color: c.danger, fontSize: 12 }}>• {x.message}</Text>)}
            </>
          )}

          {step === 3 && quote && trip && (
            <>
              <Head eyebrow="Adım 4 · ödeme" title="Son dokunuş" />
              <View style={{ flexDirection: "row", gap: 10 }}>
                {quote.paymentPlans.map((pl) => {
                  const on = plan === pl.code;
                  return (
                    <Pressable key={pl.code} onPress={() => { tap(); setPlan(pl.code); }} style={{ flex: 1, padding: 12, borderRadius: 16, minHeight: 86, gap: 4, backgroundColor: on ? c.cobalt50 : c.surface, borderWidth: on ? 2 : 1, borderColor: on ? c.cobalt600 : c.line }}>
                      <Text style={{ fontSize: 12, fontWeight: "700", color: c.ink700 }} numberOfLines={2}>{pl.code === "full" ? "Tamamı şimdi" : `%${pl.depositPercent ?? 30} kapora`}</Text>
                      <Text style={{ fontFamily: sansBold, fontSize: 18, color: c.cobalt900 }}>{money(pl.dueNowMinor)}</Text>
                      {pl.remainingMinor != null && <Text style={{ fontSize: 10, color: c.ink500 }}>Kalan {money(pl.remainingMinor)}</Text>}
                    </Pressable>
                  );
                })}
              </View>
              <View style={{ flexDirection: "row", gap: 10 }}>
                {CARDS.map((k) => {
                  const on = cardId === k.id;
                  return (
                    <Pressable key={k.id} onPress={() => { tap(); setCardId(k.id); }} style={{ flex: 1, padding: 12, borderRadius: 16, height: 92, justifyContent: "space-between", backgroundColor: on ? c.cobalt900 : c.surface, borderWidth: on ? 0 : 1, borderColor: c.line, overflow: "hidden" }}>
                      {on && <View pointerEvents="none" style={{ position: "absolute", right: -30, top: -40, width: 110, height: 110, borderRadius: 55, backgroundColor: c.cobalt700, opacity: 0.6 }} />}
                      <Row style={{ justifyContent: "space-between" }}>
                        <Text style={{ fontSize: 11, fontWeight: "900", color: on ? c.champagne : c.ink500, letterSpacing: 1 }}>VISA</Text>
                        {on && <Text style={{ color: c.mint500, fontWeight: "900" }}>✓</Text>}
                      </Row>
                      <Text style={{ fontFamily: sansBold, color: on ? "#fff" : c.ink900, letterSpacing: 1 }}>•••• {k.last4}</Text>
                      <Text style={{ fontSize: 10, color: on ? "#B9C3EF" : c.ink500 }}>{k.label} · {k.note}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Line label="Teslim alacak"><ChipSelect small value={recipient} onChange={(v) => { tap(); setRecipient(v); }} options={[{ value: "", label: "Firma yetkilisi" }, ...recips.slice(0, 2).map((x) => ({ value: x, label: x })), ...(["Depo sorumlusu"].filter((x) => !recips.includes(x)).map((x) => ({ value: x, label: x })))]} /></Line>
              <Pressable onPress={() => setWhy(true)}><Text style={{ color: c.cobalt600, fontWeight: "700", fontSize: 12 }}>Fiyat neden böyle? · İptal koşulları ›</Text></Pressable>
            </>
          )}
        </ScrollView>
      </Animated.View>

      {/* canlı bilet çubuğu */}
      <View style={{ paddingHorizontal: 12, paddingBottom: 10, paddingTop: 4 }}>
        <Noir style={{ padding: 12, borderRadius: 20, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={{ color: c.champagne, fontSize: 10, fontWeight: "800", letterSpacing: 1 }} numberOfLines={1}>
              {r ? `${r.from.toLocaleUpperCase("tr-TR")} → ${r.to.toLocaleUpperCase("tr-TR")}` : "ROTA SEÇİN"}
            </Text>
            <Text style={{ color: "#fff", fontFamily: sansBold, fontSize: 20 }} numberOfLines={1}>
              {qErr ? "—" : quote ? money(step === 3 ? (pp?.dueNowMinor ?? quote.price.totalPriceMinor) : quote.price.totalPriceMinor) : trip ? "…" : "—"}
            </Text>
            {qErr ? <Text style={{ color: "#FFB4AC", fontSize: 11 }} numberOfLines={1}>Fiyat alınamadı: {qErr}</Text> : <Text style={{ color: quote && !quote.eligible ? "#FFB4AC" : "#B9C3EF", fontSize: 11 }} numberOfLines={1}>
              {pallets} palet{step >= 2 ? ` · ${num(grossKg)} kg · ${volumeM3.toLocaleString("tr-TR")} m³` : trip ? ` · ${weekday(day)} ${dayNum(day)} ${hm(trip.departureAt)}` : ""}{quote ? (quote.eligible ? " ✓" : " · uygun değil") : ""}
            </Text>}
          </View>
          <Pressable disabled={!canNext || busy} onPress={() => (step < 3 ? go(step + 1) : submit())} accessibilityRole="button"
            style={({ pressed }) => ({ minHeight: 50, paddingHorizontal: 20, borderRadius: 15, backgroundColor: c.mint500, alignItems: "center", justifyContent: "center", opacity: !canNext || busy ? 0.4 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
            <Text style={{ color: c.cobalt900, fontFamily: sansBold, fontSize: 15 }}>{busy ? "Gönderiliyor…" : step < 3 ? "Devam →" : "Teklifi gönder"}</Text>
          </Pressable>
        </Noir>
      </View>

      {why && quote && (
        <Sheet onClose={() => setWhy(false)}>
          <Text style={{ fontFamily: serif, fontSize: 22, color: c.cobalt900 }}>Fiyat ve iptal</Text>
          <KV k="Palet başı" v={money(quote.price.unitPriceMinor)} />
          <KV k="Doluluk" v={`%${Math.round(quote.price.breakdown.utilization * 100)}`} />
          <KV k="Talep × zaman" v={`× ${quote.price.breakdown.demandMultiplier} · × ${quote.price.breakdown.timeMultiplier}`} />
          {quote.price.breakdown.explanation.slice(0, 3).map((e, i) => <Text key={i} style={{ color: c.ink700, fontSize: 12 }}>• {e}</Text>)}
          {quote.cancellationPolicy.map((x, i) => <KV key={i} k={x.label} v={`%${x.refundPercent} iade`} />)}
          <Btn kind="ghost" title="Kapat" onPress={() => setWhy(false)} />
        </Sheet>
      )}
      {alarmsOpen && (
        <Sheet onClose={() => setAlarmsOpen(false)}>
          <Text style={{ fontFamily: serif, fontSize: 22, color: c.cobalt900 }}>Boş yer alarmlarım</Text>
          {alarms.map((a) => (
            <Row key={a.id} style={{ justifyContent: "space-between" }}>
              <Text style={{ fontSize: 13, color: c.ink700, flex: 1 }}>{a.origin} → {a.destination} · {dayNum(a.from)} · {a.pallets} palet</Text>
              <Btn small kind="ghost" title="Kaldır" onPress={() => void clearAlarm(a.id)} />
            </Row>
          ))}
          <Btn kind="ghost" title="Kapat" onPress={() => setAlarmsOpen(false)} />
        </Sheet>
      )}
    </View>
  );
}

function Head({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <View style={{ gap: 2, marginTop: 2 }}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <Text style={{ fontFamily: serif, fontSize: 26, color: c.cobalt900, letterSpacing: -0.6 }}>{title}</Text>
    </View>
  );
}
function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: 5 }}>
      <Text style={{ fontSize: 11, fontWeight: "700", color: c.ink500 }}>{label}</Text>
      {children}
    </View>
  );
}

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
      .then((x) => { if (alive) { setRes(x); setErr(undefined); } }).catch((e) => { if (alive) setErr((e as Error).message); }), 300);
    return () => { alive = false; clearTimeout(h); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pal, sig]);
  if (pk.loading) return <Skeletons n={1} h={60} />;
  if (pk.error) return <ErrorBox message={pk.error} />;
  return (
    <View style={{ gap: 8 }}>
      <ChipSelect small value={pal} onChange={setPal} options={palletsT.map((p) => ({ value: p.id, label: p.name }))} />
      {cartons.slice(0, 4).map((k) => (
        <Row key={k.id} style={{ justifyContent: "space-between" }}>
          <Text style={{ fontSize: 12, color: c.ink700, flex: 1 }} numberOfLines={2}>{k.name}</Text>
          <Stepper value={counts[k.id] ?? 0} onChange={(v) => setCounts((x) => ({ ...x, [k.id]: v }))} min={0} max={100000} step={10} />
        </Row>
      ))}
      {err && <Text style={{ color: c.danger, fontSize: 12 }}>{err}</Text>}
      {res && (
        <Row style={{ justifyContent: "space-between", padding: 10, borderRadius: 12, backgroundColor: c.cobalt50 }}>
          <Text style={{ fontWeight: "800", color: c.ink900, flex: 1, fontSize: 13 }}>≈ {res.estimatedPallets} palet · {num(Math.round(res.totalWeightKg))} kg</Text>
          <Btn small title="Kullan" onPress={() => onApply(res)} />
        </Row>
      )}
    </View>
  );
}

function Success({ r, onDone, onAgain }: { r: Reservation; onDone: () => void; onAgain: () => void }) {
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.spring(pop, { toValue: 1, friction: 5, tension: 80, useNativeDriver: nativeDriver }).start(); }, [pop]);
  return (
    <View style={{ flex: 1, padding: 16, gap: 12, justifyContent: "center" }}>
      <Noir style={{ alignItems: "center", paddingVertical: 26 }}>
        <Animated.View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: c.mint500, alignItems: "center", justifyContent: "center", transform: [{ scale: pop }] }}>
          <Text style={{ fontSize: 36, color: c.cobalt900, fontWeight: "900" }}>✓</Text>
        </Animated.View>
        <Text style={{ fontFamily: serif, fontSize: 26, color: "#fff", textAlign: "center" }}>Teklifiniz iletildi</Text>
        <RouteTitle from={place(r.trip.origin)} to={place(r.trip.destination)} size={18} light />
        <Text style={{ color: "#B9C3EF", textAlign: "center", fontSize: 13 }}>Taşıyıcı onayladığında sipariş numaranız, palet QR'larınız ve teslim kartınız hazır olur.</Text>
        <View style={{ alignSelf: "stretch" }}>
          <NoirKV k="Başvuru no" v={r.reference} strong />
          <NoirKV k="Kalkış" v={dt(r.trip.departureAt)} />
          <NoirKV k="Tutar" v={money(r.totalPriceMinor)} />
        </View>
        <CarbonBadge from={r.trip.origin} to={r.trip.destination} pallets={r.pallets} positions={r.trip.vehicleType.palletPositions} dark />
      </Noir>
      <Btn title="Yüklerime git" onPress={onDone} />
      <Btn kind="ghost" title="Yeni gönderi" onPress={onAgain} />
    </View>
  );
}
