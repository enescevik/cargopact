import { useMemo, useState } from "react";
import {
  AlertTriangle, ArrowRight, Check, LayoutDashboard, Pencil, LogOut, MessageSquare, PackagePlus, ScrollText, Truck, X, Sparkles,
} from "lucide-react";
import { api, sendChat } from "./api";
import type { CarrierTrip } from "./types";
import { dayNum, full, isoDay, num, place, time, tl, today, addDays } from "./format";
import { Empty, ErrorBox, Modal, Skeleton, SkeletonCards, StatusBadge, errText, useFetch, useToast } from "./ui";
import { Chat } from "./Chat";
import { DashboardView } from "./Dashboard";
import { TracesView } from "./Traces";
import { Notifications } from "./Notifications";
import { EditTripModal } from "./carrier/EditTrip";
import { PodThumbs, TeslimModal } from "./carrier/Pod";
import { MeasureModal } from "./carrier/Measure";
import { NewTripWizard } from "./carrier/NewTrip";
import type { CarrierRes, CarrierTripV, TripUpdateResult } from "./carrier/http";
import { ChipSelect, Countdown, Segmented } from "./components/controls";
import { TruckMap, operatorCells } from "./components/TruckMap";

type View = { name: "ops"; id?: string } | { name: "new" } | { name: "dash" } | { name: "chat" } | { name: "traces" };

export function CarrierPortal({ displayName, tenant, role, onLogout }: { displayName: string; tenant?: string; role: string; onLogout: () => void }) {
  const [view, setView] = useState<View>({ name: "ops" });
  const nav: [View["name"], string, React.ReactNode][] = [
    ["ops", "Operasyon", <Truck size={19} />], ["new", "Aracım var, yük ekle", <PackagePlus size={19} />],
    ["dash", "Jüri panosu", <LayoutDashboard size={19} />], ["chat", "Asistan", <MessageSquare size={19} />], ["traces", "Asistan işlem izi", <ScrollText size={19} />],
  ];
  return (
    <div className="app rail-shell">
      <aside className="rail" aria-label="Menü">
        <div className="logo-mark rail-logo"><img src="/logo-mark.svg" alt="CargoPact" /></div>
        {nav.map(([k, l, ic]) => (
          <button key={k} className={`rail-btn ${view.name === k ? "on" : ""}`} onClick={() => setView({ name: k } as View)} aria-label={l} title={l}>{ic}<span>{l.split(",")[0]}</span></button>
        ))}
        <div className="rail-bottom">
          <Notifications side onOpen={(n) => n.tripId && setView({ name: "ops", id: n.tripId })} />
          <button className="rail-btn" onClick={onLogout} title={`${displayName} · ${tenant ?? ""} · ${role} — Çıkış`} aria-label="Çıkış"><LogOut size={18} /><span>Çıkış</span></button>
        </div>
      </aside>
      <main className="stage">
        {view.name === "ops" && <Cockpit initialId={view.id} onNew={() => setView({ name: "new" })} who={`${displayName}${tenant ? ` · ${tenant}` : ""}`} />}
        {view.name === "new" && <NewTripWizard onCreated={(id) => setView({ name: "ops", id })} />}
        {view.name === "dash" && <div className="scroll"><DashboardView /></div>}
        {view.name === "chat" && <div className="pagepad scroll"><Chat prompts={["DNC-DEMO-GEB-ANK seferinde bekleyen talepleri öncelik sırasıyla özetle"]} /></div>}
        {view.name === "traces" && <div className="scroll"><TracesView /></div>}
      </main>
    </div>
  );
}

