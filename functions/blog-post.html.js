// GET /blog-post.html?slug=... — same idea as prompt.html.js: return a real
// HTTP 404 when the slug isn't in the blog_posts table, instead of always
// serving 200 and letting client-side JS silently show "Post Not Found".

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug');

  const assetResponse = await env.ASSETS.fetch(request);

  if (!slug) {
    return new Response(assetResponse.body, {
      status: 404,
      statusText: 'Not Found',
      headers: assetResponse.headers,
    });
  }

  try {
    const row = await env.DB.prepare('SELECT 1 FROM blog_posts WHERE slug = ? LIMIT 1').bind(slug).first();
    if (!row) {
      return new Response(assetResponse.body, {
        status: 404,
        statusText: 'Not Found',
        headers: assetResponse.headers,
      });
    }
  } catch (e) {
    // DB hiccup — don't take the page down over it, serve normally.
  }

  return assetResponse;
}
