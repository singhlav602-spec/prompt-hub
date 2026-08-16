import { requireAuth } from '../../_auth.js';

// GET /api/admin/search-gaps — admin-only. Shows the top searches that
// returned zero results over the last 90 days, so the site owner can see
// real demand for prompts that don't exist in the library yet.
export async function onRequestGet(context) {
  const { request, env } = context;

  if (!(await requireAuth(request, env))) {
    return new Response(JSON.stringify({ error: 'Not authorized' }), { status: 401 });
  }

  const db = env.DB;

  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS search_misses (
      query TEXT NOT NULL,
      day TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (query, day)
    )`).run();

    const { results } = await db.prepare(`
      SELECT query, SUM(count) AS total, MAX(day) AS last_seen
      FROM search_misses
      WHERE day >= date('now','-90 days')
      GROUP BY query
      ORDER BY total DESC
      LIMIT 100
    `).all();

    return new Response(JSON.stringify({ results }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to load search gaps', detail: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
