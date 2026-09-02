// GET /api/category-counts — public, read-only.
// Returns { counts: { "Category Name": 47, ... }, total: 2995 }.
// Backed by the shared cached aggregate in _category-counts.js — see that
// file for why this exists instead of a raw query here.
import { getCategoryCounts } from '../_category-counts.js';

export async function onRequestGet(context) {
  try {
    const data = await getCategoryCounts(context);
    return new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=600',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to load category counts', detail: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
