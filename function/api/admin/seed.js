import { requireAuth } from '../../_auth.js';

// POST /api/admin/seed — one-time button in admin.html.
// Creates the prompts table (if missing) and bulk-imports every entry from
// the site's existing /prompts.json — entirely server-side, triggered by a
// single tap from the browser. No CLI/computer needed.
export async function onRequestPost(context) {
  const { request, env } = context;

  if (!(await requireAuth(request, env))) {
    return new Response(JSON.stringify({ error: 'Not authorized' }), { status: 401 });
  }

  const db = env.DB;

  try {
    // 1. Make sure the table exists (safe to run even if it already does).
    await db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS prompts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        preview TEXT,
        prompt TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )`),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_prompts_category ON prompts(category)'),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_prompts_slug ON prompts(slug)'),
    ]);

    // 2. Don't double-import if this has already been run.
    const existing = await db.prepare('SELECT COUNT(*) as c FROM prompts').first();
    if (existing && existing.c > 0) {
      return new Response(JSON.stringify({
        ok: true, skipped: true,
        message: `Table already has ${existing.c} prompts — import skipped so nothing gets duplicated. Delete all rows first if you really want to re-import.`,
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // 3. Pull the existing static prompts.json that's already deployed on this site.
    const siteUrl = new URL(request.url);
    const jsonRes = await fetch(`${siteUrl.origin}/prompts.json`);
    if (!jsonRes.ok) throw new Error('Could not fetch /prompts.json from the live site');
    const prompts = await jsonRes.json();

    // 4. Insert in batches so we stay well within request limits.
    const BATCH_SIZE = 200;
    let imported = 0;
    const seenSlugs = new Set();

    for (let i = 0; i < prompts.length; i += BATCH_SIZE) {
      const chunk = prompts.slice(i, i + BATCH_SIZE);
      const stmts = [];
      for (const p of chunk) {
        if (!p.slug || seenSlugs.has(p.slug)) continue; // guard against any leftover dupes
        seenSlugs.add(p.slug);
        stmts.push(
          db.prepare('INSERT INTO prompts (slug, title, category, preview, prompt) VALUES (?, ?, ?, ?, ?)')
            .bind(p.slug, p.title, p.category, p.preview || '', p.prompt)
        );
      }
      if (stmts.length) {
        await db.batch(stmts);
        imported += stmts.length;
      }
    }

    return new Response(JSON.stringify({ ok: true, imported }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Import failed', detail: String(err) }), { status: 500 });
  }
}
