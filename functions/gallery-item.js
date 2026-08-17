// GET /gallery-item?slug=... (replaces the old /gallery-item.html route —
// see prompt.js for why the extensionless form and the server-side tag
// injection below both matter).
import { injectSeoTags } from './_seo.js';

const DOMAIN = 'https://smart-prompt.in';

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug');

  // A fresh request with only the URL — no conditional-cache headers
  // (If-None-Match / If-Modified-Since) carried over from the original.
  // Forwarding those straight to env.ASSETS.fetch() can get back an empty
  // 304 Not Modified body on repeat visits (e.g. after a back-navigation,
  // when the browser sends validators from its own cache) — and since we
  // always build a fresh 200 response below, that empty body would become
  // an empty page instead of the real one. Always asking for the full
  // asset avoids that entirely.
  const assetResponse = await env.ASSETS.fetch(new Request(url.toString(), { method: 'GET' }));

  if (!slug) {
    return new Response(assetResponse.body, {
      status: 404,
      statusText: 'Not Found',
      headers: assetResponse.headers,
    });
  }

  let row = null;
  let dbOk = true;
  try {
    row = await env.DB.prepare(
      'SELECT title FROM gallery_items WHERE slug = ? LIMIT 1'
    ).bind(slug).first();
  } catch (e) {
    dbOk = false;
  }

  if (dbOk && !row) {
    return new Response(assetResponse.body, {
      status: 404,
      statusText: 'Not Found',
      headers: assetResponse.headers,
    });
  }

  if (!row) return assetResponse;

  const description = `AI-generated image: ${row.title}. Includes the image prompt and video prompt used to create it.`;

  return injectSeoTags(assetResponse, {
    url: `${DOMAIN}/gallery-item?slug=${encodeURIComponent(slug)}`,
    title: `${row.title} — SmartPrompts Gallery`,
    ogTitle: `${row.title} — SmartPrompts Gallery`,
    description,
  });
}
