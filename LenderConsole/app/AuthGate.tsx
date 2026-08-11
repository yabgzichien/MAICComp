'use client';

// Officer sign-in gate (deployment hardening, 2026-08-11). Wraps the console so that the
// routes carrying applicant PII and the policy ladder are never reached by an anonymous
// visitor. The console's own boot path calls GET /api/apply and GET /api/offers/book, both
// now officer-only, so gating the whole surface is simpler and less confusing than letting it
// render half-empty behind a wall of silent 401s.
//
// This is a single shared password per deployment, not per-officer accounts. The console's
// "identity" has always been a persona picker rather than a credential, and this does not
// pretend otherwise: it is the difference between "anyone on the internet" and "whoever has
// the demo password", which is the whole point.

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { FONT, palette } from './tokens';
import type { AuthMode } from '../lib/officerAuth';

export default function AuthGate({
  initialAuthed,
  mode,
  children,
}: {
  initialAuthed: boolean;
  mode: AuthMode;
  children: ReactNode;
}) {
  const [authed, setAuthed] = useState(initialAuthed);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const p = palette(false);

  useEffect(() => {
    if (!authed) inputRef.current?.focus();
  }, [authed]);

  if (authed) return <>{children}</>;

  const misconfigured = mode === 'misconfigured';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || misconfigured) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (res.ok && body?.ok) {
        setPassword('');
        setAuthed(true);
        return;
      }
      setError(body?.error ?? 'Could not sign in. Try again.');
    } catch {
      setError('Could not reach the console server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: p.bg,
        fontFamily: FONT.ui,
        color: p.ink1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 380,
          background: p.surface,
          border: `1px solid ${p.hairline}`,
          borderRadius: 14,
          boxShadow: p.shadow,
          padding: 28,
        }}
      >
        <div style={{ fontFamily: FONT.num, fontSize: 19, fontWeight: 700, letterSpacing: '-0.01em' }}>
          Pip Credit
        </div>
        <div style={{ fontSize: 13, color: p.ink2, marginTop: 3 }}>Lender Console</div>

        <hr style={{ border: 0, borderTop: `1px solid ${p.hairline}`, margin: '20px 0' }} />

        {misconfigured ? (
          <div role="alert">
            <div style={{ fontSize: 14, fontWeight: 600, color: p.red, marginBottom: 8 }}>
              Console authentication is not configured.
            </div>
            <p style={{ fontSize: 13, color: p.ink2, lineHeight: 1.55, margin: 0 }}>
              This deployment has no <code style={{ fontFamily: FONT.mono, fontSize: 12 }}>CONSOLE_PASSWORD</code> set,
              so it is refusing every request rather than serving applicant data to anyone who
              asks. Set it in the deployment environment and redeploy.
            </p>
          </div>
        ) : (
          <form onSubmit={submit}>
            <label htmlFor="console-password" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 7 }}>
              Officer password
            </label>
            <input
              id="console-password"
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={busy}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'console-password-error' : undefined}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '10px 12px',
                fontFamily: FONT.ui,
                fontSize: 14,
                color: p.ink1,
                background: p.surface2,
                border: `1px solid ${error ? p.red : p.hairline}`,
                borderRadius: 9,
                outlineColor: p.primary,
              }}
            />

            {error && (
              <div id="console-password-error" role="alert" style={{ fontSize: 12.5, color: p.red, marginTop: 8 }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy || password.length === 0}
              style={{
                width: '100%',
                marginTop: 16,
                padding: '10px 14px',
                fontFamily: FONT.ui,
                fontSize: 14,
                fontWeight: 600,
                color: '#fff',
                background: busy || password.length === 0 ? p.ink3 : p.primary,
                border: 'none',
                borderRadius: 9,
                cursor: busy || password.length === 0 ? 'default' : 'pointer',
              }}
            >
              {busy ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        )}

        <p style={{ fontSize: 12, color: p.ink3, lineHeight: 1.55, marginTop: 20, marginBottom: 0 }}>
          The borrower app does not need this password. Only the lender-side queue, policy
          editor, and applicant records are behind it.
        </p>
      </div>
    </main>
  );
}
