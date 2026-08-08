// Shared between the public /api/prompts and the admin /api/admin/prompts
// endpoints. "trending" auto-reverts to "normal" once tag_expires_at has
// passed — no cron job needed, it's just checked at read time.
export function resolveTag(row) {
  if (
    row.tag === 'trending' &&
    row.tag_expires_at &&
    new Date(row.tag_expires_at).getTime() <= Date.now()
  ) {
    return 'normal';
  }
  return row.tag || 'normal';
}

export function computeExpiry(tag) {
  if (tag === 'trending') {
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  }
  return null;
}

export const VALID_TAGS = ['normal', 'hot', 'trending'];
