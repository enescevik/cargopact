import { useState } from "react";
import { Text, View } from "react-native";
import { c, serif } from "./theme";
import { Btn, Chip, Field, Screen } from "./ui";

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
        <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 1, color: c.ink500, marginTop: 6 }}>DEMO HESAPLARI</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Chip label="Müşteri (Anadolu Parsiyel)" onPress={() => { setEmail("mobil.musteri@cargopact.example.test"); setPw("Cargopact2026!"); }} />
          <Chip label="Transfer merkezi (Dinçer)" onPress={() => { setEmail("mobil.yonetici@cargopact.example.test"); setPw("Cargopact2026!"); }} />
        </View>
        <Text style={{ color: c.ink500, fontSize: 12 }}>Parola: Cargopact2026!</Text>
      </Screen>
    </View>
  );
}
