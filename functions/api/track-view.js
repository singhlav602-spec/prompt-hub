// POST /api/track-view — public, no auth. Called (fire-and-forget) from
// prompt.html on every page load. One row per (slug, day); this is the
// raw signal that /api/discovery aggregates into the auto-computed
// Trending / Rising / Popular / High-Demand list — no manual editing
// needed once there's enough real traffic.
export async function onRequestPost(context) {
  const { request, env } = context;
  const db = env.DB;

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400 });
  }

  const slug = (body.slug || '').trim().slice(0, 200);
  if (!slug) {
    return new Response(JSON.stringify({ error: 'slug is required' }), { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'

  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS prompt_views (
      slug TEXT NOT NULL,
      day TEXT NOT NULL,
      views INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (slug, day)
    )`).run();

    await db.prepare(
      `INSERT INTO prompt_views (slug, day, views) VALUES (?, ?, 1)
       ON CONFLICT(slug, day) DO UPDATE SET views = views + 1`
    ).bind(slug, today).run();

    // Occasionally prune rows older than 60 days so the table doesn't
    // grow forever. No Cron Trigger needed — just a random chance on
    // regular traffic, since this endpoint gets hit constantly anyway.
    if (Math.random() < 0.01) {
      try {
        await db.prepare(`DELETE FROM prompt_views WHERE day < date('now','-60 days')`).run();
      } catch (e) { /* best-effort cleanup, never fail the request over it */ }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    // A tracking failure must never surface to the visitor — the page
    // itself already rendered fine before this call was made.
    return new Response(JSON.stringify({ ok: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
