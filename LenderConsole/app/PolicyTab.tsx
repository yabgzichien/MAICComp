'use client';

// Lender Policy Editor (Brief N): the lender edits the affordability thresholds and
// product ladder the decision engine runs with. Saving PUTs to /api/policy (server-side
// JSON store)  the SAME store GET /api/lenders publishes TEKUN's entry from, so what
// the lender configures here is exactly what borrowers are coached toward (the flywheel).
// Validation is the shared pure lib (policyStore.ts); the server re-validates on PUT.

import React, { useEffect, useState } from 'react';
import { FONT, type Palette } from './tokens';
import { InfoButton, InfoModal, SectionLabel } from './shared';
import { TourAnchor } from './TourAnchor';
import { useTourLocked } from './tourContext';
import { DEFAULT_POLICY, DEFAULT_PRODUCTS, type LenderPolicy, type LoanProduct } from '../lib/loans';
import { aprWarnings, CANONICAL_TIER_IDS, validateStoredPolicy, type StoredPolicy } from '../lib/policyStore';
import { emitTourSignal } from '../lib/tourSignals';
import { findLender, type LenderProfile } from '../lib/lenderRegistry';
import type { ApplicationRecord } from '../lib/applications';
import AdvisorCard from './AdvisorCard';
import { useViewport } from '../lib/useViewport';

/** Form state keeps every field as a string so partial typing never crashes;
 *  numbers are parsed at validation time. Ratios are edited as percentages. */
interface ThresholdForm {
  maxDsrPct: string;
  surplusSharePct: string;
  confidenceFloorPct: string;
  confidenceDeclinePct: string;
  emergencyDays: string;
  fullLadderDays: string;
  minCoveragePct: string;
  costOfFundsPct: string;
  targetReturnPct: string;
}

interface LadderRow {
  id: string;
  label: string;
  minScore: string;
  minAmount: string;
  maxAmount: string;
  tenorMonths: string;
  aprPct: string;
}

const toThresholdForm = (p: LenderPolicy): ThresholdForm => ({
  maxDsrPct: String(Math.round(p.maxDsr * 100)),
  surplusSharePct: String(Math.round(p.maxInstallmentShareOfSurplus * 100)),
  confidenceFloorPct: String(Math.round(p.minConfidenceToApprove * 100)),
  confidenceDeclinePct: String(Math.round(p.minConfidenceToConsider * 100)),
  emergencyDays: String(p.emergencyOnlyBelowDays),
  fullLadderDays: String(p.fullLadderFromDays),
  minCoveragePct: String(Math.round(p.minCoverageRatioForFullLadder * 100)),
  costOfFundsPct: String(Math.round(p.costOfFunds * 100)),
  targetReturnPct: String(Math.round(p.targetReturn * 100)),
});

const toLadderRows = (products: LoanProduct[]): LadderRow[] =>
  products.map((pr) => ({
    id: pr.id,
    label: pr.label,
    minScore: String(pr.minScore),
    minAmount: String(pr.minAmount),
    maxAmount: String(pr.maxAmount),
    tenorMonths: String(pr.tenorMonths),
    aprPct: String(Math.round(pr.apr * 100)),
  }));

const num = (s: string): number => Number(s.trim());

/** Reassemble the candidate StoredPolicy body from form strings (validation decides if it's legal). */
function formToCandidate(t: ThresholdForm, rows: LadderRow[]): unknown {
  return {
    policy: {
      maxDsr: num(t.maxDsrPct) / 100,
      maxInstallmentShareOfSurplus: num(t.surplusSharePct) / 100,
      minConfidenceToApprove: num(t.confidenceFloorPct) / 100,
      minConfidenceToConsider: num(t.confidenceDeclinePct) / 100,
      emergencyOnlyBelowDays: num(t.emergencyDays),
      fullLadderFromDays: num(t.fullLadderDays),
      minCoverageRatioForFullLadder: num(t.minCoveragePct) / 100,
      costOfFunds: num(t.costOfFundsPct) / 100,
      targetReturn: num(t.targetReturnPct) / 100,
    },
    products: rows.map((r) => ({
      id: r.id,
      label: r.label,
      minScore: num(r.minScore),
      minAmount: num(r.minAmount),
      maxAmount: num(r.maxAmount),
      tenorMonths: num(r.tenorMonths),
      apr: num(r.aprPct) / 100,
    })),
  };
}

