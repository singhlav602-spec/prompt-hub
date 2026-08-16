// POST /api/image-prompt-generator  { idea: "..." } — PUBLIC, unauthenticated.
// Expands a simple idea into a detailed image-generation prompt with Gemini.
// Same IP-rate-limit pattern as /api/seo-tool.

const MAX_PER_HOUR = 8;

async function ensureRateTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS image_prompt_gen_uses (
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
  await db.prepare(`DELETE FROM image_prompt_gen_uses WHERE created_at < datetime('now', '-1 hour')`).run();

  const { count: recentUses } = await db.prepare(
    `SELECT COUNT(*) as count FROM image_prompt_gen_uses WHERE ip = ? AND created_at > datetime('now', '-1 hour')`
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

  const idea = (body.idea || '').trim().slice(0, 300);
  if (!idea) {
    return new Response(JSON.stringify({ error: 'Describe your image idea first.' }), { status: 400 });
  }

  const instruction = `You are an expert AI image prompt engineer. Expand the simple idea below into a detailed, vivid prompt suitable for AI image generators like Midjourney, DALL-E, or Stable Diffusion.

Idea: ${idea}

Rules:
- "imagePrompt": the detailed prompt — include subject details, art style, lighting, mood, and composition/camera angle. Ready to paste directly into an image generator. No preamble.
- "style": a short label for the visual style you used (e.g. "Cinematic photography", "Digital painting", "Anime style").
Plain text only — no markdown, no quotation marks.`;

  try {
    await db.prepare('INSERT INTO image_prompt_gen_uses (ip) VALUES (?)').bind(ip).run();

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
                imagePrompt: { type: 'STRING' },
                style: { type: 'STRING' },
              },
              required: ['imagePrompt', 'style'],
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
