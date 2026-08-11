// Officer authentication (see officerAuth.ts's header for why this exists): the console's
// own routes used to rely on the ABSENCE of CORS headers as access control, which stops
// exactly nobody outside a browser. These tests pin the three properties that make the
// replacement worth having: a token cannot be forged, cannot be extended past its expiry,
// and a wrong password never authenticates. Also pins the fail-safe direction: no password
// configured in production must DENY, not silently allow.

import { describe, expect, it } from 'vitest';
import {
  COOKIE_NAME,
  authMode,
  checkPassword,
  clearedCookie,
  isOfficer,
  mintToken,
  parseCookies,
  sessionCookie,
  sessionSecret,
  unauthorized,
  verifyToken,
} from './officerAuth';

const SECRET = 'test-secret-value';
const NOW = Date.UTC(2026, 7, 11, 12, 0, 0);
const HOUR = 60 * 60 * 1000;

/** A request carrying an arbitrary Cookie header, which is all isOfficer reads. */
function reqWithCookie(cookie: string | null): Request {
  return new Request('https://console.example/api/policy', {
    headers: cookie === null ? {} : { cookie },
  });
}

describe('officerAuth — token minting and verification', () => {
  it('round-trips a freshly minted token', () => {
    const token = mintToken(NOW + HOUR, SECRET);
    expect(verifyToken(token, SECRET, NOW)).toBe(true);
  });

  it('rejects a token once its expiry has passed', () => {
    const token = mintToken(NOW + HOUR, SECRET);
    expect(verifyToken(token, SECRET, NOW + HOUR + 1)).toBe(false);
  });

  it('rejects a token whose expiry has been edited to extend it', () => {
    const token = mintToken(NOW + HOUR, SECRET);
    const mac = token.slice(token.indexOf('.') + 1);
    const extended = `${NOW + 100 * HOUR}.${mac}`;
    // The forged token is not yet expired, so only the MAC can catch it.
    expect(verifyToken(extended, SECRET, NOW)).toBe(false);
  });

  it('rejects a token with a tampered MAC', () => {
    const token = mintToken(NOW + HOUR, SECRET);
    const [exp, mac] = token.split('.');
    const flipped = mac[0] === 'a' ? `b${mac.slice(1)}` : `a${mac.slice(1)}`;
    expect(verifyToken(`${exp}.${flipped}`, SECRET, NOW)).toBe(false);
  });

  it('rejects a token minted under a different secret', () => {
    const token = mintToken(NOW + HOUR, 'some-other-secret');
    expect(verifyToken(token, SECRET, NOW)).toBe(false);
  });

  it('rejects malformed input without throwing', () => {
    for (const bad of ['', '.', 'nodot', 'abc.def', `${NOW}.`, `.${'a'.repeat(64)}`, 'a.b.c', null, undefined, 42, {}]) {
      expect(verifyToken(bad, SECRET, NOW)).toBe(false);
    }
  });
});

describe('officerAuth — password checking', () => {
  it('accepts the configured password and rejects everything else', () => {
    const env = { CONSOLE_PASSWORD: 'correct horse' } as NodeJS.ProcessEnv;
    expect(checkPassword('correct horse', env)).toBe(true);
    expect(checkPassword('correct hors', env)).toBe(false);
    expect(checkPassword('Correct Horse', env)).toBe(false);
    expect(checkPassword('', env)).toBe(false);
  });

  it('never authenticates when no password is configured', () => {
    const env = {} as NodeJS.ProcessEnv;
    expect(checkPassword('', env)).toBe(false);
    expect(checkPassword('anything', env)).toBe(false);
    expect(checkPassword(undefined, env)).toBe(false);
  });

  it('rejects non-string candidates', () => {
    const env = { CONSOLE_PASSWORD: 'pw' } as NodeJS.ProcessEnv;
    for (const bad of [null, undefined, 42, {}, ['pw']]) {
      expect(checkPassword(bad, env)).toBe(false);
    }
  });
});

