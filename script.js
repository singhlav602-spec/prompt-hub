/* ============================================
   PROMPT LIBRARY — SCRIPT.JS
   Shared utilities + index page logic
   ============================================ */

/* ---- Fetch & Cache Prompts ---- */
let _promptsCache = null;

async function fetchPrompts() {
  if (_promptsCache) return _promptsCache;
  try {
    const res = await fetch('/api/prompts');
    if (!res.ok) throw new Error('Failed to load prompts.json');
    _promptsCache = await res.json();
    return _promptsCache;
  } catch (err) {
    console.error('Error loading prompts:', err);
    return [];
  }
}

/* ---- Fetch the auto-computed Trending/Rising/Popular/High-Demand list.
   Returns [] when there isn't enough real traffic data yet — callers
   should fall back to the curated DISCOVERY_PROMPTS seed list in that
   case (see renderHomepageDiscovery / initTrendingPromptsPage below). ---- */
let _discoveryCache = null;

async function fetchDiscoveryPrompts() {
  if (_discoveryCache) return _discoveryCache;
  try {
    const res = await fetch('/api/discovery');
    if (!res.ok) throw new Error('Failed to load discovery data');
    _discoveryCache = await res.json();
    return _discoveryCache;
  } catch (err) {
    console.error('Error loading discovery prompts:', err);
    return [];
  }
}

/* ---- Record a prompt page view for the auto-trending calculation.
   Fire-and-forget: never awaited by callers, and failures are silent. ---- */
function trackPromptView(slug) {
  try {
    /* Count a prompt once per browser session (refresh / coming back doesn't count again) — saves D1 writes. */
    try {
      const seen = JSON.parse(sessionStorage.getItem('sp_viewed') || '[]');
      if (seen.indexOf(slug) > -1) return;
      seen.push(slug);
      sessionStorage.setItem('sp_viewed', JSON.stringify(seen.slice(-300)));
    } catch (e) { /* storage blocked: just count it */ }
    fetch('/api/track-view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
    }).catch(() => {});
  } catch (err) { /* tracking must never break the page */ }
}

/* ---- Record a search that returned zero results — powers the admin
   "Search Gaps" panel (which prompt topics people want but can't find).
   Fire-and-forget, same idea as trackPromptView. ---- */
function trackSearchMiss(query) {
  try {
    fetch('/api/track-search-miss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    }).catch(() => {});
  } catch (err) { /* tracking must never break the page */ }
}

/* ---- Build Category Tag HTML ---- */
function categoryTag(cat) {
  return `<span class="card-category">${escapeHtml(cat)}</span>`;
}

/* ---- Escape HTML to prevent XSS ---- */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ---- Category name → URL slug, e.g. "Social Media" -> "social-media".
   Used for the /category/<slug> landing pages. Must stay identical to the
   server-side copy in functions/_slug.js — that copy decides which slugs
   are indexable, this one decides what actually renders, and they need to
   agree on every category or a page will 404 that shouldn't. ---- */
function slugifyCategory(name) {
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/* ---- Inject/replace a page's JSON-LD structured-data block. Only ever
   called with real fields the page actually has — no invented ratings,
   dates, or durations, since fabricated schema data is against Google's
   guidelines and can get a site penalized rather than helped. ---- */
function injectJsonLd(data) {
  let el = document.getElementById('json-ld-data');
  if (!el) {
    el = document.createElement('script');
    el.type = 'application/ld+json';
    el.id = 'json-ld-data';
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

/* Wraps [PLACEHOLDER] tokens (in already-escaped text) in a styled span so
   users instantly see what to customize before copying. */
/* --- AI tool deep-link config. ChatGPT's ?q= param reliably pre-fills + auto-sends.
   Gemini/Claude/Grok/DeepSeek have no public prefill param, so we copy the prompt
   to the clipboard and open the tool's homepage — honest about what each does. --- */
const AI_TOOLS = [
  { key: 'chatgpt', name: 'ChatGPT', prefill: true, url: (t) => `https://chatgpt.com/?q=${encodeURIComponent(t)}` },
  { key: 'gemini', name: 'Gemini', prefill: false, url: () => 'https://gemini.google.com/app' },
  { key: 'claude', name: 'Claude', prefill: false, url: () => 'https://claude.ai/new' },
  { key: 'grok', name: 'Grok', prefill: false, url: () => 'https://grok.com/' },
  { key: 'deepseek', name: 'DeepSeek', prefill: false, url: () => 'https://chat.deepseek.com/' },
];

/* Shared category → icon/color mapping, used by both the category cards
   and the featured-prompts list so they stay visually consistent. */
const CATEGORY_ICONS = {
  'Business': '💼', 'Marketing': '📣', 'Writing': '✍️', 'Coding': '💻',
  'Education': '🎓', 'Design': '🎨', 'Productivity': '⚡', 'Social Media': '📱',
  'Story': '📚', 'NotebookLM': '🗒️', 'YouTube': '▶️', 'Web Development': '🌐',
  'AI Image': '🖼️', 'Finance': '💰', 'Career': '💡', 'SEO': '🔍',
};
const CARD_COLORS = ['purple', 'blue', 'green', 'orange', 'pink', 'teal'];

/* Category → realistic audience list for the prompt-detail page's "Use
   cases" section. Previously this was one hardcoded array repeated
   verbatim on every single prompt page (~3000 pages, byte-for-byte
   identical text) — a big duplicate-content signal to Google. Keyed by
   the exact `category` string used in prompts.json; __default__ covers
   any category not listed here (e.g. a brand-new one added later via
   the admin panel) so this never breaks. */
const CATEGORY_USE_CASES = {
  'AI Image': ['Content creators', 'Designers', 'Social media marketers', 'Digital artists', 'Advertisers'],
  'Coding': ['Developers', 'Students', 'Software engineers', 'Bootcamp learners', 'Technical writers'],
  'Writing': ['Writers', 'Bloggers', 'Authors', 'Content marketers', 'Students'],
  'Marketing': ['Marketers', 'Small business owners', 'Agencies', 'Growth teams', 'Ecommerce sellers'],
  'Business': ['Entrepreneurs', 'Startup founders', 'Consultants', 'Managers', 'Small business owners'],
  'Education': ['Teachers', 'Students', 'Tutors', 'Homeschool parents', 'Curriculum designers'],
  'Web Development': ['Developers', 'Freelancers', 'Agencies', 'Startups', 'Web designers'],
  'YouTube': ['YouTubers', 'Video creators', 'Content creators', 'Influencers', 'Podcasters'],
  'Story': ['Writers', 'Novelists', 'Screenwriters', 'Students', 'Game designers'],
  'Social Media': ['Social media managers', 'Influencers', 'Marketers', 'Small businesses', 'Content creators'],
  'Productivity': ['Professionals', 'Remote workers', 'Students', 'Managers', 'Freelancers'],
  'Finance': ['Investors', 'Accountants', 'Financial advisors', 'Small business owners', 'Individuals'],
  'Career': ['Job seekers', 'Professionals', 'Career changers', 'Graduates', 'HR teams'],
  'Content Creation': ['Content creators', 'Bloggers', 'Marketers', 'YouTubers', 'Freelancers'],
  'SEO': ['SEO specialists', 'Bloggers', 'Marketers', 'Website owners', 'Agencies'],
  'Research': ['Students', 'Researchers', 'Academics', 'Analysts', 'Writers'],
  'Self Improvement': ['Individuals', 'Coaches', 'Students', 'Professionals', 'Lifelong learners'],
  'Learning': ['Students', 'Self-learners', 'Teachers', 'Professionals', 'Tutors'],
  'Startup': ['Founders', 'Entrepreneurs', 'Investors', 'Product managers', 'Startup teams'],
  'Freelancing': ['Freelancers', 'Consultants', 'Independent contractors', 'Creatives', 'Solopreneurs'],
  'Ecommerce': ['Store owners', 'Dropshippers', 'Marketers', 'Product managers', 'Sellers'],
  'Sales': ['Sales reps', 'Account executives', 'Business owners', 'Sales managers', 'Startups'],
  'UX': ['UX designers', 'Product designers', 'Researchers', 'Product managers', 'Developers'],
  'Data Analysis': ['Analysts', 'Data scientists', 'Researchers', 'Business analysts', 'Students'],
  'LinkedIn': ['Job seekers', 'Professionals', 'Recruiters', 'Marketers', 'Founders'],
  'Email': ['Marketers', 'Sales teams', 'Freelancers', 'Small businesses', 'Professionals'],
  'Psychology': ['Students', 'Therapists', 'Coaches', 'Researchers', 'Writers'],
  'Automation': ['Developers', 'Operations teams', 'Startups', 'Freelancers', 'Agencies'],
  'Prompt Engineering': ['AI enthusiasts', 'Developers', 'Marketers', 'Researchers', 'Product teams'],
  'Interview': ['Job seekers', 'Recruiters', 'HR teams', 'Career coaches', 'Graduates'],
  'AI Tools': ['AI enthusiasts', 'Developers', 'Marketers', 'Content creators', 'Students'],
  'Travel': ['Travelers', 'Bloggers', 'Travel agents', 'Content creators', 'Trip planners'],
  'Fitness': ['Trainers', 'Fitness enthusiasts', 'Coaches', 'Gym owners', 'Content creators'],
  'UI': ['UI designers', 'Product designers', 'Developers', 'Startups', 'Agencies'],
  'Design': ['Designers', 'Freelancers', 'Agencies', 'Marketers', 'Small businesses'],
  'Health': ['Health coaches', 'Individuals', 'Wellness bloggers', 'Content creators', 'Practitioners'],
  'Resume': ['Job seekers', 'Career coaches', 'Graduates', 'Recruiters', 'HR teams'],
  'Branding': ['Founders', 'Marketers', 'Designers', 'Agencies', 'Small businesses'],
  'NotebookLM': ['Students', 'Researchers', 'Professionals', 'Educators', 'Analysts'],
  'Python': ['Developers', 'Students', 'Data scientists', 'Engineers', 'Learners'],
  'JavaScript': ['Developers', 'Web developers', 'Students', 'Freelancers', 'Engineers'],
  'AI': ['AI enthusiasts', 'Developers', 'Researchers', 'Students', 'Professionals'],
  'Image Generation': ['Designers', 'Content creators', 'Marketers', 'Artists', 'Social media managers'],
  'Twitter': ['Marketers', 'Influencers', 'Founders', 'Content creators', 'Social media managers'],
  'Study': ['Students', 'Tutors', 'Teachers', 'Self-learners', 'Exam takers'],
  'Teaching': ['Teachers', 'Tutors', 'Educators', 'Trainers', 'Curriculum designers'],
  'AI Art': ['Artists', 'Designers', 'Content creators', 'Hobbyists', 'Illustrators'],
  'Motivation': ['Individuals', 'Coaches', 'Students', 'Professionals', 'Content creators'],
  'Guides': ['Writers', 'Educators', 'Content creators', 'Trainers', 'Bloggers'],
  'AI Video': ['Video creators', 'YouTubers', 'Marketers', 'Content creators', 'Agencies'],
  'AI Control': ['Developers', 'AI engineers', 'Researchers', 'Product teams', 'Enthusiasts'],
  'Video': ['Video editors', 'Content creators', 'YouTubers', 'Marketers', 'Agencies'],
  'Short Video': ['Content creators', 'Influencers', 'Marketers', 'Social media managers', 'Agencies'],
  'Strategy': ['Founders', 'Managers', 'Consultants', 'Marketers', 'Business owners'],
  'Analysis': ['Analysts', 'Researchers', 'Consultants', 'Managers', 'Students'],
  'Web Design': ['Designers', 'Freelancers', 'Agencies', 'Developers', 'Small businesses'],
  'Food': ['Food bloggers', 'Chefs', 'Content creators', 'Restaurant owners', 'Home cooks'],
  'Web Content': ['Writers', 'Marketers', 'Website owners', 'Freelancers', 'Agencies'],
  'Product': ['Product managers', 'Founders', 'Designers', 'Startups', 'Marketers'],
  'Creativity': ['Artists', 'Writers', 'Designers', 'Students', 'Creators'],
  'Entertainment': ['Content creators', 'Writers', 'Marketers', 'Influencers', 'Fans'],
  'Knowledge': ['Students', 'Researchers', 'Educators', 'Self-learners', 'Professionals'],
  'Advice': ['Individuals', 'Coaches', 'Professionals', 'Students', 'Readers'],
  '__default__': ['Professionals', 'Students', 'Freelancers', 'Content creators', 'Small business owners'],
};

window.openInAI = function(toolKey) {
  const tool = AI_TOOLS.find(t => t.key === toolKey);
  const text = window.__currentPromptText || '';
  if (!tool || !text) return;
  if (!tool.prefill && navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
  window.open(tool.url(text), '_blank', 'noopener');
};

function highlightPlaceholders(escapedText) {
  return escapedText.replace(/\[[^\[\]]{2,80}\]/g, match =>
    `<span class="placeholder-token">${match}</span>`
  );
}

/* ---- Likes & Saves: no accounts on this site, so "what did this browser
   like/save" lives in localStorage. The like *count* itself is shared
   (stored in D1, via /api/like-prompt); the saved list is 100% local and
   never leaves the browser. ---- */
function getLikedSlugs() {
  try { return JSON.parse(localStorage.getItem('sp_liked_prompts') || '[]'); } catch (e) { return []; }
}
function isLikedSlug(slug) {
  return getLikedSlugs().includes(slug);
}
function getSavedSlugs() {
  try { return JSON.parse(localStorage.getItem('sp_saved_prompts') || '[]'); } catch (e) { return []; }
}
function isSavedSlug(slug) {
  return getSavedSlugs().includes(slug);
}
function toggleSavedSlug(slug) {
  const saved = getSavedSlugs();
  const idx = saved.indexOf(slug);
  if (idx > -1) { saved.splice(idx, 1); } else { saved.push(slug); }
  localStorage.setItem('sp_saved_prompts', JSON.stringify(saved));
  return idx === -1; // true if now saved, false if now removed
}
async function toggleLikedSlug(slug, countEl) {
  const liked = getLikedSlugs();
  const idx = liked.indexOf(slug);
  const nowLiked = idx === -1;
  try {
    const res = await fetch('/api/like-prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, action: nowLiked ? 'like' : 'unlike' }),
    });
    const data = await res.json();
    if (res.ok && countEl) countEl.textContent = data.likes;
  } catch (e) { /* optimistic UI already updated below regardless */ }

  if (nowLiked) { liked.push(slug); } else { liked.splice(idx, 1); }
  localStorage.setItem('sp_liked_prompts', JSON.stringify(liked));
  return nowLiked;
}

/* ---- Build a Prompt Card element ---- */
function buildCard(prompt, delay = 0) {
  const a = document.createElement('a');
  a.className = 'prompt-card animate-fade-up' + (prompt.tag === 'trending' ? ' prompt-card-trending' : '');
  a.href = `/prompt?slug=${encodeURIComponent(prompt.slug)}`;
  a.style.animationDelay = `${delay}ms`;

  const tagBadge = prompt.tag === 'hot'
    ? '<span class="hot-badge">🔥 Hot</span>'
    : prompt.tag === 'trending'
      ? '<span class="hot-badge hot-badge-trending">✨ Trending</span>'
      : '';

  a.innerHTML = `
    <div class="card-top-row">${categoryTag(prompt.category)}${tagBadge}</div>
    <div class="card-title">${escapeHtml(prompt.title)}</div>
    <div class="card-preview">${escapeHtml(prompt.preview || prompt.prompt.slice(0, 110) + '…')}</div>
    <div class="card-footer">
      <div class="card-actions">
        <button type="button" class="card-action-btn card-like-btn${isLikedSlug(prompt.slug) ? ' active' : ''}" data-slug="${escapeHtml(prompt.slug)}" aria-label="Like this prompt">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="${isLikedSlug(prompt.slug) ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          <span class="card-like-count">${prompt.likes || 0}</span>
        </button>
        <button type="button" class="card-action-btn card-save-btn${isSavedSlug(prompt.slug) ? ' active' : ''}" data-slug="${escapeHtml(prompt.slug)}" aria-label="Save this prompt">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="${isSavedSlug(prompt.slug) ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
        </button>
      </div>
      <span class="card-open-btn">
        Open prompt
        <svg class="card-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
        </svg>
      </span>
    </div>
  `;

  a.querySelector('.card-like-btn').addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const btn = e.currentTarget;
    const countEl = btn.querySelector('.card-like-count');
    const nowLiked = await toggleLikedSlug(prompt.slug, countEl);
    btn.classList.toggle('active', nowLiked);
    btn.querySelector('svg').setAttribute('fill', nowLiked ? 'currentColor' : 'none');
  });
  a.querySelector('.card-save-btn').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const btn = e.currentTarget;
    const nowSaved = toggleSavedSlug(prompt.slug);
    btn.classList.toggle('active', nowSaved);
    btn.querySelector('svg').setAttribute('fill', nowSaved ? 'currentColor' : 'none');
  });

  return a;
}

