import { z } from "zod";
import { status } from "./common";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM biçiminde olmalı");
const range = z.tuple([hhmm, hhmm]).refine(([a, b]) => a < b, "Başlangıç bitişten önce olmalı");
const dayKeys = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export const openingHours = z.object(
  Object.fromEntries(dayKeys.map((d) => [d, z.array(range).max(3).optional()])) as Record<(typeof dayKeys)[number], z.ZodOptional<z.ZodArray<typeof range>>>,
).strict();
export const timeWindow = z.object({ from: hhmm, to: hhmm }).refine((w) => w.from < w.to, "from < to olmalı");

const phone = z.string().regex(/^\+[1-9]\d{7,14}$/, "E.164 biçiminde olmalı (+905...)");
const ianaTz = z.string().refine((tz) => {
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; }
}, "Geçersiz saat dilimi");

export const facilityInput = z.object({
  code: z.string().min(2).max(32).regex(/^[A-Z0-9-]+$/),
  name: z.string().min(2).max(120),
  kind: z.enum(["transfer_center", "distribution_center", "both"]),
  city: z.string().min(2).max(80),
  district: z.string().max(80).optional(),
  address: z.string().min(5).max(300),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  timezone: ianaTz.default("Europe/Istanbul"),
  openingHours: openingHours,
  intakeWindow: timeWindow.optional(),
  pickupWindow: timeWindow.optional(),
  dailySlotLimit: z.number().int().positive().max(10000).optional(),
  contactName: z.string().max(120).optional(),
  contactPhone: phone.optional(),
});
export type FacilityInput = z.infer<typeof facilityInput>;

export const vehicleTypeInput = z.object({
  code: z.string().min(2).max(32).regex(/^[A-Z0-9-]+$/),
  name: z.string().min(2).max(120),
  palletPositions: z.number().int().positive().max(100),
  maxPayloadKg: z.number().int().positive().max(100000),
  cargoVolumeM3: z.number().positive().max(500),
  innerLengthMm: z.number().int().positive().optional(),
  innerWidthMm: z.number().int().positive().optional(),
  innerHeightMm: z.number().int().positive().optional(),
});
export type VehicleTypeInput = z.infer<typeof vehicleTypeInput>;

export const vehicleInput = z.object({
  vehicleTypeId: z.string().uuid(),
  plate: z.string().min(5).max(16),
  vehicleStatus: z.enum(["active", "maintenance", "inactive"]).default("active"),
  driverName: z.string().max(120).optional(),
  driverPhone: phone.optional(),
});
export type VehicleInput = z.infer<typeof vehicleInput>;

export const packagingTypeInput = z.object({
  code: z.string().min(2).max(32).regex(/^[A-Z0-9-]+$/),
  name: z.string().min(2).max(120),
  kind: z.enum(["pallet", "carton", "other"]),
  lengthMm: z.number().int().positive(),
  widthMm: z.number().int().positive(),
  heightMm: z.number().int().positive(),
  maxGrossKg: z.number().positive().max(100000),
  usableVolumeM3: z.number().positive().optional(),
  fillFactor: z.number().gt(0).lte(1).optional(),
}).refine((v) => v.kind !== "pallet" || (v.usableVolumeM3 && v.fillFactor), {
  message: "Palet için usableVolumeM3 ve fillFactor zorunlu",
});
export type PackagingTypeInput = z.infer<typeof packagingTypeInput>;

export const productClassInput = z.object({
  code: z.string().min(2).max(32).regex(/^[A-Z0-9-]+$/),
  name: z.string().min(2).max(120),
  specialHandling: z.boolean().default(false),
});
export type ProductClassInput = z.infer<typeof productClassInput>;

export const carrierProductClassesInput = z.object({
  accepted: z.array(z.object({ productClassId: z.string().uuid(), accepted: z.boolean() })).max(100),
});

export const statusPatch = z.object({ status });

export const estimatePalletsInput = z.object({
  palletTypeId: z.string().uuid(),
  cartons: z.array(z.object({ packagingTypeId: z.string().uuid(), count: z.number().int().positive().max(100000) })).min(1).max(50),
});
export interface EstimatePalletsResponse {
  totalVolumeM3: number;
  totalWeightKg: number;
  estimatedPallets: number;
  perPalletUsableM3: number;
  warnings: string[];
}
