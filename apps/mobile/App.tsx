import { useEffect, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { api, signIn, signOut } from "./src/api";
import { c } from "./src/theme";
import { ToastProvider, Row } from "./src/ui";
import { NotificationBell } from "./src/Notifications";
import { Login } from "./src/Login";
import { Chat } from "./src/common";
import { Send } from "./src/customer/Send";
import { Reservations, TrackingScreen } from "./src/customer/Reservations";
import { Trips, Warehouse, QueuePill } from "./src/carrier/Carrier";
import { Exceptions } from "./src/carrier/Exceptions";
import type { Me } from "./src/types";

type Tab = { key: string; label: string; icon: string };
const CUSTOMER_TABS: Tab[] = [
  { key: "send", label: "Gönder", icon: "➤" }, { key: "res", label: "Rezervasyonlarım", icon: "▤" },
  { key: "track", label: "Takip", icon: "◎" }, { key: "chat", label: "Asistan", icon: "✦" },
];
const CARRIER_TABS: Tab[] = [
  { key: "trips", label: "Seferler", icon: "▦" }, { key: "wh", label: "Depo", icon: "▣" }, { key: "exc", label: "İstisnalar", icon: "!" }, { key: "chat", label: "Asistan", icon: "✦" },
];

function Shell() {
  const insets = useSafeAreaInsets();
  const [me, setMe] = useState<Me>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [tab, setTab] = useState("");

  const login = async (email: string, pw: string) => {
    setBusy(true); setError(undefined);
    try {
      await signIn(email, pw);
      const m = await api<Me>("GET", "/me");
      setMe(m);
      setTab(m.active.role === "customer_user" ? "send" : "trips");
    } catch (e) {
      const msg = (e as Error).message ?? "";
      setError(/incorrect|not authorized/i.test(msg) ? "E-posta veya parola hatalı." : msg || "Giriş yapılamadı.");
      signOut();
    } finally { setBusy(false); }
  };
  const logout = () => { signOut(); setMe(undefined); setTab(""); };

  if (!me) return <View style={{ flex: 1, paddingTop: Platform.OS === "web" ? 0 : insets.top }}><Login onLogin={login} busy={busy} error={error} /></View>;

  const isCustomer = me.active.role === "customer_user";
  const tabs = isCustomer ? CUSTOMER_TABS : CARRIER_TABS;

  return (
    <View style={{ flex: 1, backgroundColor: c.porcelain }}>
      <View style={{ paddingTop: insets.top + 8, paddingBottom: 10, paddingHorizontal: 20, backgroundColor: c.porcelain, borderBottomWidth: 1, borderBottomColor: c.line }}>
        <Row style={{ justifyContent: "space-between" }}>
          <Row gap={8}>
            <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: c.cobalt900, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: c.mint500, fontWeight: "900" }}>C</Text>
            </View>
            <View>
              <Text style={{ fontWeight: "800", color: c.ink900, fontSize: 14 }}>{isCustomer ? "CargoPact" : "Transfer Merkezi"}</Text>
              <Text style={{ fontSize: 11, color: c.ink500 }}>{me.displayName || me.email}</Text>
            </View>
          </Row>
          {!isCustomer && <QueuePill />}
          <NotificationBell onGo={() => setTab(isCustomer ? "res" : "trips")} />
          <Pressable onPress={logout} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 4 }}>
            <Text style={{ color: c.cobalt600, fontWeight: "700", fontSize: 13 }}>Çıkış</Text>
          </Pressable>
        </Row>
      </View>
      <View style={{ flex: 1 }}>
        {tab === "send" && <Send onDone={() => setTab("res")} />}
        {tab === "res" && <Reservations />}
        {tab === "track" && <TrackingScreen />}
        {tab === "trips" && <Trips />}
        {tab === "wh" && <Warehouse />}
        {tab === "exc" && <Exceptions />}
        {tab === "chat" && <Chat suggestions={isCustomer
          ? ["Gebze'den Ankara'ya 3 palet yüküm var, uygun sefer var mı?", "Rezervasyonlarımın durumu nedir?", "Fiyat nasıl hesaplanıyor?"]
          : ["Yarınki Gebze-Ankara seferinde kaç palet boş?", "Bekleyen talepleri öncelik sırasıyla özetle", "Gelmeme kaydı olan firmalar hangileri?"]} />}
      </View>
      <View style={{ flexDirection: "row", backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.line, paddingBottom: insets.bottom }}>
        {tabs.map((t) => {
          const on = tab === t.key;
          return (
            <Pressable key={t.key} onPress={() => setTab(t.key)} style={{ flex: 1, minHeight: 56, alignItems: "center", justifyContent: "center", gap: 2 }}>
              <Text style={{ fontSize: 18, color: on ? c.cobalt600 : c.ink300 }}>{t.icon}</Text>
              <Text style={{ fontSize: 11, fontWeight: on ? "800" : "600", color: on ? c.cobalt600 : c.ink500 }} numberOfLines={1}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function useWebFonts() {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    if (document.getElementById("cp-fonts")) return;
    const l = document.createElement("link");
    l.id = "cp-fonts"; l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Inter:wght@400;500;600;700;800&display=swap";
    document.head.appendChild(l);
    document.body.style.fontFamily = "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";
    document.body.style.backgroundColor = "#E9E4D6";
  }, []);
}
export default function App() {
  useWebFonts();
  const web = Platform.OS === "web";
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <View style={[{ flex: 1, backgroundColor: web ? "#E9E4D6" : c.porcelain, alignItems: "center" }, web ? ({ height: "100vh" } as object) : null]}>
        <View style={[{ flex: 1, width: "100%", maxWidth: 440, backgroundColor: c.porcelain, overflow: "hidden" }, web ? ({ boxShadow: "0 0 60px rgba(11,26,74,.15)" } as object) : null]}>
          <ToastProvider><Shell /></ToastProvider>
        </View>
      </View>
    </SafeAreaProvider>
  );
}
