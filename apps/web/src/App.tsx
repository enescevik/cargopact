import { useState, type FormEvent } from "react";
import { MAX_MESSAGE_LENGTH } from "@cargopact/contracts";
import { signIn, signUp, confirmSignUp } from "./auth";
import { sendChat } from "./api";

interface Msg { role: "user" | "agent"; text: string }

function Login({ onToken }: { onToken: (t: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [err, setErr] = useState("");

  const run = (fn: () => Promise<void>) => fn().catch((e) => setErr(String(e.message ?? e)));

  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        setErr("");
        run(async () => {
          if (needsCode) {
            await confirmSignUp(email, code);
            setNeedsCode(false);
          }
          onToken(await signIn(email, password));
        });
      }}
      style={{ display: "grid", gap: 8, maxWidth: 320, margin: "10vh auto" }}
    >
      <h1>CargoPact</h1>
      <input placeholder="E-posta" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input placeholder="Parola" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      {needsCode && <input placeholder="Doğrulama kodu" value={code} onChange={(e) => setCode(e.target.value)} />}
      <button type="submit">Giriş yap</button>
      <button type="button" onClick={() => run(async () => { await signUp(email, password); setNeedsCode(true); })}>
        Kayıt ol
      </button>
      {err && <p role="alert" style={{ color: "crimson" }}>{err}</p>}
    </form>
  );
}

function Chat({ token }: { token: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    setMsgs((m) => [...m, { role: "user", text }]);
    try {
      const res = await sendChat(token, { message: text, sessionId });
      setSessionId(res.sessionId);
      setMsgs((m) => [...m, { role: "agent", text: res.reply }]);
    } catch (err) {
      setMsgs((m) => [...m, { role: "agent", text: `Hata: ${(err as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 16, display: "grid", gap: 12 }}>
      <h1>CargoPact</h1>
      <div style={{ display: "grid", gap: 8 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ justifySelf: m.role === "user" ? "end" : "start", background: m.role === "user" ? "#dbeafe" : "#f3f4f6", padding: 10, borderRadius: 8, whiteSpace: "pre-wrap" }}>
            {m.text}
          </div>
        ))}
        {busy && <em>Yanıt hazırlanıyor…</em>}
      </div>
      <form onSubmit={submit} style={{ display: "flex", gap: 8 }}>
        <input style={{ flex: 1 }} value={input} maxLength={MAX_MESSAGE_LENGTH} onChange={(e) => setInput(e.target.value)} placeholder="Mesajınız" />
        <button disabled={busy}>Gönder</button>
      </form>
    </div>
  );
}

export function App() {
  const [token, setToken] = useState<string>();
  return token ? <Chat token={token} /> : <Login onToken={setToken} />;
}
