import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Boxes, Clock, ShieldCheck } from "lucide-react";
import { signIn } from "./auth";
import { api, getToken, setToken, setUnauthorizedHandler } from "./api";
import type { Me } from "./types";
import { CustomerPortal } from "./Customer";
import { CarrierPortal } from "./Carrier";
import { ErrorBox, Skeleton, ToastProvider } from "./ui";
import "./styles.css";

const DEMO_PASSWORD = "Cargopact2026!";
const DEMOS = [
  { label: "Müşteri · Marmara Ambar", email: "web.musteri@cargopact.example.test" },
  { label: "Transfer merkezi · Dinçer Lojistik", email: "web.yonetici@cargopact.example.test" },
];

function cognitoMessage(e: unknown): string {
  const m = String((e as Error)?.message ?? e);
  const n = (e as { code?: string })?.code;
  if (n === "NotAuthorizedException" || /Incorrect username or password/i.test(m)) return "E-posta veya parola hatalı.";
  if (n === "UserNotFoundException") return "Bu e-posta ile kullanıcı bulunamadı.";
  if (n === "UserNotConfirmedException") return "Hesap henüz doğrulanmamış.";
  if (/Network|fetch/i.test(m)) return "Ağ hatası, bağlantınızı kontrol edin.";
  return m;
}

function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(""); setBusy(true);
    try { setToken(await signIn(email.trim(), password)); onDone(); }
    catch (x) { setErr(cognitoMessage(x)); }
    finally { setBusy(false); }
  }
  return (
    <div className="login">
      <section className="hero">
        <div className="logo" style={{ color: "#fff" }}><div className="logo-mark"><img src="/logo-mark.svg" alt="" /></div>CargoPact</div>
        <div>
          <div className="kicker" style={{ color: "var(--m5)", marginBottom: 14 }}>Planlı transferlerde boş palet pazarı</div>
          <h1>Boş kalan her palet, <em>doğru yüke</em> gitsin.</h1>
          <div className="lane">{Array.from({ length: 8 }, (_, i) => <span key={i} className={i < 3 ? "" : i < 6 ? "c" : "f"} />)}</div>
          <div className="pt"><Boxes size={20} style={{ flexShrink: 0 }} /><span>Taşıyıcılar kapasiteyi yayınlar, müşteriler rotalarına uygun araçta anında fiyat alır.</span></div>
          <div className="pt"><Clock size={20} style={{ flexShrink: 0 }} /><span>T−3 rezervasyon, T−1 depo kabul sınırları sunucuda hesaplanır.</span></div>
          <div className="pt"><ShieldCheck size={20} style={{ flexShrink: 0 }} /><span>Her firma yalnızca kendi verisini görür.</span></div>
        </div>
        <div className="tiny" style={{ color: "#8f9bd0" }}>Hackathon demosu · simüle ödeme ve kurgusal veri</div>
      </section>
      <section className="login-form">
        <form className="login-box col" style={{ gap: 16 }} onSubmit={submit}>
          <div><h2 className="title" style={{ fontSize: 34 }}>Hoş geldiniz</h2><p className="muted" style={{ marginTop: 6 }}>Devam etmek için giriş yapın.</p></div>
          <div className="field"><label>E-posta</label><input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          <div className="field"><label>Parola</label><input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
          {err && <div className="alert err" role="alert">{err}</div>}
          <button className="btn primary lg block" disabled={busy}>{busy ? "Giriş yapılıyor…" : <>Giriş yap <ArrowRight size={18} /></>}</button>
          <hr className="hr" style={{ margin: "4px 0" }} />
          <div>
            <div className="tiny" style={{ marginBottom: 8 }}>DEMO HESAPLARI · tıklayın, e-posta ve parola dolsun</div>
            <div className="col" style={{ gap: 8 }}>
              {DEMOS.map((d) => (
                <button type="button" key={d.email} className="chip btnlike" onClick={() => { setEmail(d.email); setPassword(DEMO_PASSWORD); setErr(""); }}>
                  <b>{d.label}</b><span className="muted">{d.email}</span>
                </button>
              ))}
            </div>
            <div className="tiny" style={{ marginTop: 8 }}>Demo parolası: <span className="mono">{DEMO_PASSWORD}</span></div>
          </div>
        </form>
      </section>
    </div>
  );
}

export function App() {
  const [authed, setAuthed] = useState(!!getToken());
  const [me, setMe] = useState<Me | null>(null);
  const [err, setErr] = useState<Error | null>(null);

  const logout = useCallback(() => { setToken(null); setMe(null); setAuthed(false); setErr(null); }, []);
  useEffect(() => { setUnauthorizedHandler(logout); }, [logout]);

  useEffect(() => {
    if (!authed) return;
    let live = true;
    setErr(null);
    api<Me>("GET", "/me").then((m) => live && setMe(m)).catch((e) => live && setErr(e));
    return () => { live = false; };
  }, [authed]);

  let body;
  if (!authed) body = <Login onDone={() => setAuthed(true)} />;
  else if (err) body = <div className="page" style={{ maxWidth: 560, marginTop: 80 }}><ErrorBox error={err} /><button className="btn" style={{ marginTop: 14 }} onClick={logout}>Çıkış yap</button></div>;
  else if (!me) body = <div className="page" style={{ maxWidth: 560, marginTop: 80 }}><Skeleton h={120} /></div>;
  else {
    const role = me.active.role;
    const tenantName = me.email;
    if (role === "customer_user") body = <CustomerPortal displayName={me.displayName} tenant={tenantName} onLogout={logout} />;
    else if (role.startsWith("carrier_")) body = <CarrierPortal displayName={me.displayName} tenant={tenantName} role={role} onLogout={logout} />;
    else body = <div className="page" style={{ maxWidth: 560, marginTop: 80 }}><ErrorBox error={`Bu rol (${role}) için arayüz bulunmuyor.`} /><button className="btn" style={{ marginTop: 14 }} onClick={logout}>Çıkış yap</button></div>;
  }
  return <ToastProvider>{body}</ToastProvider>;
}
