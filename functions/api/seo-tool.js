// POST /api/seo-tool  { topic: "..." } — PUBLIC, unauthenticated. Generates
// an SEO title + meta description with Gemini. Rate-limited per IP since
// anyone can call this (same D1-backed pattern as the admin login lockout).

const MAX_PER_HOUR = 8;

async function ensureRateTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS seo_tool_uses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`).run();
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const db = env.DB;
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

  if (!env.GEMINI_API_KEY) {
    return new Response(JSON.stringify({ error: 'Tool not configured yet — please try again later.' }), { status: 500 });
  }

  await ensureRateTable(db);
  await db.prepare(`DELETE FROM seo_tool_uses WHERE created_at < datetime('now', '-1 hour')`).run();

  const { count: recentUses } = await db.prepare(
    `SELECT COUNT(*) as count FROM seo_tool_uses WHERE ip = ? AND created_at > datetime('now', '-1 hour')`
  ).bind(ip).first();

  if (recentUses >= MAX_PER_HOUR) {
    return new Response(JSON.stringify({
      error: `You've hit the free limit (${MAX_PER_HOUR} per hour). Try again in a bit.`,
    }), { status: 429 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400 });
  }

  const topic = (body.topic || '').trim().slice(0, 300);
  if (!topic) {
    return new Response(JSON.stringify({ error: 'Please describe your page or topic first.' }), { status: 400 });
  }

  const instruction = `You are an SEO copywriter. Given a page topic, write ONE SEO title tag and ONE meta description for it.

Topic: ${topic}

Rules:
- "title" must be under 60 characters, compelling, includes the main keyword naturally, no clickbait.
- "metaDescription" must be under 155 characters, written to earn the click, includes the main keyword naturally, ends with a soft call to action if it fits.
- Plain text only — no quotation marks, no markdown, no emoji.`;

  try {
    await db.prepare('INSERT INTO seo_tool_uses (ip) VALUES (?)').bind(ip).run();

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: instruction }] }],
          generationConfig: {
            thinkingConfig: { thinkingLevel: 'low' },
            maxOutputTokens: 1024,
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                title: { type: 'STRING' },
                metaDescription: { type: 'STRING' },
              },
              required: ['title', 'metaDescription'],
            },
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return new Response(JSON.stringify({ error: 'Generation failed, please try again', detail: errText }), { status: 502 });
    }

    const data = await geminiRes.json();
    const candidate = data?.candidates?.[0];
    const rawText = candidate?.content?.parts?.[0]?.text || '';
    const cleaned = rawText.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return new Response(JSON.stringify({ error: 'Could not parse the result, please try again' }), { status: 502 });
    }

    return new Response(JSON.stringify({ ok: true, ...parsed }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Request failed', detail: String(err) }), { status: 500 });
  }
}
