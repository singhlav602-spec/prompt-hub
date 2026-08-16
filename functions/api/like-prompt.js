// POST /api/like-prompt  { slug: "...", action: "like" | "unlike" } — PUBLIC.
// No accounts on this site, so "who liked what" lives in the visitor's own
// browser (localStorage) — this endpoint just keeps the shared counter.
// A basic per-IP-per-slug cooldown stops trivial spam-clicking from
// inflating the count; it isn't meant to be airtight abuse protection.

async function ensureColumn(db) {
  try { await db.prepare('ALTER TABLE prompts ADD COLUMN likes INTEGER NOT NULL DEFAULT 0').run(); } catch (e) {}
}

async function ensureCooldownTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS prompt_like_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL,
    slug TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`).run();
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const db = env.DB;
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400 });
  }

  const slug = (body.slug || '').trim();
  const action = body.action === 'unlike' ? 'unlike' : 'like';
  if (!slug) {
    return new Response(JSON.stringify({ error: 'slug required' }), { status: 400 });
  }

  await ensureColumn(db);
  await ensureCooldownTable(db);
  await db.prepare(`DELETE FROM prompt_like_events WHERE created_at < datetime('now', '-1 hour')`).run();

  if (action === 'like') {
    const { count } = await db.prepare(
      `SELECT COUNT(*) as count FROM prompt_like_events WHERE ip = ? AND slug = ? AND created_at > datetime('now', '-10 seconds')`
    ).bind(ip, slug).first();
    if (count > 0) {
      return new Response(JSON.stringify({ error: 'Too fast, try again in a moment' }), { status: 429 });
    }
    await db.prepare('INSERT INTO prompt_like_events (ip, slug) VALUES (?, ?)').bind(ip, slug).run();
  }

  const delta = action === 'like' ? 1 : -1;
  await db.prepare(
    `UPDATE prompts SET likes = MAX(0, likes + ?) WHERE slug = ?`
  ).bind(delta, slug).run();

  const row = await db.prepare('SELECT likes FROM prompts WHERE slug = ?').bind(slug).first();
  if (!row) {
    return new Response(JSON.stringify({ error: 'Prompt not found' }), { status: 404 });
  }

  return new Response(JSON.stringify({ ok: true, likes: row.likes }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
