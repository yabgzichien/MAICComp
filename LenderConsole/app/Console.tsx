'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  ALERT_FACTORS,
  AUDIT_REFER,
  BAND_ORDER,
  FACTOR_LABELS,
  FONT,
  FORENSIC_FLAGS,
  palette,
  SAMPLE_CODE,
  SUSPECT_CODE,
  SUSPECT_HISTOGRAM,
  type Palette,
} from './tokens';
import { type CreditPassport, type VerifyResult, parsePassportCode, verifyPassport } from '../lib/passport';
import { REASON_CATEGORY_LABELS, decideLoan, type LenderPolicy, type LoanDecision, type LoanProduct } from '../lib/loans';
import { DEFAULT_STORED_POLICY, type StoredPolicy } from '../lib/policyStore';
import { priceLoan, repriceProducts, type PricingSuggestion } from '../lib/pricing';
import { structurePool, type CreditBand, type PoolLoan } from '../lib/securitization';
import { SAMPLE_POOL } from '../lib/samplePool';
import { poolStatCells, trancheViews } from '../lib/poolView';
import { bookToPool } from '../lib/portfolio';
import PolicyTab from './PolicyTab';
import PortfolioTab from './PortfolioTab';
import { buildDecisionFile, decisionFileName } from '../lib/decisionFile';
import { caseIdFor, flagTimeLabel } from '../lib/caseRef';
import { runAgentPanel, type StackingSignal } from '../lib/agents';
import { CONSOLE_TOUR_STEPS, clampConsoleTourStep, type ConsoleTourTab } from '../lib/tourSteps';
import { LENDER_REGISTRY, type LenderProfile } from '../lib/lenderRegistry';
import { buildCreditMemo } from '../lib/creditMemo';
import { counterOfferFor } from '../lib/counterOffer';
import { findRecentPresentments, formatAgo, presentmentKey, type Presentment } from '../lib/presentment';
import { readPresentmentLog, recordPresentment } from '../lib/presentmentStore';
import { deriveTrustRows, type TrustRowState } from '../lib/trustPanel';
import {
  fileApplication,
  readApplications,
  recordCheckIn,
  recordLetterGenerated,
  resolveApplication,
  watchlistApplications,
  writeApplications,
  type ApplicationRecord,
  type DeclaredPurpose,
  type FileApplicationInput,
  type PurposeCategory,
} from '../lib/applications';
import { diffCheckIn, monitoringStatus, type EarlyWarningFlag, type MonitoringStatus } from '../lib/earlyWarning';
import { seedApplications } from '../lib/demoSeed';
import { DEMO_APPLICANTS } from './demoApplicants';
import QueueRail from './QueueRail';
import { InfoButton, InfoModal, MiniBar, SectionLabel } from './shared';
import AgentPanel from './AgentPanel';
import CreditMemoModal from './CreditMemo';
import AdverseActionLetterModal from './AdverseActionLetter';
import { buildAdverseActionLetter } from '../lib/adverseAction';
import { BenfordChart, ConfidenceCeilingTick, CoverageStrip, DecisionWaterfall, HeadroomBar, MomentumSpark } from './DecisionViz';

type Tab = 'verify' | 'portfolio' | 'capital' | 'policy';
/** Which pool the Capital Markets tab structures (Brief Q): the synthetic sample or the live approved book. */
type PoolSource = 'sample' | 'live';
const BAND_SEGMENTS = ['#c0392b', '#d98a00', '#3ab07a', '#1f8a5b', '#145c3d'];

/** Signature material + verification outcome kept alongside a verified passport so the
 *  officer can export a self-contained, re-verifiable decision file (retained evidence). */
type Credential = { signature: string; issuerSignature?: string; verification: VerifyResult };

type ViewState =
  | { status: 'valid'; passport: CreditPassport; decision: LoanDecision | null; credential: Credential }
  | { status: 'invalid'; reasons: string[] };

const parseAmount = (s: string): number => Number(s.replace(/[^0-9.]/g, '')) || 0;

function decisionFor(passport: CreditPassport, amountStr: string, stored: StoredPolicy, productsOverride?: LoanProduct[]): LoanDecision | null {
  const a = passport.assessment;
  if (!a) return null;
  return decideLoan({
    score: passport.score,
    confidence: a.confidence,
    avgMonthlySurplus: a.avgMonthlySurplus,
    monthlyDebtService: a.monthlyDebtService,
    avgIncome: a.avgIncome,
    requestedAmount: parseAmount(amountStr),
    products: productsOverride ?? stored.products,
    coverageRatio: a.coverageRatio,
    coverageDaysCovered: a.coverageDays,
    policy: stored.policy,
  });
}

/** Pure: parse + cryptographically verify a pasted code, then run the loan decision
 *  under the lender's stored policy (Brief N). */
function evaluate(code: string, amountStr: string, stored: StoredPolicy): ViewState {
  try {
    const parsed = parsePassportCode(code);
    const res = verifyPassport(parsed.passport, parsed.signature, parsed.issuerSignature);
    if (!res.valid) return { status: 'invalid', reasons: res.reasons };
    return {
      status: 'valid',
      passport: parsed.passport,
      decision: decisionFor(parsed.passport, amountStr, stored),
      credential: { signature: parsed.signature, issuerSignature: parsed.issuerSignature, verification: res },
    };
  } catch (e) {
    return { status: 'invalid', reasons: [e instanceof Error ? e.message : String(e)] };
  }
}

function BrandMark({ p, onRestartTour, activeLender }: { p: Palette; onRestartTour: () => void; activeLender: LenderProfile }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
      <button
        onClick={onRestartTour}
        aria-label="Restart the guided tour"
        title="Restart the guided tour"
        style={{ width: 28, height: 28, borderRadius: 8, background: p.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="8.5" r="4" fill="white" opacity="0.92" />
          <path d="M7 4.5V1.5M5.5 3L7 1.5L8.5 3" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <span style={{ fontFamily: FONT.ui, fontSize: 14, fontWeight: 800, color: p.ink1, whiteSpace: 'nowrap' }}>Pip Credit</span>
      <span style={{ fontSize: 15, color: p.ink3, fontWeight: 300 }}>·</span>
      <span style={{ fontFamily: FONT.ui, fontSize: 12.5, fontWeight: 600, color: p.ink2, whiteSpace: 'nowrap' }}>Lender Console</span>
      <div style={{ marginLeft: 8, padding: '3px 9px 3px 8px', borderRadius: 6, background: activeLender.brandColor, display: 'flex', alignItems: 'center', gap: 5 }}>
        <svg width="9" height="10" viewBox="0 0 10 11" fill="none">
          <path d="M5 1L1 3.5v3.8l4 2.7 4-2.7V3.5L5 1z" fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.55)" strokeWidth="1" />
        </svg>
        <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: 'white', letterSpacing: '0.08em' }}>{activeLender.name.split(' ')[0].toUpperCase()}</span>
      </div>
    </div>
  );
}

/** Single carrier for every "this is mocked" caveat (C4): one chip, one tooltip, instead of a
 *  disclaimer on every card. Inline caveats stay only where a judge must not miss them mid-flow
 *  (issuer signing, eKYC provider). */
const DEMO_MODE_DETAIL =
  'Applications and the presentment log persist in this console’s local store, per-console rather than cross-lender. ' +
  'Bureau/registry checks (CTOS, EPF, SOCSO) and eKYC identity verification are mocked. ' +
  'Loan decisions, fraud checks, and pricing are computed live by the real deterministic engines.';

function DemoModeChip({ p }: { p: Palette }) {
  return (
    <span
      title={DEMO_MODE_DETAIL}
      style={{
        fontFamily: FONT.ui,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.04em',
        color: p.ink2,
        background: p.surface2,
        border: `1px solid ${p.hairline}`,
        borderRadius: 6,
        padding: '3px 9px',
        cursor: 'help',
        flexShrink: 0,
      }}
    >
      DEMO MODE
    </span>
  );
}

function Header({ p, tab, setTab, alert, onRestartTour, activeLender, onSwitchLender }: { p: Palette; tab: Tab; setTab: (t: Tab) => void; alert: boolean; onRestartTour: () => void; activeLender: LenderProfile; onSwitchLender: (id: string) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div style={{ height: 50, background: p.surface, borderBottom: alert ? `2px solid ${p.primary}` : `1px solid ${p.hairline}`, display: 'flex', alignItems: 'center', padding: '0 22px', flexShrink: 0, position: 'relative' }}>
      <BrandMark p={p} onRestartTour={onRestartTour} activeLender={activeLender} />
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <div style={{ display: 'flex', background: p.surface2, borderRadius: 10, padding: 3, gap: 2, border: `1px solid ${p.hairline}` }}>
          {([['verify', 'Verify Passport'], ['portfolio', 'Portfolio'], ['capital', 'Capital Markets'], ['policy', 'Policy']] as [Tab, string][]).map(([key, label]) => {
            const active = key === tab;
            return (
              <button key={key} onClick={() => setTab(key)} style={{ padding: '6px 22px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: FONT.ui, fontSize: 12.5, fontWeight: active ? 700 : 500, background: active ? p.primary : 'transparent', color: active ? 'white' : p.ink2, whiteSpace: 'nowrap' }}>
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0 }}>
        <button
          onClick={onRestartTour}
          style={{ fontFamily: FONT.ui, fontSize: 11, fontWeight: 700, color: p.ink2, background: p.surface2, border: `1px solid ${p.hairline}`, borderRadius: 6, padding: '3px 9px', cursor: 'pointer' }}
        >
          Restart tour
        </button>
        <DemoModeChip p={p} />
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            style={{ display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px 4px', borderRadius: 8 }}
          >
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 600, color: p.ink1, lineHeight: 1 }}>{activeLender.officer}</p>
              <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3, lineHeight: 1.5 }}>Loan Officer · {activeLender.name.split(' ')[0]}</p>
            </div>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: activeLender.brandColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: 'white' }}>{activeLender.officerInitials}</span>
            </div>
            <svg width="9" height="6" viewBox="0 0 9 6" fill="none" style={{ flexShrink: 0 }}>
              <path d="M1 1L4.5 4.5L8 1" stroke={p.ink3} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {menuOpen && (
            <>
              <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
              <div
                role="menu"
                aria-label="Switch lender"
                style={{ position: 'absolute', top: 42, right: 0, width: 260, background: p.surface, borderRadius: 12, border: `1px solid ${p.hairline}`, boxShadow: '0 12px 34px rgba(0,0,0,0.18)', zIndex: 61, overflow: 'hidden' }}
              >
                <p style={{ fontFamily: FONT.ui, fontSize: 11, fontWeight: 700, color: p.ink3, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '10px 14px 6px' }}>Switch lender</p>
                {LENDER_REGISTRY.map((l) => (
                  <button
                    key={l.id}
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onSwitchLender(l.id);
                    }}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '9px 14px', border: 'none', cursor: 'pointer', background: l.id === activeLender.id ? p.accentTint : 'transparent', textAlign: 'left' }}
                  >
                    <div style={{ width: 22, height: 22, borderRadius: 6, background: l.brandColor, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontFamily: FONT.ui, fontSize: 12.5, fontWeight: 700, color: p.ink1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</p>
                      <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3 }}>{l.officer}</p>
                    </div>
                    {l.id === activeLender.id && <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.primary }}>✓</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AlertBanner({ caseId, flagTime }: { caseId: string; flagTime: string }) {
  return (
    <div style={{ background: 'linear-gradient(90deg, #a93226 0%, #c0392b 40%, #a93226 100%)', padding: '0 22px', height: 38, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, animation: 'banner-slide 0.4s ease-out', borderBottom: '2px solid #922b21' }}>
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'white', animation: 'pulse-ring 1.8s ease-out infinite, blink-dot 1.8s ease-in-out infinite' }} />
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 1.5L1 14h14L8 1.5z" fill="rgba(255,255,255,0.22)" stroke="white" strokeWidth="1.3" strokeLinejoin="round" />
        <line x1="8" y1="6" x2="8" y2="10" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="8" cy="12.2" r="0.85" fill="white" />
      </svg>
      <span style={{ fontFamily: FONT.ui, fontSize: 13, fontWeight: 800, color: 'white', letterSpacing: '0.02em' }}>DATA INTEGRITY ALERT  Fabricated data suspected</span>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ padding: '3px 10px', borderRadius: 5, background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.22)' }}>
          <span style={{ fontFamily: FONT.mono, fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>Case #{caseId} · Flagged {flagTime}</span>
        </div>
        <div style={{ padding: '3px 10px', borderRadius: 5, background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.35)' }}>
          <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: 'white' }}>Forensic screening · explainable checks</span>
        </div>
      </div>
    </div>
  );
}

