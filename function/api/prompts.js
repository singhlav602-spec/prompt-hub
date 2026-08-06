// GET /api/prompts — public, read-only. Used by index.html / prompt.html
// instead of the old static prompts.json fetch.
export async function onRequestGet(context) {
  const { env } = context;
  try {
    const { results } = await env.DB.prepare(
      'SELECT slug, title, category, preview, prompt FROM prompts ORDER BY id ASC'
    ).all();

    return new Response(JSON.stringify(results), {
      headers: {
        'Content-Type': 'application/json',
        // Cache at the edge for a minute so repeat visits are fast, but
        // still pick up new prompts added via the admin dashboard quickly.
        'Cache-Control': 'public, max-age=60',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to load prompts', detail: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
