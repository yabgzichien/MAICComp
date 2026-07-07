'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { FONT, type Palette } from './tokens';
import { MiniBar, SectionLabel } from './shared';
import { runAgentPanel, type AgentAssessment, type StackingSignal, type VerdictTone } from '../lib/agents';
import type { CreditPassport } from '../lib/passport';
import type { LoanDecision } from '../lib/loans';

type Provenance = 'pending' | 'live' | 'fallback';

function toneColor(p: Palette, tone: VerdictTone): string {
  return tone === 'positive' ? p.green : tone === 'caution' ? p.amber : p.red;
}

function AgentCard({
  p,
  agent,
  index,
  rationale,
  provenance,
}: {
  p: Palette;
  agent: AgentAssessment;
  index: number;
  rationale: string;
  provenance: Provenance;
}) {
  const color = toneColor(p, agent.tone);
  return (
    <div
      style={{
        background: p.surface,
        borderRadius: 12,
        padding: '13px 15px',
        boxShadow: p.shadow,
        border: `1.5px solid ${color}33`,
        animation: 'fade-in-up 0.4s ease-out both',
        animationDelay: `${index * 90}ms`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7, gap: 8 }}>
        <span style={{ fontFamily: FONT.ui, fontSize: 11.5, fontWeight: 700, color: p.ink1 }}>{agent.label}</span>
        <div style={{ padding: '2px 9px', borderRadius: 5, background: `${color}1a` }}>
          <span style={{ fontFamily: FONT.ui, fontSize: 10, fontWeight: 700, color }}>{agent.verdict}</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
        <MiniBar pct={agent.confidence} color={color} track={p.hairline} />
        <span style={{ fontFamily: FONT.num, fontSize: 10.5, fontWeight: 700, color: p.ink2, minWidth: 30, textAlign: 'right' }}>
          {agent.confidence}%
        </span>
      </div>
      <p style={{ fontFamily: FONT.ui, fontSize: 11, color: p.ink2, lineHeight: 1.5, marginBottom: 7 }}>{rationale}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {agent.signals.map((s, i) => (
          <span
            key={i}
            style={{
              fontFamily: FONT.mono,
              fontSize: 9.5,
              color: p.ink3,
              background: p.surface2,
              padding: '2px 7px',
              borderRadius: 5,
              border: `1px solid ${p.hairline}`,
            }}
          >
            {s}
          </span>
        ))}
        <span style={{ marginLeft: 'auto', fontFamily: FONT.ui, fontSize: 9, fontWeight: 600, color: provenance === 'live' ? p.accentInk : p.ink3 }}>
          {provenance === 'pending' ? '…' : provenance === 'live' ? 'Live AI' : 'Policy summary'}
        </span>
      </div>
    </div>
  );
}

export default function AgentPanel({ p, passport, decision, stacking }: { p: Palette; passport: CreditPassport; decision: LoanDecision; stacking?: StackingSignal }) {
  const panel = useMemo(() => runAgentPanel(passport, decision, stacking), [passport, decision, stacking]);
  const [rationales, setRationales] = useState<Record<string, string>>({});
  const [provenance, setProvenance] = useState<Provenance>('pending');

  useEffect(() => {
    let cancelled = false;
    setProvenance('pending');
    setRationales({});
    const agents = [...panel.specialists, panel.orchestrator].map((a) => ({ id: a.id, label: a.label, verdict: a.verdict, signals: a.signals }));
    fetch('/api/agents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agents }) })
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        setRationales(json.rationales ?? {});
        setProvenance(json.source === 'live' ? 'live' : 'fallback');
      })
      .catch(() => {
        if (!cancelled) setProvenance('fallback');
      });
    return () => {
      cancelled = true;
    };
  }, [panel]);

  const provenanceFor = (id: string): Provenance => {
    if (provenance === 'pending') return 'pending';
    if (provenance === 'live' && rationales[id]) return 'live';
    return 'fallback';
  };

  const all: AgentAssessment[] = [...panel.specialists, panel.orchestrator];

  return (
    <div style={{ background: p.surface2, borderRadius: 12, padding: '14px 15px', border: `1px solid ${p.hairline}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
        <SectionLabel color={p.ink3}>AI Assessment Panel · advisory only</SectionLabel>
        <span style={{ fontFamily: FONT.ui, fontSize: 10.5, fontWeight: 700, color: toneColor(p, panel.orchestrator.tone) }}>
          {panel.orchestrator.concurs ? '✓ Panel concurs with policy engine' : '⚠ Panel dissents — recommends manual review'}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {all.map((agent, i) => (
          <AgentCard key={agent.id} p={p} agent={agent} index={i} rationale={rationales[agent.id] ?? agent.rationale} provenance={provenanceFor(agent.id)} />
        ))}
      </div>
      <p style={{ fontFamily: FONT.ui, fontSize: 9.5, color: p.ink3, lineHeight: 1.5, marginTop: 10 }}>
        Advisory only — verdicts and confidence are computed deterministically from the same passport aggregates as the policy engine. The panel can flag
        additional caution; it cannot approve, decline, or change the amount.
      </p>
    </div>
  );
}
