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
  if (!step) return null;

  const flipTop = !c.paused && overlapsDefaultCard(rect);
  const isDo = step.kind === 'do';
  const body = step.persona ? fillPersona(step.body, { officer, lender }) : step.body;

  const position: React.CSSProperties = flipTop
    ? { top: 96, right: 20 }
    : { bottom: 20, right: 20 };

  return (
    <div
      role="dialog"
      aria-label="Console tour"
      style={{
        position: 'fixed',
        ...position,
        width: CARD_WIDTH,
        zIndex: 50,
        background: p.surface,
        borderRadius: 14,
        border: `1.5px solid ${p.accentSoft}`,
        boxShadow: '0 12px 38px rgba(0,0,0,0.24)',
        padding: '15px 17px',
        animation: 'fade-in-up 0.35s ease-out both',
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
            <span style={{ fontFamily: FONT.ui, fontSize: 11.5, fontWeight: 800, color: p.accentInk, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Act {c.act} of {c.totalActs} · {c.actLabel}
            </span>
            <button onClick={c.exit} aria-label="Exit tour" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: p.ink3, fontSize: 16, lineHeight: 1, padding: 4 }}>×</button>
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 11 }}>
            {Array.from({ length: c.totalActs }).map((_, i) => (
              <span key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < c.act ? p.primary : p.hairline }} />
            ))}
          </div>
          {isDo && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 7, padding: '3px 9px', borderRadius: 6, background: p.accentTint, border: `1px solid ${p.accentSoft}` }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.primary, display: 'inline-block' }} />
              <span style={{ fontFamily: FONT.ui, fontSize: 10.5, fontWeight: 800, color: p.accentInk, letterSpacing: '0.08em' }}>YOUR TURN</span>
            </div>
          )}
          <p style={{ fontFamily: FONT.ui, fontSize: 14, fontWeight: 700, color: p.ink1, marginBottom: 4 }}>{step.title}</p>
          <p style={{ fontFamily: FONT.ui, fontSize: 12.5, color: p.ink2, lineHeight: 1.5 }}>{body}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
            <button onClick={c.exit} style={ghostBtn(p)}>Exit</button>
            <div style={{ flex: 1 }} />
            {c.index > 0 && (
              <button onClick={c.back} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: p.ink2, fontFamily: FONT.ui, fontSize: 12.5, fontWeight: 700, padding: '7px 4px' }}>Back</button>
            )}
            {isDo ? (
              <button onClick={c.skip} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: p.ink3, fontFamily: FONT.ui, fontSize: 12.5, fontWeight: 700, padding: '7px 8px' }}>Skip</button>
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
function ghostBtn(p: Palette): React.CSSProperties {
  return { border: 'none', background: 'transparent', cursor: 'pointer', color: p.ink3, fontFamily: FONT.ui, fontSize: 12.5, fontWeight: 600, padding: 0 };
}
