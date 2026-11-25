import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, ArrowRight, CalendarClock, Check, CreditCard, LogOut, MessageSquare, PackageSearch, Search, Ship, Truck, Warehouse, Ban,
} from "lucide-react";
import { api, ApiError } from "./api";
import type { Quote, Reservation, TripCard } from "./types";
import { dt, day, full, num, time, tl } from "./format";
import {
  Empty, ErrorBox, Field, MiniBars, Modal, PricePop, QrVisual, SkeletonCards, StatusBadge, errText, useFetch, useToast, Skeleton,
} from "./ui";
import { Chat } from "./Chat";

type View =
  | { name: "search" } | { name: "trip"; id: string; pallets: number } | { name: "done"; r: Reservation }
  | { name: "list" } | { name: "res"; id: string } | { name: "track"; order?: string } | { name: "chat" };

export function CustomerPortal({ displayName, tenant, onLogout }: { displayName: string; tenant?: string; onLogout: () => void }) {
  const [view, setView] = useState<View>({ name: "search" });
  const tab = view.name === "trip" || view.name === "search" || view.name === "done" ? "search" : view.name === "res" ? "list" : view.name;
  const nav: [string, string, React.ReactNode][] = [
    ["search", "Palet gönder", <Truck size={16} />], ["list", "Rezervasyonlarım", <CalendarClock size={16} />],
    ["track", "Yük takibi", <PackageSearch size={16} />], ["chat", "Asistan", <MessageSquare size={16} />],
  ];
  return (
    <>
      <header className="topnav">
        <div className="topnav-in">
          <div className="logo"><div className="logo-mark"><Ship size={17} /></div>CargoPact</div>
          <nav className="navlinks">
            {nav.map(([k, l, ic]) => (
              <button key={k} className={`navlink ${tab === k ? "on" : ""}`} onClick={() => setView({ name: k } as View)}>{ic}{l}</button>
            ))}
          </nav>
          <div className="small" style={{ textAlign: "right" }}>
            <b>{displayName}</b>{tenant && <div className="tiny">{tenant}</div>}
          </div>
          <button className="btn sm" onClick={onLogout}><LogOut size={14} />Çıkış</button>
        </div>
      </header>
      {view.name === "search" && <SearchView onOpen={(id, pallets) => setView({ name: "trip", id, pallets })} />}
      {view.name === "trip" && (
        <TripDetail id={view.id} initialPallets={view.pallets} onBack={() => setView({ name: "search" })} onDone={(r) => setView({ name: "done", r })} />
      )}
      {view.name === "done" && <Done r={view.r} onList={() => setView({ name: "res", id: view.r.id })} onNew={() => setView({ name: "search" })} />}
      {view.name === "list" && <ResList onOpen={(id) => setView({ name: "res", id })} onSearch={() => setView({ name: "search" })} />}
      {view.name === "res" && <ResDetail id={view.id} onBack={() => setView({ name: "list" })} onTrack={(o) => setView({ name: "track", order: o })} />}
      {view.name === "track" && <Tracking initial={view.order} />}
      {view.name === "chat" && (
        <Chat prompts={["Gebze'den Ankara'ya 3 palet yüküm var, uygun sefer var mı?", "CP-2026-000001 numaralı yüküm nerede?"]} />
      )}
    </>
  );
}

/* ================= SEARCH ================= */
const CITIES = ["Gebze", "Ankara", "Bursa", "Kemalpaşa", "Konya", "Adana", "Çerkezköy", "İzmir", "Mersin", "Gaziantep"];

