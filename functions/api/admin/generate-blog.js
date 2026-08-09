import { requireAuth } from '../../_auth.js';

// POST /api/admin/generate-blog  { topic: "..." }
// Uses Gemini to draft a blog post (title/excerpt/content) for the admin
// to review and edit before publishing — nothing is written to the DB here.
export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    if (!(await requireAuth(request, env))) {
      return json({ error: 'Not authorized' }, 401);
    }

    if (!env.GEMINI_API_KEY) {
      return json({ error: 'Server not configured — GEMINI_API_KEY secret missing' }, 500);
    }

    const body = await request.json();
    const topic = (body.topic || '').trim();
    if (!topic) {
      return json({ error: 'topic is required' }, 400);
    }

    const instruction = `You write blog posts for SmartPrompts, a free AI prompt library website. Given a topic, produce ONE blog post about it.

Topic: ${topic}

Rules:
- "title" is a compelling, specific blog title (not generic).
- "excerpt" is one or two plain sentences summarizing the post, shown in the blog list.
- "content" is the full post, 400-700 words, written in plain paragraphs separated by blank lines (a blank line becomes a new paragraph on the site — do not use markdown headers or asterisks).
- Written for people who use ChatGPT/Claude/Gemini day to day — practical, not fluffy.
- Do not include any commentary outside the JSON.

Respond with ONLY this JSON object, no markdown fences, no extra text:
{"title": "...", "excerpt": "...", "content": "..."}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);

    let geminiRes;
    try {
      geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: instruction }] }],
            generationConfig: { maxOutputTokens: 1800 },
          }),
          signal: controller.signal,
        }
      );
    } catch (fetchErr) {
      if (fetchErr.name === 'AbortError') {
        return json({ error: 'Gemini API took too long to respond (timed out after 25s)' }, 504);
      }
      return json({ error: 'Could not reach Gemini API', detail: String(fetchErr) }, 502);
    } finally {
      clearTimeout(timer);
    }

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return json({ error: `Gemini API error (HTTP ${geminiRes.status})`, detail: errText }, 502);
    }

    const data = await geminiRes.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleaned = rawText.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return json({ error: 'Could not parse AI response', raw: rawText }, 502);
    }

    return json({ ok: true, draft: parsed });
  } catch (err) {
    return json({ error: 'Unexpected server error', detail: String(err && err.stack ? err.stack : err) }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