function LeftPanel({
  p,
  flagged,
  statusValid,
  code,
  setCode,
  onVerify,
  onLoadSample,
  onLoadFlagged,
}: {
  p: Palette;
  flagged: boolean;
  statusValid: boolean | null;
  code: string;
  setCode: (s: string) => void;
  onVerify: () => void;
  onLoadSample: () => void;
  onLoadFlagged: () => void;
}) {
  const red = flagged || statusValid === false;
  return (
    <div style={{ width: 336, background: p.surface, borderRight: `1px solid ${p.hairline}`, display: 'flex', flexDirection: 'column', flexShrink: 0, padding: '18px 18px 16px', gap: 13 }}>
      <div>
        <SectionLabel color={p.ink2}>Passport Input</SectionLabel>
        <p style={{ fontFamily: FONT.ui, fontSize: 13, fontWeight: 700, color: p.ink1, marginBottom: 3 }}>Paste passport code</p>
        <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3, lineHeight: 1.5 }}>Generated by the borrower&apos;s Pip Credit app.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <textarea value={code} onChange={(e) => setCode(e.target.value)} rows={7} spellCheck={false} style={{ width: '100%', border: `${red ? 2 : 1.5}px solid ${red ? p.primary : p.primary}`, borderRadius: 9, padding: '10px 12px', fontSize: 12, lineHeight: 1.5, color: p.ink2, background: red ? '#fff8f8' : '#fafcfa', resize: 'none', outline: 'none', fontFamily: FONT.mono, letterSpacing: '0.01em' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 7, background: p.accentTint, border: `1.5px solid ${p.accentSoft}` }}>
          {red ? (
            <>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M6.5 1L1 4v3.6c0 3 2.5 5 5.5 5.4 3-.4 5.5-2.4 5.5-5.4V4L6.5 1z" fill="#fde8e8" stroke={p.primary} strokeWidth="1.1" />
                <path d="M4.5 8.5L8.5 4.5M8.5 8.5L4.5 4.5" stroke={p.primary} strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.accentInk }}>{flagged ? 'Signature mismatch · Integrity breach' : 'Could not verify this passport'}</span>
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 1L1.5 3.5v3.3C1.5 9.5 3.4 11.4 6 12c2.6-.6 4.5-2.5 4.5-5.2V3.5L6 1z" fill={p.accentSoft} stroke={p.primary} strokeWidth="1.1" />
                <path d="M3.8 6.5l1.5 1.5L8.2 5" stroke={p.primary} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 600, color: p.accentInk }}>{statusValid ? 'Ed25519 signature valid · issuer verified' : 'Ready to verify'}</span>
            </>
          )}
        </div>
      </div>

      <button onClick={onVerify} style={{ width: '100%', padding: '11px 0', borderRadius: 10, border: 'none', cursor: 'pointer', background: p.primary, color: 'white', fontFamily: FONT.ui, fontSize: 13.5, fontWeight: 700, boxShadow: `0 4px 14px ${red ? 'rgba(192,57,43,0.35)' : 'rgba(31,138,91,0.28)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
        <svg width="13" height="14" viewBox="0 0 13 14" fill="none">
          <path d="M6.5 1L1.5 3.8V8c0 2.5 2.2 4.2 5 5 2.8-.8 5-2.5 5-5V3.8L6.5 1z" fill="rgba(255,255,255,0.18)" stroke="white" strokeWidth="1.1" />
          <path d="M4.5 7.5l1.5 1.5L9 5.5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {flagged ? 'Re-Verify' : 'Verify'}
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, height: 1, background: p.hairline }} />
        <span style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3 }}>or</span>
        <div style={{ flex: 1, height: 1, background: p.hairline }} />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onLoadSample} style={{ flex: 1, padding: '9px 0', borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${p.hairline}`, background: 'transparent', fontFamily: FONT.ui, fontSize: 12, fontWeight: 600, color: p.ink2 }}>Load sample</button>
        <button onClick={onLoadFlagged} style={{ flex: 1, padding: '9px 0', borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${p.red}33`, background: '#fff6f5', fontFamily: FONT.ui, fontSize: 12, fontWeight: 600, color: p.red }}>Load flagged</button>
      </div>

    </div>
  );
}

function TrustRowIcon({ state, p }: { state: TrustRowState; p: Palette }) {
  const color = state === 'pass' ? p.primary : state === 'warn' ? p.amber : p.red;
  const bg = state === 'pass' ? p.accentSoft : state === 'warn' ? '#fdf3dc' : '#fde8e8';
  return (
    <div style={{ width: 15, height: 15, borderRadius: '50%', background: bg, border: `1px solid ${color}66`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
      <span style={{ fontSize: 12, fontWeight: 800, color, fontFamily: FONT.ui, lineHeight: 1 }}>{state === 'pass' ? '✓' : state === 'warn' ? '!' : '✕'}</span>
    </div>
  );
}

/** Repeat-presentment banner (Brief G)  same visual weight as the integrity alert banner. */
function StackingBanner({ p, priors }: { p: Palette; priors: Presentment[] }) {
  const severe = priors.length >= 3;
  const grad = severe
    ? 'linear-gradient(90deg, #a93226 0%, #c0392b 45%, #a93226 100%)'
    : 'linear-gradient(90deg, #b87000 0%, #d98a00 45%, #b87000 100%)';
  return (
    <div style={{ borderRadius: 12, background: grad, padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: `0 4px 18px ${severe ? 'rgba(192,57,43,0.35)' : 'rgba(217,138,0,0.35)'}`, animation: 'fade-in-up 0.35s ease-out both' }}>
      <div style={{ width: 9, height: 9, borderRadius: '50%', background: 'white', animation: 'blink-dot 1.8s ease-in-out infinite', flexShrink: 0 }} />
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
        <path d="M8 1.5L1 14h14L8 1.5z" fill="rgba(255,255,255,0.22)" stroke="white" strokeWidth="1.3" strokeLinejoin="round" />
        <line x1="8" y1="6" x2="8" y2="10" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="8" cy="12.2" r="0.85" fill="white" />
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: FONT.ui, fontSize: 12.5, fontWeight: 800, color: 'white', letterSpacing: '0.02em' }}>REPEAT PRESENTMENT, possible loan stacking</p>
        <p style={{ fontFamily: FONT.ui, fontSize: 12, color: 'rgba(255,255,255,0.88)', marginTop: 1, lineHeight: 1.45 }}>
          This passport was already verified {priors.length} time{priors.length === 1 ? '' : 's'} in the last 24h at this console. Last {formatAgo(priors[0].at)}. Review before disbursing.
        </p>
      </div>
    </div>
  );
}

function VerifiedCenter({ p, passport, decision, priors, issuerVerified, stacking, lapsedTiers }: { p: Palette; passport: CreditPassport; decision: LoanDecision | null; priors: Presentment[]; issuerVerified: boolean; stacking?: StackingSignal; lapsedTiers?: import('../lib/passport').ConsentTier[] }) {
  const factors = passport.factorSummary;
  const avg = factors.length ? Math.round(factors.reduce((s, f) => s + f.subScore, 0) / factors.length) : 0;
  const confidencePct = passport.assessment ? Math.round(passport.assessment.confidence * 100) : null;
  const activeBand = Math.max(0, BAND_ORDER.indexOf(passport.band));
  const evidenceShort = passport.evidenceHash ? `${passport.evidenceHash.slice(0, 6)}…${passport.evidenceHash.slice(-6)}` : '';
  const trustRows = deriveTrustRows({ passport, holderVerified: true, issuerVerified, priorPresentments: priors, lapsedTiers });
  const [info, setInfo] = useState<string | null>(null);
  return (
    <div style={{ flex: 1, background: p.bg, overflowY: 'auto', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 11, minWidth: 360 }}>
      <InfoModal entry={info} onClose={() => setInfo(null)} p={p} />
      {priors.length > 0 && <StackingBanner p={p} priors={priors} />}
      <div style={{ background: p.surface, borderRadius: 12, padding: '14px 16px', boxShadow: p.shadow, animation: 'fade-in-up 0.4s ease-out both' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.primary, boxShadow: `0 0 0 3px ${p.accentSoft}` }} />
            <span style={{ fontFamily: FONT.ui, fontSize: 13, fontWeight: 700, color: p.primary }}>Verified ✓</span>
            <span style={{ fontFamily: FONT.num, fontSize: 12, color: p.ink3 }}>· {passport.holder?.name ?? 'Applicant'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 8, background: p.accentTint, border: `1.5px solid ${p.accentSoft}` }}>
            <svg width="11" height="13" viewBox="0 0 11 13" fill="none">
              <rect x="0.5" y="5.5" width="10" height="7" rx="1.5" fill={p.accentSoft} stroke={p.primary} strokeWidth="1" />
              <path d="M2.5 5.5V3.5a3 3 0 016 0v2" stroke={p.primary} strokeWidth="1.1" strokeLinecap="round" />
            </svg>
            <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.accentInk }}>Privacy Locked. No raw transactions</span>
          </div>
        </div>

        {/* Trust panel (Brief G): five checks answering "can I trust this file?" */}
        <div style={{ marginBottom: 12 }}>
          {trustRows.map((r, i) => (
            <div key={r.key} style={{ display: 'grid', gridTemplateColumns: '15px 118px 1fr', alignItems: 'start', gap: 8, padding: '6px 0', borderTop: i === 0 ? `1px solid ${p.hairline}` : 'none', borderBottom: `1px solid ${p.hairline}` }}>
              <TrustRowIcon state={r.state} p={p} />
              <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.ink1, lineHeight: 1.5 }}>{r.label}</span>
              <span style={{ fontFamily: FONT.ui, fontSize: 12, color: r.state === 'fail' ? p.red : r.state === 'warn' ? '#8a6100' : p.ink2, lineHeight: 1.5 }}>{r.detail}</span>
            </div>
          ))}
          <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3, marginTop: 5, lineHeight: 1.45 }}>
            The stacking check uses this console&apos;s own presentment log; a production deployment shares it across lenders via a registry.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flexShrink: 0 }}>
            <span style={{ fontFamily: FONT.num, fontSize: 56, fontWeight: 700, color: p.ink1, lineHeight: 1, letterSpacing: '-2px' }}>{passport.score}</span>
            <span style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3 }}>300 – 900</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7, flexWrap: 'wrap' }}>
              <div style={{ padding: '3px 11px', borderRadius: 6, background: p.accentSoft }}>
                <span style={{ fontFamily: FONT.ui, fontSize: 12.5, fontWeight: 700, color: p.accentInk }}>{passport.band}</span>
              </div>
              {confidencePct !== null && (
                <div style={{ marginLeft: 'auto', padding: '3px 9px', borderRadius: 6, background: '#eef2ff', border: '1px solid #c7d2ff' }}>
                  <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 600, color: '#3b5bdb' }}>Data confidence {confidencePct}%</span>
                </div>
              )}
            </div>
            <div style={{ position: 'relative', marginTop: passport.assessment ? 14 : 0 }}>
              {passport.assessment && <ConfidenceCeilingTick p={p} confidence={passport.assessment.confidence} />}
              <div style={{ height: 7, borderRadius: 4, overflow: 'hidden', display: 'flex', gap: 2, marginBottom: 4 }}>
                {BAND_SEGMENTS.map((c, i) => (
                  <div key={i} style={{ flex: 1, background: c, opacity: i <= activeBand ? 1 : 0.17, borderRadius: 2 }} />
                ))}
              </div>
              <div style={{ display: 'flex' }}>
                {BAND_ORDER.map((b, i) => (
                  <span key={b} style={{ flex: 1, fontFamily: FONT.ui, fontSize: 12, color: i === activeBand ? p.accentInk : p.ink2, fontWeight: i === activeBand ? 700 : 400, textAlign: 'center' }}>{b}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
        {passport.assessment && (
          <div style={{ marginTop: 12 }}>
            <CoverageStrip p={p} daysCovered={passport.assessment.coverageDays} />
          </div>
        )}
      </div>

      {passport.momentum && passport.momentum.direction !== 'flat' && (() => {
        const m = passport.momentum;
        const up = m.direction === 'rising';
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderRadius: 12, background: up ? p.accentSoft : '#fdecea', border: `1px solid ${up ? p.accentSoft : '#f5c6c2'}` }}>
            <span style={{ fontFamily: FONT.num, fontSize: 22, fontWeight: 700, color: up ? p.primary : p.red, lineHeight: 1 }}>{up ? '↑' : '↓'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontFamily: FONT.ui, fontSize: 12.5, fontWeight: 700, color: up ? p.accentInk : '#922b21' }}>
                Verifiable {up ? 'upward' : 'downward'} trajectory
              </p>
              <p style={{ fontFamily: FONT.num, fontSize: 12, color: p.ink2, marginTop: 1 }}>
                score {m.scoreFrom} → {m.scoreTo} over {m.lookbackDays}d, verified against the signed passport
              </p>
            </div>
            <MomentumSpark p={p} momentum={m} />
          </div>
        );
      })()}

      <div style={{ background: p.surface, borderRadius: 12, overflow: 'hidden', boxShadow: p.shadow }}>
        <div style={{ padding: '8px 16px', background: p.surface2, borderBottom: `1px solid ${p.hairline}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.ink3, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Factor Breakdown · {factors.length} components</span>
          <span style={{ fontFamily: FONT.num, fontSize: 12, color: p.ink3 }}>Avg <strong style={{ color: p.ink1 }}>{avg}</strong> / 100</span>
        </div>
        {factors.map((f, i) => {
          const color = f.subScore >= 70 ? p.primary : f.subScore >= 50 ? p.amber : p.red;
          return (
            <div key={f.key} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 68px', alignItems: 'center', padding: '7px 16px', borderBottom: i < factors.length - 1 ? `1px solid ${p.hairline}` : 'none', background: i % 2 === 0 ? p.surface : 'rgba(238,241,238,0.35)' }}>
              <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 500, color: p.ink1 }}>{FACTOR_LABELS[f.key] ?? f.key}</span>
              <div style={{ paddingRight: 14, display: 'flex', alignItems: 'center' }}>
                <MiniBar pct={f.subScore} color={color} track={p.hairline} />
              </div>
              <span style={{ fontFamily: FONT.num, fontSize: 12.5, fontWeight: 700, color }}>{Math.round(f.subScore)}<span style={{ fontSize: 12, fontWeight: 400, color: p.ink3 }}>/100</span></span>
            </div>
          );
        })}
        <div style={{ padding: '8px 16px', borderTop: `1px solid ${p.hairline}`, background: p.accentTint, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M6 1L1 4v4l5 3 5-3V4L6 1z" fill={p.accentSoft} stroke={p.primary} strokeWidth="1" />
          </svg>
          <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 600, color: p.accentInk }}>Provenance</span>
          {confidencePct !== null && (
            <span
              style={{
                fontFamily: FONT.ui,
                fontSize: 12,
                fontWeight: 700,
                color: confidencePct >= 60 ? p.primary : confidencePct >= 40 ? '#8a6100' : p.red,
                background: confidencePct >= 60 ? p.accentSoft : confidencePct >= 40 ? '#fdf3dc' : '#fde8e8',
                borderRadius: 5,
                padding: '1px 7px',
              }}
            >
              {confidencePct >= 60 ? 'Looks genuine' : confidencePct >= 40 ? 'Some gaps' : 'Flagged for review'}
            </span>
          )}
          <span style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink2, flex: 1, minWidth: 180 }}>{passport.provenanceSummary}</span>
          {evidenceShort && <span style={{ fontFamily: FONT.mono, fontSize: 12, color: p.ink3 }}>SHA-256: {evidenceShort}</span>}
        </div>
      </div>
      {passport.digitHistogram && passport.digitHistogram.length === 9 && (
        <div style={{ background: p.surface, borderRadius: 12, padding: '12px 16px', boxShadow: p.shadow }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
            <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.ink3, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Benford forensic check</span>
            <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 600, color: p.accentInk, background: p.accentTint, border: `1px solid ${p.accentSoft}`, borderRadius: 5, padding: '2px 8px' }}>signed digit counts · no raw transactions</span>
          </div>
          <BenfordChart p={p} histogram={passport.digitHistogram} onInfo={setInfo} />
        </div>
      )}

      <RicherBlocks p={p} passport={passport} />

      {decision ? (
        <AgentPanel p={p} passport={passport} decision={decision} stacking={stacking} />
      ) : (
        <div style={{ background: p.surface, borderRadius: 12, padding: '14px 16px', boxShadow: p.shadow }}>
          <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3, lineHeight: 1.6 }}>
            This passport doesn&apos;t carry an affordability assessment, so the AI Assessment Panel can&apos;t run. Verify a passport issued with assessment data.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Richer passport blocks (Brief P) ────────────────────────────────────────────
