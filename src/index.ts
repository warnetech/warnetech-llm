export interface Env {
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
    if (url.pathname.startsWith('/api/')) {
      return Response.json({ error: 'not_found' }, { status: 404 });
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
