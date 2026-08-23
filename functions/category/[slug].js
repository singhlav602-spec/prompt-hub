// GET /category/:slug — dedicated landing page per prompt category (e.g.
// /category/social-media), so each category is a real, crawlable, indexable
// URL instead of only existing as an in-page `#category=` hash filter on the
// homepage (hash fragments are never sent to the server and Google doesn't
// index them — this is additive, it doesn't touch that existing filter).
//
// Categories aren't a fixed list in the DB — they're just the free-text
// `category` column on `prompts`, so there's no stored slug to look up.
// Instead: fetch the distinct category names, slugify each with the same
// function the sitemap uses, and match against the incoming slug. A slug
// with no match (typo, removed category, etc.) gets a real 404 instead of
// a soft "empty page" — same reasoning as functions/prompt.js.
import { injectSeoTags } from '../_seo.js';
import { slugifyCategory, MIN_CATEGORY_PROMPTS } from '../_slug.js';

const DOMAIN = 'https://smart-prompt.in';

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const slugParam = params.slug;
  const url = new URL(request.url);

  // Serve the shared category page template. Note this fetches a *fixed*
  // asset path (/category.html) built off the request's own origin — not
  // the incoming dynamic URL, since there's no physical file at
  // /category/<slug> for env.ASSETS.fetch to find; and not a hardcoded
  // production domain, so this still works on preview deploys.
  const templateUrl = new URL('/category.html', url.origin);
  const assetResponse = await env.ASSETS.fetch(new Request(templateUrl.toString(), { method: 'GET' }));

  let categoryNames = [];
  let dbOk = true;
  try {
    // Only categories with enough prompts to justify a standalone landing
    // page (see MIN_CATEGORY_PROMPTS) — a category below that never
    // matches here, so its URL 404s instead of serving a near-empty page.
    const { results } = await env.DB.prepare(
      'SELECT category FROM prompts GROUP BY category HAVING COUNT(*) >= ?'
    ).bind(MIN_CATEGORY_PROMPTS).all();
    categoryNames = results.map(r => r.category);
  } catch (e) {
    dbOk = false; // DB hiccup — don't take the page down over it, serve the shell below.
  }

  const match = categoryNames.find(c => slugifyCategory(c) === slugParam);

  if (dbOk && !match) {
    return new Response(assetResponse.body, {
      status: 404,
      statusText: 'Not Found',
      headers: assetResponse.headers,
    });
  }

  if (!match) return assetResponse; // DB check failed — serve the shell as-is; client JS handles the rest.

  const description = `Browse free ${match} AI prompts — hand-picked, ready-to-copy ${match} prompts for ChatGPT, Claude, Gemini & more.`;

  return injectSeoTags(assetResponse, {
    url: `${DOMAIN}/category/${slugParam}`,
    title: `${match} Prompts — Free AI Prompt Library | SmartPrompts`,
    ogTitle: `${match} Prompts — Free AI Prompt Library`,
    description,
  });
}
