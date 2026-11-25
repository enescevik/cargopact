import { Component, useEffect, useState, type ReactNode } from "react";
import { Image, Platform, Pressable, Text, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useFonts, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold } from "@expo-google-fonts/plus-jakarta-sans";
import { api, signIn, signOut } from "./src/api";
import { c, sansBold } from "./src/theme";
import { ToastProvider, Row, useKeyboardHeight } from "./src/ui";
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
  { key: "send", label: "Gönder", icon: "➤" }, { key: "res", label: "Yüklerim", icon: "▤" },
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
  const kb = useKeyboardHeight();

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

  if (!me) return <Login onLogin={login} busy={busy} error={error} />;

  const isCustomer = me.active.role === "customer_user";
  const tabs = isCustomer ? CUSTOMER_TABS : CARRIER_TABS;

  return (
    <View style={{ flex: 1, backgroundColor: c.porcelain, paddingBottom: kb }}>
      <View style={{ paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 18, backgroundColor: c.cobalt900, borderBottomWidth: 1, borderBottomColor: "rgba(201,183,143,0.3)" }}>
        <Row style={{ justifyContent: "space-between" }}>
          <Row gap={10} style={{ flex: 1 }}>
            <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" }}>
              <Image source={require("./assets/logo-mark.png")} style={{ width: 24, height: 15 }} resizeMode="contain" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: sansBold, color: "#fff", fontSize: 15, letterSpacing: 0.3 }}>{isCustomer ? "CargoPact" : "Transfer Merkezi"}</Text>
              <Text style={{ fontSize: 11, color: c.champagne }} numberOfLines={1}>{isCustomer ? "Müşteri" : "Operasyon"} · {me.displayName || me.email}</Text>
            </View>
          </Row>
          {!isCustomer && <QueuePill />}
          <View style={{ backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 22 }}><NotificationBell onGo={() => setTab(isCustomer ? "res" : "trips")} /></View>
          <Pressable onPress={logout} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 6 }}>
            <Text style={{ color: "#B9C3EF", fontWeight: "700", fontSize: 13 }}>Çıkış</Text>
          </Pressable>
        </Row>
      </View>
      <View style={{ flex: 1 }}>
        <ScreenGuard key={tab}>
        {tab === "send" && <Send onDone={() => setTab("res")} />}
        {tab === "res" && <Reservations />}
        {tab === "track" && <TrackingScreen />}
        {tab === "trips" && <Trips />}
        {tab === "wh" && <Warehouse />}
        {tab === "exc" && <Exceptions />}
        {tab === "chat" && <Chat suggestions={isCustomer
          ? ["Gebze'den Ankara'ya 3 palet yüküm var, uygun sefer var mı?", "Rezervasyonlarımın durumu nedir?", "Fiyat nasıl hesaplanıyor?"]
          : ["Yarınki Gebze-Ankara seferinde kaç palet boş?", "Bekleyen talepleri öncelik sırasıyla özetle", "Gelmeme kaydı olan firmalar hangileri?"]} />}
        </ScreenGuard>
      </View>
      {kb === 0 && <View style={{ flexDirection: "row", backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.line, paddingBottom: insets.bottom }}>
        {tabs.map((t) => {
          const on = tab === t.key;
          return (
            <Pressable key={t.key} onPress={() => setTab(t.key)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={{ flex: 1, minHeight: 58, alignItems: "center", justifyContent: "center", gap: 3 }}>
              <View style={{ paddingHorizontal: 16, paddingVertical: 3, borderRadius: 999, backgroundColor: on ? c.cobalt900 : "transparent" }}>
                <Text style={{ fontSize: 16, color: on ? c.mint500 : c.ink500 }}>{t.icon}</Text>
              </View>
              <Text style={{ fontSize: 11, fontFamily: on ? sansBold : undefined, fontWeight: on ? undefined : "600", color: on ? c.cobalt900 : c.ink500 }} numberOfLines={1}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>}
    </View>
  );
}

/** Bir ekranda beklenmeyen hata olursa uygulama kapanmasın; ekran içinde uyarı + yeniden dene göster. */
class ScreenGuard extends Component<{ children: ReactNode }, { err?: Error }> {
  state: { err?: Error } = {};
  static getDerivedStateFromError(err: Error) { return { err }; }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 10 }}>
        <Text style={{ fontFamily: sansBold, fontSize: 18, color: c.ink900 }}>Bu ekran açılamadı</Text>
        <Text style={{ color: c.ink500, textAlign: "center", fontSize: 13 }}>{this.state.err.message}</Text>
        <Pressable onPress={() => this.setState({ err: undefined })} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 18, borderRadius: 12, backgroundColor: c.cobalt900 }}>
          <Text style={{ color: "#fff", fontWeight: "700" }}>Tekrar dene</Text>
        </Pressable>
      </View>
    );
  }
}

function useWebFonts() {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    if (document.getElementById("cp-fonts")) return;
    const l = document.createElement("link");
    l.id = "cp-fonts"; l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap";
    document.head.appendChild(l);
    document.body.style.fontFamily = "'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', sans-serif";
    document.body.style.backgroundColor = "#E9E4D6";
  }, []);
}
export default function App() {
  useWebFonts();
  const [fontsReady, fontErr] = useFonts({ PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold });
  if (!fontsReady && !fontErr) return <View style={{ flex: 1, backgroundColor: c.cobalt900 }} />;
  const web = Platform.OS === "web";
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <View style={[{ flex: 1, backgroundColor: web ? "#E9E4D6" : c.porcelain, alignItems: "center" }, web ? ({ height: "100vh" } as object) : null]}>
        <View style={[{ flex: 1, width: "100%", maxWidth: 440, backgroundColor: c.porcelain, overflow: "hidden" }, web ? ({ boxShadow: "0 0 60px rgba(11,26,74,.15)" } as object) : null]}>
          <ToastProvider><Shell /></ToastProvider>
        </View>
      </View>
    </SafeAreaProvider>
  );
}
