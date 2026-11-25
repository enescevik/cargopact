import { z } from "./zod";

export const quoteInput = z.object({
  pallets: z.number().int().min(1).max(60),
  grossKg: z.number().int().min(1).max(40000),
  volumeM3: z.number().min(0).max(200).optional(),
  productClassCode: z.string().min(1).max(40),
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
  card: cardInput,
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
export const reservationEventInput = z.object({
  type: z.enum(["DEPO_KABUL", "YUKLENDI", "VARISTA", "TESLIM", "EKSIK_HASAR", "GELMEDI"]),
  note: z.string().max(300).optional(),
});
export const looseResponse = z.object({}).passthrough();
export const itemsResponse = z.object({ items: z.array(z.object({}).passthrough()) });