/* ============================================================
   DISCOVERY SECTION — "🔥 Trending & Popular Prompts"
   Used by both the homepage strip (below the hero) and the
   standalone /trending-prompts.html page.

   EDITABLE DATA: just add/remove/reorder slugs below. Title,
   preview and category are pulled live from the real prompt
   data at render time (matched by slug) — nothing here is
   duplicated content, and a slug that no longer exists is
   skipped automatically instead of showing a broken card.
   ============================================================ */
const DISCOVERY_PROMPTS = [
  // 🔥 Trending — currently getting attention
  { slug: 'ai-banner-generator', badge: 'trending' },
  { slug: 'instagram-reel-script-generator', badge: 'trending' },
  { slug: 'youtube-thumbnail-idea-generator', badge: 'trending' },
  { slug: 'swot-analysis-generator', badge: 'trending' },
  { slug: 'code-reviewer', badge: 'trending' },

  // 🚀 High Demand — consistently searched / high-impression
  { slug: 'logo-idea-generator', badge: 'high-demand' },
  { slug: 'lesson-plan-generator', badge: 'high-demand' },
  { slug: 'blog-post-outline-generator', badge: 'high-demand' },
  { slug: 'high-converting-headline-generator', badge: 'high-demand' },
  { slug: 'career-roadmap-builder', badge: 'high-demand' },

  // ⭐ Popular — already getting good impressions
  { slug: 'twitter-thread-generator', badge: 'popular' },
  { slug: 'brand-name-generator', badge: 'popular' },
  { slug: 'seo-meta-description-writer', badge: 'popular' },
  { slug: 'startup-pitch-deck-outline', badge: 'popular' },
  { slug: 'poetry-generator', badge: 'popular' },

  // ↑ Rising — lower impressions but showing growth
  { slug: 'article-outline-generator', badge: 'rising' },
  { slug: 'ai-background-generator', badge: 'rising' },
  { slug: 'financial-goal-planner', badge: 'rising' },
  { slug: 'character-development-profile-generator', badge: 'rising' },
];

const DISCOVERY_BADGES = {
  'trending':    { label: '🔥 Trending',    className: 'discovery-badge-trending' },
  'rising':      { label: '↑ Rising',       className: 'discovery-badge-rising' },
  'popular':     { label: '⭐ Popular',      className: 'discovery-badge-popular' },
  'high-demand': { label: '🚀 High Demand', className: 'discovery-badge-high-demand' },
};

function buildDiscoveryCard(prompt, badgeKey) {
  const badge = DISCOVERY_BADGES[badgeKey];
  const a = document.createElement('a');
  a.className = 'prompt-card discovery-card';
  a.href = `/prompt?slug=${encodeURIComponent(prompt.slug)}`;
  a.innerHTML = `
    <div class="card-top-row">
      ${categoryTag(prompt.category)}
      ${badge ? `<span class="discovery-badge ${badge.className}">${badge.label}</span>` : ''}
    </div>
    <div class="card-title">${escapeHtml(prompt.title)}</div>
    <div class="card-preview">${escapeHtml(prompt.preview || prompt.prompt.slice(0, 90) + '…')}</div>
    <div class="card-footer">
      <span class="card-open-btn">
        View Prompt
        <svg class="card-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
        </svg>
      </span>
    </div>
  `;
  return a;
}

/* Builds the final list of {slug,title,category,preview,prompt,badge}
   items to show: tries the real, auto-computed /api/discovery data
   first, and only falls back to the hand-picked DISCOVERY_PROMPTS seed
   list (cross-referenced against the live prompt list by slug) when
   there isn't enough traffic data yet for /api/discovery to return
   anything. This is what makes the list start auto-updating itself
   the moment there's enough real page-view data — nothing else to
   change here when that happens. */
async function getDiscoveryItems(prompts) {
  const live = await fetchDiscoveryPrompts();
  if (live.length) return live;
  const bySlug = new Map(prompts.map(p => [p.slug, p]));
  return DISCOVERY_PROMPTS
    .map(d => { const p = bySlug.get(d.slug); return p ? { ...p, badge: d.badge } : null; })
    .filter(Boolean);
}

/* Renders the homepage strip (below the hero). */
async function renderHomepageDiscovery(prompts, container) {
  if (!container) return;
  container.classList.add('discovery-scroller');
  const items = await getDiscoveryItems(prompts);
  container.innerHTML = '';
  if (!items.length) {
    // Nothing to show yet (fresh site, no traffic data, and no seed
    // matches) — hide the whole section rather than an empty strip.
    const section = container.closest('.discovery-section');
    if (section) section.style.display = 'none';
    return;
  }
  items.forEach(item => container.appendChild(buildDiscoveryCard(item, item.badge)));
  injectDiscoveryStructuredData(items, false);
}

/* ============================================================
   TRENDING-PROMPTS PAGE (/trending-prompts.html)
   Same items as the homepage strip, shown as a filterable grid.
   ============================================================ */
async function initTrendingPromptsPage() {
  const grid = document.getElementById('discovery-page-grid');
  if (!grid) return;

  // Keep the reserved skeleton space in sync with DISCOVERY_PROMPTS
  // automatically — runs synchronously before the fetch below, so it's
  // done before the page paints. This way the skeleton count never goes
  // stale again: add or remove entries in DISCOVERY_PROMPTS above and the
  // reserved space adjusts itself on the next load, no manual edit here
  // needed. (Once real traffic makes /api/discovery return more items
  // than the curated list, the reserved space can undershoot again —
  // just by the difference, not by the whole list like before.)
  const skeletons = grid.querySelectorAll('.skeleton');
  const wanted = DISCOVERY_PROMPTS.length;
  for (let i = skeletons.length; i < wanted; i++) {
    const sk = document.createElement('div');
    sk.className = 'skeleton';
    sk.style.height = '220px';
    grid.appendChild(sk);
  }
  for (let i = skeletons.length - 1; i >= wanted; i--) {
    skeletons[i].remove();
  }

  const prompts = await fetchPrompts();
  const items = await getDiscoveryItems(prompts);

  const filterBar = document.getElementById('discovery-filter-bar');
  let activeBadge = 'All';

  function renderPills() {
    if (!filterBar) return;
    const counts = {};
    items.forEach(d => { counts[d.badge] = (counts[d.badge] || 0) + 1; });
    const allPill = `<button type="button" class="gallery-filter-pill${activeBadge === 'All' ? ' active' : ''}" data-badge="All">All <span class="gallery-filter-count">${items.length}</span></button>`;
    const badgePills = Object.keys(DISCOVERY_BADGES)
      .filter(key => counts[key])
      .map(key => `<button type="button" class="gallery-filter-pill${activeBadge === key ? ' active' : ''}" data-badge="${key}">${DISCOVERY_BADGES[key].label} <span class="gallery-filter-count">${counts[key]}</span></button>`)
      .join('');
    filterBar.innerHTML = allPill + badgePills;
    filterBar.querySelectorAll('.gallery-filter-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        activeBadge = btn.dataset.badge;
        renderPills();
        renderCards();
      });
    });
  }

  function renderCards() {
    const filtered = activeBadge === 'All' ? items : items.filter(d => d.badge === activeBadge);
    grid.innerHTML = '';
    filtered.forEach(d => grid.appendChild(buildDiscoveryCard(d, d.badge)));
    const emptyState = document.getElementById('discovery-empty-state');
    if (emptyState) emptyState.style.display = filtered.length ? 'none' : '';
  }

  renderPills();
  renderCards();

  /* --- Structured data for search engines: an ItemList of the (unfiltered)
     trending prompts, plus breadcrumbs. Injected once with the full list,
     independent of whatever filter pill is active on screen. --- */
  injectDiscoveryStructuredData(items, true);
}

function injectDiscoveryStructuredData(items, includeBreadcrumb) {
  const existing = document.getElementById('discovery-structured-data');
  if (existing) existing.remove();
  if (!items.length) return;

  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Trending & Popular AI Prompts',
    itemListElement: items.slice(0, 20).map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `https://smart-prompt.in/prompt?slug=${encodeURIComponent(p.slug)}`,
      name: p.title,
    })),
  };

  const payload = [itemList];

  if (includeBreadcrumb) {
    payload.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://smart-prompt.in/' },
        { '@type': 'ListItem', position: 2, name: 'Trending & Popular Prompts', item: 'https://smart-prompt.in/trending-prompts' },
      ],
    });
  }

  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.id = 'discovery-structured-data';
  script.textContent = JSON.stringify(payload);
  document.head.appendChild(script);
}

/* ---- /category/<slug> landing page. The server (functions/category/[slug].js)
   already injected the correct <title>/canonical/meta tags before this ever
   runs — this just fills in the body: match the URL slug back to a real
   category name (same slugify function as the server, so they always
   agree), then render that category's prompts into the standard grid. ---- */
async function initCategoryPage() {
  const pathMatch = window.location.pathname.match(/^\/category\/([^/]+)\/?$/);
  if (!pathMatch) return;
  const slugParam = decodeURIComponent(pathMatch[1]);

  const grid = document.getElementById('prompt-grid');
  const titleEl = document.getElementById('category-page-title');
  const countEl = document.getElementById('category-page-count');
  const emptyState = document.getElementById('category-empty-state');
  if (!grid) return;

  // Resolve the URL slug back to a real category name using the small
  // cached counts payload (not the full ~3000-row prompts table), then
  // fetch only that category's prompts server-side instead of fetching
  // everything and filtering client-side.
  let matchedCategory = null;
  let prompts = [];
  try {
    const countsRes = await fetch('/api/category-counts');
    if (countsRes.ok) {
      const { counts } = await countsRes.json();
      matchedCategory = Object.keys(counts).find(c => slugifyCategory(c) === slugParam) || null;
    }
  } catch (err) {
    console.error('Error loading category counts:', err);
  }

  if (!matchedCategory) {
    grid.style.display = 'none';
    if (countEl) countEl.style.display = 'none';
    if (emptyState) emptyState.style.display = '';
    return;
  }

  try {
    const res = await fetch(`/api/prompts?category=${encodeURIComponent(matchedCategory)}`);
    if (res.ok) prompts = await res.json();
  } catch (err) {
    console.error('Error loading category prompts:', err);
  }

  if (titleEl) titleEl.textContent = `${matchedCategory} Prompts`;
  document.title = `${matchedCategory} Prompts — Free AI Prompt Library | SmartPrompts`;

  // Unique intro copy per category — built from the same curated audience
  // list already used for each prompt's "Use cases" section (CATEGORY_USE_CASES),
  // so it's genuinely different per category (who it's for), not just the
  // category name swapped into an otherwise identical template. Thin,
  // near-duplicate body text across dozens of category pages is exactly
  // what tanks indexing — same problem the canonical-tag fix solved for
  // detail pages, just showing up as body content here instead.
  const introEl = document.getElementById('category-page-intro');
  if (introEl) {
    const audience = CATEGORY_USE_CASES[matchedCategory] || CATEGORY_USE_CASES.__default__;
    const promptCount = prompts.filter(p => p.category === matchedCategory).length;
    introEl.textContent = `Free, ready-to-copy ${matchedCategory} prompts — built for ${audience[0]}, ${audience[1]} and ${audience[2]}. Browse ${promptCount}+ prompts below, paste into ChatGPT, Claude, Gemini or any AI tool, and customize the placeholders for your own use case.`;
  }

  const count = renderGrid(prompts, grid, '', matchedCategory, { noCap: true });
  if (countEl) {
    countEl.innerHTML = `Showing <strong>${count}</strong> ${escapeHtml(matchedCategory)} prompt${count === 1 ? '' : 's'}`;
  }

  const categoryUrl = `https://smart-prompt.in/category/${encodeURIComponent(slugParam)}`;
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${matchedCategory} Prompts`,
    itemListElement: prompts
      .filter(p => p.category === matchedCategory)
      .slice(0, 20)
      .map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `https://smart-prompt.in/prompt?slug=${encodeURIComponent(p.slug)}`,
        name: p.title,
      })),
  };
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://smart-prompt.in/' },
      { '@type': 'ListItem', position: 2, name: `${matchedCategory} Prompts`, item: categoryUrl },
    ],
  };
  injectJsonLd([itemList, breadcrumb]);
}

/* ---- Render the Card Grid ---- */
function renderGrid(prompts, container, searchTerm = '', activeCategory = 'All', options = {}) {
  container.innerHTML = '';

  let filtered = prompts;

  if (activeCategory !== 'All') {
    filtered = filtered.filter(p => p.category === activeCategory);
  }

  if (searchTerm.trim()) {
    const q = searchTerm.toLowerCase();
    filtered = filtered.filter(p =>
      p.title.toLowerCase().includes(q) ||
      p.prompt.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      (p.preview && p.preview.toLowerCase().includes(q))
    );
  }

  // Trending prompts float to the top of any listing; hot ones come next.
  const tagRank = { trending: 0, hot: 1, normal: 2 };
  filtered = [...filtered].sort((a, b) =>
    (tagRank[a.tag] ?? 2) - (tagRank[b.tag] ?? 2)
  );

  const totalMatches = filtered.length;

  if (totalMatches === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <h3>No prompts found</h3>
        <p>Try a different search term or category.</p>
      </div>
    `;
    return 0;
  }

  // Render in batches instead of building every card (and every image/DOM
  // node it contains) at once — hundreds of cards for a broad match (e.g. a
  // single common letter, or a big category like YouTube's 274) made typing
  // and scrolling feel sluggish. A "Load more" button reveals the next
  // batch on demand instead of hard-cutting the list with just a note.
  // Callers with no live-typing box to narrow with (e.g. a category landing
  // page, which should show every prompt in that category up front for both
  // users and Google) pass { noCap: true } to skip batching entirely.
  const BATCH_SIZE = 50;
  const firstBatch = options.noCap ? filtered : filtered.slice(0, BATCH_SIZE);

  firstBatch.forEach((prompt, i) => {
    const card = buildCard(prompt, i * 25);
    container.appendChild(card);
  });

  if (!options.noCap && totalMatches > BATCH_SIZE) {
    let renderedCount = firstBatch.length;

    const loadMoreBtn = document.createElement('button');
    loadMoreBtn.type = 'button';
    loadMoreBtn.className = 'btn-primary btn-load-more';

    const updateLabel = () => {
      loadMoreBtn.textContent = `Load more (${renderedCount} of ${totalMatches})`;
    };
    updateLabel();

    loadMoreBtn.addEventListener('click', () => {
      const nextBatch = filtered.slice(renderedCount, renderedCount + BATCH_SIZE);
      nextBatch.forEach((prompt, i) => {
        const card = buildCard(prompt, i * 25);
        loadMoreBtn.insertAdjacentElement('beforebegin', card);
      });
      renderedCount += nextBatch.length;
      if (renderedCount >= totalMatches) {
        loadMoreBtn.remove();
      } else {
        updateLabel();
      }
    });

    container.appendChild(loadMoreBtn);
  }

  return totalMatches;
}

/* ---- Copy to Clipboard ---- */
async function copyToClipboard(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    const original = btn.innerHTML;
    btn.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      <span>Copied!</span>
    `;
    btn.classList.add('copied');
    setTimeout(() => {
      btn.innerHTML = original;
      btn.classList.remove('copied');
    }, 2200);
  } catch {
    // Fallback for older browsers
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    btn.textContent = '✓ Copied!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = '⎘ Copy Prompt';
      btn.classList.remove('copied');
    }, 2200);
  }
}

/* ============================================================
   INDEX PAGE LOGIC
   (runs only when #prompt-grid is present)
   ============================================================ */
