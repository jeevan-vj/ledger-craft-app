type PagesContext = {
  request: Request;
  env: { API_ORIGIN?: string };
};

export async function onRequest(context: PagesContext): Promise<Response> {
  const origin = context.env.API_ORIGIN;
  if (!origin) {
    return new Response('API_ORIGIN is not configured', { status: 502 });
  }

  const incoming = new URL(context.request.url);
  const target = new URL(`${incoming.pathname}${incoming.search}`, origin);
  return fetch(new Request(target, context.request));
}
