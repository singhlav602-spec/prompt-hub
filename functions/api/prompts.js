// GET /api/prompts — public, read-only. Used by index.html / prompt.html
// instead of the old static prompts.json fetch.
//
// Optional ?category=<name> — scopes the query to one category (used by
// the /category/<slug> page) instead of pulling every row and filtering
// client-side. Backed by an index on `category`, so this reads roughly
// just that category's rows instead of scanning the whole table.
//
// Edge-cached (see _edge-cache.js) — this is the single biggest D1 read
// source in the app (homepage + discovery/trending page both call this
// with no category, i.e. the full ~3000-row table), so caching it is what
// actually cuts repeat-visit and bot-crawl cost instead of just the
// Cache-Control header that was here before (which Pages Functions don't
// honor automatically).
import { resolveTag } from '../_tags.js';
import { withEdgeCache } from '../_edge-cache.js';

export async function onRequestGet(context) {
  return withEdgeCache(context, async () => {
    const { env, request } = context;
    const url = new URL(request.url);
    const category = url.searchParams.get('category');

    try {
      try { await env.DB.prepare('ALTER TABLE prompts ADD COLUMN likes INTEGER NOT NULL DEFAULT 0').run(); } catch (e) {}
      try { await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_prompts_category ON prompts(category)').run(); } catch (e) {}

      const stmt = category
        ? env.DB.prepare(
            'SELECT slug, title, category, preview, prompt, tag, tag_expires_at, likes FROM prompts WHERE category = ? ORDER BY id ASC'
          ).bind(category)
        : env.DB.prepare(
            'SELECT slug, title, category, preview, prompt, tag, tag_expires_at, likes FROM prompts ORDER BY id ASC'
          );

      const { results } = await stmt.all();

      const withResolvedTags = results.map(r => ({
        slug: r.slug,
        title: r.title,
        category: r.category,
        preview: r.preview,
        prompt: r.prompt,
        tag: resolveTag(r),
        likes: r.likes || 0,
      }));

      return new Response(JSON.stringify(withResolvedTags), {
        headers: {
          'Content-Type': 'application/json',
          // A new/edited prompt or a like count can take up to this long
          // to show up for a visitor hitting a cached edge node. Lower
          // this if that staleness window matters more than saved reads.
          'Cache-Control': 'public, max-age=120',
        },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Failed to load prompts', detail: String(err) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  });
}
