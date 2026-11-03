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

// Old category URLs that were merged into a bigger category (see the category
// merge). A request for one of these is redirected (301) ONLY when that category
// no longer exists in the database, so a category that was kept (or skipped during
// the merge) keeps working exactly as before.
const MERGED_CATEGORY_REDIRECTS = {
 "ai-art": "ai-image",
 "ai-image-video": "ai-image",
 "ai-image-editing": "ai-image",
 "ai-image-generation": "ai-image",
 "create-breathtaking": "ai-image",
 "image-generation": "ai-image",
 "image-and-video": "ai-image",
 "images": "ai-image",
 "ai": "ai-tools",
 "artificial-intelligence": "ai-tools",
 "animation": "ai-video-prompts",
 "video-generation": "ai-video-prompts",
 "operations": "business",
 "presentations": "business",
 "project-management": "business",
 "recruitment": "career",
 "design-creativity": "design",
 "web-design": "design",
 "history": "education",
 "knowledge": "education",
 "study": "education",
 "teaching": "education",
 "email-marketing": "email",
 "beauty": "fashion",
 "event-planning": "festivals",
 "events": "festivals",
 "personal-finance": "finance",
 "food": "food-lifestyle",
 "food-cooking": "food-lifestyle",
 "healthcare": "health",
 "sports": "health",
 "shopping-lifestyle": "home-lifestyle",
 "professional": "linkedin",
 "advertising": "marketing",
 "affiliate-marketing": "marketing",
 "podcasting": "podcast",
 "ai-control": "prompt-engineering",
 "ai-prompt-generator": "prompt-engineering",
 "ai-prompts": "prompt-engineering",
 "smart-prompts": "prompt-engineering",
 "analysis": "research",
 "product-reviews": "reviews",
 "seo-marketing": "seo",
 "seo-technical-seo": "seo",
 "advice": "self-improvement",
 "personal-development": "self-improvement",
 "twitter": "social-media",
 "sci-fi-futuristic": "story",
 "nature": "travel",
 "content-writing": "writing",
 "writing-content": "writing",
 "writing-content-creation": "writing",
 "influencer-creator": "youtube",
 "vlogging": "youtube",
 "youtube-analytics": "youtube",
 "youtube-branding": "youtube",
 "youtube-content": "youtube",
 "youtube-design": "youtube",
 "youtube-growth": "youtube",
 "youtube-production": "youtube",
 "youtube-research": "youtube",
 "youtube-seo": "youtube",
 "youtube-strategy": "youtube"
};

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
    const categoryKeys = Object.keys(counts);
    // Safety net: if the aggregate ever comes back empty (a transient D1
    // hiccup during the cache-refresh query, or a corrupted cache entry),
    // treat it the same as a DB failure below — NOT as "no category
    // matched" — so we never 404 every single category page for up to the
    // 10-minute cache window over what would just be bad luck on one query.
    if (categoryKeys.length === 0) {
      dbOk = false;
    } else {
      const match = categoryKeys.find(c => slugifyCategory(c) === slug);
      if (match) {
        categoryName = match;
        promptCount = counts[match];
      }
    }
  } catch (e) {
    dbOk = false; // DB hiccup — don't take the page down over it, serve the shell as-is below.
  }

  if (dbOk && !categoryName && Object.prototype.hasOwnProperty.call(MERGED_CATEGORY_REDIRECTS, slug)) {
    return Response.redirect(`${DOMAIN}/category/${MERGED_CATEGORY_REDIRECTS[slug]}`, 301);
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
