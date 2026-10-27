const CANONICAL_HOST = "smart-prompt.in";
const REDIRECT_HOSTS = new Set([
  "www.smart-prompt.in",
  "prompt-hub-3t3.pages.dev",
]);

export async function onRequest(context) {
  const url = new URL(context.request.url);

  if (REDIRECT_HOSTS.has(url.hostname)) {
    return Response.redirect(
      `https://${CANONICAL_HOST}${url.pathname}${url.search}`,
      301
    );
  }

  return context.next();
}
