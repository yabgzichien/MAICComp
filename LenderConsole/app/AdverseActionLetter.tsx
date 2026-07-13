'use client';

// Adverse-action letter modal (Brief J stretch). Follows CreditMemo.tsx's pattern:
// deterministic sections render immediately, an optional narration call smooths the
// opening/closing prose without changing any reason or figure, and a copy action 
// no delivery mechanism, this only assembles text for the officer to send themselves.

import React, { useEffect, useMemo, useState } from 'react';
import { FONT, type Palette } from './tokens';
import { SectionLabel } from './shared';
import { buildAdverseActionLetter, letterToText, type AdverseActionLetter } from '../lib/adverseAction';
import type { CreditPassport } from '../lib/passport';
import type { LoanDecision } from '../lib/loans';

type Provenance = 'pending' | 'live' | 'fallback';

const rm = (n: number): string => `RM${Math.round(n).toLocaleString('en-MY')}`;

const KIND_LABEL: Record<AdverseActionLetter['kind'], string> = {
  decline: 'Decline letter',
  refer: 'Manual-review letter',
  'counter-offer': 'Counter-offer letter',
};

function briefFor(letter: AdverseActionLetter) {
  return {
    kind: letter.kind,
    applicant: letter.applicant,
    requestedAmount: rm(letter.requestedAmount),
    offeredAmount: rm(letter.offeredAmount),
    reasons: letter.principalReasons.map((r) => r.text),
    improvementText: letter.improvement.text,
  };
}

export default function AdverseActionLetterModal({
  p,
  passport,
  decision,
  requestedAmount,
  onClose,
}: {
  p: Palette;
  passport: CreditPassport;
  decision: LoanDecision;
  requestedAmount: number;
  onClose: () => void;
}) {
  const letter = useMemo(() => buildAdverseActionLetter(passport, decision, requestedAmount), [passport, decision, requestedAmount]);

  const [narrative, setNarrative] = useState<{ opening: string; closing: string } | null>(null);
  const [provenance, setProvenance] = useState<Provenance>('pending');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!letter) return;
    let cancelled = false;
    setProvenance('pending');
    setNarrative(null);
    fetch('/api/adverseAction', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brief: briefFor(letter) }) })
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json.source === 'live' && json.opening && json.closing) {
          setNarrative({ opening: json.opening, closing: json.closing });
          setProvenance('live');
        } else {
          setProvenance('fallback');
        }
      })
      .catch(() => {
        if (!cancelled) setProvenance('fallback');
      });
    return () => {
      cancelled = true;
    };
  }, [letter]);

  if (!letter) return null;

  function copyToClipboard() {
    if (!letter) return;
    navigator.clipboard
      .writeText(letterToText(letter))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        // Clipboard permission denied  the text is still fully visible/selectable/printable.
      });
  }

  const chip = provenance === 'pending' ? 'Narrating…' : provenance === 'live' ? 'Live AI narration' : 'Template prose';
  const chipColor = provenance === 'live' ? p.accentInk : p.ink3;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.55)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '32px 16px',
        overflowY: 'auto',
        zIndex: 50,
        animation: 'fade-in-up 0.2s ease-out both',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 640, background: p.surface, borderRadius: 16, boxShadow: '0 24px 70px rgba(0,0,0,0.35)', overflow: 'hidden' }}
      >
        <div style={{ padding: '18px 24px', borderBottom: `1px solid ${p.hairline}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <p style={{ fontFamily: FONT.ui, fontSize: 15, fontWeight: 800, color: p.ink1 }}>{KIND_LABEL[letter.kind]}</p>
            <p style={{ fontFamily: FONT.ui, fontSize: 11, color: p.ink3 }}>
              {letter.applicant} · {letter.date}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: FONT.ui, fontSize: 10, fontWeight: 700, color: chipColor }}>{chip}</span>
            <button onClick={copyToClipboard} style={btn(p, true)}>{copied ? '✓ Copied' : 'Copy text'}</button>
            <button onClick={() => window.print()} style={btn(p, false)}>Print</button>
            <button onClick={onClose} aria-label="Close" style={{ ...btn(p, false), padding: '6px 10px' }}>✕</button>
          </div>
        </div>

        <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div
            style={{
              padding: '9px 12px',
              borderRadius: 9,
              background: '#fff8e6',
              border: '1px solid #f0d68a',
              fontFamily: FONT.ui,
              fontSize: 10.5,
              fontWeight: 700,
              color: '#8a6100',
            }}
          >
            {letter.caveat}
          </div>

          <Section p={p} title="Decision">
            <p style={{ fontFamily: FONT.ui, fontSize: 12.5, color: p.ink1, lineHeight: 1.6 }}>
              {narrative ? narrative.opening : letter.decisionStatement}
            </p>
            {letter.counterOffer && (
              <p style={{ fontFamily: FONT.ui, fontSize: 11, color: p.ink3, marginTop: 6 }}>
                Original request {rm(letter.counterOffer.originalRequest)} · Countered {rm(letter.counterOffer.counteredAmount)} at {rm(letter.counterOffer.installment)}/mo
              </p>
            )}
          </Section>

          <Section p={p} title="Principal reasons">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {letter.principalReasons.map((r, i) => (
                <p key={i} style={{ fontFamily: FONT.mono, fontSize: 10.5, color: p.ink2, lineHeight: 1.55 }}>· {r.text}</p>
              ))}
            </div>
          </Section>

          <Section p={p} title="Data relied upon">
            <p style={{ fontFamily: FONT.ui, fontSize: 11.5, color: p.ink1, lineHeight: 1.6 }}>
              This decision was based on your signed passport (evidence fingerprint <span style={{ fontFamily: FONT.mono }}>{letter.dataRelied.evidenceShort}</span>),
              covering {letter.dataRelied.consentSummary}, issued {letter.dataRelied.issuedAt} and valid until {letter.dataRelied.validUntil}.
            </p>
          </Section>

          <Section p={p} title="How to strengthen a future application">
            <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink1, lineHeight: 1.6 }}>
              {narrative ? narrative.closing : letter.improvement.text}
            </p>
          </Section>

          <p style={{ fontFamily: FONT.ui, fontSize: 9.5, color: p.ink3, lineHeight: 1.55 }}>
            This letter restates a decision made by the deterministic policy engine  it does not itself decide anything, and every figure and reason
            traces back to that decision.
          </p>
        </div>
      </div>
    </div>
  );
}

function Section({ p, title, children }: { p: Palette; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ marginBottom: 7 }}>
        <SectionLabel color={p.ink3}>{title}</SectionLabel>
      </div>
      {children}
    </div>
  );
}

function btn(p: Palette, primary: boolean): React.CSSProperties {
  return {
    padding: '6px 12px',
    borderRadius: 7,
    border: primary ? 'none' : `1px solid ${p.hairline}`,
    cursor: 'pointer',
    background: primary ? p.primary : 'transparent',
    color: primary ? 'white' : p.ink2,
    fontFamily: FONT.ui,
    fontSize: 11,
    fontWeight: 700,
  };
}
