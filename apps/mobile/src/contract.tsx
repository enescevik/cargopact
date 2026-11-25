import { useEffect, useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, ApiError } from "./api";
import { c, mono, serif } from "./theme";
import { dt, num } from "./format";
import { Btn, Card, ErrorBox, Field, KV, Label, Sheet, Skeletons, useKeyboardHeight, useScrollToFocused } from "./ui";
import type { Carbon, ContractPreview, ContractView, TripCarbon } from "./types";

/* ---------- Minik markdown çizicisi ---------- */
function Inline({ text, style }: { text: string; style?: object }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return (
    <Text style={style}>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") && p.length > 4 ? <Text key={i} style={{ fontWeight: "800" }}>{p.slice(2, -2)}</Text>
          : p.startsWith("`") && p.endsWith("`") && p.length > 2 ? <Text key={i} style={{ fontFamily: mono, backgroundColor: c.cobalt50 }}>{p.slice(1, -1)}</Text>
            : <Text key={i}>{p}</Text>)}
    </Text>
  );
}
const cells = (l: string) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((x) => x.trim());
export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r/g, "").split("\n");
  const out: ReactNode[] = [];
  let i = 0, k = 0;
  const base = { fontSize: 14, lineHeight: 21, color: c.ink700 };
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    if (l.trim().startsWith("```")) {
      const buf: string[] = []; i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) buf.push(lines[i++]);
      i++;
      out.push(<View key={k++} style={{ backgroundColor: c.cobalt50, padding: 10, borderRadius: 8 }}><Text style={{ fontFamily: mono, fontSize: 12, color: c.ink900 }}>{buf.join("\n")}</Text></View>);
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(l);
    if (h) {
      const n = h[1].length;
      out.push(<Inline key={k++} text={h[2]} style={{ fontFamily: n <= 2 ? serif : undefined, fontSize: n === 1 ? 22 : n === 2 ? 18 : 15, fontWeight: "800", color: c.ink900, marginTop: n <= 2 ? 6 : 2 }} />);
      i++; continue;
    }
    if (/^\s*([-*_])\1{2,}\s*$/.test(l)) { out.push(<View key={k++} style={{ height: 1, backgroundColor: c.line }} />); i++; continue; }
    if (l.trim().startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        if (!/^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i]) || !lines[i].includes("-") ) rows.push(cells(lines[i]));
        i++;
      }
      const head = rows[0] ?? [];
      out.push(
        <View key={k++} style={{ borderWidth: 1, borderColor: c.line, borderRadius: 8, overflow: "hidden" }}>
          {rows.map((r, ri) => (
            <View key={ri} style={{ flexDirection: "row", backgroundColor: ri === 0 ? c.cobalt50 : c.surface, borderTopWidth: ri ? 1 : 0, borderTopColor: c.line }}>
              {head.map((_, ci) => (
                <View key={ci} style={{ flex: 1, padding: 8 }}><Inline text={r[ci] ?? ""} style={{ fontSize: 13, color: c.ink900, fontWeight: ri === 0 ? "800" : "400" }} /></View>
              ))}
            </View>
          ))}
        </View>,
      );
      continue;
    }
    if (/^\s*([-*]|\d+[.)])\s+/.test(l)) {
      const items: { n: string; t: string }[] = [];
      while (i < lines.length && /^\s*([-*]|\d+[.)])\s+/.test(lines[i])) {
        const m = /^\s*([-*]|\d+[.)])\s+(.*)$/.exec(lines[i])!;
        items.push({ n: /\d/.test(m[1]) ? m[1] : "•", t: m[2] }); i++;
      }
      out.push(<View key={k++} style={{ gap: 4 }}>{items.map((it, j) => (
        <View key={j} style={{ flexDirection: "row", gap: 8 }}><Text style={{ ...base, width: 22 }}>{it.n}</Text><Inline text={it.t} style={{ ...base, flex: 1 }} /></View>
      ))}</View>);
      continue;
    }
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*\||\s*([-*]|\d+[.)])\s|```)/.test(lines[i])) buf.push(lines[i++]);
    if (!buf.length) { buf.push(lines[i++]); }
    out.push(<Inline key={k++} text={buf.join(" ")} style={base} />);
  }
  return <View style={{ gap: 10 }}>{out}</View>;
}

/* ---------- Tam ekran kaplama ---------- */
export function FullSheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const kb = useKeyboardHeight(); // Modal uygulama kökünün dışında: klavye payını burada ayrıca bırak
  const scroll = useScrollToFocused();
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: c.porcelain, paddingTop: insets.top, paddingBottom: kb || insets.bottom }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: c.line, backgroundColor: c.surface }}>
          <Text style={{ fontWeight: "800", fontSize: 16, color: c.ink900, flex: 1 }} numberOfLines={1}>{title}</Text>
          <Pressable accessibilityRole="button" onPress={onClose} hitSlop={10}><Text style={{ fontSize: 15, fontWeight: "700", color: c.cobalt700 }}>Kapat ✕</Text></Pressable>
        </View>
        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: 18, gap: 14 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">{children}</ScrollView>
        {footer && <View style={{ backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.line, padding: 14, paddingHorizontal: 20, gap: 10 }}>{footer}</View>}
      </View>
    </Modal>
  );
}
export function DraftRibbon() {
  return (
    <View style={{ alignSelf: "flex-start", backgroundColor: "#FFF4D6", borderColor: c.warning, borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text style={{ color: "#765400", fontWeight: "800", fontSize: 12, letterSpacing: 1 }}>TASLAK · DRAFT</Text>
    </View>
  );
}
const short = (h?: string) => (h ? h.slice(0, 12) : "—");

/* ---------- Sözleşme görüntüleyici (müşteri/taşıyıcı) ---------- */
export function ContractViewer({ path, onClose }: { path: string; onClose: () => void }) {
  const [v, setV] = useState<ContractView>();
  const [err, setErr] = useState<string>();
  const load = () => { setErr(undefined); api<ContractView>("GET", path).then(setV).catch((e) => setErr((e as Error).message)); };
  useEffect(load, [path]);
  return (
    <FullSheet title="Taşıma sözleşmesi" onClose={onClose}>
      <DraftRibbon />
      {err ? <ErrorBox message={err} onRetry={load} /> : !v ? <Skeletons n={3} h={80} /> : (
        <>
          <Card style={{ gap: 6 }}>
            <KV k="İmzalayan" v={v.acceptance.signerName} />
            <KV k="Kabul zamanı" v={dt(v.acceptance.acceptedAt)} />
            <KV k="Sürüm" v={v.acceptance.version} />
            <KV k="Özet (hash)" v={short(v.acceptance.renderedHash)} />
          </Card>
          <Card><Markdown source={v.renderedMarkdown} /></Card>
        </>
      )}
    </FullSheet>
  );
}

/* ---------- Sözleşme + e-imza adımı ---------- */
export type ContractAcceptBody = { version: string; renderedHash: string; signerName: string; accepted: true };
export function ContractSheet({ previewPath, previewBody, onClose, onAccept }: {
  previewPath: string; previewBody: unknown; onClose: () => void;
  /** Rezervasyon oluşturur; ApiError(409 CONTRACT_STALE) fırlatırsa sözleşme yeniden önizlenir. */
  onAccept: (contract: ContractAcceptBody) => Promise<void>;
}) {
  const [p, setP] = useState<ContractPreview>();
  const [err, setErr] = useState<string>();
  const [name, setName] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [signErr, setSignErr] = useState<string>();
  const preview = async () => {
    setErr(undefined); setP(undefined);
    try { setP(await api<ContractPreview>("POST", previewPath, previewBody)); }
    catch (e) { setErr((e as Error).message); }
  };
  useEffect(() => {
    void preview();
    api<{ displayName?: string; email: string }>("GET", "/me").then((m) => setName((n) => n || m.displayName || m.email)).catch(() => undefined);
  }, []);
  const canSign = !!p && ok && name.trim().length >= 3 && !busy;
  const sign = async () => {
    if (!p) return;
    setBusy(true); setSignErr(undefined);
    try {
      await onAccept({ version: p.version, renderedHash: p.renderedHash, signerName: name.trim(), accepted: true });
    } catch (e) {
      const er = e as ApiError;
      if (er.status === 409 && (er.code === "CONTRACT_STALE" || er.reason === "CONTRACT_STALE" || /CONTRACT_STALE/.test(er.message))) {
        setStale(true); setOk(false); await preview();
      } else setSignErr(er.reason === "PAYMENT_DECLINED" ? "Kart reddedildi. Başka bir kart deneyin." : er.message);
    } finally { setBusy(false); }
  };
  return (
    <FullSheet title="Taşıma sözleşmesi" onClose={onClose} footer={
      <>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: ok }} onPress={() => p && setOk(!ok)} style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <View style={{ width: 26, height: 26, borderRadius: 6, borderWidth: 2, borderColor: ok ? c.cobalt600 : c.ink300, backgroundColor: ok ? c.cobalt600 : c.surface, alignItems: "center", justifyContent: "center" }}>
            {ok && <Text style={{ color: "#fff", fontWeight: "800" }}>✓</Text>}
          </View>
          <Text style={{ flex: 1, color: c.ink900, fontWeight: "600" }}>Okudum, onaylıyorum</Text>
        </Pressable>
        <Btn kind="mint" title="İmzala ve teklifi kabul et" loading={busy} disabled={!canSign} onPress={sign} />
      </>
    }>
      <DraftRibbon />
      {stale && <Text style={{ color: c.warning, fontWeight: "700" }}>Fiyat veya koşullar değişti; sözleşme yenilendi. Lütfen yeniden okuyup onaylayın.</Text>}
      {signErr && <Text style={{ color: c.danger, fontWeight: "700" }}>{signErr}</Text>}
      {err ? <ErrorBox message={err} onRetry={preview} /> : !p ? <Skeletons n={3} h={90} /> : (
        <>
          <Text style={{ fontFamily: serif, fontSize: 22, color: c.ink900 }}>{p.title}</Text>
          <Text style={{ color: c.ink500, fontSize: 12 }}>Sürüm {p.version} · özet {short(p.renderedHash)}</Text>
          <Card><Markdown source={p.renderedMarkdown} /></Card>
        </>
      )}
      <Card style={{ gap: 8 }}>
        <Label>E-imza</Label>
        <Field label="Ad Soyad (imzalayan)" value={name} onChangeText={setName} placeholder="Ad Soyad" />
        <Text style={{ color: c.ink500, fontSize: 12 }}>Adınızı yazarak sözleşmeyi elektronik olarak imzalarsınız. Bu metin taslaktır.</Text>
      </Card>
    </FullSheet>
  );
}

/* ---------- Karbon ---------- */
const kg = (n: number) => num(Math.round(n * 10) / 10);
export function CarbonInfoSheet({ carbon, onClose }: { carbon: Carbon; onClose: () => void }) {
  return (
    <Sheet onClose={onClose}>
      <Text style={{ fontFamily: serif, fontSize: 24, color: c.ink900 }}>Emisyon nasıl hesaplandı?</Text>
      <Card style={{ gap: 6 }}>
        <KV k="Mesafe" v={`${kg(carbon.distanceKm)} km`} />
        <KV k="Araç sınıfı" v={carbon.vehicleClass} />
        <KV k="Araç katsayısı" v={`${carbon.vehicleFactorKgPerKm} kg CO₂e/km`} />
        <KV k="Payınıza düşen" v={`≈ ${kg(carbon.allocatedKg)} kg CO₂e`} bold />
        {carbon.alternativeKg != null && <KV k="Alternatif senaryo" v={`≈ ${kg(carbon.alternativeKg)} kg CO₂e`} />}
      </Card>
      <Text style={{ color: c.ink700 }}>Yöntem: {carbon.method}</Text>
      <Text style={{ color: c.ink500, fontSize: 13 }}>{carbon.note}</Text>
      <Text style={{ color: c.warning, fontWeight: "700", fontSize: 13 }}>demo katsayıları · tahmini</Text>
      <Btn kind="outline" title="Kapat" onPress={onClose} />
    </Sheet>
  );
}
export function CarbonCard({ carbon }: { carbon?: Carbon | null }) {
  const [info, setInfo] = useState(false);
  if (!carbon) return null;
  return (
    <>
      <Card onPress={() => setInfo(true)} style={{ backgroundColor: c.mint100, borderColor: c.mint200, gap: 6 }}>
        <Label>Karbon</Label>
        <Text style={{ color: c.ink900, fontWeight: "700", fontSize: 15 }}>Bu yükün payına düşen emisyon ≈ {kg(carbon.allocatedKg)} kg CO₂e</Text>
        {carbon.savedKg != null && <Text style={{ color: c.mint600, fontWeight: "800", fontSize: 15 }}>Alternatifinize göre ≈ {kg(carbon.savedKg)} kg daha az</Text>}
        <Text style={{ color: c.ink500, fontSize: 12 }}>demo katsayıları · tahmini · ⓘ yöntem için dokunun</Text>
      </Card>
      {info && <CarbonInfoSheet carbon={carbon} onClose={() => setInfo(false)} />}
    </>
  );
}
export function TripCarbonLine({ carbon }: { carbon?: TripCarbon | null }) {
  if (!carbon) return null;
  return (
    <Card style={{ backgroundColor: c.mint100, borderColor: c.mint200, gap: 4 }}>
      <Label>Karbon (onaylı dış yükler)</Label>
      <Text style={{ color: c.ink900, fontWeight: "700" }}>{carbon.externalPallets} palet · ≈ {kg(carbon.allocatedExternalKg)} kg CO₂e · beyan edilen tasarruf ≈ {kg(carbon.declaredSavedKg)} kg</Text>
      <Text style={{ color: c.ink500, fontSize: 12 }}>{carbon.reservationsWithScenario}/{carbon.reservationsTotal} rezervasyonda alternatif beyan edildi · demo katsayıları · tahmini</Text>
    </Card>
  );
}