// Occupation (Tier 1, self-declared), income quality (Tier 0), and the spending profile
// with the itemised obligations that evidence the DSR figure (Tier 2). Each card renders
// only when its block is present, so a lean or privacy-minimised passport shows fewer cards.

const OBLIGATION_KIND_LABELS: Record<string, string> = {
  rent: 'Rent',
  utilities: 'Utilities',
  installment: 'Installment',
  other: 'Other',
};

function StatTile({ p, label, value, sub }: { p: Palette; label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: p.surface2, borderRadius: 9, padding: '9px 11px', border: `1px solid ${p.hairline}` }}>
      <div style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.ink3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: FONT.num, fontSize: 16, fontWeight: 700, color: p.ink1, marginTop: 3 }}>{value}</div>
      {sub && <div style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3, marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

function BlockCard({ p, title, tier, children }: { p: Palette; title: string; tier: string; children: React.ReactNode }) {
  return (
    <div style={{ background: p.surface, borderRadius: 12, padding: '12px 16px', boxShadow: p.shadow }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9, gap: 8 }}>
        <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.ink3, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{title}</span>
        <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 600, color: p.accentInk, background: p.accentTint, border: `1px solid ${p.accentSoft}`, borderRadius: 5, padding: '2px 8px' }}>{tier}</span>
      </div>
      {children}
    </div>
  );
}

function RicherBlocks({ p, passport }: { p: Palette; passport: CreditPassport }) {
  const rm = (n: number): string => `RM${Math.round(n).toLocaleString('en-MY')}`;
  const pct = (x: number): number => Math.round(x * 100);
  const { occupation, incomeQuality, spendingProfile } = passport;
  if (!occupation && !incomeQuality && !spendingProfile) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      {occupation && (
        <BlockCard p={p} title="Occupation" tier="Tier 1 · self-declared">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: FONT.ui, fontSize: 14, fontWeight: 700, color: p.ink1 }}>{occupation.occupation}</span>
            <span style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3 }}>{occupation.sector}</span>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 600, color: p.ink2, background: p.surface2, border: `1px solid ${p.hairline}`, borderRadius: 6, padding: '3px 9px' }}>
              {occupation.employmentType}
            </span>
            <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 600, color: p.ink2, background: p.surface2, border: `1px solid ${p.hairline}`, borderRadius: 6, padding: '3px 9px' }}>
              {occupation.tenureMonths} months in role
            </span>
          </div>
          <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3, marginTop: 8, lineHeight: 1.45 }}>
            Self-declared context, unverified against any registry — weigh it alongside the verified figures.
          </p>
        </BlockCard>
      )}

      {incomeQuality && (
        <BlockCard p={p} title="Income quality" tier="Tier 0 · aggregate">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(88px, 1fr))', gap: 7 }}>
            <StatTile p={p} label="Variance" value={`${pct(incomeQuality.variationCoefficient)}%`} sub="month-to-month" />
            <StatTile p={p} label="Sources" value={String(incomeQuality.sourceCount)} sub="recurring inflows" />
            <StatTile p={p} label="Regularity" value={`${pct(incomeQuality.regularityRatio)}%`} sub="months w/ income" />
            <StatTile p={p} label="Pattern" value={incomeQuality.seasonal ? 'Seasonal' : 'Steady'} sub={incomeQuality.seasonal ? 'lumpy earner' : 'consistent'} />
          </div>
        </BlockCard>
      )}

      {spendingProfile && (
        <BlockCard p={p} title="Spending profile" tier="Tier 2 · behavioural">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(88px, 1fr))', gap: 7 }}>
            <StatTile p={p} label="Essentials" value={`${pct(spendingProfile.essentialsRatio)}%`} sub="of spend" />
            <StatTile p={p} label="Volatility" value={`${pct(spendingProfile.expenseVolatility)}%`} sub="expense swing" />
            <StatTile p={p} label="Buffer" value={`${Math.round(spendingProfile.bufferDays)}d`} sub="of runway" />
            <StatTile p={p} label="Savings" value={`${pct(spendingProfile.savingsRate)}%`} sub="of income" />
          </div>
          {spendingProfile.obligations.length > 0 && (
            <div style={{ marginTop: 11 }}>
              <div style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.ink3, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
                Recurring obligations behind the DSR
              </div>
              {spendingProfile.obligations.map((o, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 76px 66px', alignItems: 'center', padding: '6px 0', borderTop: `1px solid ${p.hairline}` }}>
                  <span style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink1 }}>{o.label}</span>
                  <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 600, color: p.accentInk }}>{OBLIGATION_KIND_LABELS[o.kind] ?? o.kind}</span>
                  <span style={{ fontFamily: FONT.num, fontSize: 12, fontWeight: 700, color: p.ink1, textAlign: 'right' }}>{rm(o.monthlyAmount)}/mo</span>
                </div>
              ))}
              <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3, marginTop: 7, lineHeight: 1.45 }}>
                The evidenced monthly debt service sums these detected recurring outflows.
              </p>
            </div>
          )}
        </BlockCard>
      )}
    </div>
  );
}

function InvalidCenter({ p, reasons }: { p: Palette; reasons: string[] }) {
  return (
    <div style={{ flex: 1, background: p.bg, overflowY: 'auto', padding: '16px 14px', minWidth: 360 }}>
      <div style={{ background: p.surface, borderRadius: 12, padding: '20px 18px', border: `2px solid ${p.red}`, boxShadow: '0 4px 20px rgba(192,57,43,0.14)', animation: 'fade-in-up 0.35s ease-out both' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M10 2L1 17h18L10 2z" fill="#fde8e8" stroke={p.red} strokeWidth="1.4" strokeLinejoin="round" />
            <line x1="10" y1="8" x2="10" y2="12.5" stroke={p.red} strokeWidth="1.7" strokeLinecap="round" />
            <circle cx="10" cy="15" r="0.9" fill={p.red} />
          </svg>
          <span style={{ fontFamily: FONT.ui, fontSize: 15, fontWeight: 700, color: p.red }}>Could not verify this passport</span>
        </div>
        {reasons.map((r, i) => (
          <p key={i} style={{ fontFamily: FONT.ui, fontSize: 12.5, color: p.ink2, lineHeight: 1.55, marginBottom: 4 }}>• {r}</p>
        ))}
        <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3, lineHeight: 1.55, marginTop: 10 }}>
          Make sure you pasted the <strong>entire</strong> code copied from the borrower&apos;s Pip Credit app (Credit Passport → Share). Or click <strong>Load sample</strong> to see a valid passport.
        </p>
      </div>
    </div>
  );
}

