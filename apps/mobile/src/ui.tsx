import { createContext, ReactNode, useContext, useEffect, useRef, useState, useCallback } from "react";
import { ActivityIndicator, Animated, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from "react-native";
import { c, serif, shadow } from "./theme";
import { statusTone } from "./format";

/* ---------- Toast ---------- */
type ToastKind = "ok" | "err";
const ToastCtx = createContext<(msg: string, kind?: ToastKind) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<{ msg: string; kind: ToastKind; n: number } | null>(null);
  const show = useCallback((msg: string, kind: ToastKind = "ok") => setT({ msg, kind, n: Date.now() }), []);
  useEffect(() => {
    if (!t) return;
    const h = setTimeout(() => setT(null), 3800);
    return () => clearTimeout(h);
  }, [t]);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {t && (
        <View pointerEvents="none" style={s.toastWrap}>
          <View style={[s.toast, { backgroundColor: t.kind === "ok" ? c.mint600 : c.danger }]}>
            <Text style={s.toastTxt}>{t.kind === "ok" ? "✓  " : "!  "}{t.msg}</Text>
          </View>
        </View>
      )}
    </ToastCtx.Provider>
  );
}

/* ---------- Primitives ---------- */
export function Screen({ children, pad = true, refreshKey }: { children: ReactNode; pad?: boolean; refreshKey?: unknown }) {
  const ref = useRef<ScrollView>(null);
  useEffect(() => { ref.current?.scrollTo({ y: 0, animated: false }); }, [refreshKey]);
  return (
    <ScrollView ref={ref} style={{ flex: 1 }} contentContainerStyle={{ padding: pad ? 20 : 0, paddingBottom: 32, gap: 14 }} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function Title({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ fontFamily: serif, fontSize: 30, color: c.cobalt900, letterSpacing: -0.5 }}>{children}</Text>
      {!!sub && <Text style={{ fontSize: 14, color: c.ink500 }}>{sub}</Text>}
    </View>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: ViewStyle; onPress?: () => void }) {
  const base = [s.card, style];
  if (onPress) return <Pressable onPress={onPress} style={({ pressed }) => [...base, pressed && { opacity: 0.85 }]}>{children}</Pressable>;
  return <View style={base}>{children}</View>;
}

export function Divider() { return <View style={{ height: 1, backgroundColor: c.line }} />; }

export function Label({ children }: { children: ReactNode }) {
  return <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 1, color: c.ink500, textTransform: "uppercase" }}>{children}</Text>;
}

export function Btn({ title, onPress, kind = "primary", loading, disabled, small, style }: {
  title: string; onPress: () => void; kind?: "primary" | "mint" | "ghost" | "danger" | "outline"; loading?: boolean; disabled?: boolean; small?: boolean; style?: ViewStyle;
}) {
  const bg = kind === "primary" ? c.cobalt600 : kind === "mint" ? c.mint600 : kind === "danger" ? c.danger : "transparent";
  const fg = kind === "ghost" ? c.cobalt600 : kind === "outline" ? c.ink700 : "#fff";
  const off = disabled || loading;
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [{
        minHeight: small ? 44 : 52, borderRadius: 14, paddingHorizontal: 18, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8,
        backgroundColor: bg, opacity: off ? 0.5 : pressed ? 0.85 : 1,
        borderWidth: kind === "outline" ? 1 : 0, borderColor: c.line,
      }, style]}
    >
      {loading && <ActivityIndicator color={fg} size="small" />}
      <Text style={{ color: fg, fontSize: small ? 14 : 16, fontWeight: "700" }}>{title}</Text>
    </Pressable>
  );
}

const TONES = {
  success: [c.mint100, c.mint600], pending: ["#EFEAFE", c.pending], danger: ["#FBE7E5", c.danger],
  warning: ["#FBF1D9", c.warning], info: [c.cobalt100, c.cobalt600], neutral: ["#EEF0F4", c.ink500],
} as const;

export function Badge({ label, tone = "neutral" }: { label: string; tone?: keyof typeof TONES }) {
  const [bg, fg] = TONES[tone];
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: fg }} />
      <Text style={{ color: fg, fontSize: 12, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}
export function StatusBadge({ status, label }: { status: string; label: string }) {
  return <Badge label={label} tone={statusTone(status)} />;
}

export function Chip({ label, active, onPress, tone }: { label: string; active?: boolean; onPress?: () => void; tone?: "mint" | "cobalt" }) {
  const bg = active ? c.cobalt600 : tone === "mint" ? c.mint100 : tone === "cobalt" ? c.cobalt50 : c.surface;
  const fg = active ? "#fff" : tone === "mint" ? c.mint600 : tone === "cobalt" ? c.cobalt700 : c.ink700;
  const inner = (
    <View style={{ minHeight: onPress ? 44 : 30, justifyContent: "center", paddingHorizontal: 12, borderRadius: 999, backgroundColor: bg, borderWidth: 1, borderColor: active ? c.cobalt600 : c.line }}>
      <Text style={{ color: fg, fontSize: 13, fontWeight: "600" }}>{label}</Text>
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{inner}</Pressable> : inner;
}

export function Field({ label, ...p }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 6, flex: 1 }}>
      <Label>{label}</Label>
      <TextInput
        placeholderTextColor={c.ink300}
        {...p}
        style={[{ minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, paddingHorizontal: 14, fontSize: 16, color: c.ink900 }, Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null]}
      />
    </View>
  );
}

export function Row({ children, gap = 10, style }: { children: ReactNode; gap?: number; style?: ViewStyle }) {
  return <View style={[{ flexDirection: "row", gap, alignItems: "center" }, style]}>{children}</View>;
}

