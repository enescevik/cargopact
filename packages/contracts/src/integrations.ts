import { z } from "./zod";

/** TMS sefer yayın adaptörü girdisi (dış sistem biçimi). */
export const tmsTripInput = z.object({
  externalTripNo: z.string().min(3).max(40).regex(/^[A-Za-z0-9._\-/]+$/, "Yalnız harf, rakam ve . _ - / kullanılabilir"),
  originCode: z.string().min(2).max(40),
  destinationCode: z.string().min(2).max(40),
  plate: z.string().min(4).max(20),
  plannedDeparture: z.string().datetime({ offset: true }),
  plannedArrival: z.string().datetime({ offset: true }),
  internalPallets: z.number().int().min(0),
  internalKg: z.number().int().min(0),
  maxGrossKg: z.number().int().min(1),
});

/** WMS palet olayı adaptörü girdisi. */
export const wmsPalletEventInput = z.object({
  palletCode: z.string().min(5).max(60),
  eventType: z.enum(["RECEIVED", "LOADED", "ARRIVED", "DELIVERED"]),
  occurredAt: z.string().datetime({ offset: true }),
  note: z.string().max(300).optional(),
});

export const integrationStatusResponse = z.object({
  bus: z.string(), source: z.string(), lastPublishedAt: z.string().nullable(), publishedCount: z.number().int(),
  lastError: z.string().nullable(), queueDepth: z.number().int().nullable().optional(),
});
