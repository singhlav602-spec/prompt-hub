// GET /api/prompts — public, read-only. Used by index.html / prompt.html
// instead of the old static prompts.json fetch.
import { resolveTag } from '../_tags.js';

export async function onRequestGet(context) {
  const { env } = context;
  try {
    // Note: the one-time "likes" column migration that used to run here on
    // every single request has been removed — that column was added to
    // the D1 table long ago, so this was just a wasted extra database call
    // on every homepage load. If a fresh migration is ever needed again,
    // run it once by hand instead of on every request.
    const { results } = await env.DB.prepare(
      'SELECT slug, title, category, preview, prompt, tag, tag_expires_at, likes FROM prompts ORDER BY id ASC'
    ).all();

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
