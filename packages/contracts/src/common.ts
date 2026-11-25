import { z } from "./zod";

export const ROLES = [
  "customer_user",
  "carrier_admin",
  "carrier_planner",
  "carrier_warehouse",
  "admin_viewer",
  "platform_admin",
] as const;
export type Role = (typeof ROLES)[number];

export const TENANT_TYPES = ["platform", "carrier", "customer"] as const;
export type TenantType = (typeof TENANT_TYPES)[number];

export const ERROR_CODES = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  IDEMPOTENCY_MISMATCH: 422,
  INTERNAL: 500,
} as const;
export type ErrorCode = keyof typeof ERROR_CODES;

export interface ApiError {
  code: ErrorCode;
  message: string;
  correlationId: string;
  details?: unknown;
}

export interface Money {
  amountMinor: number;
  currency: "TRY";
}

export const uuid = z.string().uuid();
export const status = z.enum(["active", "inactive"]);
export type Status = z.infer<typeof status>;

export const pageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

export interface MeResponse {
  userId: string;
  email: string;
  displayName: string | null;
  memberships: { tenantId: string; tenantName: string; tenantType: TenantType; tenantStatus: string; role: Role }[];
  active: { tenantId: string; tenantType: TenantType; role: Role; tenantStatus: string } | null;
}
