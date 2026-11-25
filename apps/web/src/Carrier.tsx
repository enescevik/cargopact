import { useMemo, useState } from "react";
import {
  AlertTriangle, ArrowLeft, ArrowRight, Check, LayoutDashboard, Pencil, LogOut, MessageSquare, PackagePlus, Truck, X,
} from "lucide-react";
import { api, ApiError } from "./api";
import type { CarrierReservation, CarrierTrip, Facility } from "./types";
import { dt, full, isoToLocal, localToIso, num, time, tl, day } from "./format";
import { CapacityBars, Empty, ErrorBox, Field, Modal, SkeletonCards, StatusBadge, TripBarCompact, errText, useFetch, useToast } from "./ui";
import { Chat } from "./Chat";
import { DashboardView } from "./Dashboard";
import { EditTripModal } from "./carrier/EditTrip";
import { PodThumbs, TeslimModal } from "./carrier/Pod";
import type { CarrierRes, CarrierTripV, TripUpdateResult } from "./carrier/http";

type View = { name: "trips" } | { name: "trip"; id: string } | { name: "new" } | { name: "dash" } | { name: "chat" };

export function CarrierPortal({ displayName, tenant, role, onLogout }: { displayName: string; tenant?: string; role: string; onLogout: () => void }) {
  const [view, setView] = useState<View>({ name: "trips" });
  const tab = view.name === "trip" ? "trips" : view.name;
  const nav: [string, string, React.ReactNode][] = [
    ["trips", "Seferler", <Truck size={18} />], ["new", "Aracım var, yük ekle", <PackagePlus size={18} />],
    ["dash", "Jüri panosu", <LayoutDashboard size={18} />], ["chat", "Asistan", <MessageSquare size={18} />],
  ];
  return (
    <div className="shell">
      <aside className="side">
        <div className="logo"><div className="logo-mark"><img src="/logo-mark.svg" alt="" /></div>CargoPact</div>
        <div className="tiny" style={{ margin: "0 12px 8px", color: "#7f8cc2", letterSpacing: ".08em" }}>TRANSFER MERKEZİ</div>
        {nav.map(([k, l, ic]) => (
          <button key={k} className={`navlink ${tab === k ? "on" : ""}`} onClick={() => setView({ name: k } as View)}>{ic}{l}</button>
        ))}
        <div className="who">
          <b style={{ color: "#fff" }}>{displayName}</b><div>{tenant}</div><div style={{ opacity: .7 }}>{role}</div>
          <button className="btn sm" style={{ marginTop: 10 }} onClick={onLogout}><LogOut size={14} />Çıkış</button>
        </div>
      </aside>
      <div className="main">
        {view.name === "trips" && <TripList onOpen={(id) => setView({ name: "trip", id })} onNew={() => setView({ name: "new" })} />}
        {view.name === "trip" && <TripDetail id={view.id} onBack={() => setView({ name: "trips" })} />}
        {view.name === "new" && <NewTrip onCreated={(id) => setView({ name: "trip", id })} />}
        {view.name === "dash" && <DashboardView />}
        {view.name === "chat" && <Chat prompts={["DNC-DEMO-GEB-ANK seferinde bekleyen talepleri öncelik sırasıyla özetle"]} />}
      </div>
    </div>
  );
}

