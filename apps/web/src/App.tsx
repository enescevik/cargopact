import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Boxes, Clock, Package, ShieldCheck, Truck } from "lucide-react";
import { TruckMap } from "./components/TruckMap";
import { signIn } from "./auth";
import { api, getToken, setToken, setUnauthorizedHandler } from "./api";
import type { Me } from "./types";
import { CustomerPortal } from "./Customer";
import { CarrierPortal } from "./Carrier";
import { ErrorBox, Skeleton, ToastProvider } from "./ui";
import "./styles.css";
import "./premium.css";

const DEMO_PASSWORD = "Cargopact2026!";
const DEMOS = [
  { role: "Müşteri", firm: "Marmara Ambar · palet gönder, yüklerini izle", email: "web.musteri@cargopact.example.test", icon: <Package size={20} /> },
  { role: "Transfer merkezi", firm: "Dinçer Lojistik · sefer aç, talepleri onayla", email: "web.yonetici@cargopact.example.test", icon: <Truck size={20} /> },
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
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [manual, setManual] = useState(false);
  async function go(u: string, p: string, key: string) {
    setErr(""); setBusy(key);
    try { setToken(await signIn(u.trim(), p)); onDone(); }
    catch (x) { setErr(cognitoMessage(x)); }
    finally { setBusy(null); }
  }
  function submit(e: FormEvent) { e.preventDefault(); void go(email, password, "form"); }
  // 33 pozisyonlu araç: 25 iç yük, 8 boş yer sırayla dolar
  const [filled, setFilled] = useState(25);
  useEffect(() => { const t = setInterval(() => setFilled((f) => (f >= 33 ? 25 : f + 1)), 900); return () => clearInterval(t); }, []);
  const cells = Array.from({ length: 33 }, (_, i) => ({ state: (i < 25 ? "int" : i < filled ? "conf" : "empty") as "int" | "conf" | "empty" }));
  return (
    <div className="login">
      <section className="hero">
        <div className="logo" style={{ color: "#fff" }}><div className="logo-mark"><img src="/logo-mark.svg" alt="" /></div>CargoPact</div>
        <div>
          <div className="eyebrow" style={{ color: "var(--m5)", marginBottom: 14 }}>Planlı transferlerde boş palet pazarı</div>
          <h1>İşiniz hep <em>yolunda</em>.</h1>
          <p className="hero-lead">Planlı seferdeki boş palet yerini görün, seçin, ayırın. Araç dolarken siz izleyin.</p>
          <div className="hero-truck"><TruckMap operator positions={33} cells={cells} compact /><div className="hero-count"><b>{filled}</b>/33 planlanan</div></div>
          <div className="hero-pts">
            <span><Boxes size={16} />Palet · kg · m³ birlikte kontrol</span>
            <span><Clock size={16} />T−3 rezervasyon, T−1 depo kabul</span>
            <span><ShieldCheck size={16} />Her firma yalnız kendi verisini görür</span>
          </div>
        </div>
        <div className="tiny" style={{ color: "#8f9bd0" }}>Hackathon demosu · simüle ödeme ve kurgusal veri</div>
      </section>
      <section className="login-form">
        <div className="login-box col" style={{ gap: 18 }}>
          <div><h2 className="route-h">Hoş geldiniz</h2><p className="muted" style={{ marginTop: 6 }}>Rolünüzü seçin, tek dokunuşla girin.</p></div>
          <div className="col" style={{ gap: 10 }}>
            {DEMOS.map((d) => (
              <button type="button" key={d.email} className="role-card" disabled={!!busy} onClick={() => go(d.email, DEMO_PASSWORD, d.email)}>
                <span className="role-ic">{d.icon}</span>
                <span className="role-t"><b>{d.role}</b><small>{d.firm}</small></span>
                {busy === d.email ? <span className="tiny">Giriş…</span> : <ArrowRight size={18} />}
              </button>
            ))}
          </div>
          {err && <div className="alert err" role="alert">{err}</div>}
          {!manual ? <button type="button" className="link small" onClick={() => setManual(true)}>E-posta ve parola ile giriş</button> : (
            <form className="col" style={{ gap: 12 }} onSubmit={submit}>
              <div className="field"><label htmlFor="em">E-posta</label><input id="em" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
              <div className="field"><label htmlFor="pw">Parola</label><input id="pw" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
              <button className="btn cta block" disabled={!!busy}>{busy === "form" ? "Giriş yapılıyor…" : <>Giriş yap <ArrowRight size={18} /></>}</button>
            </form>
          )}
          <div className="tiny">Demo hesapları kurgusaldır · parola <span className="mono">{DEMO_PASSWORD}</span></div>
        </div>
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
