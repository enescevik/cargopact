import { api } from "./api";
import { dt } from "./format";
import { Empty, ErrorBox, SkeletonCards, useFetch } from "./ui";

export interface TraceTurn {
  correlationId: string; sessionId: string | null; userRole: string | null; createdAt: string;
  latencyMs: number | null; ok: boolean | null;
  toolCalls: { method: string; path: string; status: number; ms: number }[];
  auditEntries: { action: string; entityType: string }[];
}

const ROLE: Record<string, string> = {
  customer_user: "Müşteri", carrier_admin: "Taşıyıcı yön.", carrier_planner: "Planlamacı", carrier_warehouse: "Depo",
  platform_admin: "Platform", admin_viewer: "Jüri",
};

function TraceTable({ items, compact }: { items: TraceTurn[]; compact?: boolean }) {
  return (
    <table>
      <thead><tr><th>Zaman</th><th>Rol</th><th>İz</th><th>Gecikme</th><th>Araç çağrıları</th>{!compact && <th>Denetim</th>}</tr></thead>
      <tbody>{items.map((t) => (
        <tr key={t.correlationId}>
          <td className="small">{dt(t.createdAt)}</td>
          <td className="small">{ROLE[t.userRole ?? ""] ?? t.userRole ?? "—"}</td>
          <td><code title={t.correlationId}>{t.correlationId.slice(0, 8)}</code></td>
          <td className="small">{t.latencyMs == null ? "—" : `${(t.latencyMs / 1000).toFixed(1)} sn`}{t.ok === false ? " ✗" : ""}</td>
          <td className="small">{t.toolCalls.length === 0 ? "—" : t.toolCalls.map((c, i) => (
            <div key={i}><b>{c.method}</b> {c.path} <span className="muted">{c.status} · {c.ms} ms</span></div>
          ))}</td>
          {!compact && <td className="small">{t.auditEntries.length === 0 ? "—" : t.auditEntries.map((a, i) => <div key={i}>{a.action}</div>)}</td>}
        </tr>
      ))}</tbody>
    </table>
  );
}

function useTraces(limit: number) {
  return useFetch((s) => api<{ items: TraceTurn[] }>("GET", `/carrier/agent-traces?limit=${limit}`, undefined, { signal: s }), [limit], 10000);
}

export function TracesView() {
  const { data, error, loading, reload } = useTraces(30);
  return (
    <div className="page" style={{ maxWidth: 1200 }}>
      <div className="page-head">
        <div className="kicker">Denetlenebilirlik</div>
        <h1 className="title">Asistan işlem izi</h1>
        <p className="muted" style={{ marginTop: 6 }}>Her sohbet turu bir izleme kimliği taşır; asistanın çağırdığı API uçları ve aynı kimlikle yazılan denetim kayıtları burada eşleşir.</p>
      </div>
      <div className="card">
        {loading ? <SkeletonCards n={1} h={160} /> : error ? <ErrorBox error={error} onRetry={reload} /> :
          !data?.items.length ? <Empty title="Henüz iz yok" text="Asistana bir soru sorun." /> : <TraceTable items={data.items} />}
      </div>
    </div>
  );
}

/** Jüri panosu için kompakt panel. */
export function TracesPanel() {
  const { data, error } = useTraces(5);
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3 className="serif" style={{ fontSize: 24, marginBottom: 6 }}>Asistan işlem izi</h3>
      {error && !data ? <div className="small muted">İz verisi alınamadı.</div> :
        !data?.items.length ? <div className="small muted">Henüz asistan izi yok.</div> : <TraceTable items={data.items} compact />}
    </div>
  );
}
