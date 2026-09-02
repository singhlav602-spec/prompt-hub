// GET /api/prompt-detail?slug=xxx — public, read-only.
// Returns ONE prompt row plus up to 6 related (same-category) rows.
//
// This replaces the old client-side pattern where prompt.html called
// /api/prompts (which pulls the ENTIRE prompts table — every row, every
// column, including full prompt text) just to find one row via
// Array.find(). That meant every single prompt-page view read ~3000 rows
// from D1 instead of ~7, which is what was blowing through the daily D1
// rows_read quota even with modest real traffic (bots crawling thousands
// of individual prompt pages made it far worse).
import { resolveTag } from '../_tags.js';
import { withEdgeCache } from '../_edge-cache.js';

export async function onRequestGet(context) {
  return withEdgeCache(context, async () => {
  const { env, request } = context;
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug');

  if (!slug) {
    return new Response(JSON.stringify({ error: 'Missing slug' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    try { await env.DB.prepare('ALTER TABLE prompts ADD COLUMN likes INTEGER NOT NULL DEFAULT 0').run(); } catch (e) {}

    const row = await env.DB.prepare(
      'SELECT slug, title, category, preview, prompt, tag, tag_expires_at, likes FROM prompts WHERE slug = ? LIMIT 1'
    ).bind(slug).first();

    if (!row) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { results: related } = await env.DB.prepare(
      'SELECT slug, title, category, preview, prompt FROM prompts WHERE category = ? AND slug != ? ORDER BY id ASC LIMIT 6'
    ).bind(row.category, slug).all();

    const prompt = {
      slug: row.slug,
      title: row.title,
      category: row.category,
      preview: row.preview,
      prompt: row.prompt,
      tag: resolveTag(row),
      likes: row.likes || 0,
    };

    return new Response(JSON.stringify({ prompt, related }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=180',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to load prompt', detail: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  });
}
