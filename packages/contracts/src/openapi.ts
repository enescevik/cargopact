import { OpenAPIRegistry, OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import { z } from "./zod";
import { cancelInput, decisionInput, itemsResponse, looseResponse, podUploadInput, podUploadResponse, quoteInput, recipientsInput, reviewInput, reservationEventInput, reservationInput, tripCreateInput, tripStatusInput, tripUpdateInput } from "./demo";
import type { Role } from "./common";
import { integrationStatusResponse, tmsTripInput, wmsPalletEventInput } from "./integrations";
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

const customerManagementItem = z.object({
  id: z.string().uuid(), name: z.string(), tenantStatus: z.string(),
  totalReservations: z.number().int().min(0), delivered: z.number().int().min(0), verifiedNoShows: z.number().int().min(0),
  cancelled: z.number().int().min(0), rejected: z.number().int().min(0), damaged: z.number().int().min(0), pending: z.number().int().min(0), active: z.number().int().min(0),
  score: z.number().int().min(0).max(100), category: z.enum(["UYGUN", "IZLENMELI", "RISKLI"]), evidenceCount: z.number().int().min(0), scoreExplanation: z.string(),
  lastReservationAt: z.string().datetime(),
  recentEvents: z.array(z.object({ type: z.string(), label: z.string(), at: z.string().datetime(), reservationReference: z.string() })).max(5),
});
const customerManagementResponse = z.object({ items: z.array(customerManagementItem) });

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
  { method: "GET", path: "/carrier/customers", summary: "Taşıyıcının müşteri yönetimi ve operasyonel güven skorları", tag: "Müşteri yönetimi", roles: ["carrier_admin", "carrier_planner"], response: customerManagementResponse },
  { method: "GET", path: "/carrier/product-classes", summary: "Kabul edilen ürün sınıfları", tag: "Ürün sınıfı", roles: READ_ALL, response: z.object({ items: z.array(carrierProductClass) }) },
  { method: "PUT", path: "/carrier/product-classes", summary: "Ürün sınıfı kabul listesini güncelle", tag: "Ürün sınıfı", roles: ["carrier_admin"], body: carrierProductClassesInput, response: updatedCount, idempotent: true },
  ...readOnly("/catalog/vehicle-types", "Araç tipi", vehicleType),
  ...readOnly("/catalog/packaging-types", "Ambalaj tipi", packagingType),
  ...readOnly("/catalog/product-classes", "Ürün sınıfı", productClass),
  ...crud("/platform/catalog/vehicle-types", "Platform araç tipi", vehicleType, vehicleTypeInput, READ_ALL, ["platform_admin"]),
  ...crud("/platform/catalog/packaging-types", "Platform ambalaj tipi", packagingType, packagingTypeInput, READ_ALL, ["platform_admin"]),
  ...crud("/platform/catalog/product-classes", "Platform ürün sınıfı", productClass, productClassInput, READ_ALL, ["platform_admin"]),
  { method: "POST", path: "/customer/shipments/estimate-pallets", summary: "Koli beyanından tahmini palet sayısı (kayıt yazmaz)", tag: "Müşteri", roles: ["customer_user"], body: estimatePalletsInput, response: estimatePalletsResponse },
  { method: "GET", path: "/customer/trips", summary: "Yayındaki seferleri ara", tag: "Müşteri sefer", roles: ["customer_user"], query: z.object({ originCity: z.string().optional(), destinationCity: z.string().optional(), date: z.string().optional(), pallets: z.string().optional() }), response: itemsResponse },
  { method: "GET", path: "/customer/trips/{id}", summary: "Sefer kartı", tag: "Müşteri sefer", roles: ["customer_user"], query: z.object({ pallets: z.string().optional() }), response: looseResponse },
  { method: "POST", path: "/customer/trips/{id}/quote", summary: "Fiyat ve uygunluk teklifi (yazmaz)", tag: "Müşteri sefer", roles: ["customer_user"], body: quoteInput, response: looseResponse, idempotent: true },
  { method: "POST", path: "/customer/reservations", summary: "Rezervasyon oluştur (blokaj + provizyon)", tag: "Müşteri rezervasyon", roles: ["customer_user"], body: reservationInput, response: looseResponse, status: 201, idempotent: true },
  { method: "GET", path: "/customer/reservations", summary: "Rezervasyonlarım", tag: "Müşteri rezervasyon", roles: ["customer_user"], response: itemsResponse },
  { method: "GET", path: "/customer/reservations/{id}", summary: "Rezervasyon ayrıntı", tag: "Müşteri rezervasyon", roles: ["customer_user"], response: looseResponse },
  { method: "GET", path: "/customer/reservations/{id}/cancel-preview", summary: "İptal önizleme", tag: "Müşteri rezervasyon", roles: ["customer_user"], response: looseResponse },
  { method: "POST", path: "/customer/reservations/{id}/cancel", summary: "Rezervasyon iptal", tag: "Müşteri rezervasyon", roles: ["customer_user"], body: cancelInput, response: looseResponse, idempotent: true },
  { method: "PUT", path: "/customer/reservations/{id}/recipients", summary: "Yetkili alıcıları güncelle (en çok 3, TESLIM'e kadar)", tag: "Müşteri rezervasyon", roles: ["customer_user"], body: recipientsInput, response: looseResponse, idempotent: true },
  { method: "GET", path: "/customer/orders/{orderNumber}/tracking", summary: "Sipariş takibi", tag: "Müşteri rezervasyon", roles: ["customer_user"], response: looseResponse },
  { method: "GET", path: "/carrier/trips", summary: "Seferler", tag: "Taşıyıcı sefer", roles: CARRIER_ALL, query: z.object({ status: z.string().optional() }), response: itemsResponse },
  { method: "POST", path: "/carrier/trips", summary: "Sefer oluştur (aracım var, yük ekle)", tag: "Taşıyıcı sefer", roles: ["carrier_admin", "carrier_planner"], body: tripCreateInput, response: looseResponse, status: 201, idempotent: true },
  { method: "GET", path: "/carrier/trips/{id}", summary: "Sefer ve rezervasyonlar", tag: "Taşıyıcı sefer", roles: CARRIER_ALL, response: looseResponse },
  { method: "POST", path: "/carrier/trips/{id}/status", summary: "Sefer yayınla/kapat/iptal", tag: "Taşıyıcı sefer", roles: ["carrier_admin", "carrier_planner"], body: tripStatusInput, response: looseResponse, idempotent: true },
  { method: "POST", path: "/carrier/reservations/{id}/decision", summary: "Talebi onayla/reddet", tag: "Taşıyıcı sefer", roles: ["carrier_admin", "carrier_planner"], body: decisionInput, response: looseResponse, idempotent: true },
  { method: "POST", path: "/carrier/reservations/{id}/events", summary: "Depo/sefer olayı", tag: "Taşıyıcı sefer", roles: CARRIER_ALL, body: reservationEventInput, response: looseResponse, idempotent: true },
  { method: "POST", path: "/carrier/reservations/{id}/review", summary: "Ölçüm farkı incelemesi: kısmi kabul (accept_partial + acceptedPallets) veya depoda ret (reject)", tag: "Taşıyıcı sefer", roles: CARRIER_ALL, body: reviewInput, response: looseResponse, idempotent: true },
  { method: "POST", path: "/carrier/reservations/{id}/pod-upload-url", summary: "e-POD fotoğraf/imza için S3 yükleme URL'si", tag: "Taşıyıcı sefer", roles: CARRIER_ALL, body: podUploadInput, response: podUploadResponse, idempotent: true },
  { method: "PUT", path: "/carrier/trips/{id}", summary: "Seferi düzenle (araç/kapasite) ve bekleyen talepleri yeniden değerlendir; If-Match: sürüm", tag: "Taşıyıcı sefer", roles: ["carrier_admin", "carrier_planner"], body: tripUpdateInput, response: looseResponse, idempotent: true, ifMatch: true },
  { method: "GET", path: "/carrier/dashboard", summary: "Sefer panosu", tag: "Taşıyıcı sefer", roles: CARRIER_ALL, query: z.object({ tripId: z.string().optional() }), response: looseResponse },
  { method: "POST", path: "/carrier/integrations/tms/trips", summary: "TMS sefer yayını (taslak sefer oluşturur; externalTripNo ile idempotent)", tag: "Entegrasyon", roles: ["carrier_admin", "carrier_planner"], body: tmsTripInput, response: looseResponse, status: 201, idempotent: true },
  { method: "POST", path: "/warehouse/integrations/wms/pallet-events", summary: "WMS palet olayı (tüm paletler bildirilince rezervasyon olayı uygulanır)", tag: "Entegrasyon", roles: CARRIER_ALL, body: wmsPalletEventInput, response: looseResponse, idempotent: true },
  { method: "GET", path: "/notifications", summary: "Uygulama içi bildirimler (kiracı ve role göre)", tag: "Bildirim", roles: [...CARRIER_ALL, "customer_user"], query: z.object({ unread: z.enum(["true", "false", "1", "0"]).optional() }), response: looseResponse },
  { method: "POST", path: "/notifications/read-all", summary: "Tüm bildirimleri okundu işaretle (idempotent)", tag: "Bildirim", roles: [...CARRIER_ALL, "customer_user"], response: looseResponse, idempotent: true },
  { method: "POST", path: "/notifications/{id}/read", summary: "Bildirimi okundu işaretle (idempotent)", tag: "Bildirim", roles: [...CARRIER_ALL, "customer_user"], response: looseResponse, idempotent: true },
  { method: "GET", path: "/carrier/integrations/status", summary: "Olay yayın durumu", tag: "Entegrasyon", roles: CARRIER_ALL, response: integrationStatusResponse },
  { method: "POST", path: "/carrier/integrations/events/flush", summary: "Bekleyen olayları şimdi yayınla", tag: "Entegrasyon", roles: ["carrier_admin", "carrier_planner"], response: looseResponse , idempotent: true },
  { method: "GET", path: "/carrier/agent-traces", summary: "Asistan işlem izi: sohbet turları, araç çağrıları ve correlationId ile eşleşen denetim kayıtları (taşıyıcı: kendi kiracısı; platform: tümü)", tag: "Asistan", roles: [...READ_CARRIER], query: z.object({ limit: z.string().optional() }), response: looseResponse },
  { method: "POST", path: "/agent/turns/{correlationId}/complete", summary: "Sohbet turunu tamamla (gecikme, yanıt uzunluğu, başarı); yalnız çağıranın kendi turuna yazar", tag: "Asistan", roles: "any-authenticated", body: z.object({ latencyMs: z.number().int().min(0), replyChars: z.number().int().min(0), ok: z.boolean(), sessionId: z.string().optional() }), response: looseResponse, idempotent: true },
  { method: "GET", path: "/carrier/exceptions", summary: "İstisna iş kuyruğu (gelmeme, hasar, geç bırakma, ölçüm farkı, teslim alınmama...)", tag: "İstisnalar", roles: CARRIER_ALL, query: z.object({ status: z.enum(["open", "resolved"]).optional(), tripId: z.string().uuid().optional() }), response: looseResponse },
  { method: "POST", path: "/carrier/exceptions/{id}/resolve", summary: "İstisnayı çözüldü işaretle (idempotent, denetim kaydı)", tag: "İstisnalar", roles: CARRIER_ALL, body: z.object({ note: z.string().min(1).max(500) }), response: looseResponse, idempotent: true },
  { method: "GET", path: "/carrier/trips/{id}/manifest", summary: "Sefer manifestosu (onaylı+ rezervasyonlar, palet kodları, alıcılar)", tag: "İstisnalar", roles: CARRIER_ALL, response: looseResponse },
  { method: "GET", path: "/carrier/kpis", summary: "KPI panosu: huni, karar süresi, zamanında bırakma/teslim, hasar, gelmeme, doluluk (palet/kg/m³), gelir-katkı; her metrik {value, numerator, denominator, formula}", tag: "KPI", roles: [...READ_CARRIER], query: z.object({ from: z.string().optional(), to: z.string().optional() }), response: looseResponse },
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
