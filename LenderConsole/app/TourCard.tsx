'use client';
// Judge guided tour  step card v2 (Interactive Console Tour, 2026-07-17). Replaces the
// passive Brief-M corner card. Non-modal: it never traps focus or blocks the console beneath.
// It reports the act meter, narrates the step, and (for do-steps) shows a "YOUR TURN" prompt
// with a Skip escape  the officer taps the real control themselves; the driver detects it and
// flashes the celebration. The card flips from its default bottom-right corner to the top when
// the spotlit target would sit underneath it, so it never covers the control it points at.
import React, { useEffect, useState } from 'react';
import { FONT, type Palette } from './tokens';
import { fillPersona } from '../lib/tourSteps';
import { onTourAnchor, type AnchorReport } from '../lib/tourAnchorRect';
import type { ConsoleTourController } from './useConsoleTour';

const CARD_WIDTH = 306;
const CARD_EST_HEIGHT = 188;

/** Where the borrower app is served. The cross-app tour sends the judge back there twice, and
 *  in the intended demo setup both apps are tabs in one browser, so a real link is worth more
 *  than an instruction. Overridable for a hosted artifact. */
const BORROWER_APP_URL = process.env.NEXT_PUBLIC_BORROWER_APP_URL ?? 'http://localhost:8081';

/** Would the card's default bottom-right box overlap the spotlit rect? If so, flip to top. */
function overlapsDefaultCard(rect: AnchorReport['rect'] | null): boolean {
  if (rect === null || typeof window === 'undefined') return false;
  const cardLeft = window.innerWidth - CARD_WIDTH - 20;
  const cardTop = window.innerHeight - CARD_EST_HEIGHT - 20;
  const margin = 16;
  return (
    rect.x + rect.width + margin > cardLeft &&
    rect.y + rect.height + margin > cardTop
  );
}

