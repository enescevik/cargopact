import { ERROR_CODES, type ErrorCode } from "@cargopact/contracts";
import { ConflictError } from "@cargopact/db";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public readonly code: ErrorCode, message: string, public readonly details?: unknown) {
    super(message);
  }
  get status(): number { return ERROR_CODES[this.code]; }
}

export const notFound = (what = "Kayıt") => new HttpError("NOT_FOUND", `${what} bulunamadı.`);
export const forbidden = (msg = "Bu işlem için yetkiniz yok.") => new HttpError("FORBIDDEN", msg);
export const validation = (msg: string, details?: unknown) => new HttpError("VALIDATION_ERROR", msg, details);

export interface Req {
  method: string;
  path: string;
  params: Record<string, string>;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: unknown;
  claims: Record<string, unknown>;
  correlationId: string;
  sourceIp?: string;
}
export interface Res { status: number; body?: unknown; headers?: Record<string, string> }
export const ok = (body: unknown, status = 200): Res => ({ status, body });

/** Beklenmeyen hataları güvenli yanıta çevirir (iç ayrıntı sızdırmaz). */
export function toErrorResponse(e: unknown, correlationId: string): Res {
  if (e instanceof HttpError) {
    return { status: e.status, body: { code: e.code, message: e.message, correlationId, details: e.details } };
  }
  if (e instanceof ZodError) {
    return { status: 400, body: { code: "VALIDATION_ERROR", message: "Geçersiz istek.", correlationId, details: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } };
  }
  if (e instanceof ConflictError) {
    return { status: 409, body: { code: "CONFLICT", message: e.message, correlationId } };
  }
  const pgCode = (e as { code?: string })?.code;
  if (pgCode === "23505") return { status: 409, body: { code: "CONFLICT", message: "Bu kayıt zaten mevcut.", correlationId } };
  if (pgCode === "23503") return { status: 409, body: { code: "CONFLICT", message: "Kayıt başka kayıtlarla ilişkili veya ilişkili kayıt bulunamadı.", correlationId } };
  if (pgCode === "23514") return { status: 400, body: { code: "VALIDATION_ERROR", message: "Değer kısıtı ihlali.", correlationId } };
  console.error(JSON.stringify({ level: "error", correlationId, message: (e as Error)?.message, stack: (e as Error)?.stack }));
  return { status: 500, body: { code: "INTERNAL", message: "Beklenmeyen bir hata oluştu.", correlationId } };
}

export const camel = (s: string): string => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
export function camelRow<T = Record<string, unknown>>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[camel(k)] = v instanceof Date ? v.toISOString() : v;
  return out as T;
}
