import { useEffect, useRef, useState } from "react";
import { MAX_MESSAGE_LENGTH, newSessionId } from "@cargopact/contracts";
import { Send, Sparkles } from "lucide-react";
import { sendChat } from "./api";
import { ErrorBox } from "./ui";

interface Msg { role: "u" | "a"; text: string }

export function Chat({ prompts }: { prompts: string[] }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Error | null>(null);
  const session = useRef(newSessionId());
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  async function send(m: string) {
    const message = m.trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!message || busy) return;
    setText(""); setErr(null); setBusy(true);
    setMsgs((x) => [...x, { role: "u", text: message }]);
    try {
      const r = await sendChat({ message, sessionId: session.current });
      session.current = r.sessionId || session.current;
      setMsgs((x) => [...x, { role: "a", text: r.reply }]);
    } catch (e) {
      setErr(e as Error);
    } finally { setBusy(false); }
  }

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <div className="page-head">
        <div className="kicker">Asistan</div>
        <h1 className="title">CargoPact Asistanı</h1>
        <p className="muted" style={{ marginTop: 6 }}>Sefer arayın, yükünüzü sorgulayın, talepleri özetletin. Yanıtlar 20 saniyeyi bulabilir.</p>
      </div>
      <div className="card chat">
        <div className="msgs">
          {msgs.length === 0 && (
            <div className="empty">
              <div className="ic"><Sparkles size={26} /></div>
              <div className="serif" style={{ fontSize: 20, color: "var(--i9)" }}>Nasıl yardımcı olabilirim?</div>
              <div className="row wrap" style={{ justifyContent: "center", marginTop: 16 }}>
                {prompts.map((p) => <button key={p} className="chip btnlike" onClick={() => send(p)}>{p}</button>)}
              </div>
            </div>
          )}
          {msgs.map((m, i) => <div key={i} className={`msg ${m.role}`}>{m.text}</div>)}
          {busy && <div className="msg a typing"><span /><span /><span /></div>}
          {err && <ErrorBox error={err} />}
          <div ref={end} />
        </div>
        <form className="row" style={{ marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); void send(text); }}>
          <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Mesajınızı yazın…" maxLength={MAX_MESSAGE_LENGTH} disabled={busy} />
          <button className="btn primary" disabled={busy || !text.trim()}><Send size={16} />Gönder</button>
        </form>
      </div>
    </div>
  );
}
