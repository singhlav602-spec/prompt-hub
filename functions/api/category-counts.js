// GET /api/category-counts — public, read-only, lightweight.
//
// Returns just [{ category, count }, ...] via a SQL GROUP BY — a tiny
// payload (one row per category, ~170 rows) instead of every prompt's
// full record (6000+ rows including each prompt's full text).
//
// Used by:
//   - the homepage category grid (script.js initIndexPage), so the cards
//     can paint as soon as this resolves instead of waiting on the full
//     /api/prompts payload to finish downloading.
//   - the /category/<slug> page (script.js initCategoryPage), to work out
//     which category a slug matches and whether it clears
//     MIN_CATEGORY_PROMPTS, without downloading every other category's
//     prompts just to check.
export async function onRequestGet(context) {
  const { env } = context;
  try {
    const { results } = await env.DB.prepare(
      'SELECT category, COUNT(*) as count FROM prompts GROUP BY category ORDER BY count DESC'
    ).all();

    return new Response(JSON.stringify(results), {
      headers: {
        'Content-Type': 'application/json',
        // Same cache window as /api/prompts — short enough to pick up new
        // prompts/categories from the admin panel quickly.
        'Cache-Control': 'public, max-age=60',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to load category counts', detail: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