/* ================= KOKPİT: seferler · araç · talepler ================= */
function Cockpit({ initialId, onNew, who }: { initialId?: string; onNew: () => void; who: string }) {
  const { data, error, loading, reload } = useFetch((s) => api<{ items: CarrierTrip[] }>("GET", "/carrier/trips", undefined, { signal: s }), [], 8000);
  const items = data?.items ?? [];
  const [sel, setSel] = useState<string | null>(initialId ?? null);
  const current = items.find((t) => t.id === sel) ?? items.find((t) => t.pendingCount > 0) ?? items.find((t) => t.status === "published") ?? items[0];

  const groups = useMemo(() => {
    const t0 = today(), t1 = addDays(t0, 1);
    const g: [string, CarrierTrip[]][] = [["Bugün", []], ["Yarın", []], ["Sonraki günler", []], ["Geçmiş", []]];
    for (const t of [...items].sort((a, b) => a.departureAt.localeCompare(b.departureAt))) {
      const d = isoDay(t.departureAt);
      const i = ["completed", "cancelled", "departed"].includes(t.status) || d < t0 ? 3 : d === t0 ? 0 : d === t1 ? 1 : 2;
      g[i]![1].push(t);
    }
    return g.filter(([, l]) => l.length);
  }, [items]);

  return (
    <div className="cockpit">
      <aside className="panel list-pane" aria-label="Seferler">
        <div className="pane-head row between">
          <div style={{ minWidth: 0 }}><span className="eyebrow">Seferler</span><div className="who-line" title={who}>{who}</div></div>
          <button className="btn sm primary" onClick={onNew}><PackagePlus size={14} />Yeni</button>
        </div>
        <div className="pane-scroll">
          {loading ? <div className="col" style={{ padding: 12 }}><Skeleton h={60} /><Skeleton h={60} /></div>
            : error ? <div style={{ padding: 12 }}><ErrorBox error={error} onRetry={reload} /></div>
            : !items.length ? <div className="mini-empty"><p>Henüz sefer yok.</p><button className="btn sm primary" onClick={onNew}>Kapasite yayınla</button></div>
            : groups.map(([label, list]) => (
              <div key={label}>
                <div className="group-h">{label}</div>
                {list.map((t) => {
                  const fill = t.capacity.plannedPallets / t.capacity.totalPositions;
                  return (
                    <button key={t.id} className={`trow ${current?.id === t.id ? "on" : ""}`} onClick={() => setSel(t.id)}>
                      <div className="trow-top">
                        <b className="trow-route">{place(t.origin)} → {place(t.destination)}</b>
                        <Ring v={fill} />
                      </div>
                      <div className="trow-sub">{dayNum(isoDay(t.departureAt))} {time(t.departureAt)} · {t.vehicle.plate}</div>
                      <div className="row" style={{ gap: 6, marginTop: 4 }}>
                        <StatusBadge status={t.status} />
                        {t.pendingCount > 0 && <span className="badge pending">{t.pendingCount} talep</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
        </div>
      </aside>
      {current ? <TripOps key={current.id} id={current.id} onListChanged={reload} /> : !loading && <section className="panel"><Empty title="Sefer seçin" /></section>}
    </div>
  );
}

function Ring({ v }: { v: number }) {
  const p = Math.max(0, Math.min(1, v)), r = 11, c = 2 * Math.PI * r;
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" className="ring" aria-label={`Doluluk %${Math.round(p * 100)}`}>
      <circle cx="15" cy="15" r={r} className="ring-bg" />
      <circle cx="15" cy="15" r={r} className="ring-fg" strokeDasharray={`${c * p} ${c}`} transform="rotate(-90 15 15)" />
      <text x="15" y="18.5" textAnchor="middle">{Math.round(p * 100)}</text>
    </svg>
  );
}

type TripFull = CarrierTripV & { reservations: CarrierRes[] };
const NEXT: Record<string, { type: string; label: string }> = {
  ONAYLI: { type: "DEPO_KABUL", label: "Depo kabul" }, DEPO_KABUL: { type: "YUKLENDI", label: "Araca yükle" },
  YUKLENDI: { type: "VARISTA", label: "Varışta" }, VARISTA: { type: "TESLIM", label: "Teslim et" },
};
const CONFIRMED = ["ONAYLI", "INCELEME", "DEPO_KABUL", "YUKLENDI", "VARISTA", "TESLIM", "EKSIK_HASAR"];

const REJECT_REASONS = ["Kapasite yetersiz", "Ürün sınıfı bu araca uygun değil", "Zamanlama uymuyor", "Ağırlık sınırı aşılıyor"];

function TripOps({ id, onListChanged }: { id: string; onListChanged: () => void }) {
  const toast = useToast();
  const { data: t, error, loading, reload } = useFetch((s) => api<TripFull>("GET", `/carrier/trips/${id}`, undefined, { signal: s }), [id], 5000);
  const [tab, setTab] = useState<"req" | "loads">("req");
  const [busy, setBusy] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [reject, setReject] = useState<CarrierRes | null>(null);
  const [teslim, setTeslim] = useState<CarrierRes | null>(null);
  const [measure, setMeasure] = useState<CarrierRes | null>(null);
  const [problem, setProblem] = useState<{ r: CarrierRes; type: "EKSIK_HASAR" | "GELMEDI" } | null>(null);
  const [editing, setEditing] = useState(false);
  const [insight, setInsight] = useState<{ r: CarrierRes; text: string; err: Error | null; busy: boolean } | null>(null);

  const { pending, active } = useMemo(() => {
    const rs = t?.reservations ?? [];
    return {
      pending: rs.filter((r) => r.status === "TASIYICI_ONAYI_BEKLIYOR").sort((a, b) => a.priorityRank - b.priorityRank),
      active: rs.filter((r) => CONFIRMED.includes(r.status) || r.status === "GELMEDI"),
    };
  }, [t]);

  async function act(key: string, path: string, body: unknown, ok: string) {
    setBusy(key);
    try { await api("POST", path, body); toast(ok, "ok"); reload(); onListChanged(); }
    catch (e) { toast(errText(e), "err"); }
    finally { setBusy(null); }
  }
  async function showInsight(r: CarrierRes) {
    setInsight({ r, text: "", err: null, busy: true });
    const h = r.customerHistory;
    try {
      const res = await sendChat({
        sessionId: `risk-${crypto.randomUUID()}`,
        message: `${t?.reference ?? id} seferindeki ${r.reference} numaralı ${r.customer.name} talebi için karar desteği hazırla. ` +
          `Önce trip_detail aracından customerHistory değerlerini doğrula: geçmiş sonuçlanmış talep ${h.historicalReservationCount}, doğrulanmış gelmeme ${h.verifiedNoShows}. ` +
          "Ardından carrier_knowledge aracını çağırarak bu geçmişin öncelik kuralına etkisini kısa ve tarafsız biçimde açıkla; kaynak dosya adını belirt. Onay veya ret kararı verme.",
      });
      setInsight({ r, text: res.reply, err: null, busy: false });
    } catch (e) { setInsight({ r, text: "", err: e as Error, busy: false }); }
  }

  if (loading) return <section className="panel center-pane"><div className="pane-scroll"><SkeletonCards n={2} h={160} /></div></section>;
  if (error && !t) return <section className="panel center-pane"><div className="pane-scroll"><ErrorBox error={error} onRetry={reload} /></div></section>;
  if (!t) return null;

  const cap = t.capacity;
  const cells = operatorCells(cap.internalPallets, t.reservations.map((r) => ({ id: r.id, name: r.customer.name, pallets: r.pallets, status: r.status })), { ghostId: hover });
  const over = cap.plannedPallets > cap.totalPositions;

  return (
    <>
      <section className="panel center-pane" aria-label="Sefer">
        <div className="pane-scroll">
          <header className="trip-head">
            <div>
              <div className="eyebrow row" style={{ gap: 8 }}><span className="mono">{t.reference} · {t.vehicle.plate}</span><StatusBadge status={t.status} /><span className="row tiny"><span className="live" /> canlı</span></div>
              <h1 className="route-h">{place(t.origin)} <span className="arrow">→</span> {place(t.destination)}</h1>
              <div className="sub">{t.origin.name} → {t.destination.name} · {t.vehicleType.name}</div>
            </div>
            <div className="trip-times">
              <div><span className="eyebrow">Kalkış</span><b>{full(t.departureAt)}</b></div>
              {["draft", "published", "closed"].includes(t.status) && <button className="btn sm" onClick={() => setEditing(true)}><Pencil size={13} />Düzenle</button>}
            </div>
          </header>
          <div className="cut-row">
            <span className="cut">Son rezervasyon (T−3) <b>{time(t.bookingCutoffAt)}</b><Countdown to={t.bookingCutoffAt} prefix="·" /></span>
            <span className="cut">Çıkış deposu son kabul (T−1) <b>{time(t.intakeCutoffAt)}</b></span>
          </div>
          <TruckMap operator positions={cap.totalPositions} cells={cells} caption={`${cap.plannedPallets} planlanan, ${cap.heldPallets} bloke`} />
          {over && <div className="alert warn" style={{ marginTop: 8 }}><AlertTriangle size={15} /><span>Planlanan {cap.plannedPallets} palet, {cap.totalPositions} pozisyonu aşıyor.</span></div>}
          <div className="capgrid">
            {([
              ["Palet", cap.plannedPallets, cap.totalPositions, "", cap.heldPallets],
              ["Brüt kg", cap.internalKg + cap.confirmed.kg, cap.maxGrossKg, " kg", cap.held.kg],
              ["Satışa açık m³", cap.confirmed.m3, cap.sellable.m3, " m³", cap.held.m3],
            ] as [string, number, number, string, number][]).map(([l, used, tot, u, held]) => {
              const p = tot ? used / tot : 0;
              return (
                <div key={l} className={`capcell ${1 - p < 0.1 ? "low" : ""}`}>
                  <span className="eyebrow">{l}</span>
                  <b>{num(Math.round(used * 10) / 10)}<small> / {num(tot)}{u}</small></b>
                  <span className="meter-b"><i style={{ width: `${Math.min(100, p * 100)}%` }} /><i className="h" style={{ width: `${Math.min(100 - Math.min(100, p * 100), tot ? (held / tot) * 100 : 0)}%` }} /></span>
                  <span className="tiny">{held > 0 ? `+${num(Math.round(held * 10) / 10)}${u} bloke` : `fiili ${l === "Palet" ? `${cap.actualPallets}/${cap.totalPositions}` : "—"}`}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <aside className="panel side-pane" aria-label="Talepler ve yükler">
        <div className="pane-head">
          <Segmented ariaLabel="Liste" value={tab} onChange={setTab} options={[
            { value: "req", label: <>Talepler <i className="cnt">{pending.length}</i></> },
            { value: "loads", label: <>Onaylı yükler <i className="cnt">{active.length}</i></> },
          ]} />
        </div>
        <div className="pane-scroll">
          {tab === "req" ? (
            pending.length === 0 ? <div className="mini-empty"><p>Bekleyen talep yok. Yeni talepler geldiğinde burada belirir.</p></div>
              : pending.map((r) => (
                <article key={r.id} className={`req ${hover === r.id ? "hov" : ""}`} onMouseEnter={() => setHover(r.id)} onMouseLeave={() => setHover(null)} data-testid="request">
                  <div className="row between">
                    <div className="row" style={{ gap: 10 }}><span className="rank">{r.priorityRank}</span><div><b>{r.customer.name}</b><div className="mono tiny">{r.reference}</div></div></div>
                    <b className="price-m">{tl(r.totalPriceMinor)}</b>
                  </div>
                  <div className="req-facts">{num(r.pallets)} palet · {num(r.grossKg)} kg{r.volumeM3 ? ` · ${r.volumeM3} m³` : ""} · {r.paymentPlan === "deposit" ? `%${r.depositPercent} kapora` : "peşin"}</div>
                  {r.eligibility.eligible ? <span className="badge ok">Üç sınıra da uygun</span>
                    : <div className="red small">{r.eligibility.reasons.map((x) => <div key={x.code}>• {x.message}</div>)}</div>}
                  {r.needsReview && <span className="badge warn"><AlertTriangle size={11} />Yeniden değerlendirme gerekli</span>}
                  {r.customerHistory.historicalReservationCount > 0 && (
                    <button className="hist" onClick={() => showInsight(r)}>
                      <AlertTriangle size={13} /> {r.customerHistory.historicalReservationCount} geçmiş talep · {r.customerHistory.verifiedNoShows} doğrulanmış gelmeme <span><Sparkles size={12} /> yorum</span>
                    </button>
                  )}
                  <div className="row req-act">
                    <button className="btn sm mint grow" disabled={busy === r.id || !r.eligibility.eligible} onClick={() => act(r.id, `/carrier/reservations/${r.id}/decision`, { decision: "approve" }, `${r.customer.name} talebi onaylandı.`)}><Check size={14} />Onayla</button>
                    <button className="btn sm danger" disabled={busy === r.id} onClick={() => setReject(r)}><X size={14} />Reddet</button>
                  </div>
                </article>
              ))
          ) : (
            active.length === 0 ? <div className="mini-empty"><p>Onaylı yük yok.</p></div>
              : active.map((r) => {
                const n = NEXT[r.status];
                return (
                  <article key={r.id} className="lrow static">
                    <div className="row between"><b>{r.customer.name}</b><StatusBadge status={r.status} label={r.statusLabel} /></div>
                    <div className="row between"><span className="mono tiny">{r.orderNumber ?? r.reference}</span><span className="tiny">{num(r.pallets)} palet · {num(r.grossKg)} kg</span></div>
                    <PodThumbs files={r.pod?.attachments ?? []} recipient={r.pod?.recipientName} />
                    <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
                      {r.status === "INCELEME" && <button className="btn sm primary" onClick={() => setMeasure(r)}>İncele <ArrowRight size={13} /></button>}
                      {n && <button className="btn sm primary" disabled={busy === r.id} onClick={() => (n.type === "TESLIM" ? setTeslim(r) : n.type === "DEPO_KABUL" ? setMeasure(r) : act(r.id, `/carrier/reservations/${r.id}/events`, { type: n.type }, `${n.label}: ${r.customer.name}`))}>{n.label} <ArrowRight size={13} /></button>}
                      {r.status === "ONAYLI" && <button className="btn sm quiet" onClick={() => setProblem({ r, type: "GELMEDI" })}>Gelmedi</button>}
                      {["ONAYLI", "DEPO_KABUL", "YUKLENDI"].includes(r.status) && <button className="btn sm quiet" onClick={() => setProblem({ r, type: "EKSIK_HASAR" })}>Eksik / hasar</button>}
                    </div>
                  </article>
                );
              })
          )}
        </div>
      </aside>

      {measure && <MeasureModal r={measure} onClose={() => setMeasure(null)} onDone={(msg) => { toast(msg, "ok"); setMeasure(null); reload(); }} />}
      {teslim && <TeslimModal r={teslim} onClose={() => setTeslim(null)} onDone={() => { toast(`Teslim kaydedildi: ${teslim.customer.name}`, "ok"); setTeslim(null); reload(); }} />}
      {editing && <EditTripModal trip={t} onClose={() => setEditing(false)} onSaved={(r: TripUpdateResult) => {
        toast(r.reevaluated.length === 0 ? "Sefer güncellendi." : `Sefer güncellendi. ${r.reevaluated.length} bekleyen talep yeniden değerlendirildi; ${r.needsReviewCount} tanesi inceleme gerektiriyor.`, r.needsReviewCount > 0 ? "err" : "ok");
        reload();
      }} />}
      {insight && (
        <Modal title={`${insight.r.customer.name} · geçmiş değerlendirmesi`} onClose={() => setInsight(null)}>
          <div className="alert warn" style={{ marginBottom: 14 }}><AlertTriangle size={18} /><span><b>{insight.r.customerHistory.historicalReservationCount}</b> sonuçlanmış talebin <b>{insight.r.customerHistory.verifiedNoShows}</b> tanesinde onaylı yük zamanında getirilmedi.</span></div>
          <div className="tiny" style={{ marginBottom: 10 }}>Sayılar işlem API’sinden, kural yorumu taşıyıcıya özel Bedrock Knowledge Base’den gelir. Bu panel karar desteğidir; otomatik onay veya ret vermez.</div>
          {insight.busy ? <SkeletonCards n={1} h={120} /> : insight.err ? <ErrorBox error={insight.err} /> : <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{insight.text}</div>}
        </Modal>
      )}
      {reject && <ReasonModal title={`${reject.customer.name} talebini reddet`} cta="Reddet" required presets={REJECT_REASONS} onClose={() => setReject(null)}
        onSubmit={async (reason) => { await api("POST", `/carrier/reservations/${reject.id}/decision`, { decision: "reject", reason }); toast("Talep reddedildi.", "ok"); setReject(null); reload(); onListChanged(); }} />}
      {problem && <ReasonModal title={problem.type === "GELMEDI" ? "Yük getirilmedi olarak işaretle" : "Eksik / hasar kaydı"} cta="Kaydet" required={false}
        presets={problem.type === "GELMEDI" ? ["Son kabul saatine kadar gelmedi", "Müşteri iptal bildirdi"] : ["Eksik palet", "Ambalaj hasarlı", "Etiket/QR okunmuyor"]}
        onClose={() => setProblem(null)}
        onSubmit={async (note) => { await api("POST", `/carrier/reservations/${problem.r.id}/events`, { type: problem.type, ...(note ? { note } : {}) }); toast("Olay kaydedildi.", "ok"); setProblem(null); reload(); }} />}
    </>
  );
}

function ReasonModal({ title, cta, required, presets, onClose, onSubmit }: { title: string; cta: string; required: boolean; presets: string[]; onClose: () => void; onSubmit: (reason: string) => Promise<void> }) {
  const [pick, setPick] = useState<string | null>(null);
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Error | null>(null);
  const v = pick === "__other" ? other.trim() : pick ?? "";
  return (
    <Modal title={title} onClose={onClose}>
      <span className="lbl">{required ? "Gerekçe seçin" : "Not (isteğe bağlı)"}</span>
      <ChipSelect value={pick} onChange={setPick} options={[...presets.map((p) => ({ value: p, label: p })), { value: "__other", label: "Diğer…" }]} />
      {pick === "__other" && <textarea className="input" style={{ marginTop: 10 }} value={other} onChange={(e) => setOther(e.target.value)} autoFocus placeholder="Kısa açıklama" />}
      {err && <div style={{ marginTop: 12 }}><ErrorBox error={err} /></div>}
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Vazgeç</button>
        <button className="btn primary" disabled={busy || (required && !v)}
          onClick={async () => { setBusy(true); setErr(null); try { await onSubmit(v); } catch (e) { setErr(e as Error); } finally { setBusy(false); } }}>{cta}</button>
      </div>
    </Modal>
  );
}
