import { useMemo, useState } from "react";
import { Ban, BellRing, Check, PackageSearch, Search, Trash2, Warehouse } from "lucide-react";
import { api, ApiError } from "../api";
import type { Reservation } from "../types";
import { dayNum, dt, full, isoDay, num, place, time, tl } from "../format";
import { Empty, ErrorBox, Modal, QrVisual, Skeleton, StatusBadge, useFetch, useToast } from "../ui";
import { Segmented } from "../components/controls";
import { TruckMap } from "../components/TruckMap";
import { CarbonBadge, WalletCard } from "../components/extras";
import { co2Saved, roadKm } from "../lib/carbon";
import { loadAlarms, saveAlarms, type Alarm } from "../lib/store";
import { PickupCard } from "../PickupCard";
import { WarehouseGuide } from "../WarehouseGuide";

type Tracking = {
  orderNumber: string; status: string; statusLabel: string; updatedAt: string; nextStep: string;
  steps: { status: string; label: string; done: boolean; at: string | null }[];
  pickupWindow: { from: string; to: string } | null; palletCodes: string[];
};
type Filter = "active" | "pending" | "done" | "alarms";
const PENDING = ["TASIYICI_ONAYI_BEKLIYOR"];
const ACTIVE = ["ONAYLI", "INCELEME", "DEPO_KABUL", "YUKLENDI", "VARISTA"];
const ENTRY_LABEL: Record<string, string> = {
  AUTHORIZED: "Provizyon", CAPTURED: "Tahsilat", RELEASED: "Provizyon serbest", REFUNDED: "İade", RETAINED: "İptal ücreti", FAILED: "Başarısız",
};
const FLOW = [["ONAYLI", "Onay"], ["DEPO_KABUL", "Depo kabul"], ["YUKLENDI", "Yüklendi"], ["VARISTA", "Varışta"], ["TESLIM", "Teslim"]] as const;

export function LoadsView({ initialId, justCreated }: { initialId?: string; justCreated?: boolean }) {
  const { data, error, loading, reload } = useFetch((s) => api<{ items: Reservation[] }>("GET", "/customer/reservations", undefined, { signal: s }), [], 8000);
  const items = data?.items ?? [];
  const [filter, setFilter] = useState<Filter>(() => (justCreated ? "pending" : "active"));
  const [sel, setSel] = useState<string | null>(initialId ?? null);
  const [q, setQ] = useState("");
  const [alarms, setAlarms] = useState(loadAlarms);

  const groups = useMemo(() => ({
    active: items.filter((r) => ACTIVE.includes(r.status)),
    pending: items.filter((r) => PENDING.includes(r.status)),
    done: items.filter((r) => !ACTIVE.includes(r.status) && !PENDING.includes(r.status)),
  }), [items]);
  const list = filter === "alarms" ? [] : groups[filter].filter((r) => !q || `${r.orderNumber ?? ""} ${r.reference}`.toUpperCase().includes(q.toUpperCase()));
  const current = items.find((r) => r.id === sel) ?? list[0] ?? null;

  const yearCo2 = useMemo(() => items.filter((r) => !["RET", "IPTAL", "SURESI_DOLDU", "GELMEDI"].includes(r.status)).reduce((s, r) => {
    const km = roadKm(r.trip.origin, r.trip.destination);
    return s + (km ? co2Saved(km, r.pallets, r.trip.vehicleType.palletPositions).savedKg : 0);
  }, 0), [items]);

  return (
    <div className="md">
      <aside className="panel list-pane" aria-label="Yüklerim">
        <div className="pane-head col" style={{ gap: 10 }}>
          <Segmented ariaLabel="Filtre" value={filter} onChange={setFilter} options={[
            { value: "active", label: <>Aktif <i className="cnt">{groups.active.length}</i></> },
            { value: "pending", label: <>Onay bekliyor <i className="cnt">{groups.pending.length}</i></> },
            { value: "done", label: "Geçmiş" },
            { value: "alarms", label: <><BellRing size={12} /> {alarms.length}</> },
          ]} />
          {filter !== "alarms" && (
            <label className="search"><Search size={14} /><input placeholder="Sipariş no ile filtrele" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Sipariş numarası" /></label>
          )}
        </div>
        <div className="pane-scroll">
          {loading ? <div className="col" style={{ padding: 12 }}><Skeleton h={56} /><Skeleton h={56} /><Skeleton h={56} /></div>
            : error ? <div style={{ padding: 12 }}><ErrorBox error={error} onRetry={reload} /></div>
            : filter === "alarms" ? <AlarmList alarms={alarms} onRemove={(id) => { const n = alarms.filter((a) => a.id !== id); saveAlarms(n); setAlarms(n); }} />
            : list.length === 0 ? <div className="mini-empty"><p>Bu listede yük yok.</p></div>
            : list.map((r) => (
              <button key={r.id} className={`lrow ${current?.id === r.id ? "on" : ""}`} onClick={() => setSel(r.id)}>
                <div className="row between"><b className="lrow-route">{place(r.trip.origin)} → {place(r.trip.destination)}</b><span className="tiny">{dayNum(isoDay(r.trip.departureAt))}</span></div>
                <div className="row between"><span className="mono tiny">{r.orderNumber ?? r.reference}</span><StatusBadge status={r.status} label={r.statusLabel} /></div>
              </button>
            ))}
        </div>
        {yearCo2 > 0 && <div className="pane-foot carbon-sum">🌿 Paylaşımlı taşımayla bu dönem <b>≈ {yearCo2 >= 1000 ? `${(yearCo2 / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} t` : `${Math.round(yearCo2)} kg`}</b> CO₂ tasarrufu <small>(tahmini)</small></div>}
      </aside>
      <section className="panel center-pane">
        {current && filter !== "alarms" ? <LoadDetail key={current.id} id={current.id} fresh={justCreated && current.id === initialId} onChanged={reload} />
          : <Empty title={filter === "alarms" ? "Alarmlar" : "Yük seçin"} text={filter === "alarms" ? "Bir rota için boş yer alarmı kurduğunuzda burada listelenir." : "Soldaki listeden bir yük seçin."} icon={<PackageSearch size={26} />} />}
      </section>
    </div>
  );
}

