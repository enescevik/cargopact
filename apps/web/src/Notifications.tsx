import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { api } from "./api";
import { useToast } from "./ui";
export interface AppNotification {
  id: string; audience: "customer" | "carrier"; reservationId: string | null; tripId: string | null;
  type: string; title: string; body: string | null; createdAt: string; readAt: string | null; isDemo: boolean;
}
const POLL_MS = 10_000;
const ago = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "şimdi";
  if (s < 3600) return `${Math.floor(s / 60)} dk önce`;
  if (s < 86400) return `${Math.floor(s / 3600)} sa önce`;
  return new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" });
};
/** Zil + okunmamış rozeti + açılır liste. 10 sn'de bir yoklar; yeni bildirimler toast ile gösterilir. */
export function Notifications({ onOpen, side = false }: { onOpen: (n: AppNotification) => void; side?: boolean }) {
  const toast = useToast();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<React.CSSProperties>({});
  const seen = useRef<Set<string> | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const load = useCallback(async () => {
    try {
      const r = await api<{ items: AppNotification[]; unreadCount: number }>("GET", "/notifications");
      if (seen.current) for (const n of r.items.filter((x) => !seen.current!.has(x.id) && !x.readAt).reverse()) toast(n.title, "info");
      seen.current = new Set(r.items.map((x) => x.id));
      setItems(r.items); setUnread(r.unreadCount);
    } catch { /* sessiz: bir sonraki yoklamada tekrar denenir */ }
  }, [toast]);
  useEffect(() => {
    void load();
    const t = setInterval(() => { if (!document.hidden) void load(); }, POLL_MS);
    return () => clearInterval(t);
  }, [load]);
  const toggle = () => {
    const r = btn.current?.getBoundingClientRect();
    if (r) setPos(side ? { left: r.right + 8, bottom: Math.max(8, window.innerHeight - r.bottom) } : { right: Math.max(8, window.innerWidth - r.right), top: r.bottom + 8 });
    setOpen((o) => !o);
  };
  const click = async (n: AppNotification) => {
    setOpen(false);
    if (!n.readAt) {
      setItems((x) => x.map((i) => (i.id === n.id ? { ...i, readAt: new Date().toISOString() } : i)));
      setUnread((u) => Math.max(0, u - 1));
      void api("POST", `/notifications/${n.id}/read`, {}).catch(() => {});
    }
    onOpen(n);
  };
  const readAll = async () => {
    setItems((x) => x.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() }))); setUnread(0);
    await api("POST", "/notifications/read-all", {}).catch(() => {});
  };
  return (
    <>
      <button ref={btn} className="btn sm" aria-label={`Bildirimler${unread ? `, ${unread} okunmamış` : ""}`} onClick={toggle} style={{ position: "relative" }}>
        <Bell size={16} />
        {unread > 0 && <span style={{ position: "absolute", top: -6, right: -6, minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: "#d92d20", color: "#fff", fontSize: 11, fontWeight: 700, lineHeight: "18px", textAlign: "center" }}>{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 90 }} onClick={() => setOpen(false)} />
          <div role="dialog" aria-label="Bildirimler" style={{ position: "fixed", zIndex: 91, width: "min(380px, calc(100vw - 16px))", maxHeight: "70vh", overflowY: "auto", background: "#fff", color: "#1b2033", borderRadius: 16, boxShadow: "0 12px 40px rgba(20,24,50,.25)", border: "1px solid #e6e3da", ...pos }}>
            <div className="row between" style={{ padding: "12px 16px", borderBottom: "1px solid #eee", position: "sticky", top: 0, background: "#fff" }}>
              <b>Bildirimler</b>
              <button className="btn sm" onClick={readAll} disabled={unread === 0}><CheckCheck size={14} />Tümünü okundu yap</button>
            </div>
            {items.length === 0 ? <div className="muted" style={{ padding: 24, textAlign: "center" }}>Henüz bildirim yok.</div> : items.map((n) => (
              <button key={n.id} onClick={() => click(n)} style={{ display: "block", width: "100%", textAlign: "left", padding: "12px 16px", border: 0, borderBottom: "1px solid #f1efe9", background: n.readAt ? "#fff" : "#eef3ff", cursor: "pointer", font: "inherit", color: "inherit" }}>
                <div className="row between" style={{ gap: 8 }}>
                  <b style={{ fontSize: 14 }}>{n.title}</b>
                  <span className="tiny" style={{ whiteSpace: "nowrap" }}>{ago(n.createdAt)}</span>
                </div>
                {n.body && <div className="small muted" style={{ marginTop: 2 }}>{n.body}</div>}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
