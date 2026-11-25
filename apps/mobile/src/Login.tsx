import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { c, serif } from "./theme";
import { Btn, Field, Screen } from "./ui";

export function Login({ onLogin, busy, error }: { onLogin: (email: string, pw: string) => void; busy: boolean; error?: string }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  return (
    <View style={{ flex: 1, backgroundColor: c.porcelain }}>
      <View style={{ backgroundColor: c.cobalt900, paddingTop: 56, paddingBottom: 36, paddingHorizontal: 24, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: c.mint500, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: c.cobalt900, fontWeight: "900", fontSize: 18 }}>C</Text>
          </View>
          <Text style={{ color: "#fff", fontSize: 18, fontWeight: "700", letterSpacing: 0.5 }}>CargoPact</Text>
        </View>
        <Text style={{ fontFamily: serif, color: "#fff", fontSize: 34, lineHeight: 40, marginTop: 14 }}>Boş palet yeri,{"\n"}doğru yüke.</Text>
        <Text style={{ color: "#B8C4F5", fontSize: 14 }}>Planlı depo-depo transferlerinde kapasite alın, verin, takip edin.</Text>
      </View>
      <Screen>
        <Text style={{ fontSize: 20, fontWeight: "800", color: c.ink900 }}>Giriş yap</Text>
        <Field label="E-posta" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="ad@firma.com" />
        <Field label="Parola" value={pw} onChangeText={setPw} secureTextEntry placeholder="••••••••" onSubmitEditing={() => onLogin(email.trim(), pw)} />
        {!!error && <Text style={{ color: c.danger, fontSize: 14 }}>{error}</Text>}
        <Btn title="Giriş yap" loading={busy} disabled={!email || !pw} onPress={() => onLogin(email.trim(), pw)} />
        <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 1.1, color: c.champagneInk, marginTop: 6 }}>TEK DOKUNUŞLA DEMO</Text>
        {[
          { t: "Müşteri olarak gir", s: "Anadolu Parsiyel · palet gönder, takip et", e: "mobil.musteri@cargopact.example.test", i: "➤" },
          { t: "Transfer merkezi olarak gir", s: "Dinçer · talepleri onayla, depo işlemleri", e: "mobil.yonetici@cargopact.example.test", i: "▦" },
        ].map((x) => (
          <Pressable key={x.e} disabled={busy} onPress={() => { setEmail(x.e); setPw("Cargopact2026!"); onLogin(x.e, "Cargopact2026!"); }}
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, opacity: busy ? 0.5 : pressed ? 0.8 : 1 })}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.cobalt900, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: c.mint500, fontSize: 18 }}>{x.i}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "800", color: c.ink900 }}>{x.t}</Text>
              <Text style={{ fontSize: 12, color: c.ink500 }}>{x.s}</Text>
            </View>
            <Text style={{ color: c.champagneInk, fontSize: 20 }}>›</Text>
          </Pressable>
        ))}
        <Text style={{ color: c.ink500, fontSize: 12 }}>Parola: Cargopact2026!</Text>
      </Screen>
    </View>
  );
}