/** `hint` renders inline (a real cross-field constraint or consequence the form doesn't
 *  otherwise validate live); `glossaryKey` renders as an InfoButton instead (a definition,
 *  moved off the working form  see the 2026-08-03 console declutter pass). */
const THRESHOLD_FIELDS: { key: keyof ThresholdForm; label: string; suffix: string; hint?: string; glossaryKey?: string }[] = [
  { key: 'maxDsrPct', label: 'DSR cap', suffix: '%', glossaryKey: 'dsr_cap' },
  { key: 'surplusSharePct', label: 'Installment share of surplus', suffix: '%', glossaryKey: 'surplus_share_cap' },
  { key: 'confidenceFloorPct', label: 'Confidence floor', suffix: '%', hint: 'Below this data confidence, never auto-approve. Refer to a human.' },
  { key: 'confidenceDeclinePct', label: 'Confidence decline floor', suffix: '%', hint: 'Below this, decline outright: too little of the data could be corroborated to assess at all. Must stay under the confidence floor above, and under 39%, or the fraud rings’ own catches would auto-reject instead of reaching a human.' },
  { key: 'emergencyDays', label: 'Emergency-only gate', suffix: 'days', hint: 'Below this many covered days (of the last 90): Emergency tier only, forced referral.' },
  { key: 'fullLadderDays', label: 'Full-ladder gate', suffix: 'days', hint: 'From this many covered days the full ladder opens; below it, Starter and below.' },
  { key: 'minCoveragePct', label: 'Coverage ratio floor', suffix: '%', hint: 'Even with a full window, coverage below this still caps eligibility to Starter.' },
];

/** Pricing inputs for the risk-based pricing assistant (Brief R). */
const PRICING_FIELDS: { key: keyof ThresholdForm; label: string; suffix: string; hint?: string; glossaryKey?: string }[] = [
  { key: 'costOfFundsPct', label: 'Cost of funds', suffix: '% p.a.', hint: 'Your blended annual funding cost. The floor the assistant never prices below.' },
  { key: 'targetReturnPct', label: 'Target net return', suffix: '% p.a.', glossaryKey: 'target_return' },
];

/** Canonical slots keep their fixed order (the engine's coverage gates read them that way);
 *  lender-authored rungs sort after them, in the order they were added. `Array.sort` is stable,
 *  so equal ranks keep their relative order without a tiebreak. */
const slotRank = (id: string): number => {
  const i = (CANONICAL_TIER_IDS as readonly string[]).indexOf(id);
  return i < 0 ? CANONICAL_TIER_IDS.length : i;
};
const sortLadder = (rows: LadderRow[]): LadderRow[] => [...rows].sort((a, b) => slotRank(a.id) - slotRank(b.id));

const numOr = (s: string, fallback: number): number => (Number.isFinite(Number(s.trim())) && s.trim() !== '' ? Number(s.trim()) : fallback);

/** A rung of the lender's own, stacked on top of whatever ladder they already have. Both id and
 *  label are made unique here because validation rejects a duplicate of either — a new row that
 *  arrives already invalid would read as the editor being broken rather than as a blank to fill.
 *
 *  Seeded from the current top rung so the numbers start somewhere defensible; every field is
 *  then the lender's to edit. */
function newCustomRow(rows: LadderRow[]): LadderRow {
  let n = rows.length + 1;
  while (rows.some((r) => r.id === `tier-${n}`) || rows.some((r) => r.label === `New tier ${n}`)) n += 1;
  const topAmount = rows.reduce((m, r) => Math.max(m, numOr(r.maxAmount, 0)), 0);
  const topScore = rows.reduce((m, r) => Math.max(m, numOr(r.minScore, 300)), 300);
  const top = rows[rows.length - 1];
  return {
    id: `tier-${n}`,
    label: `New tier ${n}`,
    minScore: String(Math.min(900, topScore + 20)),
    minAmount: String(topAmount > 0 ? topAmount : 1000),
    maxAmount: String(topAmount > 0 ? topAmount * 2 : 5000),
    tenorMonths: top?.tenorMonths ?? '12',
    aprPct: top?.aprPct ?? '18',
  };
}

