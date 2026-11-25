import { Platform } from "react-native";

export const c = {
  cobalt900: "#0B1A4A", cobalt800: "#13277A", cobalt700: "#1D3AB8", cobalt600: "#2547E0", cobalt500: "#3B5BFF",
  cobalt100: "#E7ECFF", cobalt50: "#F3F5FF",
  mint600: "#12A675", mint500: "#2FD39A", mint200: "#BDF3DD", mint100: "#E3FAF1",
  porcelain: "#F7F5F0", surface: "#FFFFFF", line: "#E6DDCB", champagne: "#C9B78F", champagneInk: "#9A8352",
  ink900: "#0E1222", ink700: "#2B3145", ink500: "#5B6275", ink300: "#9AA0AE",
  success: "#12A675", warning: "#C98A06", danger: "#C8372D", info: "#2547E0", pending: "#7A5AF8",
};

/** Başlık yazı tipi: web ile aynı Plus Jakarta Sans (App.tsx'te yüklenir). Adı geçmişten "serif" kaldı. */
export const serif = "PlusJakartaSans_800ExtraBold";
export const sansBold = "PlusJakartaSans_700Bold";
export const sansSemi = "PlusJakartaSans_600SemiBold";
export const mono = Platform.select({ web: "ui-monospace, monospace", ios: "Menlo", default: "monospace" }) as string;

export const shadow = Platform.select({
  web: { boxShadow: "0 1px 2px rgba(14,18,34,.04), 0 8px 24px rgba(14,18,34,.06)" } as object,
  default: { shadowColor: "#0E1222", shadowOpacity: 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
}) as object;
