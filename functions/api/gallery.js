// GET /api/gallery — public, read-only. Newest first.
import { withEdgeCache } from '../_edge-cache.js';

export async function onRequestGet(context) {
  return withEdgeCache(context, async () => {
  const { env } = context;
  try {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS gallery_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      image_url TEXT NOT NULL,
      image_prompt TEXT NOT NULL,
      video_prompt TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Other',
      published_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`).run();
    try { await env.DB.prepare("ALTER TABLE gallery_items ADD COLUMN category TEXT NOT NULL DEFAULT 'Other'").run(); } catch (e) { /* already exists */ }

    const { results } = await env.DB.prepare(
      'SELECT slug, title, image_url, image_prompt, video_prompt, category, published_at FROM gallery_items ORDER BY published_at DESC'
    ).all();

    return new Response(JSON.stringify(results), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=120',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to load gallery items', detail: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  });
}