function CenterAlert({ p, flagTime }: { p: Palette; flagTime: string }) {
  return (
    <div style={{ flex: 1, background: p.bg, overflowY: 'auto', padding: '14px 13px', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 360 }}>
      <div style={{ background: p.surface, borderRadius: 12, padding: '14px 16px', border: `2px solid ${p.primary}`, boxShadow: '0 4px 20px rgba(192,57,43,0.18)', animation: 'fade-in-up 0.4s ease-out both' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13, gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.primary, animation: 'blink-dot 1.4s ease-in-out infinite' }} />
            <span style={{ fontFamily: FONT.ui, fontSize: 13, fontWeight: 700, color: p.primary }}>Flagged ✕</span>
            <span style={{ fontFamily: FONT.num, fontSize: 12, color: p.ink3 }}>· {flagTime} · Unknown applicant</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 8, background: p.accentTint, border: `1.5px solid ${p.accentSoft}` }}>
            <svg width="11" height="13" viewBox="0 0 11 13" fill="none">
              <rect x="0.5" y="5.5" width="10" height="7" rx="1.5" fill="#fde8e8" stroke={p.primary} strokeWidth="1" />
              <path d="M2.5 5.5V3.5a3 3 0 016 0v2" stroke={p.primary} strokeWidth="1.1" strokeLinecap="round" />
            </svg>
            <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.accentInk }}>Data Integrity: UNVERIFIED</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <span style={{ fontFamily: FONT.num, fontSize: 56, fontWeight: 700, color: 'rgba(192,57,43,0.20)', lineHeight: 1, letterSpacing: '-2px', textDecoration: 'line-through', textDecorationColor: 'rgba(192,57,43,0.5)' }}>710</span>
            <span style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3 }}>claimed · not verified</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ padding: '5px 14px', borderRadius: 7, background: p.primary }}>
                <span style={{ fontFamily: FONT.num, fontSize: 18, fontWeight: 700, color: 'white' }}>28%</span>
              </div>
              <div>
                <p style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.primary, lineHeight: 1.2 }}>Data Confidence</p>
                <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3, lineHeight: 1.3 }}>Below 50% threshold. Auto-approval blocked</p>
              </div>
            </div>
            <div style={{ height: 7, borderRadius: 4, background: 'rgba(192,57,43,0.10)', overflow: 'hidden', marginBottom: 4 }}>
              <div style={{ height: '100%', width: '28%', background: `linear-gradient(90deg, ${p.primary}, #e74c3c)`, borderRadius: 4 }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: FONT.ui, fontSize: 12, color: p.primary, fontWeight: 700 }}>28% ← here</span>
              <span style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3 }}>50% threshold</span>
              <span style={{ fontFamily: FONT.ui, fontSize: 12, color: p.green }}>100%</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ background: p.surface, borderRadius: 12, overflow: 'hidden', border: `2px solid ${p.primary}`, boxShadow: '0 4px 22px rgba(192,57,43,0.20)' }}>
        <div style={{ padding: '9px 16px', background: 'linear-gradient(90deg, #922b21 0%, #c0392b 100%)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="13" height="14" viewBox="0 0 13 14" fill="none">
              <circle cx="6" cy="6" r="5" fill="rgba(255,255,255,0.15)" stroke="white" strokeWidth="1.1" />
              <line x1="9.5" y1="9.5" x2="12" y2="12" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 800, color: 'white', letterSpacing: '0.04em' }}>DATA FORENSICS</span>
          </div>
          <span style={{ fontFamily: FONT.mono, fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>Benford · provenance · integrity checks</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 100px', padding: '5px 16px', borderBottom: `1px solid ${p.hairline}`, background: '#fff4f4' }}>
          {['Red Flag', 'Finding', 'Severity'].map((h) => (
            <span key={h} style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 600, color: p.ink3, letterSpacing: '0.07em', textTransform: 'uppercase' }}>{h}</span>
          ))}
        </div>
        {FORENSIC_FLAGS.map((f, i) => {
          const sc = f.critical ? p.primary : p.amber;
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 160px 100px', alignItems: 'center', padding: '8px 16px', borderBottom: i < FORENSIC_FLAGS.length - 1 ? `1px solid ${p.hairline}` : 'none', background: i % 2 === 0 ? p.surface : '#fff8f8' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: sc, boxShadow: `0 0 0 2px ${sc}33` }} />
                <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 500, color: p.ink1 }}>{f.label}</span>
              </div>
              <span style={{ fontFamily: FONT.mono, fontSize: 12, fontWeight: 600, color: sc }}>{f.value}</span>
              <div style={{ display: 'inline-flex' }}>
                <div style={{ padding: '3px 9px', borderRadius: 5, background: f.critical ? '#fde8e8' : '#fdf3dc', border: `1px solid ${sc}33` }}>
                  <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: sc }}>{f.sev}</span>
                </div>
              </div>
            </div>
          );
        })}
        <div style={{ padding: '10px 16px 6px', borderTop: `1px solid ${p.hairline}`, background: '#fffafa' }}>
          <BenfordChart p={p} histogram={SUSPECT_HISTOGRAM} tone="alert" />
        </div>
        <div style={{ padding: '7px 16px', background: '#fff0ef', borderTop: `1px solid ${p.hairline}` }}>
          <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3, lineHeight: 1.5 }}>Analysis ran on submitted aggregates  <strong style={{ color: p.accentInk }}>not raw transactions</strong>. Statistical patterns suggest manual fabrication of income figures.</p>
        </div>
      </div>

      <div style={{ background: p.surface, borderRadius: 12, overflow: 'hidden', boxShadow: p.shadow, opacity: 0.55 }}>
        <div style={{ padding: '7px 16px', background: p.surface2, borderBottom: `1px solid ${p.hairline}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.ink3, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Factor Breakdown · Scores invalidated</span>
          <div style={{ padding: '2px 9px', borderRadius: 5, background: p.accentSoft }}>
            <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.accentInk }}>⚠ Untrusted input</span>
          </div>
        </div>
        {ALERT_FACTORS.map((f, i) => (
          <div key={f.label} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 68px', alignItems: 'center', padding: '5px 16px', borderBottom: i < ALERT_FACTORS.length - 1 ? `1px solid ${p.hairline}` : 'none', background: i % 2 === 0 ? p.surface : '#fff8f8' }}>
            <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 500, color: p.ink2 }}>{f.label}</span>
            <div style={{ paddingRight: 14, display: 'flex', alignItems: 'center' }}>
              <MiniBar pct={f.score} color={p.primary} track="rgba(192,57,43,0.10)" />
            </div>
            <span style={{ fontFamily: FONT.num, fontSize: 12, fontWeight: 700, color: p.primary }}>{f.score}<span style={{ fontSize: 12, fontWeight: 400, color: p.ink3 }}>/100</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}

const VERDICT = {
  approve: { label: 'APPROVED', grad: 'linear-gradient(140deg, #1f8a5b 0%, #125438 100%)', shadow: 'rgba(31,138,91,0.38)' },
  refer: { label: 'REFER', grad: 'linear-gradient(140deg, #b87000 0%, #d98a00 50%, #b87000 100%)', shadow: 'rgba(217,138,0,0.40)' },
  decline: { label: 'DECLINED', grad: 'linear-gradient(140deg, #c0392b 0%, #7d241b 100%)', shadow: 'rgba(192,57,43,0.40)' },
} as const;

const PURPOSE_LABELS: Record<PurposeCategory, string> = {
  stock: 'Stock / inventory',
  equipment: 'Equipment',
  'working-capital': 'Working capital',
  emergency: 'Emergency',
  education: 'Education',
  other: 'Other',
};

const APP_STATUS_STYLE: Record<ApplicationRecord['status'], { label: string; color: string; bg: string }> = {
  new: { label: 'New', color: '#3b5bdb', bg: '#eef2ff' },
  referred: { label: 'Referred. Awaiting officer', color: '#8a6100', bg: '#fdf3dc' },
  approved: { label: 'Approved', color: '#1f8a5b', bg: '#e7f4ec' },
  declined: { label: 'Declined', color: '#c0392b', bg: '#fde8e8' },
};

/** The selected application's state + resolution controls (Brief O). The override
 *  matrix is enforced in lib/applications.ts; this card only offers legal moves. */
const MONITORING_LABEL: Record<MonitoringStatus, string> = {
  active: 'Monitoring active',
  expired: 'Monitoring expired',
  'not-granted': 'Monitoring not granted',
};
const MONITORING_COLOR = (p: Palette, s: MonitoringStatus): string => (s === 'active' ? p.primary : s === 'expired' ? p.red : p.ink3);

const FLAG_SEVERITY_COLOR = (p: Palette, severity: 'watch' | 'critical'): string => (severity === 'critical' ? p.red : '#a3791f');

/** Monitoring status + check-in history (Brief S). Only rendered for an approved loan whose
 *  currently-loaded passport lets us read its own consent receipts. */
function MonitoringSection({ p, app, passport }: { p: Palette; app: ApplicationRecord; passport: CreditPassport | null }) {
  if (!passport) return null;
  const status = monitoringStatus(passport);
  const checkIns = app.checkIns ?? [];
  return (
    <div style={{ marginTop: 8, borderTop: `1px solid ${p.hairline}`, paddingTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: MONITORING_COLOR(p, status), display: 'inline-block' }} />
        <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: MONITORING_COLOR(p, status) }}>{MONITORING_LABEL[status]}</span>
        {checkIns.length > 0 && <span style={{ fontFamily: FONT.num, fontSize: 12, color: p.ink3, marginLeft: 'auto' }}>{checkIns.length} check-in(s)</span>}
      </div>
      {checkIns.length === 0 ? (
        <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3, lineHeight: 1.5 }}>
          No check-ins yet. Verifying a fresh passport with this subject records one automatically.
        </p>
      ) : (
        [...checkIns].reverse().map((c, i) => (
          <div key={i} style={{ padding: '5px 0', borderTop: i > 0 ? `1px solid ${p.hairline}` : 'none' }}>
            <p style={{ fontFamily: FONT.mono, fontSize: 12, color: p.ink3 }}>{c.at.slice(0, 16).replace('T', ' ')}</p>
            {c.flags.length === 0 ? (
              <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink2 }}>Clean. No flags</p>
            ) : (
              c.flags.map((f, j) => (
                <p key={j} style={{ fontFamily: FONT.ui, fontSize: 12, color: FLAG_SEVERITY_COLOR(p, f.severity), lineHeight: 1.5 }}>
                  ● {f.evidence}
                </p>
              ))
            )}
          </div>
        ))
      )}
    </div>
  );
}

function ApplicationCard({ p, app, passport, onResolve }: { p: Palette; app: ApplicationRecord; passport?: CreditPassport | null; onResolve: (outcome: 'approved' | 'declined', rationale: string) => void }) {
  const [rationale, setRationale] = useState('');
  const s = APP_STATUS_STYLE[app.status];
  const canResolve = rationale.trim().length > 0;
  const rationaleInput = (
    <input
      value={rationale}
      onChange={(e) => setRationale(e.target.value)}
      maxLength={160}
      placeholder="One-line rationale (required)"
      style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: `1.5px solid ${p.hairline}`, fontSize: 12, color: p.ink1, background: p.surface, outline: 'none', fontFamily: FONT.ui, marginBottom: 6 }}
    />
  );
  return (
    <div style={{ margin: '12px 20px 0', borderRadius: 10, border: `1px solid ${p.hairline}`, background: p.surface2, padding: '10px 12px', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.ink3, letterSpacing: '0.10em', textTransform: 'uppercase' }}>Application</span>
        <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: s.color, background: s.bg, borderRadius: 5, padding: '2px 8px' }}>{s.label}</span>
      </div>
      <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3, marginBottom: 6 }}>
        Filed {formatAgo(app.filedAt)}
        {app.purpose ? ` · purpose: ${PURPOSE_LABELS[app.purpose.category]}${app.purpose.note ? `  “${app.purpose.note}”` : ''} (self-reported)` : ''}
      </p>

      {app.status === 'referred' && (
        <div>
          {rationaleInput}
          <div style={{ display: 'flex', gap: 6 }}>
            <button disabled={!canResolve} onClick={() => onResolve('approved', rationale)} style={{ flex: 1, padding: '7px 0', borderRadius: 7, border: 'none', cursor: canResolve ? 'pointer' : 'not-allowed', background: canResolve ? p.primary : 'rgba(20,40,30,0.12)', color: 'white', fontFamily: FONT.ui, fontSize: 12, fontWeight: 700 }}>Approve</button>
            <button
              disabled={!canResolve}
              onClick={() => {
                if (window.confirm(`Decline this application?\n\nRationale: "${rationale}"\n\nThis is recorded in the append-only audit trail and cannot be undone.`)) onResolve('declined', rationale);
              }}
              style={{ flex: 1, padding: '7px 0', borderRadius: 7, border: `1.5px solid ${canResolve ? p.red : p.hairline}`, cursor: canResolve ? 'pointer' : 'not-allowed', background: 'transparent', color: canResolve ? p.red : p.ink3, fontFamily: FONT.ui, fontSize: 12, fontWeight: 700 }}
            >
              Decline
            </button>
          </div>
        </div>
      )}

      {app.status === 'approved' && (
        <div>
          {rationaleInput}
          <button
            disabled={!canResolve}
            onClick={() => {
              if (window.confirm(`Overturn this approval to a decline?\n\nRationale: "${rationale}"\n\nA decline can never be overturned back to an approval. This is recorded in the append-only audit trail.`)) onResolve('declined', rationale);
            }}
            style={{ width: '100%', padding: '7px 0', borderRadius: 7, border: `1.5px solid ${canResolve ? p.red : p.hairline}`, cursor: canResolve ? 'pointer' : 'not-allowed', background: 'transparent', color: canResolve ? p.red : p.ink3, fontFamily: FONT.ui, fontSize: 12, fontWeight: 700 }}
          >
            Overturn to decline
          </button>
        </div>
      )}

      {app.status === 'declined' && (
        <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3, fontStyle: 'italic', lineHeight: 1.5 }}>
          A decline can never be overturned to an approval. Escalation only, same asymmetry as the agent orchestrator.
        </p>
      )}

      {app.resolution && (
        <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink2, lineHeight: 1.5, marginTop: 6 }}>
          Resolved <strong>{app.resolution.outcome}</strong> by {app.resolution.officer}: “{app.resolution.rationale}”
        </p>
      )}

      {app.status === 'approved' && <MonitoringSection p={p} app={app} passport={passport ?? null} />}

      <div style={{ marginTop: 8, borderTop: `1px solid ${p.hairline}`, paddingTop: 6 }}>
        {app.audit.map((e, i) => (
          <p key={i} style={{ fontFamily: FONT.mono, fontSize: 12, color: p.ink3, lineHeight: 1.6 }}>
            {e.at.slice(0, 16).replace('T', ' ')} · {e.action}{e.detail ? `  ${e.detail}` : ''}
          </p>
        ))}
      </div>
    </div>
  );
}

/** Risk-based pricing strip (Brief R): ladder rate vs the suggested rate, net margin at
 *  each, and an Adopt action. The suggestion only ever discounts (clamped to the ladder). */
function PricingStrip({ p, pricing, adopted, onAdopt }: { p: Palette; pricing: PricingSuggestion; adopted: number | null; onAdopt?: (rate: number) => void }) {
  const asPct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const hasDiscount = pricing.discountBps > 0;
  const isAdopted = adopted !== null;
  const RateCol = ({ title, rate, margin, highlight }: { title: string; rate: number; margin: number; highlight?: boolean }) => (
    <div style={{ flex: 1, padding: '8px 12px', borderRadius: 8, background: highlight ? p.accentTint : p.surface2, border: `1px solid ${highlight ? p.accentSoft : p.hairline}` }}>
      <p style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.ink3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{title}</p>
      <p style={{ fontFamily: FONT.num, fontSize: 20, fontWeight: 700, color: highlight ? p.accentInk : p.ink1, lineHeight: 1.2 }}>{asPct(rate)}</p>
      <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3 }}>net margin {asPct(margin)}</p>
    </div>
  );
  return (
    <div style={{ padding: '14px 20px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.ink3, letterSpacing: '0.10em', textTransform: 'uppercase' }}>Risk-based pricing</span>
        {hasDiscount && <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.accentInk, background: p.accentSoft, borderRadius: 5, padding: '2px 8px' }}>−{pricing.discountBps} bps for a lower-risk file</span>}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <RateCol title="Ladder rate" rate={pricing.ladderApr} margin={pricing.ladder.netMargin} highlight={!isAdopted && !hasDiscount} />
        <RateCol title={hasDiscount ? 'Suggested rate' : 'Suggested = ladder'} rate={pricing.suggestedRate} margin={pricing.suggested.netMargin} highlight={hasDiscount} />
      </div>
      {onAdopt && hasDiscount && (
        <button
          onClick={() => onAdopt(pricing.suggestedRate)}
          disabled={isAdopted}
          style={{ width: '100%', marginTop: 8, padding: '8px 0', borderRadius: 8, border: `1.5px solid ${p.primary}`, cursor: isAdopted ? 'default' : 'pointer', background: isAdopted ? p.accentSoft : 'transparent', color: isAdopted ? p.accentInk : p.primary, fontFamily: FONT.ui, fontSize: 12, fontWeight: 700 }}
        >
          {isAdopted ? `✓ Custom-priced at ${asPct(adopted!)}  re-checked for affordability` : `Adopt ${asPct(pricing.suggestedRate)}  re-prices the installment`}
        </button>
      )}
      <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3, marginTop: 5, lineHeight: 1.5 }}>{pricing.reasons[pricing.reasons.length - 1]}</p>
    </div>
  );
}

function RightDecision({ p, passport, decision, credential, amount, setAmount, onAssess, onCounterOffer, isCounterOffer, stacking, selectedApp, onResolve, onGenerateLetter, purpose, setPurpose, policy, policyUpdatedAt, pricing, adoptedRate, onAdoptRate, lenderName }: { p: Palette; passport: CreditPassport | null; decision: LoanDecision | null; credential: Credential | null; amount: string; setAmount: (s: string) => void; onAssess: () => void; onCounterOffer?: (counterAmount: number) => void; isCounterOffer?: boolean; stacking?: StackingSignal; selectedApp?: ApplicationRecord | null; onResolve?: (outcome: 'approved' | 'declined', rationale: string) => void; onGenerateLetter?: () => void; purpose?: DeclaredPurpose | null; setPurpose?: (p: DeclaredPurpose | null) => void; policy?: LenderPolicy; policyUpdatedAt?: string; pricing?: PricingSuggestion | null; adoptedRate?: number | null; onAdoptRate?: (rate: number) => void; lenderName: string }) {
  const [memoOpen, setMemoOpen] = useState(false);
  const [letterOpen, setLetterOpen] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const letterAvailable = passport && decision ? buildAdverseActionLetter(passport, decision, parseAmount(amount)) !== null : false;

  /** Wayfinding (P2.10): after re-Assess, the new verdict always renders right below the
   *  amount field  scroll back to it in case the officer had scrolled down to read a prior
   *  audit trail. */
  function handleAssess() {
    onAssess();
    panelRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }
  // The pricing note for the memo/decision-file: ladder rate + the rate actually in force.
  const memoPricing = pricing ? { ladderApr: pricing.ladderApr, adoptedApr: adoptedRate ?? pricing.ladderApr, reasons: pricing.reasons } : null;

  function downloadDecisionFile() {
    if (!passport || !decision || !credential) return;
    const requestedAmount = parseAmount(amount);
    const memo = buildCreditMemo(passport, decision, runAgentPanel(passport, decision, stacking), requestedAmount, selectedApp?.resolution, policy, memoPricing);
    const file = buildDecisionFile({
      passport,
      signature: credential.signature,
      issuerSignature: credential.issuerSignature,
      verification: credential.verification,
      decision,
      requestedAmount,
      memo,
    });
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = decisionFileName(passport, file.generatedAt);
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div ref={panelRef} style={{ width: 340, background: p.surface, borderLeft: `1px solid ${p.hairline}`, display: 'flex', flexDirection: 'column', flexShrink: 0, overflowY: 'auto' }}>
      <InfoModal entry={info} onClose={() => setInfo(null)} p={p} />
      <div style={{ padding: '14px 20px 11px', borderBottom: `1px solid ${p.hairline}`, flexShrink: 0 }}>
        <SectionLabel color={p.ink2}>Loan Decision Engine</SectionLabel>
        <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3 }}>Deterministic · policy-enforced · audit-ready</p>
        {/* Which policy produced this verdict (Brief N)  an officer always knows. */}
        <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3, marginTop: 3 }}>
          Evaluated under <strong style={{ color: p.ink2 }}>{lenderName} policy</strong>
          {policyUpdatedAt ? ` · last updated ${new Date(policyUpdatedAt).toLocaleDateString('en-MY')}` : ' · defaults'}
        </p>
      </div>

      <div style={{ padding: '14px 20px 0', flexShrink: 0 }}>
        <label style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 600, color: p.ink2, display: 'block', marginBottom: 6 }}>Requested amount (RM)</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', fontFamily: FONT.num, fontSize: 12, fontWeight: 600, color: p.ink3, pointerEvents: 'none' }}>RM</span>
            <input type="text" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAssess()} style={{ width: '100%', padding: '9px 12px 9px 33px', borderRadius: 8, border: `1.5px solid ${p.hairline}`, fontSize: 14.5, fontWeight: 700, color: p.ink1, background: p.surface2, outline: 'none', fontFamily: FONT.num }} />
          </div>
          <button onClick={handleAssess} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', background: p.primary, color: 'white', fontFamily: FONT.ui, fontSize: 12.5, fontWeight: 700, flexShrink: 0 }}>Assess</button>
        </div>
        {setPurpose && (
          <div style={{ marginTop: 8 }}>
            <label style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 600, color: p.ink3, display: 'block', marginBottom: 4 }}>Declared purpose, as stated by the applicant · never a scoring input</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <select
                value={purpose?.category ?? ''}
                onChange={(e) => {
                  const cat = e.target.value as PurposeCategory | '';
                  setPurpose(cat ? { category: cat, ...(purpose?.note ? { note: purpose.note } : {}) } : null);
                }}
                style={{ flex: 1, padding: '6px 8px', borderRadius: 7, border: `1.5px solid ${p.hairline}`, fontSize: 12, color: p.ink1, background: p.surface2, fontFamily: FONT.ui, outline: 'none' }}
              >
                <option value=""> not stated </option>
                {(Object.keys(PURPOSE_LABELS) as PurposeCategory[]).map((c) => (
                  <option key={c} value={c}>{PURPOSE_LABELS[c]}</option>
                ))}
              </select>
              <input
                type="text"
                value={purpose?.note ?? ''}
                maxLength={140}
                placeholder="optional note"
                disabled={!purpose}
                onChange={(e) => purpose && setPurpose({ category: purpose.category, ...(e.target.value ? { note: e.target.value } : {}) })}
                style={{ flex: 1, padding: '6px 8px', borderRadius: 7, border: `1.5px solid ${p.hairline}`, fontSize: 12, color: p.ink1, background: purpose ? p.surface2 : 'rgba(20,40,30,0.04)', fontFamily: FONT.ui, outline: 'none' }}
              />
            </div>
          </div>
        )}
      </div>

      {selectedApp && onResolve && <ApplicationCard p={p} app={selectedApp} passport={passport} onResolve={onResolve} />}

      {decision ? (
        <>
          <div key={decision.decision} style={{ margin: '14px 20px 0', borderRadius: 14, background: VERDICT[decision.decision].grad, padding: '16px 18px', boxShadow: `0 8px 28px ${VERDICT[decision.decision].shadow}`, position: 'relative', overflow: 'hidden', animation: 'fade-in-up 0.35s ease-out both', flexShrink: 0 }}>
            <div style={{ position: 'absolute', top: -24, right: -20, width: 90, height: 90, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, position: 'relative' }}>
              <div style={{ padding: '4px 12px', borderRadius: 6, background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.30)' }}>
                <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 800, color: 'white', letterSpacing: '0.12em' }}>{VERDICT[decision.decision].label}</span>
              </div>
            </div>
            {decision.maxAmount > 0 ? (
              <>
                <div style={{ marginBottom: 10, position: 'relative' }}>
                  <span style={{ fontFamily: FONT.num, fontSize: 42, fontWeight: 700, color: 'white', lineHeight: 1, letterSpacing: '-1.5px' }}>RM{Math.round(decision.maxAmount).toLocaleString('en-MY')}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', position: 'relative' }}>
                  <div style={{ padding: '4px 11px', borderRadius: 6, background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.22)' }}>
                    <span style={{ fontFamily: FONT.num, fontSize: 13, fontWeight: 600, color: 'white' }}>RM{Math.round(decision.installment).toLocaleString('en-MY')}/mo</span>
                  </div>
                  <span style={{ fontFamily: FONT.ui, fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>{decision.decision === 'refer' ? 'pending manual review' : 'estimated installment'}</span>
                </div>
              </>
            ) : (
              <p style={{ fontFamily: FONT.ui, fontSize: 18, fontWeight: 800, color: 'white', lineHeight: 1.25, position: 'relative' }}>No offer at this amount</p>
            )}
          </div>

          {/* Counter-offer strip (Brief L): show when the engine found a positive supportable amount below the request. */}
          {(() => {
            const requestedAmount = parseAmount(amount);
            const co = decision && counterOfferFor(decision, requestedAmount);
            if (!co) return null;
            return (
              <div style={{ margin: '10px 20px 0', borderRadius: 10, border: `1.5px solid ${p.primary}`, background: p.accentTint, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <path d="M6.5 1.5v4l2.5 1.5" stroke={p.primary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="6.5" cy="6.5" r="5.5" stroke={p.primary} strokeWidth="1.3" />
                  </svg>
                  <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.accentInk, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Counter-offer available</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontFamily: FONT.num, fontSize: 22, fontWeight: 700, color: p.ink1, letterSpacing: '-0.5px' }}>RM{Math.round(co.amount).toLocaleString('en-MY')}</span>
                  <span style={{ fontFamily: FONT.num, fontSize: 12, fontWeight: 600, color: p.ink2 }}>RM{Math.round(co.installment).toLocaleString('en-MY')}/mo</span>
                </div>
                <p style={{ fontFamily: FONT.mono, fontSize: 12, color: p.ink2, lineHeight: 1.5, margin: 0 }}>{co.constraint.length > 120 ? co.constraint.slice(0, 117) + '…' : co.constraint}</p>
                <button
                  onClick={() => onCounterOffer?.(co.amount)}
                  style={{ alignSelf: 'flex-start', padding: '7px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', background: p.primary, color: 'white', fontFamily: FONT.ui, fontSize: 12, fontWeight: 700 }}
                >
                  Assess at this amount
                </button>
              </div>
            );
          })()}

          {/* Counter-offer result badge: shown when the current decision was triggered by a counter-offer action. */}
          {isCounterOffer && decision && decision.maxAmount > 0 && (
            <div style={{ margin: '6px 20px 0', borderRadius: 7, background: p.accentSoft, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M2 5.5l2.5 2.5L9 3" stroke={p.primary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.accentInk }}>Counter-offer assessment</span>
            </div>
          )}

          {passport?.assessment && (
            <div style={{ flexShrink: 0 }}>
              <HeadroomBar p={p} assessment={passport.assessment} installment={decision.installment} policy={policy} onInfo={setInfo} />
            </div>
          )}
          {decision.breakdown && (
            <div style={{ flexShrink: 0 }}>
              <DecisionWaterfall p={p} breakdown={decision.breakdown} policy={policy} />
            </div>
          )}
          {pricing && (
            <div style={{ flexShrink: 0 }}>
              <PricingStrip p={p} pricing={pricing} adopted={adoptedRate ?? null} onAdopt={onAdoptRate} />
            </div>
          )}

          <div style={{ padding: '14px 20px 0', flexShrink: 0 }}>
            <SectionLabel color={p.ink2}>Audit Trail</SectionLabel>
            {/* Grouped by adverse-action category (Brief J); flat fallback for pre-category decisions. */}
            {decision.categorizedReasons && decision.categorizedReasons.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
                {(['affordability', 'data-quality', 'integrity', 'record', 'policy'] as const)
                  .map((cat) => ({ cat, rows: decision.categorizedReasons!.filter((r) => r.category === cat) }))
                  .filter((g) => g.rows.length > 0)
                  .map((g, gi, groups) => {
                    const offset = groups.slice(0, gi).reduce((s, x) => s + x.rows.length, 0);
                    return (
                      <div key={g.cat}>
                        <p style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.ink3, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 5 }}>
                          {REASON_CATEGORY_LABELS[g.cat]}
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                          {g.rows.map((r, i) => (
                            <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                              <span style={{ fontFamily: FONT.mono, fontSize: 12, fontWeight: 600, color: p.primary, lineHeight: 1.6, minWidth: 20, textAlign: 'right', flexShrink: 0 }}>{String(offset + i + 1).padStart(2, '0')}</span>
                              <div style={{ width: 1, background: p.accentSoft, alignSelf: 'stretch', marginTop: 3 }} />
                              <p style={{ fontFamily: FONT.mono, fontSize: 12, lineHeight: 1.55, color: p.ink1 }}>{r.text}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                {decision.reasons.map((reason, i) => (
                  <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                    <span style={{ fontFamily: FONT.mono, fontSize: 12, fontWeight: 600, color: p.primary, lineHeight: 1.6, minWidth: 20, textAlign: 'right', flexShrink: 0 }}>{String(i + 1).padStart(2, '0')}</span>
                    <div style={{ width: 1, background: p.accentSoft, alignSelf: 'stretch', marginTop: 3 }} />
                    <p style={{ fontFamily: FONT.mono, fontSize: 12, lineHeight: 1.55, color: p.ink1 }}>{reason}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {passport && (
            <div style={{ padding: '12px 20px 0', flexShrink: 0 }}>
              <button
                onClick={() => setMemoOpen(true)}
                style={{ width: '100%', padding: '10px 0', borderRadius: 9, border: `1.5px solid ${p.primary}`, cursor: 'pointer', background: 'transparent', color: p.primary, fontFamily: FONT.ui, fontSize: 12.5, fontWeight: 700 }}
              >
                Generate audit memo
              </button>
            </div>
          )}

          {passport && credential && (
            <div style={{ padding: '8px 20px 0', flexShrink: 0 }}>
              <button
                onClick={downloadDecisionFile}
                title="Self-contained evidence bundle: signed passport, verification result, decision + reasons, and the memo. Independently re-verifiable."
                style={{ width: '100%', padding: '10px 0', borderRadius: 9, border: `1.5px solid ${p.hairline}`, cursor: 'pointer', background: 'transparent', color: p.ink2, fontFamily: FONT.ui, fontSize: 12.5, fontWeight: 700 }}
              >
                Download decision file
              </button>
            </div>
          )}

          {letterAvailable && (
            <div style={{ padding: '8px 20px 0', flexShrink: 0 }}>
              <button
                onClick={() => {
                  onGenerateLetter?.();
                  setLetterOpen(true);
                }}
                title="Borrower-facing adverse-action letter: decision, reasons in plain language, data relied on, and how to strengthen a future application."
                style={{ width: '100%', padding: '10px 0', borderRadius: 9, border: `1.5px solid ${p.hairline}`, cursor: 'pointer', background: 'transparent', color: p.ink2, fontFamily: FONT.ui, fontSize: 12.5, fontWeight: 700 }}
              >
                Generate adverse-action letter
              </button>
            </div>
          )}
        </>
      ) : (
        <div style={{ padding: '20px', flex: 1 }}>
          <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3, lineHeight: 1.6 }}>This passport doesn&apos;t carry an affordability assessment, so no automated decision can be run. Verify a passport issued with assessment data.</p>
        </div>
      )}

      {memoOpen && passport && decision && (
        <CreditMemoModal p={p} passport={passport} decision={decision} requestedAmount={parseAmount(amount)} stacking={stacking} resolution={selectedApp?.resolution} policy={policy} pricing={memoPricing} onClose={() => setMemoOpen(false)} />
      )}

      {letterOpen && passport && decision && (
        <AdverseActionLetterModal p={p} passport={passport} decision={decision} requestedAmount={parseAmount(amount)} onClose={() => setLetterOpen(false)} />
      )}

      <div style={{ padding: '12px 20px 15px', borderTop: `1px solid ${p.hairline}`, marginTop: 'auto' }}>
        <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3, lineHeight: 1.55 }}>Decision is deterministic and auditable under the <strong style={{ color: p.ink2 }}>Consumer Credit Act 2025</strong>.</p>
      </div>
    </div>
  );
}

function RightAlert({ p }: { p: Palette }) {
  return (
    <div style={{ width: 340, background: p.surface, borderLeft: `1px solid ${p.hairline}`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <div style={{ padding: '14px 20px 11px', borderBottom: `1px solid ${p.hairline}` }}>
        <SectionLabel color={p.ink2}>Loan Decision Engine</SectionLabel>
        <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3 }}>Deterministic · policy-enforced · audit-ready</p>
      </div>
      <div style={{ padding: '14px 20px 0' }}>
        <label style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 600, color: p.ink2, display: 'block', marginBottom: 6 }}>Requested amount (RM)</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', fontFamily: FONT.num, fontSize: 12, fontWeight: 600, color: p.ink3, pointerEvents: 'none' }}>RM</span>
            <input type="text" value="10,000" readOnly style={{ width: '100%', padding: '9px 12px 9px 33px', borderRadius: 8, border: `1.5px solid ${p.hairline}`, fontSize: 14.5, fontWeight: 700, color: p.ink2, background: '#fff8f8', outline: 'none', fontFamily: FONT.num }} />
          </div>
          <button style={{ padding: '9px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', background: p.ink3, color: 'white', fontFamily: FONT.ui, fontSize: 12.5, fontWeight: 700, flexShrink: 0 }}>Assess</button>
        </div>
      </div>
      <div key="refer" style={{ margin: '14px 20px 0', borderRadius: 14, background: 'linear-gradient(140deg, #b87000 0%, #d98a00 50%, #b87000 100%)', padding: '16px 18px', boxShadow: '0 8px 28px rgba(217,138,0,0.40)', position: 'relative', overflow: 'hidden', animation: 'fade-in-up 0.35s ease-out both' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <div style={{ padding: '4px 12px', borderRadius: 6, background: 'rgba(0,0,0,0.18)', border: '1px solid rgba(255,255,255,0.25)' }}>
            <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 800, color: 'white', letterSpacing: '0.14em' }}>REFER</span>
          </div>
        </div>
        <p style={{ fontFamily: FONT.ui, fontSize: 20, fontWeight: 800, color: 'white', lineHeight: 1.2, marginBottom: 10 }}>Manual review required</p>
        <div style={{ padding: '5px 12px', borderRadius: 7, background: 'rgba(0,0,0,0.18)', border: '1px solid rgba(255,255,255,0.20)', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>Auto-approval blocked · escalated</span>
        </div>
      </div>
      <div style={{ padding: '14px 20px 0', flex: 1 }}>
        <SectionLabel color={p.ink2}>Audit Trail</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 8 }}>
          {AUDIT_REFER.map((reason, i) => (
            <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
              <span style={{ fontFamily: FONT.mono, fontSize: 12, fontWeight: 600, color: p.amber, lineHeight: 1.6, minWidth: 20, textAlign: 'right', flexShrink: 0 }}>{String(i + 1).padStart(2, '0')}</span>
              <div style={{ width: 1, background: '#f5d990', alignSelf: 'stretch', marginTop: 3 }} />
              <p style={{ fontFamily: FONT.mono, fontSize: 12, lineHeight: 1.55, color: p.ink1 }}>{reason}</p>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: 9, background: '#fffcf2', border: '1px solid #f5d990' }}>
          <p style={{ fontFamily: FONT.ui, fontSize: 12, color: '#7a5c00', lineHeight: 1.6, fontStyle: 'italic' }}>A hard adverse record would auto-decline; suspected fabrication routes to a human.</p>
        </div>
      </div>
    </div>
  );
}

function CapitalMarkets({ p, book, source, setSource }: { p: Palette; book: PoolLoan[]; source: PoolSource; setSource: (s: PoolSource) => void }) {
  const [info, setInfo] = useState<string | null>(null);
  // Empty book can't structure, so it always falls back to the sample (labeled).
  const effectiveSource: PoolSource = source === 'live' && book.length === 0 ? 'sample' : source;
  const pool = effectiveSource === 'live' ? book : SAMPLE_POOL;
  const result = useMemo(() => structurePool(pool), [pool]);
  const stats = poolStatCells(result.summary);
  const tranches = trancheViews(result);
  const isSample = effectiveSource === 'sample';

  return (
    <div style={{ flex: 1, background: p.bg, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      <InfoModal entry={info} onClose={() => setInfo(null)} p={p} />
      <div style={{ padding: '20px 40px 18px', background: p.surface, borderBottom: `1px solid ${p.hairline}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <div>
            <SectionLabel color={p.ink2}>Capital Markets · Pool Structure</SectionLabel>
            <h2 style={{ fontFamily: FONT.ui, fontSize: 22, fontWeight: 800, color: p.ink1, letterSpacing: '-0.4px', marginTop: 4, marginBottom: 5 }}>AI-Structured Micro-Sukuk</h2>
            <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3 }}>Tranched by deterministic loss-waterfall · Shariah-compliant profit-sharing</p>
          </div>
          {/* Source toggle (Brief Q): the same engine over the sample pool or the live approved book. */}
          <div style={{ display: 'flex', background: p.surface2, borderRadius: 9, padding: 3, gap: 2, border: `1px solid ${p.hairline}` }}>
            {([['live', book.length > 0 ? `Live book · ${book.length}` : 'Live book'], ['sample', 'Sample pool']] as [PoolSource, string][]).map(([key, label]) => {
              const active = effectiveSource === key;
              const disabled = key === 'live' && book.length === 0;
              return (
                <button
                  key={key}
                  onClick={() => !disabled && setSource(key)}
                  title={disabled ? 'Approve loans in the pipeline to build a live book' : undefined}
                  style={{ padding: '6px 16px', borderRadius: 7, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: FONT.ui, fontSize: 12, fontWeight: active ? 700 : 500, background: active ? p.primary : 'transparent', color: active ? 'white' : disabled ? p.ink3 : p.ink2, opacity: disabled ? 0.5 : 1 }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ marginTop: 10, padding: '6px 12px', borderRadius: 7, background: isSample ? '#fdf3dc' : p.accentTint, border: `1px solid ${isSample ? '#f5d990' : p.accentSoft}`, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: isSample ? p.amber : p.primary }} />
          <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 600, color: isSample ? '#7a5c00' : p.accentInk }}>
            {isSample
              ? source === 'live'
                ? 'No approved loans yet. Showing the illustrative sample pool (1,000 loans).'
                : 'Illustrative sample pool: 1,000 synthetic micro-loans.'
              : 'Live book. Structured from the loans you approved in the pipeline.'}
          </span>
        </div>
      </div>

      <div style={{ background: 'linear-gradient(135deg, #0e1812 0%, #17211a 100%)', padding: '22px 40px', display: 'flex', alignItems: 'stretch', flexShrink: 0, flexWrap: 'wrap', gap: 16 }}>
        {stats.map((s, i) => (
          <React.Fragment key={s.label}>
            <div style={{ flex: 1, minWidth: 120, display: 'flex', flexDirection: 'column', gap: 7 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: FONT.ui, fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.38)', letterSpacing: '0.10em', textTransform: 'uppercase' }}>
                {s.label}
                <InfoButton entry={s.info} onOpen={setInfo} dark />
              </span>
              <span style={{ fontFamily: FONT.num, fontSize: 30, fontWeight: 700, color: 'white', letterSpacing: '-0.5px', lineHeight: 1 }}>{s.value}</span>
            </div>
            {i < stats.length - 1 && <div style={{ width: 1, background: 'rgba(255,255,255,0.08)' }} />}
          </React.Fragment>
        ))}
      </div>

      <div style={{ padding: '22px 40px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 10 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <SectionLabel color={p.ink2}>Loss-Waterfall Structure</SectionLabel>
            <span style={{ marginBottom: 3 }}><InfoButton entry="waterfall" onOpen={setInfo} /></span>
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            {tranches.map((tr) => (
              <div key={tr.seat} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: tr.color }} />
                <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 500, color: p.ink2 }}>{tr.seat} {tr.pct}%</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ height: 32, borderRadius: 8, overflow: 'hidden', display: 'flex', gap: 2, boxShadow: '0 4px 14px rgba(16,32,24,0.14)' }}>
          {tranches.map((tr) => (
            <div key={tr.seat} style={{ width: `${tr.pct}%`, background: tr.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: FONT.num, fontSize: 12, fontWeight: 700, color: 'white' }}>{tr.pct}%</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          <span style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3 }}>← Senior absorbs losses last (safest)</span>
          <span style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3 }}>(highest risk) Subordinated absorbs losses first →</span>
        </div>
      </div>

      <div style={{ padding: '18px 40px 0', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, flexShrink: 0 }}>
        {tranches.map((tr, i) => (
          <div key={tr.seat} style={{ background: tr.tint, borderRadius: 14, border: `1.5px solid ${tr.border}`, padding: '18px 20px', boxShadow: p.shadow, display: 'flex', flexDirection: 'column', gap: 12, animation: 'fade-in-up 0.4s ease-out both', animationDelay: `${i * 70}ms` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: tr.color, letterSpacing: '0.10em', textTransform: 'uppercase' }}>{tr.name}</span>
                <InfoButton entry={tr.seat.toLowerCase()} onOpen={setInfo} color={tr.color} />
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ padding: '4px 12px', borderRadius: 7, background: tr.ratingBg, border: `1.5px solid ${tr.ratingColor}33` }}>
                  <span style={{ fontFamily: FONT.num, fontSize: 15, fontWeight: 700, color: tr.ratingColor }}>{tr.rating}</span>
                </div>
                <InfoButton entry="rating" onOpen={setInfo} color={tr.ratingColor} />
              </span>
            </div>
            <div style={{ height: 1, background: tr.border }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
              <div>
                <p style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: FONT.ui, fontSize: 12, color: p.ink3, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>
                  Size <InfoButton entry="size" onOpen={setInfo} />
                </p>
                <p style={{ fontFamily: FONT.num, fontSize: 17, fontWeight: 700, color: p.ink1 }}>{tr.size}</p>
              </div>
              <div>
                <p style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: FONT.ui, fontSize: 12, color: p.ink3, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>
                  Slice <InfoButton entry="slice" onOpen={setInfo} />
                </p>
                <p style={{ fontFamily: FONT.num, fontSize: 17, fontWeight: 700, color: tr.color }}>{tr.pct}%</p>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <p style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: FONT.ui, fontSize: 12, color: p.ink3, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>
                  Profit rate p.a. <InfoButton entry="profit_rate" onOpen={setInfo} />
                </p>
                <p style={{ fontFamily: FONT.num, fontSize: 26, fontWeight: 700, color: tr.color, lineHeight: 1 }}>{tr.profit}</p>
              </div>
            </div>
            <div style={{ padding: '8px 11px', borderRadius: 7, background: 'rgba(255,255,255,0.65)', border: `1px solid ${tr.border}` }}>
              <p style={{ fontFamily: FONT.mono, fontSize: 12, color: p.ink2, lineHeight: 1.55 }}>{tr.reason}</p>
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: '16px 40px 24px', marginTop: 'auto' }}>
        <div style={{ padding: '11px 18px', borderRadius: 10, background: p.surface, border: `1px solid ${p.hairline}`, boxShadow: p.shadow }}>
          <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3, lineHeight: 1.6 }}>Ratings computed deterministically from pool expected loss. <strong style={{ color: p.ink2 }}>A weaker pool gets a lower rating.</strong></p>
        </div>
      </div>
    </div>
  );
}

