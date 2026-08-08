export async function onRequest(context) {
  const url = new URL(context.request.url);

  if (url.hostname === "prompt-hub-3t3.pages.dev") {
    return Response.redirect(
      `https://smart-prompt.in${url.pathname}${url.search}`,
      301
    );
  }

  return context.next();
}