export function KV({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
      <Text style={{ color: c.ink500, fontSize: 14, flexShrink: 1 }}>{k}</Text>
      <Text style={{ color: c.ink900, fontSize: 14, fontWeight: bold ? "800" : "600", flexShrink: 1, textAlign: "right" }}>{v}</Text>
    </View>
  );
}

/* ---------- Skeleton / states ---------- */
export function Skeleton({ h = 90 }: { h?: number }) {
  const o = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([
      Animated.timing(o, { toValue: 1, duration: 700, useNativeDriver: Platform.OS !== "web" }),
      Animated.timing(o, { toValue: 0.4, duration: 700, useNativeDriver: Platform.OS !== "web" }),
    ]));
    a.start();
    return () => a.stop();
  }, [o]);
  return <Animated.View style={{ height: h, borderRadius: 18, backgroundColor: "#ECE8DE", opacity: o }} />;
}
export function Skeletons({ n = 3, h }: { n?: number; h?: number }) {
  return <View style={{ gap: 12 }}>{Array.from({ length: n }, (_, i) => <Skeleton key={i} h={h} />)}</View>;
}

export function Empty({ title, text }: { title: string; text?: string }) {
  return (
    <View style={{ alignItems: "center", padding: 32, gap: 6 }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: c.cobalt50, alignItems: "center", justifyContent: "center", marginBottom: 6 }}>
        <Text style={{ fontSize: 24 }}>📦</Text>
      </View>
      <Text style={{ fontSize: 16, fontWeight: "700", color: c.ink900 }}>{title}</Text>
      {!!text && <Text style={{ fontSize: 14, color: c.ink500, textAlign: "center" }}>{text}</Text>}
    </View>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card style={{ borderColor: "#F2C5C1", backgroundColor: "#FDF3F2", gap: 10 }}>
      <Text style={{ color: c.danger, fontWeight: "700" }}>Bir sorun oluştu</Text>
      <Text style={{ color: c.ink700 }}>{message}</Text>
      {onRetry && <Btn title="Tekrar dene" kind="outline" small onPress={onRetry} />}
    </Card>
  );
}

/* ---------- Data hook ---------- */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[], pollMs?: number) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const reload = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try { setData(await fnRef.current()); setError(undefined); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    let alive = true;
    void reload();
    const h = pollMs ? setInterval(() => { if (alive) void reload(true); }, pollMs) : undefined;
    return () => { alive = false; if (h) clearInterval(h); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error, loading, reload, setData };
}

/* ---------- Capacity bar ---------- */
export function Bar({ label, parts, total, text }: { label: string; parts: { v: number; color: string }[]; total: number; text: string }) {
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 12, fontWeight: "700", color: c.ink700 }}>{label}</Text>
        <Text style={{ fontSize: 12, color: c.ink500 }}>{text}</Text>
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: "#EEE9DC", flexDirection: "row", overflow: "hidden" }}>
        {parts.map((p, i) => <View key={i} style={{ width: `${Math.min(100, Math.max(0, total ? (p.v / total) * 100 : 0))}%`, backgroundColor: p.color }} />)}
      </View>
    </View>
  );
}

/* ---------- Timeline ---------- */
export function Timeline({ steps }: { steps: { label: string; done: boolean; at?: string | null; note?: string | null }[] }) {
  return (
    <View>
      {steps.map((st, i) => (
        <View key={i} style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ alignItems: "center", width: 20 }}>
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: st.done ? c.mint600 : c.surface, borderWidth: 2, borderColor: st.done ? c.mint600 : c.line, alignItems: "center", justifyContent: "center" }}>
              {st.done && <Text style={{ color: "#fff", fontSize: 11, fontWeight: "800" }}>✓</Text>}
            </View>
            {i < steps.length - 1 && <View style={{ width: 2, flex: 1, minHeight: 24, backgroundColor: st.done ? c.mint500 : c.line }} />}
          </View>
          <View style={{ flex: 1, paddingBottom: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: st.done ? "700" : "500", color: st.done ? c.ink900 : c.ink500 }}>{st.label}</Text>
            {!!st.at && <Text style={{ fontSize: 12, color: c.ink500 }}>{st.at}</Text>}
            {!!st.note && <Text style={{ fontSize: 12, color: c.ink500 }}>{st.note}</Text>}
          </View>
        </View>
      ))}
    </View>
  );
}

/* ---------- Overlay sheet ---------- */
export function Sheet({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 50, justifyContent: "flex-end" }]}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(11,26,74,0.45)" }]} onPress={onClose} />
      <View style={{ backgroundColor: c.porcelain, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, gap: 14, maxHeight: "85%" }}>{children}</View>
    </View>
  );
}

/* ---------- Sticky bottom bar ---------- */
export function StickyBar({ children }: { children: ReactNode }) {
  return (
    <View style={{ backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.line, padding: 14, paddingHorizontal: 20, gap: 10 }}>{children}</View>
  );
}

export function BackBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <Pressable onPress={onBack} style={{ flexDirection: "row", alignItems: "center", minHeight: 44, paddingHorizontal: 16, gap: 6 }}>
      <Text style={{ color: c.cobalt600, fontSize: 22, fontWeight: "600" }}>‹</Text>
      <Text style={{ color: c.cobalt600, fontSize: 15, fontWeight: "700" }}>{title}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: c.surface, borderRadius: 18, borderWidth: 1, borderColor: c.line, padding: 16, gap: 10, ...(shadow as object) },
  toastWrap: { position: "absolute", top: 12, left: 16, right: 16, zIndex: 100, alignItems: "center" },
  toast: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, maxWidth: 400 },
  toastTxt: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
