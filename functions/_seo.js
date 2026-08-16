// Shared helper for injecting per-page SEO tags (title, canonical, meta
// description, OG tags) into a detail page's HTML *server-side*, using data
// already fetched from D1.
//
// Previously these tags were set by client-side JS (script.js) after an
// async fetch resolved. Googlebot's crawl snapshot of these pages was
// captured before that JS ran, so every prompt/blog/gallery/video detail
// page reported the exact same generic canonical + title to Google — which
// read that as thousands of pages all being duplicates of one page, and
// mostly refused to index the rest. Injecting the real per-slug values here,
// before the response ever leaves the server, removes that dependency on
// client-side JS execution timing entirely.

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export async function injectSeoTags(assetResponse, { url, title, ogTitle, description }) {
  const t = escapeHtml(title);
  const ot = escapeHtml(ogTitle);
  const d = escapeHtml(description);
  const u = escapeHtml(url);

  let html = await assetResponse.text();
  html = html
    .replace(/<title>.*?<\/title>/, `<title>${t}</title>`)
    .replace(/(id="meta-description"[^>]*content=")[^"]*(")/, `$1${d}$2`)
    .replace(/(id="meta-og-title"[^>]*content=")[^"]*(")/, `$1${ot}$2`)
    .replace(/(id="meta-og-description"[^>]*content=")[^"]*(")/, `$1${d}$2`)
    .replace(/(id="meta-og-url"[^>]*content=")[^"]*(")/, `$1${u}$2`)
    .replace(/(id="canonical-link"[^>]*href=")[^"]*(")/, `$1${u}$2`);

  return new Response(html, {
    headers: {
      ...Object.fromEntries(assetResponse.headers),
      'Content-Type': 'text/html; charset=UTF-8',
    },
  });
}
