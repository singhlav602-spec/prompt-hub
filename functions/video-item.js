// GET /video-item?slug=... (replaces the old /video-item.html route — see
// prompt.js for why the extensionless form and the server-side tag
// injection below both matter).
import { injectSeoTags } from './_seo.js';

const DOMAIN = 'https://smart-prompt.in';

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug');

  const assetResponse = await env.ASSETS.fetch(request);

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
      'SELECT title FROM video_items WHERE slug = ? LIMIT 1'
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

  const description = `AI-generated video: ${row.title}. Includes the exact prompt used to create it.`;

  return injectSeoTags(assetResponse, {
    url: `${DOMAIN}/video-item?slug=${encodeURIComponent(slug)}`,
    title: `${row.title} — SmartPrompts Videos`,
    ogTitle: `${row.title} — SmartPrompts Videos`,
    description,
  });
}
