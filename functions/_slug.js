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