async function initIndexPage() {
  // category.html reuses the exact same #prompt-grid id as the homepage
  // (both templates share that markup pattern), so the element-existence
  // check just below never returns early on a category page — meaning
  // this entire homepage init (including a full, unfiltered fetchPrompts()
  // call) was silently running a second time on every single category
  // page visit, then crashing partway through trying to populate
  // #category-grid, which only exists on the homepage. This guard stops
  // that: bail out immediately if we're anywhere under /category/.
  if (window.location.pathname.match(/^\/category\//)) return;

  const grid = document.getElementById('prompt-grid');
  if (!grid) return;

  const prompts = await fetchPrompts();

  /* --- Hero + featured blog banner + trending banner: hidden during
     category/search results views (see showList below); shown by default. --- */
  const heroSection = document.querySelector('.hero');
  const featuredBanner = document.getElementById('featured-blog-banner');
  const trendingBanner = document.getElementById('trending-banner');

  /* --- Hero badge: real prompt count, rounded down for a clean honest figure --- */
  const heroBadge = document.getElementById('hero-badge');
  if (heroBadge) {
    const roundedCount = Math.floor(prompts.length / 100) * 100;
    heroBadge.textContent = `✨ ${roundedCount}+ Premium Prompts`;
  }

  /* --- Stats bar (real numbers only — no invented user/rating stats) --- */
  const statsBar = document.getElementById('site-stats');
  if (statsBar) {
    const categoryCount = new Set(prompts.map(p => p.category)).size;
    const trendingCount = prompts.filter(p => p.trending).length;
    const stats = [
      { icon: '📖', value: `${prompts.length}+`, label: 'Prompts', color: 'purple' },
      { icon: '🗂️', value: `${Math.floor(categoryCount / 10) * 10}+`, label: 'Categories', color: 'blue' },
      { icon: '❤️', value: '100%', label: 'Free to Use', color: 'green' },
      { icon: '🚀', value: 'Growing', label: 'New Prompts', color: 'orange' },
    ];
    statsBar.innerHTML = stats.map(s => `
      <div class="stat-item">
        <div class="stat-icon stat-icon-${s.color}">${s.icon}</div>
        <div>
          <div class="stat-value">${s.value}</div>
          <div class="stat-label">${s.label}</div>
        </div>
      </div>
    `).join('');
  }

  /* --- Hero trending hashtags (real top categories, clickable) --- */
  const heroTags = document.getElementById('hero-tags');
  if (heroTags) {
    const catCountsForTags = {};
    prompts.forEach(p => { catCountsForTags[p.category] = (catCountsForTags[p.category] || 0) + 1; });
    const topForTags = Object.entries(catCountsForTags).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const tagsHtml = topForTags.map(([cat]) => `<a href="#" class="hero-tag" data-category="${escapeHtml(cat)}">#${escapeHtml(cat.replace(/\s+/g, ''))}</a>`).join('');
    heroTags.insertAdjacentHTML('beforeend', tagsHtml);
    heroTags.querySelectorAll('.hero-tag').forEach(tag => {
      tag.addEventListener('click', (e) => {
        e.preventDefault();
        location.hash = '#category=' + encodeURIComponent(tag.dataset.category);
        document.getElementById('list-header')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  /* --- Header search icon focuses the hero search field --- */
  const headerSearchBtn = document.getElementById('header-search-btn');
  if (headerSearchBtn) {
    headerSearchBtn.addEventListener('click', () => {
      const heroSearch = document.getElementById('search-hero');
      if (heroSearch) {
        heroSearch.scrollIntoView({ behavior: 'smooth', block: 'center' });
        heroSearch.focus();
      }
    });
  }

  /* --- Newsletter form (UI only — not yet connected to an email service) --- */
  const newsletterForm = document.getElementById('newsletter-form');
  if (newsletterForm) {
    newsletterForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const btn = newsletterForm.querySelector('button');
      const original = btn.innerHTML;
      btn.innerHTML = 'Coming soon!';
      btn.style.opacity = '0.7';
      setTimeout(() => { btn.innerHTML = original; btn.style.opacity = ''; }, 2200);
    });
  }

  const searchInput     = document.getElementById('search-input');
  const searchHero      = document.getElementById('search-hero');
  const countEl         = document.getElementById('prompt-count');
  const categoryBrowse  = document.getElementById('category-browse');
  const categoryGridEl  = document.getElementById('category-grid');
  const categoryTailEl  = document.getElementById('category-tail');
  const listHeader      = document.getElementById('list-header');
  const promoBanner     = document.querySelector('.promo-banner');
  const newsletterBar   = document.querySelector('.newsletter-bar');
  const backLink        = document.getElementById('back-to-categories');

  let activeCategory = 'All';
  let searchTerm = '';

  /* --- Build category cards (top categories) + long-tail chips.
     Anything an admin has manually pinned as "featured" (via the admin
     panel) always gets a full card, even if it wouldn't otherwise be in
     the top N by prompt count — the rest still fall back to count order. --- */
  const catCounts = {};
  prompts.forEach(p => { catCounts[p.category] = (catCounts[p.category] || 0) + 1; });
  const sortedCats = Object.entries(catCounts).sort((a, b) => b[1] - a[1]);
  const TOP_N = 12;

  let featuredCats = [];
  try {
    const featRes = await fetch('/api/category-settings');
    if (featRes.ok) featuredCats = (await featRes.json()).featured || [];
  } catch (e) { /* if this fails, just fall back to plain count-based order */ }

  const pinned = sortedCats.filter(([cat]) => featuredCats.includes(cat));
  const unpinned = sortedCats.filter(([cat]) => !featuredCats.includes(cat));
  const orderedCats = [...pinned, ...unpinned];
  const topCats = orderedCats.slice(0, TOP_N);
  const tailCats = orderedCats.slice(TOP_N);

  // Keep the reserved skeleton space in sync with TOP_N automatically —
  // same reasoning as the trending-prompts page fix. Runs before the
  // category cards are rendered below, so it's in place before paint.
  if (categoryGridEl) {
    const catSkeletons = categoryGridEl.querySelectorAll('.skeleton');
    for (let i = catSkeletons.length; i < TOP_N; i++) {
      const sk = document.createElement('div');
      sk.className = 'skeleton';
      sk.style.height = '150px';
      categoryGridEl.appendChild(sk);
    }
    for (let i = catSkeletons.length - 1; i >= TOP_N; i--) {
      catSkeletons[i].remove();
    }
  }


  const topPromptsSection = document.getElementById('top-prompts-section');

  function showCategoryBrowse() {
    activeCategory = 'All';
    searchTerm = '';
    if (searchInput) searchInput.value = '';
    if (searchHero) searchHero.value = '';
    if (heroSection) heroSection.style.display = '';
    if (featuredBanner) featuredBanner.style.display = '';
    if (trendingBanner) trendingBanner.style.display = '';
    categoryBrowse.style.display = '';
    if (statsBar) statsBar.style.display = '';
    if (topPromptsSection) topPromptsSection.style.display = '';
    if (promoBanner) promoBanner.style.display = '';
    if (newsletterBar) newsletterBar.style.display = '';
    listHeader.style.display = 'none';
    grid.style.display = 'none';
    // requestAnimationFrame, not an immediate call: the display toggles
    // just above change the page's total height, and scrollTo("smooth")
    // needs that settled first — calling it synchronously forces the
    // browser to recompute layout right in the middle of these writes
    // (PageSpeed flags this exact line as a "forced reflow"). Letting one
    // frame pass first means the layout is already done by the time we
    // ask for scroll geometry, so nothing has to be recomputed early.
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
  // Exposed so the global hashchange handler (bottom of file) can switch
  // back to this view when the "Categories" nav link is clicked while
  // already looking at a filtered list — a plain #anchor link alone can't
  // do that, since this section may currently be display:none.
  window.showCategoryBrowse = showCategoryBrowse;

  /* --- Debounce for zero-result search tracking (see showList above). --- */
  let searchMissTimer = null;

  function showList(category, term) {
    activeCategory = category;
    searchTerm = term || '';
    // Restore the hero in case we're arriving here from a filtered view —
    // but the trending banner and blog banner stay hidden here too, same
    // as the rest of "everything between the hero and the results" below.
    if (heroSection) heroSection.style.display = '';
    if (featuredBanner) featuredBanner.style.display = 'none';
    if (trendingBanner) trendingBanner.style.display = 'none';
    categoryBrowse.style.display = 'none';
    // Hide everything between the hero and the results so results land
    // right under the search box instead of way down the page.
    if (statsBar) statsBar.style.display = 'none';
    if (topPromptsSection) topPromptsSection.style.display = 'none';
    if (promoBanner) promoBanner.style.display = 'none';
    if (newsletterBar) newsletterBar.style.display = 'none';
    listHeader.style.display = 'flex';
    grid.style.display = '';
    const count = renderGrid(prompts, grid, searchTerm, activeCategory);
    if (countEl) {
      const label = searchTerm
        ? `Showing <strong>${count}</strong> results for "<strong>${escapeHtml(searchTerm)}</strong>"`
        : `Showing <strong>${count}</strong> of <strong>${prompts.length}</strong> prompts in <strong>${escapeHtml(category)}</strong>`;
      countEl.innerHTML = label;
    }

    // Track genuine zero-result searches (not every keystroke — only once
    // the person has actually stopped typing on a query that found nothing).
    clearTimeout(searchMissTimer);
    const trimmedTerm = searchTerm.trim();
    if (trimmedTerm.length >= 3 && count === 0) {
      searchMissTimer = setTimeout(() => trackSearchMiss(trimmedTerm), 1200);
    }

    // Same reasoning as showCategoryBrowse() above — renderGrid() just
    // rewrote a big chunk of the DOM, so scrollTo needs a frame to let
    // that layout settle before it asks for scroll geometry, or it forces
    // an early, synchronous recompute.
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
  window.showList = showList;

  categoryGridEl.innerHTML = topCats.map(([cat, count], i) => {
    const icon = CATEGORY_ICONS[cat] || '✨';
    const color = CARD_COLORS[i % CARD_COLORS.length];
    return `
    <a href="/category/${slugifyCategory(cat)}" class="category-card" data-category="${escapeHtml(cat)}">
      <div class="category-card-icon category-card-icon-${color}">${icon}</div>
      <div class="category-card-info">
        <div>
          <div class="category-card-name">${escapeHtml(cat)}</div>
          <div class="category-card-count">${count}+ Prompts</div>
        </div>
        <div class="category-card-arrow category-card-arrow-${color}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </div>
      </div>
    </a>
  `;
  }).join('');

  categoryTailEl.innerHTML = tailCats.map(([cat, count]) => `
    <button class="filter-btn" data-category="${escapeHtml(cat)}">${escapeHtml(cat)} · ${count}</button>
  `).join('');

  categoryGridEl.querySelectorAll('.category-card').forEach(el => {
    el.addEventListener('click', (e) => {
      // Real <a href="/category/..."> now (crawlable + ctrl/cmd-click opens
      // in a new tab correctly), but a plain click still does the instant
      // in-page filter instead of a full navigation — same fast UX as
      // before, just with a real link underneath it for Google and for
      // anyone who wants to open it directly.
      e.preventDefault();
      // A real hash change (not a direct showList() call) so this becomes
      // its own back-button stop — previously this was a silent JS-only
      // filter with no URL change, which is why "back" from a prompt page
      // opened from here had nowhere sensible to land.
      location.hash = '#category=' + encodeURIComponent(el.dataset.category);
    });
  });
  categoryTailEl.querySelectorAll('.filter-btn').forEach(el => {
    el.addEventListener('click', () => {
      location.hash = '#category=' + encodeURIComponent(el.dataset.category);
    });
  });

  /* --- Featured Prompts: one pick per top category, no invented view
     counts — just an honest, varied sample of the library.
     Skips anything already shown in the Trending strip above, so the
     homepage isn't showing the same prompt twice. --- */
  const topPromptsList = document.getElementById('top-prompts-list');
  if (topPromptsSection && topPromptsList) {
    // `trending` was referenced here but never defined anywhere in this
    // function — a pre-existing bug (present even in the original
    // upload) that threw a ReferenceError on every homepage load and
    // silently stopped the rest of initIndexPage from running. Defining
    // it directly from each prompt's `tag` field (same convention used
    // elsewhere in this file, e.g. the trending badge on prompt cards)
    // restores the intended behavior: skip prompts already tagged
    // trending so Featured Prompts doesn't repeat them.
    const trending = prompts.filter(p => p.tag === 'trending');
    const trendingSlugs = new Set(trending.map(p => p.slug));
    const usedCats = new Set();
    const picks = [];
    for (const [cat] of topCats) {
      const p = prompts.find(x => x.category === cat && !trendingSlugs.has(x.slug));
      if (p && !usedCats.has(cat)) { picks.push(p); usedCats.add(cat); }
      if (picks.length >= 5) break;
    }
    if (picks.length) {
      topPromptsList.innerHTML = picks.map((p, i) => {
        const icon = CATEGORY_ICONS[p.category] || '✨';
        const color = CARD_COLORS[i % CARD_COLORS.length];
        return `
          <a class="top-prompt-item" href="/prompt?slug=${encodeURIComponent(p.slug)}">
            <div class="stat-icon stat-icon-${color}">${icon}</div>
            <div class="top-prompt-info">
              <div class="top-prompt-title">${escapeHtml(p.title)}</div>
              <div class="top-prompt-desc">${escapeHtml(p.preview || p.prompt.slice(0, 90) + '…')}</div>
            </div>
            <div class="top-prompt-right">
              ${categoryTag(p.category)}
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </div>
          </a>
        `;
      }).join('');
      topPromptsSection.style.display = '';
    }
  }

  if (backLink) {
    backLink.addEventListener('click', (e) => {
      e.preventDefault();
      showCategoryBrowse();
    });
  }

  /* --- Handle ?q= from URL (e.g. redirected from prompt.html search) --- */
  const urlParams = new URLSearchParams(window.location.search);
  const urlQuery = urlParams.get('q');
  const initialHash = window.location.hash;
  if (urlQuery) {
    if (searchInput) searchInput.value = urlQuery;
    if (searchHero)  searchHero.value  = urlQuery;
    showList('All', urlQuery);
  } else if (initialHash.startsWith('#category=')) {
    showList(decodeURIComponent(initialHash.slice('#category='.length)));
  } else {
    showCategoryBrowse();
  }

  /* --- Scroll to whatever #section the URL points to (e.g. clicking
     "Categories" in the nav). --- */
  if (window.location.hash) {
    const target = document.querySelector(window.location.hash);
    if (target) {
      requestAnimationFrame(() => {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }

  /* --- Search handlers: typing always searches across all categories.
     Debounced so rapid typing on mobile doesn't trigger a full re-render
     (and re-filter of 2000+ prompts) on every single keystroke. --- */
  let searchDebounceTimer = null;

  function handleSearch(val, sourceEl) {
    // Only sync the OTHER input, never write back into the one being typed in —
    // re-assigning .value on the focused element mid-keystroke is what was
    // causing the jumpy/losing-focus feel on some mobile keyboards.
    if (searchInput && searchInput !== sourceEl) searchInput.value = val;
    if (searchHero && searchHero !== sourceEl) searchHero.value = val;

    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      if (val.trim()) {
        showList('All', val);
      } else {
        showCategoryBrowse();
      }
    }, 150);
  }

  if (searchInput) {
    searchInput.addEventListener('input', e => handleSearch(e.target.value, searchInput));
  }
  if (searchHero) {
    searchHero.addEventListener('input', e => handleSearch(e.target.value, searchHero));
  }
}

/* ============================================================
   PROMPT DETAIL PAGE LOGIC
   (runs only when #prompt-detail is present)
   ============================================================ */
async function initPromptPage() {
  const detail = document.getElementById('prompt-detail');
  if (!detail) return;

  const params = new URLSearchParams(window.location.search);
  const slug   = params.get('slug');

  if (!slug) {
    detail.innerHTML = `
      <div class="error-page animate-fade-up">
        <div class="error-code">404</div>
        <h2>No Prompt Specified</h2>
        <p>Please go back to the library and select a prompt.</p>
        <a href="/" class="btn-home">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          Back to Library
        </a>
      </div>
    `;
    return;
  }

  let prompt = null;
  let related = [];
  try {
    const res = await fetch(`/api/prompt-detail?slug=${encodeURIComponent(slug)}`);
    if (res.ok) {
      const data = await res.json();
      prompt = data.prompt;
      related = data.related || [];
    }
  } catch (err) {
    console.error('Error loading prompt:', err);
  }

  if (!prompt) {
    detail.innerHTML = `
      <div class="error-page animate-fade-up">
        <div class="error-code">404</div>
        <h2>Prompt Not Found</h2>
        <p>We couldn't find a prompt with the slug "<strong>${escapeHtml(slug)}</strong>".</p>
        <a href="/" class="btn-home">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          Back to Library
        </a>
      </div>
    `;
    return;
  }

  /* --- Set page title --- */
  document.title = `${prompt.title} — Free ChatGPT Prompt | SmartPrompts`;

  /* --- Fire-and-forget view tracking: powers the auto-computed
     Trending/Rising/Popular/High-Demand list at /api/discovery. Never
     awaited and errors are swallowed — a tracking failure must never
     affect what the visitor sees. --- */
  trackPromptView(prompt.slug);

  /* --- Set unique meta description, OG tags & canonical (critical for search CTR) --- */
  const pageDescription = (prompt.preview || prompt.prompt.slice(0, 140))
    + ` Free ${prompt.category} prompt — copy & use instantly.`;
  const pageUrl = `https://smart-prompt.in/prompt?slug=${encodeURIComponent(prompt.slug)}`;

  const metaDesc = document.getElementById('meta-description');
  if (metaDesc) metaDesc.setAttribute('content', pageDescription);

  const ogTitle = document.getElementById('meta-og-title');
  if (ogTitle) ogTitle.setAttribute('content', `${prompt.title} — Free ChatGPT Prompt`);

  const ogDesc = document.getElementById('meta-og-description');
  if (ogDesc) ogDesc.setAttribute('content', pageDescription);

  const ogUrl = document.getElementById('meta-og-url');
  if (ogUrl) ogUrl.setAttribute('content', pageUrl);

  const canonical = document.getElementById('canonical-link');
  if (canonical) canonical.setAttribute('href', pageUrl);

  /* --- JSON-LD structured data (helps Google understand & can improve snippet quality) --- */
  const ldJson = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    "name": prompt.title,
    "description": pageDescription,
    "url": pageUrl,
    "category": prompt.category,
    "isAccessibleForFree": true
  };
  let ldScript = document.getElementById('ld-json');
  if (!ldScript) {
    ldScript = document.createElement('script');
    ldScript.type = 'application/ld+json';
    ldScript.id = 'ld-json';
    document.head.appendChild(ldScript);
  }
  ldScript.textContent = JSON.stringify(ldJson);

  /* --- Breadcrumb JSON-LD (helps Google show breadcrumb trail in search results) --- */
  const categorySlug = slugifyCategory(prompt.category);
  const categoryUrl = `https://smart-prompt.in/category/${categorySlug}`;
  const ldBreadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://smart-prompt.in/" },
      { "@type": "ListItem", "position": 2, "name": prompt.category, "item": categoryUrl },
      { "@type": "ListItem", "position": 3, "name": prompt.title, "item": pageUrl }
    ]
  };
  let ldBreadcrumbScript = document.getElementById('ld-json-breadcrumb');
  if (!ldBreadcrumbScript) {
    ldBreadcrumbScript = document.createElement('script');
    ldBreadcrumbScript.type = 'application/ld+json';
    ldBreadcrumbScript.id = 'ld-json-breadcrumb';
    document.head.appendChild(ldBreadcrumbScript);
  }
  ldBreadcrumbScript.textContent = JSON.stringify(ldBreadcrumb);

  /* --- FAQ JSON-LD: mirrors the visible FAQ content exactly, so it's legitimate structured data --- */
  const ldFaq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      { "@type": "Question", "name": "Is this prompt free?", "acceptedAnswer": { "@type": "Answer", "text": "Yes — every prompt on SmartPrompts is free to use, copy, and customize." } },
      { "@type": "Question", "name": "Which AI models does it work with?", "acceptedAnswer": { "@type": "Answer", "text": "This is a plain-text prompt, so it works with ChatGPT, Gemini, Claude, Grok, DeepSeek, and most other AI chat tools." } },
      { "@type": "Question", "name": "How do I get better output?", "acceptedAnswer": { "@type": "Answer", "text": `Fill in the placeholder fields with specific, real details instead of vague ones — for a ${prompt.category} prompt like this, the more precise your input, the closer the AI's result will match what you actually need.` } },
      { "@type": "Question", "name": "Can I use the output commercially?", "acceptedAnswer": { "@type": "Answer", "text": "The prompt itself is free to use for any purpose. What you can do with the AI's output depends on the terms of the AI tool you use it with." } }
    ]
  };
  let ldFaqScript = document.getElementById('ld-json-faq');
  if (!ldFaqScript) {
    ldFaqScript = document.createElement('script');
    ldFaqScript.type = 'application/ld+json';
    ldFaqScript.id = 'ld-json-faq';
    document.head.appendChild(ldFaqScript);
  }
  ldFaqScript.textContent = JSON.stringify(ldFaq);

  const placeholderCount = (prompt.prompt.match(/\[[^\[\]]{2,80}\]/g) || []).length;
  window.__currentPromptText = prompt.prompt;

  /* --- Prompt variables: extracted directly from the prompt text, not invented --- */
  const variables = [...new Set((prompt.prompt.match(/\[[^\[\]]{2,80}\]/g) || []))];

  /* --- Difficulty: honest heuristic from actual prompt complexity, not a guess --- */
  const wordCount = prompt.prompt.trim().split(/\s+/).length;
  let difficulty = 'Beginner';
  if (placeholderCount >= 4 || wordCount > 60) difficulty = 'Advanced';
  else if (placeholderCount >= 2 || wordCount > 30) difficulty = 'Intermediate';

  const shareUrl = encodeURIComponent(pageUrl);
  const shareText = encodeURIComponent(`${prompt.title} — free AI prompt on SmartPrompts`);

  const relatedHTML = related.length > 0
    ? `
      <div class="related-section animate-fade-up" style="animation-delay:250ms">
        <div class="section-heading-row" style="margin-bottom:1.25rem;">
          <div class="related-title" style="margin-bottom:0;flex:1;">More in ${escapeHtml(prompt.category)}</div>
          <a href="/category/${categorySlug}" class="link-view-all">
            View all
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </a>
        </div>
        <div class="related-grid">
          ${related.map(r => `
            <a class="prompt-card" href="/prompt?slug=${encodeURIComponent(r.slug)}">
              ${categoryTag(r.category)}
              <div class="card-title">${escapeHtml(r.title)}</div>
              <div class="card-preview">${escapeHtml(r.preview || r.prompt.slice(0, 90) + '…')}</div>
              <div class="card-footer">
                <span class="card-open-btn">
                  Open
                  <svg class="card-arrow" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                  </svg>
                </span>
              </div>
            </a>
          `).join('')}
        </div>
      </div>
    `
    : '';

  detail.innerHTML = `
    <div class="prompt-page-wrap">
      <a href="/" class="back-link animate-fade-up">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
        </svg>
        All Prompts
      </a>

      <nav class="breadcrumb-nav animate-fade-up" aria-label="Breadcrumb">
        <a href="/">Home</a>
        <span class="breadcrumb-sep">/</span>
        <a href="/category/${categorySlug}">${escapeHtml(prompt.category)}</a>
        <span class="breadcrumb-sep">/</span>
        <span class="breadcrumb-current">${escapeHtml(prompt.title)}</span>
      </nav>

      <div class="animate-fade-up" style="animation-delay:50ms">
        <div class="prompt-page-meta-row">
          <a href="/category/${categorySlug}" class="prompt-page-category">${escapeHtml(prompt.category)}</a>
          <span class="difficulty-badge difficulty-${difficulty.toLowerCase()}">${difficulty}</span>
        </div>
        <h1 class="prompt-page-title">${escapeHtml(prompt.title)}</h1>
        <div class="prompt-page-actions-row">
          <button type="button" class="detail-action-btn detail-like-btn${isLikedSlug(prompt.slug) ? ' active' : ''}" id="detail-like-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="${isLikedSlug(prompt.slug) ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            <span id="detail-like-count">${prompt.likes || 0}</span> Likes
          </button>
          <button type="button" class="detail-action-btn detail-save-btn${isSavedSlug(prompt.slug) ? ' active' : ''}" id="detail-save-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="${isSavedSlug(prompt.slug) ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
            <span id="detail-save-label">${isSavedSlug(prompt.slug) ? 'Saved' : 'Save'}</span>
          </button>
        </div>
        <div class="prompt-page-divider"></div>
      </div>

      <div class="animate-fade-up" style="animation-delay:120ms">
        <div class="prompt-box">
          <span class="prompt-box-quote">&ldquo;</span>
          <div class="prompt-box-header">
            <div class="prompt-box-label">
              Prompt · ${prompt.prompt.trim().split(/\s+/).length} words${placeholderCount ? ` · ${placeholderCount} field${placeholderCount === 1 ? '' : 's'} to fill in` : ''}
            </div>
            <button class="copy-btn" id="copy-btn">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              <span>Copy Prompt</span>
            </button>
          </div>
          <div class="prompt-text" id="prompt-text">${highlightPlaceholders(escapeHtml(prompt.prompt))}</div>
        </div>
      </div>

      ${related.length > 0 ? `
      <div class="quick-related-row animate-fade-up" style="animation-delay:150ms">
        <span class="quick-related-label">Related:</span>
        ${related.map(r => `<a class="quick-related-link" href="/prompt?slug=${encodeURIComponent(r.slug)}">${escapeHtml(r.title)}</a>`).join('')}
      </div>
      ` : ''}

      <div class="prompt-info-section animate-fade-up" style="animation-delay:180ms">
        <h2 class="info-heading">What this prompt does</h2>
        <p class="info-text">${escapeHtml(prompt.preview || prompt.prompt.slice(0, 140))} It's a free ${escapeHtml(prompt.category)} prompt — fill in the details and get a ready-to-use result in seconds.</p>

        <h2 class="info-heading">How to use it</h2>
        <p class="info-text">${placeholderCount > 0
          ? `Replace the ${placeholderCount} highlighted placeholder${placeholderCount === 1 ? '' : 's'} above with your own details, then copy the prompt and paste it into your AI chat.`
          : `Copy the prompt above and paste it directly into your AI chat — no edits needed.`}</p>

        <h2 class="info-heading">Best for</h2>
        <p class="info-text-sm">Tap a tool to open it — ChatGPT opens with this prompt pre-filled; others copy the prompt for you to paste.</p>
        <div class="chip-row">
          ${AI_TOOLS.map(t => `<button type="button" class="chip chip-ai" onclick="openInAI('${t.key}')">${t.name}</button>`).join('')}
        </div>

        <h2 class="info-heading">Use cases</h2>
        <div class="chip-row">
          ${(CATEGORY_USE_CASES[prompt.category] || CATEGORY_USE_CASES.__default__).map(u => `<span class="chip chip-outline">${escapeHtml(u)}</span>`).join('')}
        </div>

        ${variables.length > 0 ? `
        <h2 class="info-heading">Prompt variables</h2>
        <div class="chip-row">
          ${variables.map(v => `<span class="chip chip-var">${escapeHtml(v)}</span>`).join('')}
        </div>
        ` : ''}
      </div>

      <div class="prompt-info-section animate-fade-up" style="animation-delay:210ms">
        <h2 class="info-heading">FAQ</h2>
        <div class="faq-item">
          <div class="faq-q">Is this prompt free?</div>
          <div class="faq-a">Yes — every prompt on SmartPrompts is free to use, copy, and customize.</div>
        </div>
        <div class="faq-item">
          <div class="faq-q">Which AI models does it work with?</div>
          <div class="faq-a">This is a plain-text prompt, so it works with ChatGPT, Gemini, Claude, Grok, DeepSeek, and most other AI chat tools.</div>
        </div>
        <div class="faq-item">
          <div class="faq-q">How do I get better output?</div>
          <div class="faq-a">Fill in the placeholder fields with specific, real details instead of vague ones — for a ${escapeHtml(prompt.category)} prompt like this, the more precise your input, the closer the AI's result will match what you actually need.</div>
        </div>
        <div class="faq-item">
          <div class="faq-q">Can I use the output commercially?</div>
          <div class="faq-a">The prompt itself is free to use for any purpose. What you can do with the AI's output depends on the terms of the AI tool you use it with — check that tool's own usage policy.</div>
        </div>
      </div>

      <div class="prompt-info-section animate-fade-up" style="animation-delay:230ms">
        <h2 class="info-heading">Share this prompt</h2>
        <div class="share-row">
          <a class="share-btn" target="_blank" rel="noopener" href="https://api.whatsapp.com/send?text=${shareText}%20${shareUrl}">WhatsApp</a>
          <a class="share-btn" target="_blank" rel="noopener" href="https://t.me/share/url?url=${shareUrl}&text=${shareText}">Telegram</a>
          <a class="share-btn" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${shareUrl}">Facebook</a>
          <a class="share-btn" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}">X</a>
        </div>
        <a class="report-link" href="mailto:REPLACE_WITH_YOUR_EMAIL@example.com?subject=${encodeURIComponent('Issue with prompt: ' + prompt.title)}">Prompt not working? Report it →</a>
      </div>

      ${relatedHTML}
    </div>
  `;

  /* --- Wire up copy button --- */
  const copyBtn = document.getElementById('copy-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      copyToClipboard(window.__currentPromptText || prompt.prompt, copyBtn);   // filled-in text when the visitor typed something
    });
  }

  /* --- Fill the blanks: boxes for every [BLANK]. Copy keeps working whether or not they are filled. --- */
  if (window.spFillBlanks) window.spFillBlanks(prompt.prompt);

  const detailLikeBtn = document.getElementById('detail-like-btn');
  if (detailLikeBtn) {
    detailLikeBtn.addEventListener('click', async () => {
      const countEl = document.getElementById('detail-like-count');
      const nowLiked = await toggleLikedSlug(prompt.slug, countEl);
      detailLikeBtn.classList.toggle('active', nowLiked);
      detailLikeBtn.querySelector('svg').setAttribute('fill', nowLiked ? 'currentColor' : 'none');
    });
  }
  const detailSaveBtn = document.getElementById('detail-save-btn');
  if (detailSaveBtn) {
    detailSaveBtn.addEventListener('click', () => {
      const nowSaved = toggleSavedSlug(prompt.slug);
      detailSaveBtn.classList.toggle('active', nowSaved);
      detailSaveBtn.querySelector('svg').setAttribute('fill', nowSaved ? 'currentColor' : 'none');
      document.getElementById('detail-save-label').textContent = nowSaved ? 'Saved' : 'Save';
    });
  }
}

/* ============================================================
   BLOG
   ============================================================ */
let _blogCache = null;

async function fetchBlogPosts() {
  if (_blogCache) return _blogCache;
  try {
    const res = await fetch('/api/blog');
    if (!res.ok) throw new Error('Failed to load blog posts');
    _blogCache = await res.json();
    return _blogCache;
  } catch (err) {
    console.error('Error loading blog posts:', err);
    return [];
  }
}

function formatBlogDate(iso) {
  try {
    return new Date(iso + 'Z').toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return '';
  }
}

/* Applies simple markdown-style inline formatting to an already-escaped line:
   **bold**, *italic* (or _italic_), [link text](url), and bare URLs typed
   directly (auto-linked). */
function applyInlineFormatting(line) {
  // Markdown-style links are pulled out into placeholders first, so the
  // bare-URL auto-linker below doesn't also try to wrap the same URL again.
  const linkStash = [];
  let out = line.replace(/\[([^\[\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, text, url) => {
    linkStash.push(`<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`);
    return `\u0000LINK${linkStash.length - 1}\u0000`;
  });

  out = out
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>');

  // Auto-link any plain https://... URL typed straight into the text.
  out = out.replace(/(https?:\/\/[^\s<]+)/g, url => {
    const trailingPunct = url.match(/[).,!?;:]+$/);
    const clean = trailingPunct ? url.slice(0, -trailingPunct[0].length) : url;
    const tail = trailingPunct ? trailingPunct[0] : '';
    return `<a href="${clean}" target="_blank" rel="noopener noreferrer">${clean}</a>${tail}`;
  });

  out = out.replace(/\u0000LINK(\d+)\u0000/g, (m, i) => linkStash[Number(i)]);
  return out;
}

/* Converts already-escaped text into HTML. Blank lines start new paragraphs;
   a line starting with ## or ### becomes a heading; **bold** / *italic* work
   anywhere. */
function textToParagraphs(escapedText) {
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

/* --- Homepage "new post" banner ---
   Priority: a manually pinned post always shows (until unpinned).
   Otherwise, the newest post shows for its first 24h — but only if
   "show on homepage" was ticked for it in the admin panel.
   Once a visitor actually opens that post, it's remembered (localStorage)
   so the banner stops nagging them about a post they've already read. */
function getSeenBannerSlugs() {
  try { return JSON.parse(localStorage.getItem('sp_seen_blog_banners') || '[]'); } catch (e) { return []; }
}
function markBannerSlugSeen(slug) {
  try {
    const seen = getSeenBannerSlugs();
    if (!seen.includes(slug)) {
      seen.push(slug);
      while (seen.length > 50) seen.shift(); // keep it small
      localStorage.setItem('sp_seen_blog_banners', JSON.stringify(seen));
    }
  } catch (e) { /* localStorage unavailable — banner just keeps showing, harmless */ }
}

async function initFeaturedBlogBanner() {
  const banner = document.getElementById('featured-blog-banner');
  if (!banner) return;

  const posts = await fetchBlogPosts();
  if (!posts.length) return;

  const pinned = posts.find(p => p.pinned);
  let featured = null;

  if (pinned) {
    featured = pinned;
  } else {
    const newest = posts[0]; // /api/blog already orders by published_at DESC
    if (newest.show_on_home) {
      const publishedMs = new Date(newest.published_at + 'Z').getTime();
      const ageMs = Date.now() - publishedMs;
      const DAY_MS = 24 * 60 * 60 * 1000;
      if (!isNaN(publishedMs) && ageMs >= 0 && ageMs < DAY_MS) featured = newest;
    }
  }

  if (!featured) return;
  if (getSeenBannerSlugs().includes(featured.slug)) return; // this visitor already opened it

  document.getElementById('featured-blog-banner-title').textContent = featured.title;
  document.getElementById('featured-blog-banner-link').href = `/blog-post?slug=${encodeURIComponent(featured.slug)}`;
  banner.classList.add('show');
}

/* --- Progressive/"lazy" grid rendering: renders `items` into `grid` in
   batches instead of dumping everything into the DOM at once — matters once
   a gallery/video library grows into the hundreds or thousands. The next
   batch renders as `sentinel` scrolls near the viewport. Images inside each
   card should also carry loading="lazy" so the browser defers the actual
   image bytes too, not just the DOM insertion. Call fresh (not incrementally)
   whenever the underlying item list changes, e.g. a filter pill switch. --- */
function renderGridInBatches(grid, sentinel, items, batchSize, cardHtmlFn) {
  if (grid._batchObserver) grid._batchObserver.disconnect();
  grid.innerHTML = '';
  let rendered = 0;

  function renderNextBatch() {
    const next = items.slice(rendered, rendered + batchSize);
    if (!next.length) return;
    grid.insertAdjacentHTML('beforeend', next.map(cardHtmlFn).join(''));
    rendered += next.length;
    if (rendered >= items.length && grid._batchObserver) {
      grid._batchObserver.disconnect();
    }
  }

  renderNextBatch();
  if (!sentinel || rendered >= items.length) return;

  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) renderNextBatch();
  }, { rootMargin: '400px' });
  observer.observe(sentinel);
  grid._batchObserver = observer;
}

/* --- Gallery: fetch + list page (gallery.html) + detail page (gallery-item.html) --- */
let _galleryCache = null;
async function fetchGalleryItems() {
  if (_galleryCache) return _galleryCache;
  try {
    const res = await fetch('/api/gallery');
    if (!res.ok) throw new Error('Failed to load gallery items');
    _galleryCache = await res.json();
    return _galleryCache;
  } catch (err) {
    console.error('Error loading gallery items:', err);
    return [];
  }
}

async function initGalleryListPage() {
  const grid = document.getElementById('gallery-grid');
  if (!grid) return;

  const items = await fetchGalleryItems();
  const emptyState = document.getElementById('gallery-empty-state');
  const filterBar = document.getElementById('gallery-filter-bar');

  if (!items.length) {
    grid.style.display = 'none';
    if (filterBar) filterBar.style.display = 'none';
    if (emptyState) emptyState.style.display = '';
    return;
  }

  // Build the category pill list from whatever categories are actually in
  // use, most-populated first, with "All" pinned at the front.
  const counts = {};
  items.forEach(g => { counts[g.category || 'Other'] = (counts[g.category || 'Other'] || 0) + 1; });
  const categories = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);

  let activeCategory = 'All';

  function renderPills() {
    const allPill = `<button type="button" class="gallery-filter-pill${activeCategory === 'All' ? ' active' : ''}" data-cat="All">All <span class="gallery-filter-count">${items.length}</span></button>`;
    const catPills = categories.map(c => `
      <button type="button" class="gallery-filter-pill${activeCategory === c ? ' active' : ''}" data-cat="${escapeHtml(c)}">${escapeHtml(c)} <span class="gallery-filter-count">${counts[c]}</span></button>
    `).join('');
    filterBar.innerHTML = allPill + catPills;
    filterBar.querySelectorAll('.gallery-filter-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        activeCategory = btn.dataset.cat;
        renderPills();
        renderCards();
      });
    });
  }

  const sentinel = document.getElementById('gallery-grid-sentinel');

  function renderCards() {
    const filtered = activeCategory === 'All' ? items : items.filter(g => (g.category || 'Other') === activeCategory);
    renderGridInBatches(grid, sentinel, filtered, 24, (g) => `
      <a class="gallery-card animate-fade-up" href="/gallery-item?slug=${encodeURIComponent(g.slug)}">
        <div class="gallery-card-image-wrap">
          <img src="${escapeHtml(g.image_url)}" alt="${escapeHtml(g.title)}" loading="lazy" class="gallery-card-image" />
        </div>
        <div class="gallery-card-title">${escapeHtml(g.title)}</div>
      </a>
    `);
  }

  // Only show the filter bar at all if there's more than one category —
  // no point filtering when everything's in "Other".
  if (filterBar && categories.length > 1) {
    filterBar.style.display = '';
    renderPills();
  } else if (filterBar) {
    filterBar.style.display = 'none';
  }
  renderCards();

  injectJsonLd({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'AI Image Gallery',
    itemListElement: items.slice(0, 30).map((g, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `https://smart-prompt.in/gallery-item?slug=${encodeURIComponent(g.slug)}`,
      name: g.title,
    })),
  });
}