const LADDER_COLS = [
  { key: 'label' as const, label: 'Tier name', width: '1.6fr' },
  { key: 'minScore' as const, label: 'Min score', width: '1fr' },
  { key: 'minAmount' as const, label: 'Min RM', width: '1fr' },
  { key: 'maxAmount' as const, label: 'Max RM', width: '1fr' },
  { key: 'tenorMonths' as const, label: 'Tenor (mo)', width: '0.9fr' },
  { key: 'aprPct' as const, label: 'APR %', width: '0.8fr' },
];

export default function PolicyTab({
  p,
  stored,
  onSaved,
  lenderId,
  lenderName,
  apps,
}: {
  p: Palette;
  stored: StoredPolicy;
  onSaved: (s: StoredPolicy) => void;
  lenderId: string;
  lenderName: string;
  apps: ApplicationRecord[];
}) {
  const { isMobile } = useViewport();
  const [thresholds, setThresholds] = useState<ThresholdForm>(() => toThresholdForm(stored.policy));
  const [rows, setRows] = useState<LadderRow[]>(() => toLadderRows(stored.products));
  // The ladder is act 10's own do-step control. Only Save is withheld before the tour gets
  // there: editing the form changes nothing real (the candidate lives in local state until the
  // PUT), so locking the inputs would be theatre while leaving Save live would let a judge
  // re-price the engine mid-script and contradict verdicts the tour has already narrated.
  const publishLocked = useTourLocked('product-ladder');
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  // Published Criteria panel (Brief H stretch): proves the editor and the borrower-facing
  // directory genuinely agree, by fetching the SAME GET /api/lenders payload the borrower
  // app's coach reads  never local form state.
  const [published, setPublished] = useState<LenderProfile | null>(null);
  const [publishedError, setPublishedError] = useState(false);
  const [publishedLoading, setPublishedLoading] = useState(false);
  const fetchPublished = React.useCallback(() => {
    setPublishedLoading(true);
    setPublishedError(false);
    fetch('/api/lenders')
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((all: LenderProfile[]) => setPublished(findLender(all, lenderId) ?? null))
      .catch(() => setPublishedError(true))
      .finally(() => setPublishedLoading(false));
  }, [lenderId]);
  useEffect(() => {
    fetchPublished();
  }, [fetchPublished]);

  const candidate = formToCandidate(thresholds, rows);
  const validation = validateStoredPolicy(candidate);
  const warnings = validation.ok ? aprWarnings(validation.value.products) : [];
  const unusedSlots = CANONICAL_TIER_IDS.filter((id) => !rows.some((r) => r.id === id));

  const setThreshold = (key: keyof ThresholdForm, v: string) => setThresholds((t) => ({ ...t, [key]: v }));
  const setRow = (i: number, key: keyof LadderRow, v: string) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [key]: v } : r)));

  /** Add a rung. `slot` refills one of the canonical four that was removed; no argument adds a
   *  lender-authored tier of the lender's own. Either way the tour's act-10 step hears about it:
   *  adding a slot is enough to satisfy "design a loan product", so the card reveals Next rather
   *  than holding the officer until they publish. */
  const addSlot = (slot?: string) => {
    setRows((rs) => {
      const seed = slot ? DEFAULT_PRODUCTS.find((d) => d.id === slot) : undefined;
      return sortLadder([...rs, seed ? toLadderRows([seed])[0] : newCustomRow(rs)]);
    });
    emitTourSignal('product-slot-added');
  };

  const resetToDefaults = () => {
    if (!window.confirm('Discard your unsaved edits and reset every threshold and tier back to the defaults?')) return;
    setThresholds(toThresholdForm(DEFAULT_POLICY));
    setRows(toLadderRows(DEFAULT_PRODUCTS));
    setErrors([]);
  };

  async function save() {
    setSaving(true);
    setErrors([]);
    try {
      const res = await fetch(`/api/policy?lender=${lenderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(candidate),
      });
      const body = await res.json();
      if (!res.ok) {
        setErrors(Array.isArray(body.errors) ? body.errors : ['Save failed.']);
        return;
      }
      onSaved(body as StoredPolicy);
      // Act 10's "design a loan product" step advances on this, and only on a save the server
      // actually accepted — the tour must never celebrate a policy that was rejected.
      emitTourSignal('policy-published');
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
      fetchPublished();
    } catch {
      setErrors(['Could not reach the policy store. Is the console server running?']);
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '7px 10px',
    borderRadius: 7,
    border: `1.5px solid ${p.hairline}`,
    fontSize: 12.5,
    fontWeight: 600,
    color: p.ink1,
    background: p.surface2,
    outline: 'none',
    fontFamily: FONT.num,
  };

  return (
    <div style={{ flex: 1, background: p.bg, overflowY: 'auto' }}>
      <InfoModal entry={info} onClose={() => setInfo(null)} p={p} />
      <div style={{ padding: isMobile ? '20px 16px 18px' : '20px 40px 18px', background: p.surface, borderBottom: `1px solid ${p.hairline}` }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <div>
            <SectionLabel color={p.ink2}>Policy · {lenderName}</SectionLabel>
            <h2 style={{ fontFamily: FONT.ui, fontSize: 22, fontWeight: 800, color: p.ink1, letterSpacing: '-0.4px', marginTop: 4, marginBottom: 5 }}>
              Lender Policy Editor
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3 }}>What these thresholds control</span>
              <InfoButton entry="policy_thresholds_scope" onOpen={setInfo} />
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3 }}>
              {stored.updatedAt ? `Last updated ${new Date(stored.updatedAt).toLocaleString('en-MY')}` : 'Policy defaults, never edited'}
            </p>
          </div>
        </div>
      </div>

      <div style={{ padding: isMobile ? '18px 16px 26px' : '18px 40px 26px', display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1080, margin: '0 auto' }}>
        {/* ── Affordability thresholds ── */}
        <TourAnchor id="policy-thresholds">
        <div style={{ background: p.surface, borderRadius: 12, padding: '14px 18px', boxShadow: p.shadow }}>
          <SectionLabel color={p.ink2}>Affordability thresholds</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '14px 22px', marginTop: 10 }}>
            {THRESHOLD_FIELDS.map((f) => (
              <div key={f.key}>
                <label style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.ink1, display: 'block', marginBottom: 4 }}>{f.label}</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input value={thresholds[f.key]} onChange={(e) => setThreshold(f.key, e.target.value)} inputMode="numeric" style={{ ...inputStyle, width: 76 }} />
                  <span style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3 }}>{f.suffix}</span>
                  {f.glossaryKey && <InfoButton entry={f.glossaryKey} onOpen={setInfo} />}
                </div>
                {f.hint && <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3, lineHeight: 1.45, marginTop: 4 }}>{f.hint}</p>}
              </div>
            ))}
          </div>
        </div>
        </TourAnchor>

        {/* ── Advisor (2026-07-18 stats/advisor design) ── */}
        <AdvisorCard p={p} apps={apps} onInfo={setInfo} />

        {/* ── Pricing (risk-based assistant, Brief R) ── */}
        <div style={{ background: p.surface, borderRadius: 12, padding: '14px 18px', boxShadow: p.shadow }}>
          <SectionLabel color={p.ink2}>Pricing · risk-based assistant</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '14px 22px', marginTop: 10 }}>
            {PRICING_FIELDS.map((f) => (
              <div key={f.key}>
                <label style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.ink1, display: 'block', marginBottom: 4 }}>{f.label}</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input value={thresholds[f.key]} onChange={(e) => setThreshold(f.key, e.target.value)} inputMode="numeric" style={{ ...inputStyle, width: 76 }} />
                  <span style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3 }}>{f.suffix}</span>
                  {f.glossaryKey && <InfoButton entry={f.glossaryKey} onOpen={setInfo} />}
                </div>
                {f.hint && <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3, lineHeight: 1.45, marginTop: 4 }}>{f.hint}</p>}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
            <span style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3 }}>How the assistant prices</span>
            <InfoButton entry="pricing_assistant_behavior" onOpen={setInfo} />
          </div>
        </div>

        {/* ── Product ladder ── */}
        <TourAnchor id="product-ladder">
        <div style={{ background: p.surface, borderRadius: 12, padding: '14px 18px', boxShadow: p.shadow }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <SectionLabel color={p.ink2}>Product ladder</SectionLabel>
            <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3, maxWidth: 520, lineHeight: 1.45 }}>
              Four canonical slots (emergency · starter · growth · scale) carry the coverage gates. Slots you add
              beyond them lend to full-coverage borrowers only. Naming and ranges are yours.
            </p>
          </div>
          {/* Genuine data table (a per-tier rate ladder) — mobile keeps the grid intact and
              scrolls it sideways rather than restructuring it into stacked cards. */}
          <div style={{ overflowX: isMobile ? 'auto' : 'visible', marginTop: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: `0.9fr ${LADDER_COLS.map((c) => c.width).join(' ')} 34px`, gap: '6px 10px', alignItems: 'center', minWidth: isMobile ? 720 : undefined }}>
            <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.ink3, letterSpacing: '0.07em', textTransform: 'uppercase' }}>Slot</span>
            {LADDER_COLS.map((c) => (
              <span key={c.key} style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.ink3, letterSpacing: '0.07em', textTransform: 'uppercase' }}>{c.label}</span>
            ))}
            <span />
            {rows.map((r, i) => (
              <React.Fragment key={r.id}>
                <span style={{ fontFamily: FONT.mono, fontSize: 12, fontWeight: 600, color: p.accentInk }}>{r.id}</span>
                {LADDER_COLS.map((c) => (
                  <input key={c.key} value={r[c.key]} onChange={(e) => setRow(i, c.key, e.target.value)} inputMode={c.key === 'label' ? 'text' : 'numeric'} style={inputStyle} />
                ))}
                <button
                  onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                  title={`Remove the ${r.id} tier`}
                  style={{ width: 26, height: 26, borderRadius: 6, border: `1.5px solid ${p.hairline}`, background: 'transparent', color: p.ink3, cursor: 'pointer', fontFamily: FONT.ui, fontSize: 13, lineHeight: 1 }}
                >
                  ×
                </button>
              </React.Fragment>
            ))}
          </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3 }}>Add tier:</span>
            {unusedSlots.map((slot) => (
              <button
                key={slot}
                onClick={() => addSlot(slot)}
                style={{ padding: '4px 12px', borderRadius: 7, border: `1.5px solid ${p.accentSoft}`, background: p.accentTint, color: p.accentInk, cursor: 'pointer', fontFamily: FONT.ui, fontSize: 12, fontWeight: 600 }}
              >
                + {slot}
              </button>
            ))}
            {/* Always available, unlike the canonical refills above: a lender whose four slots are
                all in use can still author a fifth rung of their own. */}
            <button
              onClick={() => addSlot()}
              title="Add a loan slot of your own. It lends to full-coverage borrowers only — the coverage gates name the four canonical slots and nothing else."
              style={{ padding: '4px 12px', borderRadius: 7, border: `1.5px solid ${p.accentInk}`, background: 'transparent', color: p.accentInk, cursor: 'pointer', fontFamily: FONT.ui, fontSize: 12, fontWeight: 700 }}
            >
              + New loan slot
            </button>
          </div>
          {warnings.map((w, i) => (
            <div key={i} style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: '#fdf3dc', border: '1px solid #f5d990', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 800, color: p.amber, lineHeight: 1.4 }}>!</span>
              <p style={{ fontFamily: FONT.ui, fontSize: 12, color: '#7a5c00', lineHeight: 1.5 }}>{w}</p>
            </div>
          ))}
        </div>
        </TourAnchor>

        {/* ── Published Criteria panel (Brief H stretch) ── */}
        <div style={{ background: p.surface, borderRadius: 12, padding: '14px 18px', boxShadow: p.shadow }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <SectionLabel color={p.ink2}>Published criteria · GET /api/lenders</SectionLabel>
              <InfoButton entry="published_criteria_panel" onOpen={setInfo} />
            </div>
            <button
              onClick={fetchPublished}
              disabled={publishedLoading}
              style={{ padding: '4px 12px', borderRadius: 7, border: `1.5px solid ${p.hairline}`, background: 'transparent', color: p.ink2, cursor: publishedLoading ? 'default' : 'pointer', fontFamily: FONT.ui, fontSize: 12, fontWeight: 600 }}
            >
              {publishedLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          {publishedError && <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.red, marginTop: 8 }}>Could not reach the published directory.</p>}
          {published && (
            <>
              <p style={{ fontFamily: FONT.ui, fontSize: 13, fontWeight: 700, color: p.ink1, marginTop: 8 }}>{published.name}</p>
              <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3, lineHeight: 1.5, marginTop: 2, marginBottom: 10 }}>{published.blurb}</p>
              {/* Same treatment as the ladder editor above: a real data table, scrolled
                  sideways on mobile instead of restructured into cards. */}
              <div style={{ overflowX: isMobile ? 'auto' : 'visible' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1fr 0.9fr 0.8fr', gap: '4px 10px', minWidth: isMobile ? 560 : undefined }}>
                {['Tier', 'Min score', 'Min RM', 'Max RM', 'Tenor (mo)', 'APR %'].map((h) => (
                  <span key={h} style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.ink3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</span>
                ))}
                {published.products.map((prod) => (
                  <React.Fragment key={prod.id}>
                    <span style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink1 }}>{prod.label}</span>
                    <span style={{ fontFamily: FONT.num, fontSize: 12, color: p.ink2 }}>{prod.minScore}</span>
                    <span style={{ fontFamily: FONT.num, fontSize: 12, color: p.ink2 }}>{prod.minAmount.toLocaleString('en-MY')}</span>
                    <span style={{ fontFamily: FONT.num, fontSize: 12, color: p.ink2 }}>{prod.maxAmount.toLocaleString('en-MY')}</span>
                    <span style={{ fontFamily: FONT.num, fontSize: 12, color: p.ink2 }}>{prod.tenorMonths}</span>
                    <span style={{ fontFamily: FONT.num, fontSize: 12, color: p.ink2 }}>{Math.round(prod.apr * 100)}</span>
                  </React.Fragment>
                ))}
              </div>
              </div>
            </>
          )}
        </div>

        {/* ── Validation + actions ── */}
        {!validation.ok && (
          <div style={{ background: '#fff6f5', border: `1.5px solid ${p.red}33`, borderRadius: 10, padding: '10px 14px' }}>
            {validation.errors.map((e, i) => (
              <p key={i} style={{ fontFamily: FONT.mono, fontSize: 12, color: p.red, lineHeight: 1.7 }}>• {e}</p>
            ))}
          </div>
        )}
        {errors.map((e, i) => (
          <p key={i} style={{ fontFamily: FONT.mono, fontSize: 12, color: p.red }}>• {e}</p>
        ))}

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
          <button
            onClick={save}
            disabled={!validation.ok || saving || publishLocked}
            title={publishLocked ? 'The guided tour hasn’t reached this step yet.' : undefined}
            style={{
              padding: '10px 26px',
              borderRadius: 9,
              border: 'none',
              cursor: validation.ok && !saving && !publishLocked ? 'pointer' : 'not-allowed',
              background: validation.ok && !publishLocked ? p.accentInk : 'rgba(20,40,30,0.12)',
              color: 'white',
              fontFamily: FONT.ui,
              fontSize: 12.5,
              fontWeight: 700,
            }}
          >
            {saving ? 'Saving…' : 'Save policy'}
          </button>
          <span style={{ width: 1, height: 26, background: p.hairline, margin: '0 2px' }} />
          <button
            onClick={resetToDefaults}
            title="Discards unsaved edits. Cannot be undone"
            style={{ padding: '10px 18px', borderRadius: 9, border: `1.5px solid ${p.red}55`, background: 'transparent', color: p.red, cursor: 'pointer', fontFamily: FONT.ui, fontSize: 12, fontWeight: 600 }}
          >
            Reset to defaults
          </button>
          {savedFlash && (
            <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.accentInk }}>
              ✓ Saved. Decisions and the published directory now use this policy
            </span>
          )}
        </div>

        <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3, lineHeight: 1.55, maxWidth: 720 }}>
          Active values here are quoted verbatim in adverse-action letters to declined borrowers.
        </p>
      </div>
    </div>
  );
}
