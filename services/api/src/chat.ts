import { BedrockAgentCoreClient, InvokeAgentRuntimeCommand } from "@aws-sdk/client-bedrock-agentcore";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { MAX_MESSAGE_LENGTH, type ChatRequest, type ChatResponse } from "@cargopact/contracts";
import { randomUUID } from "node:crypto";

const client = new BedrockAgentCoreClient({});
const json = (statusCode: number, body: unknown): APIGatewayProxyResultV2 => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> => {
  const arn = process.env.AGENT_RUNTIME_ARN;
  if (!arn) return json(503, { error: "Agent runtime henüz yapılandırılmadı." });

  let req: ChatRequest;
  try {
    req = JSON.parse(event.body ?? "{}");
  } catch {
    return json(400, { error: "Geçersiz JSON." });
  }
  const message = typeof req.message === "string" ? req.message.trim() : "";
  if (!message || message.length > MAX_MESSAGE_LENGTH) {
    return json(400, { error: `message 1-${MAX_MESSAGE_LENGTH} karakter olmalı.` });
  }
  const userId = event.requestContext.authorizer.jwt.claims.sub as string;
  // İzleme kimliği: geçerli x-correlation-id başlığı, yoksa API Gateway requestId (her tur için benzersiz).
  const hdr = event.headers?.["x-correlation-id"] ?? event.headers?.["X-Correlation-Id"] ?? "";
  // API Gateway requestId '=' içerebilir; URL/başlık güvenli karakterlere indirgenir.
  const rid = (event.requestContext.requestId ?? "").replace(/[^A-Za-z0-9._-]/g, "").slice(0, 64);
  const correlationId = /^[A-Za-z0-9._-]{8,64}$/.test(hdr) ? hdr : rid.length >= 8 ? rid : `corr-${randomUUID()}`;
  const started = Date.now();
  const sessionId =
    typeof req.sessionId === "string" && req.sessionId.length >= 33 && req.sessionId.length <= 128
      ? req.sessionId
      : `sess-${randomUUID()}`;

  // Çağıranın ham ID token'ı; ajan araçları backend'i bu kimlikle çağırır (kiracı/rol backend'de zorlanır). Loglanmaz.
  const authHeader = event.headers?.authorization ?? event.headers?.Authorization ?? "";
  const idToken = authHeader.replace(/^Bearer\s+/i, "").trim();

  // Tur sonucunu iş API'sine bildirir (kiracı/kullanıcı token'dan türetilir). Hata sohbeti bozmaz.
  const complete = async (ok: boolean, replyChars: number) => {
    const domain = event.requestContext.domainName;
    if (!domain || !idToken) return;
    try {
      await fetch(`https://${domain}/agent/turns/${correlationId}/complete`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${idToken}`, "x-correlation-id": correlationId },
        body: JSON.stringify({ latencyMs: Date.now() - started, replyChars, ok, sessionId }),
        signal: AbortSignal.timeout(2_000),
      });
    } catch (e) {
      console.warn("turn complete failed", (e as Error)?.name);
    }
  };

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 26_000);
  let text: string;
  try {
    const res = await client.send(
      new InvokeAgentRuntimeCommand({
        agentRuntimeArn: arn,
        runtimeSessionId: sessionId,
        runtimeUserId: userId,
        contentType: "application/json",
        accept: "application/json",
        payload: new TextEncoder().encode(JSON.stringify({ prompt: message, userId, idToken, correlationId, sessionId })),
      }),
      { abortSignal: ac.signal },
    );
    text = (await res.response?.transformToString()) ?? "";
  } catch (e) {
    const aborted = (e as Error)?.name === "AbortError";
    console.error("agent invoke failed", (e as Error)?.name);
    const body: ChatResponse = {
      sessionId,
      reply: aborted
        ? "Yanıt şu an çok uzun sürdü. Lütfen sorunuzu daha kısa veya daha net sorup tekrar deneyin."
        : "Asistana şu an ulaşılamıyor. Lütfen birkaç saniye sonra tekrar deneyin.",
      correlationId,
    };
    await complete(false, body.reply.length);
    return json(200, body);
  } finally {
    clearTimeout(timer);
  }
  let reply = text;
  try {
    const parsed = JSON.parse(text);
    reply = typeof parsed === "string" ? parsed : (parsed.result ?? parsed.reply ?? text);
  } catch {
    /* düz metin */
  }
  const body: ChatResponse = { sessionId, reply: String(reply), correlationId };
  console.log(JSON.stringify({ level: "info", correlationId, sessionId, chat: "ok", ms: Date.now() - started }));
  await complete(true, body.reply.length);
  return json(200, body);
};
