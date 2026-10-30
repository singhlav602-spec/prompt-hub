// GET /api/admin/export-prompts            -> downloads every prompt as a CSV file
// GET /api/admin/export-prompts?format=json -> same data as JSON
//
// Admin-only (same login cookie as the admin panel). Open the URL in the
// browser where you're logged in to /admin.html and the file downloads.
// Reads the whole prompts table once per call — don't hit it in a loop.
import { requireAuth } from '../../_auth.js';

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return '"' + s.replace(/"/g, '""') + '"';
}

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!(await requireAuth(request, env))) {
    return new Response(JSON.stringify({ error: 'Not authorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(request.url);
  const format = (url.searchParams.get('format') || 'csv').toLowerCase();

  const { results } = await env.DB.prepare(
    'SELECT id, slug, title, category, preview, prompt FROM prompts ORDER BY id ASC'
  ).all();

  if (format === 'json') {
    return new Response(JSON.stringify(results), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="prompts-export.json"',
        'Cache-Control': 'no-store',
      },
    });
  }

  const cols = ['id', 'slug', 'title', 'category', 'preview', 'prompt'];
  const lines = [cols.join(',')];
  for (const r of results) {
    lines.push(cols.map(c => csvCell(r[c])).join(','));
  }
  // BOM so Excel / Google Sheets read Hindi and emoji correctly.
  const body = '\uFEFF' + lines.join('\r\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="prompts-export.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
