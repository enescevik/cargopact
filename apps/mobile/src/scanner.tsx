import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import jsQR from "jsqr";
import { c } from "./theme";
import { Btn, Field } from "./ui";

/** Tam ekran kamera tarayıcı (yalnız web çalışma zamanı). */
export function Scanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const host = useRef<View>(null);
  const [err, setErr] = useState<string>();
  const [manual, setManual] = useState("");
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") { setErr("Kamera yalnız web sürümünde desteklenir. Kodu elle girin."); return; }
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
    const det = BD ? new BD({ formats: ["qr_code"] }) : undefined;
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