export function TourCard({ p, c, officer, lender }: { p: Palette; c: ConsoleTourController; officer: string; lender: string }) {
  const [rect, setRect] = useState<AnchorReport['rect'] | null>(null);
  useEffect(() => onTourAnchor((r) => setRect(r?.rect ?? null)), []);

  const step = c.step;
  // Cold start: the console was opened before anything was sent from the borrower app, so
  // there is no file to follow and no ending to run. Point back rather than inventing a
  // story — the whole script is built on the judge's own application existing.
  if (c.awaitingBorrower) {
    return (
      <div
        role="dialog"
        aria-label="Console tour"
        className="tour-card-enter"
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          width: CARD_WIDTH,
          zIndex: 50,
          background: p.surface,
          borderRadius: 14,
          border: `1.5px solid ${p.accentSoft}`,
          padding: '15px 17px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
          <span
            className="tour-badge-blink"
            style={{ fontFamily: FONT.ui, fontSize: 11.5, fontWeight: 800, color: p.accentInk, letterSpacing: '0.05em', textTransform: 'uppercase' }}
          >
            The guided tour
          </span>
          <button onClick={c.exit} aria-label="Exit tour" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: p.ink3, fontSize: 16, lineHeight: 1, padding: 4 }}>×</button>
        </div>
        {c.directElsewhere ? (
          // The judge DID send an application — it just went to a different lender's desk,
          // because the borrower picks the lender in act 6 while this console opens on
          // whichever tenancy was last active. Telling them to go and start over here would
          // be plainly wrong, so name the desk their file is actually on.
          <>
            <p style={{ fontFamily: FONT.ui, fontSize: 14, fontWeight: 700, color: p.ink1, marginBottom: 4 }}>Your file is on another desk</p>
            <p style={{ fontFamily: FONT.ui, fontSize: 12.5, color: p.ink2, lineHeight: 1.5 }}>
              You sent it to <strong style={{ color: p.ink1 }}>{c.directElsewhere.name}</strong>. Switch this console to
              that lender and the tour picks up there.
            </p>
            <p style={{ fontFamily: FONT.ui, fontSize: 11.5, color: p.ink3, marginTop: 10, textAlign: 'center' }}>
              Use the lender switcher in the header.
            </p>
          </>
        ) : (
          <>
            <p style={{ fontFamily: FONT.ui, fontSize: 14, fontWeight: 700, color: p.ink1, marginBottom: 4 }}>This story starts next door</p>
            <p style={{ fontFamily: FONT.ui, fontSize: 12.5, color: p.ink2, lineHeight: 1.5 }}>
              You play the borrower first, build a credit passport, and send a real application here. Then you
              come back and decide on it.
            </p>
            <a
              href={BORROWER_APP_URL}
              target="_blank"
              rel="noreferrer"
              style={{ display: 'block', textAlign: 'center', marginTop: 12, padding: '9px 0', borderRadius: 8, border: `1.5px solid ${p.accentInk}`, color: p.accentInk, fontFamily: FONT.ui, fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}
            >
              Open the borrower app →
            </a>
            <p style={{ fontFamily: FONT.ui, fontSize: 11.5, color: p.ink3, marginTop: 8, textAlign: 'center' }}>
              This card clears itself when your application lands.
            </p>
          </>
        )}
      </div>
    );
  }
  if (!step) return null;

  const flipTop = !c.paused && overlapsDefaultCard(rect);
  const isDo = step.kind === 'do';
  const isHandoff = step.kind === 'handoff';
  const fill = (t: string) => (step.persona ? fillPersona(t, { officer, lender, applicant: c.applicant ?? undefined }) : t);
  const body = fill(step.body);

  const position: React.CSSProperties = flipTop
    ? { top: 96, right: 20 }
    : { bottom: 20, right: 20 };

  return (
    <div
      role="dialog"
      aria-label="Console tour"
      // Keyed on the step so the entrance + attention ring re-run each time the card has
      // something new to say, rather than only once when the tour mounts.
      key={step.id}
      className="tour-card-enter"
      style={{
        position: 'fixed',
        ...position,
        width: CARD_WIDTH,
        zIndex: 50,
        background: p.surface,
        borderRadius: 14,
        border: `1.5px solid ${p.accentSoft}`,
        padding: '15px 17px',
      }}
    >
      {c.celebrating ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 2px' }}>
          <div className="tour-celebrate" style={{ width: 30, height: 30, borderRadius: '50%', background: p.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ color: 'white', fontSize: 16, fontWeight: 800, lineHeight: 1 }}>✓</span>
          </div>
          <span style={{ fontFamily: FONT.ui, fontSize: 14, fontWeight: 700, color: p.ink1 }}>{c.celebrating}</span>
        </div>
      ) : c.paused ? (
        <>
          <p style={{ fontFamily: FONT.ui, fontSize: 13.5, fontWeight: 700, color: p.ink1, marginBottom: 4 }}>Tour paused</p>
          <p style={{ fontFamily: FONT.ui, fontSize: 12.5, color: p.ink2, lineHeight: 1.5, marginBottom: 12 }}>You stepped away to explore. Pick up where you left off, or exit.</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={c.exit} style={ghostBtn(p)}>Exit</button>
            <div style={{ flex: 1 }} />
            <button onClick={c.resume} style={primaryBtn(p)}>Resume</button>
          </div>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
            <span
              className="tour-badge-blink"
              style={{ fontFamily: FONT.ui, fontSize: 11.5, fontWeight: 800, color: p.accentInk, letterSpacing: '0.05em', textTransform: 'uppercase' }}
            >
              Act {c.act} of {c.totalActs} · {c.actLabel}
            </span>
            <button onClick={c.exit} aria-label="Exit tour" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: p.ink3, fontSize: 16, lineHeight: 1, padding: 4 }}>×</button>
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 11 }}>
            {Array.from({ length: c.totalActs }).map((_, i) => (
              <span key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < c.act ? p.primary : p.hairline }} />
            ))}
          </div>
          {(isDo || isHandoff) && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 7, padding: '3px 9px', borderRadius: 6, background: p.accentTint, border: `1px solid ${p.accentSoft}` }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.primary, display: 'inline-block' }} />
              <span style={{ fontFamily: FONT.ui, fontSize: 10.5, fontWeight: 800, color: p.accentInk, letterSpacing: '0.08em' }}>
                {isHandoff ? 'SWITCH APPS' : 'YOUR TURN'}
              </span>
            </div>
          )}
          <p style={{ fontFamily: FONT.ui, fontSize: 14, fontWeight: 700, color: p.ink1, marginBottom: 4 }}>{fill(step.title)}</p>
          <p style={{ fontFamily: FONT.ui, fontSize: 12.5, color: p.ink2, lineHeight: 1.5 }}>{body}</p>
          {isHandoff && step.handoff && (
            <>
              <a
                href={BORROWER_APP_URL}
                target="_blank"
                rel="noreferrer"
                style={{ display: 'block', textAlign: 'center', marginTop: 12, padding: '9px 0', borderRadius: 8, border: `1.5px solid ${p.accentInk}`, color: p.accentInk, fontFamily: FONT.ui, fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}
              >
                Open the borrower app →
              </a>
              {/* The honest state of the real loan. Announced politely so the gate opening is
                  perceivable without watching the button. */}
              <p
                aria-live="polite"
                style={{ fontFamily: FONT.ui, fontSize: 11.5, fontWeight: c.handoffReady ? 800 : 500, color: c.handoffReady ? p.accentInk : p.ink3, marginTop: 8, textAlign: 'center' }}
              >
                {c.handoffReady ? step.handoff.ready : step.handoff.waiting}
              </p>
            </>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
            <button onClick={c.exit} style={ghostBtn(p)}>Exit</button>
            <div style={{ flex: 1 }} />
            {c.index > 0 && (
              <button onClick={c.back} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: p.ink2, fontFamily: FONT.ui, fontSize: 12.5, fontWeight: 700, padding: '7px 4px' }}>Back</button>
            )}
            {isDo ? (
              <button onClick={c.skip} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: p.ink3, fontFamily: FONT.ui, fontSize: 12.5, fontWeight: 700, padding: '7px 8px' }}>Skip</button>
            ) : isHandoff ? (
              <>
                <button onClick={c.skip} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: p.ink3, fontFamily: FONT.ui, fontSize: 12.5, fontWeight: 700, padding: '7px 8px' }}>Skip</button>
                {/* Gated, never automatic — the officer presses this when they return. */}
                <button
                  onClick={c.next}
                  disabled={!c.handoffReady}
                  style={c.handoffReady ? primaryBtn(p) : disabledBtn(p)}
                >
                  {step.handoff?.cta}
                </button>
              </>
            ) : (
              <button onClick={c.next} style={primaryBtn(p)}>{step.finale ? 'Done' : 'Next'}</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function primaryBtn(p: Palette): React.CSSProperties {
  return { padding: '7px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', background: p.accentInk, color: 'white', fontFamily: FONT.ui, fontSize: 12.5, fontWeight: 700 };
}
function disabledBtn(p: Palette): React.CSSProperties {
  return { padding: '7px 18px', borderRadius: 8, border: `1px solid ${p.hairline}`, cursor: 'not-allowed', background: p.surface2, color: p.ink3, fontFamily: FONT.ui, fontSize: 12.5, fontWeight: 700 };
}
function ghostBtn(p: Palette): React.CSSProperties {
  return { border: 'none', background: 'transparent', cursor: 'pointer', color: p.ink3, fontFamily: FONT.ui, fontSize: 12.5, fontWeight: 600, padding: 0 };
}
