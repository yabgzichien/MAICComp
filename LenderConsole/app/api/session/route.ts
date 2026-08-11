// GET/POST/DELETE /api/session  the officer login (deployment hardening, 2026-08-11).
//
// One shared password per deployment, not per-officer accounts: the console's "identity" has
// always been a persona picker rather than a credential (see lenderRegistry's `officer`
// fields), and nothing here pretends otherwise. What this adds is a gate, so that the routes
// carrying applicant PII and the policy ladder stop answering to anonymous callers.
//
// Same-origin only by construction: no CORS headers, and the cookie is SameSite=Lax, so the
// borrower app (a different origin) neither can nor needs to authenticate here.

import {
  SESSION_TTL_MS,
  authMode,
  checkPassword,
  clearedCookie,
  isOfficer,
  mintToken,
  sessionCookie,
  sessionSecret,
} from '../../../lib/officerAuth';

export const dynamic = 'force-dynamic';

// Bounds the login body. A password is small; anything larger is not a login attempt.
const MAX_BODY_BYTES = 2_000;

/** Whether to mark the cookie Secure. Behind Vercel's proxy the original scheme arrives in
 *  x-forwarded-proto; falling back to the request URL keeps a direct local run working. */
function isHttps(req: Request): boolean {
  const forwarded = req.headers.get('x-forwarded-proto');
  if (forwarded) return forwarded.split(',')[0].trim() === 'https';
  try {
    return new URL(req.url).protocol === 'https:';
  } catch {
    return false;
  }
}

const NO_STORE = { 'Cache-Control': 'no-store' };

/** Whether this browser currently holds a session, and whether a password is even configured.
 *  The console's AuthGate reads this on load to decide between the form and the console. */
export async function GET(req: Request) {
  const mode = authMode();
  return Response.json(
    { authed: isOfficer(req), mode },
    { headers: NO_STORE },
  );
}

export async function POST(req: Request) {
  const mode = authMode();
  if (mode === 'misconfigured') {
    return Response.json(
      {
        ok: false,
        error: 'Console authentication is not configured.',
        hint: 'Set CONSOLE_PASSWORD in the deployment environment.',
      },
      { status: 503, headers: NO_STORE },
    );
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return Response.json({ ok: false, error: 'Request too large.' }, { status: 413, headers: NO_STORE });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ ok: false, error: 'Body must be JSON.' }, { status: 400, headers: NO_STORE });
  }

  const password = (body as Record<string, unknown> | null)?.password;

  // In open mode (local dev, no password set) a login is a no-op success: there is nothing to
  // check against, and isOfficer already passes every request.
  if (mode === 'open') {
    return Response.json({ ok: true, mode }, { headers: NO_STORE });
  }

  if (!checkPassword(password)) {
    // One generic message. Distinguishing "no such password" from "wrong password" would only
    // help someone guessing.
    return Response.json({ ok: false, error: 'That password was not accepted.' }, { status: 401, headers: NO_STORE });
  }

  const token = mintToken(Date.now() + SESSION_TTL_MS, sessionSecret());
  return Response.json(
    { ok: true, mode },
    { headers: { ...NO_STORE, 'Set-Cookie': sessionCookie(token, SESSION_TTL_MS, isHttps(req)) } },
  );
}

/** Sign out. Unconditional: clearing a session you do not have is a harmless no-op. */
export async function DELETE(req: Request) {
  return Response.json(
    { ok: true },
    { headers: { ...NO_STORE, 'Set-Cookie': clearedCookie(isHttps(req)) } },
  );
}
