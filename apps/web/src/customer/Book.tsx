import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, BellRing, Check, CreditCard, FileCode2, Boxes, SlidersHorizontal, Plus, Info, X } from "lucide-react";
import { api, ApiError } from "../api";
import type { AlternativeScenario, ContractPreview, Quote, Reservation, TripCard } from "../types";
import { addDays, dayNum, full, isoDay, num, place, time, tl, today, weekday } from "../format";
import { Empty, ErrorBox, Modal, PricePop, Skeleton, useFetch, useToast } from "../ui";
import { ChipSelect, Countdown, OptionCard, RollNumber, Segmented, Stepper } from "../components/controls";
import { TruckMap, customerCells } from "../components/TruckMap";
import { CarbonBadge } from "../components/extras";
import { ContractSignModal } from "../components/Contract";
import { parseDespatchAdvice, type Declaration } from "../lib/irsaliye";
import { loadAlarms, loadRecipients, rememberRecipient, saveAlarms, type Alarm } from "../lib/store";

type Pk = { id: string; code: string; name: string; kind: string; lengthMm: number; widthMm: number; heightMm: number; usableVolumeM3: number | null };
type Pc = { code: string; name: string; specialHandling?: boolean };

const CARDS = [
  { id: "ok", label: "Kurumsal kart", brand: "VISA", last4: "5556", holder: "Marmara Ambar", number: "4000 0566 5566 5556", expiry: "09/28", cvc: "314", note: "Varsayılan" },
  { id: "decline", label: "Yedek kart", brand: "VISA", last4: "0002", holder: "Marmara Ambar", number: "4000 0000 0000 0002", expiry: "09/28", cvc: "314", note: "Demo: reddedilir" },
] as const;
const KG_PRESETS = [250, 500, 750, 1000];
const HEIGHTS = [{ v: 1.2, l: "≤ 120 cm" }, { v: 1.6, l: "≤ 160 cm" }, { v: 1.8, l: "≤ 180 cm" }];
const FOOT = { EUR: { l: "Euro 80×120", a: 0.96 }, IND: { l: "Endüstriyel 100×120", a: 1.2 } } as const;

const routeKey = (t: TripCard) => `${place(t.origin)}→${place(t.destination)}`;

