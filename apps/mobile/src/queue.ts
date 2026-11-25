import { useEffect, useState } from "react";
import { api, ApiError, uuid } from "./api";

export type QItem = { reservationId: string; type: string; note?: string; body: Record<string, unknown>; idempotencyKey: string; at: number };
const KEY = "cp.eventQueue.v1";
let mem: QItem[] = [];
let sim = false;
let flushing = false;
let lastError: string | undefined;
const subs = new Set<() => void>();
const ls = (): Storage | undefined => { try { return typeof localStorage !== "undefined" ? localStorage : undefined; } catch { return undefined; } };

function load(): QItem[] {
  const s = ls();
  if (!s) return mem;
  try { return JSON.parse(s.getItem(KEY) ?? "[]") as QItem[]; } catch { return []; }
}
function save(q: QItem[]) {
  mem = q;
  const s = ls();
  try { s?.setItem(KEY, JSON.stringify(q)); } catch { /* dolu/yasak */ }
  subs.forEach((f) => f());
}
export const getQueue = () => load();
export const isOfflineSim = () => sim;
export function setOfflineSim(v: boolean) { sim = v; subs.forEach((f) => f()); if (!v) void flushQueue(); }
const offline = () => sim || (typeof navigator !== "undefined" && navigator.onLine === false);

export type PostResult = "done" | "queued";
/** Olayı gönderir; ağ yoksa kuyruğa alır. "done" yalnız sunucu teyidiyle döner. */
export async function postEvent(reservationId: string, type: string, extra: Record<string, unknown> = {}, idempotencyKey?: string): Promise<PostResult> {
  const body = { type, ...extra };
  const key = idempotencyKey ?? uuid();
  const queue = () => {
    const q = load();
    if (!q.some((x) => x.reservationId === reservationId && x.type === type))
      save([...q, { reservationId, type, note: extra.note as string | undefined, body, idempotencyKey: key, at: Date.now() }]);
    return "queued" as const;
  };
  if (offline()) return queue();
  try {
    await api("POST", `/carrier/reservations/${reservationId}/events`, body, key);
    return "done";
  } catch (e) {
    if (e instanceof ApiError && e.status === 0) return queue();
    throw e;
  }
}
export async function flushQueue(): Promise<number> {
  if (flushing || offline()) return 0;
  flushing = true;
  let ok = 0;
  try {
    for (const it of load()) {
      try {
        await api("POST", `/carrier/reservations/${it.reservationId}/events`, it.body, it.idempotencyKey);
        ok++; save(load().filter((x) => x.idempotencyKey !== it.idempotencyKey)); lastError = undefined;
      } catch (e) {
        if (e instanceof ApiError && e.status === 0) break; // hâlâ çevrimdışı
        if (e instanceof ApiError && (e.status === 401 || e.status >= 500)) break; // sonra tekrar dene
        lastError = (e as Error).message; // kalıcı red: kuyruktan düş
        save(load().filter((x) => x.idempotencyKey !== it.idempotencyKey));
      }
    }
  } finally { flushing = false; }
  return ok;
}
export const getLastQueueError = () => lastError;
export function useQueue() {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    subs.add(f);
    return () => { subs.delete(f); };
  }, []);
  return { items: load(), sim };
}
/** Kuyruğu 10 sn'de bir ve `online` olayında boşaltır. */
export function useQueueFlusher(onFlushed: () => void) {
  useEffect(() => {
    const run = async () => { if ((await flushQueue()) > 0) onFlushed(); };
    const h = setInterval(run, 10000);
    const on = () => void run();
    if (typeof window !== "undefined") window.addEventListener("online", on);
    void run();
    return () => { clearInterval(h); if (typeof window !== "undefined") window.removeEventListener("online", on); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