describe('officerAuth — mode resolution', () => {
  it('enforces whenever a password is configured', () => {
    expect(authMode({ CONSOLE_PASSWORD: 'pw' } as NodeJS.ProcessEnv)).toBe('enforced');
    expect(authMode({ CONSOLE_PASSWORD: 'pw', NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe('enforced');
  });

  it('stays open for local dev so no configuration is required', () => {
    expect(authMode({} as NodeJS.ProcessEnv)).toBe('open');
    expect(authMode({ NODE_ENV: 'test' } as NodeJS.ProcessEnv)).toBe('open');
  });

  it('is misconfigured, not open, when the password is missing in production', () => {
    expect(authMode({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe('misconfigured');
  });

  it('derives a session secret from the password when none is given, and it changes with it', () => {
    const a = sessionSecret({ CONSOLE_PASSWORD: 'one' } as NodeJS.ProcessEnv);
    const b = sessionSecret({ CONSOLE_PASSWORD: 'two' } as NodeJS.ProcessEnv);
    expect(a).toHaveLength(64);
    expect(a).not.toEqual(b);
  });

  it('prefers an explicit session secret over the derived one', () => {
    const env = { CONSOLE_PASSWORD: 'pw', CONSOLE_SESSION_SECRET: 'explicit' } as NodeJS.ProcessEnv;
    expect(sessionSecret(env)).toBe('explicit');
  });
});

describe('officerAuth — cookie parsing', () => {
  it('reads a value out of a realistic cookie header', () => {
    const jar = parseCookies(`other=1; ${COOKIE_NAME}=abc.def; trailing=2`);
    expect(jar[COOKIE_NAME]).toBe('abc.def');
  });

  it('tolerates spacing, empty segments, and a missing header', () => {
    expect(parseCookies(null)).toEqual({});
    expect(parseCookies('')).toEqual({});
    expect(parseCookies(';;')).toEqual({});
    expect(parseCookies(`  ${COOKIE_NAME}=v  `)[COOKIE_NAME]).toBe('v');
  });

  it('keeps values that contain an equals sign', () => {
    expect(parseCookies('a=b=c')['a']).toBe('b=c');
  });

  it('percent-decodes values, matching how the session cookie is written', () => {
    expect(parseCookies('a=x%20y')['a']).toBe('x y');
  });
});

describe('officerAuth — isOfficer', () => {
  const enforced = { CONSOLE_PASSWORD: 'pw' } as NodeJS.ProcessEnv;

  it('accepts a request carrying a valid session cookie', () => {
    const token = mintToken(NOW + HOUR, sessionSecret(enforced));
    expect(isOfficer(reqWithCookie(`${COOKIE_NAME}=${token}`), NOW, enforced)).toBe(true);
  });

  it('rejects a request with no cookie, a junk cookie, or an expired one', () => {
    const token = mintToken(NOW + HOUR, sessionSecret(enforced));
    expect(isOfficer(reqWithCookie(null), NOW, enforced)).toBe(false);
    expect(isOfficer(reqWithCookie(`${COOKIE_NAME}=garbage`), NOW, enforced)).toBe(false);
    expect(isOfficer(reqWithCookie(`${COOKIE_NAME}=${token}`), NOW + 2 * HOUR, enforced)).toBe(false);
  });

  it('passes everything in open mode so local dev and tests are unaffected', () => {
    expect(isOfficer(reqWithCookie(null), NOW, {} as NodeJS.ProcessEnv)).toBe(true);
  });

  it('denies everything when production is missing its password', () => {
    const env = { NODE_ENV: 'production' } as NodeJS.ProcessEnv;
    const token = mintToken(NOW + HOUR, sessionSecret(env));
    expect(isOfficer(reqWithCookie(null), NOW, env)).toBe(false);
    // Even a structurally valid token must not get in while the console is misconfigured.
    expect(isOfficer(reqWithCookie(`${COOKIE_NAME}=${token}`), NOW, env)).toBe(false);
  });
});

describe('officerAuth — responses and cookie serialization', () => {
  it('returns an uncached 401 that names the reason', async () => {
    const res = unauthorized({ CONSOLE_PASSWORD: 'pw' } as NodeJS.ProcessEnv);
    expect(res.status).toBe(401);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ error: 'Not signed in.' });
  });

  it('distinguishes a misconfigured console from a signed-out officer', async () => {
    const res = unauthorized({ NODE_ENV: 'production' } as NodeJS.ProcessEnv);
    const body = (await res.json()) as { error: string; hint?: string };
    expect(res.status).toBe(401);
    expect(body.hint).toContain('CONSOLE_PASSWORD');
  });

  it('writes an httpOnly, SameSite=Lax cookie, adding Secure only over https', () => {
    const secure = sessionCookie('tok', HOUR, true);
    expect(secure).toContain('HttpOnly');
    expect(secure).toContain('SameSite=Lax');
    expect(secure).toContain('Max-Age=3600');
    expect(secure).toContain('Secure');
    expect(sessionCookie('tok', HOUR, false)).not.toContain('Secure');
  });

  it('clears the session with a zero Max-Age', () => {
    expect(clearedCookie(true)).toContain('Max-Age=0');
    expect(clearedCookie(true)).toContain('HttpOnly');
  });

  it('round-trips a minted token through cookie serialization and parsing', () => {
    const token = mintToken(NOW + HOUR, SECRET);
    const header = sessionCookie(token, HOUR, true).split(';')[0];
    expect(parseCookies(header)[COOKIE_NAME]).toBe(token);
  });
});
