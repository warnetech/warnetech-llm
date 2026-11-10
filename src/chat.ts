export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface ChatEnv {
  ORIGIN_URL?: string;
  ORIGIN_ACCESS_CLIENT_ID?: string;
  ORIGIN_ACCESS_CLIENT_SECRET?: string;
  CHAT_LIMIT?: RateLimiter;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

const ROLES = new Set(['user', 'assistant', 'system']);
const MAX_MESSAGES = 50;
/** Total characters across the conversation; bounds the work one request can ask the phone to do. */
const MAX_TOTAL_CHARS = 8000;
/** First token budget for the phone; slow on-device generation needs more than a web default. */
export const ORIGIN_TIMEOUT_MS = 60_000;

export type ValidationResult =
  | { ok: true; messages: ChatMessage[] }
  | { ok: false; error: 'messages_required' | 'invalid_message' | 'too_many_messages' | 'too_long' };

export function validateChatBody(body: unknown): ValidationResult {
  const messages = (body as { messages?: unknown } | null)?.messages;
  if (!Array.isArray(messages)) return { ok: false, error: 'messages_required' };
  if (messages.length > MAX_MESSAGES) return { ok: false, error: 'too_many_messages' };
  const clean: ChatMessage[] = [];
  let total = 0;
  for (const m of messages) {
    const role = (m as { role?: unknown })?.role;
    const content = (m as { content?: unknown })?.content;
    if (typeof role !== 'string' || !ROLES.has(role)) return { ok: false, error: 'invalid_message' };
    if (typeof content !== 'string' || content.trim() === '') return { ok: false, error: 'invalid_message' };
    total += content.length;
    if (total > MAX_TOTAL_CHARS) return { ok: false, error: 'too_long' };
    clean.push({ role: role as ChatMessage['role'], content });
  }
  return { ok: true, messages: clean };
}

function json(data: unknown, status: number): Response {
  return Response.json(data, { status });
}

/**
 * Forwards a chat request to the phone origin behind Cloudflare Access and
 * passes the SSE stream back. The origin is never reachable directly.
 */
export async function proxyChat(
  request: Request,
  env: ChatEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  if (!env.ORIGIN_URL || !env.ORIGIN_ACCESS_CLIENT_ID || !env.ORIGIN_ACCESS_CLIENT_SECRET || !env.CHAT_LIMIT) {
    return json({ error: 'not_configured' }, 503);
  }
  // Limit before reading the body so a flood of junk requests costs no origin work.
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const { success } = await env.CHAT_LIMIT.limit({ key: ip });
  if (!success) return json({ error: 'rate_limited' }, 429);

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return json({ error: 'invalid_message' }, 400);
  }
  const v = validateChatBody(parsed);
  if (!v.ok) return json({ error: v.error }, 400);

  let upstream: Response;
  try {
    upstream = await fetchImpl(`${env.ORIGIN_URL.replace(/\/$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'CF-Access-Client-Id': env.ORIGIN_ACCESS_CLIENT_ID,
        'CF-Access-Client-Secret': env.ORIGIN_ACCESS_CLIENT_SECRET,
      },
      body: JSON.stringify({ messages: v.messages, stream: true }),
      signal: AbortSignal.timeout(ORIGIN_TIMEOUT_MS),
    });
  } catch {
    return json({ error: 'origin_offline' }, 503);
  }
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'text/event-stream' },
  });
}
