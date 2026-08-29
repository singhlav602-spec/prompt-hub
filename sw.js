// Minimal service worker. Its only real job is to exist and have a fetch
// handler — that's one of the criteria Chrome checks before it will treat
// the site as "installable" and fire the beforeinstallprompt event that
// powers the custom Install button in script.js. Deliberately not doing
// any offline caching here (site is DB-backed and changes constantly, so a
// cache would just serve stale prompts/blog posts).

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
