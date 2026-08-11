// Officer authentication for the console's own surfaces (deployment hardening, 2026-08-11).
//
// Until now the routes that only this console should call were "protected" purely by NOT
// sending CORS headers. That is not access control: CORS is enforced by browsers, so any
// non-browser client (curl, a script, a scanner) reaches them unimpeded. Against the live
// deployment a PUT /api/policy reached the validator and a GET /api/apply returned every
// applicant's name, subject hash, and full passportCode. This module supplies the missing
// piece: a shared-password session, carried in an httpOnly cookie.
//
// Deliberately framework-free so vitest (environment: node, include: lib/**) can cover the
// token logic directly. Routes call `isOfficer(req)` and, on failure, return `unauthorized()`.
//
// The signing primitive is HMAC-SHA256 from @noble/hashes, already a dependency for passport
// verification, so this adds no package and no node:crypto-vs-Edge portability question.

import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

/** Name of the session cookie. httpOnly, so page scripts can never read it. */
export const COOKIE_NAME = 'pip_officer';

/** How long a login lasts. Long enough for a demo day, short enough to expire on its own. */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * How the guard should behave, resolved from the environment.
 *
 * - `enforced`   CONSOLE_PASSWORD is set. Protected routes require a valid session.
 * - `open`       No password AND not a production build. Local dev and tests keep working
 *                exactly as before, with no configuration required.
 * - `misconfigured` No password in production. Protected routes DENY. This direction is
 *                deliberate: a forgotten environment variable must make the console visibly
 *                broken, never silently world-writable again.
 */
export type AuthMode = 'enforced' | 'open' | 'misconfigured';

export function authMode(env: NodeJS.ProcessEnv = process.env): AuthMode {
  if (env.CONSOLE_PASSWORD) return 'enforced';
  return env.NODE_ENV === 'production' ? 'misconfigured' : 'open';
}

/**
 * The HMAC key for session tokens. Prefers an explicit CONSOLE_SESSION_SECRET; otherwise it
 * is derived from the password, so a single environment variable is enough to configure the
 * console. Deriving from the password also means changing the password invalidates every
 * outstanding session, which is the behaviour you want anyway.
 */
export function sessionSecret(env: NodeJS.ProcessEnv = process.env): string {
  if (env.CONSOLE_SESSION_SECRET) return env.CONSOLE_SESSION_SECRET;
  return bytesToHex(sha256(utf8ToBytes(`pip-officer-session|${env.CONSOLE_PASSWORD ?? ''}`)));
}

/** Length-independent, constant-time equality. Both sides are hashed first so that a length
 *  difference leaks nothing through the comparison itself. */
function secureEquals(a: string, b: string): boolean {
  const ha = sha256(utf8ToBytes(a));
  const hb = sha256(utf8ToBytes(b));
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha[i] ^ hb[i];
  return diff === 0;
}

/** Check a submitted password against CONSOLE_PASSWORD without an early-exit compare. An
 *  unset password never authenticates, whatever the caller sends. */
export function checkPassword(candidate: unknown, env: NodeJS.ProcessEnv = process.env): boolean {
  const expected = env.CONSOLE_PASSWORD;
  if (!expected || typeof candidate !== 'string' || candidate.length === 0) return false;
  return secureEquals(candidate, expected);
}

/** Mint a session token that stops being valid at `expiresAtMs`. Format: `<expMs>.<hmacHex>`,
 *  where the MAC covers the expiry, so the expiry cannot be edited by the holder. */
export function mintToken(expiresAtMs: number, secret: string): string {
  const exp = String(Math.floor(expiresAtMs));
  const mac = bytesToHex(hmac(sha256, utf8ToBytes(secret), utf8ToBytes(exp)));
  return `${exp}.${mac}`;
}

/** True only for a well-formed, unexpired token whose MAC verifies under `secret`. Never
 *  throws: any malformed input is simply not a valid session. */
export function verifyToken(token: unknown, secret: string, nowMs: number): boolean {
  if (typeof token !== 'string') return false;
  const dot = token.indexOf('.');
  if (dot <= 0 || dot !== token.lastIndexOf('.')) return false;

  const exp = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  if (!/^\d+$/.test(exp) || !/^[0-9a-f]+$/.test(mac)) return false;

  // Verify the MAC before trusting the expiry it covers.
  const expected = bytesToHex(hmac(sha256, utf8ToBytes(secret), utf8ToBytes(exp)));
  if (!secureEquals(mac, expected)) return false;

  return Number(exp) > nowMs;
}

/** Parse a Cookie header into a plain map. Tolerates spacing, empty segments, and values
 *  that themselves contain "=" . Returns {} for a missing header. */
export function parseCookies(header: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const seg = part.trim();
    if (!seg) continue;
    const eq = seg.indexOf('=');
    if (eq <= 0) continue;
    const name = seg.slice(0, eq).trim();
    if (name in out) continue; // first occurrence wins
    try {
      out[name] = decodeURIComponent(seg.slice(eq + 1).trim());
    } catch {
      out[name] = seg.slice(eq + 1).trim();
    }
  }
  return out;
}

/**
 * Whether a session cookie value carries officer authority.
 *
 * In `open` mode (local dev with no password configured) everything passes, so `next dev` and
 * the test suite behave exactly as they did before this module existed. In `misconfigured`
 * mode nothing passes.
 *
 * Split out from `isOfficer` so the server component that decides whether to render the login
 * form shares this exact logic rather than reimplementing it against `next/headers`.
 */
export function hasOfficerSession(
  token: string | undefined,
  now: number = Date.now(),
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const mode = authMode(env);
  if (mode === 'open') return true;
  if (mode === 'misconfigured') return false;
  return verifyToken(token, sessionSecret(env), now);
}

/** Whether this request carries officer authority. Thin wrapper over `hasOfficerSession`
 *  that pulls the token out of the request's Cookie header. */
export function isOfficer(req: Request, now: number = Date.now(), env: NodeJS.ProcessEnv = process.env): boolean {
  return hasOfficerSession(parseCookies(req.headers.get('cookie'))[COOKIE_NAME], now, env);
}

/** The 401 every guarded route returns. Distinguishes a missing login from a missing
 *  configuration so an operator can tell the two apart from the response alone. */
export function unauthorized(env: NodeJS.ProcessEnv = process.env): Response {
  const misconfigured = authMode(env) === 'misconfigured';
  return Response.json(
    {
      error: misconfigured ? 'Console authentication is not configured.' : 'Not signed in.',
      ...(misconfigured ? { hint: 'Set CONSOLE_PASSWORD in the deployment environment.' } : {}),
    },
    { status: 401, headers: { 'Cache-Control': 'no-store' } },
  );
}

/** Serialize the Set-Cookie value for a freshly minted session. `secure` is omitted off
 *  https so that a plain-http local run can still hold a session. */
export function sessionCookie(token: string, ttlMs: number, secure: boolean): string {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(ttlMs / 1000)}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/** Serialize the Set-Cookie value that clears the session. */
export function clearedCookie(secure: boolean): string {
  const parts = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}
