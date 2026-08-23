// GET /sitemap.xml — fully dynamic, built from the live D1 database on every
// request. Replaces generate_sitemap.py, which only knew about the static
// prompts.json snapshot and never saw blog posts (they live in the D1
// blog_posts table). This way the sitemap can never go stale — no manual
// regeneration step, no missing URLs.

import { slugifyCategory, MIN_CATEGORY_PROMPTS } from './_slug.js';

const DOMAIN = 'https://smart-prompt.in';

function urlEntry(loc, lastmod, changefreq, priority) {
  return `\n<url>\n<loc>${loc}</loc>\n<lastmod>${lastmod}</lastmod>\n<changefreq>${changefreq}</changefreq>\n<priority>${priority}</priority>\n</url>`;
}

export async function onRequestGet(context) {
  const { env } = context;
  const today = new Date().toISOString().slice(0, 10);
  const urls = [];

  let hiddenSlugs = new Set();
  try {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS page_visibility (
      page_slug TEXT PRIMARY KEY,
      hidden INTEGER NOT NULL DEFAULT 0
    )`).run();
    const { results } = await env.DB.prepare('SELECT page_slug FROM page_visibility WHERE hidden = 1').all();
    hiddenSlugs = new Set(results.map(r => r.page_slug));
  } catch (e) { /* if this fails, just include every static page as normal */ }

  // Static pages — skipped while an admin has them hidden, so Google
  // isn't pointed at a page that's currently showing a "check back soon"
  // placeholder instead of real content.
  urls.push(urlEntry(`${DOMAIN}/`, today, 'daily', '1.0'));
  if (!hiddenSlugs.has('blog')) urls.push(urlEntry(`${DOMAIN}/blog`, today, 'daily', '0.8'));
  // Gallery paused for now (R2 migration pending) — keep it out of the
  // sitemap so Google doesn't crawl/index it while it's not being worked
  // on. Uncomment when it's switched back on:
  // if (!hiddenSlugs.has('gallery')) urls.push(urlEntry(`${DOMAIN}/gallery`, today, 'daily', '0.8'));
  if (!hiddenSlugs.has('trending-prompts')) urls.push(urlEntry(`${DOMAIN}/trending-prompts`, today, 'daily', '0.8'));
  if (!hiddenSlugs.has('videos')) urls.push(urlEntry(`${DOMAIN}/videos`, today, 'daily', '0.8'));
  if (!hiddenSlugs.has('seo-tool')) urls.push(urlEntry(`${DOMAIN}/seo-tool`, today, 'monthly', '0.6'));
  if (!hiddenSlugs.has('prompt-improver')) urls.push(urlEntry(`${DOMAIN}/prompt-improver`, today, 'monthly', '0.6'));
  if (!hiddenSlugs.has('image-prompt-generator')) urls.push(urlEntry(`${DOMAIN}/image-prompt-generator`, today, 'monthly', '0.6'));
  if (!hiddenSlugs.has('about')) urls.push(urlEntry(`${DOMAIN}/about`, today, 'monthly', '0.4'));
  if (!hiddenSlugs.has('submit')) urls.push(urlEntry(`${DOMAIN}/submit`, today, 'monthly', '0.4'));
  if (!hiddenSlugs.has('contact')) urls.push(urlEntry(`${DOMAIN}/contact`, today, 'monthly', '0.3'));
  if (!hiddenSlugs.has('privacy-policy')) urls.push(urlEntry(`${DOMAIN}/privacy-policy`, today, 'yearly', '0.2'));
  if (!hiddenSlugs.has('terms')) urls.push(urlEntry(`${DOMAIN}/terms`, today, 'yearly', '0.2'));

  // Every prompt currently in the live database
  try {
    const { results: prompts } = await env.DB.prepare(
      'SELECT DISTINCT slug FROM prompts'
    ).all();
    for (const p of prompts) {
      urls.push(urlEntry(`${DOMAIN}/prompt?slug=${encodeURIComponent(p.slug)}`, today, 'monthly', '0.7'));
    }
  } catch (e) { /* table not reachable — still serve the static pages below */ }

  // One landing page per category with enough prompts to be worth a
  // standalone page (see MIN_CATEGORY_PROMPTS) — a thin category with 1-2
  // prompts is exactly the kind of low-value page Google penalizes a site
  // for having lots of. Deduped by slug too, not just by category name —
  // two differently-spelled category strings could theoretically collapse
  // to the same slug, and a sitemap should never list the same <loc> twice.
  try {
    const { results: cats } = await env.DB.prepare(
      'SELECT category FROM prompts GROUP BY category HAVING COUNT(*) >= ?'
    ).bind(MIN_CATEGORY_PROMPTS).all();
    const seenSlugs = new Set();
    for (const c of cats) {
      const slug = slugifyCategory(c.category);
      if (!slug || seenSlugs.has(slug)) continue;
      seenSlugs.add(slug);
      urls.push(urlEntry(`${DOMAIN}/category/${slug}`, today, 'weekly', '0.65'));
    }
  } catch (e) { /* table not reachable — still serve everything else */ }

  // Every blog post currently in the live database
  try {
    const { results: posts } = await env.DB.prepare(
      'SELECT slug, published_at, updated_at FROM blog_posts'
    ).all();
    for (const b of posts) {
      const lastmod = String(b.updated_at || b.published_at || today).slice(0, 10);
      urls.push(urlEntry(`${DOMAIN}/blog-post?slug=${encodeURIComponent(b.slug)}`, lastmod, 'monthly', '0.7'));
    }
  } catch (e) { /* table not reachable — still serve everything else */ }

  // Gallery paused for now (R2 migration pending) — skip gallery items too.
  // Uncomment when it's switched back on:
  // try {
  //   const { results: items } = await env.DB.prepare(
  //     'SELECT slug, published_at, updated_at FROM gallery_items'
  //   ).all();
  //   for (const g of items) {
  //     const lastmod = String(g.updated_at || g.published_at || today).slice(0, 10);
  //     urls.push(urlEntry(`${DOMAIN}/gallery-item?slug=${encodeURIComponent(g.slug)}`, lastmod, 'monthly', '0.7'));
  //   }
  // } catch (e) { /* table not reachable — still serve everything else */ }

  // Every video item currently in the live database
  try {
    const { results: videos } = await env.DB.prepare(
      'SELECT slug, published_at, updated_at FROM video_items'
    ).all();
    for (const v of videos) {
      const lastmod = String(v.updated_at || v.published_at || today).slice(0, 10);
      urls.push(urlEntry(`${DOMAIN}/video-item?slug=${encodeURIComponent(v.slug)}`, lastmod, 'monthly', '0.7'));
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
