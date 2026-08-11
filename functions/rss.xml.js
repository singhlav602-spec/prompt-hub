// GET /rss.xml — RSS 2.0 feed for the blog, built from the live D1 database
// on every request (same approach as /sitemap.xml). No manual regeneration
// step, never goes stale.

const DOMAIN = 'https://smart-prompt.in';

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Mirrors the blog-content formatting used on the site itself (script.js:
// textToParagraphs / applyInlineFormatting), so feed readers see the same
// bold/italic/heading/link formatting as the live post.
function applyInlineFormatting(line) {
  const linkStash = [];
  let out = line.replace(/\[([^\[\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, text, url) => {
    linkStash.push(`<a href="${url}">${text}</a>`);
    return `\u0000LINK${linkStash.length - 1}\u0000`;
  });
  out = out
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>');
  out = out.replace(/(https?:\/\/[^\s<]+)/g, url => {
    const trailingPunct = url.match(/[).,!?;:]+$/);
    const clean = trailingPunct ? url.slice(0, -trailingPunct[0].length) : url;
    const tail = trailingPunct ? trailingPunct[0] : '';
    return `<a href="${clean}">${clean}</a>${tail}`;
  });
  out = out.replace(/\u0000LINK(\d+)\u0000/g, (m, i) => linkStash[Number(i)]);
  return out;
}

function contentToHtml(escapedText) {
  return escapedText
    .split(/\n\s*\n/)
    .map(block => {
      const headingMatch = block.trim().match(/^(#{2,3})\s+(.+)$/);
      if (headingMatch) {
        const tag = headingMatch[1].length === 2 ? 'h2' : 'h3';
        return `<${tag}>${applyInlineFormatting(headingMatch[2])}</${tag}>`;
      }
      const lines = block.split('\n').map(applyInlineFormatting);
      return `<p>${lines.join('<br>')}</p>`;
    })
    .join('');
}

export async function onRequestGet(context) {
  const { env } = context;

  let posts = [];
  try {
    const { results } = await env.DB.prepare(
      'SELECT slug, title, excerpt, content, published_at FROM blog_posts ORDER BY published_at DESC LIMIT 30'
    ).all();
    posts = results;
  } catch (e) { /* table not reachable — serve an empty-but-valid feed below */ }

  const items = posts.map(p => {
    const link = `${DOMAIN}/blog-post.html?slug=${encodeURIComponent(p.slug)}`;
    const pubDate = new Date(String(p.published_at).replace(' ', 'T') + 'Z').toUTCString();
    const bodyHtml = contentToHtml(escapeXml(p.content || ''));
    return `
<item>
<title>${escapeXml(p.title)}</title>
<link>${link}</link>
<guid isPermaLink="true">${link}</guid>
<pubDate>${pubDate}</pubDate>
<description>${escapeXml(p.excerpt || p.title)}</description>
<content:encoded><![CDATA[${bodyHtml}]]></content:encoded>
</item>`;
  }).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
<title>SmartPrompts Blog</title>
<link>${DOMAIN}/blog.html</link>
<description>Articles, tips and updates from SmartPrompts — the free AI prompt library.</description>
<language>en-us</language>
<atom:link xmlns:atom="http://www.w3.org/2005/Atom" href="${DOMAIN}/rss.xml" rel="self" type="application/rss+xml" />${items}
</channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=UTF-8',
      'Cache-Control': 'public, max-age=1800',
    },
  });
}
