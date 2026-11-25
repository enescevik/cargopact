import { useEffect, useState } from "react";
import { Image, Platform, Pressable, Text, View } from "react-native";
import { QrMatrix } from "./premium";
import QRCode from "qrcode";
import { c, mono, serif } from "./theme";
import { Sheet, Btn } from "./ui";

export function useQrUrl(value: string, width = 320) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(value, { margin: 1, width, errorCorrectionLevel: "M" }).then((u) => { if (alive) setUrl(u); }).catch(() => undefined);
    return () => { alive = false; };
  }, [value, width]);
  return url;
}
export function QrImage({ value, size = 64 }: { value: string; size?: number }) {
  // Native'de toDataURL canvas ister; orada saf JS matrisle çiziyoruz.
  if (Platform.OS !== "web") return <QrMatrix value={value} size={size} color="#000" />;
  return <QrImageWeb value={value} size={size} />;
}
function QrImageWeb({ value, size }: { value: string; size: number }) {
  const url = useQrUrl(value);
  return <View style={{ width: size, height: size, backgroundColor: "#fff", borderRadius: 6 }}>{url && <Image source={{ uri: url }} style={{ width: size, height: size }} />}</View>;
}
/** Dokununca tam ekrana yakın büyütülen QR. */
export function QrTile({ value, caption, size = 72 }: { value: string; caption?: string; size?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityLabel={`${value} QR kodunu büyüt`}>
        <QrImage value={value} size={size} />
      </Pressable>
      {open && (
        <Sheet onClose={() => setOpen(false)}>
          <View style={{ alignItems: "center", gap: 12 }}>
            <Text style={{ fontFamily: serif, fontSize: 22, color: c.ink900 }}>{caption ?? "QR kod"}</Text>
            <View style={{ padding: 8, backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: c.line }}><QrImage value={value} size={300} /></View>
            <Text style={{ fontFamily: mono, fontSize: 16, fontWeight: "700", color: c.ink900 }}>{value}</Text>
          </View>
          <Btn kind="ghost" title="Kapat" onPress={() => setOpen(false)} />
        </Sheet>
      )}
    </>
  );
}
