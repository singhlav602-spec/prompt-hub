// GET /blog-post?slug=... (replaces the old /blog-post.html route — see
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
      'SELECT title, excerpt FROM blog_posts WHERE slug = ? LIMIT 1'
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

  const description = row.excerpt || row.title;

  return injectSeoTags(assetResponse, {
    url: `${DOMAIN}/blog-post?slug=${encodeURIComponent(slug)}`,
    title: `${row.title} — SmartPrompts Blog`,
    ogTitle: `${row.title} — SmartPrompts Blog`,
    description,
  });
}
