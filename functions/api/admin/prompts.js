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
        ? 'SELECT id FROM prompts WHERE slug = ? AND id != ?'
        : 'SELECT id FROM prompts WHERE slug = ?'
    ).bind(...(excludeId ? [slug, excludeId] : [slug])).first();
    if (!existing) return slug;
    slug = `${base}-${i}`;
    i += 1;
  }
}

export async function onRequest(context) {
  const { request, env } = context;

  if (!(await requireAuth(request, env))) {
    return new Response(JSON.stringify({ error: 'Not authorized' }), { status: 401 });
  }

  const db = env.DB;
  const url = new URL(request.url);

  // ---- GET: list (paginated, optional search/category filter) ----
  if (request.method === 'GET') {
    const page = Math.max(1, Number(url.searchParams.get('page') || 1));
    const pageSize = 25;
    const search = (url.searchParams.get('search') || '').trim();
    const category = (url.searchParams.get('category') || '').trim();

    let where = [];
    let params = [];
    if (search) {
      where.push('(title LIKE ? OR prompt LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    if (category) {
      where.push('category = ?');
      params.push(category);
    }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countRow = await db.prepare(`SELECT COUNT(*) as c FROM prompts ${whereClause}`).bind(...params).first();
    const total = countRow ? countRow.c : 0;

    const rows = await db.prepare(
      `SELECT id, slug, title, category, preview, prompt FROM prompts ${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`
    ).bind(...params, pageSize, (page - 1) * pageSize).all();

    return new Response(JSON.stringify({ results: rows.results, total, page, pageSize }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ---- POST: create ----
  if (request.method === 'POST') {
    const body = await request.json();
    if (!body.title || !body.category || !body.prompt) {
      return new Response(JSON.stringify({ error: 'title, category, and prompt are required' }), { status: 400 });
    }
    const baseSlug = slugify(body.slug || body.title);
    const slug = await uniqueSlug(db, baseSlug);
    await db.prepare(
      'INSERT INTO prompts (slug, title, category, preview, prompt) VALUES (?, ?, ?, ?, ?)'
    ).bind(slug, body.title, body.category, body.preview || '', body.prompt).run();

    return new Response(JSON.stringify({ ok: true, slug }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ---- PUT: update ----
  if (request.method === 'PUT') {
    const id = url.searchParams.get('id');
    if (!id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400 });
    const body = await request.json();
    if (!body.title || !body.category || !body.prompt) {
      return new Response(JSON.stringify({ error: 'title, category, and prompt are required' }), { status: 400 });
    }
    let slug = body.slug ? slugify(body.slug) : slugify(body.title);
    slug = await uniqueSlug(db, slug, id);

    await db.prepare(
      `UPDATE prompts SET slug=?, title=?, category=?, preview=?, prompt=?, updated_at=datetime('now') WHERE id=?`
    ).bind(slug, body.title, body.category, body.preview || '', body.prompt, id).run();

    return new Response(JSON.stringify({ ok: true, slug }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ---- DELETE ----
  if (request.method === 'DELETE') {
    const id = url.searchParams.get('id');
    if (!id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400 });
    await db.prepare('DELETE FROM prompts WHERE id=?').bind(id).run();
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response('Method not allowed', { status: 405 });
}
