// POST /api/prompt-improver  { prompt: "..." } — PUBLIC, unauthenticated.
// Rewrites a rough prompt into a clearer, more effective one with Gemini.
// Same IP-rate-limit pattern as /api/seo-tool.

const MAX_PER_HOUR = 8;

async function ensureRateTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS prompt_improver_uses (
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
  await db.prepare(`DELETE FROM prompt_improver_uses WHERE created_at < datetime('now', '-1 hour')`).run();

  const { count: recentUses } = await db.prepare(
    `SELECT COUNT(*) as count FROM prompt_improver_uses WHERE ip = ? AND created_at > datetime('now', '-1 hour')`
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

  const roughPrompt = (body.prompt || '').trim().slice(0, 2000);
  if (!roughPrompt) {
    return new Response(JSON.stringify({ error: 'Paste a prompt first.' }), { status: 400 });
  }

  const instruction = `You are an expert prompt engineer. Rewrite the prompt below so it gets much better results from AI chat tools (ChatGPT, Claude, Gemini). Keep the same core goal — don't change what the person is trying to accomplish, just make the prompt itself clearer, more specific, and better structured.

Original prompt: ${roughPrompt}

Rules:
- "improvedPrompt": the rewritten prompt, ready to copy and use directly. No preamble.
- "whatChanged": 1-2 short, plain-language sentences on what you improved and why.
Plain text only — no markdown, no quotation marks.`;

  try {
    await db.prepare('INSERT INTO prompt_improver_uses (ip) VALUES (?)').bind(ip).run();

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: instruction }] }],
          generationConfig: {
            thinkingConfig: { thinkingLevel: 'low' },
            maxOutputTokens: 1536,
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                improvedPrompt: { type: 'STRING' },
                whatChanged: { type: 'STRING' },
              },
              required: ['improvedPrompt', 'whatChanged'],
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
