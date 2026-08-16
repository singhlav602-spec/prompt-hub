// GET /api/videos — public, read-only. Newest first.
export async function onRequestGet(context) {
  const { env } = context;
  try {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS video_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      youtube_id TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Other',
      prompt TEXT NOT NULL,
      published_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`).run();

    const { results } = await env.DB.prepare(
      'SELECT slug, title, youtube_id, category, prompt, published_at FROM video_items ORDER BY published_at DESC'
    ).all();

    return new Response(JSON.stringify(results), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to load video items', detail: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
