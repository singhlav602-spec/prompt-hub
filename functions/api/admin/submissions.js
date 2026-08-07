import { requireAuth } from '../../_auth.js';

function slugify(title) {
  return title.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function uniqueSlug(db, base) {
  let slug = base;
  let i = 2;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await db.prepare('SELECT id FROM prompts WHERE slug = ?').bind(slug).first();
    if (!existing) return slug;
    slug = `${base}-${i}`;
    i += 1;
  }
}

async function ensureTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    preview TEXT,
    prompt TEXT NOT NULL,
    submitter_name TEXT,
    submitter_email TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now'))
  )`).run();
}

// GET  /api/admin/submissions?status=pending   — list (default status=pending)
// POST /api/admin/submissions  { id, action: 'approve' | 'reject' }
export async function onRequest(context) {
  const { request, env } = context;

  if (!(await requireAuth(request, env))) {
    return new Response(JSON.stringify({ error: 'Not authorized' }), { status: 401 });
  }

  const db = env.DB;
  await ensureTable(db);
  const url = new URL(request.url);

  if (request.method === 'GET') {
    const status = (url.searchParams.get('status') || 'pending').trim();
    const rows = await db.prepare(
      'SELECT * FROM submissions WHERE status = ? ORDER BY id DESC'
    ).bind(status).all();

    const countRow = await db.prepare(
      `SELECT COUNT(*) as c FROM submissions WHERE status = 'pending'`
    ).first();

    return new Response(JSON.stringify({ results: rows.results, pendingCount: countRow ? countRow.c : 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (request.method === 'POST') {
    const body = await request.json();
    const id = body.id;
    const action = body.action;
    if (!id || !['approve', 'reject'].includes(action)) {
      return new Response(JSON.stringify({ error: 'id and a valid action are required' }), { status: 400 });
    }

    const submission = await db.prepare('SELECT * FROM submissions WHERE id = ?').bind(id).first();
    if (!submission) {
      return new Response(JSON.stringify({ error: 'Submission not found' }), { status: 404 });
    }

    if (action === 'reject') {
      await db.prepare(`UPDATE submissions SET status = 'rejected' WHERE id = ?`).bind(id).run();
      return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
    }

    // approve: publish into the live prompts table, then mark handled
    const baseSlug = slugify(submission.title);
    const slug = await uniqueSlug(db, baseSlug);
    await db.prepare(
      'INSERT INTO prompts (slug, title, category, preview, prompt) VALUES (?, ?, ?, ?, ?)'
    ).bind(slug, submission.title, submission.category, submission.preview || '', submission.prompt).run();

    await db.prepare(`UPDATE submissions SET status = 'approved' WHERE id = ?`).bind(id).run();

    return new Response(JSON.stringify({ ok: true, slug }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response('Method not allowed', { status: 405 });
}
