'use client';

// Lender Policy Editor (Brief N): the lender edits the affordability thresholds and
// product ladder the decision engine runs with. Saving PUTs to /api/policy (server-side
// JSON store)  the SAME store GET /api/lenders publishes TEKUN's entry from, so what
// the lender configures here is exactly what borrowers are coached toward (the flywheel).
// Validation is the shared pure lib (policyStore.ts); the server re-validates on PUT.

import React, { useState } from 'react';
import { FONT, type Palette } from './tokens';
import { SectionLabel } from './shared';
import { DEFAULT_POLICY, DEFAULT_PRODUCTS, type LenderPolicy, type LoanProduct } from '../lib/loans';
import { aprWarnings, CANONICAL_TIER_IDS, validateStoredPolicy, type StoredPolicy } from '../lib/policyStore';

/** Form state keeps every field as a string so partial typing never crashes;
 *  numbers are parsed at validation time. Ratios are edited as percentages. */
interface ThresholdForm {
  maxDsrPct: string;
  surplusSharePct: string;
  confidenceFloorPct: string;
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

const THRESHOLD_FIELDS: { key: keyof ThresholdForm; label: string; suffix: string; hint: string }[] = [
  { key: 'maxDsrPct', label: 'DSR cap', suffix: '%', hint: 'Total debt service (existing + new installment) over income may not exceed this.' },
  { key: 'surplusSharePct', label: 'Installment share of surplus', suffix: '%', hint: 'An installment may not consume more than this share of average monthly surplus.' },
  { key: 'confidenceFloorPct', label: 'Confidence floor', suffix: '%', hint: 'Below this data confidence, never auto-approve  refer to a human.' },
  { key: 'emergencyDays', label: 'Emergency-only gate', suffix: 'days', hint: 'Below this many covered days (of the last 90): Emergency tier only, forced referral.' },
  { key: 'fullLadderDays', label: 'Full-ladder gate', suffix: 'days', hint: 'From this many covered days the full ladder opens; below it, Starter and below.' },
  { key: 'minCoveragePct', label: 'Coverage ratio floor', suffix: '%', hint: 'Even with a full window, coverage below this still caps eligibility to Starter.' },
];

/** Pricing inputs for the risk-based pricing assistant (Brief R). */
const PRICING_FIELDS: { key: keyof ThresholdForm; label: string; suffix: string; hint: string }[] = [
  { key: 'costOfFundsPct', label: 'Cost of funds', suffix: '% p.a.', hint: 'Your blended annual funding cost  the floor the assistant never prices below.' },
  { key: 'targetReturnPct', label: 'Target net return', suffix: '% p.a.', hint: 'Net margin above break-even the assistant aims for when discounting a strong file.' },
];

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
}: {
  p: Palette;
  stored: StoredPolicy;
  onSaved: (s: StoredPolicy) => void;
}) {
  const [thresholds, setThresholds] = useState<ThresholdForm>(() => toThresholdForm(stored.policy));
  const [rows, setRows] = useState<LadderRow[]>(() => toLadderRows(stored.products));
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const candidate = formToCandidate(thresholds, rows);
  const validation = validateStoredPolicy(candidate);
  const warnings = validation.ok ? aprWarnings(validation.value.products) : [];
  const unusedSlots = CANONICAL_TIER_IDS.filter((id) => !rows.some((r) => r.id === id));

  const setThreshold = (key: keyof ThresholdForm, v: string) => setThresholds((t) => ({ ...t, [key]: v }));
  const setRow = (i: number, key: keyof LadderRow, v: string) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [key]: v } : r)));

  const resetToDefaults = () => {
    setThresholds(toThresholdForm(DEFAULT_POLICY));
    setRows(toLadderRows(DEFAULT_PRODUCTS));
    setErrors([]);
  };

  async function save() {
    setSaving(true);
    setErrors([]);
    try {
      const res = await fetch('/api/policy', {
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
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
    } catch {
      setErrors(['Could not reach the policy store  is the console server running?']);
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
      <div style={{ padding: '20px 40px 18px', background: p.surface, borderBottom: `1px solid ${p.hairline}` }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <div>
            <SectionLabel color={p.ink3}>Policy · TEKUN Nasional</SectionLabel>
            <h2 style={{ fontFamily: FONT.ui, fontSize: 22, fontWeight: 800, color: p.ink1, letterSpacing: '-0.4px', marginTop: 4, marginBottom: 5 }}>
              Lender Policy Editor
            </h2>
            <p style={{ fontFamily: FONT.ui, fontSize: 11.5, color: p.ink3, maxWidth: 620, lineHeight: 1.5 }}>
              Every decision on the Verify tab runs under these thresholds, the audit trail cites them, and{' '}
              <strong style={{ color: p.ink2 }}>the published criteria borrowers are coached toward update with them</strong> (GET /api/lenders).
            </p>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <p style={{ fontFamily: FONT.ui, fontSize: 10.5, color: p.ink3 }}>
              {stored.updatedAt ? `Last updated ${new Date(stored.updatedAt).toLocaleString('en-MY')}` : 'Policy defaults  never edited'}
            </p>
          </div>
        </div>
      </div>

      <div style={{ padding: '18px 40px 26px', display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1080, margin: '0 auto' }}>
        {/* ── Affordability thresholds ── */}
        <div style={{ background: p.surface, borderRadius: 12, padding: '14px 18px', boxShadow: p.shadow }}>
          <SectionLabel color={p.ink3}>Affordability thresholds</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px 22px', marginTop: 10 }}>
            {THRESHOLD_FIELDS.map((f) => (
              <div key={f.key}>
                <label style={{ fontFamily: FONT.ui, fontSize: 11, fontWeight: 700, color: p.ink1, display: 'block', marginBottom: 4 }}>{f.label}</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input value={thresholds[f.key]} onChange={(e) => setThreshold(f.key, e.target.value)} inputMode="numeric" style={{ ...inputStyle, width: 76 }} />
                  <span style={{ fontFamily: FONT.ui, fontSize: 10.5, color: p.ink3 }}>{f.suffix}</span>
                </div>
                <p style={{ fontFamily: FONT.ui, fontSize: 9.5, color: p.ink3, lineHeight: 1.45, marginTop: 4 }}>{f.hint}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Pricing (risk-based assistant, Brief R) ── */}
        <div style={{ background: p.surface, borderRadius: 12, padding: '14px 18px', boxShadow: p.shadow }}>
          <SectionLabel color={p.ink3}>Pricing · risk-based assistant</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px 22px', marginTop: 10 }}>
            {PRICING_FIELDS.map((f) => (
              <div key={f.key}>
                <label style={{ fontFamily: FONT.ui, fontSize: 11, fontWeight: 700, color: p.ink1, display: 'block', marginBottom: 4 }}>{f.label}</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input value={thresholds[f.key]} onChange={(e) => setThreshold(f.key, e.target.value)} inputMode="numeric" style={{ ...inputStyle, width: 76 }} />
                  <span style={{ fontFamily: FONT.ui, fontSize: 10.5, color: p.ink3 }}>{f.suffix}</span>
                </div>
                <p style={{ fontFamily: FONT.ui, fontSize: 9.5, color: p.ink3, lineHeight: 1.45, marginTop: 4 }}>{f.hint}</p>
              </div>
            ))}
          </div>
          <p style={{ fontFamily: FONT.ui, fontSize: 9.5, color: p.ink3, lineHeight: 1.5, marginTop: 10 }}>
            The assistant suggests a rate that meets your target return, <strong style={{ color: p.ink2 }}>clamped to the tier ladder as a ceiling</strong>  it discounts strong files, it never surcharges past the published rate.
          </p>
        </div>

        {/* ── Product ladder ── */}
        <div style={{ background: p.surface, borderRadius: 12, padding: '14px 18px', boxShadow: p.shadow }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <SectionLabel color={p.ink3}>Product ladder</SectionLabel>
            <p style={{ fontFamily: FONT.ui, fontSize: 9.5, color: p.ink3 }}>
              Tier slots are fixed (emergency · starter · growth · scale)  the coverage gates key on them. Naming is yours.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `0.9fr ${LADDER_COLS.map((c) => c.width).join(' ')} 34px`, gap: '6px 10px', alignItems: 'center', marginTop: 10 }}>
            <span style={{ fontFamily: FONT.ui, fontSize: 9, fontWeight: 700, color: p.ink3, letterSpacing: '0.07em', textTransform: 'uppercase' }}>Slot</span>
            {LADDER_COLS.map((c) => (
              <span key={c.key} style={{ fontFamily: FONT.ui, fontSize: 9, fontWeight: 700, color: p.ink3, letterSpacing: '0.07em', textTransform: 'uppercase' }}>{c.label}</span>
            ))}
            <span />
            {rows.map((r, i) => (
              <React.Fragment key={r.id}>
                <span style={{ fontFamily: FONT.mono, fontSize: 10.5, fontWeight: 600, color: p.accentInk }}>{r.id}</span>
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
          {unusedSlots.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
              <span style={{ fontFamily: FONT.ui, fontSize: 10, color: p.ink3 }}>Add tier:</span>
              {unusedSlots.map((slot) => (
                <button
                  key={slot}
                  onClick={() => {
                    const seed = DEFAULT_PRODUCTS.find((d) => d.id === slot)!;
                    setRows((rs) =>
                      [...rs, toLadderRows([seed])[0]].sort(
                        (a, b) => CANONICAL_TIER_IDS.indexOf(a.id as (typeof CANONICAL_TIER_IDS)[number]) - CANONICAL_TIER_IDS.indexOf(b.id as (typeof CANONICAL_TIER_IDS)[number]),
                      ),
                    );
                  }}
                  style={{ padding: '4px 12px', borderRadius: 7, border: `1.5px solid ${p.accentSoft}`, background: p.accentTint, color: p.accentInk, cursor: 'pointer', fontFamily: FONT.ui, fontSize: 11, fontWeight: 600 }}
                >
                  + {slot}
                </button>
              ))}
            </div>
          )}
          {warnings.map((w, i) => (
            <div key={i} style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: '#fdf3dc', border: '1px solid #f5d990', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ fontFamily: FONT.ui, fontSize: 11, fontWeight: 800, color: p.amber, lineHeight: 1.4 }}>!</span>
              <p style={{ fontFamily: FONT.ui, fontSize: 10.5, color: '#7a5c00', lineHeight: 1.5 }}>{w}</p>
            </div>
          ))}
        </div>

        {/* ── Validation + actions ── */}
        {!validation.ok && (
          <div style={{ background: '#fff6f5', border: `1.5px solid ${p.red}33`, borderRadius: 10, padding: '10px 14px' }}>
            {validation.errors.map((e, i) => (
              <p key={i} style={{ fontFamily: FONT.mono, fontSize: 10.5, color: p.red, lineHeight: 1.7 }}>• {e}</p>
            ))}
          </div>
        )}
        {errors.map((e, i) => (
          <p key={i} style={{ fontFamily: FONT.mono, fontSize: 10.5, color: p.red }}>• {e}</p>
        ))}

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={save}
            disabled={!validation.ok || saving}
            style={{
              padding: '10px 26px',
              borderRadius: 9,
              border: 'none',
              cursor: validation.ok && !saving ? 'pointer' : 'not-allowed',
              background: validation.ok ? p.primary : 'rgba(20,40,30,0.12)',
              color: 'white',
              fontFamily: FONT.ui,
              fontSize: 12.5,
              fontWeight: 700,
            }}
          >
            {saving ? 'Saving…' : 'Save policy'}
          </button>
          <button
            onClick={resetToDefaults}
            style={{ padding: '10px 18px', borderRadius: 9, border: `1.5px solid ${p.hairline}`, background: 'transparent', color: p.ink2, cursor: 'pointer', fontFamily: FONT.ui, fontSize: 12, fontWeight: 600 }}
          >
            Reset to defaults
          </button>
          {savedFlash && (
            <span style={{ fontFamily: FONT.ui, fontSize: 11.5, fontWeight: 700, color: p.primary }}>
              ✓ Saved  decisions and the published directory now use this policy
            </span>
          )}
        </div>

        <p style={{ fontFamily: FONT.ui, fontSize: 9.5, color: p.ink3, lineHeight: 1.55, maxWidth: 720 }}>
          The engine stays deterministic: these numbers parameterize the same auditable rules  nothing here changes how a decision is computed,
          only the thresholds it is computed against. Adverse-action reasons quote the active values automatically.
        </p>
      </div>
    </div>
  );
}
