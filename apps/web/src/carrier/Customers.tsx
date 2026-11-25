import { useMemo, useState } from "react";
import { AlertTriangle, Building2, CheckCircle2, Eye, Search, Sparkles } from "lucide-react";
import { api, sendChat } from "../api";
import { dt } from "../format";
import { Empty, ErrorBox, Modal, SkeletonCards, useFetch } from "../ui";

export type CustomerRiskCategory = "UYGUN" | "IZLENMELI" | "RISKLI";
export type CustomerManagementItem = {
  id: string; name: string; tenantStatus: string;
  totalReservations: number; delivered: number; verifiedNoShows: number; cancelled: number; rejected: number; damaged: number; pending: number; active: number;
  score: number; category: CustomerRiskCategory; evidenceCount: number; scoreExplanation: string; lastReservationAt: string;
  recentEvents: { type: string; label: string; at: string; reservationReference: string }[];
};

const CATEGORY: Record<CustomerRiskCategory, { label: string; cls: string; color: string }> = {
  UYGUN: { label: "Uygun", cls: "ok", color: "var(--m6)" },
  IZLENMELI: { label: "İzlenmeli", cls: "warn", color: "var(--warn)" },
  RISKLI: { label: "Riskli profil", cls: "bad", color: "var(--danger)" },
};

