import { useCallback, useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { api } from "./api";
import { c } from "./theme";
import { useToast } from "./ui";
export interface AppNotification {
  id: string; audience: "customer" | "carrier"; reservationId: string | null; tripId: string | null;
  type: string; title: string; body: string | null; createdAt: string; readAt: string | null; isDemo: boolean;
}
const POLL_MS = 10_000;
const ago = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "şimdi";
  if (s < 3600) return `${Math.floor(s / 60)} dk`;
  if (s < 86400) return `${Math.floor(s / 3600)} sa`;
  return `${Math.floor(s / 86400)} g`;
};
/** Başlık zili (okunmamış rozeti). Bildirim listesi alt sayfada açılır; 10 sn'de bir yoklanır. */
export function NotificationBell({ onGo }: { onGo: (n: AppNotification) => void }) {
  const toast = useToast();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const seen = useRef<Set<string> | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await api<{ items: AppNotification[]; unreadCount: number }>("GET", "/notifications");
      if (seen.current) for (const n of r.items.filter((x) => !seen.current!.has(x.id) && !x.readAt).reverse()) toast(n.title, "ok");
      seen.current = new Set(r.items.map((x) => x.id));
      setItems(r.items); setUnread(r.unreadCount);
    } catch { /* sonraki yoklamada tekrar denenir */ }
  }, [toast]);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [load]);
  const tap = (n: AppNotification) => {
    if (!n.readAt) {
      setItems((x) => x.map((i) => (i.id === n.id ? { ...i, readAt: new Date().toISOString() } : i)));
      setUnread((u) => Math.max(0, u - 1));
      void api("POST", `/notifications/${n.id}/read`, {}).catch(() => {});
    }
    setOpen(false);
    onGo(n);
  };
  const readAll = () => {
    setItems((x) => x.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() }))); setUnread(0);
    void api("POST", "/notifications/read-all", {}).catch(() => {});
  };
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityLabel={`Bildirimler${unread ? `, ${unread} okunmamış` : ""}`} style={{ minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: 20, color: c.ink700 }}>🔔</Text>
        {unread > 0 && (
          <View style={{ position: "absolute", top: 4, right: 2, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: c.danger, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "#fff", fontSize: 11, fontWeight: "800" }}>{unread > 99 ? "99+" : unread}</Text>
          </View>
        )}
      </Pressable>
      {open && (
        <Modal transparent animationType="slide" onRequestClose={() => setOpen(false)}>
          <View style={{ flex: 1, justifyContent: "flex-end" }}>
            <Pressable style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, backgroundColor: "rgba(11,26,74,0.45)" }} onPress={() => setOpen(false)} />
            <View style={{ backgroundColor: c.porcelain, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, gap: 14, maxHeight: "85%", width: "100%", maxWidth: 440, alignSelf: "center" }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: c.ink900 }}>Bildirimler</Text>
            <Pressable onPress={readAll} disabled={unread === 0} style={{ minHeight: 44, justifyContent: "center" }}>
              <Text style={{ color: unread ? c.cobalt600 : c.ink300, fontWeight: "700", fontSize: 13 }}>Tümünü okundu yap</Text>
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: 460 }}>
            {items.length === 0 ? <Text style={{ color: c.ink500, textAlign: "center", padding: 24 }}>Henüz bildirim yok.</Text> : items.map((n) => (
              <Pressable key={n.id} onPress={() => tap(n)} style={{ padding: 12, marginBottom: 8, borderRadius: 12, backgroundColor: n.readAt ? c.surface : c.cobalt50, borderWidth: 1, borderColor: c.line }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  <Text style={{ flex: 1, fontWeight: "700", color: c.ink900, fontSize: 14 }}>{n.title}</Text>
                  <Text style={{ fontSize: 11, color: c.ink500 }}>{ago(n.createdAt)}</Text>
                </View>
                {!!n.body && <Text style={{ marginTop: 2, color: c.ink500, fontSize: 13 }}>{n.body}</Text>}
              </Pressable>
            ))}
          </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}