function SearchView({ onOpen }: { onOpen: (id: string, pallets: number) => void }) {
  const [f, setF] = useState({ originCity: "", destinationCity: "", date: "", pallets: "" });
  const [applied, setApplied] = useState(f);
  const q = new URLSearchParams(Object.entries(applied).filter(([, v]) => v)).toString();
  const { data, error, loading, reload } = useFetch((s) => api<{ items: TripCard[] }>("GET", `/customer/trips${q ? `?${q}` : ""}`, undefined, { signal: s }), [q]);
  const pallets = Number(applied.pallets) || 1;
  return (
    <div className="page">
      <div className="page-head">
        <div className="kicker">Planlı transferlerde boş palet</div>
        <h1 className="title" style={{ fontSize: 40 }}>Yükünüz için doğru araç, doğru rota.</h1>
        <p className="muted" style={{ marginTop: 8, maxWidth: 620 }}>Transfer merkezinden transfer merkezine giden araçlarda boş kalan palet alanını anında fiyatlayın, teklifinizi gönderin.</p>
      </div>
      <form className="card" style={{ marginBottom: 22 }} onSubmit={(e) => { e.preventDefault(); setApplied(f); }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 120px auto", gap: 12, alignItems: "end" }}>
          <Field label="Çıkış şehri"><input className="input" list="cities" placeholder="Gebze" value={f.originCity} onChange={(e) => setF({ ...f, originCity: e.target.value })} /></Field>
          <Field label="Varış şehri"><input className="input" list="cities" placeholder="Ankara" value={f.destinationCity} onChange={(e) => setF({ ...f, destinationCity: e.target.value })} /></Field>
          <Field label="Tarih"><input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="Palet"><input type="number" min={1} className="input" placeholder="3" value={f.pallets} onChange={(e) => setF({ ...f, pallets: e.target.value })} /></Field>
          <button className="btn primary lg"><Search size={16} />Sefer ara</button>
        </div>
        <datalist id="cities">{CITIES.map((c) => <option key={c} value={c} />)}</datalist>
      </form>
      {loading ? <SkeletonCards /> : error ? <ErrorBox error={error} onRetry={reload} /> : !data?.items.length ? (
        <div className="card"><Empty title="Uygun sefer bulunamadı" text="Filtreleri genişletmeyi veya farklı bir tarih denemeyi deneyin." /></div>
      ) : (
        <div>{data.items.map((t) => <TripRow key={t.id} t={t} onOpen={() => onOpen(t.id, pallets)} />)}</div>
      )}
    </div>
  );
}

function TripRow({ t, onOpen }: { t: TripCard; onOpen: () => void }) {
  return (
    <div className="card trip">
      <div>
        <div className="route">{t.origin.city} <ArrowRight size={22} style={{ verticalAlign: -2, color: "var(--champ)" }} /> {t.destination.city}</div>
        <div className="small muted" style={{ marginTop: 6 }}>{t.origin.name} → {t.destination.name}</div>
        <div className="row wrap" style={{ marginTop: 10 }}>
          <span className="badge info">{t.carrier.name}</span>
          <span className="small"><b>{day(t.departureAt)}</b>, kalkış {time(t.departureAt)}</span>
        </div>
        <div className="row wrap" style={{ marginTop: 10, gap: 8 }}>
          <span className="chip">Son rezervasyon (T−3) <b>{time(t.bookingCutoffAt)}</b></span>
          <span className="chip">Çıkış deposu son kabul (T−1) <b>{time(t.intakeCutoffAt)}</b></span>
        </div>
      </div>
      <MiniBars remaining={t.remaining} sellable={t.sellable} />
      <div style={{ textAlign: "right" }}>
        <div className="price-big">{tl(t.price.totalPriceMinor)}</div>
        <div className="small muted">palet başı {tl(t.price.unitPriceMinor)}</div>
        <PricePop price={t.price} />
        <button className="btn primary block" style={{ marginTop: 12 }} onClick={onOpen}>Seç <ArrowRight size={16} /></button>
      </div>
    </div>
  );
}

/* ================= TRIP DETAIL ================= */
function TripDetail({ id, initialPallets, onBack, onDone }: { id: string; initialPallets: number; onBack: () => void; onDone: (r: Reservation) => void }) {
  const toast = useToast();
  const trip = useFetch((s) => api<TripCard>("GET", `/customer/trips/${id}?pallets=${initialPallets}`, undefined, { signal: s }), [id]);
  const classes = useFetch(async (s) => {
    const r = await api<any>("GET", "/catalog/product-classes", undefined, { signal: s });
    return (Array.isArray(r) ? r : r.items ?? []) as { code: string; name: string }[];
  }, []);
  const [pallets, setPallets] = useState(String(initialPallets));
  const [kg, setKg] = useState(String(initialPallets * 500));
  const [m3, setM3] = useState("");
  const [cls, setCls] = useState("GENEL");
  const [plan, setPlan] = useState<"full" | "deposit">("full");
  const [recipient, setRecipient] = useState("");
  const [card, setCard] = useState({ holder: "Marmara Ambar", number: "4242 4242 4242 4242", expiry: "12/30", cvc: "123" });
  const [quote, setQuote] = useState<Quote | null>(null);
  const [qErr, setQErr] = useState<ApiError | null>(null);
  const [qBusy, setQBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<ApiError | null>(null);
  const [idem, setIdem] = useState(() => crypto.randomUUID());

  const body = useMemo(() => ({
    pallets: Number(pallets), grossKg: Number(kg), productClassCode: cls, ...(m3 ? { volumeM3: Number(m3) } : {}),
  }), [pallets, kg, m3, cls]);
  const valid = Number.isInteger(body.pallets) && body.pallets > 0 && body.grossKg > 0 && (!m3 || Number(m3) > 0);

  useEffect(() => {
    if (!valid) { setQuote(null); return; }
    const ac = new AbortController();
    const t = setTimeout(() => {
      setQBusy(true);
      api<Quote>("POST", `/customer/trips/${id}/quote`, body, { signal: ac.signal })
        .then((q) => { setQuote(q); setQErr(null); })
        .catch((e) => { if (e?.name !== "AbortError") setQErr(e); })
        .finally(() => { if (!ac.signal.aborted) setQBusy(false); });
    }, 450);
    return () => { clearTimeout(t); ac.abort(); };
  }, [body, valid, id]);

  async function submit() {
    setSubmitting(true); setSubmitErr(null);
    try {
      const r = await api<Reservation>("POST", "/customer/reservations", {
        tripId: id, ...body, paymentPlan: plan, ...(recipient ? { recipientName: recipient } : {}), card,
      }, { idempotencyKey: idem });
      toast("Teklifiniz taşıyıcıya iletildi.", "ok");
      onDone(r);
    } catch (e) {
      const err = e as ApiError;
      setSubmitErr(err);
      if (err.reason === "PAYMENT_DECLINED") setIdem(crypto.randomUUID()); // yeni deneme = yeni eylem
      else if (err.status === 409 || err.status === 400) setIdem(crypto.randomUUID());
    } finally { setSubmitting(false); }
  }

  const t = trip.data;
  const declined = submitErr?.reason === "PAYMENT_DECLINED";
  return (
    <div className="page">
      <button className="link small" onClick={onBack} style={{ marginBottom: 14 }}><ArrowLeft size={14} style={{ verticalAlign: -2 }} /> Seferlere dön</button>
      {trip.loading ? <SkeletonCards n={1} h={300} /> : trip.error ? <ErrorBox error={trip.error} onRetry={trip.reload} /> : t && (
        <div className="detail">
          <div className="col" style={{ gap: 20 }}>
            <div>
              <div className="kicker">{t.carrier.name} · {t.reference}</div>
              <h1 className="title" style={{ fontSize: 46, marginTop: 4 }}>{t.origin.city} → {t.destination.city}</h1>
              <div className="muted" style={{ marginTop: 8 }}>{t.origin.name} → {t.destination.name}</div>
            </div>
            <div className="card">
              <div className="grid2">
                <div><div className="tiny">KALKIŞ</div><div className="serif" style={{ fontSize: 22 }}>{full(t.departureAt)}</div></div>
                <div><div className="tiny">TAHMİNİ VARIŞ</div><div className="serif" style={{ fontSize: 22 }}>{full(t.arrivalEta)}</div></div>
              </div>
              <hr className="hr" />
              <div className="row wrap">
                <span className="chip">Son rezervasyon (T−3) <b>{time(t.bookingCutoffAt)}</b></span>
                <span className="chip">Çıkış deposu son kabul (T−1) <b>{time(t.intakeCutoffAt)}</b></span>
                <span className="chip"><Truck size={13} />{t.vehicleType.name}</span>
              </div>
            </div>
            <div className="card">
              <h3 className="serif" style={{ fontSize: 22, marginBottom: 14 }}>Boş kapasite</h3>
              <MiniBars remaining={t.remaining} sellable={t.sellable} />
            </div>
            <div className="card">
              <h3 className="serif" style={{ fontSize: 22, marginBottom: 14 }}>Yük beyanı</h3>
              <div className="grid2">
                <Field label="Palet adedi"><input type="number" min={1} className="input" value={pallets} onChange={(e) => setPallets(e.target.value)} /></Field>
                <Field label="Brüt ağırlık (kg)"><input type="number" min={1} className="input" value={kg} onChange={(e) => setKg(e.target.value)} /></Field>
                <Field label="Hacim (m³, isteğe bağlı)"><input type="number" min={0} step="0.1" className="input" value={m3} onChange={(e) => setM3(e.target.value)} /></Field>
                <Field label="Ürün sınıfı">
                  <select className="input" value={cls} onChange={(e) => setCls(e.target.value)}>
                    {(classes.data?.length ? classes.data : [{ code: "GENEL", name: "Genel yük" }]).map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                  </select>
                </Field>
                <div style={{ gridColumn: "1 / -1" }}>
                  <Field label="Yetkili alıcı (varışta teslim alacak kişi, isteğe bağlı)"><input className="input" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Ad Soyad" /></Field>
                </div>
              </div>
              <div className="alert info" style={{ marginTop: 14 }}>Yükü çıkış transfer merkezine siz getirirsiniz; varış merkezinden siz veya yetkili alıcınız teslim alır.</div>
            </div>
          </div>

          {/* Sticky summary */}
          <aside className="sticky">
            <div className="summary col" style={{ gap: 14 }}>
              <div className="row between"><b className="serif" style={{ fontSize: 22 }}>Teklif özeti</b>{qBusy && <span className="tiny">hesaplanıyor…</span>}</div>
              {!valid ? <div className="alert info">Palet ve ağırlık girin, fiyat anında hesaplansın.</div>
                : qErr ? <ErrorBox error={qErr} />
                : !quote ? <Skeleton h={110} />
                : (
                  <>
                    <div>
                      <div className="price-big" style={{ fontSize: 36 }}>{tl(quote.price.totalPriceMinor)}</div>
                      <div className="small muted">{num(body.pallets)} palet × {tl(quote.price.unitPriceMinor)}</div>
                      <PricePop price={quote.price} />
                    </div>
                    {!quote.eligible && (
                      <div className="alert err" role="alert">
                        <div><b>Bu yük bu sefere uygun değil</b>
                          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{quote.reasons.map((r) => <li key={r.code}>{r.message}</li>)}</ul>
                        </div>
                      </div>
                    )}
                    <div className="small muted">Fiyat {time(quote.quoteExpiresAt)} saatine kadar sabit.</div>
                    <hr className="hr" style={{ margin: "4px 0" }} />
                    <div className="field"><label>Ödeme planı</label>
                      {quote.paymentPlans.map((p) => (
                        <label key={p.code} className="card flat" style={{ padding: 12, cursor: "pointer", borderColor: plan === p.code ? "var(--c6)" : undefined, background: plan === p.code ? "var(--c0)" : undefined, display: "flex", gap: 10 }}>
                          <input type="radio" checked={plan === p.code} onChange={() => setPlan(p.code)} />
                          <div className="grow"><b>{p.label}</b>
                            <div className="small muted">Şimdi {tl(p.dueNowMinor)}{p.remainingMinor ? ` · kalan ${tl(p.remainingMinor)} (T−1 öncesi)` : ""}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                    <div>
                      <div className="tiny" style={{ marginBottom: 4 }}>İPTAL POLİTİKASI</div>
                      {quote.cancellationPolicy.map((c, i) => (
                        <div key={i} className="row between small" style={{ padding: "4px 0", borderBottom: "1px dashed var(--line)" }}><span>{c.label}</span><b>%{c.refundPercent} iade</b></div>
                      ))}
                    </div>
                    <hr className="hr" style={{ margin: "4px 0" }} />
                    <div className="field"><label><CreditCard size={12} style={{ verticalAlign: -1 }} /> Kart bilgileri (simüle)</label>
                      <input className="input" placeholder="Kart sahibi" value={card.holder} onChange={(e) => setCard({ ...card, holder: e.target.value })} />
                      <input className="input mono" placeholder="Kart numarası" value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value })} />
                      <div className="grid2">
                        <input className="input" placeholder="AA/YY" value={card.expiry} onChange={(e) => setCard({ ...card, expiry: e.target.value })} />
                        <input className="input" placeholder="CVC" value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value })} />
                      </div>
                      <div className="tiny">Demo: 4242 4242 4242 4242 başarılı, 4000 0000 0000 0002 reddedilir.</div>
                    </div>
                  </>
                )}
              {submitErr && (
                <ErrorBox error={declined ? new ApiError("Kartınız reddedildi. Başka bir kart deneyin.", 402, undefined, submitErr.correlationId)
                  : submitErr.status === 409 ? new ApiError("Bu sırada kapasite doldu veya sefer değişti. Lütfen yeniden kontrol edin.", 409, undefined, submitErr.correlationId)
                  : submitErr} />
              )}
              <button className="btn primary lg block" disabled={!quote || !quote.eligible || submitting || !valid} onClick={submit}>
                {submitting ? "Gönderiliyor…" : <>Teklifi kabul et <Check size={18} /></>}
              </button>
              <div className="tiny" style={{ textAlign: "center" }}>Taşıyıcı onayına kadar tutar yalnızca provizyonda bekler.</div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

/* ================= DONE ================= */
function Done({ r, onList, onNew }: { r: Reservation; onList: () => void; onNew: () => void }) {
  return (
    <div className="page" style={{ maxWidth: 640 }}>
      <div className="card" style={{ textAlign: "center", padding: 40 }}>
        <div className="empty" style={{ padding: 0 }}><div className="ic" style={{ background: "var(--m1)", color: "var(--m6)" }}><Check size={28} /></div></div>
        <div className="kicker">Teklifiniz alındı</div>
        <h1 className="title" style={{ margin: "6px 0 14px" }}>{r.trip.origin.city} → {r.trip.destination.city}</h1>
        <div className="mono" style={{ fontSize: 22, color: "var(--c8)" }}>{r.reference}</div>
        <div style={{ margin: "14px 0" }}><StatusBadge status={r.status} label={r.statusLabel || "Taşıyıcı onayı bekliyor"} /></div>
        <p className="muted">{num(r.pallets)} palet · {tl(r.totalPriceMinor)}. Taşıyıcı onayladığında sipariş numaranız ve palet QR kodlarınız burada görünür.</p>
        <div className="row" style={{ justifyContent: "center", marginTop: 24 }}>
          <button className="btn primary" onClick={onList}>Rezervasyonu görüntüle</button>
          <button className="btn" onClick={onNew}>Yeni sefer ara</button>
        </div>
      </div>
    </div>
  );
}

/* ================= RESERVATIONS ================= */
function ResList({ onOpen, onSearch }: { onOpen: (id: string) => void; onSearch: () => void }) {
  const { data, error, loading, reload } = useFetch((s) => api<{ items: Reservation[] }>("GET", "/customer/reservations", undefined, { signal: s }), [], 8000);
  return (
    <div className="page">
      <div className="page-head"><div className="kicker">Teklifler ve siparişler</div><h1 className="title">Rezervasyonlarım</h1></div>
      {loading ? <SkeletonCards /> : error ? <ErrorBox error={error} onRetry={reload} /> : !data?.items.length ? (
        <div className="card"><Empty title="Henüz rezervasyonunuz yok" text="İlk yükünüz için uygun bir sefer bulun." />
          <div style={{ textAlign: "center" }}><button className="btn primary" onClick={onSearch}>Sefer ara</button></div></div>
      ) : (
        <div className="col">{data.items.map((r) => (
          <button key={r.id} className="card" onClick={() => onOpen(r.id)} style={{ textAlign: "left", cursor: "pointer", font: "inherit" }}>
            <div className="row between wrap">
              <div>
                <div className="route" style={{ fontSize: 24 }}>{r.trip.origin.city} → {r.trip.destination.city}</div>
                <div className="small muted" style={{ marginTop: 4 }}>{dt(r.trip.departureAt)} · {r.trip.carrier.name} · {num(r.pallets)} palet · {num(r.grossKg)} kg</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <StatusBadge status={r.status} label={r.statusLabel} />
                <div style={{ fontWeight: 700, marginTop: 6 }}>{tl(r.totalPriceMinor)}</div>
                <div className="tiny mono">{r.orderNumber ?? r.reference}</div>
              </div>
            </div>
          </button>
        ))}</div>
      )}
    </div>
  );
}

const FLOW = [
  ["TASIYICI_ONAYI_BEKLIYOR", "Onay bekliyor"], ["ONAYLI", "Onaylandı"], ["DEPO_KABUL", "Depo kabul"],
  ["YUKLENDI", "Yüklendi"], ["VARISTA", "Varışta"], ["TESLIM", "Teslim"],
] as const;
export function FlowSteps({ status }: { status: string }) {
  const idx = FLOW.findIndex(([k]) => k === status);
  return (
    <div className="steps">
      {FLOW.map(([k, l], i) => (
        <div key={k} className={`step ${i <= idx ? "done" : ""} ${i === idx ? "cur" : ""}`}>
          <div className="dot">{i <= idx && <Check size={13} />}</div>{l}
        </div>
      ))}
    </div>
  );
}

const ENTRY_LABEL: Record<string, string> = {
  AUTHORIZED: "Provizyon", CAPTURED: "Tahsilat", RELEASED: "Provizyon serbest", REFUNDED: "İade", RETAINED: "İptal ücreti", FAILED: "Başarısız",
};

function ResDetail({ id, onBack, onTrack }: { id: string; onBack: () => void; onTrack: (o: string) => void }) {
  const toast = useToast();
  const { data: r, error, loading, reload } = useFetch((s) => api<Reservation>("GET", `/customer/reservations/${id}`, undefined, { signal: s }), [id], 6000);
  const [cancelOpen, setCancelOpen] = useState(false);
  const failed = r && ["RET", "IPTAL", "SURESI_DOLDU", "GELMEDI", "EKSIK_HASAR"].includes(r.status);
  const cancellable = r && ["TASIYICI_ONAYI_BEKLIYOR", "ONAYLI"].includes(r.status);
  return (
    <div className="page">
      <button className="link small" onClick={onBack} style={{ marginBottom: 14 }}><ArrowLeft size={14} style={{ verticalAlign: -2 }} /> Rezervasyonlarım</button>
      {loading ? <SkeletonCards n={2} h={200} /> : error ? <ErrorBox error={error} onRetry={reload} /> : r && (
        <div className="detail">
          <div className="col" style={{ gap: 20 }}>
            <div>
              <div className="row wrap"><span className="kicker">{r.reference}</span><StatusBadge status={r.status} label={r.statusLabel} /></div>
              <h1 className="title" style={{ fontSize: 44, marginTop: 4 }}>{r.trip.origin.city} → {r.trip.destination.city}</h1>
              <div className="muted" style={{ marginTop: 6 }}>{r.trip.carrier.name} · kalkış {full(r.trip.departureAt)}</div>
            </div>
            {r.orderNumber && (
              <div className="card" style={{ background: "linear-gradient(135deg, var(--c8), var(--c9))", color: "#fff", border: 0 }}>
                <div className="tiny" style={{ color: "#b9c3ef" }}>SİPARİŞ NUMARASI</div>
                <div className="mono" style={{ fontSize: 30 }}>{r.orderNumber}</div>
                <button className="btn sm" style={{ marginTop: 10 }} onClick={() => onTrack(r.orderNumber!)}><PackageSearch size={14} />Yükü takip et</button>
              </div>
            )}
            <div className="card">
              {failed ? (
                <div className="alert err"><div><b>{r.statusLabel}</b>{r.decisionReason && <div>{r.decisionReason}</div>}</div></div>
              ) : <FlowSteps status={r.status} />}
              {r.status === "TASIYICI_ONAYI_BEKLIYOR" && r.holdExpiresAt && <div className="small muted" style={{ marginTop: 14 }}>Kapasite {full(r.holdExpiresAt)} tarihine kadar sizin için bloke.</div>}
              <hr className="hr" />
              <div className="vtl">
                {r.events.length === 0 && <span className="muted">Henüz olay yok.</span>}
                {r.events.map((e, i) => (
                  <div key={i}><b>{e.label}</b> <span className="tiny">{full(e.at)}</span>{e.note && <div className="small muted">{e.note}</div>}</div>
                ))}
              </div>
            </div>
            {r.palletCodes.length > 0 && (
              <div className="card">
                <h3 className="serif" style={{ fontSize: 22, marginBottom: 14 }}>Palet QR kodları</h3>
                <div className="row wrap" style={{ gap: 16 }}>
                  {r.palletCodes.map((c) => (
                    <div key={c} className="col" style={{ alignItems: "center", gap: 6 }}><QrVisual code={c} /><span className="mono small" style={{ fontSize: 12 }}>{c}</span></div>
                  ))}
                </div>
                <div className="tiny" style={{ marginTop: 12 }}>Etiketleri paletlere yapıştırıp çıkış transfer merkezinde okutun.</div>
              </div>
            )}
          </div>
          <aside className="sticky">
            <div className="summary col" style={{ gap: 12 }}>
              <b className="serif" style={{ fontSize: 22 }}>Ödeme ve yük</b>
              <div className="row between small"><span className="muted">Yük</span><b>{num(r.pallets)} palet · {num(r.grossKg)} kg · {r.productClass.name}</b></div>
              <div className="row between small"><span className="muted">Birim fiyat</span><b>{tl(r.unitPriceMinor)}</b></div>
              <div className="row between"><span className="muted">Toplam</span><span className="price-big sm">{tl(r.totalPriceMinor)}</span></div>
              <div className="row between small"><span className="muted">Ödeme planı</span><b>{r.paymentPlan === "deposit" ? `%${r.depositPercent} kapora` : "Peşin"}</b></div>
              <hr className="hr" style={{ margin: "2px 0" }} />
              <div className="tiny">ÖDEME DEFTERİ</div>
              {r.payment.entries.length === 0 ? <span className="small muted">Kayıt yok.</span> : r.payment.entries.map((e, i) => (
                <div key={i} className="row between small" style={{ padding: "4px 0", borderBottom: "1px dashed var(--line)" }}>
                  <span><b>{ENTRY_LABEL[e.type] ?? e.type}</b><div className="tiny">{full(e.at)}{e.reason ? ` · ${e.reason}` : ""}</div></span>
                  <b>{tl(e.amountMinor)}</b>
                </div>
              ))}
              <div className="row between small"><span className="muted">Tahsil edilen</span><b>{tl(r.payment.paidMinor)}</b></div>
              {r.payment.refundedMinor > 0 && <div className="row between small"><span className="muted">İade</span><b>{tl(r.payment.refundedMinor)}</b></div>}
              {r.payment.retainedMinor > 0 && <div className="row between small"><span className="muted">Alıkonulan ücret</span><b>{tl(r.payment.retainedMinor)}</b></div>}
              {cancellable && <button className="btn danger block" onClick={() => setCancelOpen(true)}><Ban size={16} />Rezervasyonu iptal et</button>}
            </div>
          </aside>
          {cancelOpen && <CancelModal id={r.id} onClose={() => setCancelOpen(false)} onDone={() => { setCancelOpen(false); toast("Rezervasyon iptal edildi.", "ok"); reload(); }} />}
        </div>
      )}
    </div>
  );
}

function CancelModal({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const prev = useFetch((s) => api<{ refundMinor: number; feeMinor: number; rule: string }>("GET", `/customer/reservations/${id}/cancel-preview`, undefined, { signal: s }), [id]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);
  const [key] = useState(() => crypto.randomUUID());
  async function go() {
    setBusy(true); setErr(null);
    try { await api("POST", `/customer/reservations/${id}/cancel`, {}, { idempotencyKey: key }); onDone(); }
    catch (e) { setErr(e as ApiError); } finally { setBusy(false); }
  }
  return (
    <Modal title="İptali onaylayın" onClose={onClose}>
      {prev.loading ? <Skeleton h={80} /> : prev.error ? <ErrorBox error={prev.error} /> : prev.data && (
        <div className="col">
          <div className="grid2">
            <div className="card flat"><div className="tiny">İADE</div><div className="price-big sm" style={{ color: "var(--m6)" }}>{tl(prev.data.refundMinor)}</div></div>
            <div className="card flat"><div className="tiny">İPTAL ÜCRETİ</div><div className="price-big sm" style={{ color: prev.data.feeMinor ? "var(--danger)" : undefined }}>{tl(prev.data.feeMinor)}</div></div>
          </div>
          <div className="small muted">{prev.data.rule}</div>
        </div>
      )}
      {err && <div style={{ marginTop: 12 }}><ErrorBox error={err} /></div>}
      <div className="row" style={{ marginTop: 18, justifyContent: "flex-end" }}>
        <button className="btn" onClick={onClose}>Vazgeç</button>
        <button className="btn danger" disabled={busy || !prev.data} onClick={go}>{busy ? "İptal ediliyor…" : "Evet, iptal et"}</button>
      </div>
    </Modal>
  );
}

/* ================= TRACKING ================= */
type Tracking = {
  orderNumber: string; status: string; statusLabel: string; updatedAt: string; nextStep: string;
  steps: { status: string; label: string; done: boolean; at: string | null }[];
  origin: { name: string; city: string }; destination: { name: string; city: string };
  intakeCutoffAt: string; pickupWindow: { from: string; to: string } | null; palletCodes: string[];
};
function Tracking({ initial }: { initial?: string }) {
  const [input, setInput] = useState(initial ?? "");
  const [order, setOrder] = useState(initial ?? "");
  const { data, error, loading, reload } = useFetch(
    (s) => (order ? api<Tracking>("GET", `/customer/orders/${encodeURIComponent(order)}/tracking`, undefined, { signal: s }) : Promise.resolve(null)),
    [order], order ? 6000 : undefined,
  );
  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <div className="page-head"><div className="kicker">Canlı durum</div><h1 className="title">Yük takibi</h1></div>
      <form className="card row" onSubmit={(e) => { e.preventDefault(); setOrder(input.trim().toUpperCase()); }}>
        <input className="input mono" placeholder="CP-2026-000001" value={input} onChange={(e) => setInput(e.target.value)} />
        <button className="btn primary"><Search size={16} />Sorgula</button>
      </form>
      <div style={{ marginTop: 20 }}>
        {!order ? <div className="card"><Empty title="Sipariş numaranızı girin" text="Onaylanan rezervasyonların sipariş numarası CP-2026-… biçimindedir." /></div>
          : loading ? <SkeletonCards n={1} h={200} />
          : error ? <ErrorBox error={error.status === 404 ? new ApiError("Bu sipariş numarasıyla firmanıza ait bir yük bulunamadı.", 404, undefined, error.correlationId) : error} onRetry={reload} />
          : data && (
            <div className="card">
              <div className="row between wrap">
                <div><div className="mono" style={{ fontSize: 22, color: "var(--c8)" }}>{data.orderNumber}</div>
                  <div className="route" style={{ fontSize: 26, marginTop: 4 }}>{data.origin.city} → {data.destination.city}</div></div>
                <StatusBadge status={data.status} label={data.statusLabel} />
              </div>
              <hr className="hr" />
              <div className="steps">
                {data.steps.map((s, i) => (
                  <div key={s.status} className={`step ${s.done ? "done" : ""} ${s.done && !data.steps[i + 1]?.done ? "cur" : ""}`}>
                    <div className="dot">{s.done && <Check size={13} />}</div>{s.label}
                    {s.at && <div className="tiny">{dt(s.at)}</div>}
                  </div>
                ))}
              </div>
              <div className="alert info" style={{ marginTop: 20 }}><Warehouse size={18} /><div><b>Sıradaki adım:</b> {data.nextStep}</div></div>
              <div className="row wrap small muted" style={{ marginTop: 14 }}>
                <span>Çıkış: {data.origin.name} (son kabul {time(data.intakeCutoffAt)})</span>
                <span>Varış: {data.destination.name}</span>
                {data.pickupWindow && <span>Teslim penceresi: {dt(data.pickupWindow.from)} – {time(data.pickupWindow.to)}</span>}
              </div>
              <div className="row wrap" style={{ marginTop: 12 }}>{data.palletCodes.map((c) => <span key={c} className="chip mono">{c}</span>)}</div>
              <div className="tiny" style={{ marginTop: 10 }}>Son güncelleme {full(data.updatedAt)}</div>
            </div>
          )}
      </div>
    </div>
  );
}

