import { OpenAPIRegistry, OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import { z } from "./zod";
import type { Role } from "./common";
import {
  carrierProductClassesInput, estimatePalletsInput, facilityInput, packagingTypeInput, productClassInput,
  statusPatch, vehicleInput, vehicleTypeInput,
} from "./master-data";
import {
  carrierProductClass, errorBody, estimatePalletsResponse, facility, health, meResponse, packagingType, page,
  productClass, tenant, tenantSummary, unauthorizedBody, updatedCount, vehicle, vehicleType,
} from "./responses";

export interface Operation {
  method: "GET" | "POST" | "PUT" | "PATCH";
  path: string;
  summary: string;
  tag: string;
  /** Boş dizi = kimlik doğrulama gerektirmez. */
  roles: readonly Role[] | "any-authenticated" | "public";
  body?: z.ZodTypeAny;
  query?: z.AnyZodObject;
  response: z.ZodTypeAny;
  status?: 200 | 201;
  idempotent?: boolean;
  ifMatch?: boolean;
}

const CARRIER_ALL: Role[] = ["carrier_admin", "carrier_planner", "carrier_warehouse"];
const READ_CARRIER: Role[] = [...CARRIER_ALL, "platform_admin", "admin_viewer"];
const READ_ALL: Role[] = [...READ_CARRIER, "customer_user"];

const listQuery = z.object({
  limit: z.number().int().min(1).max(200).optional().openapi({ description: "Varsayılan 50" }),
  cursor: z.string().optional(),
  status: z.enum(["active", "inactive", "maintenance"]).optional(),
});
const catalogQuery = listQuery.extend({ carrierId: z.string().uuid().optional().openapi({ description: "Müşteri: ilgili taşıyıcının ek katalog kayıtları" }) });

function crud(base: string, tag: string, item: z.ZodTypeAny, input: z.ZodTypeAny, read: readonly Role[], write: readonly Role[], q = listQuery): Operation[] {
  return [
    { method: "GET", path: base, summary: `${tag} listesi`, tag, roles: read, query: q, response: page(item) },
    { method: "POST", path: base, summary: `${tag} oluştur`, tag, roles: write, body: input, response: item, status: 201, idempotent: true },
    { method: "GET", path: `${base}/{id}`, summary: `${tag} ayrıntı`, tag, roles: read, response: item },
    { method: "PUT", path: `${base}/{id}`, summary: `${tag} güncelle`, tag, roles: write, body: input, response: item, idempotent: true, ifMatch: true },
    { method: "PATCH", path: `${base}/{id}/status`, summary: `${tag} aktif/pasif`, tag, roles: write, body: statusPatch, response: item, idempotent: true },
  ];
}
const readOnly = (base: string, tag: string, item: z.ZodTypeAny, q = catalogQuery): Operation[] => [
  { method: "GET", path: base, summary: `${tag} kataloğu`, tag, roles: READ_ALL, query: q, response: page(item) },
  { method: "GET", path: `${base}/{id}`, summary: `${tag} katalog kaydı`, tag, roles: READ_ALL, response: item },
];

/** Tek kaynak: API yönlendiricisi bu listeyle karşılaştırılarak test edilir. */
export const API_OPERATIONS: Operation[] = [
  { method: "GET", path: "/health", summary: "Sağlık kontrolü", tag: "Sistem", roles: "public", response: health },
  { method: "GET", path: "/me", summary: "Oturumdaki kullanıcı ve üyelikleri", tag: "Sistem", roles: "any-authenticated", response: meResponse },
  { method: "GET", path: "/platform/tenants", summary: "Firmalar", tag: "Platform", roles: ["platform_admin", "admin_viewer"], query: z.object({ status: z.enum(["pending", "active", "suspended"]).optional() }), response: z.object({ items: z.array(tenantSummary) }) },
  { method: "PATCH", path: "/platform/tenants/{id}/status", summary: "Firma onayla/askıya al", tag: "Platform", roles: ["platform_admin"], body: z.object({ status: z.enum(["active", "suspended"]), reason: z.string().max(300).optional() }), response: tenant, idempotent: true },
  ...crud("/carrier/facilities", "Tesis", facility, facilityInput, READ_CARRIER, ["carrier_admin"]),
  ...crud("/carrier/vehicle-types", "Araç tipi", vehicleType, vehicleTypeInput, READ_CARRIER, ["carrier_admin"]),
  ...crud("/carrier/vehicles", "Araç", vehicle, vehicleInput, READ_CARRIER, ["carrier_admin"]),
  ...crud("/carrier/packaging-types", "Ambalaj tipi", packagingType, packagingTypeInput, READ_CARRIER, ["carrier_admin"]),
  { method: "GET", path: "/carrier/product-classes", summary: "Kabul edilen ürün sınıfları", tag: "Ürün sınıfı", roles: READ_ALL, response: z.object({ items: z.array(carrierProductClass) }) },
  { method: "PUT", path: "/carrier/product-classes", summary: "Ürün sınıfı kabul listesini güncelle", tag: "Ürün sınıfı", roles: ["carrier_admin"], body: carrierProductClassesInput, response: updatedCount, idempotent: true },
  ...readOnly("/catalog/vehicle-types", "Araç tipi", vehicleType),
  ...readOnly("/catalog/packaging-types", "Ambalaj tipi", packagingType),
  ...readOnly("/catalog/product-classes", "Ürün sınıfı", productClass),
  ...crud("/platform/catalog/vehicle-types", "Platform araç tipi", vehicleType, vehicleTypeInput, READ_ALL, ["platform_admin"]),
  ...crud("/platform/catalog/packaging-types", "Platform ambalaj tipi", packagingType, packagingTypeInput, READ_ALL, ["platform_admin"]),
  ...crud("/platform/catalog/product-classes", "Platform ürün sınıfı", productClass, productClassInput, READ_ALL, ["platform_admin"]),
  { method: "POST", path: "/customer/shipments/estimate-pallets", summary: "Koli beyanından tahmini palet sayısı (kayıt yazmaz)", tag: "Müşteri", roles: ["customer_user"], body: estimatePalletsInput, response: estimatePalletsResponse },
];

export function buildOpenApiDocument(serverUrl?: string) {
  const reg = new OpenAPIRegistry();
  const bearer = reg.registerComponent("securitySchemes", "cognitoJwt", { type: "http", scheme: "bearer", bearerFormat: "JWT", description: "Cognito ID token" });
  reg.register("Error", errorBody);
  const err = (description: string) => ({ description, content: { "application/json": { schema: errorBody } } });

  for (const op of API_OPERATIONS) {
    const headers: z.AnyZodObject[] = [];
    const h: Record<string, z.ZodTypeAny> = {};
    if (op.idempotent) h["idempotency-key"] = z.string().min(8).max(128).openapi({ description: "Aynı anahtar aynı yanıtı döner; farklı gövde 422" });
    if (op.ifMatch) h["if-match"] = z.string().openapi({ description: "Kaydın mevcut version değeri" });
    if (op.roles !== "public") h["x-tenant-id"] = z.string().uuid().optional().openapi({ description: "Birden fazla üyelikte seçilen kiracı" });
    if (Object.keys(h).length) headers.push(z.object(h));
    const pathParams = op.path.includes("{id}") ? z.object({ id: z.string().uuid() }) : undefined;
    const rolesText = op.roles === "public" ? "Herkese açık" : op.roles === "any-authenticated" ? "Kimliği doğrulanmış her kullanıcı" : `Roller: ${op.roles.join(", ")}`;

    reg.registerPath({
      method: op.method.toLowerCase() as "get",
      path: op.path,
      summary: op.summary,
      description: rolesText,
      tags: [op.tag],
      security: op.roles === "public" ? [] : [{ [bearer.name]: [] }],
      request: {
        params: pathParams,
        query: op.query,
        headers,
        body: op.body ? { content: { "application/json": { schema: op.body } } } : undefined,
      },
      responses: {
        [op.status ?? 200]: { description: "Başarılı", content: { "application/json": { schema: op.response } } },
        ...(op.roles === "public" ? {} : { 400: err("Geçersiz istek"), 401: { description: "Kimlik doğrulanamadı. Token yok/geçersizse API Gateway `{message}` döner, aksi halde Error.", content: { "application/json": { schema: unauthorizedBody } } }, 403: err("Yetki yok veya firma onaysız"), 404: err("Bulunamadı") }),
        ...(op.idempotent ? { 409: err("Çakışma: tekillik veya sürüm"), 422: err("Idempotency-Key farklı istekle kullanılmış") } : {}),
      },
    });
  }
  return new OpenApiGeneratorV3(reg.definitions).generateDocument({
    openapi: "3.0.3",
    info: { title: "CargoPact API", version: "0.1.0", description: "Hatalar `Error` şemasıyla döner. Zamanlar ISO 8601 UTC, para kuruş tamsayı." },
    servers: serverUrl ? [{ url: serverUrl }] : [],
  });
}
