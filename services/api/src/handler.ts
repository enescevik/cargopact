import { randomUUID } from "node:crypto";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { getPool } from "@cargopact/db";
import { toErrorResponse, type Req } from "./lib/http";
import { buildRouter } from "./router";
import { recordToolCall } from "./routes/traces";

let router: ReturnType<typeof buildRouter> | undefined;

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const headers = Object.fromEntries(Object.entries(event.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
  const correlationId = headers["x-correlation-id"] ?? event.requestContext?.requestId ?? randomUUID();
  const claims = ((event.requestContext as { authorizer?: { jwt?: { claims?: Record<string, unknown> } } })?.authorizer?.jwt?.claims ?? {}) as Record<string, unknown>;
  const started = Date.now();
  let status = 500;
  try {
    let body: unknown;
    if (event.body) {
      const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString() : event.body;
      try { body = JSON.parse(raw); } catch { return json(400, { code: "VALIDATION_ERROR", message: "Geçersiz JSON.", correlationId }, correlationId); }
    }
    const req: Req = {
      method: event.requestContext.http.method.toUpperCase(),
      path: event.rawPath, params: {}, query: (event.queryStringParameters ?? {}) as Record<string, string>,
      headers, body, claims, correlationId,
    };
    router ??= buildRouter(getPool());
    const res = await router(req);
    status = res.status;
    return json(res.status, res.body, correlationId, res.headers);
  } catch (e) {
    const res = toErrorResponse(e, correlationId);
    status = res.status;
    return json(res.status, res.body, correlationId);
  } finally {
    // Ajan araç çağrısı izi (yanıt sonrası, en iyi çaba; istekleri asla bozmaz).
    if (headers["x-agent-session"]) {
      await recordToolCall(getPool(), {
        correlationId, sessionId: headers["x-agent-session"], sub: String(claims.sub ?? ""), tenantHint: headers["x-tenant-id"],
        method: event.requestContext?.http?.method ?? "", path: event.rawPath, status, ms: Date.now() - started,
      });
    }
    console.log(JSON.stringify({ level: "info", correlationId, method: event.requestContext?.http?.method, path: event.rawPath, status, ms: Date.now() - started }));
  }
};

const json = (statusCode: number, body: unknown, correlationId: string, extra: Record<string, string> = {}): APIGatewayProxyResultV2 => ({
  statusCode,
  headers: { "content-type": "application/json", "x-correlation-id": correlationId, ...extra },
  body: body === undefined ? "" : JSON.stringify(body),
});
