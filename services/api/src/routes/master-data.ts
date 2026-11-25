import type pg from "pg";
import { z } from "zod";
import {
  carrierProductClassesInput, estimatePalletsInput, facilityInput, packagingTypeInput, productClassInput,
  vehicleInput, vehicleTypeInput, type EstimatePalletsResponse, type Role,
} from "@cargopact/contracts";
import { estimatePallets, isValidTrPlate, normalizePlate } from "@cargopact/domain";
import { audit } from "../lib/audit";
import { PLATFORM_TENANT_ID, requireRole, type AuthContext } from "../lib/auth";
import { camelRow, forbidden, ok, validation, type Req, type Res } from "../lib/http";
import { idempotent } from "../lib/idempotency";
import { carrierOwner, platformOwner, resourceHandlers, type ResourceDef } from "../lib/resource";

export type Handler = (ctx: AuthContext, req: Req) => Promise<Res>;
export interface Route { method: string; pattern: string; handler: Handler }

const CARRIER_ALL: readonly Role[] = ["carrier_admin", "carrier_planner", "carrier_warehouse"];
const READ_CARRIER: readonly Role[] = [...CARRIER_ALL, "platform_admin", "admin_viewer"];
const READ_ALL: readonly Role[] = [...READ_CARRIER, "customer_user"];

const own = (ctx: AuthContext) => [ctx.tenantId];
const ownPlusPlatform = (ctx: AuthContext) => [ctx.tenantId, PLATFORM_TENANT_ID];
const platformOnly = () => [PLATFORM_TENANT_ID];
/** Katalog okuma: platform kataloğu + (taşıyıcı kullanıcı) kendi kayıtları + (müşteri) ?carrierId ile aktif taşıyıcının kayıtları. */
const catalogOwners = (ctx: AuthContext, req: Req) => {
  const ids = [PLATFORM_TENANT_ID];
  if (ctx.tenantType === "carrier") ids.push(ctx.tenantId);
  if (req.query.carrierId && z.string().uuid().safeParse(req.query.carrierId).success) ids.push(req.query.carrierId);
  return ids;
};

