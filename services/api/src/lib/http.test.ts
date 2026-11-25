import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ConflictError } from "@cargopact/db";
import { camelRow, HttpError, toErrorResponse } from "./http";

describe("hata modeli", () => {
  const cid = "cid-1";
  it("HttpError kod ve durum döner", () => {
    const r = toErrorResponse(new HttpError("FORBIDDEN", "yok"), cid);
    expect(r).toMatchObject({ status: 403, body: { code: "FORBIDDEN", correlationId: cid } });
  });
  it("zod hatası 400 + alan yolu", () => {
    const e = z.object({ a: z.number() }).safeParse({ a: "x" });
    const r = toErrorResponse(e.error, cid);
    expect(r.status).toBe(400);
    expect((r.body as { details: { path: string }[] }).details[0].path).toBe("a");
  });
  it("PG kısıt kodları eşlenir", () => {
    expect(toErrorResponse({ code: "23505" }, cid).status).toBe(409);
    expect(toErrorResponse({ code: "23503" }, cid).status).toBe(409);
    expect(toErrorResponse({ code: "23514" }, cid).status).toBe(400);
    expect(toErrorResponse(new ConflictError(), cid).status).toBe(409);
  });
  it("beklenmeyen hata iç ayrıntı sızdırmaz", () => {
    const r = toErrorResponse(new Error("password=secret"), cid);
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain("secret");
  });
  it("camelRow anahtarları çevirir, tarihi ISO yapar", () => {
    expect(camelRow({ carrier_id: "x", created_at: new Date("2026-01-01T00:00:00Z") })).toEqual({ carrierId: "x", createdAt: "2026-01-01T00:00:00.000Z" });
  });
});
