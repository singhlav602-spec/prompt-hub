import { requireAuth } from '../../_auth.js';

// GET /api/admin/urls — every URL currently live on the site, for the admin
// panel's "URLs" tab. Deliberately mirrors sitemap.xml.js's own queries and
// hidden-page logic exactly, so what you see here is exactly what's being
// submitted to Google — not a separate, possibly-out-of-sync list.
const DOMAIN = 'https://smart-prompt.in';

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!(await requireAuth(request, env))) {
    return new Response(JSON.stringify({ error: 'Not authorized' }), { status: 401 });
  }

  const db = env.DB;
  const urls = [];

  let hiddenSlugs = new Set();
  try {
    const { results } = await db.prepare(
      "SELECT page_slug FROM page_visibility WHERE hidden = 1"
    ).all();
    hiddenSlugs = new Set(results.map(r => r.page_slug));
  } catch (e) { /* table may not exist yet — treat as nothing hidden */ }

  const staticPages = [
    { slug: '', path: '/', title: 'Home' },
    { slug: 'blog', path: '/blog', title: 'Blog (list page)' },
    { slug: 'trending-prompts', path: '/trending-prompts', title: 'Trending Prompts' },
    { slug: 'videos', path: '/videos', title: 'Videos (list page)' },
    { slug: 'seo-tool', path: '/seo-tool', title: 'SEO Tool' },
    { slug: 'prompt-improver', path: '/prompt-improver', title: 'Prompt Improver' },
    { slug: 'image-prompt-generator', path: '/image-prompt-generator', title: 'Image Prompt Generator' },
    { slug: 'about', path: '/about', title: 'About' },
    { slug: 'submit', path: '/submit', title: 'Submit' },
  ];
  for (const p of staticPages) {
    if (p.slug && hiddenSlugs.has(p.slug)) continue;
    urls.push({ type: 'static', id: null, slug: p.slug, title: p.title, url: `${DOMAIN}${p.path}` });
  }

  try {
    const { results: prompts } = await db.prepare(
      'SELECT id, slug, title, category FROM prompts ORDER BY id DESC'
    ).all();
    for (const p of prompts) {
      urls.push({
        type: 'prompt', id: p.id, slug: p.slug, title: p.title, category: p.category,
        url: `${DOMAIN}/prompt?slug=${encodeURIComponent(p.slug)}`,
      });
    }
  } catch (e) { /* table not reachable */ }

  try {
    const { results: posts } = await db.prepare(
      'SELECT id, slug, title FROM blog_posts ORDER BY id DESC'
    ).all();
    for (const b of posts) {
      urls.push({
        type: 'blog', id: b.id, slug: b.slug, title: b.title,
        url: `${DOMAIN}/blog-post?slug=${encodeURIComponent(b.slug)}`,
      });
    }
  } catch (e) { /* table not reachable */ }

  try {
    const { results: videos } = await db.prepare(
      'SELECT id, slug, title FROM video_items ORDER BY id DESC'
    ).all();
    for (const v of videos) {
      urls.push({
        type: 'video', id: v.id, slug: v.slug, title: v.title,
        url: `${DOMAIN}/video-item?slug=${encodeURIComponent(v.slug)}`,
      });
    }
  } catch (e) { /* table not reachable */ }

  return new Response(JSON.stringify({ urls, total: urls.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