export function BookView({ onDone, alarmHits, who, displayName }: { onDone: (r: Reservation) => void; alarmHits: (a: Alarm[]) => void; who?: string; displayName?: string }) {
  const all = useFetch((s) => api<{ items: TripCard[] }>("GET", "/customer/trips", undefined, { signal: s }), [], 30000);
  const trips = all.data?.items ?? [];

  /* ---- seçim durumu ---- */
  const [origin, setOrigin] = useState<string | null>(null);
  const [dest, setDest] = useState<string | null>(null);
  const [pallets, setPallets] = useState(1);
  const [tripId, setTripId] = useState<string | null>(null);
  const [alarmFor, setAlarmFor] = useState<string | null>(null);

  const origins = useMemo(() => countBy(trips.map((t) => place(t.origin))), [trips]);
  const dests = useMemo(() => countBy(trips.filter((t) => !origin || place(t.origin) === origin).map((t) => place(t.destination))), [trips, origin]);
  const routeTrips = useMemo(() => trips.filter((t) => (!origin || place(t.origin) === origin) && (!dest || place(t.destination) === dest))
    .sort((x, y) => x.departureAt.localeCompare(y.departureAt)), [trips, origin, dest]);

  // akıllı varsayılan: en çok sefer olan rota
  useEffect(() => {
    if (!trips.length || origin) return;
    const top = Object.entries(countBy(trips.map(routeKey))).sort((a, b) => b[1] - a[1])[0]![0];
    const [o, d] = top.split("→");
    setOrigin(o!); setDest(d!);
  }, [trips, origin]);

  // esnek tarih: palet sığan en ucuz sefer "En uygun"
  const best = useMemo(() => {
    const fit = routeTrips.filter((t) => t.remaining.pallets >= pallets);
    return fit.length > 1 ? fit.reduce((m, t) => (t.price.unitPriceMinor < m.price.unitPriceMinor ? t : m)).id : null;
  }, [routeTrips, pallets]);

  // gün grupları (kokpitteki gibi): Bugün · Yarın · gün adı
  const groups = useMemo(() => {
    const t0 = today(), t1 = addDays(t0, 1), m = new Map<string, TripCard[]>();
    for (const t of routeTrips) { const d = isoDay(t.departureAt); m.set(d, [...(m.get(d) ?? []), t]); }
    return [...m.entries()].map(([d, list]) => ({
      d, list, label: d === t0 ? "Bugün" : d === t1 ? "Yarın" : `${weekday(d)} ${dayNum(d)}`,
      min: Math.min(...list.filter((t) => t.remaining.pallets >= pallets).map((t) => t.price.unitPriceMinor)),
    }));
  }, [routeTrips, pallets]);

  useEffect(() => {
    if (tripId && routeTrips.some((t) => t.id === tripId)) return;
    setTripId(routeTrips.find((t) => t.remaining.pallets >= pallets)?.id ?? routeTrips[0]?.id ?? null);
  }, [routeTrips, pallets, tripId]);
  const trip = routeTrips.find((t) => t.id === tripId) ?? null;

  // alarm eşleşmeleri
  useEffect(() => {
    if (!trips.length) return;
    const hits = loadAlarms().filter((a) => trips.some((t) => place(t.origin) === a.origin && place(t.destination) === a.destination &&
      isoDay(t.departureAt) >= a.from && isoDay(t.departureAt) <= a.to && t.remaining.pallets >= a.pallets));
    alarmHits(hits);
  }, [trips, alarmHits]);

  if (all.loading) return <div className="book"><Skeleton h={500} /><Skeleton h={500} /><Skeleton h={500} /></div>;
  if (all.error) return <div className="pagepad"><ErrorBox error={all.error} onRetry={all.reload} /></div>;

  return (
    <div className="book">
      {/* ----- sol: rota · palet · seferler (gün gruplu) ----- */}
      <aside className="panel list-pane book-pane" aria-label="Gönderi seçimi ve seferler">
        <div className="pane-head">
          <div style={{ minWidth: 0 }}><span className="eyebrow">Palet gönder</span>{who && <div className="who-line" title={who}>{who}</div>}</div>
          <div className="row between"><span className="mini-l">Palet adedi</span><Stepper value={pallets} min={1} max={33} onChange={setPallets} label="Palet adedi" testId="pallets" /></div>
          <div className="comp-field"><span className="mini-l">Nereden</span>
            <ChipSelect size="sm" ariaLabel="Çıkış" value={origin} options={Object.keys(origins).map((c) => ({ value: c, label: c }))}
              onChange={(v) => { setOrigin(v); const d = Object.keys(countBy(trips.filter((t) => place(t.origin) === v).map((t) => place(t.destination)))); if (!dest || !d.includes(dest)) setDest(d[0] ?? null); setTripId(null); }} />
          </div>
          <div className="comp-field"><span className="mini-l"><ArrowRight size={11} /> Nereye</span>
            <ChipSelect size="sm" ariaLabel="Varış" value={dest} options={Object.keys(dests).map((c) => ({ value: c, label: c }))} onChange={(v) => { setDest(v); setTripId(null); }} />
          </div>
        </div>
        <div className="pane-scroll">
          {!routeTrips.length && (
            <div className="mini-empty">
              <BellRing size={22} />
              <p>Bu rotada yayında sefer yok.</p>
              <button className="btn sm primary" onClick={() => setAlarmFor(today())}><BellRing size={14} />Boş yer alarmı kur</button>
            </div>
          )}
          {groups.map((g) => (
            <div key={g.d}>
              <div className="group-h row between"><span>{g.label}</span>{Number.isFinite(g.min) ? <span className="group-min">en düşük {tl(g.min).replace(",00", "")}</span> : <span className="group-min full">dolu</span>}</div>
              {g.list.map((t) => {
                const fits = t.remaining.pallets >= pallets;
                return (
                  <button key={t.id} className={`trow ${t.id === tripId ? "on" : ""} ${fits ? "" : "dim"}`} onClick={() => setTripId(t.id)} data-testid="trip-row">
                    {t.id === best && <span className="trow-best">En uygun</span>}
                    <div className="trow-top"><b className="trow-time">{time(t.departureAt)}</b><span className="trow-price"><RollNumber value={t.price.unitPriceMinor} format={(n) => tl(n).replace(",00", "")} /><small>/palet</small></span></div>
                    <div className="trow-sub">{t.carrier.name} · {t.vehicleType.name}</div>
                    <Meters t={t} />
                    {!fits && <div className="tiny warnc">Yalnızca {t.remaining.pallets} palet yer var</div>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="pane-foot"><button className="link small" onClick={() => setAlarmFor(trip ? isoDay(trip.departureAt) : today())}><BellRing size={13} /> Bu rota için boş yer alarmı</button></div>
      </aside>

      {trip ? <TripAndQuote key={trip.id} trip={trip} pallets={pallets} setPallets={setPallets} onDone={onDone} displayName={displayName ?? ""} />
        : <><section className="panel"><Empty title="Sefer seçin" text="Soldan rota ve sefer seçtiğinizde araçtaki yeriniz ve teklif burada görünür." /></section><aside className="noir quote-pane" /></>}

      {alarmFor && origin && dest && (
        <AlarmModal origin={origin} dest={dest} date={alarmFor} pallets={pallets} onClose={() => setAlarmFor(null)} />
      )}
    </div>
  );
}

function countBy(xs: string[]) { return xs.reduce<Record<string, number>>((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {}); }

function Meters({ t }: { t: TripCard }) {
  const rows: [string, number, number][] = [["Palet", t.remaining.pallets, t.sellable.pallets], ["kg", t.remaining.kg, t.sellable.kg], ["m³", t.remaining.m3, t.sellable.m3]];
  return (
    <div className="meters">
      {rows.map(([l, r, s]) => {
        const p = s ? r / s : 0;
        return (
          <div key={l} className={`meter ${p < 0.2 ? "low" : ""}`} title={`${l}: ${num(Math.round(r * 10) / 10)} / ${num(s)} boş`}>
            <span className="meter-l">{l} <b>{num(Math.round(r * 10) / 10)}</b></span>
            <span className="meter-b"><i style={{ width: `${Math.max(0, Math.min(100, p * 100))}%` }} /></span>
          </div>
        );
      })}
    </div>
  );
}

/* ================= sefer + beyan + teklif ================= */
function TripAndQuote({ trip, pallets, setPallets, onDone, displayName }: { trip: TripCard; pallets: number; setPallets: (n: number) => void; onDone: (r: Reservation) => void; displayName: string }) {
  const toast = useToast();
  const classes = useFetch(async (s) => {
    const r = await api<{ items?: Pc[] } | Pc[]>("GET", "/catalog/product-classes", undefined, { signal: s });
    return (Array.isArray(r) ? r : r.items ?? []) as Pc[];
  }, []);
  const [kgPer, setKgPer] = useState(500);
  const [kgTotal, setKgTotal] = useState<number | null>(null); // belgeden gelen kesin toplam
  const [foot, setFoot] = useState<keyof typeof FOOT>("EUR");
  const [height, setHeight] = useState(1.2);
  const [m3Override, setM3Override] = useState<number | null>(null);
  const [cls, setCls] = useState("GENEL");
  const [source, setSource] = useState<"manual" | "carton" | "xml">("manual");
  const [fromDoc, setFromDoc] = useState<Set<string>>(new Set());
  const [plan, setPlan] = useState<"full" | "deposit">("full");
  const [cardId, setCardId] = useState<(typeof CARDS)[number]["id"]>("ok");
  const [recips] = useState(loadRecipients);
  const [recipient, setRecipient] = useState<string>("");
  const [addRecipient, setAddRecipient] = useState(false);
  const [showPolicy, setShowPolicy] = useState(false);

  const grossKg = kgTotal ?? pallets * kgPer;
  const volumeM3 = m3Override ?? Math.round(pallets * FOOT[foot].a * height * 10) / 10;
  const [scenario, setScenario] = useState<AlternativeScenario | null>(null);
  const body = useMemo(() => ({ pallets, grossKg, productClassCode: cls, volumeM3, ...(scenario ? { alternativeScenario: scenario } : {}) }), [pallets, grossKg, cls, volumeM3, scenario]);

  const [quote, setQuote] = useState<Quote | null>(null);
  const [qErr, setQErr] = useState<ApiError | null>(null);
  const [qBusy, setQBusy] = useState(false);
  useEffect(() => {
    const ac = new AbortController();
    const t = setTimeout(() => {
      setQBusy(true);
      api<Quote>("POST", `/customer/trips/${trip.id}/quote`, body, { signal: ac.signal })
        .then((q) => { setQuote(q); setQErr(null); })
        .catch((e) => { if (e?.name !== "AbortError") setQErr(e); })
        .finally(() => { if (!ac.signal.aborted) setQBusy(false); });
    }, 350);
    return () => { clearTimeout(t); ac.abort(); };
  }, [body, trip.id]);

  const [idem, setIdem] = useState(() => crypto.randomUUID());
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<ApiError | null>(null);
  /* ---- sözleşme adımı ---- */
  const [contractOpen, setContractOpen] = useState(false);
  const [preview, setPreview] = useState<ContractPreview | null>(null);
  const [pErr, setPErr] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pTick, setPTick] = useState(0);
  const previewKey = JSON.stringify([body, plan, recipient, pTick]);
  useEffect(() => {
    if (!contractOpen) return;
    const ac = new AbortController();
    setPErr(null);
    api<ContractPreview>("POST", `/customer/trips/${trip.id}/contract-preview`,
      { ...body, paymentPlan: plan, ...(recipient ? { recipientName: recipient } : {}) }, { signal: ac.signal })
      .then((p) => { setPreview(p); setPErr(null); })
      .catch((e) => { if (e?.name !== "AbortError") { setPreview(null); setPErr(e); } });
    return () => ac.abort();
  }, [contractOpen, previewKey, trip.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // beyan/plan değişirse (modal açıkken) eski metin geçersiz sayılır
  useEffect(() => { setPreview(null); }, [previewKey]);

  async function submit(signerName: string) {
    if (!preview) return;
    setSubmitting(true); setSubmitErr(null);
    const c = CARDS.find((x) => x.id === cardId)!;
    try {
      const r = await api<Reservation>("POST", "/customer/reservations", {
        tripId: trip.id, ...body, paymentPlan: plan, ...(recipient ? { recipientName: recipient } : {}),
        card: { holder: c.holder, number: c.number, expiry: c.expiry, cvc: c.cvc },
        contract: { version: preview.version, renderedHash: preview.renderedHash, signerName, accepted: true },
      }, { idempotencyKey: idem });
      if (recipient) rememberRecipient(recipient);
      setContractOpen(false);
      toast("Teklifiniz taşıyıcıya iletildi.", "ok");
      onDone(r);
    } catch (e) {
      const err = e as ApiError;
      setIdem(crypto.randomUUID());
      if (err.status === 409 && (err.code === "CONTRACT_STALE" || err.reason === "CONTRACT_STALE")) {
        setNotice("Fiyat veya koşullar değişti. Sözleşme güncellendi; lütfen yeni metni okuyup yeniden onaylayın.");
        setPTick((n) => n + 1);
      } else if (err.reason === "CONTRACT_NOT_ACCEPTED") {
        setNotice("Sözleşme metni doğrulanamadı; güncel metin yüklendi. Lütfen yeniden okuyup onaylayın.");
        setPTick((n) => n + 1);
      } else {
        setContractOpen(false); setSubmitErr(err);
      }
    } finally { setSubmitting(false); }
  }

  function applyDoc(d: Partial<{ pallets: number; grossKg: number; volumeM3: number; cls: string }>, src: "carton" | "xml") {
    const f = new Set<string>();
    if (d.pallets) { setPallets(Math.min(33, d.pallets)); f.add("pallets"); }
    if (d.grossKg) { setKgTotal(Math.round(d.grossKg)); f.add("kg"); }
    if (d.volumeM3) { setM3Override(Math.round(d.volumeM3 * 10) / 10); f.add("m3"); }
    if (d.cls && (classes.data ?? []).some((c) => c.code === d.cls)) { setCls(d.cls); f.add("cls"); }
    setFromDoc(f); setSource(src);
  }

  const positions = trip.vehicleType.palletPositions;
  const pcs = classes.data?.length ? classes.data : [{ code: "GENEL", name: "Genel kuru yük" }];
  const declined = submitErr?.reason === "PAYMENT_DECLINED";
  const due = quote?.paymentPlans.find((p) => p.code === plan);
  const Tag = ({ k }: { k: string }) => (fromDoc.has(k) ? <span className="doc-tag">Belgeden</span> : null);

  return (
    <>
      {/* ----- orta: sefer + harita + beyan ----- */}
      <section className="panel center-pane" aria-label="Seçili sefer">
        <div className="pane-scroll">
          <header className="trip-head">
            <div>
              <div className="eyebrow">{trip.carrier.name} · <span className="mono">{trip.reference}</span></div>
              <h1 className="route-h" data-testid="route">{place(trip.origin)} <span className="arrow">→</span> {place(trip.destination)}</h1>
              <div className="sub">{trip.origin.name} → {trip.destination.name}</div>
            </div>
            <div className="trip-times">
              <div><span className="eyebrow">Kalkış</span><b>{full(trip.departureAt)}</b></div>
              <div><span className="eyebrow">Tahmini varış</span><b>{full(trip.arrivalEta)}</b></div>
            </div>
          </header>
          <div className="cut-row">
            <span className="cut">Son rezervasyon (T−3) <b>{time(trip.bookingCutoffAt)}</b><Countdown to={trip.bookingCutoffAt} prefix="·" /></span>
            <span className="cut">Çıkış deposu son kabul (T−1) <b>{time(trip.intakeCutoffAt)}</b></span>
            <span className="cut ghost">{trip.vehicleType.name}</span>
          </div>

          <TruckMap positions={positions} cells={customerCells(positions, trip.sellable.pallets, trip.remaining.pallets, pallets)}
            caption={`${pallets} paletiniz önizleniyor`} />
          <Meters t={trip} />

          <div className="decl">
            <div className="decl-head">
              <h3 className="h3">Yük beyanı</h3>
              <Segmented ariaLabel="Beyan kaynağı" value={source} onChange={setSource} options={[
                { value: "manual", label: <><SlidersHorizontal size={13} /> Seçerek</> },
                { value: "carton", label: <><Boxes size={13} /> Koliden hesapla</> },
                { value: "xml", label: <><FileCode2 size={13} /> e-İrsaliye</> },
              ]} />
            </div>
            {source === "carton" && <CartonCalc onApply={(r) => applyDoc({ pallets: r.estimatedPallets, grossKg: r.totalWeightKg, volumeM3: r.totalVolumeM3 }, "carton")} />}
            {source === "xml" && <XmlDrop onApply={(d) => applyDoc({ pallets: d.pallets ?? undefined, grossKg: d.grossKg ?? undefined, volumeM3: d.volumeM3 ?? undefined, cls: d.productHint ?? undefined }, "xml")} />}

            <div className="decl-grid">
              <div className="decl-f"><span className="lbl">Palet tipi</span>
                <ChipSelect size="sm" value={foot} onChange={(v) => { setFoot(v); setM3Override(null); }} options={(Object.keys(FOOT) as (keyof typeof FOOT)[]).map((k) => ({ value: k, label: FOOT[k].l }))} />
              </div>
              <div className="decl-f"><span className="lbl">Yükseklik <Tag k="m3" /></span>
                <ChipSelect size="sm" value={m3Override == null ? height : null} onChange={(v) => { setHeight(v); setM3Override(null); }} options={HEIGHTS.map((h) => ({ value: h.v, label: h.l }))} />
                <span className="hint">≈ {num(volumeM3)} m³</span>
              </div>
              <div className="decl-f"><span className="lbl">Palet başı ağırlık <Tag k="kg" /></span>
                <div className="row wrap" style={{ gap: 8 }}>
                  <ChipSelect size="sm" value={kgTotal == null ? kgPer : null} onChange={(v) => { setKgPer(v); setKgTotal(null); }} options={KG_PRESETS.map((k) => ({ value: k, label: `${k} kg` }))} />
                  <Stepper value={grossKg} min={1} max={24000} step={10} unit=" kg" label="Toplam brüt ağırlık" onChange={(v) => setKgTotal(v)} />
                </div>
              </div>
              <div className="decl-f"><span className="lbl">Ürün sınıfı <Tag k="cls" /></span>
                <ChipSelect size="sm" value={cls} onChange={setCls} options={pcs.map((c) => ({ value: c.code, label: c.name }))} />
              </div>
              <div className="decl-f wide"><span className="lbl">Varışta teslim alacak kişi</span>
                <div className="row wrap" style={{ gap: 8 }}>
                  <ChipSelect size="sm" value={recipient} onChange={setRecipient}
                    options={[{ value: "", label: "Firmamız (ben)" }, ...[...new Set([...recips, ...(recipient && !recips.includes(recipient) ? [recipient] : [])])].map((r) => ({ value: r, label: r }))]} />
                  {addRecipient ? (
                    <form className="inline-add" onSubmit={(e) => { e.preventDefault(); const v = new FormData(e.currentTarget).get("n")?.toString().trim(); if (v) setRecipient(v); setAddRecipient(false); }}>
                      <input name="n" className="input sm" placeholder="Ad Soyad" autoFocus maxLength={120} />
                      <button className="btn sm">Ekle</button><button type="button" className="link" aria-label="Vazgeç" onClick={() => setAddRecipient(false)}><X size={14} /></button>
                    </form>
                  ) : <button type="button" className="pick add" onClick={() => setAddRecipient(true)}><Plus size={13} />Yeni alıcı</button>}
                </div>
              </div>
            </div>
            <div className="note"><Info size={14} />Yükü çıkış transfer merkezine siz getirirsiniz; varış merkezinden siz veya yetkili alıcınız teslim alır.</div>
          </div>
        </div>
      </section>

      {/* ----- sağ: noir teklif paneli ----- */}
      <aside className="noir quote-pane" aria-label="Teklif özeti">
        <div className="pane-scroll">
          <div className="row between"><span className="eyebrow light">Teklif özeti</span>{qBusy && <span className="tiny light">hesaplanıyor…</span>}</div>
          {qErr ? <ErrorBox error={qErr} /> : !quote ? <Skeleton h={120} /> : (
            <>
              <div className="q-price" data-testid="quote-total"><RollNumber value={quote.price.totalPriceMinor} format={tl} /></div>
              <div className="q-sub">{num(pallets)} palet × {tl(quote.price.unitPriceMinor)} · {num(grossKg)} kg · {num(volumeM3)} m³</div>
              <div className="row between q-meta"><PricePop price={quote.price} /><Countdown to={quote.quoteExpiresAt} prefix="Fiyat sabit:" /></div>
              <CarbonBadge carbon={quote.carbon} variant="dark" />
              <div className="carbon-q">
                <span className="eyebrow light">Bu yükü CargoPact olmasaydı nasıl gönderirdiniz? <small>(isteğe bağlı)</small></span>
                <div className="q-plans" role="group" aria-label="Alternatif gönderim senaryosu" style={{ marginTop: 6 }}>
                  {([["dedicated", "Ayrı araçla"], ["groupage", "Parsiyel / ambar ile"], [null, "Belirtmek istemiyorum"]] as [AlternativeScenario | null, string][]).map(([v, l]) => (
                    <OptionCard key={String(v)} on={scenario === v} onClick={() => setScenario(v)}><b>{l}</b></OptionCard>
                  ))}
                </div>
              </div>
              {!quote.eligible && (
                <div className="alert err" role="alert"><div><b>Bu yük bu sefere uygun değil</b>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{quote.reasons.map((r) => <li key={r.code}>{r.message}</li>)}</ul></div></div>
              )}
              <div className="q-sec">
                <span className="eyebrow light">Ödeme planı</span>
                <div className="q-plans">
                  {quote.paymentPlans.map((p) => (
                    <OptionCard key={p.code} on={plan === p.code} onClick={() => setPlan(p.code)}>
                      <b>{p.code === "full" ? "Peşin" : `%${p.depositPercent ?? 30} kapora`}</b>
                      <small>Şimdi {tl(p.dueNowMinor)}{p.remainingMinor ? ` · kalan ${tl(p.remainingMinor)}` : ""}</small>
                    </OptionCard>
                  ))}
                </div>
              </div>
              <div className="q-sec">
                <span className="eyebrow light"><CreditCard size={11} /> Ödeme yöntemi (simüle)</span>
                <div className="q-cards">
                  {CARDS.map((c) => (
                    <button key={c.id} type="button" className={`paycard ${cardId === c.id ? "on" : ""}`} onClick={() => setCardId(c.id)} aria-pressed={cardId === c.id}>
                      <span className="pc-brand">{c.brand}</span>
                      <span className="mono pc-no">•••• {c.last4}</span>
                      <span className="pc-l">{c.label}<small>{c.note}</small></span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="q-sec">
                <button type="button" className="policy-t" onClick={() => setShowPolicy((x) => !x)} aria-expanded={showPolicy}>
                  İptal: {quote.cancellationPolicy[0]?.label.toLocaleLowerCase("tr-TR")} %{quote.cancellationPolicy[0]?.refundPercent} iade <span>{showPolicy ? "−" : "+"}</span>
                </button>
                {showPolicy && quote.cancellationPolicy.map((c, i) => (
                  <div key={i} className="row between policy-r"><span>{c.label}</span><b>%{c.refundPercent}</b></div>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="quote-foot">
          {submitErr && (
            <ErrorBox error={declined ? new ApiError("Kartınız reddedildi. Diğer kartı seçin.", 402, undefined, submitErr.correlationId)
              : submitErr.status === 409 ? new ApiError("Bu sırada kapasite doldu veya sefer değişti. Lütfen yeniden kontrol edin.", 409, undefined, submitErr.correlationId)
              : submitErr} />
          )}
          <button className="btn cta block" disabled={!quote || !quote.eligible || submitting} onClick={() => { setNotice(null); setPreview(null); setContractOpen(true); }} data-testid="accept">
            {submitting ? "Gönderiliyor…" : <>Teklifi kabul et{due ? ` · ${tl(due.dueNowMinor)}` : ""} <Check size={18} /></>}
          </button>
          <div className="tiny light center">Taşıyıcı onayına kadar tutar yalnızca provizyonda bekler.</div>
        </div>
      </aside>
      {contractOpen && (
        <ContractSignModal preview={preview} busy={submitting} error={pErr} notice={notice} defaultName={displayName}
          ctaLabel="Sözleşmeyi onayla ve teklifi gönder" onClose={() => setContractOpen(false)} onSign={submit} />
      )}
    </>
  );
}

/* ---------- koliden palet hesabı (sunucu: /customer/shipments/estimate-pallets) ---------- */
type Est = { totalVolumeM3: number; totalWeightKg: number; estimatedPallets: number; warnings: string[] };
function CartonCalc({ onApply }: { onApply: (r: Est) => void }) {
  const pk = useFetch(async (s) => (await api<{ items: Pk[] }>("GET", "/catalog/packaging-types", undefined, { signal: s })).items, []);
  const pallets = (pk.data ?? []).filter((x) => x.kind === "pallet");
  const cartons = (pk.data ?? []).filter((x) => x.kind === "carton");
  const [pal, setPal] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [res, setRes] = useState<Est | null>(null);
  const [err, setErr] = useState<ApiError | null>(null);
  useEffect(() => { if (!pal && pallets[0]) setPal(pallets[0].id); }, [pallets, pal]);
  const lines = Object.entries(counts).filter(([, n]) => n > 0);
  useEffect(() => {
    if (!pal || !lines.length) { setRes(null); return; }
    const ac = new AbortController();
    const t = setTimeout(() => api<Est>("POST", "/customer/shipments/estimate-pallets", { palletTypeId: pal, cartons: lines.map(([id, count]) => ({ packagingTypeId: id, count })) }, { signal: ac.signal })
      .then((r) => { setRes(r); setErr(null); }).catch((e) => { if (e?.name !== "AbortError") setErr(e); }), 300);
    return () => { clearTimeout(t); ac.abort(); };
  }, [pal, JSON.stringify(lines)]); // eslint-disable-line react-hooks/exhaustive-deps
  if (pk.loading) return <Skeleton h={60} />;
  if (pk.error) return <ErrorBox error={pk.error} />;
  return (
    <div className="calc">
      <ChipSelect size="sm" value={pal} onChange={setPal} options={pallets.map((p) => ({ value: p.id, label: p.name }))} />
      <div className="calc-lines">
        {cartons.map((c) => (
          <div key={c.id} className="calc-line"><span>{c.name}</span>
            <Stepper value={counts[c.id] ?? 0} min={0} max={100000} step={10} unit=" koli" onChange={(v) => setCounts((x) => ({ ...x, [c.id]: v }))} /></div>
        ))}
      </div>
      {err && <ErrorBox error={err} />}
      {res && (
        <div className="calc-res">
          <span><b>{res.estimatedPallets}</b> palet · <b>{num(Math.round(res.totalWeightKg))}</b> kg · <b>{num(Math.round(res.totalVolumeM3 * 10) / 10)}</b> m³</span>
          <button className="btn sm primary" onClick={() => onApply(res)}>Beyana uygula</button>
          {res.warnings.map((w) => <div key={w} className="tiny warnc">{w}</div>)}
        </div>
      )}
    </div>
  );
}

/* ---------- e-İrsaliye XML ---------- */
function XmlDrop({ onApply }: { onApply: (d: Declaration) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [d, setD] = useState<Declaration | null>(null);
  const [err, setErr] = useState("");
  const [over, setOver] = useState(false);
  async function read(f: File | undefined) {
    if (!f) return;
    setErr(""); setD(null);
    try { setD(parseDespatchAdvice(await f.text())); } catch (e) { setErr((e as Error).message); }
  }
  return (
    <div className="calc">
      <button type="button" className={`drop ${over ? "over" : ""}`} onClick={() => ref.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void read(e.dataTransfer.files[0]); }}>
        <FileCode2 size={20} /><span><b>e-İrsaliye XML</b> dosyasını bırakın veya seçin<small>UBL-TR DespatchAdvice · dosya tarayıcınızda okunur, sunucuya gönderilmez</small></span>
      </button>
      <input ref={ref} type="file" accept=".xml,application/xml,text/xml" hidden onChange={(e) => void read(e.target.files?.[0])} />
      {err && <div className="alert err">{err}</div>}
      {d && (
        <div className="calc-res">
          <span>{d.despatchId && <span className="mono">{d.despatchId} · </span>}
            <b>{d.pallets ?? "?"}</b> palet · <b>{d.grossKg != null ? num(Math.round(d.grossKg)) : "?"}</b> kg{d.volumeM3 != null && <> · <b>{num(d.volumeM3)}</b> m³</>}
            {d.items.length > 0 && <small className="block">{d.items.slice(0, 3).join(", ")}{d.items.length > 3 ? "…" : ""}</small>}</span>
          <button className="btn sm primary" onClick={() => onApply(d)}>Beyana uygula</button>
        </div>
      )}
    </div>
  );
}

/* ---------- boş yer alarmı ---------- */
function AlarmModal({ origin, dest, date, pallets: p0, onClose }: { origin: string; dest: string; date: string; pallets: number; onClose: () => void }) {
  const toast = useToast();
  const [win, setWin] = useState<1 | 3 | 7>(3);
  const [pallets, setPallets] = useState(p0);
  function save() {
    const from = addDays(date, -win) < today() ? today() : addDays(date, -win);
    const a: Alarm = { id: crypto.randomUUID(), origin, destination: dest, from, to: addDays(date, win), pallets, createdAt: new Date().toISOString() };
    saveAlarms([a, ...loadAlarms()].slice(0, 20));
    toast("Alarm kuruldu. Yer açıldığında burada haber vereceğiz.", "ok");
    onClose();
  }
  return (
    <Modal title="Boş yer alarmı" onClose={onClose}>
      <div className="col" style={{ gap: 16 }}>
        <div className="route-h sm">{origin} → {dest}</div>
        <div><span className="lbl">Tarih aralığı · {dayNum(date)} çevresi</span>
          <ChipSelect value={win} onChange={setWin} options={[{ value: 1, label: "±1 gün" }, { value: 3, label: "±3 gün" }, { value: 7, label: "±7 gün" }]} /></div>
        <div><span className="lbl">Palet</span><Stepper value={pallets} min={1} max={33} onChange={setPallets} /></div>
        <div className="tiny">Alarm bu tarayıcıda saklanır; uygun yer açıldığında (iptal, ret, süre aşımı ya da yeni sefer) uygulamayı açtığınızda üstte bildirim görürsünüz.</div>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn" onClick={onClose}>Vazgeç</button>
          <button className="btn primary" onClick={save}><BellRing size={15} />Alarmı kur</button>
        </div>
      </div>
    </Modal>
  );
}
