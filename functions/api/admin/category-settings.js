import { requireAuth } from '../../_auth.js';

// Lets the admin force a specific category to always render as a full
// card on the homepage (instead of a small text pill), regardless of how
// many prompts it has. Categories not explicitly featured keep falling
// back to the existing "top N by prompt count" behavior.

async function ensureTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS category_settings (
    category TEXT PRIMARY KEY,
    featured INTEGER NOT NULL DEFAULT 0
  )`).run();
}

export async function onRequest(context) {
  const { request, env } = context;

  if (!(await requireAuth(request, env))) {
    return new Response(JSON.stringify({ error: 'Not authorized' }), { status: 401 });
  }

  const db = env.DB;
  await ensureTable(db);

  if (request.method === 'GET') {
    // Every distinct category that actually exists among prompts today,
    // joined with its saved setting (defaulting to not-featured).
    const { results: cats } = await db.prepare(
      `SELECT category, COUNT(*) as count FROM prompts GROUP BY category ORDER BY count DESC`
    ).all();
    const { results: settings } = await db.prepare('SELECT category, featured FROM category_settings').all();
    const featuredSet = new Set(settings.filter(s => s.featured).map(s => s.category));

    const merged = cats.map(c => ({
      category: c.category,
      count: c.count,
      featured: featuredSet.has(c.category),
    }));

    return new Response(JSON.stringify({ results: merged }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (request.method === 'POST') {
    const body = await request.json();
    const { category, featured } = body;
    if (!category) {
      return new Response(JSON.stringify({ error: 'category required' }), { status: 400 });
    }
    await db.prepare(
      `INSERT INTO category_settings (category, featured) VALUES (?, ?)
       ON CONFLICT(category) DO UPDATE SET featured = excluded.featured`
    ).bind(category, featured ? 1 : 0).run();

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
}
