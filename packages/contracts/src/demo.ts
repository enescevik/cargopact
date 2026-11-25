import { z } from "./zod";

export const quoteInput = z.object({
  pallets: z.number().int().min(1).max(60),
  grossKg: z.number().int().min(1).max(40000),
  volumeM3: z.number().min(0).max(200).optional(),
  productClassCode: z.string().min(1).max(40),
  /** Karbon: müşterinin seçtiği alternatif senaryo (yoksa tasarruf iddiası yapılmaz). */
  alternativeScenario: z.enum(["dedicated", "groupage"]).nullable().optional(),
});
/** Sözleşme kabulü. Zorunluluk işleyicide denetlenir (CONTRACT_NOT_ACCEPTED). */
export const contractAcceptInput = z.object({
  version: z.string().min(1).max(40),
  renderedHash: z.string().min(1).max(100),
  signerName: z.string().trim().min(2).max(120),
  accepted: z.boolean(),
});
export const cardInput = z.object({
  holder: z.string().min(2).max(80),
  number: z.string().regex(/^[\d ]{13,23}$/, "Kart numarası geçersiz"),
  expiry: z.string().regex(/^(0[1-9]|1[0-2])\s*\/\s*\d{2,4}$/, "Son kullanma MM/YY olmalı"),
  cvc: z.string().regex(/^\d{3,4}$/, "CVC geçersiz"),
});
export const reservationInput = quoteInput.extend({
  tripId: z.string().uuid(),
  paymentPlan: z.enum(["full", "deposit"]),
  recipientName: z.string().max(120).optional(),
  /** Yetkili alıcılar (en çok 3). Verilmezse recipientName tek alıcı sayılır. */
  recipients: z.array(z.object({ name: z.string().trim().min(2).max(120), phone: z.string().trim().max(30).optional() })).max(3).optional(),
  card: cardInput,
  /** ZORUNLU: contract-preview yanıtındaki sürüm ve renderedHash ile kabul. Eksik/uyuşmaz → 400 CONTRACT_NOT_ACCEPTED. */
  contract: contractAcceptInput.optional(),
});
export const contractPreviewInput = quoteInput.extend({
  paymentPlan: z.enum(["full", "deposit"]),
  recipientName: z.string().max(120).optional(),
});
export const cancelInput = z.object({ reason: z.string().max(300).optional() });
export const tripCreateInput = z.object({
  originFacilityId: z.string().uuid(),
  destinationFacilityId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  departureAt: z.string().datetime({ offset: true }),
  arrivalEta: z.string().datetime({ offset: true }),
  internalPallets: z.number().int().min(0),
  internalKg: z.number().int().min(0),
  maxGrossKg: z.number().int().min(1),
  sellablePallets: z.number().int().min(0),
  sellableKg: z.number().int().min(0),
  sellableM3: z.number().min(0),
  basePriceMinor: z.number().int().min(1),
  publish: z.boolean(),
});
export const tripStatusInput = z.object({ action: z.enum(["publish", "close", "cancel"]) });
export const decisionInput = z.object({ decision: z.enum(["approve", "reject"]), reason: z.string().max(300).optional() });
/** Depo ölçümü (DEPO_KABUL ile birlikte gönderilir). */
export const measurementInput = z.object({
  measuredPallets: z.number().int().min(1).max(60),
  measuredKg: z.number().int().min(0).max(60000),
  measuredHeightMm: z.number().int().min(0).max(4000).optional(),
  note: z.string().trim().max(300).optional(),
});
export const reviewInput = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("accept_partial"), acceptedPallets: z.number().int().min(1).max(60), note: z.string().trim().max(300).optional() }),
  z.object({ decision: z.literal("reject"), reason: z.string().trim().max(300).optional() }),
]);
export const reservationEventInput = z.object({
  /** DEPO_KABUL için isteğe bağlı depo ölçümü. */
  measurement: measurementInput.optional(),
  type: z.enum(["DEPO_KABUL", "YUKLENDI", "VARISTA", "TESLIM", "EKSIK_HASAR", "GELMEDI"]),
  note: z.string().max(300).optional(),
  /** TESLIM için zorunlu: teslim alan kişi. */
  recipientName: z.string().trim().min(2).max(120).optional(),
  /** TESLIM için zorunlu: müşterinin teslim kodu (6 hane). */
  pickupCode: z.string().trim().regex(/^\d{6}$/, "Teslim kodu 6 haneli olmalı").optional(),
  /** TESLIM e-POD: pod-upload-url ile yüklenen nesne anahtarları (fotoğraf/imza). */
  podKeys: z.array(z.string().min(10).max(300)).max(6).optional(),
});
export const recipientsInput = z.object({ recipients: z.array(z.object({ name: z.string().trim().min(2).max(120), phone: z.string().trim().max(30).optional() })).max(3) });
export const podUploadInput = z.object({
  kind: z.enum(["photo", "signature"]),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});
export const podUploadResponse = z.object({ uploadUrl: z.string(), key: z.string(), expiresIn: z.number().int() });
export const tripUpdateInput = z.object({
  vehicleId: z.string().uuid().optional(),
  sellablePallets: z.number().int().min(0).max(60).optional(),
  sellableKg: z.number().int().min(0).max(100000).optional(),
  sellableM3: z.number().min(0).max(200).optional(),
  maxGrossKg: z.number().int().min(1).max(100000).optional(),
  departureAt: z.string().datetime().optional(),
  arrivalEta: z.string().datetime().optional(),
});
export const looseResponse = z.object({}).passthrough();
export const itemsResponse = z.object({ items: z.array(z.object({}).passthrough()) });