async function initGalleryItemPage() {
  const detail = document.getElementById('gallery-item-detail');
  if (!detail) return;

  const params = new URLSearchParams(window.location.search);
  const slug = params.get('slug');
  const items = await fetchGalleryItems();
  const item = slug ? items.find(g => g.slug === slug) : null;

  if (!item) {
    detail.innerHTML = `
      <div class="error-page animate-fade-up">
        <div class="error-code">404</div>
        <h2>Image Not Found</h2>
        <p>This gallery image doesn't exist or may have been removed.</p>
        <a href="/gallery" class="btn-home">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          Back to Gallery
        </a>
      </div>
    `;
    return;
  }

  document.title = `${item.title} — SmartPrompts Gallery`;
  const pageUrl = `https://smart-prompt.in/gallery-item?slug=${encodeURIComponent(item.slug)}`;
  const pageDescription = `AI-generated image: ${item.title}. Includes the image prompt and video prompt used to create it.`;

  const metaDesc = document.getElementById('meta-description');
  if (metaDesc) metaDesc.setAttribute('content', pageDescription);
  const canonical = document.getElementById('canonical-link');
  if (canonical) canonical.href = pageUrl;
  const ogTitle = document.getElementById('meta-og-title');
  if (ogTitle) ogTitle.setAttribute('content', `${item.title} — SmartPrompts Gallery`);
  const ogDesc = document.getElementById('meta-og-description');
  if (ogDesc) ogDesc.setAttribute('content', pageDescription);
  const ogUrl = document.getElementById('meta-og-url');
  if (ogUrl) ogUrl.setAttribute('content', pageUrl);
  // The actual generated image makes a much better share preview than the
  // generic branded card, so swap it in here.
  const ogImage = document.getElementById('meta-og-image');
  if (ogImage) ogImage.setAttribute('content', item.image_url);
  const twitterImage = document.getElementById('meta-twitter-image');
  if (twitterImage) twitterImage.setAttribute('content', item.image_url);

  injectJsonLd([
    {
      '@context': 'https://schema.org',
      '@type': 'ImageObject',
      name: item.title,
      contentUrl: item.image_url,
      description: item.image_prompt,
      datePublished: new Date(item.published_at + 'Z').toISOString(),
      url: pageUrl,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://smart-prompt.in/' },
        { '@type': 'ListItem', position: 2, name: 'Gallery', item: 'https://smart-prompt.in/gallery' },
        { '@type': 'ListItem', position: 3, name: item.title, item: pageUrl },
      ],
    },
  ]);

  detail.innerHTML = `
    <a href="/gallery" class="back-link animate-fade-up">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
      </svg>
      All Gallery
    </a>
    <h1 class="prompt-page-title animate-fade-up">${escapeHtml(item.title)}</h1>
    <div class="gallery-detail-category animate-fade-up">${escapeHtml(item.category || 'Other')}</div>
    <div class="prompt-page-divider"></div>

    <div class="gallery-detail-image-wrap animate-fade-up" style="animation-delay:50ms">
      <img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title)}" class="gallery-detail-image" />
    </div>

    <div class="animate-fade-up" style="animation-delay:120ms">
      <div class="prompt-box">
        <div class="prompt-box-header">
          <div class="prompt-box-label">Image Prompt</div>
          <button class="copy-btn" id="copy-image-prompt-btn">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            <span>Copy</span>
          </button>
        </div>
        <div class="prompt-text">${escapeHtml(item.image_prompt)}</div>
      </div>
    </div>

    <div class="animate-fade-up" style="animation-delay:180ms">
      <div class="prompt-box">
        <div class="prompt-box-header">
          <div class="prompt-box-label">Video Prompt</div>
          <button class="copy-btn" id="copy-video-prompt-btn">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            <span>Copy</span>
          </button>
        </div>
        <div class="prompt-text">${escapeHtml(item.video_prompt)}</div>
      </div>
    </div>

    <p class="info-text animate-fade-up" style="margin-top:1.2rem;">Download the image above and use the video prompt directly, or use the image prompt to generate your own version first — up to you.</p>
  `;

  document.getElementById('copy-image-prompt-btn').addEventListener('click', (e) => {
    copyToClipboard(item.image_prompt, e.currentTarget);
  });
  document.getElementById('copy-video-prompt-btn').addEventListener('click', (e) => {
    copyToClipboard(item.video_prompt, e.currentTarget);
  });
}


