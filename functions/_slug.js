// Shared helper: turns a category name (e.g. "Social Media") into a URL
// slug (e.g. "social-media") for the /category/<slug> route. Used both by
// the category route itself (functions/category/[slug].js, to match an
// incoming slug back to a real category) and by the sitemap (to list every
// category page). script.js has an identical copy for client-side use —
// keep both in sync if this ever changes, since the server here decides
// what's indexable and the client decides what actually renders.
export function slugifyCategory(name) {
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Minimum number of prompts a category needs before it gets its own
// /category/<slug> page, a sitemap entry, or a chip on the homepage. Below
// this, a category is "thin content" — a dedicated page with 1-4 prompts
// looks abandoned to a visitor and reads as low-quality to Google. Prompts
// in a below-threshold category are still fully findable through search;
// they just don't get a standalone landing page. Raise this over time as
// the library grows — it should track "how many prompts make a category
// page feel worth landing on," not stay fixed forever.
export const MIN_CATEGORY_PROMPTS = 5;
