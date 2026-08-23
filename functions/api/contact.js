// POST /api/contact — PUBLIC, no auth. Messages from the Contact Us page
// land here and are just stored for an admin to read later (no auto-reply,
// no outbound email — this site has no email-sending service wired up).
// Same shape as functions/api/submit.js: honeypot spam check, then a plain
// D1 insert.
export async function onRequestPost(context) {
  const { request, env } = context;
  const db = env.DB;

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400 });
  }

  // Honeypot: a hidden field real visitors never fill in. If it has a value,
  // silently pretend success so bots don't learn to look for a real error.
  if (body.website) {
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  }

  const name = (body.name || '').trim();
  const email = (body.email || '').trim();
  const message = (body.message || '').trim();

  if (!name || !email || !message) {
    return new Response(JSON.stringify({ error: 'name, email, and message are required' }), { status: 400 });
  }
  if (name.length > 100 || email.length > 200 || message.length > 4000) {
    return new Response(JSON.stringify({ error: 'One of the fields is too long' }), { status: 400 });
  }
  // Deliberately loose (no regex) — just enough to reject obvious junk
  // without rejecting real addresses regex often gets wrong.
  if (!email.includes('@') || !email.includes('.')) {
    return new Response(JSON.stringify({ error: 'Please enter a valid email' }), { status: 400 });
  }

  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS contact_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'unread',
      created_at TEXT DEFAULT (datetime('now'))
    )`).run();

    await db.prepare(
      `INSERT INTO contact_messages (name, email, message) VALUES (?, ?, ?)`
    ).bind(name, email, message).run();

    return new Response(JSON.stringify({ ok: true }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Could not send message', detail: String(err) }), { status: 500 });
  }
}