export function masterDataRoutes(pool: pg.Pool): Route[] {
  const visible = async (c: pg.PoolClient, table: "vehicle_types" | "packaging_types" | "product_classes", id: string, ctx: AuthContext) => {
    const { rows } = await c.query(`select * from ${table} where id = $1 and tenant_id = any($2::uuid[]) and status = 'active'`, [id, [ctx.tenantId, PLATFORM_TENANT_ID]]);
    if (rows.length === 0) throw validation("Seçilen kayıt bulunamadı veya aktif değil.", { table, id });
    return rows[0];
  };

  const facilities: ResourceDef<z.infer<typeof facilityInput>> = {
    entity: "facility", table: "facilities", ownerCol: "carrier_id", schema: facilityInput,
    toRow: (i) => ({
      code: i.code, name: i.name, kind: i.kind, city: i.city, district: i.district, address: i.address,
      latitude: i.latitude, longitude: i.longitude, timezone: i.timezone, opening_hours: i.openingHours,
      intake_window: i.intakeWindow, pickup_window: i.pickupWindow, daily_slot_limit: i.dailySlotLimit,
      contact_name: i.contactName, contact_phone: i.contactPhone,
    }),
    jsonCols: ["opening_hours", "intake_window", "pickup_window"],
    readRoles: READ_CARRIER, writeRoles: ["carrier_admin"], writeOwner: carrierOwner,
    readOwners: (ctx) => (ctx.tenantType === "platform" ? [] : own(ctx)),
  };

  const vehicleTypeDef = (scope: "carrier" | "platform"): ResourceDef<z.infer<typeof vehicleTypeInput>> => ({
    entity: "vehicle_type", table: "vehicle_types", ownerCol: "tenant_id", schema: vehicleTypeInput,
    toRow: (i) => ({
      code: i.code, name: i.name, pallet_positions: i.palletPositions, max_payload_kg: i.maxPayloadKg, cargo_volume_m3: i.cargoVolumeM3,
      inner_length_mm: i.innerLengthMm, inner_width_mm: i.innerWidthMm, inner_height_mm: i.innerHeightMm,
    }),
    readRoles: scope === "carrier" ? READ_CARRIER : READ_ALL,
    writeRoles: scope === "carrier" ? ["carrier_admin"] : ["platform_admin"],
    writeOwner: scope === "carrier" ? carrierOwner : platformOwner,
    readOwners: scope === "carrier" ? ownPlusPlatform : scope === "platform" ? platformOnly : catalogOwners,
  });

  const vehicles: ResourceDef<z.infer<typeof vehicleInput>> = {
    entity: "vehicle", table: "vehicles", ownerCol: "carrier_id", schema: vehicleInput,
    toRow: (i) => {
      if (!isValidTrPlate(i.plate)) throw validation("Plaka biçimi geçersiz (ör. 41 ABC 123).");
      return { vehicle_type_id: i.vehicleTypeId, plate: normalizePlate(i.plate), status: i.vehicleStatus, driver_name: i.driverName, driver_phone: i.driverPhone };
    },
    readRoles: READ_CARRIER, writeRoles: ["carrier_admin"], writeOwner: carrierOwner,
    readOwners: (ctx) => (ctx.tenantType === "platform" ? [] : own(ctx)),
    validate: async (c, ctx, i) => { await visible(c, "vehicle_types", i.vehicleTypeId, ctx); },
  };

  const packagingDef = (scope: "carrier" | "platform" | "catalog"): ResourceDef<z.infer<typeof packagingTypeInput>> => ({
    entity: "packaging_type", table: "packaging_types", ownerCol: "tenant_id", schema: packagingTypeInput as never,
    toRow: (i) => ({
      code: i.code, name: i.name, kind: i.kind, length_mm: i.lengthMm, width_mm: i.widthMm, height_mm: i.heightMm,
      max_gross_kg: i.maxGrossKg, usable_volume_m3: i.usableVolumeM3, fill_factor: i.fillFactor,
    }),
    readRoles: scope === "carrier" ? READ_CARRIER : READ_ALL,
    writeRoles: scope === "platform" ? ["platform_admin"] : ["carrier_admin"],
    writeOwner: scope === "platform" ? platformOwner : carrierOwner,
    readOwners: scope === "carrier" ? ownPlusPlatform : scope === "platform" ? platformOnly : catalogOwners,
  });

  const productClassDef = (scope: "platform" | "catalog"): ResourceDef<z.infer<typeof productClassInput>> => ({
    entity: "product_class", table: "product_classes", ownerCol: "tenant_id", schema: productClassInput,
    toRow: (i) => ({ code: i.code, name: i.name, special_handling: i.specialHandling }),
    readRoles: READ_ALL, writeRoles: ["platform_admin"], writeOwner: platformOwner,
    readOwners: scope === "platform" ? platformOnly : catalogOwners,
  });

  const fac = resourceHandlers(facilities, pool);
  const vtCarrier = resourceHandlers(vehicleTypeDef("carrier"), pool);
  const vtPlatform = resourceHandlers(vehicleTypeDef("platform"), pool);
  const vtCatalog = resourceHandlers({ ...vehicleTypeDef("platform"), readOwners: catalogOwners, readRoles: READ_ALL }, pool);
  const veh = resourceHandlers(vehicles, pool);
  const pkCarrier = resourceHandlers(packagingDef("carrier"), pool);
  const pkPlatform = resourceHandlers(packagingDef("platform"), pool);
  const pkCatalog = resourceHandlers(packagingDef("catalog"), pool);
  const pcPlatform = resourceHandlers(productClassDef("platform"), pool);
  const pcCatalog = resourceHandlers(productClassDef("catalog"), pool);

  const crud = (base: string, h: ReturnType<typeof resourceHandlers>): Route[] => [
    { method: "GET", pattern: base, handler: h.list },
    { method: "POST", pattern: base, handler: h.create },
    { method: "GET", pattern: `${base}/{id}`, handler: h.get },
    { method: "PUT", pattern: `${base}/{id}`, handler: h.update },
    { method: "PATCH", pattern: `${base}/{id}/status`, handler: h.setStatus },
  ];
  const readOnly = (base: string, h: ReturnType<typeof resourceHandlers>): Route[] => [
    { method: "GET", pattern: base, handler: h.list },
    { method: "GET", pattern: `${base}/{id}`, handler: h.get },
  ];

  const carrierProductClasses: Handler = async (ctx) => {
    requireRole(ctx, READ_ALL);
    if (ctx.tenantType !== "carrier") throw forbidden();
    const { rows } = await pool.query(
      `select p.id, p.code, p.name, p.special_handling, coalesce(cp.accepted, true) as accepted
         from product_classes p left join carrier_product_classes cp on cp.product_class_id = p.id and cp.carrier_id = $1
        where p.tenant_id = $2 and p.status = 'active' order by p.code`,
      [ctx.tenantId, PLATFORM_TENANT_ID],
    );
    return ok({ items: rows.map(camelRow) });
  };

  const putCarrierProductClasses: Handler = async (ctx, req) => {
    requireRole(ctx, ["carrier_admin"]);
    if (ctx.tenantType !== "carrier") throw forbidden();
    const input = carrierProductClassesInput.parse(req.body);
    return idempotent(pool, ctx, "carrier_product_classes.put", req.headers["idempotency-key"], input, async (c) => {
      for (const it of input.accepted) await visible(c, "product_classes", it.productClassId, ctx);
      const before = (await c.query("select product_class_id, accepted from carrier_product_classes where carrier_id = $1", [ctx.tenantId])).rows.map(camelRow);
      for (const it of input.accepted) {
        await c.query(
          "insert into carrier_product_classes (carrier_id, product_class_id, accepted) values ($1,$2,$3) on conflict (carrier_id, product_class_id) do update set accepted = excluded.accepted",
          [ctx.tenantId, it.productClassId, it.accepted],
        );
      }
      await audit(c, ctx, { action: "carrier_product_classes.put", entityType: "carrier_product_classes", entityId: ctx.tenantId, before, after: input.accepted });
      return ok({ updated: input.accepted.length });
    });
  };

  const estimate: Handler = async (ctx, req) => {
    requireRole(ctx, ["customer_user"]);
    const input = estimatePalletsInput.parse(req.body);
    const ids = [input.palletTypeId, ...input.cartons.map((c) => c.packagingTypeId)];
    const { rows } = await pool.query("select * from packaging_types where id = any($1::uuid[]) and status = 'active' and tenant_id = $2", [ids, PLATFORM_TENANT_ID]);
    const byId = new Map(rows.map((r) => [r.id as string, r]));
    const pallet = byId.get(input.palletTypeId);
    if (!pallet || pallet.kind !== "pallet") throw validation("palletTypeId aktif bir palet tipi olmalı.");
    const lines = input.cartons.map((c) => {
      const k = byId.get(c.packagingTypeId);
      if (!k || k.kind !== "carton") throw validation("cartons yalnız aktif koli tiplerini içerebilir.", { packagingTypeId: c.packagingTypeId });
      return { count: c.count, lengthMm: k.length_mm, widthMm: k.width_mm, heightMm: k.height_mm, unitWeightKg: k.max_gross_kg };
    });
    const r: EstimatePalletsResponse = estimatePallets(
      { usableVolumeM3: pallet.usable_volume_m3, fillFactor: pallet.fill_factor, maxGrossKg: pallet.max_gross_kg }, lines,
    );
    return ok(r);
  };

  return [
    ...crud("/carrier/facilities", fac),
    ...crud("/carrier/vehicle-types", vtCarrier),
    ...crud("/carrier/vehicles", veh),
    ...crud("/carrier/packaging-types", pkCarrier),
    { method: "GET", pattern: "/carrier/product-classes", handler: carrierProductClasses },
    { method: "PUT", pattern: "/carrier/product-classes", handler: putCarrierProductClasses },
    ...readOnly("/catalog/vehicle-types", vtCatalog),
    ...readOnly("/catalog/packaging-types", pkCatalog),
    ...readOnly("/catalog/product-classes", pcCatalog),
    ...crud("/platform/catalog/vehicle-types", vtPlatform),
    ...crud("/platform/catalog/packaging-types", pkPlatform),
    ...crud("/platform/catalog/product-classes", pcPlatform),
    { method: "POST", pattern: "/customer/shipments/estimate-pallets", handler: estimate },
  ];
}