// ── Judge tour card (Brief M) ───────────────────────────────────────────────
// A small dismissible guided orientation on load. Boot stays pre-verified on the
// sample (the ideal first minute)  this card just narrates what's already on screen.
const TOUR_DISMISSED_KEY = 'pip-console-tour-dismissed';
const TOUR_STEP_KEY = 'pip-console-tour-step';
// Active lender persona (Lender Tenancy spec, 2026-07-12): persisted so a refresh stays
// "signed in" as the chosen lender, same storage pattern as the tour dismissal above.
const ACTIVE_LENDER_KEY = 'pip-console-active-lender';
const DEFAULT_LENDER_ID = 'tekun';
/** Console judge tour (Judge Tour spec, 2026-07-12)  the Brief-M static tip list upgraded
 *  to the same step-card wizard as the borrower app. Non-modal: it never traps focus or
 *  blocks the console underneath. `onTab` switches the console's real tab state; the wizard
 *  drives navigation, it never performs the officer's actions (assess, load flagged, open
 *  memo) on their behalf. */
function TourCard({
  p,
  stepIndex,
  onTab,
  onNext,
  onBack,
  onExit,
}: {
  p: Palette;
  stepIndex: number;
  onTab: (tab: ConsoleTourTab) => void;
  onNext: () => void;
  onBack: () => void;
  onExit: () => void;
}) {
  const index = clampConsoleTourStep(stepIndex, CONSOLE_TOUR_STEPS.length);
  const step = CONSOLE_TOUR_STEPS[index];
  const total = CONSOLE_TOUR_STEPS.length;

  useEffect(() => {
    onTab(step.tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  return (
    <div
      role="dialog"
      aria-label="Console tour"
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        width: 300,
        zIndex: 50,
        background: p.surface,
        borderRadius: 14,
        border: `1.5px solid ${p.accentSoft}`,
        boxShadow: '0 10px 34px rgba(0,0,0,0.22)',
        padding: '15px 17px',
        animation: 'fade-in-up 0.4s ease-out both',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 800, color: p.ink1, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Console tour</span>
        <button
          onClick={onExit}
          aria-label="Exit tour"
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: p.ink3, fontSize: 15, lineHeight: 1, padding: 4 }}
        >
          ×
        </button>
      </div>
      <div style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
        {Array.from({ length: total }).map((_, i) => (
          <span key={i} style={{ height: 6, width: i === index ? 16 : 6, borderRadius: 3, background: i === index ? p.primary : p.hairline }} />
        ))}
      </div>
      <p style={{ fontFamily: FONT.ui, fontSize: 13.5, fontWeight: 700, color: p.ink1, marginBottom: 4 }}>{step.title}</p>
      <p style={{ fontFamily: FONT.ui, fontSize: 12.5, color: p.ink2, lineHeight: 1.5 }}>{step.body}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
        <button onClick={onExit} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: p.ink3, fontFamily: FONT.ui, fontSize: 12.5, fontWeight: 600, padding: 0 }}>Exit</button>
        <div style={{ flex: 1 }} />
        {index > 0 && (
          <button onClick={onBack} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: p.ink2, fontFamily: FONT.ui, fontSize: 12.5, fontWeight: 700, padding: '7px 4px' }}>Back</button>
        )}
        <button
          onClick={onNext}
          style={{ padding: '7px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', background: p.primary, color: 'white', fontFamily: FONT.ui, fontSize: 12.5, fontWeight: 700 }}
        >
          {index === total - 1 ? 'Done' : 'Next'}
        </button>
      </div>
    </div>
  );
}

