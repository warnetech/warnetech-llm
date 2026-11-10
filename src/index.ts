import { proxyChat, type ChatEnv } from './chat';

export interface Env extends ChatEnv {
  ASSETS: Fetcher;
  APP_ORIGIN: string;
}

export function healthBody(model: string | null): { ok: true; model: string | null } {
  return { ok: true, model };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/health' && request.method === 'GET') {
      return Response.json(healthBody(null));
    }
    if (url.pathname === '/api/chat' && request.method === 'POST') {
      return proxyChat(request, env);
    }
    if (url.pathname.startsWith('/api/')) {
      return Response.json({ error: 'not_found' }, { status: 404 });
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
