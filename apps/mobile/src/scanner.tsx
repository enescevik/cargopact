import { useEffect, useRef, useState } from "react";
import { Linking, Platform, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions, type BarcodeType } from "expo-camera";
import jsQR from "jsqr";
import { c } from "./theme";
import { Btn, Field } from "./ui";

/** Karekod + yaygın lojistik barkodları (palet etiketi Code128, GS1, EAN/UPC, DataMatrix, PDF417). */
const NATIVE_TYPES: BarcodeType[] = ["qr", "code128", "code39", "code93", "ean13", "ean8", "upc_a", "upc_e", "itf14", "datamatrix", "pdf417", "codabar"];
const WEB_FORMATS = ["qr_code", "code_128", "code_39", "code_93", "ean_13", "ean_8", "upc_a", "upc_e", "itf", "data_matrix", "pdf417", "codabar"];

/** Tam ekran kamera tarayıcı: iOS/Android'de yerel kamera, web'de getUserMedia. */
export function Scanner(props: { onCode: (code: string) => void; onClose: () => void }) {
  return Platform.OS === "web" ? <WebScanner {...props} /> : <NativeScanner {...props} />;
}

function NativeScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const [perm, requestPerm] = useCameraPermissions();
  const done = useRef(false);
  const [manual, setManual] = useState("");
  const [torch, setTorch] = useState(false);
  useEffect(() => { if (perm && !perm.granted && perm.canAskAgain) void requestPerm(); }, [perm, requestPerm]);
  const granted = !!perm?.granted;
  const err = !perm ? undefined : granted ? undefined : perm.canAskAgain ? "Kamera izni bekleniyor…" : "Kamera izni kapalı. Ayarlar'dan CargoPact için kamerayı açın ya da kodu elle girin.";
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 100, backgroundColor: "#000" }]}>
      {granted && (
        <CameraView style={StyleSheet.absoluteFill} facing="back" enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: NATIVE_TYPES }}
          onBarcodeScanned={({ data }) => {
            const v = (data ?? "").trim();
            if (!v || done.current) return;
            done.current = true;
            onCode(v);
          }} />
      )}
      <View pointerEvents="none" style={{ position: "absolute", top: "18%", left: "10%", right: "10%", height: "26%", borderWidth: 3, borderColor: c.mint500, borderRadius: 20 }} />
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: c.porcelain, padding: 18, gap: 10, borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
        {err ? <Text style={{ color: c.danger, fontWeight: "600" }}>{err}</Text> : <Text style={{ color: c.ink700 }}>Karekodu veya barkodu çerçeveye hizalayın.</Text>}
        {!!perm && !granted && !perm.canAskAgain && <Btn kind="outline" small title="Ayarları aç" onPress={() => void Linking.openSettings()} />}
        <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}>
          <Field label="Kodu elle gir" value={manual} onChangeText={setManual} placeholder="CP-2026-000123-P1" autoCapitalize="characters" onSubmitEditing={() => manual.trim() && onCode(manual.trim())} />
          <Btn small title="Bul" disabled={!manual.trim()} onPress={() => onCode(manual.trim())} />
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {granted && <Btn kind="outline" title={torch ? "Feneri kapat" : "Fener"} onPress={() => setTorch((t) => !t)} style={{ flex: 1 }} />}
          <Btn kind="outline" title="Kapat" onPress={onClose} style={{ flex: 1 }} />
        </View>
      </View>
    </View>
  );
}

function WebScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const host = useRef<View>(null);
  const [err, setErr] = useState<string>();
  const [manual, setManual] = useState("");
  useEffect(() => {
    if (typeof document === "undefined") { setErr("Kamera açılamadı. Kodu elle girin."); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setErr("Kamera kullanılamıyor (HTTPS gerekir veya tarayıcı desteklemiyor). Kodu elle girin."); return; }
    let stop = false;
    let stream: MediaStream | undefined;
    let raf = 0;
    const video = document.createElement("video");
    video.setAttribute("playsinline", "true"); video.muted = true;
    video.style.cssText = "width:100%;height:100%;object-fit:cover;";
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const BD = (window as unknown as { BarcodeDetector?: new (o: object) => { detect(s: CanvasImageSource): Promise<{ rawValue: string }[]> } }).BarcodeDetector;
    let det: { detect(s: CanvasImageSource): Promise<{ rawValue: string }[]> } | undefined;
    try { det = BD ? new BD({ formats: WEB_FORMATS }) : undefined; } catch { try { det = BD ? new BD({ formats: ["qr_code"] }) : undefined; } catch { det = undefined; } }
    let last = 0;
    const tick = async (t: number) => {
      if (stop) return;
      if (t - last > 150 && video.readyState >= 2 && video.videoWidth) {
        last = t;
        let val: string | undefined;
        try {
          if (det) val = (await det.detect(video))[0]?.rawValue;
          else if (ctx) {
            const w = 480, h = Math.round((video.videoHeight / video.videoWidth) * w);
            canvas.width = w; canvas.height = h;
            ctx.drawImage(video, 0, 0, w, h);
            val = jsQR(ctx.getImageData(0, 0, w, h).data, w, h)?.data;
          }
        } catch { /* kare atla */ }
        if (val && !stop) { stop = true; onCode(val.trim()); return; }
      }
      raf = requestAnimationFrame(tick);
    };
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false }).then((s) => {
      if (stop) { s.getTracks().forEach((x) => x.stop()); return; }
      stream = s; video.srcObject = s;
      (host.current as unknown as HTMLElement | null)?.appendChild(video);
      void video.play();
      raf = requestAnimationFrame(tick);
    }).catch((e: Error) => {
      setErr(e.name === "NotAllowedError" || e.name === "SecurityError"
        ? "Kamera izni verilmedi. Tarayıcı ayarlarından bu site için kamerayı açın ya da kodu elle girin."
        : e.name === "NotFoundError" ? "Bu cihazda kamera bulunamadı. Kodu elle girin." : `Kamera açılamadı (${e.name}). Kodu elle girin.`);
    });
    return () => { stop = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((x) => x.stop()); video.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 100, backgroundColor: "#000" }]}>
      <View ref={host} style={{ flex: 1, backgroundColor: "#000" }} />
      <View pointerEvents="none" style={{ position: "absolute", top: "25%", left: "15%", right: "15%", aspectRatio: 1, borderWidth: 3, borderColor: c.mint500, borderRadius: 20 }} />
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: c.porcelain, padding: 18, gap: 10, borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
        {err ? <Text style={{ color: c.danger, fontWeight: "600" }}>{err}</Text> : <Text style={{ color: c.ink700 }}>QR kodu çerçeveye hizalayın.</Text>}
        <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}>
          <Field label="Kodu elle gir" value={manual} onChangeText={setManual} placeholder="CP-2026-000123-P1" autoCapitalize="characters" onSubmitEditing={() => manual.trim() && onCode(manual.trim())} />
          <Btn small title="Bul" disabled={!manual.trim()} onPress={() => onCode(manual.trim())} />
        </View>
        <Btn kind="outline" title="Kapat" onPress={onClose} />
      </View>
    </View>
  );
}