/** Persona picker (Lender Tenancy spec, 2026-07-12): the console's entry screen. One click
 *  scopes the entire workbench to a registry lender  tenancy, not authentication, so there
 *  are no credentials to check and no session to establish. */
function PersonaPicker({ onSelect }: { onSelect: (id: string) => void }) {
  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f4f6f4', padding: 24 }}>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <p style={{ fontFamily: FONT.ui, fontSize: 20, fontWeight: 800, color: '#1a2b22' }}>Pip Credit · Lender Console</p>
        <p style={{ fontFamily: FONT.ui, fontSize: 12.5, color: '#5d6b63', marginTop: 4 }}>Demo  select a lender, no credentials.</p>
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 900 }}>
        {LENDER_REGISTRY.map((l) => (
          <button
            key={l.id}
            onClick={() => onSelect(l.id)}
            style={{
              width: 260,
              textAlign: 'left',
              padding: '20px 20px 18px',
              borderRadius: 16,
              border: '1.5px solid rgba(20,40,30,0.10)',
              background: 'white',
              cursor: 'pointer',
              boxShadow: '0 6px 24px rgba(20,40,30,0.08)',
            }}
          >
            <div style={{ width: 34, height: 34, borderRadius: 9, background: l.brandColor, marginBottom: 14 }} />
            <p style={{ fontFamily: FONT.ui, fontSize: 15, fontWeight: 800, color: '#1a2b22', marginBottom: 6 }}>{l.name}</p>
            <p style={{ fontFamily: FONT.ui, fontSize: 12, color: '#5d6b63', lineHeight: 1.5, marginBottom: 14 }}>{l.blurb}</p>
            <p style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 600, color: l.brandColor }}>Enter as {l.officer} →</p>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Console() {
  const [tab, setTab] = useState<Tab>('verify');
  const [code, setCode] = useState(SAMPLE_CODE);
  const [amount, setAmount] = useState('10,000');
  const [flagged, setFlagged] = useState(false);
  // Real timestamp captured the moment the flag was raised  the alert's flag time
  // and case id are derived from this + the loaded code, never hardcoded (Brief A).
  const [flaggedAt, setFlaggedAt] = useState<Date | null>(null);
  // The lender's stored policy (Brief N): boot renders under the defaults, then the
  // fetch swaps in the persisted policy and re-evaluates so every verdict on screen
  // was produced by the policy the note cites.
  const [storedPolicy, setStoredPolicy] = useState<StoredPolicy>(DEFAULT_STORED_POLICY);
  const [state, setState] = useState<ViewState>(() => evaluate(SAMPLE_CODE, '10,000', DEFAULT_STORED_POLICY));
  // Prior presentments of the currently verified passport (24h window, this console's log).
  const [priors, setPriors] = useState<Presentment[]>([]);
  // The application pipeline (Brief O): persisted per-console, loaded after mount (SSR-safe).
  const [apps, setApps] = useState<ApplicationRecord[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [purpose, setPurpose] = useState<DeclaredPurpose | null>(null);
  // Tracks whether the currently-displayed decision is the result of a counter-offer action (Brief L).
  const [isCounterOffer, setIsCounterOffer] = useState(false);
  // Capital Markets pool source (Brief Q): defaults to the live approved book, auto-falling
  // back to the sample pool while the book is empty (handled inside CapitalMarkets).
  const [poolSource, setPoolSource] = useState<PoolSource>('live');
  // Adopted risk-based rate (Brief R): null = ladder rate in force; a number = custom-priced.
  const [adoptedRate, setAdoptedRate] = useState<number | null>(null);
  // Judge tour wizard (Judge Tour spec, 2026-07-12; upgraded from the Brief-M static card):
  // defaults hidden (SSR-safe) and only shown once the mount effect confirms localStorage
  // doesn't already record it as seen. Step index persists too, so a reload resumes mid-tour.
  const [showTour, setShowTour] = useState(false);
  const [tourStepIndex, setTourStepIndexState] = useState(0);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(TOUR_DISMISSED_KEY) !== 'true') setShowTour(true);
      const savedStep = Number(window.localStorage.getItem(TOUR_STEP_KEY) ?? '0');
      setTourStepIndexState(clampConsoleTourStep(Number.isFinite(savedStep) ? savedStep : 0, CONSOLE_TOUR_STEPS.length));
    } catch {
      // localStorage unavailable (private mode / disabled)  skip the tour rather than crash.
    }
  }, []);
  const persistTourStep = (index: number) => {
    setTourStepIndexState(index);
    try {
      window.localStorage.setItem(TOUR_STEP_KEY, String(index));
    } catch {
      // Best-effort persistence.
    }
  };
  const tourNext = () => {
    if (tourStepIndex >= CONSOLE_TOUR_STEPS.length - 1) {
      dismissTour();
      return;
    }
    persistTourStep(tourStepIndex + 1);
  };
  const tourBack = () => persistTourStep(Math.max(0, tourStepIndex - 1));
  const dismissTour = () => {
    setShowTour(false);
    try {
      window.localStorage.setItem(TOUR_DISMISSED_KEY, 'true');
    } catch {
      // Best-effort persistence; a session that can't write localStorage just re-shows next load.
    }
  };
  const restartTour = () => {
    persistTourStep(0);
    setShowTour(true);
    try {
      window.localStorage.setItem(TOUR_DISMISSED_KEY, 'false');
    } catch {
      // Best-effort persistence.
    }
  };

  // Active lender persona (Lender Tenancy spec): scopes policy, pipeline, and book to
  // one of the three registry lenders. Tenancy, not authentication  no credentials, no
  // session, just a stored id (same pattern as the tour dismissal above).
  const [activeLenderId, setActiveLenderIdState] = useState(DEFAULT_LENDER_ID);
  const [showPersonaPicker, setShowPersonaPicker] = useState(false);
  const activeLender: LenderProfile = LENDER_REGISTRY.find((l) => l.id === activeLenderId) ?? LENDER_REGISTRY[0];

  /** Loads everything scoped to `lenderId`: its stored policy (which re-evaluates
   *  whatever passport code/amount are currently on screen), its own applications
   *  pipeline, and  if that re-evaluation yields a valid passport  its own
   *  presentment log. Used on boot and on every lender switch. */
  const loadForLender = (lenderId: string, codeUsed: string, amountUsed: string) => {
    setApps(readApplications(undefined, lenderId));
    fetch(`/api/policy?lender=${lenderId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((sp: StoredPolicy | null) => {
        if (!sp) return;
        setStoredPolicy(sp);
        const next = evaluate(codeUsed, amountUsed, sp);
        setState(next);
        setPriors(next.status === 'valid' ? findRecentPresentments(readPresentmentLog(undefined, lenderId), presentmentKey(next.passport)) : []);
      })
      .catch(() => {});
  };

  // Boot pre-verifies the sample as a demo convenience  that is not an officer action, so it
  // is not logged; it only reads any history a previous session already recorded. A saved
  // lender id skips straight to that lender's workbench; none saved shows the picker.
  useEffect(() => {
    let lenderId = DEFAULT_LENDER_ID;
    try {
      const saved = window.localStorage.getItem(ACTIVE_LENDER_KEY);
      if (saved && LENDER_REGISTRY.some((l) => l.id === saved)) {
        lenderId = saved;
      } else {
        setShowPersonaPicker(true);
      }
    } catch {
      // localStorage unavailable  falls through to the TEKUN default without a picker.
    }
    setActiveLenderIdState(lenderId);
    loadForLender(lenderId, SAMPLE_CODE, '10,000');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** One click enters (or re-enters) the console as `lenderId`: persists the choice,
   *  returns to the Verify tab, and reloads that lender's own policy/pipeline (Lender
   *  Tenancy spec item 2). Available both from the entry picker and the header switcher. */
  const switchLender = (lenderId: string) => {
    setActiveLenderIdState(lenderId);
    try {
      window.localStorage.setItem(ACTIVE_LENDER_KEY, lenderId);
    } catch {
      // Best-effort persistence; a session that can't write localStorage just re-picks next load.
    }
    setShowPersonaPicker(false);
    setTab('verify');
    setFlagged(false);
    setFlaggedAt(null);
    setIsCounterOffer(false);
    setAdoptedRate(null);
    setSelectedAppId(null);
    setPurpose(null);
    setCode(SAMPLE_CODE);
    setAmount('10,000');
    loadForLender(lenderId, SAMPLE_CODE, '10,000');
  };

  /** A saved policy takes effect immediately: keep it in state and re-evaluate whatever
   *  is currently loaded so the Verify tab can never show a verdict from a stale policy. */
  const onPolicySaved = (sp: StoredPolicy) => {
    setStoredPolicy(sp);
    setIsCounterOffer(false);
    setAdoptedRate(null);
    if (state.status === 'valid') setState(evaluate(code, amount, sp));
  };

  const syncApps = (next: ApplicationRecord[]) => {
    setApps(next);
    writeApplications(next, undefined, activeLenderId);
  };

  /** Log an explicit verification as a presentment; priors exclude the one being recorded. */
  const logPresentment = (passport: CreditPassport) => {
    const id = presentmentKey(passport);
    setPriors(findRecentPresentments(readPresentmentLog(undefined, activeLenderId), id));
    recordPresentment({ id, at: new Date().toISOString(), lender: activeLender.name }, undefined, activeLenderId);
  };

  const filingInput = (codeUsed: string, passport: CreditPassport, decision: LoanDecision, amountNum: number, declared?: DeclaredPurpose | null): FileApplicationInput => ({
    passportCode: codeUsed,
    subject: passport.subject,
    applicantLabel: passport.holder?.name ?? 'Applicant',
    requestedAmount: amountNum,
    engineDecision: decision.decision,
    offeredAmount: decision.maxAmount,
    installment: decision.installment,
    ...(decision.breakdown?.tierLabel ? { tierLabel: decision.breakdown.tierLabel } : {}),
    ...(declared ? { purpose: declared } : {}),
    band: passport.band,
    ...(passport.assessment ? { confidencePct: Math.round(passport.assessment.confidence * 100) } : {}),
  });

  /** File a successful verify+assessment as an application (deduped) and select it. Subject-
   *  matching (Brief S): a passport whose subject matches an already-approved loan is a
   *  check-in against that loan, not a new application  filed regardless of amount. */
  const fileAndSelect = (codeUsed: string, next: ViewState) => {
    if (next.status !== 'valid' || !next.decision) return;
    const amountNum = parseAmount(amount);

    const existingLoan = apps.find((a) => a.status === 'approved' && a.subject === next.passport.subject);
    if (existingLoan) {
      let baseline: CreditPassport | null = null;
      try {
        baseline = parsePassportCode(existingLoan.passportCode).passport;
      } catch {
        baseline = null; // malformed stored code. File the check-in with no flags rather than block it
      }
      const flags: EarlyWarningFlag[] = baseline ? diffCheckIn(baseline, next.passport).flags : [];
      syncApps(recordCheckIn(apps, existingLoan.id, codeUsed, flags));
      setSelectedAppId(existingLoan.id);
      return;
    }

    const res = fileApplication(apps, filingInput(codeUsed, next.passport, next.decision, amountNum, purpose));
    if (res.filed) syncApps(res.apps);
    const match = res.apps.find((a) => a.subject === next.passport.subject && a.requestedAmount === amountNum);
    setSelectedAppId(match?.id ?? null);
  };

  const onVerify = () => {
    setFlagged(false);
    setAdoptedRate(null);
    const next = evaluate(code, amount, storedPolicy);
    setState(next);
    if (next.status === 'valid') {
      logPresentment(next.passport);
      fileAndSelect(code, next);
    } else {
      setPriors([]);
      setSelectedAppId(null);
    }
  };
  const onLoadSample = () => {
    setFlagged(false);
    setAdoptedRate(null);
    setCode(SAMPLE_CODE);
    const next = evaluate(SAMPLE_CODE, amount, storedPolicy);
    setState(next);
    if (next.status === 'valid') {
      logPresentment(next.passport);
      fileAndSelect(SAMPLE_CODE, next);
    } else {
      setPriors([]);
      setSelectedAppId(null);
    }
  };
  const onLoadFlagged = () => {
    setFlagged(true);
    setFlaggedAt(new Date());
    setCode(SUSPECT_CODE);
  };
  const onAssess = () => {
    if (state.status !== 'valid') return;
    setIsCounterOffer(false);
    setAdoptedRate(null);
    const decision = decisionFor(state.passport, amount, storedPolicy);
    const next: ViewState = { ...state, decision };
    setState(next);
    if (decision) fileAndSelect(code, next);
  };

  /** Adopt the risk-based suggested rate (Brief R): re-run decideLoan with the applicant's
   *  tier APR replaced by the adopted rate  the engine re-checks affordability at the new
   *  installment. A discount frees headroom; the decision is tagged custom-priced. */
  const onAdoptRate = (rate: number) => {
    if (state.status !== 'valid' || !state.decision?.breakdown) return;
    const products = repriceProducts(storedPolicy.products, state.decision.breakdown.tierLabel, rate);
    const decision = decisionFor(state.passport, amount, storedPolicy, products);
    const next: ViewState = { ...state, decision };
    setState(next);
    setAdoptedRate(rate);
    if (decision) fileAndSelect(code, next);
  };

  /** Counter-offer action (Brief L): sets the amount field to the engine's supportable amount,
   *  re-runs the decision, and tags the result as a counter-offer in view state so the UI can
   *  badge it clearly. Pure engine re-run  no new engine math. */
  const onCounterOffer = (counterAmount: number) => {
    if (state.status !== 'valid') return;
    const amtStr = Math.round(counterAmount).toLocaleString('en-MY');
    setAmount(amtStr);
    setIsCounterOffer(true);
    setAdoptedRate(null);
    const decision = decisionFor(state.passport, String(counterAmount), storedPolicy);
    const next: ViewState = { ...state, decision };
    setState(next);
    if (decision) fileAndSelect(code, next);
  };

  /** Reviewing an existing file re-runs the same pure evaluate path from the stored code 
   *  no duplicated state  and is not a new presentment (no log entry). */
  const onSelectApp = (app: ApplicationRecord) => {
    setFlagged(false);
    setAdoptedRate(null);
    setCode(app.passportCode);
    const amtStr = app.requestedAmount.toLocaleString('en-MY');
    setAmount(amtStr);
    const next = evaluate(app.passportCode, amtStr, storedPolicy);
    setState(next);
    setSelectedAppId(app.id);
    setPurpose(app.purpose ?? null);
    if (next.status === 'valid') setPriors(findRecentPresentments(readPresentmentLog(undefined, activeLenderId), presentmentKey(next.passport)));
  };

  const onPasteNew = () => {
    setSelectedAppId(null);
    setPurpose(null);
    setCode('');
  };

  const onResolve = (outcome: 'approved' | 'declined', rationale: string) => {
    if (!selectedAppId) return;
    syncApps(resolveApplication(apps, selectedAppId, outcome, rationale, new Date(), activeLender.officer));
  };

  /** Records that an adverse-action letter was generated (Brief J stretch), audit-trailed 
   *  a no-op when the currently-loaded passport isn't tied to a filed application. */
  const onGenerateLetter = () => {
    if (!selectedAppId || state.status !== 'valid' || !state.decision) return;
    const letter = buildAdverseActionLetter(state.passport, state.decision, parseAmount(amount));
    if (!letter) return;
    syncApps(recordLetterGenerated(apps, selectedAppId, letter.kind));
  };

  /** Seed a working pipeline from the pre-signed 13-persona demo mix + the sample (Brief O,
   *  Demo Data plan Task 6). Pure mix/pairing logic lives in `lib/demoSeed.ts` (unit-tested);
   *  this just persists the result  the applications array plus the stacking case's two
   *  presentment-log entries. */
  const onSeed = () => {
    const { apps: next, presentments } = seedApplications(readApplications(undefined, activeLenderId), storedPolicy.products, storedPolicy.policy, activeLender.name);
    syncApps(next);
    presentments.forEach((p) => recordPresentment(p, undefined, activeLenderId));
  };

  const selectedApp = apps.find((a) => a.id === selectedAppId) ?? null;
  // The live approved book (Brief Q)  maps approved applications into the pool shape.
  const book = useMemo(() => bookToPool(apps), [apps]);

  // Risk-based pricing suggestion (Brief R) for the current offer  computed from the
  // ORIGINAL ladder rate (not the adopted one) so the strip always shows ladder vs suggested.
  const pricing: PricingSuggestion | null = useMemo(() => {
    if (state.status !== 'valid' || !state.decision || state.decision.maxAmount <= 0 || !state.decision.breakdown) return null;
    const tierLabel = state.decision.breakdown.tierLabel;
    const prod = storedPolicy.products.find((pr) => pr.label === tierLabel);
    if (!prod) return null;
    return priceLoan({
      band: state.passport.band as CreditBand,
      ladderApr: prod.apr,
      costOfFunds: storedPolicy.policy.costOfFunds,
      targetReturn: storedPolicy.policy.targetReturn,
    });
  }, [state, storedPolicy]);

  const showAlert = tab === 'verify' && flagged;
  const flagTime = flagTimeLabel(flaggedAt ?? new Date());
  const flagCaseId = caseIdFor(SUSPECT_CODE);
  const p = palette(showAlert);
  const statusValid = flagged ? false : state.status === 'valid' ? true : false;
  const stackingSignal: StackingSignal | undefined =
    priors.length > 0 ? { priorCount: priors.length, lastAgo: formatAgo(priors[0].at), windowHours: 24 } : undefined;

  if (showPersonaPicker) return <PersonaPicker onSelect={switchLender} />;

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: p.bg }}>
      <Header p={p} tab={tab} setTab={setTab} alert={showAlert} onRestartTour={restartTour} activeLender={activeLender} onSwitchLender={switchLender} />
      {showAlert && <AlertBanner caseId={flagCaseId} flagTime={flagTime} />}
      {showTour && (
        <TourCard p={p} stepIndex={tourStepIndex} onTab={setTab} onNext={tourNext} onBack={tourBack} onExit={dismissTour} />
      )}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {tab === 'verify' ? (
          <>
            <QueueRail p={p} apps={apps} selectedId={selectedAppId} onSelect={onSelectApp} onSeed={onSeed} onPasteNew={onPasteNew} />
            <LeftPanel p={p} flagged={flagged} statusValid={flagged ? false : statusValid} code={code} setCode={setCode} onVerify={onVerify} onLoadSample={onLoadSample} onLoadFlagged={onLoadFlagged} />
            {showAlert ? <CenterAlert p={p} flagTime={flagTime} /> : state.status === 'valid' ? <VerifiedCenter p={p} passport={state.passport} decision={state.decision} priors={priors} issuerVerified={Boolean(state.credential.issuerSignature)} stacking={stackingSignal} lapsedTiers={state.credential.verification.lapsedTiers} /> : <InvalidCenter p={p} reasons={state.reasons} />}
            {showAlert ? <RightAlert p={p} /> : state.status === 'valid' ? <RightDecision p={p} passport={state.passport} decision={state.decision} credential={state.credential} amount={amount} setAmount={setAmount} onAssess={onAssess} onCounterOffer={onCounterOffer} isCounterOffer={isCounterOffer} stacking={stackingSignal} selectedApp={selectedApp} onResolve={onResolve} onGenerateLetter={onGenerateLetter} purpose={purpose} setPurpose={setPurpose} policy={storedPolicy.policy} policyUpdatedAt={storedPolicy.updatedAt} pricing={pricing} adoptedRate={adoptedRate} onAdoptRate={onAdoptRate} lenderName={activeLender.name} /> : <RightDecision p={p} passport={null} decision={null} credential={null} amount={amount} setAmount={setAmount} onAssess={onAssess} policy={storedPolicy.policy} policyUpdatedAt={storedPolicy.updatedAt} lenderName={activeLender.name} />}
          </>
        ) : tab === 'portfolio' ? (
          <PortfolioTab p={palette(false)} apps={apps} onStructure={() => { setPoolSource('live'); setTab('capital'); }} />
        ) : tab === 'capital' ? (
          <CapitalMarkets p={palette(false)} book={book} source={poolSource} setSource={setPoolSource} />
        ) : (
          <PolicyTab key={`${activeLenderId}:${storedPolicy.updatedAt ?? 'defaults'}`} p={palette(false)} stored={storedPolicy} onSaved={onPolicySaved} lenderId={activeLenderId} lenderName={activeLender.name} />
        )}
      </div>
    </div>
  );
}
