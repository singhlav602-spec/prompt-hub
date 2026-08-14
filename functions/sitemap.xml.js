// GET /sitemap.xml — fully dynamic, built from the live D1 database on every
// request. Replaces generate_sitemap.py, which only knew about the static
// prompts.json snapshot and never saw blog posts (they live in the D1
// blog_posts table). This way the sitemap can never go stale — no manual
// regeneration step, no missing URLs.

const DOMAIN = 'https://smart-prompt.in';

function urlEntry(loc, lastmod, changefreq, priority) {
  return `\n<url>\n<loc>${loc}</loc>\n<lastmod>${lastmod}</lastmod>\n<changefreq>${changefreq}</changefreq>\n<priority>${priority}</priority>\n</url>`;
}

export async function onRequestGet(context) {
  const { env } = context;
  const today = new Date().toISOString().slice(0, 10);
  const urls = [];

  // Static pages
  urls.push(urlEntry(`${DOMAIN}/`, today, 'daily', '1.0'));
  urls.push(urlEntry(`${DOMAIN}/blog.html`, today, 'daily', '0.8'));
  urls.push(urlEntry(`${DOMAIN}/gallery.html`, today, 'daily', '0.8'));
  urls.push(urlEntry(`${DOMAIN}/trending-prompts.html`, today, 'daily', '0.8'));
  urls.push(urlEntry(`${DOMAIN}/about.html`, today, 'monthly', '0.4'));
  urls.push(urlEntry(`${DOMAIN}/submit.html`, today, 'monthly', '0.4'));

  // Every prompt currently in the live database
  try {
    const { results: prompts } = await env.DB.prepare(
      'SELECT DISTINCT slug FROM prompts'
    ).all();
    for (const p of prompts) {
      urls.push(urlEntry(`${DOMAIN}/prompt.html?slug=${encodeURIComponent(p.slug)}`, today, 'monthly', '0.7'));
    }
  } catch (e) { /* table not reachable — still serve the static pages below */ }

  // Every blog post currently in the live database
  try {
    const { results: posts } = await env.DB.prepare(
      'SELECT slug, published_at, updated_at FROM blog_posts'
    ).all();
    for (const b of posts) {
      const lastmod = String(b.updated_at || b.published_at || today).slice(0, 10);
      urls.push(urlEntry(`${DOMAIN}/blog-post.html?slug=${encodeURIComponent(b.slug)}`, lastmod, 'monthly', '0.7'));
    }
  } catch (e) { /* table not reachable — still serve everything else */ }

  // Every gallery item currently in the live database
  try {
    const { results: items } = await env.DB.prepare(
      'SELECT slug, published_at, updated_at FROM gallery_items'
    ).all();
    for (const g of items) {
      const lastmod = String(g.updated_at || g.published_at || today).slice(0, 10);
      urls.push(urlEntry(`${DOMAIN}/gallery-item.html?slug=${encodeURIComponent(g.slug)}`, lastmod, 'monthly', '0.7'));
    }
  } catch (e) { /* table not reachable — still serve everything else */ }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}\n</urlset>\n`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=UTF-8',
      // Cached at the edge for an hour — a sitemap doesn't need to be
      // millisecond-fresh, and this saves a D1 query on every crawler hit.
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
