import { v5 as uuidv5 } from "uuid";

/** Demo seed için sabit ad alanı; aynı doğal anahtar daima aynı UUID'yi üretir. */
export const NAMESPACE_CARGOPACT_DEMO = "6f1c8a52-2c55-4d1e-9a7e-0c1e9b2b6a10";
export const demoId = (table: string, naturalKey: string): string => uuidv5(`${table}:${naturalKey}`, NAMESPACE_CARGOPACT_DEMO);
export const PLATFORM_TENANT_ID = "00000000-0000-4000-8000-000000000001";
