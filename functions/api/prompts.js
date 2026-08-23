// GET /api/prompts — public, read-only. Used by index.html / prompt.html
// instead of the old static prompts.json fetch.
import { resolveTag } from '../_tags.js';

export async function onRequestGet(context) {
  const { env, request } = context;
  try {
    // Note: the one-time "likes" column migration that used to run here on
    // every single request has been removed — that column was added to
    // the D1 table long ago, so this was just a wasted extra database call
    // on every homepage load. If a fresh migration is ever needed again,
    // run it once by hand instead of on every request.

    // Optional ?category=<name> filter. Without it, every caller (the
    // homepage's search box, /category/<slug> pages, etc.) downloaded the
    // *entire* prompt table just to show one category's ~30-150 rows —
    // this lets a category page ask for only its own rows instead.
    const category = new URL(request.url).searchParams.get('category');

    const baseQuery = 'SELECT slug, title, category, preview, prompt, tag, tag_expires_at, likes FROM prompts';
    const stmt = category
      ? env.DB.prepare(`${baseQuery} WHERE category = ? ORDER BY id ASC`).bind(category)
      : env.DB.prepare(`${baseQuery} ORDER BY id ASC`);

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
        // Cache at the edge for a minute so repeat visits are fast, but
        // still pick up new prompts added via the admin dashboard quickly.
        'Cache-Control': 'public, max-age=60',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to load prompts', detail: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
