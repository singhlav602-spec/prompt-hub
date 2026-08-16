// GET /api/category-settings — public, read-only. Just the list of
// category names an admin has pinned to always show as a homepage card.
export async function onRequestGet(context) {
  const { env } = context;
  try {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS category_settings (
      category TEXT PRIMARY KEY,
      featured INTEGER NOT NULL DEFAULT 0
    )`).run();

    const { results } = await env.DB.prepare(
      'SELECT category FROM category_settings WHERE featured = 1'
    ).all();

    return new Response(JSON.stringify({ featured: results.map(r => r.category) }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ featured: [] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
