import { createHash, createHmac } from "node:crypto";

export interface PickupRecipient { name: string; phone?: string }
export const PICKUP_MAX_RECIPIENTS = 3;
export const PICKUP_MAX_ATTEMPTS = 5;

const secret = (): string => process.env.PICKUP_CODE_SECRET || "cargopact-dev-pickup-secret";

/** Rezervasyona özgü, sunucu sırrından türetilen 6 haneli teslim kodu (müşteri sonradan görebilsin diye deterministik). */
export function derivePickupCode(reservationId: string): string {
  const n = createHmac("sha256", secret()).update(`pickup:${reservationId}`).digest().readUInt32BE(0) % 1_000_000;
  return String(n).padStart(6, "0");
}
export const hashPickupCode = (reservationId: string, code: string): string => createHash("sha256").update(`${reservationId}:${code.trim()}`).digest("hex");
export const pickupHint = (code: string): string => code.slice(-2);

/** Büyük/küçük harf ve aksan duyarsız ad karşılaştırma anahtarı (ı/İ → i). */
export const normalizeName = (s: string): string =>
  s.replace(/[İI]/g, "i").replace(/ı/g, "i").normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("en-US").replace(/\s+/g, " ").trim();

export function pickupFields(reservationId: string, recipients?: PickupRecipient[]) {
  const code = derivePickupCode(reservationId);
  return { code, pickup_code_hash: hashPickupCode(reservationId, code), pickup_code_hint: pickupHint(code), ...(recipients ? { pickup_recipients: JSON.stringify(recipients) } : {}) };
}
