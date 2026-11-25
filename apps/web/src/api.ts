import type { ChatRequest, ChatResponse } from "@cargopact/contracts";

const API_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

let token: string | null = sessionStorage.getItem("cp_token");
let onUnauthorized: (() => void) | null = null;

export function setToken(t: string | null) {
  token = t;
  if (t) sessionStorage.setItem("cp_token", t);
  else sessionStorage.removeItem("cp_token");
}
export const getToken = () => token;
export function setUnauthorizedHandler(fn: () => void) { onUnauthorized = fn; }

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public correlationId?: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
  get reason(): string | undefined {
    const r = this.details?.reason;
    return typeof r === "string" ? r : undefined;
  }
}

export async function api<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  opts: { idempotencyKey?: string; signal?: AbortSignal } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  if (method !== "GET") headers["idempotency-key"] = opts.idempotencyKey ?? crypto.randomUUID();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method, headers, signal: opts.signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError("Sunucuya ulaşılamadı. Bağlantınızı kontrol edin.", 0);
  }
  let data: any = null;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) {
    if (res.status === 401 && onUnauthorized) onUnauthorized();
    const fallback =
      res.status === 404 ? "Kaynak bulunamadı (uç nokta henüz hazır olmayabilir)."
      : res.status === 503 || res.status === 504 ? "Asistan şu an yanıt veremiyor, lütfen tekrar deneyin."
      : `Beklenmeyen hata (HTTP ${res.status}).`;
    throw new ApiError(
      data?.message ?? data?.error ?? fallback, res.status, data?.code, data?.correlationId, data?.details,
    );
  }
  return data as T;
}

export const sendChat = (req: ChatRequest) => api<ChatResponse>("POST", "/chat", req);
