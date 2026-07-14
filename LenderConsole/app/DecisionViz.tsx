'use client';

// Decision visuals (Brief K), rendered with Recharts (2026-07-07 revision: swapped
// from hand-rolled SVG to a charting library by explicit instruction  Recharts
// chosen for its declarative React composition, SVG output, and ComposedChart
// support for the Benford bars+curve combo). All geometry/data still comes from
// the pure, unit-tested helpers in lib/decisionViz.ts; these components remain
// presentation-only. Animations stay off  the exclusion list (no gauges, radar,
// 3D, count-ups) from Visualisation.md still applies.

import {
  Bar,
  BarChart,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { FONT, type Palette } from './tokens';
import { benfordChart, confidenceCeilingNotch, coverageStrip, headroomLayout, waterfallSteps } from '../lib/decisionViz';
import type { DecisionBreakdown, LenderPolicy } from '../lib/loans';
import type { PassportAssessment, PassportMomentum } from '../lib/passport';
import { InfoButton } from './shared';

const rm = (n: number): string => `RM${Math.round(n).toLocaleString('en-MY')}`;
const pctLabel = (v: number): string => `${Math.round(v * 100)}%`;

// ── 1. Affordability headroom bar ─────────────────────────────────────────────

export function HeadroomBar({ p, assessment, installment, policy, onInfo }: { p: Palette; assessment: PassportAssessment; installment: number; policy?: LenderPolicy; onInfo?: (entry: string) => void }) {
  const layout = headroomLayout(assessment, installment, policy);
  if (!layout) return null;
  const colors: Record<string, string> = {
    debtService: '#9aa7a0',
    installment: layout.safe ? p.primary : p.red,
    remainingSurplus: p.accentSoft,
    other: 'rgba(20,40,30,0.08)',
  };
  const labels = Object.fromEntries(layout.segments.map((s) => [s.key, s.label]));
  const row = Object.fromEntries(layout.segments.map((s) => [s.key, s.frac]));
  return (
    <div style={{ padding: '12px 20px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.ink3, letterSpacing: '0.10em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 5 }}>
          Affordability headroom
          {onInfo && <InfoButton entry="headroom" onOpen={onInfo} />}
        </span>
        <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: installment > 0 ? (layout.safe ? p.accentInk : p.red) : p.ink3, background: installment > 0 ? (layout.safe ? p.accentSoft : '#fde8e8') : 'rgba(20,40,30,0.06)', borderRadius: 5, padding: '2px 8px' }}>
          {installment > 0 ? (layout.safe ? 'Fits inside both caps' : 'Exceeds a cap') : 'no installment proposed'}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={54}>
        <BarChart data={[{ name: 'income', ...row }]} layout="vertical" margin={{ top: 16, right: 2, bottom: 0, left: 2 }}>
          <XAxis type="number" domain={[0, 1]} hide />
          <YAxis type="category" dataKey="name" hide />
          <Tooltip
            formatter={(value: unknown, name: unknown) => [pctLabel(Number(value ?? 0)), labels[String(name)] ?? String(name)]}
            labelFormatter={() => 'Share of monthly income'}
            contentStyle={{ fontFamily: FONT.ui, fontSize: 12, borderRadius: 8, border: `1px solid ${p.hairline}` }}
          />
          {layout.segments.map((s) => (
            <Bar key={s.key} dataKey={s.key} stackId="income" fill={colors[s.key]} isAnimationActive={false} barSize={16} />
          ))}
          {layout.ticks.map((t) => (
            <ReferenceLine
              key={t.key}
              x={t.frac}
              stroke={p.ink2}
              strokeDasharray="4 3"
              strokeWidth={1.5}
              label={{ value: t.label, position: 'top', fontSize: 12, fontFamily: FONT.ui, fill: p.ink2 }}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 10px', marginTop: 2 }}>
        {layout.segments.filter((s) => s.frac > 0.001).map((s) => (
          <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: FONT.ui, fontSize: 12, color: p.ink3 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: colors[s.key], display: 'inline-block' }} />
            {s.label}
          </span>
        ))}
      </div>
      <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3, marginTop: 5, lineHeight: 1.5 }}>
        One month of income: {rm(assessment.avgIncome)}.
      </p>
    </div>
  );
}

