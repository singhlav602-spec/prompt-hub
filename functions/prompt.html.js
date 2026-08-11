// GET /prompt.html?slug=... — serves the page normally, but returns a real
// HTTP 404 when the slug doesn't exist in the database.
//
// Without this, prompt.html?slug=<anything> always returns HTTP 200 — the
// page shell loads fine, and only client-side JS decides to show a "Not
// Found" message. That's a "soft 404": crawlers see a successful response
// and may keep re-visiting the same dead URL instead of dropping it, wasting
// crawl budget that could go toward real pages. Returning an honest 404
// here tells Google (and any crawler) to stop bothering with that link and
// move on to the next one.
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug');

  const assetResponse = await env.ASSETS.fetch(request);

  if (!slug) {
    // No slug at all — nothing legitimate links here without one.
    return new Response(assetResponse.body, {
      status: 404,
      statusText: 'Not Found',
      headers: assetResponse.headers,
    });
  }

  try {
    const row = await env.DB.prepare('SELECT 1 FROM prompts WHERE slug = ? LIMIT 1').bind(slug).first();
    if (!row) {
      return new Response(assetResponse.body, {
        status: 404,
        statusText: 'Not Found',
        headers: assetResponse.headers,
      });
    }
  } catch (e) {
    // If the DB check itself fails, don't take the page down over it —
    // fall back to serving normally rather than wrongly 404ing a page that
    // might be perfectly fine.
  }

  return assetResponse;
}
