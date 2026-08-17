// GET /prompt?slug=... (replaces the old /prompt.html route — Cloudflare
// Pages 308-redirects .html URLs to their extensionless form by default, and
// the sitemap + every internal link now point straight here to avoid that
// redirect hop on every single prompt page).
//
// This function:
//  1. Returns a real HTTP 404 when the slug doesn't exist in the database,
//     instead of always returning 200 and letting client-side JS silently
//     show "Not Found" (a "soft 404" that wastes crawl budget).
//  2. Injects the correct <title>, canonical link, meta description and OG
//     tags server-side using the live DB row for this slug — see _seo.js
//     for why that matters.
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
    // No slug at all — nothing legitimate links here without one.
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
      'SELECT title, category, preview, prompt FROM prompts WHERE slug = ? LIMIT 1'
    ).bind(slug).first();
  } catch (e) {
    dbOk = false; // DB hiccup — don't take the page down over it, serve normally below.
  }

  if (dbOk && !row) {
    return new Response(assetResponse.body, {
      status: 404,
      statusText: 'Not Found',
      headers: assetResponse.headers,
    });
  }

  if (!row) return assetResponse; // DB check failed — serve the shell as-is.

  const description = `${row.preview || String(row.prompt).slice(0, 140)} Free ${row.category} prompt — copy & use instantly.`;

  return injectSeoTags(assetResponse, {
    url: `${DOMAIN}/prompt?slug=${encodeURIComponent(slug)}`,
    title: `${row.title} — Free ChatGPT Prompt | SmartPrompts`,
    ogTitle: `${row.title} — Free ChatGPT Prompt`,
    description,
  });
}