// ── 2. Decision waterfall ─────────────────────────────────────────────────────

export function DecisionWaterfall({ p, breakdown, policy }: { p: Palette; breakdown: DecisionBreakdown; policy?: LenderPolicy }) {
  const w = waterfallSteps(breakdown, policy);
  const data = w.steps.map((s) => ({
    name: s.label,
    amount: s.amount,
    fill: s.key === 'offered' ? (s.amount > 0 ? p.primary : p.red) : s.bit ? p.amber : 'rgba(20,40,30,0.16)',
  }));
  const notes = w.steps.filter((s) => s.note);
  return (
    <div style={{ padding: '14px 20px 0' }}>
      <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.ink3, letterSpacing: '0.10em', textTransform: 'uppercase' }}>How the amount was set</span>
      <ResponsiveContainer width="100%" height={138}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, bottom: 0, left: 0 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={104} tick={{ fontSize: 12, fontFamily: FONT.ui, fill: p.ink2 }} axisLine={false} tickLine={false} />
          <Tooltip
            formatter={(value: unknown) => [rm(Number(value ?? 0)), 'Supportable']}
            contentStyle={{ fontFamily: FONT.ui, fontSize: 12, borderRadius: 8, border: `1px solid ${p.hairline}` }}
          />
          <Bar dataKey="amount" isAnimationActive={false} barSize={9} radius={3}>
            <LabelList dataKey="amount" position="right" formatter={(v: unknown) => rm(Number(v))} style={{ fontSize: 12, fontFamily: FONT.num, fill: p.ink1 }} />
            {data.map((d, i) => (
              <Cell key={i} fill={d.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {notes.length > 0 && (
        <div style={{ marginTop: 2 }}>
          {notes.map((s) => (
            <p key={s.key} style={{ fontFamily: FONT.ui, fontSize: 12, color: '#8a6100', lineHeight: 1.5 }}>↳ {s.label}: {s.note}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 3. Benford forensic chart ─────────────────────────────────────────────────

export function BenfordChart({ p, histogram, tone = 'ok', onInfo }: { p: Palette; histogram: number[] | undefined; tone?: 'ok' | 'alert'; onInfo?: (entry: string) => void }) {
  const chart = benfordChart(histogram);
  if (!chart) return null;
  const conforms = chart.bars.reduce((s, b, i) => s + Math.min(b, chart.expected[i]), 0);
  const barColor = tone === 'alert' ? p.red : p.primary;
  const lineColor = tone === 'alert' ? '#57241e' : '#1b4030';
  const data = chart.bars.map((b, i) => ({ digit: String(i + 1), observed: b, expected: chart.expected[i] }));
  return (
    <div>
      <ResponsiveContainer width="100%" height={104}>
        <ComposedChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
          <XAxis dataKey="digit" tick={{ fontSize: 12, fontFamily: FONT.num, fill: '#7d8a83' }} axisLine={false} tickLine={false} interval={0} />
          <YAxis hide />
          <Tooltip
            formatter={(value: unknown, name: unknown) => [pctLabel(Number(value ?? 0)), name === 'observed' ? 'Observed share' : "Benford's expected"]}
            labelFormatter={(d) => `Leading digit ${d}`}
            contentStyle={{ fontFamily: FONT.ui, fontSize: 12, borderRadius: 8, border: `1px solid ${p.hairline}` }}
          />
          <Bar dataKey="observed" fill={barColor} fillOpacity={0.55} isAnimationActive={false} radius={[2, 2, 0, 0]} />
          <Line dataKey="expected" stroke={lineColor} strokeWidth={1.4} strokeDasharray="3 2" dot={{ r: 1.8, fill: lineColor, strokeWidth: 0 }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
        <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: tone === 'alert' ? p.red : p.accentInk, background: tone === 'alert' ? '#fde8e8' : p.accentSoft, borderRadius: 5, padding: '2px 8px' }}>
          {tone === 'alert' ? 'Clusters away from Benford’s curve' : `Conforms · ${Math.round(conforms * 100)}%`}
        </span>
        {onInfo && <InfoButton entry="benford" onOpen={onInfo} />}
      </div>
    </div>
  );
}

// ── 4. Momentum sparkline ─────────────────────────────────────────────────────

export function MomentumSpark({ p, momentum }: { p: Palette; momentum: PassportMomentum }) {
  const up = momentum.direction === 'rising';
  const color = up ? p.primary : momentum.direction === 'falling' ? p.red : p.ink3;
  const covFrom = Math.min(1, momentum.coverageDaysFrom / 90);
  const covTo = Math.min(1, momentum.coverageDaysTo / 90);
  const pad = Math.max(2, Math.abs(momentum.scoreTo - momentum.scoreFrom) * 0.25);
  const data = [
    { at: 'from', score: momentum.scoreFrom },
    { at: 'to', score: momentum.scoreTo },
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
      <LineChart width={84} height={36} data={data} margin={{ top: 10, right: 14, bottom: 4, left: 14 }}>
        <YAxis hide domain={[Math.min(momentum.scoreFrom, momentum.scoreTo) - pad, Math.max(momentum.scoreFrom, momentum.scoreTo) + pad]} />
        <XAxis dataKey="at" hide />
        <Line dataKey="score" stroke={color} strokeWidth={2} dot={{ r: 3, fill: color, strokeWidth: 0 }} isAnimationActive={false}>
          <LabelList dataKey="score" position="top" style={{ fontSize: 12, fontFamily: FONT.num, fill: '#7d8a83' }} />
        </Line>
      </LineChart>
      <div style={{ width: 64 }}>
        <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3, marginBottom: 2 }}>coverage {momentum.coverageDaysFrom}→{momentum.coverageDaysTo}d</p>
        <div style={{ height: 4, borderRadius: 2, background: 'rgba(20,40,30,0.10)', overflow: 'hidden', marginBottom: 2 }}>
          <div style={{ height: '100%', width: `${covFrom * 100}%`, background: '#9aa7a0', borderRadius: 2 }} />
        </div>
        <div style={{ height: 4, borderRadius: 2, background: 'rgba(20,40,30,0.10)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${covTo * 100}%`, background: color, borderRadius: 2 }} />
        </div>
      </div>
    </div>
  );
}

// ── 5. Coverage strip (Brief K stretch) ────────────────────────────────────────

export function CoverageStrip({ p, daysCovered, windowDays = 90 }: { p: Palette; daysCovered: number; windowDays?: number }) {
  const segments = coverageStrip(daysCovered, windowDays);
  const filled = Math.min(Math.round(daysCovered), windowDays);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.ink3, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Data coverage</span>
        <span style={{ fontFamily: FONT.num, fontSize: 12, fontWeight: 700, color: p.ink1 }}>{filled}/{windowDays} days</span>
      </div>
      <div style={{ display: 'flex', gap: 1, height: 12, borderRadius: 3, overflow: 'hidden' }}>
        {segments.map((s, i) => (
          <div key={i} style={{ flex: 1, background: s.filled ? p.primary : 'rgba(20,40,30,0.08)' }} />
        ))}
      </div>
    </div>
  );
}

// ── 6. Confidence-ceiling notch (Brief K stretch) ──────────────────────────────
// Overlays a marker on the score-band bar showing where the CURRENT data confidence
// caps the displayed score  hides entirely once confidence is high enough (≥60%)
// that nothing is capped. Positioned by the caller inside a `position: relative`
// wrapper around the band bar, matching its exact width.

export function ConfidenceCeilingTick({ p, confidence }: { p: Palette; confidence: number }) {
  const notch = confidenceCeilingNotch(confidence);
  if (notch.frac === null) return null;
  return (
    <div
      title={`Data confidence caps the displayed score at ${notch.ceiling}`}
      style={{ position: 'absolute', top: -12, left: `${notch.frac * 100}%`, transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', pointerEvents: 'none' }}
    >
      <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.amber, whiteSpace: 'nowrap' }}>capped {notch.ceiling}</span>
      <span style={{ fontSize: 10, color: p.amber, lineHeight: 1 }}>▼</span>
    </div>
  );
}
