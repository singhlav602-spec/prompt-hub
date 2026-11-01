// ONE-TIME TOOL: converts {{snake_case}} blanks into the [BLANK NAME] style the
// site understands (highlighting, "fields to fill in", fill-blanks panel).
//   {{story_type}}  ->  [STORY TYPE]
//
//   1) Preview (changes nothing):  /api/admin/apply-placeholder-fix
//   2) Apply:                      /api/admin/apply-placeholder-fix?apply=1
//   3) Undo (restores old text):   /api/admin/apply-placeholder-fix?rollback=1
//
// Admin login required. Before changing anything, the old text of every
// affected prompt is saved in the table prompt_backup_braces (rollback uses it).
// Prompts with more than 12 different blanks are skipped on purpose (a
// 30-box form is unpleasant on a phone); change with ?max=20 if you want.
// Running it twice is harmless. DELETE THIS FILE from the repo after use.
import { requireAuth } from '../../_auth.js';

const RX = /\{\{([^{}]*)\}\}/g;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

function convToken(t) {
  return '[' + t.trim().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').toUpperCase() + ']';
}

function convert(text) {
  const fields = new Set();
  let ok = true;
  const out = text.replace(RX, (m, inner) => {
    const c = convToken(inner);
    // Must match the pattern the site uses to find blanks: [ 2-80 chars, no brackets ]
    if (!/^\[[^\[\]]{2,80}\]$/.test(c)) ok = false;
    fields.add(c);
    return c;
  });
  if (/\{\{|\}\}/.test(out)) ok = false;
  return { out, fields: fields.size, ok };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!(await requireAuth(request, env))) return json({ error: 'Not authorized' }, 401);

  const db = env.DB;
  const q = new URL(request.url).searchParams;
  const apply = q.get('apply') === '1';
  const rollback = q.get('rollback') === '1';
  const max = Math.max(1, Math.min(40, Number(q.get('max') || 12)));

  if (rollback) {
    const exists = await db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='prompt_backup_braces'`)
      .first();
    if (!exists) return json({ error: 'No backup table found - nothing to roll back.' }, 404);
    const res = await db
      .prepare(
        `UPDATE prompts
            SET prompt = (SELECT b.prompt FROM prompt_backup_braces b WHERE b.id = prompts.id),
                updated_at = datetime('now')
          WHERE id IN (SELECT id FROM prompt_backup_braces)`
      )
      .run();
    return json({ mode: 'ROLLED BACK', restored: (res.meta && res.meta.changes) || 0 });
  }

  const { results } = await db
    .prepare(`SELECT id, slug, prompt FROM prompts WHERE prompt LIKE '%{{%'`)
    .all();

  const eligible = [];
  const tooMany = [];
  const invalid = [];
  for (const r of results) {
    const c = convert(r.prompt);
    if (!c.ok) invalid.push(r.slug);
    else if (c.fields > max) tooMany.push(r.slug);
    else eligible.push({ id: r.id, slug: r.slug, out: c.out });
  }

  if (!apply) {
    const sample = eligible.slice(0, 3).map(e => {
      const old = results.find(r => r.id === e.id).prompt;
      return { slug: e.slug, before: old.slice(0, 220), after: e.out.slice(0, 220) };
    });
    return json({
      mode: 'PREVIEW - nothing was changed',
      prompts_with_double_braces: results.length,
      will_convert: eligible.length,
      skipped_more_than_max_fields: tooMany.length,
      skipped_invalid: invalid,
      max_fields_used: max,
      sample,
      next_step: 'Open the same URL with ?apply=1 to convert. Undo later with ?rollback=1.',
    });
  }

  // 1) Safety copy of the old text.
  await db
    .prepare(`CREATE TABLE IF NOT EXISTS prompt_backup_braces (id INTEGER PRIMARY KEY, prompt TEXT NOT NULL)`)
    .run();
  await db
    .prepare(`INSERT OR IGNORE INTO prompt_backup_braces (id, prompt) SELECT id, prompt FROM prompts WHERE prompt LIKE '%{{%'`)
    .run();

  // 2) Convert in batches of 50 statements (one D1 call per batch).
  let updated = 0;
  for (let i = 0; i < eligible.length; i += 50) {
    const stmts = eligible.slice(i, i + 50).map(e =>
      db
        .prepare(`UPDATE prompts SET prompt = ?, updated_at = datetime('now') WHERE id = ? AND prompt LIKE '%{{%'`)
        .bind(e.out, e.id)
    );
    const res = await db.batch(stmts);
    for (const r of res) updated += (r.meta && r.meta.changes) || 0;
  }

  return json({
    mode: 'APPLIED',
    updated,
    skipped_more_than_max_fields: tooMany.length,
    skipped_invalid: invalid,
    note: 'Pages may show old text for a few minutes (cache). Undo any time with ?rollback=1. Then delete apply-placeholder-fix.js from the repo.',
  });
}
