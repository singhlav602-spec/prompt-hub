// ONE-TIME TOOL: moves all banner prompts into one category called "Banner".
// (Not "Banner Prompts": the site adds the word "Prompts" itself, which would give
//  the page title "Banner Prompts Prompts".)  Page: /category/banner
//
//   1) Preview (changes nothing):  /api/admin/apply-banner-category
//   2) Apply:                      /api/admin/apply-banner-category?apply=1
//   3) Undo (old categories back): /api/admin/apply-banner-category?rollback=1
//
// Admin login required. Prompt URLs (slugs) never change. A prompt is moved only
// if it is still in the category it had when this file was built, and the old
// category of every moved prompt is saved in table banner_category_backup.
// Categories that get clicks in Search Console (Gaming, Travel, ...) are left alone.
// DELETE THIS FILE from the repo after use.
import { requireAuth } from '../../_auth.js';

const NEW_CATEGORY = 'Banner';
const MOVES = [["banner-design-prompt", "AI Image"], ["marketing-banner-generator", "Marketing"], ["youtube-channel-banner-prompt-generator", "AI Image"], ["chatgpt-banner-prompt-generator", "AI Image Generation"], ["chatgpt-banner-prompt", "AI Image Generation"], ["chatgpt-banner-image-creator", "AI Image Generation"], ["ai-banner-generator", "AI Image Generation"], ["independence-day-banner-designer", "AI Image Generation"], ["chatgpt-banner-design-prompt", "AI Image Generation"], ["chatgpt-prompt-for-banner-design", "AI Image Generation"], ["professional-business-banner-master-prompt", "Advertising"], ["ai-banner-style-generator", "AI Image Generation"], ["ai-banner-layout-generator", "AI Image Generation"], ["ai-banner-background-generator", "AI Image Generation"], ["ai-banner-design-prompt-generator", "AI Prompt Generator"], ["ai-banner-design-prompt-creator", "Marketing"], ["youtube-thumbnail-and-banner-designer", "Marketing"], ["instagram-banner-copy-generator", "Marketing"], ["sale-and-discount-banner-copywriter", "Marketing"], ["custom-gaming-channel-banner-design", "Marketing"], ["travel-and-tourism-banner-copy", "Marketing"], ["festival-banner-copy-and-visuals", "Marketing"], ["chatgpt-banner-generator", "AI Tools"], ["chatgpt-banner-maker", "AI Design"], ["banner-design-generator", "Graphic Design"], ["ad-banner-prompt-generator", "AI Design"], ["website-banner-generator", "Web Design"], ["youtube-banner-generator", "YouTube"], ["facebook-banner-generator", "Social Media"], ["instagram-banner-generator", "Social Media"], ["ai-banner-maker", "AI Design"], ["social-media-banner-maker", "Social Media"], ["youtube-channel-banner-maker", "YouTube"], ["chatgpt-banner-maker-2", "AI Design"], ["chatgpt-banner-maker-youtube", "AI Design"], ["chatgpt-banner-maker-business", "Business"], ["chatgpt-banner-maker-facebook", "Social Media"], ["chatgpt-banner-maker-instagram", "Social Media"], ["chatgpt-banner-maker-website", "Web Design"], ["chatgpt-banner-maker-ads", "Advertising"], ["chatgpt-banner-maker-personal-brand", "Branding"], ["chatgpt-banner-maker-education", "Education"], ["chatgpt-banner-maker-events", "Events"], ["chatgpt-banner-maker-linkedin", "Social Media"], ["chatgpt-banner-maker-x", "Social Media"], ["chatgpt-banner-maker-discord", "Community"], ["chatgpt-banner-maker-podcast", "Podcast"], ["chatgpt-banner-maker-blog", "Blogging"], ["chatgpt-banner-maker-course", "Education"], ["chatgpt-banner-maker-product", "Ecommerce"], ["chatgpt-banner-maker-portfolio", "Branding"], ["chatgpt-banner-maker-course-promotion", "Education"], ["chatgpt-banner-maker-startup", "Business"], ["chatgpt-banner-maker-sale", "Advertising"], ["chatgpt-banner-maker-restaurant", "Food Business"], ["chatgpt-banner-maker-real-estate", "Real Estate"], ["chatgpt-banner-maker-fitness", "Fitness"], ["chatgpt-banner-maker-festival", "Events"], ["chatgpt-banner-maker-app", "Technology"], ["chatgpt-banner-maker-blog-header", "Blogging"], ["chatgpt-banner-maker-webinar", "Events"], ["chatgpt-banner-maker-podcast-episode", "Podcast"], ["chatgpt-banner-maker-clothing", "Fashion"], ["chatgpt-banner-maker-beauty", "Beauty"], ["chatgpt-banner-maker-property", "Real Estate"], ["chatgpt-banner-maker-gym", "Fitness"], ["chatgpt-banner-maker-school", "Education"], ["chatgpt-banner-maker-coaching", "Education"], ["chatgpt-banner-maker-video", "YouTube"], ["chatgpt-banner-maker-app-promo", "Technology"], ["chatgpt-banner-maker-online-course", "Education"], ["chatgpt-banner-maker-restaurant-offer", "Food Business"], ["chatgpt-banner-maker-sale-promotion", "Advertising"], ["chatgpt-banner-maker-festival-offer", "Festivals"], ["chatgpt-banner-maker-new-product", "Product"], ["chatgpt-banner-maker-job", "Career"], ["chatgpt-banner-maker-news", "Media"], ["chatgpt-banner-maker-admission", "Education"], ["chatgpt-banner-maker-sports", "Sports"], ["chatgpt-banner-maker-black-friday", "Ecommerce"], ["chatgpt-banner-maker-opening", "Business"], ["chatgpt-banner-maker-birthday", "Events"], ["chatgpt-banner-maker-wedding", "Events"], ["chatgpt-banner-maker-sale-event", "Advertising"], ["chatgpt-banner-maker-school-admission", "Education"], ["chatgpt-banner-maker-property-sale", "Real Estate"], ["chatgpt-banner-maker-restaurant-opening", "Food Business"], ["chatgpt-banner-maker-online-store", "Ecommerce"], ["chatgpt-banner-maker-seminar", "Events"], ["chatgpt-banner-maker-fitness-challenge", "Fitness"], ["chatgpt-banner-maker-youtube-channel", "YouTube"], ["chatgpt-banner-maker-business-promotion", "Business"], ["chatgpt-banner-maker-festival-celebration", "Festivals"], ["chatgpt-banner-maker-new-shop", "Business"], ["chatgpt-banner-maker-coaching-admission", "Education"], ["chatgpt-banner-maker-online-business", "Business"], ["chatgpt-banner-maker-restaurant-menu", "Food Business"], ["chatgpt-banner-maker-job-hiring", "Recruitment"], ["chatgpt-banner-maker-product-launch", "Marketing"], ["chatgpt-banner-maker-webinar-promotion", "Webinar"], ["chatgpt-banner-maker-cafe", "Food Business"], ["chatgpt-banner-maker-hotel", "Hospitality"], ["chatgpt-banner-maker-photography", "Creative Services"], ["chatgpt-banner-maker-freelancer", "Freelancing"], ["chatgpt-banner-maker-course-sale", "Education"], ["chatgpt-banner-maker-app-download", "Technology"], ["chatgpt-banner-maker-ngo", "Nonprofit"], ["chatgpt-banner-maker-clinic", "Healthcare"], ["chatgpt-banner-maker-shorts", "YouTube"], ["chatgpt-banner-maker-ecommerce", "Ecommerce"], ["chatgpt-banner-maker-fashion", "Fashion"], ["chatgpt-banner-maker-salon", "Beauty"], ["chatgpt-banner-maker-photography-studio", "Creative Services"], ["chatgpt-banner-maker-freelancer-portfolio", "Freelancing"], ["chatgpt-banner-maker-book", "Publishing"], ["chatgpt-banner-maker-music", "Music"], ["chatgpt-banner-maker-podcast-promotion", "Podcast"], ["chatgpt-banner-maker-webinar-registration", "Webinar"], ["chatgpt-banner-maker-real-estate-agent", "Real Estate"], ["chatgpt-banner-maker-restaurant-discount", "Food Business"], ["chatgpt-banner-maker-gym-promotion", "Fitness"], ["chatgpt-banner-maker-school-event", "Education"], ["chatgpt-banner-maker-discount", "Ecommerce"], ["chatgpt-banner-maker-ngo-campaign", "Nonprofit"], ["chatgpt-banner-maker-doctor", "Healthcare"], ["chatgpt-banner-maker-app-launch", "Technology"], ["chatgpt-banner-maker-online-webinar", "Education"], ["chatgpt-banner-maker-property-rent", "Real Estate"], ["chatgpt-banner-maker-online-sale", "Ecommerce"], ["youtube-channel-banner-maker-2", "YouTube Branding"], ["youtube-banner-text-maker", "YouTube Branding"], ["mahadev-kawad-yatra-banner-maker", "Religion & Spirituality"], ["professional-banner-design-brief-creator", "Marketing"], ["professional-ratio-banner-prompt-generator", "Marketing"], ["professional-banner-design-creator", "Marketing"], ["ai-design-brand-banner-maker", "AI Design"], ["banner-advertising-business-maker", "Advertising"], ["banner-advertising-sale-maker", "Advertising"], ["banner-advertising-youtube-maker", "Advertising"], ["banner-advertising-website-maker", "Advertising"], ["banner-advertising-social-promotion-maker", "Advertising"], ["banner-advertising-event-maker", "Advertising"], ["banner-advertising-product-launch-maker", "Advertising"], ["banner-advertising-app-maker", "Advertising"], ["banner-advertising-course-maker", "Advertising"], ["banner-advertising-real-estate-maker", "Advertising"], ["marketing-banner-maker", "Marketing"], ["website-advertisement-banner", "Advertising"], ["vinayagar-chaturthi-event-banner", "Religion & Spirituality"], ["ganesh-chaturthi-festival-banner", "Religion & Spirituality"], ["vinayak-celebration-banner", "Religion & Spirituality"], ["youtube-banner-prompt-generator", "AI Image"], ["instagram-banner-prompt-generator", "AI Image"], ["business-banner-prompt-generator", "AI Image"], ["3d-banner-design-prompt-generator", "AI Image"], ["facebook-banner-prompt-generator", "AI Image"], ["website-banner-prompt-generator", "AI Image"], ["advertisement-banner-prompt-generator", "AI Image"], ["ai-banner-design-prompt", "AI Image"], ["banner-style-prompt-generator", "AI Image"], ["linkedin-banner-prompt-generator", "AI Image"], ["podcast-banner-prompt-generator", "AI Image"], ["gaming-banner-prompt-generator", "AI Image"], ["education-banner-prompt-generator", "AI Image"], ["product-banner-prompt-generator", "AI Image"], ["real-estate-banner-prompt-generator", "AI Image"], ["travel-banner-prompt-generator", "AI Image"], ["event-banner-prompt-generator", "AI Image"], ["food-banner-prompt-generator", "AI Image"], ["fashion-banner-prompt-generator", "AI Image"], ["technology-banner-prompt-generator", "AI Image"], ["youtube-gaming-banner-prompt-generator", "AI Image"], ["festival-banner-prompt-generator", "AI Image"], ["music-banner-prompt-generator", "AI Image"], ["fitness-banner-prompt-generator", "AI Image"], ["youtube-education-banner-prompt-generator", "AI Image"], ["restaurant-banner-prompt-generator", "AI Image"], ["app-promotion-banner-prompt-generator", "AI Image"], ["real-estate-advertisement-banner-prompt", "AI Image"], ["online-course-banner-prompt-generator", "AI Image"], ["youtube-tech-banner-prompt-generator", "AI Image"], ["beauty-brand-banner-prompt-generator", "AI Image"], ["startup-banner-prompt-generator", "AI Image"], ["mobile-app-banner-prompt-generator", "AI Image"], ["ecommerce-banner-prompt-generator", "AI Image"], ["sports-banner-prompt-generator", "AI Image"], ["corporate-banner-prompt-generator", "AI Image"], ["sale-banner-prompt-generator", "AI Image"], ["festival-celebration-banner-prompt-generator", "AI Image"], ["motivational-banner-prompt-generator", "AI Image"], ["minimalist-banner-prompt-generator", "AI Image"], ["luxury-banner-prompt-generator", "AI Image"], ["personal-brand-banner-prompt-generator", "AI Image"], ["real-estate-property-banner-prompt-generator", "AI Image"], ["automotive-banner-prompt-generator", "AI Image"], ["photography-banner-prompt-generator", "AI Image"], ["gaming-esports-banner-prompt-generator", "AI Image"], ["book-promotion-banner-prompt-generator", "AI Image"], ["restaurant-promotion-banner-prompt-generator", "AI Image"], ["real-estate-project-banner-prompt-generator", "AI Image"], ["medical-banner-prompt-generator", "AI Image"], ["wedding-banner-prompt-generator", "AI Image"], ["youtube-food-channel-banner-prompt-generator", "AI Image"], ["travel-agency-banner-prompt-generator", "AI Image"], ["school-admission-banner-prompt-generator", "AI Image"], ["coaching-institute-banner-prompt-generator", "AI Image"], ["youtube-finance-banner-prompt-generator", "AI Image"], ["beauty-salon-banner-prompt-generator", "AI Image"], ["business-promotion-banner-prompt-generator", "AI Image"], ["new-product-launch-banner-prompt-generator", "AI Image"], ["black-friday-banner-prompt-generator", "AI Image"], ["christmas-banner-prompt-generator", "AI Image"], ["new-year-banner-prompt-generator", "AI Image"], ["diwali-banner-prompt-generator", "AI Image"], ["independence-day-banner-prompt-generator", "AI Image"], ["republic-day-banner-prompt-generator", "AI Image"], ["birthday-banner-prompt-generator", "AI Image"], ["real-estate-property-sale-banner-generator", "AI Image"], ["restaurant-opening-banner-prompt-generator", "AI Image"], ["sale-discount-banner-prompt-generator", "AI Image"], ["youtube-thumbnail-banner-prompt-generator", "AI Image"], ["professional-linkedin-banner-prompt-generator", "AI Image"], ["restaurant-food-promotion-banner-generator", "AI Image"], ["online-course-promotion-banner-generator", "AI Image"], ["youtube-shorts-banner-prompt-generator", "AI Image"], ["digital-marketing-banner-prompt-generator", "AI Image"], ["app-download-banner-prompt-generator", "AI Image"], ["fitness-gym-banner-prompt-generator", "AI Image"], ["real-estate-rental-banner-prompt-generator", "AI Image"], ["restaurant-grand-opening-banner-generator", "AI Image"], ["black-friday-sale-banner-generator", "AI Image"], ["eid-mubarak-banner-prompt-generator", "AI Image"], ["sale-offer-social-media-banner-generator", "AI Image"], ["christmas-sale-banner-prompt-generator", "AI Image"], ["new-year-party-banner-prompt-generator", "AI Image"], ["medical-clinic-banner-prompt-generator", "AI Image"], ["fashion-brand-banner-prompt-generator", "AI Image"], ["technology-company-banner-prompt-generator", "AI Image"], ["real-estate-open-house-banner-prompt-generator", "AI Image"], ["ecommerce-product-banner-prompt-generator", "AI Image"], ["education-institute-admission-banner-generator", "AI Image"], ["beauty-salon-promotion-banner-generator", "AI Image"], ["mobile-app-promotion-banner-generator", "AI Image"], ["youtube-music-banner-prompt-generator", "AI Image"], ["podcast-cover-banner-prompt-generator", "AI Image"], ["restaurant-discount-banner-prompt-generator", "AI Image"], ["online-shopping-sale-banner-generator", "AI Image"], ["festival-event-banner-prompt-generator", "AI Image"], ["motivational-quote-banner-prompt-generator", "AI Image"], ["technology-product-launch-banner-generator", "AI Image"], ["black-friday-product-banner-prompt-generator", "AI Image"], ["online-business-banner-prompt-generator", "AI Image"], ["vishwakarma-puja-horizontal-banner", "Religion & Spirituality"], ["vishwakarma-puja-workshop-banner", "Religion & Spirituality"], ["vishwakarma-puja-construction-banner", "Religion & Spirituality"], ["transport-banner-copy-generator", "Marketing"], ["ai-banner-idea-generator", "AI Image Generation"], ["wedding-invitation-banner-prompt-generator", "AI Image"], ["gym-membership-offer-banner-generator", "AI Image"], ["mobile-phone-advertisement-banner-generator", "AI Image"], ["property-investment-banner-prompt-generator", "AI Image"], ["gym-membership-offer-banner-prompt-generator", "AI Image"], ["book-launch-banner-prompt-generator", "AI Image"], ["mobile-phone-sale-banner-prompt-generator", "AI Image"], ["youtube-channel-promotion-banner-generator", "AI Image"], ["festival-sale-banner-prompt-generator", "AI Image"], ["sports-event-banner-prompt-generator", "AI Image"], ["photography-portfolio-banner-prompt-generator", "AI Image"], ["corporate-business-banner-prompt-generator", "AI Image"], ["gaming-youtube-banner-prompt-generator", "AI Image"], ["real-estate-luxury-banner-prompt-generator", "AI Image"], ["fitness-transformation-banner-prompt-generator", "AI Image"], ["youtube-tech-channel-banner-generator", "AI Image"], ["event-promotion-banner-prompt-generator", "AI Image"], ["gym-membership-banner-prompt-generator", "AI Image"], ["mobile-phone-sale-banner-generator", "AI Image"], ["ai-banner-color-palette-generator", "AI Image Generation"], ["ai-banner-composition-generator", "AI Image Generation"], ["black-friday-ecommerce-banner-prompt-generator", "AI Image"], ["cyber-monday-banner-prompt-generator", "AI Image"], ["school-event-banner-prompt-generator", "AI Image"], ["coaching-admission-banner-prompt-generator", "AI Image"], ["fitness-challenge-banner-prompt-generator", "AI Image"], ["corporate-company-banner-prompt-generator", "AI Image"], ["travel-package-banner-prompt-generator", "AI Image"], ["startup-launch-banner-prompt-generator", "AI Image"], ["transport-banner-design-specialist", "Marketing"], ["ai-banner-typography-generator", "AI Image Generation"], ["ai-banner-lighting-generator", "AI Image Generation"], ["youtube-vlog-banner-prompt-generator", "AI Image"], ["school-annual-function-banner-generator", "AI Image"], ["mobile-game-promotion-banner-generator", "AI Image"], ["beauty-product-advertisement-banner-generator", "AI Image"], ["photography-portfolio-banner-generator", "AI Image"], ["apparel-sale-banner-prompt-generator", "AI Image"], ["tech-product-launch-banner-generator", "AI Image"], ["ai-banner-depth-generator", "AI Image Generation"], ["real-estate-investment-banner-prompt-generator", "AI Image"], ["web-development-agency-banner-generator", "AI Image"], ["online-exam-preparation-banner-generator", "AI Image"], ["youtube-live-stream-banner-prompt-generator", "AI Image"], ["construction-company-banner-prompt-generator", "AI Image"], ["jewelry-brand-banner-prompt-generator", "AI Image"], ["restaurant-menu-banner-prompt-generator", "AI Image"], ["corporate-business-event-banner-generator", "AI Image"], ["ai-banner-texture-generator", "AI Image Generation"], ["bailpola-banner-copy-generator", "Marketing"], ["creative-banner-design-brief", "Marketing"], ["transport-banner-design-concept-generator", "Marketing"], ["vishwakarma-puja-youtube-channel-banner", "Religion & Spirituality"], ["ai-banner-element-placement-generator", "AI Image Generation"], ["ecommerce-product-banner-designer", "Graphic Design"], ["salon-video-banner-script-generator", "Marketing"], ["flex-banner-prompt-for-chatgpt", "AI Image"], ["shop-opening-flex-banner-prompt", "AI Image"], ["shop-banner-design-prompt-for-chatgpt", "AI Image"], ["birthday-flex-banner-prompt", "AI Image"], ["wedding-flex-banner-prompt", "AI Image"], ["festival-sale-flex-banner-prompt", "AI Image"], ["coaching-admission-flex-banner-prompt", "AI Image"], ["school-admission-flex-banner-prompt", "AI Image"], ["medical-store-flex-banner-prompt", "AI Image"], ["sweet-shop-restaurant-flex-banner-prompt", "AI Image"], ["gym-fitness-flex-banner-prompt", "AI Image"], ["mobile-shop-offer-flex-banner-prompt", "AI Image"], ["clothing-store-sale-flex-banner-prompt", "AI Image"], ["real-estate-plot-flex-banner-prompt", "AI Image"], ["beauty-salon-flex-banner-prompt", "AI Image"], ["republic-independence-day-flex-banner-prompt", "AI Image"]]; // [slug, old_category]

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!(await requireAuth(request, env))) return json({ error: 'Not authorized' }, 401);

  const db = env.DB;
  const q = new URL(request.url).searchParams;
  const apply = q.get('apply') === '1';

  if (q.get('rollback') === '1') {
    const exists = await db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='banner_category_backup'`)
      .first();
    if (!exists) return json({ error: 'No backup table - nothing to roll back.' }, 404);
    const res = await db
      .prepare(
        `UPDATE prompts
            SET category = (SELECT b.old_category FROM banner_category_backup b WHERE b.slug = prompts.slug),
                updated_at = datetime('now')
          WHERE slug IN (SELECT slug FROM banner_category_backup) AND category = ?`
      )
      .bind(NEW_CATEGORY)
      .run();
    return json({ mode: 'ROLLED BACK', restored: (res.meta && res.meta.changes) || 0 });
  }

  // Where is each prompt right now?
  const cur = new Map();
  for (let i = 0; i < MOVES.length; i += 50) {
    const slugs = MOVES.slice(i, i + 50).map(m => m[0]);
    const ph = slugs.map(() => '?').join(',');
    const { results } = await db
      .prepare(`SELECT slug, category FROM prompts WHERE slug IN (${ph})`)
      .bind(...slugs)
      .all();
    for (const r of results) cur.set(r.slug, r.category);
  }

  const ready = [];
  const changed = [];
  const missing = [];
  for (const [slug, oldCat] of MOVES) {
    if (!cur.has(slug)) missing.push(slug);
    else if (cur.get(slug) !== oldCat) changed.push({ slug, now: cur.get(slug), expected: oldCat });
    else ready.push([slug, oldCat]);
  }

  const byCat = {};
  for (const [, c] of ready) byCat[c] = (byCat[c] || 0) + 1;

  if (!apply) {
    return json({
      mode: 'PREVIEW - nothing was changed',
      new_category: NEW_CATEGORY,
      total_in_file: MOVES.length,
      will_move: ready.length,
      moving_from: Object.fromEntries(Object.entries(byCat).sort((a, b) => b[1] - a[1])),
      skipped_category_changed_since_export: changed,
      slug_not_found: missing,
      next_step: 'Open the same URL with ?apply=1. Undo later with ?rollback=1.',
    });
  }

  await db
    .prepare(`CREATE TABLE IF NOT EXISTS banner_category_backup (slug TEXT PRIMARY KEY, old_category TEXT NOT NULL)`)
    .run();

  let moved = 0;
  for (let i = 0; i < ready.length; i += 25) {
    const chunk = ready.slice(i, i + 25);
    const stmts = chunk.map(([slug, oldCat]) =>
      db.prepare(`INSERT OR IGNORE INTO banner_category_backup (slug, old_category) VALUES (?, ?)`).bind(slug, oldCat)
    );
    for (const [slug, oldCat] of chunk) {
      stmts.push(
        db
          .prepare(`UPDATE prompts SET category = ?, updated_at = datetime('now') WHERE slug = ? AND category = ?`)
          .bind(NEW_CATEGORY, slug, oldCat)
      );
    }
    const res = await db.batch(stmts);
    for (let k = chunk.length; k < res.length; k++) moved += (res[k].meta && res[k].meta.changes) || 0;
  }

  return json({
    mode: 'APPLIED',
    moved,
    skipped_category_changed_since_export: changed,
    slug_not_found: missing,
    note: 'Category lists and the homepage category chips refresh within ~10 minutes (cache). Undo any time with ?rollback=1. Then delete apply-banner-category.js from the repo.',
  });
}
