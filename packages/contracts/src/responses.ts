import { z } from "./zod";
import { ERROR_CODES, ROLES, TENANT_TYPES } from "./common";

/** API yanıt şemaları: OpenAPI belgesi ve sözleşme testi bu şemalardan üretilir. */
const iso = z.string().datetime({ offset: true });
const timeWindow = z.object({ from: z.string(), to: z.string() }).nullable();
const base = { id: z.string().uuid(), version: z.number().int(), isDemo: z.boolean(), createdAt: iso, updatedAt: iso };

export const errorBody = z.object({
  code: z.enum(Object.keys(ERROR_CODES) as [keyof typeof ERROR_CODES, ...(keyof typeof ERROR_CODES)[]]),
  message: z.string(),
  correlationId: z.string(),
  details: z.unknown().optional(),
}).openapi("Error");

/** 401: API Gateway JWT yetkilendiricisi kendi gövdesini döner ({message}); HTTP API'de özelleştirilemez. */
export const gatewayUnauthorized = z.object({ message: z.string() }).openapi("GatewayUnauthorized");
export const unauthorizedBody = z.union([errorBody, gatewayUnauthorized]);

export const facility = z.object({
  ...base,
  carrierId: z.string().uuid(),
  code: z.string(), name: z.string(),
  kind: z.enum(["transfer_center", "distribution_center", "both"]),
  city: z.string(), district: z.string().nullable(), address: z.string(),
  latitude: z.number().nullable(), longitude: z.number().nullable(),
  timezone: z.string(),
  openingHours: z.record(z.array(z.tuple([z.string(), z.string()]))),
  intakeWindow: timeWindow, pickupWindow: timeWindow,
  dailySlotLimit: z.number().int().nullable(),
  contactName: z.string().nullable(), contactPhone: z.string().nullable(),
  status: z.enum(["active", "inactive"]),
}).openapi("Facility");

export const vehicleType = z.object({
  ...base,
  tenantId: z.string().uuid(),
  code: z.string(), name: z.string(),
  palletPositions: z.number().int(), maxPayloadKg: z.number().int(), cargoVolumeM3: z.number(),
  innerLengthMm: z.number().int().nullable(), innerWidthMm: z.number().int().nullable(), innerHeightMm: z.number().int().nullable(),
  stackable: z.boolean(),
  status: z.enum(["active", "inactive"]),
}).openapi("VehicleType");

export const vehicle = z.object({
  ...base,
  carrierId: z.string().uuid(), vehicleTypeId: z.string().uuid(),
  plate: z.string(),
  status: z.enum(["active", "maintenance", "inactive"]),
  driverName: z.string().nullable(), driverPhone: z.string().nullable(),
}).openapi("Vehicle");

export const packagingType = z.object({
  ...base,
  tenantId: z.string().uuid(),
  code: z.string(), name: z.string(),
  kind: z.enum(["pallet", "carton", "other"]),
  lengthMm: z.number().int(), widthMm: z.number().int(), heightMm: z.number().int(),
  maxGrossKg: z.number(), usableVolumeM3: z.number().nullable(), fillFactor: z.number().nullable(),
  stackable: z.boolean(),
  status: z.enum(["active", "inactive"]),
}).openapi("PackagingType");

export const productClass = z.object({
  ...base,
  tenantId: z.string().uuid(),
  code: z.string(), name: z.string(), specialHandling: z.boolean(),
  status: z.enum(["active", "inactive"]),
}).openapi("ProductClass");

export const carrierProductClass = z.object({
  id: z.string().uuid(), code: z.string(), name: z.string(), specialHandling: z.boolean(), accepted: z.boolean(),
}).openapi("CarrierProductClass");

export const page = <T extends z.ZodTypeAny>(item: T) => z.object({ items: z.array(item), nextCursor: z.string().optional() });

export const meResponse = z.object({
  userId: z.string().uuid(), email: z.string(), displayName: z.string().nullable(),
  memberships: z.array(z.object({ tenantId: z.string().uuid(), tenantName: z.string(), tenantType: z.enum(TENANT_TYPES), tenantStatus: z.string(), role: z.enum(ROLES) })),
  active: z.object({ tenantId: z.string().uuid(), tenantType: z.enum(TENANT_TYPES), role: z.enum(ROLES), tenantStatus: z.string() }).nullable(),
}).openapi("Me");

export const tenantSummary = z.object({
  id: z.string().uuid(), type: z.enum(TENANT_TYPES), name: z.string(),
  status: z.enum(["pending", "active", "suspended"]), isDemo: z.boolean(), createdAt: iso,
}).openapi("TenantSummary");

export const tenant = tenantSummary.extend({ taxNo: z.string().nullable() }).openapi("Tenant");

export const estimatePalletsResponse = z.object({
  totalVolumeM3: z.number(), totalWeightKg: z.number(), estimatedPallets: z.number().int().positive(),
  perPalletUsableM3: z.number(), warnings: z.array(z.string()),
}).openapi("EstimatePalletsResponse");

export const health = z.object({ status: z.literal("ok") });
export const updatedCount = z.object({ updated: z.number().int() });
