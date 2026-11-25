import { AuthenticationDetails, CognitoUser, CognitoUserPool } from "amazon-cognito-identity-js";

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");
const pool = new CognitoUserPool({
  UserPoolId: process.env.EXPO_PUBLIC_COGNITO_USER_POOL_ID ?? "us-east-1_6KUOjpqWj",
  ClientId: process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID ?? "72hnkn87h160or9j2ilo8f8dhl",
});

let cognitoUser: CognitoUser | null = null;
let idToken = "";

export function signIn(email: string, password: string): Promise<string> {
  const user = new CognitoUser({ Username: email, Pool: pool });
  return new Promise((resolve, reject) =>
    user.authenticateUser(new AuthenticationDetails({ Username: email, Password: password }), {
      onSuccess: (s) => {
        cognitoUser = user;
        idToken = s.getIdToken().getJwtToken();
        resolve(idToken);
      },
      onFailure: reject,
    }),
  );
}

export function signOut() {
  try { cognitoUser?.signOut(); } catch { /* yoksay */ }
  cognitoUser = null;
  idToken = "";
}

function freshToken(): Promise<string> {
  const u = cognitoUser;
  if (!u) return Promise.resolve(idToken);
  return new Promise((resolve) =>
    u.getSession((err: Error | null, s: { getIdToken(): { getJwtToken(): string } } | null) => {
      if (!err && s) idToken = s.getIdToken().getJwtToken();
      resolve(idToken);
    }),
  );
}

export function uuid(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === "x" ? r : (r & 3) | 8).toString(16);
  });
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string, public reason?: string) {
    super(message);
  }
}

export async function api<T>(method: "GET" | "POST" | "PUT", path: string, body?: unknown, idemKey?: string): Promise<T> {
  const token = await freshToken();
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (method !== "GET") headers["idempotency-key"] = idemKey ?? uuid();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError("Sunucuya ulaşılamadı. Bağlantınızı kontrol edin.", 0);
  }
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* json değil */ }
  if (!res.ok) {
    const d = (data ?? {}) as { code?: string; message?: string; error?: string; details?: { reason?: string } };
    throw new ApiError(d.message ?? d.error ?? `İstek başarısız (HTTP ${res.status})`, res.status, d.code, d.details?.reason);
  }
  return data as T;
}
