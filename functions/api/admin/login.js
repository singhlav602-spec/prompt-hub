import { createSessionToken, sessionCookieHeader, clearCookieHeader } from '../../_auth.js';

// POST /api/admin/login  { password: "..." }
export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400 });
  }

  if (!env.ADMIN_PASSWORD) {
    return new Response(JSON.stringify({ error: 'Server not configured — ADMIN_PASSWORD secret missing' }), { status: 500 });
  }

  if (body.password !== env.ADMIN_PASSWORD) {
    // Small delay to make brute-forcing slightly less trivial.
    await new Promise(r => setTimeout(r, 400));
    return new Response(JSON.stringify({ error: 'Wrong password' }), { status: 401 });
  }

  const token = await createSessionToken(env.ADMIN_PASSWORD);
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': sessionCookieHeader(token),
    },
  });
}

// POST /api/admin/login with ?logout=1 style isn't used — logout is its own route.
export async function onRequestDelete() {
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': clearCookieHeader() },
  });
}
