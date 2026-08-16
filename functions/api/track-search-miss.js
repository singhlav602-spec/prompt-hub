// POST /api/track-search-miss — public, no auth. Called (fire-and-forget)
// from index.html whenever a search returns zero results. One row per
// (normalized query, day) — this is what the admin "Search Gaps" panel
// (functions/api/admin/search-gaps.js) reads from, so the site owner can
// see exactly what people are looking for that isn't in the library yet.
export async function onRequestPost(context) {
  const { request, env } = context;
  const db = env.DB;

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400 });
  }

  // Normalize so "Logo Design", "logo design " and "LOGO DESIGN" all
  // count as the same query instead of splitting the signal three ways.
  const query = (body.query || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 200);
  if (!query) {
    return new Response(JSON.stringify({ error: 'query is required' }), { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'

  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS search_misses (
      query TEXT NOT NULL,
      day TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (query, day)
    )`).run();

    await db.prepare(
      `INSERT INTO search_misses (query, day, count) VALUES (?, ?, 1)
       ON CONFLICT(query, day) DO UPDATE SET count = count + 1`
    ).bind(query, today).run();

    // Same lightweight, no-cron pruning approach as prompt_views.
    if (Math.random() < 0.01) {
      try {
        await db.prepare(`DELETE FROM search_misses WHERE day < date('now','-90 days')`).run();
      } catch (e) { /* best-effort cleanup */ }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    // A tracking failure must never surface to the visitor.
    return new Response(JSON.stringify({ ok: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