/* --- Videos: fetch + list page (videos.html) + detail page (video-item.html) --- */
let _videoCache = null;
async function fetchVideoItems() {
  if (_videoCache) return _videoCache;
  try {
    const res = await fetch('/api/videos');
    if (!res.ok) throw new Error('Failed to load video items');
    _videoCache = await res.json();
    return _videoCache;
  } catch (err) {
    console.error('Error loading video items:', err);
    return [];
  }
}

function youtubeThumb(id) {
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}

async function initVideoListPage() {
  const grid = document.getElementById('video-grid');
  if (!grid) return;

  const items = await fetchVideoItems();
  const emptyState = document.getElementById('video-empty-state');
  const filterBar = document.getElementById('video-filter-bar');
  const sentinel = document.getElementById('video-grid-sentinel');

  if (!items.length) {
    grid.style.display = 'none';
    if (filterBar) filterBar.style.display = 'none';
    if (emptyState) emptyState.style.display = '';
    return;
  }

  const counts = {};
  items.forEach(v => { counts[v.category || 'Other'] = (counts[v.category || 'Other'] || 0) + 1; });
  const categories = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);

  let activeCategory = 'All';

  function renderPills() {
    const allPill = `<button type="button" class="gallery-filter-pill${activeCategory === 'All' ? ' active' : ''}" data-cat="All">All <span class="gallery-filter-count">${items.length}</span></button>`;
    const catPills = categories.map(c => `
      <button type="button" class="gallery-filter-pill${activeCategory === c ? ' active' : ''}" data-cat="${escapeHtml(c)}">${escapeHtml(c)} <span class="gallery-filter-count">${counts[c]}</span></button>
    `).join('');
    filterBar.innerHTML = allPill + catPills;
    filterBar.querySelectorAll('.gallery-filter-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        activeCategory = btn.dataset.cat;
        renderPills();
        renderCards();
      });
    });
  }

  function renderCards() {
    const filtered = activeCategory === 'All' ? items : items.filter(v => (v.category || 'Other') === activeCategory);
    renderGridInBatches(grid, sentinel, filtered, 24, (v) => `
      <a class="gallery-card animate-fade-up" href="/video-item?slug=${encodeURIComponent(v.slug)}">
        <div class="gallery-card-image-wrap">
          <img src="${youtubeThumb(v.youtube_id)}" alt="${escapeHtml(v.title)}" loading="lazy" class="gallery-card-image" />
          <span class="gallery-card-video-badge">▶ Video</span>
        </div>
        <div class="gallery-card-title">${escapeHtml(v.title)}</div>
      </a>
    `);
  }

  if (filterBar && categories.length > 1) {
    filterBar.style.display = '';
    renderPills();
  } else if (filterBar) {
    filterBar.style.display = 'none';
  }
  renderCards();

  injectJsonLd({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'AI Video Prompts',
    itemListElement: items.slice(0, 30).map((v, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `https://smart-prompt.in/video-item?slug=${encodeURIComponent(v.slug)}`,
      name: v.title,
    })),
  });
}

async function initVideoItemPage() {
  const detail = document.getElementById('video-item-detail');
  if (!detail) return;

  const params = new URLSearchParams(window.location.search);
  const slug = params.get('slug');
  const items = await fetchVideoItems();
  const item = slug ? items.find(v => v.slug === slug) : null;

  if (!item) {
    detail.innerHTML = `
      <div class="error-page animate-fade-up">
        <div class="error-code">404</div>
        <h2>Video Not Found</h2>
        <p>This video doesn't exist or may have been removed.</p>
        <a href="/videos" class="btn-home">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          Back to Videos
        </a>
      </div>
    `;
    return;
  }

  document.title = `${item.title} — SmartPrompts Videos`;
  const pageUrl = `https://smart-prompt.in/video-item?slug=${encodeURIComponent(item.slug)}`;
  const pageDescription = `AI-generated video: ${item.title}. Includes the exact prompt used to create it.`;
  const thumb = youtubeThumb(item.youtube_id);

  const metaDesc = document.getElementById('meta-description');
  if (metaDesc) metaDesc.setAttribute('content', pageDescription);
  const canonical = document.getElementById('canonical-link');
  if (canonical) canonical.href = pageUrl;
  const ogTitle = document.getElementById('meta-og-title');
  if (ogTitle) ogTitle.setAttribute('content', `${item.title} — SmartPrompts Videos`);
  const ogDesc = document.getElementById('meta-og-description');
  if (ogDesc) ogDesc.setAttribute('content', pageDescription);
  const ogUrl = document.getElementById('meta-og-url');
  if (ogUrl) ogUrl.setAttribute('content', pageUrl);
  const ogImage = document.getElementById('meta-og-image');
  if (ogImage) ogImage.setAttribute('content', thumb);
  const twitterImage = document.getElementById('meta-twitter-image');
  if (twitterImage) twitterImage.setAttribute('content', thumb);

  injectJsonLd([
    {
      '@context': 'https://schema.org',
      '@type': 'VideoObject',
      name: item.title,
      description: item.prompt.slice(0, 500),
      thumbnailUrl: thumb,
      uploadDate: new Date(item.published_at + 'Z').toISOString(),
      embedUrl: `https://www.youtube.com/embed/${item.youtube_id}`,
      contentUrl: `https://www.youtube.com/watch?v=${item.youtube_id}`,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://smart-prompt.in/' },
        { '@type': 'ListItem', position: 2, name: 'Videos', item: 'https://smart-prompt.in/videos' },
        { '@type': 'ListItem', position: 3, name: item.title, item: pageUrl },
      ],
    },
  ]);

  detail.innerHTML = `
    <a href="/videos" class="back-link animate-fade-up">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
      </svg>
      All Videos
    </a>
    <h1 class="prompt-page-title animate-fade-up">${escapeHtml(item.title)}</h1>
    <div class="gallery-detail-category animate-fade-up">${escapeHtml(item.category || 'Other')}</div>
    <div class="prompt-page-divider"></div>

    <div class="video-embed-wrap animate-fade-up" style="animation-delay:50ms">
      <iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(item.youtube_id)}" title="${escapeHtml(item.title)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
    </div>

    <div class="animate-fade-up" style="animation-delay:120ms">
      <div class="prompt-box">
        <div class="prompt-box-header">
          <div class="prompt-box-label">Prompt</div>
          <button class="copy-btn" id="copy-video-prompt-btn">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            <span>Copy</span>
          </button>
        </div>
        <div class="prompt-text">${escapeHtml(item.prompt)}</div>
      </div>
    </div>

    <p class="info-text animate-fade-up" style="margin-top:1.2rem;">Copy the prompt above and use it in your favorite AI video tool to make your own version.</p>
  `;

  document.getElementById('copy-video-prompt-btn').addEventListener('click', (e) => {
    copyToClipboard(item.prompt, e.currentTarget);
  });
}

