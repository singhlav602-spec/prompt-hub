// GET /api/discovery — public, read-only. Computes the homepage's
// "🔥 Trending & Popular Prompts" list from real page-view data recorded
// by /api/track-view — nobody has to look anything up or edit a list.
//
// Badge priority (a slug only ever gets one, first match wins):
//   trending    — most views in the last 3 days   (hot right now)
//   rising      — clear week-over-week growth, not already "trending"
//   popular     — most views in the last 7 days
//   high-demand — most views in the last 30 days  (steady, consistent)
//
// Returns [] until there's enough real traffic to be a meaningful signal
// (see MIN_TOTAL_VIEWS) — the site falls back to its small hand-picked
// seed list (DISCOVERY_PROMPTS in script.js) until then. Nothing else
// needs to change when real data takes over; it just starts happening.
const MIN_TOTAL_VIEWS = 30; // below this (last 30 days, all prompts), not enough signal yet
const PER_BADGE = 5;        // cards per badge, ~20 total across all four

export async function onRequestGet(context) {
  const { env } = context;
  try {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS prompt_views (
      slug TEXT NOT NULL,
      day TEXT NOT NULL,
      views INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (slug, day)
    )`).run();

    // Manually-featured prompts (admin checked "Feature on Trending") always
    // appear, regardless of real view data — lets a brand-new prompt show up
    // immediately instead of waiting to earn organic views.
    let featuredRows = [];
    try {
      const { results } = await env.DB.prepare(
        `SELECT slug, title, category, preview, prompt FROM prompts WHERE featured_trending = 1`
      ).all();
      featuredRows = results || [];
    } catch (e) { /* column may not exist yet on a very old DB — ignore */ }
    const featured = featuredRows.map(r => ({ ...r, badge: 'trending' }));
    const featuredSlugs = new Set(featured.map(r => r.slug));

    const { results: agg } = await env.DB.prepare(`
      SELECT slug,
        SUM(CASE WHEN day >= date('now','-3 days') THEN views ELSE 0 END)  AS last3,
        SUM(CASE WHEN day >= date('now','-7 days') THEN views ELSE 0 END)  AS last7,
        SUM(CASE WHEN day >= date('now','-14 days') AND day < date('now','-7 days') THEN views ELSE 0 END) AS prev7,
        SUM(CASE WHEN day >= date('now','-30 days') THEN views ELSE 0 END) AS last30
      FROM prompt_views
      GROUP BY slug
    `).all();

    const totalViews = agg.reduce((sum, r) => sum + (r.last30 || 0), 0);
    if (totalViews < MIN_TOTAL_VIEWS) {
      if (featured.length) {
        return new Response(JSON.stringify(featured), {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
        });
      }
      return emptyResponse();
    }

    const used = new Set(featuredSlugs);

    const pickTop = (sortKey, badge) =>
      agg
        .filter(r => !used.has(r.slug) && (r[sortKey] || 0) > 0)
        .sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0))
        .slice(0, PER_BADGE)
        .map(r => { used.add(r.slug); return { slug: r.slug, badge }; });

    // 1. Trending — hottest in the last 3 days
    const trending = pickTop('last3', 'trending');

    // 2. Rising — meaningful volume this week AND growing vs last week
    const rising = agg
      .filter(r => !used.has(r.slug) && (r.last7 || 0) >= 3)
      .map(r => ({ slug: r.slug, growth: r.prev7 > 0 ? r.last7 / r.prev7 : (r.last7 > 0 ? 99 : 0) }))
      .filter(r => r.growth >= 1.3)
      .sort((a, b) => b.growth - a.growth)
      .slice(0, PER_BADGE)
      .map(r => { used.add(r.slug); return { slug: r.slug, badge: 'rising' }; });

    // 3. Popular — most views this week (that aren't already trending/rising)
    const popular = pickTop('last7', 'popular');

    // 4. High Demand — most views over the last 30 days (steady performers)
    const highDemand = pickTop('last30', 'high-demand');

    const picks = [...trending, ...rising, ...popular, ...highDemand];
    if (!picks.length && !featured.length) return emptyResponse();

    const slugs = picks.map(p => p.slug);
    const placeholders = slugs.map(() => '?').join(',');
    const promptRows = slugs.length
      ? (await env.DB.prepare(
          `SELECT slug, title, category, preview, prompt FROM prompts WHERE slug IN (${placeholders})`
        ).bind(...slugs).all()).results
      : [];

    const bySlug = new Map(promptRows.map(p => [p.slug, p]));
    const fromViews = picks
      .map(p => {
        const prompt = bySlug.get(p.slug);
        return prompt ? { ...prompt, badge: p.badge } : null; // slug tracked but prompt since deleted — skip
      })
      .filter(Boolean);
    const combined = [...featured, ...fromViews];

    return new Response(JSON.stringify(combined), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300', // 5 min edge cache — this doesn't need to be instant
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to load discovery data', detail: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

function emptyResponse() {
  return new Response(JSON.stringify([]), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
