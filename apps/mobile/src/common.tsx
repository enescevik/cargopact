import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { api } from "./api";
import { c, serif } from "./theme";
import { dt, hm, money, place } from "./format";
import { Card, Chip, Row } from "./ui";
import type { Facility, TripCard } from "./types";

export function RouteHead({ trip, size = 26 }: { trip: TripCard; size?: number }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ fontFamily: serif, fontSize: size, color: c.ink900, letterSpacing: -0.4 }}>
        {place(trip.origin)} → {place(trip.destination)}
      </Text>
      <Text style={{ fontSize: 12, color: c.ink500 }}>{trip.origin.name}  ›  {trip.destination.name}</Text>
    </View>
  );
}

export function CutoffChips({ trip }: { trip: TripCard }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      <Chip tone="cobalt" label={`Son rezervasyon (T−3) ${hm(trip.bookingCutoffAt)}`} />
      <Chip tone="mint" label={`Çıkış deposu son kabul (T−1) ${hm(trip.intakeCutoffAt)}`} />
    </View>
  );
}

export function WarehouseGuide({ title, facility, intakeCutoffAt }: { title: string; facility: Facility; intakeCutoffAt?: string }) {
  const destination = facility.latitude != null && facility.longitude != null ? `${facility.latitude},${facility.longitude}` : facility.address;
  const mapUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
  return (
    <Card style={{ gap: 10 }}>
      <Text style={{ fontFamily: serif, fontSize: 21, color: c.ink900 }}>{title}</Text>
      <Text style={{ fontWeight: "700", color: c.ink900 }}>{facility.name}</Text>
      <Text style={{ color: c.ink500, lineHeight: 19 }}>{facility.address} · {facility.district ? `${facility.district}, ` : ""}{facility.city}</Text>
      {intakeCutoffAt && <Text style={{ color: c.pending, fontWeight: "600" }}>Son depo kabulü: {dt(intakeCutoffAt)}</Text>}
      {facility.contactPhone && <Pressable onPress={() => Linking.openURL(`tel:${facility.contactPhone}`)}><Text style={{ color: c.cobalt700, fontWeight: "600" }}>{facility.contactPhone}</Text></Pressable>}
      <Pressable onPress={() => Linking.openURL(mapUrl)} style={{ minHeight: 44, borderRadius: 12, backgroundColor: c.cobalt600, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: "#fff", fontWeight: "700" }}>Yol tarifi al</Text>
      </Pressable>
    </Card>
  );
}

export function TripSummary({ trip, onPress, showPrice = true }: { trip: TripCard; onPress?: () => void; showPrice?: boolean }) {
  return (
    <Card onPress={onPress} style={{ gap: 12 }}>
      <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}><RouteHead trip={trip} /></View>
        {showPrice && (
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: c.cobalt700 }}>{money(trip.price.unitPriceMinor)}</Text>
            <Text style={{ fontSize: 11, color: c.ink500 }}>palet başı</Text>
          </View>
        )}
      </Row>
      <Row style={{ justifyContent: "space-between" }}>
        <View>
          <Text style={{ fontSize: 12, color: c.ink500 }}>Kalkış</Text>
          <Text style={{ fontSize: 14, fontWeight: "700", color: c.ink900 }}>{dt(trip.departureAt)}</Text>
        </View>
        <View>
          <Text style={{ fontSize: 12, color: c.ink500 }}>Tahmini varış</Text>
          <Text style={{ fontSize: 14, fontWeight: "700", color: c.ink900 }}>{dt(trip.arrivalEta)}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontSize: 12, color: c.ink500 }}>Boş yer</Text>
          <Text style={{ fontSize: 14, fontWeight: "700", color: c.mint600 }}>{trip.remaining.pallets} palet</Text>
        </View>
      </Row>
      <CutoffChips trip={trip} />
      <Text style={{ fontSize: 12, color: c.ink500 }}>{trip.carrier.name} · {trip.vehicleType.name}</Text>
    </Card>
  );
}

/* ---------- Chat (shared) ---------- */
interface Msg { role: "user" | "agent"; text: string }

export function Chat({ suggestions }: { suggestions: string[] }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const sid = useRef<string | undefined>(undefined);
  const scroll = useRef<ScrollView>(null);

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text }]);
    setBusy(true);
    try {
      const r = await api<{ reply: string; sessionId: string }>("POST", "/chat", { message: text, sessionId: sid.current });
      sid.current = r.sessionId ?? sid.current;
      setMsgs((m) => [...m, { role: "agent", text: r.reply }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "agent", text: `Üzgünüm, yanıt alınamadı: ${(e as Error).message}` }]);
    } finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 10 }}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })} keyboardShouldPersistTaps="handled">
        {msgs.length === 0 && (
          <View style={{ gap: 12 }}>
            <Text style={{ fontFamily: serif, fontSize: 28, color: c.ink900 }}>Merhaba, ben CargoPact asistanı.</Text>
            <Text style={{ color: c.ink500, fontSize: 14 }}>Sefer arayabilir, fiyat ve kapasite sorabilirsiniz. Bir öneriyle başlayın:</Text>
            {suggestions.map((sg) => (
              <Pressable key={sg} onPress={() => send(sg)} style={{ minHeight: 44, padding: 14, borderRadius: 14, backgroundColor: c.cobalt50, borderWidth: 1, borderColor: c.cobalt100 }}>
                <Text style={{ color: c.cobalt800, fontWeight: "600" }}>{sg}</Text>
              </Pressable>
            ))}
          </View>
        )}
        {msgs.map((m, i) => (
          <View key={i} style={{
            alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "88%", padding: 12, borderRadius: 18,
            borderBottomRightRadius: m.role === "user" ? 4 : 18, borderBottomLeftRadius: m.role === "user" ? 18 : 4,
            backgroundColor: m.role === "user" ? c.cobalt600 : c.surface, borderWidth: m.role === "user" ? 0 : 1, borderColor: c.line,
          }}>
            <Text style={{ color: m.role === "user" ? "#fff" : c.ink900, fontSize: 15, lineHeight: 21 }}>{m.text}</Text>
          </View>
        ))}
        {busy && <Typing />}
      </ScrollView>
      <View style={{ flexDirection: "row", gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.surface }}>
        <TextInput value={input} onChangeText={setInput} placeholder="Mesajınızı yazın…" placeholderTextColor={c.ink300}
          onSubmitEditing={() => send(input)} returnKeyType="send"
          style={[{ flex: 1, minHeight: 48, borderRadius: 24, backgroundColor: c.porcelain, paddingHorizontal: 18, fontSize: 16, color: c.ink900 }, Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null]} />
        <Pressable onPress={() => send(input)} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.cobalt600, alignItems: "center", justifyContent: "center", opacity: busy ? 0.5 : 1 }}>
          <Text style={{ color: "#fff", fontSize: 20, fontWeight: "700" }}>↑</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Typing() {
  const [n, setN] = useState(0);
  useEffect(() => { const h = setInterval(() => setN((x) => (x + 1) % 4), 350); return () => clearInterval(h); }, []);
  return (
    <View style={{ alignSelf: "flex-start", padding: 12, paddingHorizontal: 16, borderRadius: 18, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}>
      <Text style={{ color: c.ink500, fontSize: 18, letterSpacing: 2 }}>{"●".repeat(n || 1)}<Text style={{ color: c.line }}>{"●".repeat(3 - (n || 1))}</Text></Text>
    </View>
  );
}
