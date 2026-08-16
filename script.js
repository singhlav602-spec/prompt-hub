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
  a.href = `prompt.html?slug=${encodeURIComponent(prompt.slug)}`;
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
  a.href = `prompt.html?slug=${encodeURIComponent(prompt.slug)}`;
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
      url: `https://smart-prompt.in/prompt.html?slug=${encodeURIComponent(p.slug)}`,
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
        { '@type': 'ListItem', position: 2, name: 'Trending & Popular Prompts', item: 'https://smart-prompt.in/trending-prompts.html' },
      ],
    });
  }

  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.id = 'discovery-structured-data';
  script.textContent = JSON.stringify(payload);
  document.head.appendChild(script);
}

/* ---- Render the Card Grid ---- */
function renderGrid(prompts, container, searchTerm = '', activeCategory = 'All') {
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

  // Cap how many cards get built at once — rendering hundreds of DOM nodes
  // for a broad match (e.g. a single common letter) is what made typing feel
  // sluggish. Narrowing the search still reveals more as the list shortens.
  const RENDER_CAP = 60;
  const toRender = filtered.slice(0, RENDER_CAP);

  toRender.forEach((prompt, i) => {
    const card = buildCard(prompt, i * 25);
    container.appendChild(card);
  });

  if (totalMatches > RENDER_CAP) {
    const note = document.createElement('div');
    note.className = 'render-cap-note';
    note.textContent = `Showing first ${RENDER_CAP} of ${totalMatches} matches — narrow your search to see more specific results.`;
    container.appendChild(note);
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

  /* --- Featured blog banner: only shown within 24h of the newest post's publish time --- */
  initFeaturedBlogBanner();

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
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  window.showList = showList;

  categoryGridEl.innerHTML = topCats.map(([cat, count], i) => {
    const icon = CATEGORY_ICONS[cat] || '✨';
    const color = CARD_COLORS[i % CARD_COLORS.length];
    return `
    <div class="category-card" data-category="${escapeHtml(cat)}">
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
    </div>
  `;
  }).join('');

  categoryTailEl.innerHTML = tailCats.map(([cat, count]) => `
    <button class="filter-btn" data-category="${escapeHtml(cat)}">${escapeHtml(cat)} · ${count}</button>
  `).join('');

  categoryGridEl.querySelectorAll('.category-card').forEach(el => {
    el.addEventListener('click', () => {
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
          <a class="top-prompt-item" href="prompt.html?slug=${encodeURIComponent(p.slug)}">
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
        <a href="index.html" class="btn-home">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          Back to Library
        </a>
      </div>
    `;
    return;
  }

  const prompts = await fetchPrompts();
  const prompt  = prompts.find(p => p.slug === slug);

  if (!prompt) {
    detail.innerHTML = `
      <div class="error-page animate-fade-up">
        <div class="error-code">404</div>
        <h2>Prompt Not Found</h2>
        <p>We couldn't find a prompt with the slug "<strong>${escapeHtml(slug)}</strong>".</p>
        <a href="index.html" class="btn-home">
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
  const pageUrl = `https://smart-prompt.in/prompt.html?slug=${encodeURIComponent(prompt.slug)}`;

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
  const ldBreadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://smart-prompt.in/" },
      { "@type": "ListItem", "position": 2, "name": prompt.category, "item": "https://smart-prompt.in/index.html#category-browse" },
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
      { "@type": "Question", "name": "How do I get better output?", "acceptedAnswer": { "@type": "Answer", "text": "Fill in the placeholder fields with specific, real details instead of vague ones — the more specific your input, the better the AI's result." } },
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

  /* --- Related prompts --- */
  const related = prompts
    .filter(p => p.category === prompt.category && p.slug !== prompt.slug)
    .slice(0, 6);

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
        <div class="related-title">More in ${escapeHtml(prompt.category)}</div>
        <div class="related-grid">
          ${related.map(r => `
            <a class="prompt-card" href="prompt.html?slug=${encodeURIComponent(r.slug)}">
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
      <a href="index.html" class="back-link animate-fade-up">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
        </svg>
        All Prompts
      </a>

      <nav class="breadcrumb-nav animate-fade-up" aria-label="Breadcrumb">
        <a href="index.html">Home</a>
        <span class="breadcrumb-sep">/</span>
        <a href="index.html#category-browse">${escapeHtml(prompt.category)}</a>
        <span class="breadcrumb-sep">/</span>
        <span class="breadcrumb-current">${escapeHtml(prompt.title)}</span>
      </nav>

      <div class="animate-fade-up" style="animation-delay:50ms">
        <div class="prompt-page-meta-row">
          <div class="prompt-page-category">${escapeHtml(prompt.category)}</div>
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
          ${['Students', 'Teachers', 'Developers', 'Business owners', 'Content creators'].map(u => `<span class="chip chip-outline">${u}</span>`).join('')}
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
          <div class="faq-a">Fill in the placeholder fields with specific, real details instead of vague ones — the more specific your input, the better the AI's result.</div>
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
      copyToClipboard(prompt.prompt, copyBtn);
    });
  }

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
  document.getElementById('featured-blog-banner-link').href = `blog-post.html?slug=${encodeURIComponent(featured.slug)}`;
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
      <a class="gallery-card animate-fade-up" href="gallery-item.html?slug=${encodeURIComponent(g.slug)}">
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
      url: `https://smart-prompt.in/gallery-item.html?slug=${encodeURIComponent(g.slug)}`,
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
        <a href="gallery.html" class="btn-home">
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
  const pageUrl = `https://smart-prompt.in/gallery-item.html?slug=${encodeURIComponent(item.slug)}`;
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
        { '@type': 'ListItem', position: 2, name: 'Gallery', item: 'https://smart-prompt.in/gallery.html' },
        { '@type': 'ListItem', position: 3, name: item.title, item: pageUrl },
      ],
    },
  ]);

  detail.innerHTML = `
    <a href="gallery.html" class="back-link animate-fade-up">
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
      <a class="gallery-card animate-fade-up" href="video-item.html?slug=${encodeURIComponent(v.slug)}">
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
      url: `https://smart-prompt.in/video-item.html?slug=${encodeURIComponent(v.slug)}`,
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
        <a href="videos.html" class="btn-home">
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
  const pageUrl = `https://smart-prompt.in/video-item.html?slug=${encodeURIComponent(item.slug)}`;
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
        { '@type': 'ListItem', position: 2, name: 'Videos', item: 'https://smart-prompt.in/videos.html' },
        { '@type': 'ListItem', position: 3, name: item.title, item: pageUrl },
      ],
    },
  ]);

  detail.innerHTML = `
    <a href="videos.html" class="back-link animate-fade-up">
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
    <a class="prompt-card animate-fade-up" href="blog-post.html?slug=${encodeURIComponent(p.slug)}">
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
        <a href="blog.html" class="btn-home">
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
  const pageUrl = `https://smart-prompt.in/blog-post.html?slug=${encodeURIComponent(post.slug)}`;
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
        { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://smart-prompt.in/blog.html' },
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
            <a class="prompt-card" href="blog-post.html?slug=${encodeURIComponent(r.slug)}">
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
    <a href="blog.html" class="back-link animate-fade-up">
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
   right below the header on small screens only; desktop is untouched ---- */
function initIconNavBar() {
  const header = document.querySelector('.site-header');
  if (!header || document.querySelector('.icon-nav-bar')) return;

  const path = window.location.pathname;
  const isHome = path === '/' || path.endsWith('/') || path.endsWith('index.html');
  const isTrending = path.includes('trending-prompts');
  const isBlog = path.includes('blog');
  const isGallery = path.includes('gallery') && !path.includes('gallery-item');
  const isVideos = path.includes('video');
  const isMore = path.includes('submit') || path.includes('about') || path.includes('seo-tool') || path.includes('prompt-improver') || path.includes('image-prompt-generator');

  const items = [
    {
      label: 'Home', href: 'index.html',
      active: isHome && !isTrending,
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"/></svg>',
    },
    {
      label: 'Trending', href: 'trending-prompts.html',
      active: isTrending,
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c1 3-2 4-2 7a4 4 0 0 0 8 0c0-1-.5-2-1-3 2 1 3 3 3 6a6 6 0 0 1-12 0c0-4 2-5 4-10z"/></svg>',
    },
    {
      label: 'Blog', href: 'blog.html',
      active: isBlog && !isGallery,
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h9l3 3v17H6z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>',
    },
    {
      label: 'Gallery', href: 'gallery.html',
      active: isGallery,
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.8"/><path d="M21 15l-5-5-9 9"/></svg>',
    },
    {
      label: 'Videos', href: 'videos.html',
      active: isVideos,
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="14" height="14" rx="2"/><path d="M21 8.5l-4.5 3.5 4.5 3.5v-7z"/></svg>',
    },
  ];

  const bar = document.createElement('div');
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

  // The popover lives at the very end of <body> (not inside .icon-nav-bar)
  // and uses position:fixed with JS-computed coordinates — .icon-nav-bar
  // scrolls horizontally (overflow-x:auto), and CSS forces overflow-y to
  // clip too whenever overflow-x isn't "visible", so anything absolutely
  // positioned *inside* it that pokes out the bottom gets silently cut off.
  const morePopover = document.createElement('div');
  morePopover.className = 'icon-nav-more-popover';
  morePopover.id = 'icon-nav-more-popover';
  morePopover.innerHTML = `
    <a href="seo-tool.html" class="site-nav-link">SEO Tool</a>
    <a href="prompt-improver.html" class="site-nav-link">Prompt Improver</a>
    <a href="image-prompt-generator.html" class="site-nav-link">Image Prompt Generator</a>
    <a href="submit.html" class="site-nav-link">Submit Prompt</a>
    <a href="about.html" class="site-nav-link">About</a>
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
  initThemeToggle();
  initMobileNav();
  initIconNavBar();
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
});
