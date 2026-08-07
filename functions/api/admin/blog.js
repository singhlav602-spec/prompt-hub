import { requireAuth } from '../../_auth.js';

function slugify(title) {
  return title.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function uniqueSlug(db, base, excludeId) {
  let slug = base;
  let i = 2;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await db.prepare(
      excludeId
        ? 'SELECT id FROM blog_posts WHERE slug = ? AND id != ?'
        : 'SELECT id FROM blog_posts WHERE slug = ?'
    ).bind(...(excludeId ? [slug, excludeId] : [slug])).first();
    if (!existing) return slug;
    slug = `${base}-${i}`;
    i += 1;
  }
}

async function ensureTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS blog_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    excerpt TEXT,
    content TEXT NOT NULL,
    published_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`).run();
}

export async function onRequest(context) {
  const { request, env } = context;

  if (!(await requireAuth(request, env))) {
    return new Response(JSON.stringify({ error: 'Not authorized' }), { status: 401 });
  }

  const db = env.DB;
  await ensureTable(db);
  const url = new URL(request.url);

  // ---- GET: list (paginated, optional search) ----
  if (request.method === 'GET') {
    const page = Math.max(1, Number(url.searchParams.get('page') || 1));
    const pageSize = 20;
    const search = (url.searchParams.get('search') || '').trim();

    let where = '';
    let params = [];
    if (search) {
      where = 'WHERE (title LIKE ? OR content LIKE ?)';
      params = [`%${search}%`, `%${search}%`];
    }

    const countRow = await db.prepare(`SELECT COUNT(*) as c FROM blog_posts ${where}`).bind(...params).first();
    const total = countRow ? countRow.c : 0;

    const rows = await db.prepare(
      `SELECT id, slug, title, excerpt, published_at FROM blog_posts ${where} ORDER BY published_at DESC LIMIT ? OFFSET ?`
    ).bind(...params, pageSize, (page - 1) * pageSize).all();

    return new Response(JSON.stringify({ results: rows.results, total, page, pageSize }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ---- POST: create (always publishes now — no draft state) ----
  if (request.method === 'POST') {
    const body = await request.json();
    if (!body.title || !body.content) {
      return new Response(JSON.stringify({ error: 'title and content are required' }), { status: 400 });
    }
    const slug = await uniqueSlug(db, slugify(body.title));
    await db.prepare(
      'INSERT INTO blog_posts (slug, title, excerpt, content) VALUES (?, ?, ?, ?)'
    ).bind(slug, body.title, body.excerpt || '', body.content).run();

    return new Response(JSON.stringify({ ok: true, slug }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ---- PUT: update (published_at is left untouched, so 24h "new" logic isn't reset by a typo fix) ----
  if (request.method === 'PUT') {
    const id = url.searchParams.get('id');
    if (!id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400 });
    const body = await request.json();
    if (!body.title || !body.content) {
      return new Response(JSON.stringify({ error: 'title and content are required' }), { status: 400 });
    }
    const slug = await uniqueSlug(db, slugify(body.title), id);

    await db.prepare(
      `UPDATE blog_posts SET slug=?, title=?, excerpt=?, content=?, updated_at=datetime('now') WHERE id=?`
    ).bind(slug, body.title, body.excerpt || '', body.content, id).run();

    return new Response(JSON.stringify({ ok: true, slug }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ---- DELETE ----
  if (request.method === 'DELETE') {
    const id = url.searchParams.get('id');
    if (!id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400 });
    await db.prepare('DELETE FROM blog_posts WHERE id=?').bind(id).run();
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response('Method not allowed', { status: 405 });
}
