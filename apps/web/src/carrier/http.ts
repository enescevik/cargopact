import { ApiError, getToken } from "../api";
import type { CarrierReservation, CarrierTrip } from "../types";

const API_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export type PodFile = { kind: "photo" | "signature"; url: string };
export type CarrierRes = CarrierReservation & {
  needsReview?: boolean;
  pod?: { recipientName: string | null; deliveredAt: string; attachments: PodFile[] } | null;
};
export type CarrierTripV = CarrierTrip & { version: number; capacityVersion: number };
export type Reevaluated = { reservationId: string; reference: string; customer: string; eligible: boolean; reasons: { code: string; message: string }[] };
export type TripUpdateResult = CarrierTripV & { reevaluated: Reevaluated[]; needsReviewCount: number };

/** PUT + If-Match (web api() yalnız GET/POST destekler). */
export async function apiPut<T>(path: string, body: unknown, version: number, idempotencyKey: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: "PUT",
      headers: { authorization: `Bearer ${getToken() ?? ""}`, "content-type": "application/json", "idempotency-key": idempotencyKey, "if-match": String(version) },
      body: JSON.stringify(body),
    });
  } catch { throw new ApiError("Sunucuya ulaşılamadı. Bağlantınızı kontrol edin.", 0); }
  const text = await res.text();
  let data: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) throw new ApiError(data?.message ?? `Beklenmeyen hata (HTTP ${res.status}).`, res.status, data?.code, data?.correlationId, data?.details);
  return data as T;
}

export async function uploadToS3(url: string, blob: Blob, contentType: string): Promise<void> {
  const r = await fetch(url, { method: "PUT", headers: { "content-type": contentType }, body: blob });
  if (!r.ok) throw new ApiError(`Dosya yüklenemedi (HTTP ${r.status}).`, r.status);
}