/* --- Free SEO Title & Meta Description tool (seo-tool.html) --- */
function initSeoToolPage() {
  const btn = document.getElementById('seo-generate-btn');
  if (!btn) return;

  const input = document.getElementById('seo-topic-input');
  const msg = document.getElementById('seo-tool-msg');
  const resultWrap = document.getElementById('seo-result-wrap');
  const titleOut = document.getElementById('seo-title-output');
  const descOut = document.getElementById('seo-desc-output');
  const titleCount = document.getElementById('seo-title-count');
  const descCount = document.getElementById('seo-desc-count');

  btn.addEventListener('click', async () => {
    const topic = input.value.trim();
    if (!topic) {
      msg.textContent = 'Describe your page first.';
      msg.style.color = 'var(--danger, #e0555f)';
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Generating…';
    msg.textContent = '';
    resultWrap.style.display = 'none';

    try {
      const res = await fetch('/api/seo-tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic }),
      });
      const data = await res.json();
      if (!res.ok) {
        msg.textContent = data.error || 'Something went wrong — please try again.';
        msg.style.color = 'var(--danger, #e0555f)';
        return;
      }
      titleOut.textContent = data.title;
      descOut.textContent = data.metaDescription;
      titleCount.textContent = `(${data.title.length} chars)`;
      descCount.textContent = `(${data.metaDescription.length} chars)`;
      resultWrap.style.display = '';
      msg.textContent = '';
    } catch (err) {
      msg.textContent = 'Request failed — check your connection and try again.';
      msg.style.color = 'var(--danger, #e0555f)';
    } finally {
      btn.disabled = false;
      btn.textContent = '✨ Generate';
    }
  });

  document.getElementById('copy-seo-title-btn').addEventListener('click', (e) => {
    copyToClipboard(titleOut.textContent, e.currentTarget);
  });
  document.getElementById('copy-seo-desc-btn').addEventListener('click', (e) => {
    copyToClipboard(descOut.textContent, e.currentTarget);
  });
}

/* --- Free Prompt Improver tool (prompt-improver.html) --- */
function initPromptImproverPage() {
  const btn = document.getElementById('improver-generate-btn');
  if (!btn) return;

  const input = document.getElementById('improver-input');
  const msg = document.getElementById('improver-msg');
  const resultWrap = document.getElementById('improver-result-wrap');
  const output = document.getElementById('improver-output');
  const explanation = document.getElementById('improver-explanation');

  btn.addEventListener('click', async () => {
    const roughPrompt = input.value.trim();
    if (!roughPrompt) {
      msg.textContent = 'Paste a prompt first.';
      msg.style.color = 'var(--danger, #e0555f)';
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Improving…';
    msg.textContent = '';
    resultWrap.style.display = 'none';

    try {
      const res = await fetch('/api/prompt-improver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: roughPrompt }),
      });
      const data = await res.json();
      if (!res.ok) {
        msg.textContent = data.error || 'Something went wrong — please try again.';
        msg.style.color = 'var(--danger, #e0555f)';
        return;
      }
      output.textContent = data.improvedPrompt;
      explanation.textContent = data.whatChanged;
      resultWrap.style.display = '';
      msg.textContent = '';
    } catch (err) {
      msg.textContent = 'Request failed — check your connection and try again.';
      msg.style.color = 'var(--danger, #e0555f)';
    } finally {
      btn.disabled = false;
      btn.textContent = '✨ Improve My Prompt';
    }
  });

  document.getElementById('copy-improver-btn').addEventListener('click', (e) => {
    copyToClipboard(output.textContent, e.currentTarget);
  });
}

/* --- Free AI Image Prompt Generator tool (image-prompt-generator.html) --- */
function initImagePromptGeneratorPage() {
  const btn = document.getElementById('imggen-generate-btn');
  if (!btn) return;

  const input = document.getElementById('imggen-input');
  const msg = document.getElementById('imggen-msg');
  const resultWrap = document.getElementById('imggen-result-wrap');
  const output = document.getElementById('imggen-output');
  const styleLabel = document.getElementById('imggen-style-label');

  btn.addEventListener('click', async () => {
    const idea = input.value.trim();
    if (!idea) {
      msg.textContent = 'Describe your image idea first.';
      msg.style.color = 'var(--danger, #e0555f)';
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Generating…';
    msg.textContent = '';
    resultWrap.style.display = 'none';

    try {
      const res = await fetch('/api/image-prompt-generator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea }),
      });
      const data = await res.json();
      if (!res.ok) {
        msg.textContent = data.error || 'Something went wrong — please try again.';
        msg.style.color = 'var(--danger, #e0555f)';
        return;
      }
      output.textContent = data.imagePrompt;
      styleLabel.textContent = `(${data.style})`;
      resultWrap.style.display = '';
      msg.textContent = '';
    } catch (err) {
      msg.textContent = 'Request failed — check your connection and try again.';
      msg.style.color = 'var(--danger, #e0555f)';
    } finally {
      btn.disabled = false;
      btn.textContent = '✨ Generate Prompt';
    }
  });

  document.getElementById('copy-imggen-btn').addEventListener('click', (e) => {
    copyToClipboard(output.textContent, e.currentTarget);
  });
}


async function initBlogListPage() {
  const grid = document.getElementById('blog-grid');
  if (!grid) return;

  const posts = await fetchBlogPosts();
  const emptyState = document.getElementById('blog-empty-state');

  if (!posts.length) {
    grid.style.display = 'none';
    if (emptyState) emptyState.style.display = '';
    return;
  }

  grid.innerHTML = posts.map(p => `
    <a class="prompt-card animate-fade-up" href="/blog-post?slug=${encodeURIComponent(p.slug)}">
      <span class="card-date">${escapeHtml(formatBlogDate(p.published_at))}</span>
      <div class="card-title">${escapeHtml(p.title)}</div>
      <div class="card-preview blog-excerpt">${escapeHtml(p.excerpt || p.content.slice(0, 140) + '…')}</div>
      <div class="card-footer">
        <span class="card-open-btn">
          Read post
          <svg class="card-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
          </svg>
        </span>
      </div>
    </a>
  `).join('');
}

/* --- Blog post detail page (blog-post.html) --- */
async function initBlogPostPage() {
  const detail = document.getElementById('blog-post-detail');
  if (!detail) return;

  const params = new URLSearchParams(window.location.search);
  const slug = params.get('slug');
  const posts = await fetchBlogPosts();
  const post = slug ? posts.find(p => p.slug === slug) : null;

  if (!post) {
    detail.innerHTML = `
      <div class="error-page animate-fade-up">
        <div class="error-code">404</div>
        <h2>Post Not Found</h2>
        <p>We couldn't find that blog post.</p>
        <a href="/blog" class="btn-home">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          Back to Blog
        </a>
      </div>
    `;
    return;
  }

  document.title = `${post.title} — SmartPrompts Blog`;
  markBannerSlugSeen(post.slug);
  const pageUrl = `https://smart-prompt.in/blog-post?slug=${encodeURIComponent(post.slug)}`;
  const pageDescription = post.excerpt || post.title;

  const metaDesc = document.getElementById('meta-description');
  if (metaDesc) metaDesc.setAttribute('content', pageDescription);
  const canonical = document.getElementById('canonical-link');
  if (canonical) canonical.href = pageUrl;

  const ogTitle = document.getElementById('meta-og-title');
  if (ogTitle) ogTitle.setAttribute('content', `${post.title} — SmartPrompts Blog`);
  const ogDesc = document.getElementById('meta-og-description');
  if (ogDesc) ogDesc.setAttribute('content', pageDescription);
  const ogUrl = document.getElementById('meta-og-url');
  if (ogUrl) ogUrl.setAttribute('content', pageUrl);

  injectJsonLd([
    {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: post.title,
      description: pageDescription,
      datePublished: new Date(post.published_at + 'Z').toISOString(),
      dateModified: new Date(post.published_at + 'Z').toISOString(),
      url: pageUrl,
      mainEntityOfPage: { '@type': 'WebPage', '@id': pageUrl },
      author: { '@type': 'Organization', name: 'SmartPrompts' },
      publisher: {
        '@type': 'Organization',
        name: 'SmartPrompts',
        logo: { '@type': 'ImageObject', url: 'https://smart-prompt.in/favicon.png' },
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://smart-prompt.in/' },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://smart-prompt.in/blog' },
        { '@type': 'ListItem', position: 3, name: post.title, item: pageUrl },
      ],
    },
  ]);

  /* --- Related posts: other recent posts, an honest "more from the blog"
     pick since blog posts don't have a category to match on --- */
  const relatedPosts = posts.filter(p => p.slug !== post.slug).slice(0, 3);
  const relatedPostsHTML = relatedPosts.length > 0
    ? `
      <div class="related-section animate-fade-up" style="animation-delay:250ms">
        <div class="related-title">More from the Blog</div>
        <div class="related-grid">
          ${relatedPosts.map(r => `
            <a class="prompt-card" href="/blog-post?slug=${encodeURIComponent(r.slug)}">
              <span class="card-date">${escapeHtml(formatBlogDate(r.published_at))}</span>
              <div class="card-title">${escapeHtml(r.title)}</div>
              <div class="card-preview blog-excerpt">${escapeHtml(r.excerpt || r.content.slice(0, 90) + '…')}</div>
              <div class="card-footer">
                <span class="card-open-btn">
                  Read post
                  <svg class="card-arrow" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                  </svg>
                </span>
              </div>
            </a>
          `).join('')}
        </div>
      </div>
    `
    : '';

  detail.innerHTML = `
    <a href="/blog" class="back-link animate-fade-up">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
      </svg>
      All Posts
    </a>
    <h1 class="prompt-page-title animate-fade-up">${escapeHtml(post.title)}</h1>
    <div class="blog-post-date animate-fade-up">${escapeHtml(formatBlogDate(post.published_at))}</div>
    <div class="prompt-page-divider"></div>
    <div class="blog-post-body animate-fade-up">${textToParagraphs(escapeHtml(post.content))}</div>
    ${relatedPostsHTML}
  `;
}

/* ============================================================
   SUBMIT PROMPT PAGE (submit.html)
   ============================================================ */
function initSubmitPage() {
  const form = document.getElementById('submit-form');
  if (!form) return;

  const msg = document.getElementById('submit-msg');
  const submitBtn = document.getElementById('submit-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      title: document.getElementById('s-title').value.trim(),
      category: document.getElementById('s-category').value.trim(),
      preview: document.getElementById('s-preview').value.trim(),
      prompt: document.getElementById('s-prompt').value.trim(),
      submitter_name: document.getElementById('s-name').value.trim(),
      submitter_email: document.getElementById('s-email').value.trim(),
      website: document.getElementById('s-website').value.trim(), // honeypot
    };

    if (!body.title || !body.category || !body.prompt) {
      msg.textContent = 'Please fill in title, category, and prompt text.';
      msg.style.color = '#e0555f';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';
    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        form.reset();
        form.style.display = 'none';
        msg.textContent = "Thanks! Your prompt has been submitted for review — we'll publish it once it's approved.";
        msg.style.color = 'var(--accent)';
      } else {
        msg.textContent = data.error || 'Something went wrong — please try again.';
        msg.style.color = '#e0555f';
      }
    } catch {
      msg.textContent = 'Network error — please try again.';
      msg.style.color = '#e0555f';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit for Review';
    }
  });
}

/* ---- Theme toggle (shared across index.html and prompt.html) ---- */
/* ---- PWA install button. Registers the service worker (required by
   Chrome before it'll consider the site installable), then listens for
   beforeinstallprompt — the signal that the browser is ready to install —
   and shows a compact "Install" pill in the header (every page, no
   Google Play branding — this is a browser install, not a Play Store
   listing). Disappears once installed, or if the app is already running
   installed. ---- */
let deferredInstallPrompt = null;

function initPwaInstall() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
  if (isStandalone) return;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    showPwaHeaderButton();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    hidePwaInstallUI();
  });
}

async function triggerPwaInstall() {
  if (!deferredInstallPrompt) return;
  const promptEvent = deferredInstallPrompt;
  deferredInstallPrompt = null;
  hidePwaInstallUI();
  promptEvent.prompt();
  await promptEvent.userChoice;
}

function hidePwaInstallUI() {
  const btn = document.getElementById('pwa-install-btn');
  if (btn) btn.remove();
}

