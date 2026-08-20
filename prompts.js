import { requireAuth } from '../../_auth.js';
import { resolveTag, computeExpiry, VALID_TAGS } from '../../_tags.js';

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

// Adds the tag columns if they don't exist yet. Safe to call on every
// request — D1 just throws "duplicate column" after the first time, which
// we ignore. Means no separate manual migration step is needed.
async function ensureTagColumns(db) {
  try { await db.prepare("ALTER TABLE prompts ADD COLUMN tag TEXT DEFAULT 'normal'").run(); } catch (e) {}
  try { await db.prepare('ALTER TABLE prompts ADD COLUMN tag_expires_at TEXT').run(); } catch (e) {}
  try { await db.prepare('ALTER TABLE prompts ADD COLUMN featured_trending INTEGER NOT NULL DEFAULT 0').run(); } catch (e) {}
}

export async function onRequest(context) {
  const { request, env } = context;

  if (!(await requireAuth(request, env))) {
    return new Response(JSON.stringify({ error: 'Not authorized' }), { status: 401 });
  }

  const db = env.DB;
  const url = new URL(request.url);
  await ensureTagColumns(db);

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
      `SELECT id, slug, title, category, preview, prompt, tag, tag_expires_at, featured_trending FROM prompts ${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`
    ).bind(...params, pageSize, (page - 1) * pageSize).all();

    const results = rows.results.map(r => ({ ...r, tag: resolveTag(r) }));

    return new Response(JSON.stringify({ results, total, page, pageSize }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ---- POST: create (single, or bulk when body = { prompts: [...] }) ----
  if (request.method === 'POST') {
    const body = await request.json();

    // ---- Bulk import ----
    if (Array.isArray(body.prompts)) {
      const items = body.prompts;
      if (!items.length) {
        return new Response(JSON.stringify({ error: 'prompts array is empty' }), { status: 400 });
      }

      // Load existing titles/slugs once so every item can be deduped
      // in memory instead of one DB round-trip per item.
      const existingRows = await db.prepare('SELECT LOWER(TRIM(title)) as t, slug FROM prompts').all();
      const existingTitles = new Set(existingRows.results.map(r => r.t));
      const existingSlugs = new Set(existingRows.results.map(r => r.slug));
      const seenTitlesThisBatch = new Set();

      const skipped = [];
      const toInsert = [];

      for (const raw of items) {
        const title = (raw.title || '').trim();
        const category = (raw.category || '').trim();
        const prompt = (raw.prompt || '').trim();
        const preview = (raw.preview || '').trim();

        if (!title || !category || !prompt) {
          skipped.push({ title: title || '(no title)', reason: 'missing title, category, or prompt' });
          continue;
        }
        const titleKey = title.toLowerCase();
        if (existingTitles.has(titleKey) || seenTitlesThisBatch.has(titleKey)) {
          skipped.push({ title, reason: 'duplicate title' });
          continue;
        }
        seenTitlesThisBatch.add(titleKey);

        const tag = VALID_TAGS.includes(raw.tag) ? raw.tag : 'normal';
        const tagExpiresAt = computeExpiry(tag);
        const featuredTrending = raw.featured_trending ? 1 : 0;

        const baseSlug = slugify(raw.slug || title);
        let slug = baseSlug;
        let i = 2;
        while (existingSlugs.has(slug)) { slug = `${baseSlug}-${i}`; i += 1; }
        existingSlugs.add(slug);

        toInsert.push({ slug, title, category, preview, prompt, tag, tagExpiresAt, featuredTrending });
      }

      const BATCH_SIZE = 200;
      let imported = 0;
      for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
        const chunk = toInsert.slice(i, i + BATCH_SIZE);
        const stmts = chunk.map(p =>
          db.prepare(
            'INSERT INTO prompts (slug, title, category, preview, prompt, tag, tag_expires_at, featured_trending) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          ).bind(p.slug, p.title, p.category, p.preview, p.prompt, p.tag, p.tagExpiresAt, p.featuredTrending)
        );
        if (stmts.length) {
          await db.batch(stmts);
          imported += stmts.length;
        }
      }

      return new Response(JSON.stringify({ ok: true, imported, skipped, totalSubmitted: items.length }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ---- Single create ----
    if (!body.title || !body.category || !body.prompt) {
      return new Response(JSON.stringify({ error: 'title, category, and prompt are required' }), { status: 400 });
    }

    const dupe = await db.prepare(
      'SELECT id, slug FROM prompts WHERE LOWER(TRIM(title)) = LOWER(TRIM(?))'
    ).bind(body.title).first();
    if (dupe) {
      return new Response(
        JSON.stringify({ error: 'A prompt with this exact title already exists', existingSlug: dupe.slug }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const tag = VALID_TAGS.includes(body.tag) ? body.tag : 'normal';
    const tagExpiresAt = computeExpiry(tag);
    const featuredTrending = body.featured_trending ? 1 : 0;

    const baseSlug = slugify(body.slug || body.title);
    const slug = await uniqueSlug(db, baseSlug);
    await db.prepare(
      'INSERT INTO prompts (slug, title, category, preview, prompt, tag, tag_expires_at, featured_trending) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(slug, body.title, body.category, body.preview || '', body.prompt, tag, tagExpiresAt, featuredTrending).run();

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

    const dupe = await db.prepare(
      'SELECT id, slug FROM prompts WHERE LOWER(TRIM(title)) = LOWER(TRIM(?)) AND id != ?'
    ).bind(body.title, id).first();
    if (dupe) {
      return new Response(
        JSON.stringify({ error: 'A prompt with this exact title already exists', existingSlug: dupe.slug }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const tag = VALID_TAGS.includes(body.tag) ? body.tag : 'normal';
    const tagExpiresAt = computeExpiry(tag);
    const featuredTrending = body.featured_trending ? 1 : 0;

    let slug = body.slug ? slugify(body.slug) : slugify(body.title);
    slug = await uniqueSlug(db, slug, id);

    await db.prepare(
      `UPDATE prompts SET slug=?, title=?, category=?, preview=?, prompt=?, tag=?, tag_expires_at=?, featured_trending=?, updated_at=datetime('now') WHERE id=?`
    ).bind(slug, body.title, body.category, body.preview || '', body.prompt, tag, tagExpiresAt, featuredTrending, id).run();

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
      await db.prepare(`DELETE FROM prompts WHERE id IN (${placeholders})`).bind(...ids).run();
      return new Response(JSON.stringify({ ok: true, deleted: ids.length }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400 });
    await db.prepare('DELETE FROM prompts WHERE id=?').bind(id).run();
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response('Method not allowed', { status: 405 });
}
