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
- "preview" is one plain sentence describing what it does.`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: instruction }] }],
          generationConfig: {
            // Gemini 3.x models think by default, and those thinking tokens
            // are deducted from maxOutputTokens — a low limit here (the old
            // value was 500) starves the actual answer, so the response
            // comes back truncated/empty. "low" keeps thinking light for
            // this simple task, and 2048 leaves real headroom either way.
            thinkingConfig: { thinkingLevel: 'low' },
            maxOutputTokens: 2048,
            // Structured output: Gemini returns JSON matching this shape
            // directly, no markdown fences or prompt-engineering needed to
            // coax valid JSON out of it.
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                title: { type: 'STRING' },
                category: { type: 'STRING' },
                preview: { type: 'STRING' },
                prompt: { type: 'STRING' },
              },
              required: ['title', 'category', 'preview', 'prompt'],
            },
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return new Response(JSON.stringify({ error: 'Gemini API error', detail: errText }), { status: 502 });
    }

    const data = await geminiRes.json();
    const candidate = data?.candidates?.[0];
    const rawText = candidate?.content?.parts?.[0]?.text || '';

    if (candidate?.finishReason === 'MAX_TOKENS' && !rawText) {
      return new Response(JSON.stringify({
        error: 'Gemini ran out of its token budget before producing an answer (finishReason: MAX_TOKENS). Try again — this should be rare with the current settings.',
      }), { status: 502 });
    }

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
