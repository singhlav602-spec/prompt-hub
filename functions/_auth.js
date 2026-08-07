// Shared auth helpers for admin routes.
// Files/folders starting with "_" are NOT treated as routes by Cloudflare
// Pages Functions, so this file is safe to import from other functions.

const COOKIE_NAME = 'admin_session';
const SESSION_HOURS = 24 * 7; // 7 days

async function hmac(key, message) {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Creates a signed token: "<expiryTimestamp>.<signature>"
async function createSessionToken(secret) {
  const expiry = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
  const sig = await hmac(secret, String(expiry));
  return `${expiry}.${sig}`;
}

async function verifySessionToken(token, secret) {
  if (!token || !token.includes('.')) return false;
  const [expiryStr, sig] = token.split('.');
  const expiry = Number(expiryStr);
  if (!expiry || Date.now() > expiry) return false;
  const expectedSig = await hmac(secret, expiryStr);
  return sig === expectedSig;
}

function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function sessionCookieHeader(token) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}`;
}

function clearCookieHeader() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

// Call at the top of any protected admin route. Returns true if authorized.
async function requireAuth(request, env) {
  const token = getCookie(request, COOKIE_NAME);
  return verifySessionToken(token, env.ADMIN_PASSWORD);
}

export { COOKIE_NAME, createSessionToken, verifySessionToken, getCookie, sessionCookieHeader, clearCookieHeader, requireAuth };