function showPwaHeaderButton() {
  if (document.getElementById('pwa-install-btn')) return;
  const actions = document.querySelector('.header-actions');
  if (!actions) return;

  const btn = document.createElement('button');
  btn.id = 'pwa-install-btn';
  btn.type = 'button';
  btn.className = 'pwa-header-btn';
  btn.setAttribute('aria-label', 'Install app');
  btn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 3v12"/><polyline points="7 11 12 16 17 11"/><path d="M5 21h14"/>
    </svg>
    <span>Install</span>
  `;
  btn.addEventListener('click', triggerPwaInstall);
  // .prepend() rather than inserting before a specific search-button id —
  // on index.html the search icon is a <button id="header-search-btn">,
  // but on every other page (about, blog, prompt, etc.) it's a plain
  // <a href="/"> with no id. Prepending as the first child of
  // .header-actions puts the install button to the left of whichever
  // search element is there, on every page, without depending on an id
  // that only exists on one of them.
  actions.prepend(btn);
}

function initThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    if (isLight) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('theme', 'light');
    }
  });
}

/* ---- Mobile hamburger menu (built from the SAME nav links already in
   the page — desktop header stays exactly as-is; this just adds a way to
   reach Blog/About/etc. on small screens without widening the header) ---- */
function initMobileNav() {
  const header = document.querySelector('.site-header');
  const headerInner = document.querySelector('.site-header .header-inner');
  const nav = document.querySelector('.site-header .site-nav');
  const actions = document.querySelector('.site-header .header-actions');
  if (!header || !nav || document.querySelector('.mobile-menu-toggle')) return;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'mobile-menu-toggle';
  toggle.setAttribute('aria-label', 'Open menu');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.innerHTML = `
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
      <line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/>
    </svg>
  `;
  // Leftmost item in the header — standard mobile placement, before the logo.
  if (headerInner) headerInner.insertBefore(toggle, headerInner.firstChild);

  const panel = document.createElement('div');
  panel.className = 'mobile-nav-panel';
  const loginLink = document.querySelector('.site-header .btn-login');
  const signupLink = document.querySelector('.site-header .btn-signup');
  panel.innerHTML = `
    <nav class="mobile-nav-links">${nav.innerHTML}</nav>
    <div class="mobile-nav-actions">
      ${loginLink ? loginLink.outerHTML : ''}
      ${signupLink ? signupLink.outerHTML : ''}
    </div>
  `;
  header.appendChild(panel);

  function closeMenu() {
    panel.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  }
  function openMenu() {
    panel.classList.add('open');
    toggle.setAttribute('aria-expanded', 'true');
  }

  toggle.addEventListener('click', () => {
    panel.classList.contains('open') ? closeMenu() : openMenu();
  });

  panel.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') closeMenu();
  });

  document.addEventListener('click', (e) => {
    if (!panel.classList.contains('open')) return;
    if (!panel.contains(e.target) && e.target !== toggle && !toggle.contains(e.target)) {
      closeMenu();
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) closeMenu();
  });
}

/* ---- Mobile icon nav bar (Home/Categories/Trending/Blog/More) — sits
   right below the header on small screens only; desktop is untouched.
   The bar itself is now static HTML in every page (server-rendered, no
   JS needed to see it) so it can never cause a layout shift by showing
   up late — this function only builds it as a fallback for any page
   that doesn't already have it, and always wires up the "More" popover
   either way. ---- */
function initIconNavBar() {
  const header = document.querySelector('.site-header');
  if (!header) return;

  let bar = document.querySelector('.icon-nav-bar');
  if (!bar) {

  const path = window.location.pathname;
  const isHome = path === '/' || path.endsWith('/') || path.endsWith('index.html');
  const isTrending = path.includes('trending-prompts');
  const isBlog = path.includes('blog');
  const isGallery = path.includes('gallery') && !path.includes('gallery-item');
  const isVideos = path.includes('video');
  const isMore = path.includes('submit') || path.includes('about') || path.includes('seo-tool') || path.includes('prompt-improver') || path.includes('image-prompt-generator') || path.includes('color-poster-prompt-generator');

  const items = [
    {
      label: 'Home', href: '/',
      active: isHome && !isTrending,
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"/></svg>',
    },
    {
      label: 'Trending', href: '/trending-prompts',
      active: isTrending,
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c1 3-2 4-2 7a4 4 0 0 0 8 0c0-1-.5-2-1-3 2 1 3 3 3 6a6 6 0 0 1-12 0c0-4 2-5 4-10z"/></svg>',
    },
    {
      label: 'Blog', href: '/blog',
      active: isBlog && !isGallery,
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h9l3 3v17H6z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>',
    },
    // Gallery paused for now (R2 migration pending) — re-add this item
    // when it's switched back on:
    // {
    //   label: 'Gallery', href: '/gallery.html',
    //   active: isGallery,
    //   icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.8"/><path d="M21 15l-5-5-9 9"/></svg>',
    // },
    {
      label: 'Videos', href: '/videos',
      active: isVideos,
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="14" height="14" rx="2"/><path d="M21 8.5l-4.5 3.5 4.5 3.5v-7z"/></svg>',
    },
  ];

  bar = document.createElement('div');
  bar.className = 'icon-nav-bar';
  bar.innerHTML = `
    ${items.map(it => `
      <a href="${it.href}" class="icon-nav-item${it.active ? ' active' : ''}">
        <span class="icon-nav-icon">${it.icon}</span>
        <span class="icon-nav-label">${it.label}</span>
      </a>
    `).join('')}
    <button type="button" class="icon-nav-item icon-nav-more${isMore ? ' active' : ''}" id="icon-nav-more-btn">
      <span class="icon-nav-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></svg>
      </span>
      <span class="icon-nav-label">More</span>
    </button>
  `;

  header.insertAdjacentElement('afterend', bar);
  }

  // The popover lives at the very end of <body> (not inside .icon-nav-bar)
  // and uses position:fixed with JS-computed coordinates — .icon-nav-bar
  // scrolls horizontally (overflow-x:auto), and CSS forces overflow-y to
  // clip too whenever overflow-x isn't "visible", so anything absolutely
  // positioned *inside* it that pokes out the bottom gets silently cut off.
  const morePopover = document.createElement('div');
  morePopover.className = 'icon-nav-more-popover';
  morePopover.id = 'icon-nav-more-popover';
  morePopover.innerHTML = `
    <a href="/seo-tool" class="site-nav-link">SEO Tool</a>
    <a href="/prompt-improver" class="site-nav-link">Prompt Improver</a>
    <a href="/image-prompt-generator" class="site-nav-link">Image Prompt Generator</a>
    <a href="/color-poster-prompt-generator" class="site-nav-link">Design Prompt Studio</a>
    <a href="/submit" class="site-nav-link">Submit Prompt</a>
    <a href="/about" class="site-nav-link">About</a>
  `;
  document.body.appendChild(morePopover);

  const moreBtn = document.getElementById('icon-nav-more-btn');
  moreBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpening = !morePopover.classList.contains('open');
    if (isOpening) {
      const rect = moreBtn.getBoundingClientRect();
      morePopover.style.top = `${rect.bottom + 6}px`;
      morePopover.style.right = `${window.innerWidth - rect.right}px`;
    }
    morePopover.classList.toggle('open', isOpening);
  });
  document.addEventListener('click', (e) => {
    if (!morePopover.contains(e.target) && e.target !== moreBtn) {
      morePopover.classList.remove('open');
    }
  });
}

/* Same-page nav clicks (already on index.html, clicking Categories/Trending)
   don't reload the page, so the load-time logic above never re-runs for
   them — handle those here too. */
window.addEventListener('hashchange', () => {
  const hash = window.location.hash;

  if (!hash) {
    // "Home" was clicked from a filtered/scrolled state — reset to the
    // default category-browse view instead of leaving whatever was showing.
    if (typeof window.showCategoryBrowse === 'function') window.showCategoryBrowse();
    return;
  }

  if (hash === '#category-browse' && typeof window.showCategoryBrowse === 'function') {
    window.showCategoryBrowse();
    return;
  }

  if (hash.startsWith('#category=')) {
    const cat = decodeURIComponent(hash.slice('#category='.length));
    if (typeof window.showList === 'function') {
      window.showList(cat);
    } else {
      // showList isn't on window yet on some pages — fall back to a full
      // reload so the category still applies correctly.
      location.reload();
    }
    return;
  }

  const target = document.querySelector(hash);
  if (target) {
    requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
});

/* ---- Init ---- */
document.addEventListener('DOMContentLoaded', () => {
  initPwaInstall();
  initThemeToggle();
  initMobileNav();
  initIconNavBar();
  // Kicked off first, in parallel with everything below — it has its own
  // small, fast fetch, and starting it immediately (rather than after
  // initIndexPage's larger prompts fetch) keeps the "pop in once we know
  // whether to show it" window as short as possible.
  initFeaturedBlogBanner();
  initIndexPage();
  initPromptPage();
  initBlogListPage();
  initBlogPostPage();
  initGalleryListPage();
  initGalleryItemPage();
  initVideoListPage();
  initVideoItemPage();
  initSeoToolPage();
  initPromptImproverPage();
  initImagePromptGeneratorPage();
  initSubmitPage();
  initTrendingPromptsPage();
  initCategoryPage();
});

/* =========================================================================
   SmartPrompts — context-aware funny messages
   - A small card slides up from the bottom, stays 7 seconds (never < 6 s).
   - The first one comes after 45 s, then one every 60 s while the visitor stays.
   - The text matches the section / page being viewed (home sections, studio modes, blog, submit, ...).
   - A message never repeats until the whole pool for that section has been used.
   - Max 10 per visit, then one goodbye message and silence. 3 closes = quiet for the day.
   - Messages live in /funny-messages.json (fetched once, after the first timer). No D1, no API.
   - Testing: add ?funny=fast to any URL (first message after ~2.5 s, then every 9 s).
   ========================================================================= */
(function () {
  'use strict';
  if (window.__spFunny) return;
  window.__spFunny = true;

  var FAST = /[?&]funny=fast\b/.test(location.search);
  var MAXQ = FAST && location.search.match(/[?&]funnymax=(\d+)/);
  var FIRST_MS = FAST ? 2500 : 45000;
  var EVERY_MS = FAST ? 9000 : 60000;
  var STAY_MS = 7000;                         // must stay >= 6000
  var MAX_PER_VISIT = MAXQ ? parseInt(MAXQ[1], 10) : 10;
  var CLOSE_LIMIT = 3;
  var DATA_URL = '/funny-messages.json?v=2';

  var DATA = null, SEEN = {}, shown = 0, closes = 0, stopped = false, retries = 0;
  var timer = null, hideT = null, shownAt = 0, remaining = STAY_MS, el = null, card = null, textEl = null, barEl = null;
  var homeVis = {};

  /* ---------- small storage helpers ---------- */
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function today() { return new Date().toISOString().slice(0, 10); }

  var c = lsGet('sp_funny_closes');
  if (c && c.d === today()) closes = c.n || 0;
  if (closes >= CLOSE_LIMIT) return;          // asked to be left alone today
  SEEN = lsGet('sp_funny_seen') || {};

  /* ---------- which page / section is the visitor on? ---------- */
  function pageCtx() {
    var p = location.pathname.replace(/\/+$/, '').replace(/\.html$/, '').toLowerCase() || '/';
    if (p === '/' || p === '/index') return 'home';
    if (p === '/trending-prompts') return 'trending';
    if (p === '/blog' || p === '/blog-post') return 'blog';
    if (p === '/videos' || p === '/video-item') return 'videos';
    if (p === '/category') return 'prompts';
    if (p === '/prompt') return 'prompt';
    if (p === '/saved') return 'saved';
    if (p === '/submit') return 'submit';
    if (p === '/about' || p === '/contact') return 'about';
    if (p === '/seo-tool' || p === '/prompt-improver' || p === '/image-prompt-generator') return 'tools';
    if (p === '/color-poster-prompt-generator') return 'studio';
    return 'generic';
  }

  var HOME_SECTIONS = [
    ['.hero', 'hero'], ['#category-browse', 'categories'], ['#top-prompts-section', 'trending'],
    ['.promo-banner', 'newprompts'], ['.newsletter-bar', 'newsletter'], ['#prompt-grid', 'prompts']
  ];
  function watchHome() {
    if (pageCtx() !== 'home' || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { homeVis[e.target.__spCtx] = e.isIntersecting ? e.intersectionRect.height : 0; });
    }, { threshold: [0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 1] });
    HOME_SECTIONS.forEach(function (s) {
      var n = document.querySelector(s[0]);
      if (n) { n.__spCtx = s[1]; io.observe(n); }
    });
  }
  function homeCtx() {
    var best = null, bestH = 80;                // a section must show at least ~80px to count
    Object.keys(homeVis).forEach(function (k) { if (homeVis[k] > bestH) { best = k; bestH = homeVis[k]; } });
    return best || (window.scrollY < 300 ? 'hero' : 'generic');
  }
  function studioMode() {
    var m = document.querySelector('[data-design-mode][aria-pressed="true"]');
    var v = m && m.getAttribute('data-design-mode');
    return (v === 'wallpaper' || v === 'poster' || v === 'banner' || v === 'background') ? v : null;
  }
  function choosePool() {
    var ctx = pageCtx(), r = Math.random();
    if (ctx === 'home') return r < 0.78 ? homeCtx() : 'generic';
    if (ctx === 'studio') {
      var m = studioMode();
      if (m && r < 0.55) return 'studio_' + m;
      return r < 0.85 ? 'studio' : 'generic';
    }
    return r < 0.8 ? ctx : 'generic';
  }

  /* ---------- pick a message that has not been used yet ---------- */
  function pick(pool) {
    var list = DATA && DATA[pool];
    if (!list || !list.length) { pool = 'generic'; list = DATA && DATA.generic; }
    if (!list || !list.length) return null;
    var seen = SEEN[pool] || (SEEN[pool] = []), avail = [], i;
    for (i = 0; i < list.length; i++) if (seen.indexOf(i) < 0) avail.push(i);
    if (!avail.length) {                         // whole pool used: start over, but never repeat the last one back-to-back
      var last = seen[seen.length - 1];
      seen.length = 0;
      for (i = 0; i < list.length; i++) if (i !== last) avail.push(i);
    }
    var idx = avail[Math.floor(Math.random() * avail.length)];
    seen.push(idx);
    lsSet('sp_funny_seen', SEEN);
    return { pool: pool, text: list[idx] };
  }

  /* ---------- the card ---------- */
  function injectCss() {
    if (document.getElementById('sp-funny-css')) return;
    var s = document.createElement('style');
    s.id = 'sp-funny-css';
    s.textContent =
      '#sp-funny{position:fixed;left:0;right:0;bottom:0;z-index:9000;display:flex;justify-content:center;padding:0 12px calc(12px + env(safe-area-inset-bottom));pointer-events:none}' +
      '.spf-card{position:relative;pointer-events:auto;box-sizing:border-box;max-width:min(94vw,430px);min-width:min(86vw,280px);padding:.85rem 2.4rem 1rem 1rem;border-radius:16px;background:var(--bg-card,#fff);color:var(--text,#111);border:1.5px solid rgba(99,102,241,.45);box-shadow:0 18px 40px -14px rgba(49,46,129,.55);overflow:hidden;transform:translateY(170%);opacity:0;transition:transform .38s cubic-bezier(.2,.9,.3,1.15),opacity .25s ease}' +
      '.spf-card.on{transform:none;opacity:1}' +
      '.spf-text{font:700 .94rem/1.45 var(--font-body,system-ui,sans-serif);color:#4f46e5;background:linear-gradient(90deg,#4f46e5,#db2777);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}' +
      ':root:not([data-theme="light"]) .spf-text{color:#a5b4fc;background-image:linear-gradient(90deg,#a5b4fc,#f9a8d4)}' +
      '.spf-x{position:absolute;top:.3rem;right:.35rem;width:34px;height:34px;border:0;border-radius:50%;background:transparent;color:inherit;font-size:1.35rem;line-height:1;cursor:pointer;opacity:.65}' +
      '.spf-x:hover{opacity:1;background:rgba(99,102,241,.12)}' +
      '.spf-x:focus-visible{outline:3px solid #6366f1;outline-offset:1px}' +
      '.spf-bar{position:absolute;left:0;right:0;bottom:0;height:3px;background:rgba(99,102,241,.15)}' +
      '.spf-bar i{display:block;height:100%;transform-origin:left;background:linear-gradient(90deg,#4f46e5,#db2777);animation:spf-bar ' + (STAY_MS / 1000) + 's linear forwards;animation-play-state:paused}' +
      '.spf-card.on .spf-bar i{animation-play-state:running}' +
      '.spf-card.on.paused .spf-bar i{animation-play-state:paused}' +
      '@keyframes spf-bar{from{transform:scaleX(1)}to{transform:scaleX(0)}}' +
      '@media (prefers-reduced-motion:reduce){.spf-card{transition:none}}';
    document.head.appendChild(s);
  }
  function build() {
    if (el) return;
    injectCss();
    el = document.createElement('div');
    el.id = 'sp-funny';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = '<div class="spf-card"><div class="spf-text"></div><button type="button" class="spf-x" aria-label="Close message">×</button><div class="spf-bar"><i></i></div></div>';
    document.body.appendChild(el);
    card = el.querySelector('.spf-card');
    textEl = el.querySelector('.spf-text');
    barEl = el.querySelector('.spf-bar i');
    el.querySelector('.spf-x').addEventListener('click', function () {
      hide();
      closes++;
      lsSet('sp_funny_closes', { d: today(), n: closes });
      track('closed', card.getAttribute('data-pool'));
      if (closes >= CLOSE_LIMIT) { stopped = true; clearTimeout(timer); }
    });
    card.addEventListener('pointerenter', function () {      // reading? keep it on screen
      clearTimeout(hideT);
      remaining = Math.max(STAY_MS - (Date.now() - shownAt), 3000);
      card.classList.add('paused');
    });
    card.addEventListener('pointerleave', function () {
      card.classList.remove('paused');
      hideT = setTimeout(hide, remaining);
    });
  }
  function track(action, pool) {
    if (typeof gtag === 'function') { try { gtag('event', 'funny_message', { action: action, pool: pool }); } catch (e) {} }
  }
  function show(m) {
    build();
    textEl.textContent = m.text;
    card.setAttribute('data-pool', m.pool);
    barEl.style.animation = 'none'; void barEl.offsetWidth; barEl.style.animation = '';   // restart the timer bar
    shownAt = Date.now(); remaining = STAY_MS;
    card.classList.remove('paused');
    requestAnimationFrame(function () { card.classList.add('on'); });
    clearTimeout(hideT);
    hideT = setTimeout(hide, STAY_MS);
    track('shown', m.pool);
  }
  function hide() { if (card) card.classList.remove('on'); }

  /* ---------- when is it a bad moment? ---------- */
  function busy() {
    if (document.hidden) return true;
    var a = document.activeElement;
    if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return true;
    if (document.body.style.overflow === 'hidden') return true;
    var lb = document.getElementById('cpg-lb');
    if (lb && !lb.hidden) return true;
    return false;
  }

  /* ---------- schedule ---------- */
  function load() {
    if (DATA) return Promise.resolve();
    return fetch(DATA_URL, { cache: 'force-cache' })
      .then(function (r) { if (!r.ok) throw new Error('no data'); return r.json(); })
      .then(function (d) { DATA = d; });
  }
  function schedule(ms) { clearTimeout(timer); timer = setTimeout(tick, ms); }
  function tick() {
    if (stopped) return;
    if (busy()) {                               // typing, tab hidden, full-screen preview...: try again shortly
      if (++retries <= 6) { schedule(5000); return; }
      retries = 0; schedule(EVERY_MS); return;
    }
    retries = 0;
    load().then(function () {
      var last = shown >= MAX_PER_VISIT;
      var m = pick(last ? 'bye' : choosePool());
      if (!m) { stopped = true; return; }
      show(m); shown++;
      if (last) { stopped = true; return; }     // goodbye shown, now stay quiet
      schedule(EVERY_MS);
    }).catch(function () { stopped = true; });  // data missing: stay silent, never break the page
  }

  watchHome();
  schedule(FIRST_MS);
})();

/* =========================================================================
   SmartPrompts — Fill the Blanks
   Finds every [BLANK] in a prompt on its own, builds one box per blank, and updates the
   prompt live while the visitor types. 100% in the browser: no D1, no API.
   - The Copy button is never hidden or disabled. Unfilled blanks are copied exactly as they are.
   - Same blank name used twice in a prompt = one box fills both.
   - Short answers (topic, product...) are remembered in this browser only, so the next prompt is pre-filled.
   - Prompts with no [blank] are left completely untouched.
   ========================================================================= */
(function () {
  'use strict';

  var RX = /\[[^\[\]]{2,80}\]/g;                 // same pattern the page already uses to highlight blanks
  var STORE = 'sp_fill_vals';
  var NO_SAVE = /paste|code|describe|list |text|data|notes|feedback|prompt|premise|travel/;  // long / private answers are never saved
  var TEXTAREA = /^(paste |describe |list |text$|code$|data description|premise|travel details)/;
  var NUMERIC = /^(number|amount|hours|hours available|years|team size|user count)$/;
  var ACRONYMS = { ai: 'AI', seo: 'SEO', url: 'URL', cta: 'CTA', kpi: 'KPI', api: 'API', ui: 'UI', ux: 'UX', faq: 'FAQ', roi: 'ROI', b2b: 'B2B', b2c: 'B2C', pdf: 'PDF', sql: 'SQL' };

  /* Hand-written examples for the 100+ names that appear most often. Everything else gets an automatic hint. */
  var HINTS = {
    'topic': 'e.g. healthy breakfast ideas', 'product': 'e.g. wireless earbuds', 'number': 'e.g. 5',
    'site type': 'e.g. portfolio, online store', 'product/service': 'e.g. yoga classes', 'niche': 'e.g. fitness for busy moms',
    'text': 'Paste the text here', 'subject': 'e.g. photosynthesis', 'duration': 'e.g. 30 minutes, 7 days',
    'destination': 'e.g. Goa, Jaipur', 'describe experience': 'e.g. 3 years teaching in a school', 'app type': 'e.g. to-do app, food delivery',
    'project type': 'e.g. mobile app, blog', 'skill': 'e.g. Excel, public speaking', 'product type': 'e.g. skincare, gadgets',
    'business type': 'e.g. bakery, travel agency', 'content type': 'e.g. reel, blog post', 'industry': 'e.g. education, healthcare',
    'team size': 'e.g. 8', 'job title': 'e.g. marketing manager', 'target role': 'e.g. data analyst', 'person': 'e.g. a college student',
    'service type': 'e.g. web design', 'grade level': 'e.g. class 8', 'brand': 'e.g. your brand name', 'situation': 'e.g. I missed a deadline',
    'use case': 'e.g. customer support', 'goal': 'e.g. get 1,000 followers', 'data type': 'e.g. sales data', 'company': 'e.g. your company name',
    'ai tool': 'e.g. ChatGPT', 'field': 'e.g. computer science', 'timeframe': 'e.g. next 30 days', 'task': 'e.g. plan a trip',
    'task type': 'e.g. email writing', 'amount': 'e.g. 10,000', 'time period': 'e.g. last 3 months', 'list tasks': 'One task per line',
    'product/service type': 'e.g. online course', 'brand name': 'e.g. your brand name', 'role': 'e.g. teacher', 'page type': 'e.g. landing page',
    'video topic': 'e.g. how to learn English fast', 'character': 'e.g. a brave young girl', 'paste code': 'Paste your code here',
    'project': 'e.g. school science project', 'store type': 'e.g. clothing store', 'feature': 'e.g. dark mode', 'question': 'e.g. How does inflation work?',
    'platform': 'e.g. Instagram, YouTube', 'frequency': 'e.g. every week', 'brand type': 'e.g. fashion, tech', 'role type': 'e.g. remote, full-time',
    'startup stage': 'e.g. idea stage, seed', 'context': 'e.g. for a school presentation', 'scene': 'e.g. a rainy street at night',
    'product category': 'e.g. kitchen appliances', 'campaign type': 'e.g. festival sale', 'theme': 'e.g. travel, minimal', 'metric': 'e.g. conversion rate',
    'company type': 'e.g. startup, agency', 'audience type': 'e.g. college students', 'product a': 'e.g. first product', 'product b': 'e.g. second product',
    'location': 'e.g. Mumbai', 'topic/niche': 'e.g. personal finance', 'paste prompt': 'Paste your prompt here', 'area': 'e.g. marketing',
    'design type': 'e.g. logo, poster', 'setting': 'e.g. a village fair', 'audience': 'e.g. beginners', 'service': 'e.g. home cleaning',
    'problem': 'e.g. low website traffic', 'premise': 'e.g. a robot learns to paint', 'page topic': 'e.g. best study tips',
    'person/relationship': 'e.g. my best friend', 'describe idea': 'e.g. an app that reminds you to drink water', 'activity type': 'e.g. yoga, running',
    'new tool': 'e.g. Notion', 'data description': 'e.g. monthly sales by region', 'option a': 'e.g. first option', 'option b': 'e.g. second option',
    'habit': 'e.g. wake up at 5 am', 'job role': 'e.g. content writer', 'fitness goal': 'e.g. lose 5 kg', 'character a': 'e.g. a detective',
    'character b': 'e.g. a thief', 'startup idea': 'e.g. an app for local tutors', 'list features': 'One feature per line', 'hours': 'e.g. 3',
    'paste feedback': 'Paste the feedback here', 'person/role': 'e.g. a new manager', 'describe decision': 'e.g. should I switch jobs?',
    'hours available': 'e.g. 2', 'date': 'e.g. 15 August', 'years': 'e.g. 3', 'list characters': 'One character per line',
    'color palette': 'e.g. navy, white, gold', 'startup': 'e.g. a food-delivery startup', 'skill/topic': 'e.g. Python', 'travel details': 'e.g. 4 days, budget ₹20,000',
    'code': 'Paste your code here', 'keyword': 'e.g. best budget phones', 'city': 'e.g. Pune', 'idea': 'e.g. a podcast about history',
    'target audience': 'e.g. working professionals', 'genre': 'e.g. mystery, comedy', 'assignment type': 'e.g. essay', 'language': 'e.g. Hindi, English',
    'paste notes': 'Paste your notes here'
  };

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function norm(token) { return token.slice(1, -1).toLowerCase().replace(/\s+/g, ' ').trim(); }
  function track(action, n) { if (typeof gtag === 'function') { try { gtag('event', 'fill_blanks', { action: action, filled: n }); } catch (e) {} } }
  function load() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; } }
  function save(map) { try { localStorage.setItem(STORE, JSON.stringify(map)); } catch (e) {} }

  /* Turn a bracket name into a friendly label + hint, whatever the name is. */
  function describe(key, raw) {
    var inner = raw.slice(1, -1).trim(), example = '', base = inner;
    var m = inner.match(/^(.*?)[,(]?\s*(?:e\.g\.|for example)[:.\s]\s*(.+?)\)?$/i);   // "[body area, e.g. hips, shoulders]"
    if (m && m[1].trim()) { base = m[1].trim(); example = m[2].trim(); }
    base = base.replace(/[\s\u2014\u2013:,\-]+$/, '');                      // "SEED IDEA —" -> "SEED IDEA"
    var words = base.replace(/\s+/g, ' ').toLowerCase().split(' ').map(function (w, i) {
      if (ACRONYMS[w]) return ACRONYMS[w];
      return i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w;
    });
    var label = words.join(' ').replace(/\s*\/\s*/g, ' / ');
    var hint = HINTS[key] || (example ? 'e.g. ' + example.replace(/^e\.g\.\s*/i, '') : 'Type your ' + label.toLowerCase());
    var multi = TEXTAREA.test(key);
    return { key: key, raw: raw, label: label, hint: hint, multi: multi, numeric: NUMERIC.test(key), save: !NO_SAVE.test(key) };
  }

  window.spFillBlanks = function (promptText) {
    try { init(String(promptText || '')); } catch (e) { /* the feature must never break the page */ }
  };

  function init(text) {
    var promptEl = document.getElementById('prompt-text');
    var box = promptEl && promptEl.closest('.prompt-box');
    if (!promptEl || !box || !box.parentNode) return;
    if (document.getElementById('sp-fill')) return;                 // already built

    var tokens = text.match(RX);
    if (!tokens || !tokens.length) return;                          // no blanks: leave the page exactly as it is

    var fields = [], byKey = {};
    tokens.forEach(function (t) {
      var k = norm(t);
      if (!byKey[k]) { byKey[k] = describe(k, t); fields.push(byKey[k]); }
    });

    var saved = load(), vals = {}, prefilled = 0, active = null;
    fields.forEach(function (f) {
      if (f.save && saved[f.key]) { vals[f.key] = saved[f.key]; prefilled++; } else { vals[f.key] = ''; }
    });

    injectCss();

    /* ---- panel ---- */
    var panel = document.createElement('div');
    panel.className = 'spf-fill'; panel.id = 'sp-fill';
    panel.innerHTML =
      '<button type="button" class="spf-fill-head" aria-expanded="true" aria-controls="sp-fill-body">' +
        '<span class="spf-fill-title">✍️ Fill in the blanks <b>(' + fields.length + ')</b></span>' +
        '<span class="spf-fill-status" id="sp-fill-status" aria-live="polite"></span>' +
        '<span class="spf-fill-chev" aria-hidden="true">⌄</span>' +
      '</button>' +
      '<div class="spf-fill-body" id="sp-fill-body"><div class="spf-fields"></div>' +
        '<p class="spf-fill-note">Copy works any time. Blanks you leave empty are copied as they are.</p>' +
        '<div class="spf-fill-saved" id="sp-fill-saved" hidden>Some boxes were filled from your earlier answers. <button type="button" id="sp-fill-clear">Clear all</button></div>' +
      '</div>';
    var list = panel.querySelector('.spf-fields');

    fields.forEach(function (f, i) {
      var id = 'sp-f-' + i, last = i === fields.length - 1;
      var wrap = document.createElement('label');
      wrap.className = 'spf-field'; wrap.setAttribute('for', id);
      var lab = document.createElement('span'); lab.className = 'spf-label'; lab.textContent = f.label;
      var inp = document.createElement(f.multi ? 'textarea' : 'input');
      inp.id = id; inp.className = 'spf-input'; inp.placeholder = f.hint; inp.value = vals[f.key];
      inp.setAttribute('data-key', f.key); inp.maxLength = f.multi ? 4000 : 200; inp.autocomplete = 'off';
      if (f.multi) { inp.rows = 3; }
      else { inp.type = 'text'; inp.setAttribute('enterkeyhint', last ? 'done' : 'next'); if (f.numeric) inp.setAttribute('inputmode', 'decimal'); }
      wrap.appendChild(lab); wrap.appendChild(inp); list.appendChild(wrap);

      inp.addEventListener('input', function () {
        vals[f.key] = inp.value;
        if (f.save) { var s = load(); if (inp.value.trim()) s[f.key] = inp.value.trim().slice(0, 60); else delete s[f.key]; save(s); }
        if (!started) { started = true; track('started', 0); }
        render();
      });
      inp.addEventListener('focus', function () { active = f.key; render(); });
      inp.addEventListener('blur', function () { active = null; render(); });
      if (!f.multi) inp.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        var next = list.querySelectorAll('.spf-input')[i + 1];
        if (next) next.focus(); else inp.blur();
      });
    });

    box.parentNode.insertBefore(panel, box);                       // the panel sits right above the prompt box

    var started = false;
    var statusEl = panel.querySelector('#sp-fill-status');
    var savedNote = panel.querySelector('#sp-fill-saved');
    savedNote.hidden = prefilled === 0;

    panel.querySelector('.spf-fill-head').addEventListener('click', function () {
      var open = this.getAttribute('aria-expanded') !== 'true';
      this.setAttribute('aria-expanded', String(open));
      panel.classList.toggle('is-closed', !open);
    });
    panel.querySelector('#sp-fill-clear').addEventListener('click', function () {
      fields.forEach(function (f) { vals[f.key] = ''; });
      list.querySelectorAll('.spf-input').forEach(function (i) { i.value = ''; });
      var s = load(); fields.forEach(function (f) { delete s[f.key]; }); save(s);
      savedNote.hidden = true; render();
    });

    function filledCount() { return fields.filter(function (f) { return vals[f.key].trim(); }).length; }

    function render() {
      var out = '', last = 0, m, plain = '';
      RX.lastIndex = 0;
      while ((m = RX.exec(text))) {
        var key = norm(m[0]), v = (vals[key] || '').trim();
        var before = text.slice(last, m.index);
        out += esc(before); plain += before;
        var on = active === key ? ' placeholder-active' : '';
        if (v) { out += '<span class="placeholder-filled' + on + '">' + esc(v) + '</span>'; plain += v; }
        else { out += '<span class="placeholder-token' + on + '">' + esc(m[0]) + '</span>'; plain += m[0]; }
        last = m.index + m[0].length;
      }
      out += esc(text.slice(last)); plain += text.slice(last);
      promptEl.innerHTML = out;
      window.__currentPromptText = plain;                           // Copy and "Open in AI" both read this
      var n = filledCount();
      statusEl.textContent = n + ' of ' + fields.length + ' filled';
      panel.classList.toggle('is-done', n === fields.length);
    }

    /* count how often people copy a filled prompt (Google Analytics event, free) */
    var copyBtn = document.getElementById('copy-btn');
    if (copyBtn) copyBtn.addEventListener('click', function () { track('copied', filledCount()); });

    render();
  }

  function injectCss() {
    if (document.getElementById('sp-fill-css')) return;
    var s = document.createElement('style');
    s.id = 'sp-fill-css';
    s.textContent =
      '.spf-fill{margin:0 0 1rem;border:1.5px solid rgba(99,102,241,.5);border-radius:16px;background:var(--bg-card,#fff);box-shadow:0 10px 26px -18px rgba(49,46,129,.6);overflow:hidden}' +
      '.spf-fill-head{width:100%;display:flex;align-items:center;gap:.7rem;padding:.85rem 1rem;border:0;background:linear-gradient(90deg,rgba(79,70,229,.12),rgba(219,39,119,.08));color:var(--text,#111);font:700 .95rem/1.2 var(--font-body,system-ui,sans-serif);cursor:pointer;text-align:left}' +
      '.spf-fill-head:focus-visible{outline:3px solid #6366f1;outline-offset:-3px}' +
      '.spf-fill-title b{color:#4f46e5;font-weight:800}' +
      ':root:not([data-theme="light"]) .spf-fill-title b{color:#a5b4fc}' +
      '.spf-fill-status{margin-left:auto;font-size:.78rem;font-weight:700;color:var(--muted,#667);white-space:nowrap}' +
      '.spf-fill.is-done .spf-fill-status{color:#178a52}' +
      '.spf-fill-chev{font-size:1.1rem;transition:transform .2s ease}' +
      '.spf-fill.is-closed .spf-fill-chev{transform:rotate(-90deg)}' +
      '.spf-fill-body{padding:.9rem 1rem 1rem}' +
      '.spf-fill.is-closed .spf-fill-body{display:none}' +
      '.spf-fields{display:grid;gap:.75rem}' +
      '@media(min-width:720px){.spf-fields{grid-template-columns:1fr 1fr}.spf-field:has(textarea){grid-column:1/-1}}' +
      '.spf-field{display:flex;flex-direction:column;gap:.3rem}' +
      '.spf-label{font-size:.82rem;font-weight:700;color:var(--text,#111)}' +
      '.spf-input{width:100%;box-sizing:border-box;min-height:46px;padding:.6rem .8rem;border:1.5px solid var(--border,#c9cde2);border-radius:12px;background:var(--bg,#fff);color:var(--text,#111);font:inherit;font-size:16px}' +
      'textarea.spf-input{min-height:84px;resize:vertical;line-height:1.5}' +
      '.spf-input::placeholder{color:var(--muted,#778);opacity:.9}' +
      '.spf-input:focus{outline:3px solid rgba(99,102,241,.45);outline-offset:1px;border-color:#6366f1}' +
      '.spf-fill-note{margin:.8rem 0 0;font-size:.8rem;color:var(--muted,#667)}' +
      '.spf-fill-saved{margin-top:.5rem;font-size:.8rem;color:var(--muted,#667)}' +
      '.spf-fill-saved button{border:0;background:none;color:#4f46e5;font:inherit;font-weight:700;text-decoration:underline;cursor:pointer;padding:.2rem}' +
      '.placeholder-filled{display:inline;background:rgba(23,138,82,.14);color:inherit;border:1px solid rgba(23,138,82,.45);border-radius:4px;padding:.05rem .35rem;font-weight:600;white-space:pre-wrap;word-break:break-word}' +
      '.placeholder-active{outline:2px solid #6366f1;outline-offset:1px;box-shadow:0 0 0 4px rgba(99,102,241,.2)}';
    document.head.appendChild(s);
  }
})();