function AlarmList({ alarms, onRemove }: { alarms: Alarm[]; onRemove: (id: string) => void }) {
  if (!alarms.length) return <div className="mini-empty"><p>Henüz alarm yok. “Palet gönder” ekranında takvimde dolu bir güne veya alarm bağlantısına tıklayın.</p></div>;
  return (
    <>{alarms.map((a) => (
      <div key={a.id} className="lrow static">
        <div className="row between"><b className="lrow-route">{a.origin} → {a.destination}</b>
          <button className="link" aria-label="Alarmı sil" onClick={() => onRemove(a.id)}><Trash2 size={14} /></button></div>
        <div className="tiny">{dayNum(a.from)} – {dayNum(a.to)} · {a.pallets} palet</div>
      </div>
    ))}</>
  );
}

function LoadDetail({ id, fresh, onChanged }: { id: string; fresh?: boolean; onChanged: () => void }) {
  const toast = useToast();
  const { data: r, error, loading, reload } = useFetch((s) => api<Reservation>("GET", `/customer/reservations/${id}`, undefined, { signal: s }), [id], 6000);
  const trk = useFetch((s) => (r?.orderNumber ? api<Tracking>("GET", `/customer/orders/${encodeURIComponent(r.orderNumber)}/tracking`, undefined, { signal: s }) : Promise.resolve(null)), [r?.orderNumber ?? ""], 10000);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [showLedger, setShowLedger] = useState(false);
  if (loading) return <div className="pane-scroll"><Skeleton h={300} /></div>;
  if (error || !r) return <div className="pane-scroll">{error ? <ErrorBox error={error} onRetry={reload} /> : null}</div>;

  const failed = ["RET", "IPTAL", "SURESI_DOLDU", "GELMEDI", "EKSIK_HASAR"].includes(r.status);
  const cancellable = ["TASIYICI_ONAYI_BEKLIYOR", "ONAYLI"].includes(r.status);
  const idx = FLOW.findIndex(([k]) => k === r.status);
  const stepAt = (k: string) => trk.data?.steps.find((s) => s.status === k)?.at ?? r.events.find((e) => e.type === k)?.at ?? null;
  const positions = r.trip.vehicleType.palletPositions;
  const recips = r.pickup?.recipients.map((x) => x.name) ?? [];

  return (
    <div className="pane-scroll">
      {fresh && r.status === "TASIYICI_ONAYI_BEKLIYOR" && (
        <div className="alert ok" style={{ marginBottom: 14 }}><Check size={16} /><div><b>Teklifiniz alındı.</b> Taşıyıcı onayladığında sipariş numaranız ve palet QR kodlarınız burada görünür.</div></div>
      )}
      <header className="trip-head">
        <div>
          <div className="eyebrow"><span className="mono">{r.reference}</span> · {r.trip.carrier.name}</div>
          <h1 className="route-h">{place(r.trip.origin)} <span className="arrow">→</span> {place(r.trip.destination)}</h1>
          <div className="sub">Kalkış {full(r.trip.departureAt)} · {num(r.pallets)} palet · {num(r.grossKg)} kg · {r.productClass.name}</div>
        </div>
        <div className="col" style={{ alignItems: "flex-end", gap: 8 }}>
          <StatusBadge status={r.status} label={r.statusLabel} />
          <CarbonBadge from={r.trip.origin} to={r.trip.destination} pallets={r.pallets} positions={positions} />
        </div>
      </header>

      {failed ? <div className="alert err"><div><b>{r.statusLabel}</b>{r.decisionReason && <div>{r.decisionReason}</div>}</div></div>
        : r.status === "TASIYICI_ONAYI_BEKLIYOR" ? (
          <div className="alert info"><Warehouse size={16} /><div><b>Taşıyıcı onayı bekleniyor.</b>{r.holdExpiresAt && <> Kapasite {full(r.holdExpiresAt)} tarihine kadar sizin için bloke.</>}</div></div>
        ) : (
          <ol className="tracker" aria-label="Yük durumu">
            {FLOW.map(([k, l], i) => (
              <li key={k} className={`${i <= idx ? "done" : ""} ${i === idx ? "cur" : ""}`}>
                <span className="dot">{i <= idx && <Check size={12} strokeWidth={3} />}</span>
                <span className="t">{l}</span>{stepAt(k) && <span className="tiny">{dt(stepAt(k)!)}</span>}
              </li>
            ))}
          </ol>
        )}
      {trk.data?.nextStep && !failed && <div className="note" style={{ marginTop: 12 }}><Warehouse size={14} /><span><b>Sıradaki adım:</b> {trk.data.nextStep}</span></div>}

      <div className="detail-2">
        <div className="col" style={{ gap: 14 }}>
          <div className="sub-panel">
            <div className="row between"><span className="eyebrow">Araçtaki yeriniz</span><span className="tiny">çıkış deposu son kabul {time(r.trip.intakeCutoffAt)}</span></div>
            <TruckMap compact positions={positions} cells={yourCells(positions, r)} caption="Sizin paletleriniz işaretli" />
            <div className="tiny" style={{ marginTop: 6 }}>Diğer firmaların yükleri “dolu” olarak gösterilir.</div>
          </div>
          {r.palletCodes.length > 0 && (
            <div className="sub-panel">
              <span className="eyebrow">Palet QR kodları</span>
              <div className="row wrap" style={{ gap: 12, marginTop: 10 }}>
                {r.palletCodes.map((c) => <div key={c} className="col" style={{ alignItems: "center", gap: 4 }}><QrVisual code={c} size={72} /><span className="mono tiny">{c}</span></div>)}
              </div>
              <div className="tiny" style={{ marginTop: 8 }}>Etiketleri paletlere yapıştırıp çıkış transfer merkezinde okutun.</div>
            </div>
          )}
          <div className="sub-panel">
            <div className="row between"><span className="eyebrow">Ödeme</span><span className="price-m">{tl(r.totalPriceMinor)}</span></div>
            <div className="kv"><span>Plan</span><b>{r.paymentPlan === "deposit" ? `%${r.depositPercent} kapora` : "Peşin"}</b></div>
            <div className="kv"><span>Tahsil edilen</span><b>{tl(r.payment.paidMinor)}</b></div>
            {r.payment.refundedMinor > 0 && <div className="kv"><span>İade</span><b>{tl(r.payment.refundedMinor)}</b></div>}
            {r.payment.retainedMinor > 0 && <div className="kv"><span>Alıkonulan</span><b>{tl(r.payment.retainedMinor)}</b></div>}
            <button className="link small" onClick={() => setShowLedger((x) => !x)}>{showLedger ? "Defteri gizle" : "Ödeme defterini göster"}</button>
            {showLedger && r.payment.entries.map((e, i) => (
              <div key={i} className="kv"><span>{ENTRY_LABEL[e.type] ?? e.type}<small className="block">{full(e.at)}</small></span><b>{tl(e.amountMinor)}</b></div>
            ))}
            {cancellable && <button className="btn danger sm" style={{ marginTop: 10 }} onClick={() => setCancelOpen(true)}><Ban size={14} />Rezervasyonu iptal et</button>}
          </div>
        </div>
        <div className="col" style={{ gap: 14 }}>
          {r.orderNumber ? <WalletCard orderNumber={r.orderNumber} trip={r.trip} pallets={r.pallets} recipients={recips} code={r.pickup?.code} />
            : <div className="wallet pending"><div className="eyebrow light">Teslim kartı</div><p>Taşıyıcı onayından sonra yetkili alıcınız için QR’lı teslim kartı burada oluşur.</p></div>}
          {["TASIYICI_ONAYI_BEKLIYOR", "ONAYLI", "DEPO_KABUL"].includes(r.status) && <WarehouseGuide title="Depoya nasıl giderim?" facility={r.trip.origin} intakeCutoffAt={r.trip.intakeCutoffAt} />}
          {r.status === "VARISTA" && <WarehouseGuide title="Teslim alma adresi" facility={r.trip.destination} />}
          <PickupCard key={r.id + (r.pickup?.code ?? "")} r={r} onSaved={reload} />
          {r.measurement && (
            <div className={`alert ${r.measurement.outcome === "ok" ? "ok" : "warn"}`} data-testid="measurement-card">
              <span><b>Depo ölçümü:</b> beyan {r.measurement.declared.pallets} palet / {num(r.measurement.declared.kg)} kg · ölçülen {r.measurement.measured.pallets} palet / {num(r.measurement.measured.kg)} kg · {({ ok: "kabul", review: "inceleniyor", partial: "kısmi kabul", rejected: "depoda reddedildi" } as Record<string, string>)[r.measurement.outcome]}</span>
            </div>
          )}
          <div className="sub-panel">
            <span className="eyebrow">Zaman çizelgesi</span>
            <div className="vtl" style={{ marginTop: 10 }}>
              {r.events.length === 0 && <span className="muted small">Henüz olay yok.</span>}
              {r.events.map((e, i) => <div key={i}><b className="small">{e.label}</b> <span className="tiny">{full(e.at)}</span>{e.note && <div className="small muted">{e.note}</div>}</div>)}
            </div>
          </div>
        </div>
      </div>
      {cancelOpen && <CancelModal id={r.id} onClose={() => setCancelOpen(false)} onDone={() => { setCancelOpen(false); toast("Rezervasyon iptal edildi.", "ok"); reload(); onChanged(); }} />}
    </div>
  );
}

function yourCells(positions: number, r: Reservation) {
  const s = r.trip.sellable.pallets, rem = r.trip.remaining.pallets;
  const occupied = Math.max(0, positions - s) + Math.max(0, s - rem);
  const mineActive = !["RET", "IPTAL", "SURESI_DOLDU", "GELMEDI"].includes(r.status);
  // Kendi paletlerimiz "dolu" sayımının içinde; onları dolu bloğunun sonuna yerleştir.
  const mine = mineActive ? Math.min(r.pallets, occupied) : 0;
  return [
    ...Array.from({ length: occupied - mine }, () => ({ state: "full" as const })),
    ...Array.from({ length: mine }, () => ({ state: "mine" as const })),
  ];
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
            <div className="sub-panel"><div className="eyebrow">İade</div><div className="price-m" style={{ color: "var(--m6)" }}>{tl(prev.data.refundMinor)}</div></div>
            <div className="sub-panel"><div className="eyebrow">İptal ücreti</div><div className="price-m" style={{ color: prev.data.feeMinor ? "var(--danger)" : undefined }}>{tl(prev.data.feeMinor)}</div></div>
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
