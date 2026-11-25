/** Cihazda saklanan küçük tercihler: boş yer alarmları ve kayıtlı alıcılar (AsyncStorage). */
import AsyncStorage from "@react-native-async-storage/async-storage";

export type Alarm = { id: string; origin: string; destination: string; from: string; to: string; pallets: number; createdAt: string };

async function load<T>(key: string, fallback: T): Promise<T> {
  try { const v = await AsyncStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
async function save<T>(key: string, value: T) {
  try { await AsyncStorage.setItem(key, JSON.stringify(value)); } catch { /* yok say */ }
}

export const loadAlarms = () => load<Alarm[]>("cp_alarms", []);
export const saveAlarms = (a: Alarm[]) => save("cp_alarms", a);
export const loadRecipients = () => load<string[]>("cp_recipients", []);
export async function rememberRecipient(name: string) {
  const n = name.trim();
  if (!n) return;
  const cur = await loadRecipients();
  await save("cp_recipients", [n, ...cur.filter((x) => x !== n)].slice(0, 6));
}
