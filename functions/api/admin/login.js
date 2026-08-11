import { createSessionToken, sessionCookieHeader, clearCookieHeader } from '../../_auth.js';

const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;

async function ensureAttemptsTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`).run();
}

// POST /api/admin/login  { password: "..." }
export async function onRequestPost(context) {
  const { request, env } = context;
  const db = env.DB;
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

  await ensureAttemptsTable(db);
  // Sweep old attempts on the way in — keeps the table small, no separate cron needed.
  await db.prepare(`DELETE FROM login_attempts WHERE created_at < datetime('now', ?)`)
    .bind(`-${WINDOW_MINUTES} minutes`).run();

  const { count: recentFailures } = await db.prepare(
    `SELECT COUNT(*) as count FROM login_attempts WHERE ip = ? AND created_at > datetime('now', ?)`
  ).bind(ip, `-${WINDOW_MINUTES} minutes`).first();

  if (recentFailures >= MAX_ATTEMPTS) {
    return new Response(JSON.stringify({
      error: `Too many failed attempts. Try again in a few minutes.`,
    }), { status: 429 });
  }

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
    await db.prepare('INSERT INTO login_attempts (ip) VALUES (?)').bind(ip).run();
    // Small delay too, on top of the lockout, so even the first few tries aren't instant.
    await new Promise(r => setTimeout(r, 400));
    const remaining = Math.max(0, MAX_ATTEMPTS - (recentFailures + 1));
    return new Response(JSON.stringify({
      error: remaining > 0 ? `Wrong password. ${remaining} attempt(s) left before a temporary lockout.` : 'Wrong password. Locked out for a few minutes now.',
    }), { status: 401 });
  }

  // Correct password — clear this IP's failure history.
  await db.prepare('DELETE FROM login_attempts WHERE ip = ?').bind(ip).run();

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

