'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { FONT, type Palette } from './tokens';
import { SectionLabel } from './shared';
import { runAgentPanel, type StackingSignal } from '../lib/agents';
import { buildCreditMemo, memoToMarkdown, fallbackNarrative, type CreditMemo } from '../lib/creditMemo';
import type { CreditPassport } from '../lib/passport';
import type { LoanDecision } from '../lib/loans';

type Provenance = 'pending' | 'live' | 'fallback';

function briefFor(memo: CreditMemo) {
  const rm = (n: number) => `RM${Math.round(n).toLocaleString('en-MY')}`;
  return {
    applicant: memo.header.applicant,
    decisionLabel: memo.decision.label,
    offered: rm(memo.decision.maxAmount),
    installment: rm(memo.decision.installment),
    reasons: memo.rationale,
    complianceMet: memo.compliance.filter((c) => c.met).length,
    complianceTotal: memo.compliance.length,
  };
}

export default function CreditMemoModal({
  p,
  passport,
  decision,
  requestedAmount,
  stacking,
  onClose,
}: {
  p: Palette;
  passport: CreditPassport;
  decision: LoanDecision;
  requestedAmount: number;
  stacking?: StackingSignal;
  onClose: () => void;
}) {
  const memo = useMemo(() => {
    const panel = runAgentPanel(passport, decision, stacking);
    return buildCreditMemo(passport, decision, panel, requestedAmount);
  }, [passport, decision, requestedAmount, stacking]);

  const fallback = useMemo(() => fallbackNarrative(memo), [memo]);
  const [narrative, setNarrative] = useState(fallback);
  const [provenance, setProvenance] = useState<Provenance>('pending');

  useEffect(() => {
    let cancelled = false;
    setProvenance('pending');
    setNarrative(fallback);
    fetch('/api/memo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brief: briefFor(memo) }) })
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json.source === 'live' && json.summary && json.rationale) {
          setNarrative({ summary: json.summary, rationale: json.rationale });
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
  }, [memo, fallback]);

  function download() {
    const blob = new Blob([memoToMarkdown(memo)], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `credit-memo-${memo.header.date}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const chip =
    provenance === 'pending' ? 'Narrating…' : provenance === 'live' ? 'Live AI narration' : 'Policy summary';
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
        style={{ width: '100%', maxWidth: 680, background: p.surface, borderRadius: 16, boxShadow: '0 24px 70px rgba(0,0,0,0.35)', overflow: 'hidden' }}
      >
        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: `1px solid ${p.hairline}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <p style={{ fontFamily: FONT.ui, fontSize: 15, fontWeight: 800, color: p.ink1 }}>Credit Memo</p>
            <p style={{ fontFamily: FONT.ui, fontSize: 11, color: p.ink3 }}>
              {memo.header.applicant}
              {memo.header.nricMasked ? ` · ${memo.header.nricMasked}` : ''} · {memo.header.date}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: FONT.ui, fontSize: 10, fontWeight: 700, color: chipColor }}>{chip}</span>
            <button onClick={download} style={btn(p, true)}>Download .md</button>
            <button onClick={() => window.print()} style={btn(p, false)}>Print</button>
            <button onClick={onClose} aria-label="Close" style={{ ...btn(p, false), padding: '6px 10px' }}>✕</button>
          </div>
        </div>

        <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Summary */}
          <Section p={p} title="Executive summary">
            <p style={{ fontFamily: FONT.ui, fontSize: 12.5, color: p.ink1, lineHeight: 1.6 }}>{narrative.summary}</p>
          </Section>

          {/* Decision */}
          <Section p={p} title="Decision">
            <p style={{ fontFamily: FONT.ui, fontSize: 13, fontWeight: 700, color: p.ink1 }}>
              {memo.decision.label} — RM {Math.round(memo.decision.maxAmount).toLocaleString('en-MY')}
              <span style={{ fontWeight: 500, color: p.ink3 }}> · RM {Math.round(memo.decision.installment).toLocaleString('en-MY')}/mo</span>
            </p>
            <p style={{ fontFamily: FONT.ui, fontSize: 11, color: p.ink3, marginTop: 3 }}>
              Requested RM {Math.round(memo.header.requestedAmount).toLocaleString('en-MY')} · Offered RM {Math.round(memo.header.offeredAmount).toLocaleString('en-MY')}
            </p>
          </Section>

          {/* Findings */}
          <Section p={p} title="Panel findings">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {memo.findings.map((f) => (
                <div key={f.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <span style={{ fontFamily: FONT.ui, fontSize: 11, fontWeight: 700, color: p.ink2, minWidth: 92 }}>{f.label}</span>
                  <span style={{ fontFamily: FONT.ui, fontSize: 11, color: p.ink1 }}>
                    {f.verdict} <span style={{ color: p.ink3 }}>({f.confidence}%)</span>
                  </span>
                </div>
              ))}
            </div>
          </Section>

          {/* Rationale */}
          <Section p={p} title="Rationale">
            <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink1, lineHeight: 1.6, marginBottom: 8 }}>{narrative.rationale}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {memo.rationale.map((r, i) => (
                <p key={i} style={{ fontFamily: FONT.mono, fontSize: 10, color: p.ink2, lineHeight: 1.5 }}>
                  {String(i + 1).padStart(2, '0')} · {r}
                </p>
              ))}
            </div>
          </Section>

          {/* CCA-2025 compliance */}
          <Section p={p} title="Consumer Credit Act 2025 · affordability assessment">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {memo.compliance.map((c) => (
                <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ fontFamily: FONT.ui, fontSize: 11, fontWeight: 800, color: c.met ? p.green : p.red, minWidth: 54, flexShrink: 0 }}>
                    {c.met ? '✓ Met' : '✗ Not met'}
                  </span>
                  <div>
                    <p style={{ fontFamily: FONT.ui, fontSize: 11, color: p.ink1, lineHeight: 1.5 }}>{c.requirement}</p>
                    <p style={{ fontFamily: FONT.mono, fontSize: 9.5, color: p.ink3, lineHeight: 1.5 }}>{c.evidence}</p>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* Conditions */}
          <Section p={p} title="Conditions & next steps">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {memo.conditions.map((c, i) => (
                <p key={i} style={{ fontFamily: FONT.ui, fontSize: 11, color: p.ink2, lineHeight: 1.5 }}>• {c}</p>
              ))}
            </div>
          </Section>

          <p style={{ fontFamily: FONT.ui, fontSize: 9.5, color: p.ink3, lineHeight: 1.55 }}>
            Advisory drafting over a deterministic decision. Every figure, verdict, and compliance flag is computed by the policy engine; this memo
            restates them and cannot change them.
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
