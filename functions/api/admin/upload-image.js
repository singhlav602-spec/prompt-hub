import { requireAuth } from '../../_auth.js';

// POST /api/admin/upload-image — takes a base64 image from the admin panel
// and commits it straight into the GitHub repo's /images folder via GitHub's
// Contents API, then hands back the raw.githubusercontent.com URL. No card
// or Cloudflare billing needed — just a GitHub token.
//
// Requires three Cloudflare Pages secrets (Settings → Environment variables):
//   GITHUB_TOKEN  — a GitHub Personal Access Token with repo write access
//   GITHUB_OWNER  — the GitHub username/org that owns the repo (e.g. singhlav602-spec)
//   GITHUB_REPO   — the repo name (e.g. prompt-hub)
// Optional:
//   GITHUB_BRANCH — defaults to "main" if not set

function sanitizeFilename(name) {
  const dot = name.lastIndexOf('.');
  const ext = dot > -1 ? name.slice(dot).toLowerCase().replace(/[^a-z0-9.]/g, '') : '.jpg';
  const base = (dot > -1 ? name.slice(0, dot) : name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'image';
  const stamp = Date.now().toString(36);
  return `${base}-${stamp}${ext || '.jpg'}`;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!(await requireAuth(request, env))) {
    return new Response(JSON.stringify({ error: 'Not authorized' }), { status: 401 });
  }

  if (!env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) {
    return new Response(JSON.stringify({
      error: 'Image upload isn\'t set up yet — GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPO need to be added as environment variables in Cloudflare Pages.',
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400 });
  }

  const { filename, dataBase64 } = body;
  if (!filename || !dataBase64) {
    return new Response(JSON.stringify({ error: 'filename and dataBase64 are required' }), { status: 400 });
  }
  if (dataBase64.length > 6 * 1024 * 1024) {
    return new Response(JSON.stringify({ error: 'Image too large — please use an image under 4MB.' }), { status: 413 });
  }

  const branch = env.GITHUB_BRANCH || 'main';
  const safeName = sanitizeFilename(filename);
  const path = `images/${safeName}`;
  const apiUrl = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;

  try {
    const ghRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
        'User-Agent': 'smartprompts-admin',
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `Upload image via admin panel: ${safeName}`,
        content: dataBase64,
        branch,
      }),
    });

    if (!ghRes.ok) {
      const detail = await ghRes.text().catch(() => '');
      let hint = 'Upload failed.';
      if (ghRes.status === 401) hint = 'GitHub rejected the token — it may be invalid or expired.';
      else if (ghRes.status === 404) hint = 'Repo not found — check GITHUB_OWNER and GITHUB_REPO are correct.';
      else if (ghRes.status === 403) hint = 'Token doesn\'t have permission to write to this repo.';
      return new Response(JSON.stringify({ error: hint, status: ghRes.status, detail }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const rawUrl = `https://raw.githubusercontent.com/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/${branch}/${path}`;
    return new Response(JSON.stringify({ ok: true, url: rawUrl, filename: safeName }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Upload failed', detail: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
