// Shared helper: category name -> prompt count, for every category.
//
// Used by both /api/category-counts (the client-side category page) and
// functions/category/[slug].js (the SSR meta-description tag). Previously
// each of those did its own D1 work — category/[slug].js ran a
// `SELECT DISTINCT category` scan PLUS a `COUNT(*) WHERE category = ?`
// scan on every single visit, and the client separately fetched the
// ENTIRE prompts table just to filter it down to one category client-side.
//
// This computes everything in ONE grouped query and caches the result at
// Cloudflare's edge (Cache API) for 10 minutes, so it's only re-read from
// D1 roughly once every 10 minutes no matter how much traffic hits
// category pages in between. A newly added/edited/deleted prompt's count
// can take up to 10 minutes to update — that's the freshness/read-cost
// tradeoff; shrink CACHE_TTL_SECONDS if fresher counts matter more than
// saving reads.
const CACHE_TTL_SECONDS = 600;

export async function getCategoryCounts(context) {
  const { env, request } = context;
  const cache = caches.default;
  // Fixed synthetic cache key — same aggregate regardless of which page
  // triggered the lookup, so category/[slug].js and /api/category-counts
  // share one cached entry instead of keeping two.
  const cacheKey = new Request(new URL('/__cache/category-counts', request.url).toString());

  const cached = await cache.match(cacheKey);
  if (cached) {
    return await cached.json();
  }

  // Idempotent — safe to run on every cache miss, cheap once the index exists.
  try {
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_prompts_category ON prompts(category)').run();
  } catch (e) { /* ignore — worst case, the GROUP BY below just costs a bit more */ }

  const { results } = await env.DB.prepare(
    'SELECT category, COUNT(*) AS n FROM prompts GROUP BY category ORDER BY category ASC'
  ).all();

  const counts = {};
  let total = 0;
  for (const row of results) {
    counts[row.category] = row.n;
    total += row.n;
  }

  const data = { counts, total };

  const cacheResponse = new Response(JSON.stringify(data), {
    headers: { 'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}` },
  });
  context.waitUntil(cache.put(cacheKey, cacheResponse));

  return data;
}
