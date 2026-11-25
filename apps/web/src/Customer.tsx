import { useCallback, useState } from "react";
import { BellRing, LogOut, MessageSquare, PackageSearch, Truck } from "lucide-react";
import type { Reservation } from "./types";
import { Chat } from "./Chat";
import { Sheet } from "./components/controls";
import { Notifications } from "./Notifications";
import { BookView } from "./customer/Book";
import { LoadsView } from "./customer/Loads";
import type { Alarm } from "./lib/store";

type View = { name: "book" } | { name: "loads"; id?: string; fresh?: boolean } | { name: "chat" };

export function CustomerPortal({ displayName, tenant, onLogout }: { displayName: string; tenant?: string; onLogout: () => void }) {
  const [view, setView] = useState<View>({ name: "book" });
  const [hits, setHits] = useState<Alarm[]>([]);
  const onHits = useCallback((a: Alarm[]) => setHits(a), []);
  const nav: [View["name"], string, React.ReactNode][] = [
    ["book", "Palet gönder", <Truck size={19} />], ["loads", "Yüklerim", <PackageSearch size={19} />], ["chat", "Asistan", <MessageSquare size={19} />],
  ];
  return (
    <div className="app rail-shell">
      <aside className="rail" aria-label="Ana menü">
        <div className="logo-mark rail-logo"><img src="/logo-mark.svg" alt="CargoPact" /></div>
        {nav.map(([k, l, ic]) => (
          <button key={k} className={`rail-btn ${view.name === k ? "on" : ""}`} aria-current={view.name === k ? "page" : undefined} onClick={() => setView({ name: k } as View)} aria-label={l} title={l}>{ic}<span>{l}</span></button>
        ))}
        {hits.length > 0 && (
          <button className="rail-btn rail-alarm" onClick={() => setView({ name: "book" })} title={`${hits.length} alarmınız için yer açıldı`} aria-label="Alarm eşleşmesi"><BellRing size={18} /><span>{hits.length} yer açıldı</span></button>
        )}
        <div className="rail-bottom">
          <Notifications side onOpen={(n) => n.reservationId && setView({ name: "loads", id: n.reservationId })} />
          <button className="rail-btn" onClick={onLogout} title={`${displayName}${tenant ? ` · ${tenant}` : ""} · Çıkış`} aria-label="Çıkış"><LogOut size={18} /><span>Çıkış</span></button>
        </div>
      </aside>
      <main className="stage">
        {view.name === "book" && <BookView who={`${displayName}${tenant ? ` · ${tenant}` : ""}`} alarmHits={onHits} onDone={(r: Reservation) => setView({ name: "loads", id: r.id, fresh: true })} />}
        {view.name === "loads" && <LoadsView initialId={view.id} justCreated={view.fresh} />}
        {view.name === "chat" && (
          <Sheet>
            <Chat prompts={["Gebze'den Ankara'ya 3 palet yüküm var, uygun sefer var mı?", "CP-2026-000001 numaralı yüküm nerede?"]} />
          </Sheet>
        )}
      </main>
    </div>
  );
}
