// POST /api/submit — PUBLIC, no auth. Visitor-submitted prompts land here as
// "pending" and only appear on the live site once an admin approves them
// from the admin dashboard (see functions/api/admin/submissions.js).
export async function onRequestPost(context) {
  const { request, env } = context;
  const db = env.DB;

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400 });
  }

  // Honeypot: a hidden field real visitors never fill in. If it has a value,
  // silently pretend success so bots don't learn to look for a real error.
  if (body.website) {
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  }

  const title = (body.title || '').trim();
  const category = (body.category || '').trim();
  const prompt = (body.prompt || '').trim();
  const preview = (body.preview || '').trim();
  const submitterName = (body.submitter_name || '').trim().slice(0, 100);
  const submitterEmail = (body.submitter_email || '').trim().slice(0, 200);

  if (!title || !category || !prompt) {
    return new Response(JSON.stringify({ error: 'title, category, and prompt are required' }), { status: 400 });
  }
  if (title.length > 200 || prompt.length > 8000 || preview.length > 400) {
    return new Response(JSON.stringify({ error: 'One of the fields is too long' }), { status: 400 });
  }

  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      preview TEXT,
      prompt TEXT NOT NULL,
      submitter_name TEXT,
      submitter_email TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now'))
    )`).run();

    await db.prepare(
      `INSERT INTO submissions (title, category, preview, prompt, submitter_name, submitter_email)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(title, category, preview, prompt, submitterName || null, submitterEmail || null).run();

    return new Response(JSON.stringify({ ok: true }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Could not save submission', detail: String(err) }), { status: 500 });
  }
}
