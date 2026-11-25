import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildOpenApiDocument } from "./openapi";

describe("OpenAPI", () => {
  it("üretilir ve tüm yazma uçları Idempotency-Key başlığı ister", () => {
    const doc = buildOpenApiDocument();
    for (const [path, ops] of Object.entries(doc.paths ?? {})) {
      for (const [method, op] of Object.entries(ops as Record<string, { parameters?: { name: string; in: string }[] }>)) {
        if (method === "get") continue;
        if (path === "/customer/shipments/estimate-pallets") continue; // kayıt yazmaz
        expect(op.parameters?.some((p) => p.in === "header" && p.name === "idempotency-key"), `${method} ${path}`).toBe(true);
      }
    }
  });
  it("depodaki openapi.json güncel (npm run openapi -w @cargopact/contracts)", () => {
    const committed = JSON.parse(readFileSync(new URL("../openapi.json", import.meta.url), "utf8"));
    const fresh = buildOpenApiDocument();
    expect({ ...committed, servers: [] }).toEqual({ ...fresh, servers: [] });
  });
});
