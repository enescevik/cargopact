import { describe, expect, it } from "vitest";
import { requireRole, type AuthContext } from "./auth";

const ctx = (o: Partial<AuthContext>): AuthContext => ({ userId: "u", email: "e", tenantId: "t", tenantType: "carrier", tenantStatus: "active", role: "carrier_admin", correlationId: "c", ...o });

describe("requireRole", () => {
  it("izinli rolü geçirir", () => expect(() => requireRole(ctx({}), ["carrier_admin"])).not.toThrow());
  it("izinsiz rolde 403", () => expect(() => requireRole(ctx({ role: "carrier_planner" }), ["carrier_admin"])).toThrow(/yetkiniz/));
  it("onaysız firmada 403", () => expect(() => requireRole(ctx({ role: "customer_user", tenantType: "customer", tenantStatus: "pending" }), ["customer_user"])).toThrow(/onaylanmamış/));
});
