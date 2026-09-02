// Shared helper for caching GET-endpoint responses at Cloudflare's edge.
//
// IMPORTANT: setting a `Cache-Control` header on a Pages Function response
// does NOT make Cloudflare's CDN cache it — that only works for static
// assets. A dynamic Function response is re-run on every single request
// unless the code explicitly reads from and writes to the Cache API, which
// is what this helper does. Every endpoint in this project that sets
// Cache-Control but doesn't use this helper was (until now) re-querying
// D1 on every request regardless of that header.
//
// Usage:
//   import { withEdgeCache } from '../_edge-cache.js';
//   export async function onRequestGet(context) {
//     return withEdgeCache(context, async () => {
//       ...do the D1 work, return a Response with its own Cache-Control...
//     });
//   }
//
// The cache key is the full request URL including the query string, so
// e.g. /api/prompts and /api/prompts?category=X are cached as separate
// entries. Cache duration is taken from the Cache-Control max-age the
// wrapped function sets on its Response. Only 200 responses are cached —
// errors are never stored, so a D1 hiccup doesn't get "stuck" cached.
//
// Cloudflare's cache is per edge datacenter, not global — a visitor hitting
// a different PoP than a previous one will still trigger a fresh compute.
// This still meaningfully cuts reads because repeat hits to the same PoP
// (common for crawlers and for popular pages) are served with zero D1 work.
export async function withEdgeCache(context, computeResponse) {
  const { request } = context;
  const cache = caches.default;
  const cacheKey = new Request(request.url, request);

  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const response = await computeResponse();
  if (response.status === 200) {
    context.waitUntil(cache.put(cacheKey, response.clone()));
  }
  return response;
}
