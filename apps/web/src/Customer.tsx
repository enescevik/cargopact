import { useCallback, useState } from "react";
import { BellRing, LogOut, MessageSquare, PackageSearch, Truck } from "lucide-react";
import type { Reservation } from "./types";
import { Chat } from "./Chat";
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
    ["book", "Palet gönder", <Truck size={16} />], ["loads", "Yüklerim", <PackageSearch size={16} />], ["chat", "Asistan", <MessageSquare size={16} />],
  ];
  return (
    <div className="app">
      <header className="hdr">
        <div className="hdr-in">
          <div className="logo"><div className="logo-mark"><img src="/logo-mark.svg" alt="" /></div>CargoPact</div>
          <nav className="tabs-top" aria-label="Ana menü">
            {nav.map(([k, l, ic]) => (
              <button key={k} className={view.name === k ? "on" : ""} aria-current={view.name === k ? "page" : undefined} onClick={() => setView({ name: k } as View)}>{ic}{l}</button>
            ))}
          </nav>
          {hits.length > 0 && view.name === "book" && (
            <span className="alarm-hit" role="status"><BellRing size={14} /> {hits.length} alarmınız için yer açıldı</span>
          )}
          <Notifications onOpen={(n) => n.reservationId && setView({ name: "loads", id: n.reservationId })} />
          <div className="who-top"><b>{displayName}</b>{tenant && <span>{tenant}</span>}</div>
          <button className="btn sm quiet" onClick={onLogout} aria-label="Çıkış"><LogOut size={14} /></button>
        </div>
      </header>
      <main className="stage">
        {view.name === "book" && <BookView alarmHits={onHits} onDone={(r: Reservation) => setView({ name: "loads", id: r.id, fresh: true })} />}
        {view.name === "loads" && <LoadsView initialId={view.id} justCreated={view.fresh} />}
        {view.name === "chat" && (
          <div className="pagepad scroll">
            <Chat prompts={["Gebze'den Ankara'ya 3 palet yüküm var, uygun sefer var mı?", "CP-2026-000001 numaralı yüküm nerede?"]} />
          </div>
        )}
      </main>
    </div>
  );
}
