import { requireAuth } from '../../_auth.js';

// POST /api/admin/generate  { topic: "...", category: "..." }
// Uses Gemini to draft a prompt entry (title/preview/prompt) for the admin
// to review and edit before saving — nothing is written to the DB here.
export async function onRequestPost(context) {
  const { request, env } = context;

  if (!(await requireAuth(request, env))) {
    return new Response(JSON.stringify({ error: 'Not authorized' }), { status: 401 });
  }

  if (!env.GEMINI_API_KEY) {
    return new Response(JSON.stringify({ error: 'Server not configured — GEMINI_API_KEY secret missing' }), { status: 500 });
  }

  const body = await request.json();
  const topic = (body.topic || '').trim();
  const category = (body.category || '').trim();
  if (!topic) {
    return new Response(JSON.stringify({ error: 'topic is required' }), { status: 400 });
  }

  const instruction = `You write entries for a free AI prompt library. Given a topic, produce ONE new prompt-library entry.

Topic: ${topic}
${category ? `Category: ${category}` : 'Pick a suitable short category name (e.g. Business, Coding, Marketing, Education, Writing).'}

Rules:
- The "prompt" field must be a ready-to-use instruction someone pastes into ChatGPT/Claude/Gemini, written as "Act as a ..." where natural.
- Include at least one [PLACEHOLDER] the user fills in, written in square brackets, UPPERCASE.
- "title" is a short 3-6 word name for the prompt.
- "preview" is one plain sentence describing what it does.
- Do not include any commentary outside the JSON.

Respond with ONLY this JSON object, no markdown fences, no extra text:
{"title": "...", "category": "...", "preview": "...", "prompt": "..."}`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: instruction }] }],
          generationConfig: { temperature: 0.8, maxOutputTokens: 500 },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return new Response(JSON.stringify({ error: 'Gemini API error', detail: errText }), { status: 502 });
    }

    const data = await geminiRes.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleaned = rawText.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return new Response(JSON.stringify({ error: 'Could not parse AI response', raw: rawText }), { status: 502 });
    }

    return new Response(JSON.stringify({ ok: true, draft: parsed }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Request failed', detail: String(err) }), { status: 500 });
  }
}
