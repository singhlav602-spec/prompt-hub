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
  'Business': '💼', 'Marketing': '📣', 'Writing': '✍️', 'Coding': '</>',
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
      <span class="card-open-btn">
        Open prompt
        <svg class="card-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
        </svg>
      </span>
    </div>
  `;
  return a;
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
        showList(tag.dataset.category);
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
  const trendingSection = document.getElementById('trending-section');
  const trendingGrid    = document.getElementById('trending-grid');
  const categoryBrowse  = document.getElementById('category-browse');
  const categoryGridEl  = document.getElementById('category-grid');
  const categoryTailEl  = document.getElementById('category-tail');
  const listHeader      = document.getElementById('list-header');
  const promoBanner     = document.querySelector('.promo-banner');
  const newsletterBar   = document.querySelector('.newsletter-bar');
  const backLink        = document.getElementById('back-to-categories');

  let activeCategory = 'All';
  let searchTerm = '';

  /* --- Trending strip (set via admin panel's "Trending" tag; auto-expires
     after 1 week, checked server-side in /api/prompts) --- */
  const trending = prompts.filter(p => p.tag === 'trending');
  if (trending.length && trendingSection && trendingGrid) {
    trendingGrid.innerHTML = trending.map(p => `
      <a class="trending-card" href="prompt.html?slug=${encodeURIComponent(p.slug)}">
        <div class="trending-top-row">
          <span class="trending-badge">🔥 Trending</span>
          ${categoryTag(p.category)}
        </div>
        <div class="card-title">${escapeHtml(p.title)}</div>
        <div class="card-preview">${escapeHtml(p.preview || p.prompt.slice(0, 130) + '…')}</div>
      </a>
    `).join('');
    trendingSection.style.display = '';
  }

  /* --- Build category cards (top categories) + long-tail chips --- */
  const catCounts = {};
  prompts.forEach(p => { catCounts[p.category] = (catCounts[p.category] || 0) + 1; });
  const sortedCats = Object.entries(catCounts).sort((a, b) => b[1] - a[1]);
  const TOP_N = 12;
  const topCats = sortedCats.slice(0, TOP_N);
  const tailCats = sortedCats.slice(TOP_N);

  const topPromptsSection = document.getElementById('top-prompts-section');

  function showCategoryBrowse() {
    activeCategory = 'All';
    searchTerm = '';
    if (searchInput) searchInput.value = '';
    if (searchHero) searchHero.value = '';
    categoryBrowse.style.display = '';
    if (statsBar) statsBar.style.display = '';
    if (topPromptsSection) topPromptsSection.style.display = '';
    if (promoBanner) promoBanner.style.display = '';
    if (newsletterBar) newsletterBar.style.display = '';
    listHeader.style.display = 'none';
    grid.style.display = 'none';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showList(category, term) {
    activeCategory = category;
    searchTerm = term || '';
    categoryBrowse.style.display = 'none';
    // Hide everything between the hero and the results so results land
    // right under the search box instead of way down the page.
    if (statsBar) statsBar.style.display = 'none';
    if (trendingSection) trendingSection.style.display = 'none';
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
  }

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
    el.addEventListener('click', () => showList(el.dataset.category));
  });
  categoryTailEl.querySelectorAll('.filter-btn').forEach(el => {
    el.addEventListener('click', () => showList(el.dataset.category));
  });

  /* --- Featured Prompts: one pick per top category, no invented view
     counts — just an honest, varied sample of the library --- */
  const topPromptsList = document.getElementById('top-prompts-list');
  if (topPromptsSection && topPromptsList) {
    const usedCats = new Set();
    const picks = [];
    for (const [cat] of topCats) {
      const p = prompts.find(x => x.category === cat);
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
  if (urlQuery) {
    if (searchInput) searchInput.value = urlQuery;
    if (searchHero)  searchHero.value  = urlQuery;
    showList('All', urlQuery);
  } else {
    showCategoryBrowse();
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

/* Converts already-escaped text into paragraphs on blank lines. */
function textToParagraphs(escapedText) {
  return escapedText
    .split(/\n\s*\n/)
    .map(para => `<p>${para.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/* --- Homepage "new post" banner — only visible within 24h of the newest post's publish time --- */
async function initFeaturedBlogBanner() {
  const banner = document.getElementById('featured-blog-banner');
  if (!banner) return;

  const posts = await fetchBlogPosts();
  if (!posts.length) return;

  const newest = posts[0]; // /api/blog already orders by published_at DESC
  const publishedMs = new Date(newest.published_at + 'Z').getTime();
  const ageMs = Date.now() - publishedMs;
  const DAY_MS = 24 * 60 * 60 * 1000;

  if (isNaN(publishedMs) || ageMs >= DAY_MS || ageMs < 0) return; // older than 24h (or bad date) — stays hidden, lives only in the blog list

  document.getElementById('featured-blog-banner-title').textContent = newest.title;
  document.getElementById('featured-blog-banner-link').href = `blog-post.html?slug=${encodeURIComponent(newest.slug)}`;
  banner.classList.add('show');
}

/* --- Blog list page (blog.html) --- */
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
  const metaDesc = document.getElementById('meta-description');
  if (metaDesc) metaDesc.setAttribute('content', post.excerpt || post.title);
  const canonical = document.getElementById('canonical-link');
  if (canonical) canonical.href = `https://smart-prompt.in/blog-post.html?slug=${encodeURIComponent(post.slug)}`;

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
  const hash = window.location.hash;
  const isHome = path === '/' || path.endsWith('/') || path.endsWith('index.html');
  const isCategories = isHome && hash === '#category-browse';
  const isTrending = isHome && hash === '#trending-section';
  const isBlog = path.includes('blog');
  const isMore = path.includes('submit') || path.includes('about');

  const items = [
    {
      label: 'Home', href: 'index.html',
      active: isHome && !isCategories && !isTrending,
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"/></svg>',
    },
    {
      label: 'Categories', href: 'index.html#category-browse',
      active: isCategories,
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
    },
    {
      label: 'Trending', href: 'index.html#trending-section',
      active: isTrending,
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c1 3-2 4-2 7a4 4 0 0 0 8 0c0-1-.5-2-1-3 2 1 3 3 3 6a6 6 0 0 1-12 0c0-4 2-5 4-10z"/></svg>',
    },
    {
      label: 'Blog', href: 'blog.html',
      active: isBlog,
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h9l3 3v17H6z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>',
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
    <div class="icon-nav-more-popover" id="icon-nav-more-popover">
      <a href="submit.html" class="site-nav-link">Submit Prompt</a>
      <a href="about.html" class="site-nav-link">About</a>
    </div>
  `;

  header.insertAdjacentElement('afterend', bar);

  const moreBtn = document.getElementById('icon-nav-more-btn');
  const morePopover = document.getElementById('icon-nav-more-popover');
  moreBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    morePopover.classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    if (!morePopover.contains(e.target) && e.target !== moreBtn) {
      morePopover.classList.remove('open');
    }
  });
}

/* ---- Init ---- */
document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle();
  initMobileNav();
  initIconNavBar();
  initIndexPage();
  initPromptPage();
  initBlogListPage();
  initBlogPostPage();
  initSubmitPage();
});
