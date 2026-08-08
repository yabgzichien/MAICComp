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
import { affordabilityCheck, benfordChart, confidenceCeilingNotch, coverageStrip, headroomLayout, waterfallSteps } from '../lib/decisionViz';
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
        <BarChart data={[{ name: 'income', ...row }]} layout="vertical" margin={{ top: 30, right: 2, bottom: 0, left: 2 }}>
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
          {layout.ticks.map((t, i) => (
            <ReferenceLine
              key={t.key}
              x={t.frac}
              stroke={p.ink2}
              strokeDasharray="4 3"
              strokeWidth={1.5}
              // Not a fixed `position: 'top'` label: the tick sits at the borrower's own
              // debt-to-income ratio, which can land anywhere on the axis  including right
              // near an edge (a low-surplus borrower's surplus-cap tick can sit at ~12% of
              // income even though the cap itself is 35%). A centered label there gets its
              // left half clipped by the chart's 2px margin  found live, a clipped "35%"
              // read as "85%". Anchor from the edge instead of the middle whenever the tick
              // is close enough that a centered label would overrun it.
              //
              // The two ticks (DSR cap, surplus-share cap) can land at nearly the same x  a
              // low-surplus borrower's surplus tick often sits right next to the DSR tick
              // so a shared baseline lets the two labels run into each other, e.g. "35%40%DSR
              // cap". Stacking them on alternating rows (by tick identity, not by position)
              // guarantees separation regardless of how close the two fracs land.
              label={(props: { viewBox?: { x?: number; y?: number } }) => {
                const x = props.viewBox?.x ?? 0;
                const y = props.viewBox?.y ?? 0;
                const anchor = t.frac < 0.15 ? 'start' : t.frac > 0.85 ? 'end' : 'middle';
                const dx = anchor === 'start' ? 3 : anchor === 'end' ? -3 : 0;
                const dy = i === 0 ? -5 : -19;
                return (
                  <text x={x + dx} y={y + dy} textAnchor={anchor} fontSize={12} fontFamily={FONT.ui} fill={p.ink2}>
                    {t.label}
                  </text>
                );
              }}
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

// ── 7. Affordability check card ────────────────────────────────────────────────
// Affordability is the single most common reason a file gets no offer, and until now
// it existed only as one line of audit-trail prose on the right-hand panel  next to a
// headroom bar that goes blank on a decline (installment 0 → nothing to plot), i.e. it
// disappeared exactly when it mattered. This card sits in the centre column above the
// Benford check and shows the test itself: the two installment caps, the tighter one
// that binds, and the principal that buys against the tier's minimum. Carries its own
// card chrome so a failed check can turn red without the caller re-wrapping it.

function Figure({ p, label, value, bg }: { p: Palette; label: string; value: string; bg: string }) {
  return (
    <div style={{ background: bg, borderRadius: 9, padding: '7px 10px', border: `1px solid ${p.hairline}` }}>
      <div style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.ink3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: FONT.num, fontSize: 15, fontWeight: 700, color: p.ink1, marginTop: 2 }}>{value}</div>
    </div>
  );
}

/**
 * The headline ratio: repayment ÷ net cash flow, against the policy cap that governs it.
 * The track runs 0→100% of net cash flow (not 0→cap), so the cap marker sits where the
 * policy actually puts it and a file that overshoots is visibly PAST a line rather than
 * merely full. The fill clamps at 100%; the printed number never does, because "112% of
 * net cash flow" is exactly the fact a declined file needs to communicate.
 */
function RepaymentShareMeter({
  p,
  share,
  cap,
  amount,
  surplus,
  tone,
  caption,
  onInfo,
}: {
  p: Palette;
  share: number;
  cap: number;
  amount: number;
  surplus: number;
  tone: 'ok' | 'bad';
  caption: string;
  onInfo?: (entry: string) => void;
}) {
  const color = tone === 'bad' ? p.red : p.primary;
  const fill = Math.max(0, Math.min(1, share));
  const capFrac = Math.max(0, Math.min(1, cap));
  return (
    <div style={{ marginTop: 10, padding: '9px 11px', borderRadius: 10, background: tone === 'bad' ? '#fdecea' : p.accentTint, border: `1px solid ${tone === 'bad' ? '#f5c6c2' : p.accentSoft}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
        <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.ink3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Repayment ÷ net cash flow
        </span>
        {onInfo && <InfoButton entry="repayment_share" onOpen={onInfo} />}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: FONT.num, fontSize: 30, fontWeight: 700, color, lineHeight: 1, letterSpacing: '-0.5px' }}>{pctLabel(share)}</span>
        <span style={{ fontFamily: FONT.num, fontSize: 12, color: p.ink2 }}>
          {rm(amount)}/mo of {rm(surplus)}/mo
        </span>
      </div>
      {/* Cap marker rides the track itself rather than a legend: the question is always
          "which side of the line is the fill on", and a separate legend makes the reader
          do that comparison in their head. */}
      <div style={{ position: 'relative', height: 10, borderRadius: 5, background: 'rgba(20,40,30,0.10)', overflow: 'hidden', marginTop: 7 }}>
        <div style={{ position: 'absolute', inset: 0, width: `${fill * 100}%`, background: color, borderRadius: 5 }} />
        <div style={{ position: 'absolute', top: -1, bottom: -1, left: `${capFrac * 100}%`, width: 2, background: p.ink1, transform: 'translateX(-1px)' }} />
      </div>
      <div style={{ position: 'relative', height: 15, marginTop: 1 }}>
        <span
          style={{
            position: 'absolute',
            left: `${capFrac * 100}%`,
            transform: capFrac > 0.8 ? 'translateX(-100%)' : capFrac < 0.08 ? 'none' : 'translateX(-50%)',
            fontFamily: FONT.ui,
            fontSize: 12,
            color: p.ink2,
            whiteSpace: 'nowrap',
          }}
        >
          {pctLabel(cap)} cap
        </span>
      </div>
      <p style={{ fontFamily: FONT.ui, fontSize: 12, color: tone === 'bad' ? '#922b21' : p.ink2, lineHeight: 1.5, marginTop: 1 }}>{caption}</p>
    </div>
  );
}

function CheckHeader({ p, chip, chipColor, chipBg, onInfo }: { p: Palette; chip: string; chipColor: string; chipBg: string; onInfo?: (entry: string) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 7 }}>
      <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.ink3, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 5 }}>
        Affordability check
        {onInfo && <InfoButton entry="affordability_check" onOpen={onInfo} />}
      </span>
      <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', color: chipColor, background: chipBg, borderRadius: 5, padding: '2px 9px' }}>{chip}</span>
    </div>
  );
}

export function AffordabilityCheckCard({
  p,
  assessment,
  breakdown,
  installment,
  policy,
  onInfo,
}: {
  p: Palette;
  assessment: PassportAssessment | undefined;
  breakdown: DecisionBreakdown | undefined;
  installment: number;
  policy?: LenderPolicy;
  onInfo?: (entry: string) => void;
}) {
  if (!assessment) return null;

  // No breakdown = no tier was ever selected, so decideLoan returned before the
  // affordability step. Say that outright rather than hiding the card: a missing
  // card reads as "the check passed quietly", which is the opposite of the truth.
  if (!breakdown) {
    return (
      <div style={{ background: p.surface, borderRadius: 12, padding: '12px 16px', boxShadow: p.shadow }}>
        <CheckHeader p={p} chip="NOT REACHED" chipColor={p.ink2} chipBg="rgba(20,40,30,0.06)" onInfo={onInfo} />
        <p style={{ fontFamily: FONT.ui, fontSize: 12.5, color: p.ink2, lineHeight: 1.55 }}>
          This file stopped at an earlier gate, so capacity to repay was never tested. The audit trail carries the reason it stopped.
        </p>
      </div>
    );
  }

  const c = affordabilityCheck(assessment, breakdown, installment, policy);
  const fail = !c.passed;
  const accent = fail ? p.red : p.primary;
  const tileBg = fail ? '#ffffff' : p.surface2;
  const binding = c.caps.find((cap) => cap.binding) ?? c.caps[0];
  const capData = c.caps.map((cap) => ({ name: cap.label, amount: cap.installment, binding: cap.binding }));
  // Headroom above the taller of the bar and the tier line, so neither the value label
  // nor the dashed minimum ever sits flush against the right edge of the plot.
  const axisMax = Math.max(c.supportable, c.tierMinAmount, 1) * 1.15;
  const minFrac = c.tierMinAmount / axisMax;

  return (
    <div
      style={{
        background: fail ? '#fdf6f6' : p.surface,
        borderRadius: 12,
        padding: '12px 16px',
        boxShadow: p.shadow,
        borderLeft: `4px solid ${accent}`,
      }}
    >
      <CheckHeader
        p={p}
        chip={fail ? 'NO CAPACITY' : 'WITHIN CAPACITY'}
        chipColor={fail ? p.red : p.accentInk}
        chipBg={fail ? '#fde8e8' : p.accentSoft}
        onInfo={onInfo}
      />

      <p style={{ fontFamily: FONT.ui, fontSize: 13, fontWeight: 700, color: fail ? '#922b21' : p.ink1, lineHeight: 1.45 }}>{c.headline}</p>

      {/* On an offer this is the real ratio; on a decline the offered installment is 0, so
          the honest figure is what the tier's smallest loan WOULD demand — a "0%" meter on
          a declined file would read as the most affordable case on the screen. */}
      {c.passed && c.surplusShare !== null && (
        <RepaymentShareMeter
          p={p}
          share={c.surplusShare}
          cap={c.shareCap}
          amount={c.installment}
          surplus={c.surplus}
          tone={c.surplusShare > c.shareCap ? 'bad' : 'ok'}
          caption={`Leaves ${rm(Math.max(0, c.surplus - c.installment))}/mo of net cash flow after the repayment.`}
          onInfo={onInfo}
        />
      )}
      {!c.passed && c.requiredSurplusShare !== null && (
        <RepaymentShareMeter
          p={p}
          share={c.requiredSurplusShare}
          cap={c.shareCap}
          amount={c.requiredInstallment ?? 0}
          surplus={c.surplus}
          tone="bad"
          caption={`Would need ${rm(c.requiredInstallment ?? 0)}/mo for the smallest loan in this tier — the cap allows ${rm(c.room)}/mo.`}
          onInfo={onInfo}
        />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7, marginTop: 9 }}>
        <Figure p={p} label="Income" value={`${rm(c.income)}/mo`} bg={tileBg} />
        <Figure p={p} label="Debt service" value={`${rm(c.debtService)}/mo`} bg={tileBg} />
        <Figure p={p} label="Net cash flow" value={`${rm(c.surplus)}/mo`} bg={tileBg} />
      </div>

      <p style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.ink3, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 11 }}>
        Most it can repay each month
      </p>
      <ResponsiveContainer width="100%" height={62}>
        <BarChart data={capData} layout="vertical" margin={{ top: 6, right: 66, bottom: 0, left: 0 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12, fontFamily: FONT.ui, fill: p.ink2 }} axisLine={false} tickLine={false} />
          <Tooltip
            formatter={(value: unknown) => [`${rm(Number(value ?? 0))}/mo`, 'Allowed']}
            contentStyle={{ fontFamily: FONT.ui, fontSize: 12, borderRadius: 8, border: `1px solid ${p.hairline}` }}
          />
          <Bar dataKey="amount" isAnimationActive={false} barSize={11} radius={3}>
            <LabelList dataKey="amount" position="right" formatter={(v: unknown) => `${rm(Number(v))}/mo`} style={{ fontSize: 12, fontFamily: FONT.num, fill: p.ink1 }} />
            {capData.map((d, i) => (
              <Cell key={i} fill={d.binding ? accent : 'rgba(20,40,30,0.16)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink2, lineHeight: 1.5, marginTop: 2 }}>
        The tighter cap binds: {binding.basis} = <strong style={{ color: accent, fontFamily: FONT.num }}>{rm(c.room)}/mo</strong>.
      </p>

      <p style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.ink3, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 11 }}>
        What {rm(c.room)}/mo buys at {c.tierLabel}
      </p>
      <ResponsiveContainer width="100%" height={58}>
        <BarChart data={[{ name: 'Principal', amount: c.supportable }]} layout="vertical" margin={{ top: 22, right: 66, bottom: 0, left: 0 }}>
          <XAxis type="number" domain={[0, axisMax]} hide />
          <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12, fontFamily: FONT.ui, fill: p.ink2 }} axisLine={false} tickLine={false} />
          <Tooltip
            formatter={(value: unknown) => [rm(Number(value ?? 0)), 'Affordability supports']}
            contentStyle={{ fontFamily: FONT.ui, fontSize: 12, borderRadius: 8, border: `1px solid ${p.hairline}` }}
          />
          <Bar dataKey="amount" isAnimationActive={false} barSize={13} radius={3} fill={accent}>
            <LabelList dataKey="amount" position="right" formatter={(v: unknown) => rm(Number(v))} style={{ fontSize: 12, fontFamily: FONT.num, fill: p.ink1 }} />
          </Bar>
          {/* Same edge-anchoring rule as the headroom ticks: the tier minimum can land
              anywhere on the axis, and a centred label near either end gets clipped. */}
          <ReferenceLine
            x={c.tierMinAmount}
            stroke={p.ink2}
            strokeDasharray="4 3"
            strokeWidth={1.5}
            label={(props: { viewBox?: { x?: number; y?: number } }) => {
              const x = props.viewBox?.x ?? 0;
              const y = props.viewBox?.y ?? 0;
              const anchor = minFrac < 0.2 ? 'start' : minFrac > 0.8 ? 'end' : 'middle';
              const dx = anchor === 'start' ? 3 : anchor === 'end' ? -3 : 0;
              return (
                <text x={x + dx} y={y - 7} textAnchor={anchor} fontSize={12} fontFamily={FONT.ui} fill={p.ink2}>
                  tier minimum {rm(c.tierMinAmount)}
                </text>
              );
            }}
          />
        </BarChart>
      </ResponsiveContainer>
      <p style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 600, color: fail ? p.red : p.accentInk, lineHeight: 1.5, marginTop: 2 }}>
        {fail
          ? `Short by ${rm(c.shortfall)} — no amount in this tier is affordable on these numbers.`
          : `Clears the tier minimum by ${rm(Math.max(0, c.supportable - c.tierMinAmount))}.`}
      </p>
      {/* What affordability allows is not what gets offered: the tier ceiling and the
          amount actually requested still cut it down (the decision waterfall shows that
          step). Say so, or a supportable figure above the offer reads as a missed offer. */}
      {!fail && (
        <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3, lineHeight: 1.5, marginTop: 2 }}>
          Capacity only — the amount offered is then capped by the tier range and the amount requested.
        </p>
      )}
    </div>
  );
}

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
