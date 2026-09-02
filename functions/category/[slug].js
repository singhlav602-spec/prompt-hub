// GET /category/<slug> — e.g. /category/social-media.
//
// This route was previously unhandled: no Pages Function and no static file
// matched /category/<anything>, so Cloudflare fell through to the project's
// SPA fallback and served index.html for it. That's why the page rendered
// as the homepage's content instead of category.html, and — since
// index.html's asset links are root-relative now but the *page* being
// served didn't match the requested nested path — assets could 404 depending
// on how the fallback rewrite handled the path.
//
// Unlike prompt.js / gallery-item.js / blog-post.js (flat routes like
// /prompt?slug=...), this route uses a path segment, and there is no static
// file at /category/<slug>.html — only /category.html. So instead of
// re-fetching the asset at the *same* URL, we explicitly ask ASSETS for
// /category.html and serve that shell, with SEO tags injected for the
// actual requested URL.
import { injectSeoTags } from '../_seo.js';
import { slugifyCategory } from '../_slug.js';
import { getCategoryCounts } from '../_category-counts.js';

const DOMAIN = 'https://smart-prompt.in';

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
  const slug = params.slug;

  const shellUrl = new URL('/category.html', url.origin);
  const assetResponse = await env.ASSETS.fetch(new Request(shellUrl.toString(), { method: 'GET' }));

  if (!slug) {
    return new Response(assetResponse.body, {
      status: 404,
      statusText: 'Not Found',
      headers: assetResponse.headers,
    });
  }

  let categoryName = null;
  let promptCount = 0;
  let dbOk = true;
  try {
    // Cached aggregate (see _category-counts.js) instead of a
    // SELECT DISTINCT scan + a COUNT(*) scan on every single visit.
    const { counts } = await getCategoryCounts(context);
    const match = Object.keys(counts).find(c => slugifyCategory(c) === slug);
    if (match) {
      categoryName = match;
      promptCount = counts[match];
    }
  } catch (e) {
    dbOk = false; // DB hiccup — don't take the page down over it, serve the shell as-is below.
  }

  if (dbOk && !categoryName) {
    return new Response(assetResponse.body, {
      status: 404,
      statusText: 'Not Found',
      headers: assetResponse.headers,
    });
  }

  if (!categoryName) return assetResponse; // DB check failed — serve the shell as-is.

  const description = `Browse ${promptCount}+ free ${categoryName} prompts for ChatGPT, Claude, Gemini & more — copy & use instantly.`;

  return injectSeoTags(assetResponse, {
    url: `${DOMAIN}/category/${encodeURIComponent(slug)}`,
    title: `${categoryName} Prompts — Free AI Prompt Library | SmartPrompts`,
    ogTitle: `${categoryName} Prompts — Free AI Prompt Library`,
    description,
  });
}
