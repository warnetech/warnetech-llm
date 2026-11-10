import { describe, expect, it } from 'vitest';
import { proxyChat, validateChatBody } from '../src/chat';

const originEnv = {
  ORIGIN_URL: 'https://llm-origin.example.test',
  ORIGIN_ACCESS_CLIENT_ID: 'id-123',
  ORIGIN_ACCESS_CLIENT_SECRET: 'secret-456',
};
const allowAll = { limit: async () => ({ success: true }) };
const env = { ...originEnv, CHAT_LIMIT: allowAll };

function chatRequest(body: unknown): Request {
  return new Request('https://warnetech-llm.warnetwork.cloud/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('validateChatBody', () => {
  it('accepts a well-formed message list', () => {
    const r = validateChatBody({ messages: [{ role: 'user', content: 'Is the sun hot?' }] });
    expect(r).toEqual({ ok: true, messages: [{ role: 'user', content: 'Is the sun hot?' }] });
  });
  it('rejects a missing messages array', () => {
    expect(validateChatBody({})).toEqual({ ok: false, error: 'messages_required' });
  });
  it('rejects an unknown role', () => {
    const r = validateChatBody({ messages: [{ role: 'tool', content: 'x' }] });
    expect(r).toEqual({ ok: false, error: 'invalid_message' });
  });
  it('rejects empty content', () => {
    const r = validateChatBody({ messages: [{ role: 'user', content: '   ' }] });
    expect(r).toEqual({ ok: false, error: 'invalid_message' });
  });
  it('rejects more than 50 messages', () => {
    const many = Array.from({ length: 51 }, () => ({ role: 'user', content: 'hi' }));
    expect(validateChatBody({ messages: many })).toEqual({ ok: false, error: 'too_many_messages' });
  });
});

describe('proxyChat', () => {
  it('returns 503 not_configured when ORIGIN_URL is unset', async () => {
    const res = await proxyChat(chatRequest({ messages: [{ role: 'user', content: 'hi' }] }), {});
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'not_configured' });
  });

  it('returns 400 for an invalid body without calling the origin', async () => {
    let called = false;
    const fake = (async () => { called = true; return new Response('x'); }) as typeof fetch;
    const res = await proxyChat(chatRequest({ messages: 'nope' }), env, fake);
    expect(res.status).toBe(400);
    expect(called).toBe(false);
  });

  it('forwards to the origin with Access service-token headers and streams the body back', async () => {
    let seenUrl = '';
    let seenHeaders: Headers | undefined;
    const fake = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seenUrl = String(input);
      seenHeaders = new Headers(init?.headers);
      return new Response('data: {"ok":true}\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }) as typeof fetch;
    const res = await proxyChat(chatRequest({ messages: [{ role: 'user', content: 'hi' }] }), env, fake);
    expect(seenUrl).toBe('https://llm-origin.example.test/v1/chat/completions');
    expect(seenHeaders?.get('CF-Access-Client-Id')).toBe('id-123');
    expect(seenHeaders?.get('CF-Access-Client-Secret')).toBe('secret-456');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    expect(await res.text()).toBe('data: {"ok":true}\n\n');
  });

  it('returns 503 origin_offline when the origin cannot be reached', async () => {
    const fake = (async () => { throw new TypeError('fetch failed'); }) as typeof fetch;
    const res = await proxyChat(chatRequest({ messages: [{ role: 'user', content: 'hi' }] }), env, fake);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'origin_offline' });
  });
});

describe('public access limits', () => {
  const limiter = (success: boolean, seen: string[] = []) => ({
    limit: async ({ key }: { key: string }) => {
      seen.push(key);
      return { success };
    },
  });

  it('returns 429 when the per-IP limit is exceeded, before reading the body', async () => {
    const req = new Request('https://warnetech-llm.warnetwork.cloud/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.7' },
      body: 'not json',
    });
    const res = await proxyChat(req, { ...env, CHAT_LIMIT: limiter(false) }, (async () => new Response('x')) as typeof fetch);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'rate_limited' });
  });

  it('keys the limit on the caller IP', async () => {
    const seen: string[] = [];
    const req = new Request('https://warnetech-llm.warnetwork.cloud/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.7' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
    });
    const fake = (async () => new Response('ok')) as typeof fetch;
    await proxyChat(req, { ...env, CHAT_LIMIT: limiter(true, seen) }, fake);
    expect(seen).toEqual(['203.0.113.7']);
  });

  it('returns 503 not_configured when the limiter binding is missing', async () => {
    const res = await proxyChat(chatRequest({ messages: [{ role: 'user', content: 'hi' }] }), originEnv, (async () => new Response('x')) as typeof fetch);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'not_configured' });
  });

  it('rejects a conversation over the total size cap', async () => {
    const big = 'a'.repeat(8001);
    const res = await proxyChat(chatRequest({ messages: [{ role: 'user', content: big }] }), { ...env, CHAT_LIMIT: limiter(true) }, (async () => new Response('x')) as typeof fetch);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'too_long' });
  });
});
