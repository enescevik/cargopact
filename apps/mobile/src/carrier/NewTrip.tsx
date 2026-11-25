import { useEffect, useRef, useState } from "react";
import { Animated, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { api, ApiError, uuid } from "../api";
import { c, sansBold, serif } from "../theme";
import { dt, money, num, place } from "../format";
import { BackBar, ErrorBox, Row, Skeletons, useLoad, useToast } from "../ui";
import { addDays, ChipSelect, dayNum, Eyebrow, Noir, roadKm, Segmented, Stepper, today, TruckMap, weekday, type Cell } from "../premium";
import { success, tap } from "../haptics";
import type { Facility } from "../types";

type Fac = Facility & { kind?: string | null };
type Vehicle = { id: string; plate: string; vehicleTypeId?: string; status?: string; active?: boolean };
type VType = { id: string; code: string; name: string; palletPositions: number; maxPayloadKg?: number };

const TIMES = ["06:00", "08:00", "10:00", "14:00", "18:00", "20:00", "22:00"];
const STEPS = ["Rota", "Araç ve zaman", "Kapasite ve fiyat"] as const;
const round50 = (n: number) => Math.max(50, Math.round(n / 50) * 50);
const nativeDriver = Platform.OS !== "web";

/** "Aracım var, yük ekle": web sihirbazının mobil hali; üç kısa adım, altta canlı önizleme. */
export function NewTrip({ onBack, onCreated }: { onBack: () => void; onCreated: (id: string) => void }) {
  const toast = useToast();
  const fac = useLoad(() => api<{ items: Fac[] }>("GET", "/carrier/facilities"), []);
  const veh = useLoad(() => api<{ items: Vehicle[] }>("GET", "/carrier/vehicles"), []);
  const vts = useLoad(() => api<{ items: VType[] }>("GET", "/catalog/vehicle-types"), []);
  const all = fac.data?.items ?? [];
  const hasKind = all.some((y) => y.kind);
  const isHub = (x: Fac) => !x.kind || /transfer|hub|terminal/i.test(x.kind);
  const origins = all.filter((x) => (hasKind ? isHub(x) : true));
  const dests = all.filter((x) => (hasKind ? !isHub(x) : true));
  const vehicles = (veh.data?.items ?? []).filter((v) => v.active !== false && v.status !== "inactive");
  const vtype = (v?: Vehicle) => vts.data?.items.find((t) => t.id === v?.vehicleTypeId);

  const [step, setStep] = useState(0);
  const [o, setO] = useState<string | null>(null);
  const [d, setD] = useState<string | null>(null);
  const [vId, setVId] = useState<string | null>(null);
  const [day, setDay] = useState(addDays(today(), 1));
  const [tm, setTm] = useState("18:00");
  const [dur, setDur] = useState<number | null>(null);
  const [intP, setIntP] = useState(0);
  const [maxKg, setMaxKg] = useState(22000);
  const [tier, setTier] = useState<"eco" | "rec" | "pre">("rec");
  const [publish, setPublish] = useState<"yes" | "no">("yes");
  const [busy, setBusy] = useState(false);
  const [key] = useState(uuid);

  useEffect(() => { if (!o && origins[0]) setO(origins[0].id); }, [origins, o]);
  useEffect(() => { if (!vId && vehicles[0] && vts.data) setVId((vehicles.find((v) => vtype(v)?.palletPositions === 33) ?? vehicles[0]).id); }, [vehicles, vId, vts.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const O = all.find((x) => x.id === o), D = all.find((x) => x.id === d);
  const V = vehicles.find((v) => v.id === vId), VT = vtype(V);
  const positions = VT?.palletPositions ?? 33;
  useEffect(() => { setIntP(Math.max(0, positions - Math.max(2, Math.round(positions / 4)))); setMaxKg(VT?.maxPayloadKg ?? 22000); }, [positions, VT?.maxPayloadKg]);
  useEffect(() => { setDur(null); }, [o, d]);

  const km = O && D ? roadKm(O, D) : null;
  const suggestedDur = km ? Math.max(2, Math.round(km / 70 + 1)) : 5;
  const suggested = km ? round50(350 + km * 2.4) : 1000;
  const prices = { eco: round50(suggested * 0.85), rec: suggested, pre: round50(suggested * 1.2) };
  const base = prices[tier];
  const duration = dur ?? suggestedDur;
  const sP = positions - intP;
  const intKg = Math.round((intP * 680) / 10) * 10;
  const sKg = Math.max(0, Math.round((maxKg - intKg) / 100) * 100);
  const sM3 = Math.round(sP * 1.5 * 10) / 10;
  const depIso = new Date(`${day}T${tm}:00+03:00`).toISOString();
  const etaIso = new Date(Date.parse(depIso) + duration * 3600e3).toISOString();
  const ok = !!(o && d && vId && o !== d && sP > 0);
  const cells: Cell[] = Array.from({ length: intP }, () => ({ state: "int" as const }));

  const fade = useRef(new Animated.Value(1)).current;
  const go = (n: number) => { tap(); fade.setValue(0); setStep(n); Animated.timing(fade, { toValue: 1, duration: 240, useNativeDriver: nativeDriver }).start(); };

  async function submit() {
    setBusy(true);
    try {
      const t = await api<{ id: string }>("POST", "/carrier/trips", {
        originFacilityId: o, destinationFacilityId: d, vehicleId: vId, departureAt: depIso, arrivalEta: etaIso,
        internalPallets: intP, internalKg: intKg, maxGrossKg: maxKg, sellablePallets: sP, sellableKg: sKg, sellableM3: sM3,
        basePriceMinor: base * 100, publish: publish === "yes",
      }, key);
      success(); toast(publish === "yes" ? "Sefer yayında" : "Sefer taslak olarak kaydedildi");
      onCreated(t.id);
    } catch (e) { toast((e as ApiError).message, "err"); } finally { setBusy(false); }
  }

  const loading = fac.loading || veh.loading || vts.loading;
  const err = fac.error ?? veh.error ?? vts.error;
  const canNext = step === 0 ? !!(o && d && o !== d) : step === 1 ? !!vId : ok;

  return (
    <View style={{ flex: 1 }}>
      <BackBar title="Seferler" onBack={onBack} />
      <View style={{ flexDirection: "row", gap: 6, paddingHorizontal: 16, paddingBottom: 8 }}>
        {STEPS.map((l, i) => (
          <Pressable key={l} disabled={i > step} onPress={() => go(i)} style={{ flex: 1, gap: 5 }}>
            <View style={{ height: 4, borderRadius: 2, backgroundColor: i < step ? c.mint500 : i === step ? c.cobalt900 : c.line }} />
            <Text style={{ fontSize: 11, fontFamily: sansBold, color: i === step ? c.cobalt900 : i < step ? c.mint600 : c.ink300 }} numberOfLines={1}>{i < step ? "✓ " : `${i + 1}. `}{l}</Text>
          </Pressable>
        ))}
      </View>
      {loading ? <View style={{ padding: 16 }}><Skeletons n={3} h={100} /></View> : err ? <View style={{ padding: 16 }}><ErrorBox message={err} /></View> : (
        <Animated.View style={{ flex: 1, opacity: fade }}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12, gap: 12 }} showsVerticalScrollIndicator={false}>
            {step === 0 && (
              <>
                <Head eyebrow="Kapasite yayınla" title="Aracım var, yük ekle" />
                <Lbl>Çıkış transfer merkezi</Lbl>
                <ChipSelect value={o} onChange={(v) => { tap(); setO(v); if (d === v) setD(null); }} options={origins.map((f) => ({ value: f.id, label: place(f), sub: f.city }))} />
                <Lbl>Varış</Lbl>
                <ChipSelect value={d} onChange={(v) => { tap(); setD(v); }} options={dests.filter((f) => f.id !== o).map((f) => ({ value: f.id, label: place(f), sub: f.city }))} />
                {km != null && <Text style={{ fontSize: 12, color: c.ink500 }}>≈ {Math.round(km)} km · önerilen yol süresi {suggestedDur} sa · önerilen taban {money(suggested * 100)}/palet</Text>}
              </>
            )}
            {step === 1 && (
              <>
                <Head eyebrow="Araç ve zaman" title="Hangi araç, ne zaman?" />
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                  {vehicles.slice(0, 4).map((v) => {
                    const t = vtype(v), on = v.id === vId;
                    return (
                      <Pressable key={v.id} onPress={() => { tap(); setVId(v.id); }} style={{ width: "48.4%", padding: 12, borderRadius: 16, gap: 2, backgroundColor: on ? c.cobalt900 : c.surface, borderWidth: 1, borderColor: on ? c.cobalt900 : c.line }}>
                        <Text style={{ fontFamily: sansBold, color: on ? "#fff" : c.ink900 }}>{v.plate}</Text>
                        <Text style={{ fontSize: 11, color: on ? "#B9C3EF" : c.ink500 }} numberOfLines={1}>{t?.name ?? "Araç"} · {t?.palletPositions ?? "?"} palet</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Lbl>Kalkış günü</Lbl>
                <ChipSelect small value={day} onChange={(v) => { tap(); setDay(v); }} options={Array.from({ length: 5 }, (_, i) => addDays(today(), i)).map((x, i) => ({ value: x, label: i === 0 ? "Bugün" : i === 1 ? "Yarın" : `${weekday(x)} ${dayNum(x)}` }))} />
                <Lbl>Saat</Lbl>
                <ChipSelect small value={tm} onChange={(v) => { tap(); setTm(v); }} options={TIMES.map((x) => ({ value: x, label: x }))} />
                <Row style={{ justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 12, color: c.ink500 }}>Yol süresi (önerilen {suggestedDur} sa)</Text>
                  <Stepper value={duration} onChange={setDur} min={1} max={48} unit=" sa" />
                </Row>
              </>
            )}
            {step === 2 && (
              <>
                <Head eyebrow="Kapasite ve fiyat" title="Kaç yer satışa açılsın?" />
                <View style={{ padding: 12, borderRadius: 18, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, gap: 10 }}>
                  <TruckMap operator positions={positions} cells={cells} />
                  <Row style={{ justifyContent: "space-between" }}>
                    <Text style={{ fontSize: 12, color: c.ink500 }}>İç yük (palet)</Text>
                    <Stepper value={intP} onChange={(v) => { tap(); setIntP(v); }} min={0} max={positions - 1} />
                  </Row>
                  <Text style={{ fontSize: 11, color: c.ink500 }}>Satışa açık: <Text style={{ fontWeight: "800", color: c.mint600 }}>{sP} palet</Text> · {num(sKg)} kg · {sM3.toLocaleString("tr-TR")} m³</Text>
                </View>
                <Lbl>Taban fiyat (palet başı)</Lbl>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {([["eco", "Ekonomik"], ["rec", "Önerilen"], ["pre", "Premium"]] as const).map(([k, l]) => {
                    const on = tier === k;
                    return (
                      <Pressable key={k} onPress={() => { tap(); setTier(k); }} style={{ flex: 1, padding: 10, borderRadius: 14, alignItems: "center", backgroundColor: on ? c.cobalt900 : c.surface, borderWidth: 1, borderColor: on ? c.cobalt900 : c.line }}>
                        <Text style={{ fontSize: 11, color: on ? c.champagne : c.ink500, fontWeight: "700" }}>{l}</Text>
                        <Text style={{ fontFamily: sansBold, fontSize: 15, color: on ? "#fff" : c.ink900 }}>{money(prices[k] * 100)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Segmented value={publish} onChange={setPublish} options={[{ value: "yes", label: "Hemen yayınla" }, { value: "no", label: "Taslak kaydet" }]} />
              </>
            )}
          </ScrollView>
        </Animated.View>
      )}
      <View style={{ paddingHorizontal: 12, paddingBottom: 10, paddingTop: 4 }}>
        <Noir style={{ padding: 12, borderRadius: 20, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={{ color: c.champagne, fontSize: 10, fontWeight: "800", letterSpacing: 1 }} numberOfLines={1}>{O ? place(O).toLocaleUpperCase("tr-TR") : "ÇIKIŞ"} → {D ? place(D).toLocaleUpperCase("tr-TR") : "VARIŞ"}</Text>
            <Text style={{ color: "#fff", fontFamily: sansBold, fontSize: 18 }} numberOfLines={1}>{sP} palet satışta</Text>
            <Text style={{ color: "#B9C3EF", fontSize: 11 }} numberOfLines={1}>{V?.plate ?? "araç"} · {dt(depIso)} · {money(base * 100)}/palet</Text>
          </View>
          <Pressable disabled={!canNext || busy} onPress={() => (step < 2 ? go(step + 1) : submit())}
            style={({ pressed }) => ({ minHeight: 50, paddingHorizontal: 18, borderRadius: 15, backgroundColor: c.mint500, alignItems: "center", justifyContent: "center", opacity: !canNext || busy ? 0.4 : pressed ? 0.85 : 1 })}>
            <Text style={{ color: c.cobalt900, fontFamily: sansBold, fontSize: 15 }}>{busy ? "Kaydediliyor…" : step < 2 ? "Devam →" : publish === "yes" ? "Yayınla" : "Kaydet"}</Text>
          </Pressable>
        </Noir>
      </View>
    </View>
  );
}

function Head({ eyebrow, title }: { eyebrow: string; title: string }) {
  return <View style={{ gap: 2 }}><Eyebrow>{eyebrow}</Eyebrow><Text style={{ fontFamily: serif, fontSize: 24, color: c.cobalt900, letterSpacing: -0.5 }}>{title}</Text></View>;
}
const Lbl = ({ children }: { children: string }) => <Text style={{ fontSize: 11, fontWeight: "700", color: c.ink500 }}>{children}</Text>;
