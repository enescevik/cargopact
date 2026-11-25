import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { c, serif } from "./theme";
import { Btn, Field } from "./ui";
import { Eyebrow, TruckMap } from "./premium";
import { tap } from "./haptics";

const DEMO_PASSWORD = "Cargopact2026!";
const DEMOS = [
  { role: "Müşteri olarak gir", firm: "Anadolu Parsiyel · palet gönder, takip et", email: "mobil.musteri@cargopact.example.test", icon: "➤" },
  { role: "Transfer merkezi olarak gir", firm: "Dinçer Lojistik · onay, depo, kokpit", email: "mobil.yonetici@cargopact.example.test", icon: "▦" },
];

/** Web girişinin mobil karşılığı: noir sahne + dolan tır + alttan yükselen rol kartları. */
export function Login({ onLogin, busy, error }: { onLogin: (email: string, pw: string) => void; busy: boolean; error?: string }) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const compact = height < 760; // iPhone SE / mini: tır ve açıklama gizlenir
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [manual, setManual] = useState(false);
  const [which, setWhich] = useState<string>();
  // 33 pozisyonlu araç: 25 iç yük, kalan 8 yer sırayla dolar
  const [filled, setFilled] = useState(25);
  useEffect(() => { const t = setInterval(() => setFilled((f) => (f >= 33 ? 25 : f + 1)), 900); return () => clearInterval(t); }, []);
  const cells = Array.from({ length: 33 }, (_, i) => ({ state: (i < 25 ? "int" : i < filled ? "conf" : "empty") as "int" | "conf" | "empty" }));

  const rise = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(rise, { toValue: 1, duration: 650, useNativeDriver: Platform.OS !== "web" }).start(); }, [rise]);
  const go = (e: string, p: string, key: string) => { tap(); setWhich(key); onLogin(e, p); };

  return (
    <View style={{ flex: 1, backgroundColor: c.cobalt900 }}>
      {/* sahne ışıkları */}
      <View pointerEvents="none" style={{ position: "absolute", top: -120, left: -80, width: 360, height: 360, borderRadius: 180, backgroundColor: "#2A4BD8", opacity: 0.55 }} />
      <View pointerEvents="none" style={{ position: "absolute", top: 220, right: -140, width: 320, height: 320, borderRadius: 160, backgroundColor: c.mint600, opacity: 0.16 }} />

      <View style={{ flex: 1, paddingTop: insets.top + 14, paddingHorizontal: 24, gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" }}>
            <Image source={require("../assets/logo-mark.png")} style={{ width: 28, height: 18 }} resizeMode="contain" />
          </View>
          <Text style={{ color: "#fff", fontSize: 18, fontWeight: "800", letterSpacing: 0.4 }}>CargoPact</Text>
        </View>
        <Eyebrow style={{ color: c.mint500, marginTop: 4 }}>Planlı transferlerde boş palet pazarı</Eyebrow>
        <Text style={{ fontFamily: serif, color: "#fff", fontSize: 36, lineHeight: 40, letterSpacing: -1 }}>
          İşiniz hep{"\n"}<Text style={{ color: c.mint500 }}>yolunda</Text>.
        </Text>
        {!compact && <Text style={{ color: "#B9C3EF", fontSize: 14, lineHeight: 20 }}>Boş palet yerini görün, seçin, ayırın. Araç dolarken siz izleyin.</Text>}
        <View style={{ gap: 6, marginTop: 4, display: height < 680 ? "none" : "flex" }}>
          <TruckMap dark operator legend={false} positions={33} cells={cells} />
          <Text style={{ color: "#8F9BCF", fontSize: 12 }}><Text style={{ color: "#fff", fontWeight: "800" }}>{filled}</Text>/33 planlanan · canlı doluluk</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 14, flexWrap: "wrap", display: "none" }}>
          {["Palet · kg · m³ birlikte", "T−3 rezervasyon", "Firma verisi gizli"].map((x) => (
            <Text key={x} style={{ color: "#B9C3EF", fontSize: 11 }}><Text style={{ color: c.mint500 }}>● </Text>{x}</Text>
          ))}
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Animated.View style={{
          backgroundColor: c.porcelain, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingTop: 20, paddingHorizontal: 22, paddingBottom: insets.bottom + 10,
          transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [80, 0] }) }], opacity: rise,
        }}>
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" style={{ maxHeight: manual ? 420 : undefined }} contentContainerStyle={{ gap: 12 }}>
            <View>
              <Text style={{ fontFamily: serif, fontSize: 28, color: c.cobalt900, letterSpacing: -0.5 }}>Hoş geldiniz</Text>
              <Text style={{ color: c.ink500, fontSize: 13, marginTop: 2 }}>Rolünüzü seçin, tek dokunuşla girin.</Text>
            </View>
            {DEMOS.map((d) => (
              <Pressable key={d.email} disabled={busy} onPress={() => go(d.email, DEMO_PASSWORD, d.email)} accessibilityRole="button"
                style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 18, backgroundColor: c.surface, borderWidth: 1, borderColor: pressed ? c.cobalt500 : c.line, opacity: busy && which !== d.email ? 0.5 : 1, transform: [{ scale: pressed ? 0.985 : 1 }], shadowColor: "#0E1222", shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } })}>
                <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: c.cobalt900, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: c.mint500, fontSize: 18 }}>{d.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "800", color: c.ink900 }}>{d.role}</Text>
                  <Text style={{ fontSize: 12, color: c.ink500 }}>{d.firm}</Text>
                </View>
                {busy && which === d.email ? <ActivityIndicator color={c.cobalt600} /> : <Text style={{ color: c.champagneInk, fontSize: 22 }}>›</Text>}
              </Pressable>
            ))}
            {!!error && <Text style={{ color: c.danger, fontSize: 13 }}>{error}</Text>}
            {!manual ? (
              <Pressable onPress={() => setManual(true)} style={{ minHeight: 40, justifyContent: "center", alignItems: "center" }}>
                <Text style={{ color: c.cobalt600, fontWeight: "700", fontSize: 13 }}>E-posta ve parola ile giriş</Text>
              </Pressable>
            ) : (
              <View style={{ gap: 10 }}>
                <Field label="E-posta" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="ad@firma.com" />
                <Field label="Parola" value={pw} onChangeText={setPw} secureTextEntry placeholder="••••••••" onSubmitEditing={() => { if (!busy && email && pw) go(email.trim(), pw, "form"); }} />
                <Btn title="Giriş yap" loading={busy && which === "form"} disabled={!email || !pw} onPress={() => go(email.trim(), pw, "form")} />
              </View>
            )}
            <Text style={{ color: c.ink300, fontSize: 11, textAlign: "center" }}>Demo hesapları kurgusaldır · parola {DEMO_PASSWORD}</Text>
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}
