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
  const sessionId =
    typeof req.sessionId === "string" && req.sessionId.length >= 33 && req.sessionId.length <= 128
      ? req.sessionId
      : `sess-${randomUUID()}`;

  const res = await client.send(
    new InvokeAgentRuntimeCommand({
      agentRuntimeArn: arn,
      runtimeSessionId: sessionId,
      runtimeUserId: userId,
      contentType: "application/json",
      accept: "application/json",
      payload: new TextEncoder().encode(JSON.stringify({ prompt: message, userId })),
    }),
  );
  const text = (await res.response?.transformToString()) ?? "";
  let reply = text;
  try {
    const parsed = JSON.parse(text);
    reply = typeof parsed === "string" ? parsed : (parsed.result ?? parsed.reply ?? text);
  } catch {
    /* düz metin */
  }
  const body: ChatResponse = { sessionId, reply: String(reply) };
  return json(200, body);
};
