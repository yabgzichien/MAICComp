'use client';

// Policy Advisor card (2026-07-18 stats/advisor design). Mirrors AgentPanel.tsx's
// pattern exactly: lib/policyAdvisor.ts already decided every suggestion deterministically
// from the same performance aggregates the Portfolio tab shows; an LLM (server route
// /api/advisor) may only narrate one already-formed suggestion into a sentence, tagged
// "Live AI" or "Policy summary" so provenance is never misrepresented. The officer applies
// any change manually on this same tab  nothing here writes to the stored policy.

import React, { useEffect, useMemo, useState } from 'react';
import { FONT, type Palette } from './tokens';
import { SectionLabel } from './shared';
import { buildPolicyAdvisor, type AdvisorSuggestion } from '../lib/policyAdvisor';
import type { ApplicationRecord } from '../lib/applications';

type Provenance = 'pending' | 'live' | 'fallback';

const KIND_STYLE: Record<AdvisorSuggestion['kind'], { color: string; bg: string }> = {
  'rate-review-down': { color: '#1f8a5b', bg: '#e7f4ec' },
  tighten: { color: '#c0392b', bg: '#fde8e8' },
  'threshold-review': { color: '#a3791f', bg: '#fdf3dc' },
  'no-evidence': { color: '#5d6b63', bg: 'transparent' },
};

function suggestionId(s: AdvisorSuggestion, i: number): string {
  return s.band ? `${s.kind}:${s.band}` : `${s.kind}:${i}`;
}

function AdvisorSuggestionCard({ p, suggestion, narration, provenance }: { p: Palette; suggestion: AdvisorSuggestion; narration: string; provenance: Provenance }) {
  const style = KIND_STYLE[suggestion.kind];
  return (
    <div style={{ background: p.surface2, borderRadius: 10, padding: '11px 14px', border: `1px solid ${p.hairline}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
        <span style={{ fontFamily: FONT.ui, fontSize: 12.5, fontWeight: 700, color: p.ink1 }}>{suggestion.headline}</span>
        {suggestion.band && (
          <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: style.color, background: style.bg, borderRadius: 5, padding: '1px 8px', flexShrink: 0 }}>
            {suggestion.band}
          </span>
        )}
      </div>
      <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink2, lineHeight: 1.5, marginBottom: 6 }}>{narration}</p>
      {suggestion.evidence.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
          {suggestion.evidence.map((e, i) => (
            <span key={i} style={{ fontFamily: FONT.mono, fontSize: 12, color: p.ink3, background: p.surface, padding: '2px 7px', borderRadius: 5, border: `1px solid ${p.hairline}` }}>
              {e}
            </span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <p style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 600, color: p.accentInk, lineHeight: 1.45 }}>{suggestion.action}</p>
        <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 600, color: provenance === 'live' ? p.accentInk : p.ink3, flexShrink: 0 }}>
          {provenance === 'pending' ? '…' : provenance === 'live' ? 'Live AI' : 'Policy summary'}
        </span>
      </div>
    </div>
  );
}

export default function AdvisorCard({ p, apps }: { p: Palette; apps: ApplicationRecord[] }) {
  const suggestions = useMemo(() => buildPolicyAdvisor(apps), [apps]);
  const [narrations, setNarrations] = useState<Record<string, string>>({});
  const [provenance, setProvenance] = useState<Provenance>('pending');

  useEffect(() => {
    let cancelled = false;
    setProvenance('pending');
    setNarrations({});
    const briefs = suggestions.map((s, i) => ({ id: suggestionId(s, i), headline: s.headline, evidence: s.evidence, action: s.action }));
    fetch('/api/advisor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ suggestions: briefs }) })
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        setNarrations(json.narrations ?? {});
        setProvenance(json.source === 'live' ? 'live' : 'fallback');
      })
      .catch(() => {
        if (!cancelled) setProvenance('fallback');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestions]);

  const provenanceFor = (id: string): Provenance => {
    if (provenance === 'pending') return 'pending';
    if (provenance === 'live' && narrations[id]) return 'live';
    return 'fallback';
  };

  return (
    <div style={{ background: p.surface, borderRadius: 12, padding: '14px 18px', boxShadow: p.shadow }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <SectionLabel color={p.ink2}>Advisor · Policy suggestions from realized performance</SectionLabel>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {suggestions.map((s, i) => {
          const id = suggestionId(s, i);
          return <AdvisorSuggestionCard key={id} p={p} suggestion={s} narration={narrations[id] ?? s.headline} provenance={provenanceFor(id)} />;
        })}
      </div>
      <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3, marginTop: 10, lineHeight: 1.5 }}>
        Advisory only. Every suggestion is computed deterministically from the same realized-vs-expected performance the Portfolio tab shows; nothing here writes to your policy automatically — review and apply changes above.
      </p>
    </div>
  );
}
