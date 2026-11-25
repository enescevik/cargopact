import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

/** Hafif dokunsal geri bildirim (yalnız native); hata olursa sessizce yok sayılır. */
export function tap() {
  if (Platform.OS === "web") return;
  Haptics.selectionAsync().catch(() => undefined);
}
export function success() {
  if (Platform.OS === "web") return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}
