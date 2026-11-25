import type { ChatRequest, ChatResponse } from "@cargopact/shared";

const API_URL = import.meta.env.VITE_API_URL ?? "";

export async function sendChat(token: string, req: ChatRequest): Promise<ChatResponse> {
  const res = await fetch(`${API_URL}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(req),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as ChatResponse;
}
