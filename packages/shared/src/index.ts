/** Web, mobil ve API arasındaki ortak sözleşme. */

export interface ChatRequest {
  /** Kullanıcı mesajı (1..4000 karakter). */
  message: string;
  /** Aynı konuşmayı sürdürmek için oturum kimliği (en az 33 karakter, AgentCore şartı). */
  sessionId?: string;
}

export interface ChatResponse {
  sessionId: string;
  reply: string;
}

export interface ApiError {
  error: string;
}

export const MAX_MESSAGE_LENGTH = 4000;

export function newSessionId(): string {
  // AgentCore runtimeSessionId en az 33 karakter olmalıdır.
  return `sess-${crypto.randomUUID()}`;
}
