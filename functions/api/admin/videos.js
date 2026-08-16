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
        ? 'SELECT id FROM video_items WHERE slug = ? AND id != ?'
        : 'SELECT id FROM video_items WHERE slug = ?'
    ).bind(...(excludeId ? [slug, excludeId] : [slug])).first();
    if (!existing) return slug;
    slug = `${base}-${i}`;
    i += 1;
  }
}

// Pulls the 11-char YouTube video ID out of any of the common URL shapes
// (watch?v=, youtu.be/, /embed/, /shorts/) or accepts a bare ID as-is.
function extractYoutubeId(input) {
  const s = (input || '').trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtube\.com\/shorts\/|youtube\.com\/embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) return m[1];
  }
  return null;
}

async function ensureTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS video_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    youtube_id TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Other',
    prompt TEXT NOT NULL,
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
      where = 'WHERE title LIKE ?';
      params = [`%${search}%`];
    }

    const countRow = await db.prepare(`SELECT COUNT(*) as c FROM video_items ${where}`).bind(...params).first();
    const total = countRow ? countRow.c : 0;

    const rows = await db.prepare(
      `SELECT id, slug, title, youtube_id, category, prompt, published_at FROM video_items ${where} ORDER BY published_at DESC LIMIT ? OFFSET ?`
    ).bind(...params, pageSize, (page - 1) * pageSize).all();

    return new Response(JSON.stringify({ results: rows.results, total, page, pageSize }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ---- POST: create ----
  if (request.method === 'POST') {
    const body = await request.json();
    const youtubeId = extractYoutubeId(body.youtube_url);
    if (!body.title || !youtubeId || !body.prompt) {
      return new Response(JSON.stringify({
        error: !youtubeId
          ? 'Could not find a valid YouTube video ID in that URL'
          : 'title, youtube_url and prompt are required',
      }), { status: 400 });
    }
    const slug = await uniqueSlug(db, slugify(body.title));
    await db.prepare(
      'INSERT INTO video_items (slug, title, youtube_id, category, prompt) VALUES (?, ?, ?, ?, ?)'
    ).bind(slug, body.title, youtubeId, body.category?.trim() || 'Other', body.prompt).run();

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
    const youtubeId = extractYoutubeId(body.youtube_url);
    if (!body.title || !youtubeId || !body.prompt) {
      return new Response(JSON.stringify({
        error: !youtubeId
          ? 'Could not find a valid YouTube video ID in that URL'
          : 'title, youtube_url and prompt are required',
      }), { status: 400 });
    }
    const slug = await uniqueSlug(db, slugify(body.title), id);

    await db.prepare(
      `UPDATE video_items SET slug=?, title=?, youtube_id=?, category=?, prompt=?, updated_at=datetime('now') WHERE id=?`
    ).bind(slug, body.title, youtubeId, body.category?.trim() || 'Other', body.prompt, id).run();

    return new Response(JSON.stringify({ ok: true, slug }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ---- DELETE (single ?id= or bulk ?ids=1,2,3) ----
  if (request.method === 'DELETE') {
    const idsParam = url.searchParams.get('ids');
    const id = url.searchParams.get('id');
    if (idsParam) {
      const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean);
      if (!ids.length) return new Response(JSON.stringify({ error: 'ids required' }), { status: 400 });
      const placeholders = ids.map(() => '?').join(',');
      await db.prepare(`DELETE FROM video_items WHERE id IN (${placeholders})`).bind(...ids).run();
      return new Response(JSON.stringify({ ok: true, deleted: ids.length }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400 });
    await db.prepare('DELETE FROM video_items WHERE id = ?').bind(id).run();
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
}
