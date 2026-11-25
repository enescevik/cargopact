/** Tarayıcıya özel küçük tercihler (localStorage). Okuma/yazma hataları sessizce yutulur. */
export function load<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
export function save<T>(key: string, value: T): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* yok say */ }
}

export type Alarm = { id: string; origin: string; destination: string; from: string; to: string; pallets: number; createdAt: string };
const ALARMS = "cp_alarms";
export const loadAlarms = () => load<Alarm[]>(ALARMS, []);
export const saveAlarms = (a: Alarm[]) => save(ALARMS, a);

const RECIPIENTS = "cp_recipients";
export const loadRecipients = () => load<string[]>(RECIPIENTS, []);
export function rememberRecipient(name: string) {
  const n = name.trim();
  if (!n) return;
  save(RECIPIENTS, [n, ...loadRecipients().filter((x) => x !== n)].slice(0, 6));
}
