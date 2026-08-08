// GET /api/blog — public, read-only. Newest first.
export async function onRequestGet(context) {
  const { env } = context;
  try {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS blog_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      excerpt TEXT,
      content TEXT NOT NULL,
      published_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      show_on_home INTEGER NOT NULL DEFAULT 0,
      pinned INTEGER NOT NULL DEFAULT 0
    )`).run();
    try { await env.DB.prepare('ALTER TABLE blog_posts ADD COLUMN show_on_home INTEGER NOT NULL DEFAULT 0').run(); } catch (e) { /* already exists */ }
    try { await env.DB.prepare('ALTER TABLE blog_posts ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0').run(); } catch (e) { /* already exists */ }

    const { results } = await env.DB.prepare(
      'SELECT slug, title, excerpt, content, published_at, show_on_home, pinned FROM blog_posts ORDER BY published_at DESC'
    ).all();

    return new Response(JSON.stringify(results), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to load blog posts', detail: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
