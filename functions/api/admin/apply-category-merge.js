// ONE-TIME TOOL: merges small / duplicate-named categories into a bigger one.
// Prompt URLs never change; only the category label does. Old category pages
// redirect (301) to the surviving category via functions/category/[slug].js.
//
//   1) Preview (changes nothing):  /api/admin/apply-category-merge
//   2) Apply:                      /api/admin/apply-category-merge?apply=1
//   3) Undo (old labels back):     /api/admin/apply-category-merge?rollback=1
//   Optional: add  &skip=YouTube Research,AI Art  (comma separated, exact names) to
//   leave some categories out - they simply keep working as they are.
//
// Admin login required. The old category of every moved prompt is saved first in
// table category_merge_backup. Category lists/homepage chips refresh within ~10 min.
// DELETE THIS FILE from the repo after use.
import { requireAuth } from '../../_auth.js';

const MERGES = [["AI Art", "AI Image", 44], ["AI Image & Video", "AI Image", 15], ["AI Image Editing", "AI Image", 32], ["AI Image Generation", "AI Image", 222], ["Create breathtaking", "AI Image", 35], ["Image Generation", "AI Image", 31], ["Image and video", "AI Image", 8], ["Images", "AI Image", 33], ["AI", "AI Tools", 15], ["Artificial Intelligence", "AI Tools", 19], ["Animation", "AI Video Prompts", 11], ["Video Generation", "AI Video Prompts", 24], ["Operations", "Business", 11], ["Presentations", "Business", 11], ["Project Management", "Business", 12], ["Recruitment", "Career", 10], ["Design & Creativity", "Design", 10], ["Web Design", "Design", 13], ["History", "Education", 8], ["Knowledge", "Education", 9], ["Study", "Education", 9], ["Teaching", "Education", 9], ["Email Marketing", "Email", 21], ["Beauty", "Fashion", 10], ["Event Planning", "Festivals", 20], ["Events", "Festivals", 7], ["Personal Finance", "Finance", 18], ["Food", "Food & Lifestyle", 12], ["Food & Cooking", "Food & Lifestyle", 10], ["Healthcare", "Health", 10], ["Sports", "Health", 10], ["Shopping & Lifestyle", "Home & Lifestyle", 11], ["Professional", "LinkedIn", 7], ["Advertising", "Marketing", 13], ["Affiliate Marketing", "Marketing", 11], ["Podcasting", "Podcast", 11], ["AI Control", "Prompt Engineering", 14], ["AI Prompt Generator", "Prompt Engineering", 20], ["AI Prompts", "Prompt Engineering", 11], ["Smart Prompts", "Prompt Engineering", 17], ["Analysis", "Research", 14], ["Product Reviews", "Reviews", 29], ["SEO & Marketing", "SEO", 12], ["SEO & Technical SEO", "SEO", 36], ["Advice", "Self Improvement", 13], ["Personal Development", "Self Improvement", 24], ["Twitter", "Social Media", 11], ["Sci-Fi & Futuristic", "Story", 11], ["Nature", "Travel", 12], ["Content Writing", "Writing", 26], ["Writing & Content", "Writing", 15], ["Writing & Content Creation", "Writing", 65], ["Influencer & Creator", "YouTube", 10], ["Vlogging", "YouTube", 11], ["YouTube Analytics", "YouTube", 15], ["YouTube Branding", "YouTube", 15], ["YouTube Content", "YouTube", 12], ["YouTube Design", "YouTube", 24], ["YouTube Growth", "YouTube", 24], ["YouTube Production", "YouTube", 11], ["YouTube Research", "YouTube", 30], ["YouTube SEO", "YouTube", 21], ["YouTube Strategy", "YouTube", 24]]; // [old_category, new_category, expected_prompt_count]

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!(await requireAuth(request, env))) return json({ error: 'Not authorized' }, 401);

  const db = env.DB;
  const q = new URL(request.url).searchParams;
  const apply = q.get('apply') === '1';
  const skip = new Set((q.get('skip') || '').split(',').map(s => s.trim()).filter(Boolean));

  if (q.get('rollback') === '1') {
    const exists = await db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='category_merge_backup'`)
      .first();
    if (!exists) return json({ error: 'No backup table - nothing to roll back.' }, 404);
    const res = await db
      .prepare(
        `UPDATE prompts
            SET category = (SELECT b.old_category FROM category_merge_backup b WHERE b.slug = prompts.slug),
                updated_at = datetime('now')
          WHERE slug IN (SELECT slug FROM category_merge_backup)`
      )
      .run();
    return json({ mode: 'ROLLED BACK', restored: (res.meta && res.meta.changes) || 0 });
  }

  const { results } = await db.prepare(`SELECT category, COUNT(*) AS n FROM prompts GROUP BY category`).all();
  const now = new Map(results.map(r => [r.category, r.n]));

  const plan = [];
  const problems = [];
  for (const [oldC, newC, expected] of MERGES) {
    if (skip.has(oldC)) continue;
    const have = now.get(oldC) || 0;
    if (!now.has(newC)) problems.push({ old: oldC, problem: `target category "${newC}" does not exist` });
    else if (have === 0) problems.push({ old: oldC, problem: 'old category already empty - skipped' });
    else {
      plan.push([oldC, newC, have]);
      if (have !== expected) problems.push({ old: oldC, note: `has ${have} prompts now, ${expected} when planned (will move all ${have})` });
    }
  }
  const total = plan.reduce((n, p) => n + p[2], 0);

  if (!apply) {
    return json({
      mode: 'PREVIEW - nothing was changed',
      categories_to_merge: plan.length,
      prompts_to_relabel: total,
      skipped_by_you: [...skip],
      notes_and_problems: problems,
      merges: plan.map(([o, n, c]) => `${o} (${c}) -> ${n}`),
      next_step: 'Open the same URL with ?apply=1. Undo later with ?rollback=1.',
    });
  }

  await db
    .prepare(`CREATE TABLE IF NOT EXISTS category_merge_backup (slug TEXT PRIMARY KEY, old_category TEXT NOT NULL)`)
    .run();

  let moved = 0;
  for (let i = 0; i < plan.length; i += 20) {
    const chunk = plan.slice(i, i + 20);
    const stmts = [];
    for (const [oldC] of chunk) {
      stmts.push(
        db
          .prepare(`INSERT OR IGNORE INTO category_merge_backup (slug, old_category) SELECT slug, category FROM prompts WHERE category = ?`)
          .bind(oldC)
      );
    }
    for (const [oldC, newC] of chunk) {
      stmts.push(
        db.prepare(`UPDATE prompts SET category = ?, updated_at = datetime('now') WHERE category = ?`).bind(newC, oldC)
      );
    }
    const res = await db.batch(stmts);
    for (let k = chunk.length; k < res.length; k++) moved += (res[k].meta && res[k].meta.changes) || 0;
  }

  return json({
    mode: 'APPLIED',
    categories_merged: plan.length,
    prompts_relabelled: moved,
    notes_and_problems: problems,
    note: 'Old category pages now redirect to the new ones once the category list cache refreshes (~10 min). Undo any time with ?rollback=1. Then delete apply-category-merge.js from the repo.',
  });
}
