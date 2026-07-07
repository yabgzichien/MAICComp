'use client';

// Decision visuals (Brief K) — hand-rolled in the house MiniBar style: plain divs
// for bars, small inline SVG only where a line is genuinely needed. All geometry
// comes from lib/decisionViz.ts; these components stay presentation-only.
// Deliberately absent, per Visualisation.md's own list: radar charts, gauges, 3D,
// count-up animations, chart libraries.

import { FONT, type Palette } from './tokens';
import { benfordChart, headroomLayout, waterfallSteps } from '../lib/decisionViz';
import type { DecisionBreakdown } from '../lib/loans';
import type { PassportAssessment, PassportMomentum } from '../lib/passport';

const rm = (n: number): string => `RM${Math.round(n).toLocaleString('en-MY')}`;

// ── 1. Affordability headroom bar ─────────────────────────────────────────────

export function HeadroomBar({ p, assessment, installment }: { p: Palette; assessment: PassportAssessment; installment: number }) {
  const layout = headroomLayout(assessment, installment);
  if (!layout) return null;
  const colors: Record<string, string> = {
    debtService: '#9aa7a0',
    installment: layout.safe ? p.primary : p.red,
    remainingSurplus: p.accentSoft,
    other: 'rgba(20,40,30,0.08)',
  };
  return (
    <div style={{ padding: '12px 20px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontFamily: FONT.ui, fontSize: 9.5, fontWeight: 700, color: p.ink3, letterSpacing: '0.10em', textTransform: 'uppercase' }}>Affordability headroom</span>
        <span style={{ fontFamily: FONT.ui, fontSize: 9.5, fontWeight: 700, color: installment > 0 ? (layout.safe ? p.accentInk : p.red) : p.ink3, background: installment > 0 ? (layout.safe ? p.accentSoft : '#fde8e8') : 'rgba(20,40,30,0.06)', borderRadius: 5, padding: '2px 8px' }}>
          {installment > 0 ? (layout.safe ? 'inside both caps' : 'breaches a cap') : 'no installment proposed'}
        </span>
      </div>
      <div style={{ position: 'relative', paddingTop: 12 }}>
        <div style={{ display: 'flex', height: 14, borderRadius: 5, overflow: 'hidden' }}>
          {layout.segments.map((s) => (
            <div key={s.key} title={`${s.label} ${Math.round(s.frac * 100)}% of income`} style={{ width: `${s.frac * 100}%`, background: colors[s.key] }} />
          ))}
        </div>
        {layout.ticks.map((t) => (
          <div key={t.key} style={{ position: 'absolute', left: `${t.frac * 100}%`, top: 0, bottom: -2, width: 0, borderLeft: `1.5px dashed ${p.ink2}` }}>
            <span style={{ position: 'absolute', top: -11, left: t.frac > 0.8 ? 'auto' : 2, right: t.frac > 0.8 ? 2 : 'auto', fontFamily: FONT.ui, fontSize: 8, fontWeight: 600, color: p.ink2, whiteSpace: 'nowrap' }}>{t.label}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 10px', marginTop: 7 }}>
        {layout.segments.filter((s) => s.frac > 0.001).map((s) => (
          <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: FONT.ui, fontSize: 9, color: p.ink3 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: colors[s.key], display: 'inline-block' }} />
            {s.label}
          </span>
        ))}
      </div>
      <p style={{ fontFamily: FONT.ui, fontSize: 9, color: p.ink3, marginTop: 5, lineHeight: 1.5 }}>
        One month of income ({rm(assessment.avgIncome)}). The installment block must end left of both dashed caps.
      </p>
    </div>
  );
}

// ── 2. Decision waterfall ─────────────────────────────────────────────────────

export function DecisionWaterfall({ p, breakdown }: { p: Palette; breakdown: DecisionBreakdown }) {
  const w = waterfallSteps(breakdown);
  const scale = Math.max(...w.steps.map((s) => s.amount), 1);
  return (
    <div style={{ padding: '14px 20px 0' }}>
      <span style={{ fontFamily: FONT.ui, fontSize: 9.5, fontWeight: 700, color: p.ink3, letterSpacing: '0.10em', textTransform: 'uppercase' }}>How the amount was set</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
        {w.steps.map((s) => {
          const isFinal = s.key === 'offered';
          const barColor = isFinal ? (s.amount > 0 ? p.primary : p.red) : s.bit ? p.amber : 'rgba(20,40,30,0.16)';
          return (
            <div key={s.key}>
              <div style={{ display: 'grid', gridTemplateColumns: '92px 1fr 64px', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: FONT.ui, fontSize: 10, fontWeight: isFinal ? 700 : 500, color: s.bit ? '#8a6100' : p.ink2, lineHeight: 1.3 }}>{s.label}</span>
                <div style={{ height: 9, borderRadius: 3, background: 'rgba(20,40,30,0.06)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(s.amount / scale) * 100}%`, background: barColor, borderRadius: 3 }} />
                </div>
                <span style={{ fontFamily: FONT.num, fontSize: 10.5, fontWeight: isFinal ? 700 : 500, color: isFinal && s.amount === 0 ? p.red : p.ink1, textAlign: 'right' }}>{rm(s.amount)}</span>
              </div>
              {s.note && (
                <p style={{ fontFamily: FONT.ui, fontSize: 8.5, color: '#8a6100', margin: '2px 0 0 100px', lineHeight: 1.4 }}>↳ {s.note}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 3. Benford forensic chart ─────────────────────────────────────────────────

export function BenfordChart({ p, histogram, tone = 'ok' }: { p: Palette; histogram: number[] | undefined; tone?: 'ok' | 'alert' }) {
  const data = benfordChart(histogram);
  if (!data) return null;
  const W = 288;
  const H = 86;
  const padB = 14;
  const barW = 22;
  const gap = (W - 9 * barW) / 10;
  const yMax = Math.max(...data.bars, ...data.expected) * 1.15;
  const y = (v: number) => H - padB - (v / yMax) * (H - padB - 4);
  const barColor = tone === 'alert' ? p.red : p.primary;
  const curve = data.expected.map((e, i) => `${gap + i * (barW + gap) + barW / 2},${y(e)}`).join(' ');
  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Observed leading-digit shares against Benford's expected curve">
        {data.bars.map((b, i) => {
          const x = gap + i * (barW + gap);
          return (
            <g key={i}>
              <rect x={x} y={y(b)} width={barW} height={H - padB - y(b)} rx={2} fill={barColor} opacity={0.55} />
              <text x={x + barW / 2} y={H - 3} textAnchor="middle" fontSize={7.5} fill="#7d8a83" fontFamily={FONT.num}>{i + 1}</text>
            </g>
          );
        })}
        <polyline points={curve} fill="none" stroke={tone === 'alert' ? '#57241e' : '#1b4030'} strokeWidth={1.4} strokeDasharray="3 2" />
        {data.expected.map((e, i) => (
          <circle key={i} cx={gap + i * (barW + gap) + barW / 2} cy={y(e)} r={1.8} fill={tone === 'alert' ? '#57241e' : '#1b4030'} />
        ))}
      </svg>
      <p style={{ fontFamily: FONT.ui, fontSize: 9, color: p.ink3, lineHeight: 1.5, marginTop: 2 }}>
        Bars: observed share of leading digits 1–9 (signed aggregate counts). Dashed curve: Benford&apos;s expected distribution.
        {tone === 'alert' ? ' The clustering away from the curve is the fabrication fingerprint.' : ' Genuine spending hugs the curve.'}
      </p>
    </div>
  );
}

// ── 4. Momentum sparkline ─────────────────────────────────────────────────────

export function MomentumSpark({ p, momentum }: { p: Palette; momentum: PassportMomentum }) {
  const up = momentum.direction === 'rising';
  const flatLine = momentum.scoreFrom === momentum.scoreTo;
  const color = up ? p.primary : momentum.direction === 'falling' ? p.red : p.ink3;
  const y1 = flatLine ? 18 : up ? 26 : 8;
  const y2 = flatLine ? 18 : up ? 8 : 26;
  const covFrom = Math.min(1, momentum.coverageDaysFrom / 90);
  const covTo = Math.min(1, momentum.coverageDaysTo / 90);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
      <svg width={84} height={36} viewBox="0 0 84 36" role="img" aria-label={`Score ${momentum.scoreFrom} to ${momentum.scoreTo}`}>
        <line x1={14} y1={y1} x2={70} y2={y2} stroke={color} strokeWidth={2} strokeLinecap="round" />
        <circle cx={14} cy={y1} r={3} fill={color} opacity={0.45} />
        <circle cx={70} cy={y2} r={3.5} fill={color} />
        <text x={14} y={y1 + (up ? 10 : -5)} textAnchor="middle" fontSize={8} fill="#7d8a83" fontFamily={FONT.num}>{momentum.scoreFrom}</text>
        <text x={70} y={y2 + (up ? -5 : 10)} textAnchor="middle" fontSize={8.5} fontWeight={700} fill={color} fontFamily={FONT.num}>{momentum.scoreTo}</text>
      </svg>
      <div style={{ width: 64 }}>
        <p style={{ fontFamily: FONT.ui, fontSize: 8, color: p.ink3, marginBottom: 2 }}>coverage {momentum.coverageDaysFrom}→{momentum.coverageDaysTo}d</p>
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