export function CustomerManagement() {
  const { data, error, loading, reload } = useFetch((s) => api<{ items: CustomerManagementItem[] }>("GET", "/carrier/customers", undefined, { signal: s }), [], 15000);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CustomerRiskCategory | "ALL">("ALL");
  const [selected, setSelected] = useState<CustomerManagementItem | null>(null);
  const items = useMemo(() => (data?.items ?? []).filter((x) =>
    (category === "ALL" || x.category === category) && x.name.toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR").trim())), [data, query, category]);
  const counts = useMemo(() => (data?.items ?? []).reduce((a, x) => ({ ...a, [x.category]: a[x.category] + 1 }), { UYGUN: 0, IZLENMELI: 0, RISKLI: 0 }), [data]);

  return (
    <div className="page">
      <div className="page-head row between wrap">
        <div><div className="kicker">Dinçer Lojistik · karar desteği</div><h1 className="title">Müşteri Yönetimi</h1><p className="muted" style={{ marginTop: 6 }}>Rezervasyon sonuçlarına dayalı, açıklanabilir operasyonel güven görünümü.</p></div>
        <div className="row wrap">
          <span className="badge ok">{counts.UYGUN} uygun</span><span className="badge warn">{counts.IZLENMELI} izlenmeli</span><span className="badge bad">{counts.RISKLI} riskli</span>
        </div>
      </div>
      <div className="alert info" style={{ marginBottom: 16 }}><Sparkles size={18} /><span><b>Skor otomatik karar değildir.</b> Yalnız teslim ve doğrulanmış gelmeme olaylarından deterministik hesaplanır. Knowledge Base, Dinçer kurallarını açıklar; skor üretmez.</span></div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row between wrap">
          <div className="field" style={{ minWidth: 280, flex: 1 }}><label>Firma ara</label><div style={{ position: "relative" }}><Search size={16} style={{ position: "absolute", left: 12, top: 12, color: "var(--i3)" }} /><input className="input" style={{ paddingLeft: 38 }} placeholder="Müşteri adı" value={query} onChange={(e) => setQuery(e.target.value)} /></div></div>
          <div className="row wrap" style={{ alignSelf: "flex-end" }}>
            {(["ALL", "UYGUN", "IZLENMELI", "RISKLI"] as const).map((x) => <button key={x} className="chip btnlike" style={category === x ? { background: "var(--c1)", borderColor: "var(--c5)", color: "var(--c7)" } : undefined} onClick={() => setCategory(x)}>{x === "ALL" ? "Tümü" : CATEGORY[x].label}</button>)}
          </div>
        </div>
      </div>
      {loading ? <SkeletonCards n={4} h={90} /> : error ? <ErrorBox error={error} onRetry={reload} /> : items.length === 0 ? <div className="card"><Empty title="Müşteri bulunamadı" /></div> : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table>
            <thead><tr><th>Firma</th><th>Skor</th><th>Kategori</th><th>Teslim</th><th>Gelmeme</th><th>Bekleyen / Aktif</th><th>Son işlem</th><th /></tr></thead>
            <tbody>{items.map((x) => {
              const tone = CATEGORY[x.category];
              return <tr key={x.id}>
                <td><div className="row"><div style={{ width: 34, height: 34, borderRadius: 10, background: "var(--c0)", display: "grid", placeItems: "center", color: "var(--c7)" }}><Building2 size={17} /></div><div><b>{x.name}</b><div className="tiny">{x.totalReservations} toplam talep · {x.evidenceCount} sonuç kanıtı</div></div></div></td>
                <td><b className="serif" style={{ fontSize: 23, color: tone.color }}>{x.score}</b><span className="tiny"> / 100</span></td>
                <td><span className={`badge ${tone.cls}`}>{tone.label}</span></td>
                <td><b>{x.delivered}</b></td><td><b className={x.verifiedNoShows ? "red" : ""}>{x.verifiedNoShows}</b></td>
                <td className="small">{x.pending} bekleyen · {x.active} aktif</td><td className="small">{dt(x.lastReservationAt)}</td>
                <td style={{ textAlign: "right" }}><button className="btn sm" onClick={() => setSelected(x)}><Eye size={14} />Analiz</button></td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      )}
      {selected && <CustomerAnalysis customer={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function CustomerAnalysis({ customer, onClose }: { customer: CustomerManagementItem; onClose: () => void }) {
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const tone = CATEGORY[customer.category];
  const askKnowledgeBase = async () => {
    setBusy(true); setError(null); setReply("");
    try {
      const r = await sendChat({
        sessionId: `customer-${crypto.randomUUID()}`,
        message: `Dinçer müşteri yönetimi için kural yorumu hazırla. Bu sayılar ve skor işlem API'si tarafından hesaplandı; yeniden hesaplama, değiştirme veya tahmin etme: ` +
          `Firma ${customer.name}; skor ${customer.score}/100; kategori ${customer.category}; teslim ${customer.delivered}; doğrulanmış gelmeme ${customer.verifiedNoShows}; ` +
          `iptal ${customer.cancelled}; ret ${customer.rejected}; eksik/hasar ${customer.damaged}; bekleyen ${customer.pending}. ` +
          "carrier_knowledge aracını çağır; yalnız Dinçer'in gelmeme, öncelik ve operasyonel skor kurallarını kısa ve tarafsız açıkla, kaynak dosya adını belirt. Onay veya ret önerme.",
      });
      setReply(r.reply);
    } catch (e) { setError(e as Error); }
    finally { setBusy(false); }
  };
  const metrics = [
    ["Teslim", customer.delivered], ["Doğrulanmış gelmeme", customer.verifiedNoShows], ["İptal", customer.cancelled],
    ["Ret", customer.rejected], ["Eksik / hasar", customer.damaged], ["Bekleyen", customer.pending],
  ];
  return <Modal title={`${customer.name} · müşteri analizi`} onClose={onClose}>
    <div className="row between wrap" style={{ marginBottom: 16 }}>
      <div><div className="serif" style={{ fontSize: 38, color: tone.color }}>{customer.score}<span className="small"> / 100</span></div><span className={`badge ${tone.cls}`}>{tone.label}</span></div>
      <div className="small muted" style={{ maxWidth: 360 }}>{customer.scoreExplanation}<br />Kanıt sayısı: {customer.evidenceCount}</div>
    </div>
    <div className="alert warn" style={{ marginBottom: 16 }}><AlertTriangle size={18} /><span>Bu kategori rezervasyon uygunluğu veya otomatik ret kararı değildir. Planlamacı güncel kapasiteyi ve operasyon koşullarını ayrıca değerlendirir.</span></div>
    <div className="grid2" style={{ marginBottom: 18 }}>{metrics.map(([label, value]) => <div key={String(label)} className="card flat" style={{ padding: 12 }}><div className="tiny">{label}</div><b style={{ fontSize: 20 }}>{value}</b></div>)}</div>
    <h3 className="serif" style={{ fontSize: 19, marginBottom: 8 }}>Son olaylar</h3>
    <div className="col" style={{ gap: 6, marginBottom: 18 }}>{customer.recentEvents.map((e) => <div key={`${e.reservationReference}-${e.type}-${e.at}`} className="row between small"><span><CheckCircle2 size={13} style={{ verticalAlign: -2, marginRight: 6 }} />{e.label} · <span className="mono">{e.reservationReference}</span></span><span className="muted">{dt(e.at)}</span></div>)}</div>
    <hr className="hr" />
    <div className="row between wrap"><div><b>Knowledge Base değerlendirmesi</b><div className="tiny">Dinçer'e özel kural dokümanından açıklama getirir.</div></div><button className="btn primary" disabled={busy} onClick={askKnowledgeBase}><Sparkles size={15} />{busy ? "Yorum hazırlanıyor…" : "KB yorumunu getir"}</button></div>
    {error && <div style={{ marginTop: 12 }}><ErrorBox error={error} /></div>}
    {reply && <div className="alert info" style={{ marginTop: 14, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{reply}</div>}
  </Modal>;
}