/* ================= TRIP LIST ================= */
function TripList({ onOpen, onNew }: { onOpen: (id: string) => void; onNew: () => void }) {
  const { data, error, loading, reload } = useFetch((s) => api<{ items: CarrierTrip[] }>("GET", "/carrier/trips", undefined, { signal: s }), [], 8000);
  return (
    <div className="page">
      <div className="page-head row between wrap">
        <div><div className="kicker">Operasyon</div><h1 className="title">Seferler</h1></div>
        <button className="btn primary" onClick={onNew}><PackagePlus size={16} />Aracım var, yük ekle</button>
      </div>
      {loading ? <SkeletonCards /> : error ? <ErrorBox error={error} onRetry={reload} /> : !data?.items.length ? (
        <div className="card"><Empty title="Henüz sefer yok" text="Aracınız için boş palet kapasitesi yayınlayın." /></div>
      ) : (
        <div className="col">
          {data.items.map((t) => (
            <button key={t.id} className="card" onClick={() => onOpen(t.id)} style={{ textAlign: "left", cursor: "pointer", font: "inherit", display: "grid", gridTemplateColumns: "1.2fr 1fr auto", gap: 24, alignItems: "center" }}>
              <div>
                <div className="route" style={{ fontSize: 26 }}>{t.origin.city} → {t.destination.city}</div>
                <div className="small muted" style={{ marginTop: 4 }}>{t.reference} · {t.vehicle.plate} · {day(t.departureAt)} {time(t.departureAt)}</div>
              </div>
              <TripBarCompact cap={t.capacity} />
              <div style={{ textAlign: "right" }}>
                <StatusBadge status={t.status} />
                {t.pendingCount > 0 && <div style={{ marginTop: 6 }}><span className="badge pending">{t.pendingCount} bekleyen talep</span></div>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================= TRIP DETAIL ================= */
type TripFull = CarrierTripV & { reservations: CarrierRes[] };
const NEXT: Record<string, { type: string; label: string }> = {
  ONAYLI: { type: "DEPO_KABUL", label: "Depoda kabul" }, DEPO_KABUL: { type: "YUKLENDI", label: "Araca yüklendi" },
  YUKLENDI: { type: "VARISTA", label: "Varışta" }, VARISTA: { type: "TESLIM", label: "Teslim" },
};

function TripDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const toast = useToast();
  const { data: t, error, loading, reload } = useFetch((s) => api<TripFull>("GET", `/carrier/trips/${id}`, undefined, { signal: s }), [id], 5000);
  const [busy, setBusy] = useState<string | null>(null);
  const [reject, setReject] = useState<CarrierRes | null>(null);
  const [teslim, setTeslim] = useState<CarrierRes | null>(null);
  const [editing, setEditing] = useState(false);
  const [problem, setProblem] = useState<{ r: CarrierRes; type: "EKSIK_HASAR" | "GELMEDI" } | null>(null);

  const { pending, active } = useMemo(() => {
    const rs = t?.reservations ?? [];
    return {
      pending: rs.filter((r) => r.status === "TASIYICI_ONAYI_BEKLIYOR").sort((a, b) => a.priorityRank - b.priorityRank),
      active: rs.filter((r) => ["ONAYLI", "DEPO_KABUL", "YUKLENDI", "VARISTA", "TESLIM", "EKSIK_HASAR", "GELMEDI"].includes(r.status)),
    };
  }, [t]);

  async function act(key: string, path: string, body: unknown, ok: string) {
    setBusy(key);
    try { await api("POST", path, body); toast(ok, "ok"); reload(); }
    catch (e) { toast(errText(e), "err"); }
    finally { setBusy(null); }
  }

  return (
    <div className="page">
      <button className="link small" onClick={onBack} style={{ marginBottom: 14 }}><ArrowLeft size={14} style={{ verticalAlign: -2 }} /> Seferler</button>
      {loading ? <SkeletonCards n={2} h={160} /> : error && !t ? <ErrorBox error={error} onRetry={reload} /> : t && (
        <div className="col" style={{ gap: 22 }}>
          <div className="row between wrap">
            <div>
              <div className="row"><span className="kicker">{t.reference} · {t.vehicle.plate}</span><StatusBadge status={t.status} /><span className="row tiny"><span className="live" /> canlı</span>
                {["draft", "published", "closed"].includes(t.status) && <button className="btn sm" onClick={() => setEditing(true)}><Pencil size={13} />Seferi düzenle</button>}</div>
              <h1 className="title" style={{ fontSize: 46, marginTop: 4 }}>{t.origin.city} → {t.destination.city}</h1>
              <div className="muted" style={{ marginTop: 6 }}>{t.origin.name} → {t.destination.name}</div>
            </div>
            <div className="col" style={{ gap: 8, alignItems: "flex-end" }}>
              <div className="serif" style={{ fontSize: 22 }}>{full(t.departureAt)}</div>
              <span className="chip">Son rezervasyon (T−3) <b>{time(t.bookingCutoffAt)}</b></span>
              <span className="chip">Çıkış deposu son kabul (T−1) <b>{time(t.intakeCutoffAt)}</b></span>
            </div>
          </div>
          {error && <ErrorBox error={error} />}

          <div className="card">
            <h3 className="serif" style={{ fontSize: 22, marginBottom: 16 }}>Kapasite</h3>
            <CapacityBars cap={t.capacity} />
          </div>

          <div className="card">
            <div className="row between"><h3 className="serif" style={{ fontSize: 22 }}>Bekleyen talepler</h3><span className="muted small">öncelik sırasıyla</span></div>
            {pending.length === 0 ? <Empty title="Bekleyen talep yok" text="Yeni talepler geldiğinde burada görünür." /> : (
              <table style={{ marginTop: 10 }}>
                <thead><tr><th>#</th><th>Firma</th><th>Yük</th><th>Fiyat</th><th>Uygunluk</th><th style={{ textAlign: "right" }}>Karar</th></tr></thead>
                <tbody>
                  {pending.map((r) => (
                    <tr key={r.id}>
                      <td><b className="serif" style={{ fontSize: 20 }}>{r.priorityRank}</b></td>
                      <td><b>{r.customer.name}</b>
                        {r.verifiedNoShows > 0 && <div style={{ marginTop: 4 }}><span className="badge warn"><AlertTriangle size={11} />Doğrulanmış gelmeme: {r.verifiedNoShows}</span></div>}
                        <div className="tiny mono">{r.reference}</div>
                        {r.needsReview && <div style={{ marginTop: 4 }}><span className="badge warn"><AlertTriangle size={11} />Yeniden değerlendirme gerekli</span></div>}</td>
                      <td className="small">{num(r.pallets)} palet<br />{num(r.grossKg)} kg<br />{r.volumeM3 ? `${r.volumeM3} m³` : "—"}</td>
                      <td><b>{tl(r.totalPriceMinor)}</b><div className="tiny">{r.paymentPlan === "deposit" ? `%${r.depositPercent} kapora` : "peşin"}</div></td>
                      <td>{r.eligibility.eligible ? <span className="badge ok">Uygun</span> : (
                        <div className="red small">{r.eligibility.reasons.map((x) => <div key={x.code}>• {x.message}</div>)}</div>
                      )}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <button className="btn sm mint" disabled={busy === r.id} onClick={() => act(r.id, `/carrier/reservations/${r.id}/decision`, { decision: "approve" }, `${r.customer.name} talebi onaylandı.`)}><Check size={14} />Onayla</button>{" "}
                        <button className="btn sm danger" disabled={busy === r.id} onClick={() => setReject(r)}><X size={14} />Reddet</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <h3 className="serif" style={{ fontSize: 22 }}>Onaylı yükler</h3>
            {active.length === 0 ? <Empty title="Onaylı yük yok" /> : (
              <table style={{ marginTop: 10 }}>
                <thead><tr><th>Sipariş</th><th>Firma</th><th>Yük</th><th>Durum</th><th style={{ textAlign: "right" }}>Depo işlemi</th></tr></thead>
                <tbody>
                  {active.map((r) => {
                    const n = NEXT[r.status];
                    return (
                      <tr key={r.id}>
                        <td className="mono small">{r.orderNumber ?? r.reference}</td>
                        <td><b>{r.customer.name}</b><PodThumbs files={r.pod?.attachments ?? []} recipient={r.pod?.recipientName} /></td>
                        <td className="small">{num(r.pallets)} palet · {num(r.grossKg)} kg</td>
                        <td><StatusBadge status={r.status} label={r.statusLabel} /></td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          {n && <button className="btn sm primary" disabled={busy === r.id} onClick={() => (n.type === "TESLIM" ? setTeslim(r) : act(r.id, `/carrier/reservations/${r.id}/events`, { type: n.type }, `${n.label}: ${r.customer.name}`))}>{n.label} <ArrowRight size={13} /></button>}{" "}
                          {["ONAYLI", "DEPO_KABUL", "YUKLENDI"].includes(r.status) && (
                            <>
                              {r.status === "ONAYLI" && <button className="btn sm" onClick={() => setProblem({ r, type: "GELMEDI" })}>Gelmedi</button>}{" "}
                              <button className="btn sm" onClick={() => setProblem({ r, type: "EKSIK_HASAR" })}>Eksik / hasar</button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
      {teslim && <TeslimModal r={teslim} onClose={() => setTeslim(null)} onDone={() => { toast(`Teslim kaydedildi: ${teslim.customer.name}`, "ok"); setTeslim(null); reload(); }} />}
      {editing && t && <EditTripModal trip={t} onClose={() => setEditing(false)}
        onSaved={(r: TripUpdateResult) => {
          toast(r.reevaluated.length === 0 ? "Sefer güncellendi." : `Sefer güncellendi. ${r.reevaluated.length} bekleyen talep yeniden değerlendirildi; ${r.needsReviewCount} tanesi inceleme gerektiriyor.`, r.needsReviewCount > 0 ? "err" : "ok");
          reload();
        }} />}
      {reject && <ReasonModal title={`${reject.customer.name} talebini reddet`} cta="Reddet" required
        onClose={() => setReject(null)}
        onSubmit={async (reason) => { await api("POST", `/carrier/reservations/${reject.id}/decision`, { decision: "reject", reason }); toast("Talep reddedildi.", "ok"); setReject(null); reload(); }} />}
      {problem && <ReasonModal title={problem.type === "GELMEDI" ? "Yük getirilmedi olarak işaretle" : "Eksik / hasar kaydı"} cta="Kaydet" required={false}
        onClose={() => setProblem(null)}
        onSubmit={async (note) => { await api("POST", `/carrier/reservations/${problem.r.id}/events`, { type: problem.type, ...(note ? { note } : {}) }); toast("Olay kaydedildi.", "ok"); setProblem(null); reload(); }} />}
    </div>
  );
}

function ReasonModal({ title, cta, required, onClose, onSubmit }: { title: string; cta: string; required: boolean; onClose: () => void; onSubmit: (reason: string) => Promise<void> }) {
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Error | null>(null);
  return (
    <Modal title={title} onClose={onClose}>
      <Field label={required ? "Gerekçe (zorunlu)" : "Not (isteğe bağlı)"}><textarea className="input" value={v} onChange={(e) => setV(e.target.value)} autoFocus /></Field>
      {err && <div style={{ marginTop: 12 }}><ErrorBox error={err} /></div>}
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Vazgeç</button>
        <button className="btn primary" disabled={busy || (required && !v.trim())}
          onClick={async () => { setBusy(true); setErr(null); try { await onSubmit(v.trim()); } catch (e) { setErr(e as Error); } finally { setBusy(false); } }}>{cta}</button>
      </div>
    </Modal>
  );
}

/* ================= NEW TRIP ================= */
function NewTrip({ onCreated }: { onCreated: (id: string) => void }) {
  const toast = useToast();
  const fac = useFetch((s) => api<{ items: Facility[] }>("GET", "/carrier/facilities", undefined, { signal: s }), []);
  const veh = useFetch((s) => api<{ items: any[] }>("GET", "/carrier/vehicles", undefined, { signal: s }), []);
  const tomorrow = isoToLocal(new Date(Date.now() + 24 * 3600e3).toISOString()).slice(0, 10);
  const [f, setF] = useState({
    origin: "", dest: "", vehicle: "", dep: `${tomorrow}T18:00`, eta: `${tomorrow}T23:00`,
    intP: "25", intKg: "17000", maxKg: "22000", sP: "8", sKg: "5000", sM3: "12", price: "3750", publish: true,
  });
  const set = (k: string, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);
  const [key] = useState(() => crypto.randomUUID());

  const all = fac.data?.items ?? [];
  const isOrigin = (x: Facility) => !x.kind || x.kind.toLowerCase().includes("transfer") || x.kind.toLowerCase().includes("hub") || x.kind.toLowerCase().includes("terminal");
  const origins = all.filter((x) => (all.some((y) => y.kind) ? isOrigin(x) : true));
  const dests = all.filter((x) => (all.some((y) => y.kind) ? !isOrigin(x) : true));
  const vehicles = (veh.data?.items ?? []).filter((v) => v.active !== false && v.status !== "inactive");
  const ok = f.origin && f.dest && f.vehicle && f.origin !== f.dest;

  async function submit() {
    setBusy(true); setErr(null);
    try {
      const t = await api<CarrierTrip>("POST", "/carrier/trips", {
        originFacilityId: f.origin, destinationFacilityId: f.dest, vehicleId: f.vehicle,
        departureAt: localToIso(f.dep), arrivalEta: localToIso(f.eta),
        internalPallets: Number(f.intP), internalKg: Number(f.intKg), maxGrossKg: Number(f.maxKg),
        sellablePallets: Number(f.sP), sellableKg: Number(f.sKg), sellableM3: Number(f.sM3),
        basePriceMinor: Math.round(Number(f.price.replace(",", ".")) * 100), publish: f.publish,
      }, { idempotencyKey: key });
      toast("Sefer oluşturuldu.", "ok");
      onCreated(t.id);
    } catch (e) { setErr(e as ApiError); } finally { setBusy(false); }
  }
  const sel = (k: "origin" | "dest", list: Facility[]) => (
    <select className="input" value={f[k]} onChange={(e) => set(k, e.target.value)}>
      <option value="">Seçin…</option>{list.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.city}</option>)}
    </select>
  );
  const num_ = (k: string, label: string) => <Field label={label}><input type="number" className="input" value={(f as any)[k]} onChange={(e) => set(k, e.target.value)} /></Field>;
  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <div className="page-head"><div className="kicker">Kapasite yayınla</div><h1 className="title">Aracım var, yük ekle</h1>
        <p className="muted" style={{ marginTop: 6 }}>Planlı transferinizde boş kalan palet alanını müşterilere açın.</p></div>
      {(fac.error || veh.error) && <ErrorBox error={(fac.error ?? veh.error)!} />}
      <div className="card col" style={{ gap: 18 }}>
        <div className="grid2">
          <Field label="Çıkış transfer merkezi">{sel("origin", origins)}</Field>
          <Field label="Varış dağıtım merkezi">{sel("dest", dests)}</Field>
          <Field label="Araç">
            <select className="input" value={f.vehicle} onChange={(e) => set("vehicle", e.target.value)}>
              <option value="">Seçin…</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate}{v.vehicleType?.name ? ` · ${v.vehicleType.name}` : v.driverName ? ` · ${v.driverName}` : ""}</option>)}
            </select>
          </Field>
          <Field label="Baz fiyat, palet başı (TL)"><input type="number" className="input" value={f.price} onChange={(e) => set("price", e.target.value)} /></Field>
          <Field label="Kalkış (İstanbul saati)"><input type="datetime-local" className="input" value={f.dep} onChange={(e) => set("dep", e.target.value)} /></Field>
          <Field label="Tahmini varış"><input type="datetime-local" className="input" value={f.eta} onChange={(e) => set("eta", e.target.value)} /></Field>
        </div>
        <hr className="hr" style={{ margin: 0 }} />
        <div className="grid2" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          {num_("intP", "İç yük (palet)")}{num_("intKg", "İç yük (kg)")}{num_("maxKg", "Azami brüt (kg)")}
          {num_("sP", "Satışa açık palet")}{num_("sKg", "Satışa açık kg")}{num_("sM3", "Satışa açık m³")}
        </div>
        <label className="row"><input type="checkbox" checked={f.publish} onChange={(e) => set("publish", e.target.checked)} /> Hemen yayınla (müşteriler görsün)</label>
        {f.origin && f.origin === f.dest && <div className="alert warn">Çıkış ve varış merkezi aynı olamaz.</div>}
        {err && <ErrorBox error={err} />}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn primary lg" disabled={!ok || busy} onClick={submit}>{busy ? "Oluşturuluyor…" : "Seferi oluştur"}</button>
        </div>
      </div>
    </div>
  );
}

void dt;
