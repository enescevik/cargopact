import { useEffect, useRef, useState } from "react";
import { MAX_MESSAGE_LENGTH, newSessionId } from "@cargopact/contracts";
import { ArrowUp, RotateCcw, Sparkles, X } from "lucide-react";
import { sendChat } from "./api";
import { ErrorBox } from "./ui";
import { Markdown } from "./Markdown";

interface Msg { role: "u" | "a"; text: string; trace?: string }

/**
 * Asistan çekmecesi: masaüstünde sağdan kayan panel, mobilde alttan gelen sayfa.
 * Kapatıldığında sohbet korunur (bileşen açık kalır, yalnızca gizlenir).
 */
export function AssistantDrawer({ open, onClose, prompts }: { open: boolean; onClose: () => void; prompts: string[] }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Error | null>(null);
  const session = useRef(newSessionId());
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, busy]);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => input.current?.focus(), 220);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { clearTimeout(t); window.removeEventListener("keydown", onKey); };
  }, [open, onClose]);

  async function send(m: string) {
    const message = m.trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!message || busy) return;
    setText(""); setErr(null); setBusy(true);
    setMsgs((x) => [...x, { role: "u", text: message }]);
    try {
      const r = await sendChat({ message, sessionId: session.current });
      session.current = r.sessionId || session.current;
      setMsgs((x) => [...x, { role: "a", text: r.reply, trace: r.correlationId }]);
    } catch (e) {
      setErr(e as Error);
    } finally { setBusy(false); }
  }
  const reset = () => { setMsgs([]); setErr(null); session.current = newSessionId(); };

  return (
    <>
      <div className={`drawer-scrim ${open ? "on" : ""}`} onClick={onClose} aria-hidden />
      <aside className={`drawer ${open ? "on" : ""}`} role="dialog" aria-modal="false" aria-label="CargoPact Asistanı" aria-hidden={!open} inert={!open || undefined}>
        <div className="drawer-grip" aria-hidden />
        <header className="drawer-head">
          <div className="drawer-av"><Sparkles size={16} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b>CargoPact Asistanı</b>
            <div className="tiny light">{busy ? "yanıt hazırlanıyor…" : "Yanıtlar 20 saniyeyi bulabilir"}</div>
          </div>
          {msgs.length > 0 && <button className="drawer-x" onClick={reset} title="Yeni sohbet" aria-label="Yeni sohbet"><RotateCcw size={16} /></button>}
          <button className="drawer-x" onClick={onClose} title="Kapat (Esc)" aria-label="Kapat"><X size={18} /></button>
        </header>
        <div className="drawer-body">
          {msgs.length === 0 && (
            <div className="drawer-empty">
              <div className="drawer-empty-ic"><Sparkles size={22} /></div>
              <b>Nasıl yardımcı olabilirim?</b>
              <p className="tiny">Sefer arayın, yükünüzü sorgulayın, talepleri özetletin.</p>
              <div className="drawer-prompts">
                {prompts.map((p) => <button key={p} className="drawer-prompt" onClick={() => send(p)}>{p}</button>)}
              </div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={`bub ${m.role}`}>
              {m.role === "a" ? <Markdown text={m.text} /> : m.text}
              {m.trace && <div className="bub-trace" title={m.trace}>İz: {m.trace.slice(0, 8)}</div>}
            </div>
          ))}
          {busy && <div className="bub a typing"><span /><span /><span /></div>}
          {err && <ErrorBox error={err} />}
          <div ref={end} />
        </div>
        <form className="drawer-input" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
          <textarea ref={input} rows={1} value={text} onChange={(e) => setText(e.target.value)} placeholder="Mesajınızı yazın…" maxLength={MAX_MESSAGE_LENGTH} disabled={busy}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(text); } }} aria-label="Mesaj" />
          <button className="drawer-send" disabled={busy || !text.trim()} aria-label="Gönder"><ArrowUp size={18} /></button>
        </form>
      </aside>
    </>
  );
}

