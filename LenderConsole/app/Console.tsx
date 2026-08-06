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
  SUSPECT_CODE,
  SUSPECT_HISTOGRAM,
  type Palette,
} from './tokens';
import { type CreditPassport, type VerifyResult, parsePassportCode, verifyPassport } from '../lib/passport';
import { DEFAULT_POLICY, REASON_CATEGORY_LABELS, decideLoan, type LenderPolicy, type LoanDecision, type LoanProduct } from '../lib/loans';
import { DEFAULT_STORED_POLICY, type StoredPolicy } from '../lib/policyStore';
import { priceLoan, repriceProducts, type PricingSuggestion } from '../lib/pricing';
import {
  DISCRETION_BAND_BPS,
  RATE_STEP_BPS,
  buildAppliedRate,
  checkAdjustment,
  deviationBps,
  fromBps,
  netMarginAt,
  rateBounds,
  ratePresets,
  reasonCode,
  reasonCodesFor,
  toBps,
  type AppliedRate,
  type RateReasonId,
} from '../lib/rateAdjustment';
import {
  DECISION_PANEL,
  DEFAULT_PANEL_WIDTHS,
  PIPELINE_PANEL,
  ASSUMED_VIEWPORT_PX,
  fitPanels,
  parsePanelWidths,
  serializePanelWidths,
  type PanelKey,
  type PanelWidths,
} from '../lib/panelLayout';
import { mergedStanding } from '../lib/repaymentStanding';
import { structurePool, type CreditBand, type PoolLoan } from '../lib/securitization';
import { SAMPLE_POOL } from '../lib/samplePool';
import { poolStatCells, trancheViews } from '../lib/poolView';
import { bookToPool, mapBook } from '../lib/portfolio';
import { loanPerformance, type LoanPerformance } from '../lib/performance';
import { chipKindFor, orderServicingSections, type ServicingSections } from '../lib/servicing';
import PolicyTab from './PolicyTab';
import PortfolioTab from './PortfolioTab';
import { buildDecisionFile, decisionFileName } from '../lib/decisionFile';
import { caseIdFor, flagTimeLabel } from '../lib/caseRef';
import { runAgentPanel, type StackingSignal } from '../lib/agents';
import { useConsoleTour } from './useConsoleTour';
import { TourCard } from './TourCard';
import { TourSpotlight } from './TourSpotlight';
import { TourAnchor } from './TourAnchor';
import { TourActiveAnchorContext, TourLockedControlsContext, TourRunningContext, useTourLocked, useTourRunning } from './tourContext';
import { emitTourSignal } from '../lib/tourSignals';
import { LENDER_REGISTRY, type LenderProfile } from '../lib/lenderRegistry';
import { buildCreditMemo } from '../lib/creditMemo';
import { findRecentPresentments, formatAgo, presentmentKey, type Presentment } from '../lib/presentment';
import { clearPresentmentLog, readPresentmentLog, recordPresentment } from '../lib/presentmentStore';
import { acceptanceLabel, acceptanceStateFor, liveBook, parseOfferBook, type AcceptanceState, type OfferBook } from '../lib/offerAcceptance';
import { deriveTrustRows, type TrustRowState } from '../lib/trustPanel';
import {
  fileApplication,
  markDefault,
  mergeServerApplications,
  readApplications,
  recordCheckIn,
  recordLetterGenerated,
  recordRepayment,
  resolveApplication,
  watchlistApplications,
  writeApplications,
  type ApplicationRecord,
  type DeclaredPurpose,
  type FileApplicationInput,
  type PurposeCategory,
  type RepaymentOutcome,
} from '../lib/applications';
import { mergeAppWithServicing, servicingWritePayload } from '../lib/servicingSync';
import type { ServicingRecord } from '../lib/mergeServicing';
import { diffCheckIn, monitoringStatus, type EarlyWarningFlag, type MonitoringStatus } from '../lib/earlyWarning';
import { seedApplications } from '../lib/demoSeed';
import { DEMO_APPLICANTS } from './demoApplicants';
import QueueRail from './QueueRail';
import { ConfirmModal, InfoButton, InfoModal, MiniBar, PanelResizer, SectionLabel, Toast } from './shared';
import AgentPanel from './AgentPanel';
import CreditMemoModal from './CreditMemo';
import AdverseActionLetterModal from './AdverseActionLetter';
import { buildAdverseActionLetter } from '../lib/adverseAction';
import { AffordabilityCheckCard, BenfordChart, ConfidenceCeilingTick, CoverageStrip, DecisionWaterfall, HeadroomBar, MomentumSpark } from './DecisionViz';

type Tab = 'verify' | 'servicing' | 'portfolio' | 'capital' | 'policy';
/** Which pool the Capital Markets tab structures (Brief Q): the synthetic sample or the live approved book. */
type PoolSource = 'sample' | 'live';
const BAND_SEGMENTS = ['#c0392b', '#d98a00', '#3ab07a', '#1f8a5b', '#145c3d'];

/** Signature material + verification outcome kept alongside a verified passport so the
 *  officer can export a self-contained, re-verifiable decision file (retained evidence). */
type Credential = { signature: string; issuerSignature?: string; verification: VerifyResult };

type ViewState =
  | { status: 'valid'; passport: CreditPassport; decision: LoanDecision | null; credential: Credential }
  | { status: 'invalid'; reasons: string[] }
  /** Nothing open. The queue is the only way in (walk-in presentment was removed), so an empty
   *  pipeline  a fresh console, or one just reset  has no subject to show. */
  | { status: 'empty' };

const parseAmount = (s: string): number => Number(s.replace(/[^0-9.]/g, '')) || 0;

/** Hover text on a control the running tour has not handed over yet. The lock is never silent:
 *  a dead button with no reason reads as a broken console. */
const TOUR_LOCK_TITLE = 'The guided tour hasn’t reached this step yet.';
/** Spread over a control's own style when locked. Withheld, not hidden — the officer still sees
 *  what the desk can do before the script asks them to do it. */
const tourLockStyle = (locked: boolean): React.CSSProperties =>
  locked ? { opacity: 0.4, cursor: 'not-allowed', filter: 'grayscale(0.5)' } : {};

function decisionFor(passport: CreditPassport, amountStr: string, stored: StoredPolicy, ownApplications: ApplicationRecord[], productsOverride?: LoanProduct[]): LoanDecision | null {
  const a = passport.assessment;
  if (!a) return null;
  const standing = mergedStanding(passport, ownApplications, stored);
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
    adverseRecord: standing.current.adverseRecord,
  });
}

/** Pure: parse + cryptographically verify a pasted code, then run the loan decision
 *  under the lender's stored policy (Brief N). */
function evaluate(code: string, amountStr: string, stored: StoredPolicy, ownApplications: ApplicationRecord[]): ViewState {
  try {
    const parsed = parsePassportCode(code);
    const res = verifyPassport(parsed.passport, parsed.signature, parsed.issuerSignature);
    if (!res.valid) return { status: 'invalid', reasons: res.reasons };
    return {
      status: 'valid',
      passport: parsed.passport,
      decision: decisionFor(parsed.passport, amountStr, stored, ownApplications),
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

function Header({ p, tab, setTab, alert, onRestartTour, onResetToDefaults, resettingDefaults, activeLender, onSwitchLender, watchlistCount }: { p: Palette; tab: Tab; setTab: (t: Tab) => void; alert: boolean; onRestartTour: () => void; onResetToDefaults: () => void; resettingDefaults: boolean; activeLender: LenderProfile; onSwitchLender: (id: string) => void; watchlistCount: number }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header style={{ height: 50, background: p.surface, borderBottom: alert ? `2px solid ${p.primary}` : `1px solid ${p.hairline}`, display: 'flex', alignItems: 'center', padding: '0 22px', flexShrink: 0, position: 'relative' }}>
      <BrandMark p={p} onRestartTour={onRestartTour} activeLender={activeLender} />
      <nav aria-label="Console sections" style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <div style={{ display: 'flex', background: p.surface2, borderRadius: 10, padding: 3, gap: 2, border: `1px solid ${p.hairline}` }}>
          {([['verify', 'Verify Passport'], ['servicing', 'Servicing'], ['portfolio', 'Portfolio'], ['capital', 'Capital Markets'], ['policy', 'Policy']] as [Tab, string][]).map(([key, label]) => {
            const active = key === tab;
            return (
              <button key={key} onClick={() => setTab(key)} aria-current={active ? 'page' : undefined} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 22px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: FONT.ui, fontSize: 12.5, fontWeight: active ? 700 : 500, background: active ? p.accentInk : 'transparent', color: active ? 'white' : p.ink2, whiteSpace: 'nowrap' }}>
                {label}
                {key === 'servicing' && watchlistCount > 0 && (
                  <span aria-label={`${watchlistCount} loan(s) on the watchlist`} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, background: active ? 'white' : '#c0392b', color: active ? p.accentInk : 'white', fontFamily: FONT.num, fontSize: 11, fontWeight: 800 }}>
                    {watchlistCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0 }}>
        <button
          onClick={onRestartTour}
          style={{ fontFamily: FONT.ui, fontSize: 11, fontWeight: 700, color: p.ink2, background: p.surface2, border: `1px solid ${p.hairline}`, borderRadius: 6, padding: '3px 9px', cursor: 'pointer' }}
        >
          Restart tour
        </button>
        <button
          onClick={onResetToDefaults}
          disabled={resettingDefaults}
          title={`Clear ${activeLender.name}'s applications, presentment log, and any saved policy edits`}
          style={{ fontFamily: FONT.ui, fontSize: 11, fontWeight: 700, color: p.red, background: p.surface2, border: `1px solid ${p.hairline}`, borderRadius: 6, padding: '3px 9px', cursor: resettingDefaults ? 'default' : 'pointer', opacity: resettingDefaults ? 0.6 : 1 }}
        >
          {resettingDefaults ? 'Resetting…' : 'Reset to defaults'}
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
                    {l.id === activeLender.id && <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.accentInk }}>✓</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </header>
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
      <span role="heading" aria-level={2} style={{ fontFamily: FONT.ui, fontSize: 13, fontWeight: 800, color: 'white', letterSpacing: '0.02em' }}>DATA INTEGRITY ALERT: Fabricated data suspected</span>
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

function VerifiedCenter({ p, passport, decision, priors, issuerVerified, stacking, lapsedTiers, policy }: { p: Palette; passport: CreditPassport; decision: LoanDecision | null; priors: Presentment[]; issuerVerified: boolean; stacking?: StackingSignal; lapsedTiers?: import('../lib/passport').ConsentTier[]; policy?: LenderPolicy }) {
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
            <span style={{ fontFamily: FONT.ui, fontSize: 13, fontWeight: 700, color: p.accentInk }}>Verified ✓</span>
            <span style={{ fontFamily: FONT.num, fontSize: 12, color: p.ink3 }}>· {passport.holder?.name ?? 'Applicant'}</span>
          </div>
        </div>

        {/* Trust panel (Brief G): five checks answering "can I trust this file?" */}
        <TourAnchor id="trust-panel">
        <div style={{ marginBottom: 12 }}>
          {trustRows.map((r, i) => (
            <div key={r.key} style={{ display: 'grid', gridTemplateColumns: '15px 118px 1fr', alignItems: 'start', gap: 8, padding: '6px 0', borderTop: i === 0 ? `1px solid ${p.hairline}` : 'none', borderBottom: `1px solid ${p.hairline}` }}>
              <TrustRowIcon state={r.state} p={p} />
              <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.ink1, lineHeight: 1.5 }}>{r.label}</span>
              <span style={{ fontFamily: FONT.ui, fontSize: 12, color: r.state === 'fail' ? p.red : r.state === 'warn' ? '#8a6100' : p.ink2, lineHeight: 1.5 }}>{r.detail}</span>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
            <span style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3 }}>Stacking check: this console only</span>
            <InfoButton entry="stacking_registry" onOpen={setInfo} />
          </div>
        </div>
        </TourAnchor>
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
                color: confidencePct >= 60 ? p.accentInk : confidencePct >= 40 ? '#8a6100' : p.red,
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
      {/* Capacity to repay, above the forensic checks: it decides more files than any
          other gate, and it used to be visible only as one line of audit-trail prose. */}
      {decision && (
        <AffordabilityCheckCard
          p={p}
          assessment={passport.assessment}
          breakdown={decision.breakdown}
          installment={decision.installment}
          policy={policy}
          onInfo={setInfo}
        />
      )}

      {passport.digitHistogram && passport.digitHistogram.length === 9 && (
        <div style={{ background: p.surface, borderRadius: 12, padding: '12px 16px', boxShadow: p.shadow }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6, gap: 8 }}>
            <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.ink3, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Benford forensic check</span>
          </div>
          <BenfordChart p={p} histogram={passport.digitHistogram} onInfo={setInfo} />
        </div>
      )}

      <RicherBlocks p={p} passport={passport} onInfo={setInfo} />

      {decision ? (
        <AgentPanel p={p} passport={passport} decision={decision} stacking={stacking} onInfo={setInfo} />
      ) : (
        <div style={{ background: p.surface, borderRadius: 12, padding: '14px 16px', boxShadow: p.shadow }}>
          <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3, lineHeight: 1.6 }}>
            No affordability assessment on this passport.
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

function RicherBlocks({ p, passport, onInfo }: { p: Palette; passport: CreditPassport; onInfo?: (entry: string) => void }) {
  const rm = (n: number): string => `RM${Math.round(n).toLocaleString('en-MY')}`;
  const pct = (x: number): number => Math.round(x * 100);
  const { occupation, incomeQuality, spendingProfile } = passport;
  if (!occupation && !incomeQuality && !spendingProfile) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      {occupation && (
        <BlockCard p={p} title="Occupation" tier="Tier 1">
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
          {onInfo && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <span style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3 }}>Self-declared, unverified</span>
              <InfoButton entry="occupation_self_declared" onOpen={onInfo} />
            </div>
          )}
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
              {onInfo && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7 }}>
                  <span style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3 }}>Evidenced debt service</span>
                  <InfoButton entry="evidenced_debt_service" onOpen={onInfo} />
                </div>
              )}
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
          Check you pasted the <strong>entire</strong> code (Credit Passport → Share).
        </p>
      </div>
    </div>
  );
}

function CenterAlert({ p, flagTime }: { p: Palette; flagTime: string }) {
  const [info, setInfo] = useState<string | null>(null);
  return (
    <div style={{ flex: 1, background: p.bg, overflowY: 'auto', padding: '14px 13px', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 360 }}>
      <InfoModal entry={info} onClose={() => setInfo(null)} p={p} />
      <div style={{ background: p.surface, borderRadius: 12, padding: '14px 16px', border: `2px solid ${p.primary}`, boxShadow: '0 4px 20px rgba(192,57,43,0.18)', animation: 'fade-in-up 0.4s ease-out both' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13, gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.primary, animation: 'blink-dot 1.4s ease-in-out infinite' }} />
            <span style={{ fontFamily: FONT.ui, fontSize: 13, fontWeight: 700, color: p.accentInk }}>Flagged ✕</span>
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
              <div style={{ padding: '5px 14px', borderRadius: 7, background: p.accentInk }}>
                <span style={{ fontFamily: FONT.num, fontSize: 18, fontWeight: 700, color: 'white' }}>28%</span>
              </div>
              <div>
                <p style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.accentInk, lineHeight: 1.2 }}>Data Confidence</p>
                <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3, lineHeight: 1.3 }}>Below 50% threshold. Auto-approval blocked</p>
              </div>
            </div>
            <div style={{ height: 7, borderRadius: 4, background: 'rgba(192,57,43,0.10)', overflow: 'hidden', marginBottom: 4 }}>
              <div style={{ height: '100%', width: '28%', background: `linear-gradient(90deg, ${p.primary}, #e74c3c)`, borderRadius: 4 }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: FONT.ui, fontSize: 12, color: p.accentInk, fontWeight: 700 }}>28% ← here</span>
              <span style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3 }}>50% threshold</span>
              <span style={{ fontFamily: FONT.ui, fontSize: 12, color: p.green }}>100%</span>
            </div>
          </div>
        </div>
      </div>

      <TourAnchor id="fraud-signals">
      <div style={{ background: p.surface, borderRadius: 12, overflow: 'hidden', border: `2px solid ${p.primary}`, boxShadow: '0 4px 22px rgba(192,57,43,0.20)' }}>
        <div style={{ padding: '9px 16px', background: 'linear-gradient(90deg, #922b21 0%, #c0392b 100%)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="13" height="14" viewBox="0 0 13 14" fill="none">
              <circle cx="6" cy="6" r="5" fill="rgba(255,255,255,0.15)" stroke="white" strokeWidth="1.1" />
              <line x1="9.5" y1="9.5" x2="12" y2="12" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span role="heading" aria-level={2} style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 800, color: 'white', letterSpacing: '0.04em' }}>DATA FORENSICS</span>
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
          <BenfordChart p={p} histogram={SUSPECT_HISTOGRAM} tone="alert" onInfo={setInfo} />
        </div>
        <div style={{ padding: '7px 16px', background: '#fff0ef', borderTop: `1px solid ${p.hairline}` }}>
          <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3, lineHeight: 1.5 }}>Not raw transactions. Patterns suggest <strong style={{ color: p.accentInk }}>manual fabrication</strong> of income figures.</p>
        </div>
      </div>
      </TourAnchor>

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
            <span style={{ fontFamily: FONT.num, fontSize: 12, fontWeight: 700, color: p.accentInk }}>{f.score}<span style={{ fontSize: 12, fontWeight: 400, color: p.ink3 }}>/100</span></span>
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
          No check-ins yet.
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

type ScheduleDot = 'paid-on-time' | 'paid-late' | 'missed' | 'overdue' | 'upcoming';

function scheduleDots(app: ApplicationRecord, perf: LoanPerformance): ScheduleDot[] {
  const events = app.repayments ?? [];
  return Array.from({ length: perf.tenorMonths }, (_, i) => {
    const seq = i + 1;
    const ev = events.find((e) => e.instalmentSeq === seq);
    if (ev) return ev.outcome === 'missed' ? 'missed' : ev.outcome === 'late' ? 'paid-late' : 'paid-on-time';
    return seq <= perf.dueCount ? 'overdue' : 'upcoming';
  });
}

/** Per-instalment repayment schedule strip (portfolio performance): one dot per instalment,
 *  with an aria-label carrying the same summary in words  the dots are presentation, never
 *  the only carrier of the information. */
function ScheduleStrip({ p, app }: { p: Palette; app: ApplicationRecord }) {
  const book = mapBook([app]);
  if (book.length === 0) return null;
  const perf = loanPerformance(book[0]);
  if (perf.tenorMonths <= 0) return null;
  const dots = scheduleDots(app, perf);
  const dotColor = (d: ScheduleDot): string => {
    if (d === 'paid-on-time') return p.primary;
    if (d === 'paid-late') return p.amber;
    if (d === 'missed') return p.red;
    if (d === 'overdue') return perf.status === 'delinquent' ? p.red : p.amber;
    return p.hairline;
  };
  const behindNote =
    perf.status === 'late'
      ? ', one instalment behind'
      : perf.status === 'delinquent'
        ? perf.missedCount > 0
          ? `, ${perf.missedCount} missed`
          : ', two or more instalments behind'
        : '';
  const label = `Repayment schedule: paid ${perf.paidCount} of ${perf.tenorMonths} instalments${behindNote}.`;
  return (
    <div style={{ marginTop: 8, borderTop: `1px solid ${p.hairline}`, paddingTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.ink2 }}>Repayment schedule</span>
        <span style={{ fontFamily: FONT.num, fontSize: 12, color: p.ink3 }}>{perf.paidCount}/{perf.tenorMonths}</span>
      </div>
      <div role="img" aria-label={label} title={label} style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        {dots.map((d, i) => (
          <span key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor(d), flexShrink: 0 }} />
        ))}
      </div>
    </div>
  );
}

/** Officer-facing "record a repayment" mini-form (portfolio performance): appends the next
 *  scheduled instalment's outcome to the loan's ledger, audit-trailed. Hides itself once every
 *  instalment on the loan's tenor has been recorded  there is nothing left to record. */
function RecordRepaymentForm({ p, app, onRecord }: { p: Palette; app: ApplicationRecord; onRecord: (instalmentSeq: number, amount: number, outcome: RepaymentOutcome) => void }) {
  const [outcome, setOutcome] = useState<RepaymentOutcome>('on-time');
  // Act 10 collects the first instalment. Collecting one early would mean the tour narrates a
  // "first repayment" that already happened.
  const recordLocked = useTourLocked('repayment-control');
  const book = mapBook([app]);
  if (book.length === 0) return null;
  const tenorMonths = book[0].loan.tenorMonths;
  const nextSeq = (app.repayments?.length ?? 0) + 1;
  if (nextSeq > tenorMonths) return null;
  return (
    // Act 10's do-step: the officer collects an instalment on the loan the judge just took.
    <TourAnchor id="repayment-control">
    <div style={{ marginTop: 8, borderTop: `1px solid ${p.hairline}`, paddingTop: 8, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3 }}>Record instalment {nextSeq}:</span>
      <select
        value={outcome}
        onChange={(e) => setOutcome(e.target.value as RepaymentOutcome)}
        style={{ padding: '4px 6px', borderRadius: 6, border: `1.5px solid ${p.hairline}`, fontSize: 12, color: p.ink1, background: p.surface, fontFamily: FONT.ui, outline: 'none' }}
      >
        <option value="on-time">On-time</option>
        <option value="late">Late</option>
        <option value="missed">Missed</option>
      </select>
      <button
        onClick={() => onRecord(nextSeq, outcome === 'missed' ? 0 : app.installment, outcome)}
        disabled={recordLocked}
        title={recordLocked ? TOUR_LOCK_TITLE : undefined}
        style={{ padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', background: p.accentInk, color: 'white', fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, ...tourLockStyle(recordLocked) }}
      >
        Record
      </button>
    </div>
    </TourAnchor>
  );
}

/** Officer "mark defaulted" action (Bidirectional Servicing Sync, 2026-07-18 design): a
 *  terminal, written-off state  irreversible in this console (curing a default is
 *  roadmap), so it's gated behind a confirm like the decline-overturn actions above. Renders
 *  nothing once the loan is already defaulted (the banner below carries that state instead). */
function MarkDefaultAction({ p, app, onMarkDefault }: { p: Palette; app: ApplicationRecord; onMarkDefault: () => void }) {
  if (app.defaulted?.value) return null;
  return (
    <div style={{ marginTop: 8, borderTop: `1px solid ${p.hairline}`, paddingTop: 8 }}>
      <button
        onClick={() => {
          if (
            window.confirm(
              'Mark this loan defaulted?\n\nThis is a terminal, written-off state: it counts as a realized loss on Portfolio and cannot be undone in this console. Recorded in the audit trail and synced to the borrower app.',
            )
          ) {
            onMarkDefault();
          }
        }}
        style={{ width: '100%', padding: '7px 0', borderRadius: 7, border: '1.5px solid #8a1f14', cursor: 'pointer', background: 'transparent', color: '#8a1f14', fontFamily: FONT.ui, fontSize: 12, fontWeight: 700 }}
      >
        Mark defaulted
      </button>
    </div>
  );
}

/** Take-up status strip (borrower acceptance, 2026-07-21): an approval is an offer until the
 *  borrower takes it. Rendered wherever a file's status is shown so "approved" is never read as
 *  "disbursed". Absent for officer-filed and seeded files, which carry no offer record. */
function AcceptanceStrip({ p, state }: { p: Palette; state: AcceptanceState }) {
  const tone =
    state === 'accepted'
      ? { fg: '#1f5c3f', bg: '#dcefe4', body: 'Loan is live. Service it on the Servicing tab.' }
      : state === 'declined'
        ? { fg: p.ink2, bg: p.surface2, body: 'Nothing was disbursed.' }
        : { fg: '#6b4c0f', bg: '#f7ecd2', body: "Sent to the borrower. Not disbursed until they accept." };
  return (
    <div style={{ borderRadius: 7, background: tone.bg, padding: '7px 9px', marginTop: 8 }}>
      <p style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: tone.fg, marginBottom: 2 }}>{acceptanceLabel(state)}</p>
      <p style={{ fontFamily: FONT.ui, fontSize: 12, color: tone.fg, lineHeight: 1.5 }}>{tone.body}</p>
    </div>
  );
}

function ApplicationCard({ p, app, passport, acceptance, onResolve, onRecordRepayment, onMarkDefault }: { p: Palette; app: ApplicationRecord; passport?: CreditPassport | null; acceptance?: AcceptanceState | null; onResolve: (outcome: 'approved' | 'declined', rationale: string) => void; onRecordRepayment?: (instalmentSeq: number, amount: number, outcome: RepaymentOutcome) => void; onMarkDefault?: () => void }) {
  const [rationale, setRationale] = useState('');
  const s = APP_STATUS_STYLE[app.status];
  // Resolving is act 7's own do-step, so it waits for the script. Declining is not in the
  // script at all: the ending was fixed by the engine's verdict at filing, and an officer who
  // declines the referred file the tour is about to have approved leaves the borrower half
  // waiting on an offer that will never be published. Withheld for the whole run, like the
  // borrower's own "No thanks".
  const resolveLocked = useTourLocked('resolve-action');
  const tourRunning = useTourRunning();
  const rationaleGiven = rationale.trim().length > 0;
  const canResolve = rationaleGiven && !resolveLocked;
  const canDecline = canResolve && !tourRunning;
  // Overturning an approval mid-tour would retract an offer the borrower half of the script is
  // standing on. Off-script for the whole run, whichever ending is playing.
  const canOverturn = rationaleGiven && !tourRunning;
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
        {app.purpose ? ` · purpose: ${PURPOSE_LABELS[app.purpose.category]}${app.purpose.note ? ` “${app.purpose.note}”` : ''} (self-reported)` : ''}
      </p>

      {acceptance && <div style={{ marginBottom: 8, marginTop: -2 }}><AcceptanceStrip p={p} state={acceptance} /></div>}

      {app.status === 'referred' && (
        // The tour anchors the WHOLE resolve block, not the Approve button alone: approving is
        // gated on a rationale, so a cutout around just the button spotlights a control the
        // officer cannot press yet and walls off the input that unlocks it.
        <TourAnchor id="resolve-action">
        <div title={resolveLocked ? TOUR_LOCK_TITLE : undefined}>
          {rationaleInput}
          <div style={{ display: 'flex', gap: 6 }}>
            <button disabled={!canResolve} onClick={() => onResolve('approved', rationale)} style={{ flex: 1, padding: '7px 0', borderRadius: 7, border: 'none', cursor: canResolve ? 'pointer' : 'not-allowed', background: canResolve ? p.primary : 'rgba(20,40,30,0.12)', color: 'white', fontFamily: FONT.ui, fontSize: 12, fontWeight: 700 }}>Approve</button>
            <button
              disabled={!canDecline}
              title={tourRunning && !resolveLocked ? 'The guided tour follows the approval path for this file.' : undefined}
              onClick={() => {
                if (window.confirm(`Decline this application?\n\nRationale: "${rationale}"\n\nThis is recorded in the append-only audit trail and cannot be undone.`)) onResolve('declined', rationale);
              }}
              style={{ flex: 1, padding: '7px 0', borderRadius: 7, border: `1.5px solid ${canDecline ? p.red : p.hairline}`, cursor: canDecline ? 'pointer' : 'not-allowed', background: 'transparent', color: canDecline ? p.red : p.ink3, fontFamily: FONT.ui, fontSize: 12, fontWeight: 700 }}
            >
              Decline
            </button>
          </div>
        </div>
        </TourAnchor>
      )}

      {app.status === 'approved' && (
        <div>
          {rationaleInput}
          <button
            disabled={!canOverturn}
            title={tourRunning ? 'Not while the guided tour is running: the borrower is holding this offer.' : undefined}
            onClick={() => {
              if (window.confirm(`Overturn this approval to a decline?\n\nRationale: "${rationale}"\n\nA decline can never be overturned back to an approval. This is recorded in the append-only audit trail.`)) onResolve('declined', rationale);
            }}
            style={{ width: '100%', padding: '7px 0', borderRadius: 7, border: `1.5px solid ${canOverturn ? p.red : p.hairline}`, cursor: canOverturn ? 'pointer' : 'not-allowed', background: 'transparent', color: canOverturn ? p.red : p.ink3, fontFamily: FONT.ui, fontSize: 12, fontWeight: 700 }}
          >
            Overturn to decline
          </button>
        </div>
      )}

      {app.status === 'declined' && (
        <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3, fontStyle: 'italic', lineHeight: 1.5 }}>
          Cannot be overturned to an approval. Escalation only.
        </p>
      )}

      {app.resolution && (
        <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink2, lineHeight: 1.5, marginTop: 6 }}>
          Resolved <strong>{app.resolution.outcome}</strong> by {app.resolution.officer}: “{app.resolution.rationale}”
        </p>
      )}

      {app.defaulted?.value && (
        <p style={{ fontFamily: FONT.ui, fontSize: 12, color: '#8a1f14', background: '#f5d4cf', borderRadius: 7, padding: '7px 9px', lineHeight: 1.5, marginTop: 8 }}>
          <strong>Defaulted</strong> {formatAgo(app.defaulted.at)} ({app.defaulted.source === 'lender' ? 'marked by this console' : 'reported by the borrower app'}). Written off and counted as a realized loss on Portfolio.
        </p>
      )}

      {app.status === 'approved' && <MonitoringSection p={p} app={app} passport={passport ?? null} />}
      {app.status === 'approved' && <ScheduleStrip p={p} app={app} />}
      {app.status === 'approved' && onRecordRepayment && <RecordRepaymentForm p={p} app={app} onRecord={onRecordRepayment} />}
      {app.status === 'approved' && onMarkDefault && <MarkDefaultAction p={p} app={app} onMarkDefault={onMarkDefault} />}

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

/** Interest rate adjustment (2026-08-06), replacing Brief R's single Adopt button. The
 *  ladder and the assistant's suggestion stay as anchors, but the officer now moves a
 *  bounded slider between the break-even floor and the ladder ceiling: one suggested rate
 *  was never the whole space, and pretending it was pushed real judgment off-system.
 *  Anything past the discretion band carries a reason code into the memo — discretion is
 *  allowed, undocumented discretion is not. Every rate shown here is re-run through
 *  decideLoan by `previewAt`, so the installment and offer on screen are the engine's,
 *  never an extrapolation. */
function RateAdjustmentStrip({ p, pricing, applied, onApply, previewAt }: {
  p: Palette;
  pricing: PricingSuggestion;
  applied: AppliedRate | null;
  onApply?: (a: AppliedRate) => void;
  previewAt?: (rate: number) => { installment: number; maxAmount: number } | null;
}) {
  const asPct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const rm = (n: number) => `RM${Math.round(n).toLocaleString('en-MY')}`;
  const bounds = rateBounds(pricing);
  const hasDiscount = pricing.discountBps > 0;
  // The rate the current decision was computed at: the ladder until the officer applies one.
  const inForce = applied?.rate ?? pricing.ladderApr;

  // Draft lives in bps so dragging can never produce a rate the engine sees as 15.800000000000001.
  const [draftBps, setDraftBps] = useState(toBps(applied?.rate ?? pricing.suggestedRate));
  const [reasonId, setReasonId] = useState<RateReasonId | null>(applied?.reason?.code ?? null);
  const [note, setNote] = useState(applied?.reason?.note ?? '');

  const draft = fromBps(draftBps);
  const deviation = deviationBps(pricing, draft);
  const codes = reasonCodesFor(deviation);
  // A code picked before the slider crossed the suggestion can be wrong for the new
  // direction (a risk premium can't justify a discount), so it drops rather than lingers.
  const reason = reasonId && codes.some((c) => c.id === reasonId) ? reasonId : null;
  const check = checkAdjustment(pricing, { rate: draft, reasonCode: reason, note });
  const preview = previewAt?.(draft) ?? null;
  const unchanged = toBps(draft) === toBps(inForce);

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
        <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.ink3, letterSpacing: '0.10em', textTransform: 'uppercase' }}>Interest rate adjustment</span>
        {hasDiscount && <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.accentInk, background: p.accentSoft, borderRadius: 5, padding: '2px 8px' }}>−{pricing.discountBps} bps for a lower-risk file</span>}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <RateCol title="Ladder rate" rate={pricing.ladderApr} margin={pricing.ladder.netMargin} highlight={!applied && !hasDiscount} />
        <RateCol title={hasDiscount ? 'Suggested rate' : 'Suggested = ladder'} rate={pricing.suggestedRate} margin={pricing.suggested.netMargin} highlight={hasDiscount} />
      </div>

      {onApply && !bounds.locked && (
        <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: p.surface2, border: `1px solid ${p.hairline}` }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <label htmlFor="officer-rate" style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.ink2 }}>Officer rate</label>
            <span style={{ fontFamily: FONT.num, fontSize: 20, fontWeight: 700, color: p.accentInk, lineHeight: 1.2 }}>{asPct(draft)}</span>
          </div>
          <input
            id="officer-rate"
            type="range"
            min={toBps(bounds.floorRate)}
            max={toBps(bounds.ceilingRate)}
            step={RATE_STEP_BPS}
            value={draftBps}
            onChange={(e) => setDraftBps(Number(e.target.value))}
            aria-valuetext={`${asPct(draft)} annual`}
            style={{ width: '100%', marginTop: 6, accentColor: p.primary, cursor: 'pointer' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: FONT.ui, fontSize: 12, color: p.ink3 }}>
            <span>break-even {asPct(bounds.floorRate)}</span>
            <span>ladder {asPct(bounds.ceilingRate)}</span>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {ratePresets(pricing).map((preset) => {
              const on = toBps(preset.rate) === draftBps;
              return (
                <button
                  key={preset.label}
                  onClick={() => setDraftBps(toBps(preset.rate))}
                  style={{ padding: '4px 9px', borderRadius: 999, border: `1.5px solid ${on ? p.primary : p.hairline}`, background: on ? p.accentSoft : p.surface, color: on ? p.accentInk : p.ink2, fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                >
                  {preset.label} {asPct(preset.rate)}
                </button>
              );
            })}
          </div>

          {/* The engine's own numbers at the drafted rate: a discount frees affordability
              headroom, a premium can shrink the offer. Officers should see which before applying. */}
          <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink2, marginTop: 8, lineHeight: 1.5 }}>
            At {asPct(draft)}: net margin {asPct(netMarginAt(pricing, draft))}
            {preview && <> · {rm(preview.installment)}/mo · offer {rm(preview.maxAmount)}</>}
            {deviation !== 0 && <span style={{ color: p.ink3 }}> · {Math.abs(deviation)} bps {deviation < 0 ? 'below' : 'above'} the suggestion</span>}
          </p>

          {check.trigger && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${p.hairline}` }}>
              <label htmlFor="rate-reason" style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.ink2, display: 'block', marginBottom: 4 }}>
                Reason code {check.trigger === 'standing' ? '(arrears on file — pricing below the ladder is an exception)' : `(more than ${DISCRETION_BAND_BPS} bps off the suggestion)`}
              </label>
              <select
                id="rate-reason"
                value={reason ?? ''}
                onChange={(e) => setReasonId((e.target.value || null) as RateReasonId | null)}
                style={{ width: '100%', padding: '6px 8px', borderRadius: 7, border: `1.5px solid ${p.hairline}`, fontSize: 12, color: p.ink1, background: p.surface, fontFamily: FONT.ui, outline: 'none' }}
              >
                <option value="">— pick a reason —</option>
                {codes.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
              <input
                type="text"
                value={note}
                maxLength={200}
                placeholder={reason ? reasonCode(reason)?.hint : 'note (required for some codes)'}
                onChange={(e) => setNote(e.target.value)}
                style={{ width: '100%', marginTop: 6, padding: '6px 8px', borderRadius: 7, border: `1.5px solid ${p.hairline}`, fontSize: 12, color: p.ink1, background: p.surface, fontFamily: FONT.ui, outline: 'none' }}
              />
            </div>
          )}

          <button
            onClick={() => {
              const next = buildAppliedRate(pricing, { rate: draft, reasonCode: reason, note });
              if (next) onApply(next);
            }}
            disabled={!check.ok || unchanged}
            style={{ width: '100%', marginTop: 8, padding: '8px 0', borderRadius: 8, border: `1.5px solid ${!check.ok || unchanged ? p.hairline : p.primary}`, cursor: !check.ok || unchanged ? 'default' : 'pointer', background: 'transparent', color: !check.ok || unchanged ? p.ink3 : p.accentInk, fontFamily: FONT.ui, fontSize: 12, fontWeight: 700 }}
          >
            {unchanged ? `${asPct(draft)} is already in force` : `Apply ${asPct(draft)}: re-prices the installment`}
          </button>
          {check.blocker && <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.amber, marginTop: 5, lineHeight: 1.5 }}>{check.blocker}</p>}
        </div>
      )}

      {applied && (
        <p style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.accentInk, background: p.accentSoft, borderRadius: 8, padding: '7px 10px', marginTop: 8, lineHeight: 1.5 }}>
          ✓ Custom-priced at {asPct(applied.rate)}: re-checked for affordability
          {applied.reason && <span style={{ fontWeight: 500 }}> · {applied.reason.label}{applied.reason.note ? ` — ${applied.reason.note}` : ''}</span>}
        </p>
      )}
      <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3, marginTop: 5, lineHeight: 1.5 }}>{pricing.reasons[pricing.reasons.length - 1]}</p>
    </div>
  );
}

function RightDecision({ p, passport, decision, credential, amount, stacking, selectedApp, acceptance, onResolve, onRecordRepayment, onGenerateLetter, purpose, setPurpose, policy, policyUpdatedAt, pricing, appliedRate, onApplyRate, previewRate, lenderName, ownApplications, storedPolicy, width = DECISION_PANEL.defaultWidth }: { p: Palette; passport: CreditPassport | null; decision: LoanDecision | null; credential: Credential | null; amount: string; stacking?: StackingSignal; selectedApp?: ApplicationRecord | null; acceptance?: AcceptanceState | null; onResolve?: (outcome: 'approved' | 'declined', rationale: string) => void; onRecordRepayment?: (instalmentSeq: number, amount: number, outcome: RepaymentOutcome) => void; onGenerateLetter?: () => void; purpose?: DeclaredPurpose | null; setPurpose?: (p: DeclaredPurpose | null) => void; policy?: LenderPolicy; policyUpdatedAt?: string; pricing?: PricingSuggestion | null; appliedRate?: AppliedRate | null; onApplyRate?: (applied: AppliedRate) => void; previewRate?: (rate: number) => { installment: number; maxAmount: number } | null; lenderName: string; ownApplications: ApplicationRecord[]; storedPolicy: StoredPolicy; /** Officer-dragged width (2026-08-06); the spec width when no resizer owns it. */ width?: number }) {
  const [memoOpen, setMemoOpen] = useState(false);
  const [letterOpen, setLetterOpen] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const letterAvailable = passport && decision ? buildAdverseActionLetter(passport, decision, parseAmount(amount)) !== null : false;
  // Each of these is a do-step's own control: the running tour holds them until its script gets
  // there (and, on an ending that never asks for one, for the whole run).
  const memoLocked = useTourLocked('memo-button');
  const letterLocked = useTourLocked('letter-button');

  // The pricing note for the memo/decision-file: ladder rate + the rate actually in force.
  const memoPricing = pricing
    ? {
        ladderApr: pricing.ladderApr,
        adoptedApr: appliedRate?.rate ?? pricing.ladderApr,
        reasons: pricing.reasons,
        // Only an officer move that carried a reason code writes an adjustment line. A rate
        // applied inside the discretion band is the engine's own suggestion, not an override.
        adjustment: appliedRate?.reason
          ? {
              reasonCode: appliedRate.reason.code,
              reasonLabel: appliedRate.reason.label,
              note: appliedRate.reason.note,
              deviationBps: appliedRate.reason.deviationBps,
            }
          : null,
      }
    : null;

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
    <div ref={panelRef} style={{ width, background: p.surface, borderLeft: `1px solid ${p.hairline}`, display: 'flex', flexDirection: 'column', flexShrink: 0, overflowY: 'auto' }}>
      <InfoModal entry={info} onClose={() => setInfo(null)} p={p} />
      <div style={{ padding: '14px 20px 11px', borderBottom: `1px solid ${p.hairline}`, flexShrink: 0 }}>
        <SectionLabel color={p.ink2}>Loan Decision Engine</SectionLabel>
        {/* Which policy produced this verdict (Brief N)  an officer always knows. */}
        <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3, marginTop: 3 }}>
          Evaluated under <strong style={{ color: p.ink2 }}>{lenderName} policy</strong>
          {policyUpdatedAt ? ` · last updated ${new Date(policyUpdatedAt).toLocaleDateString('en-MY')}` : ' · defaults'}
        </p>
      </div>

      <div style={{ padding: '14px 20px 0', flexShrink: 0 }}>
        {/* Read-only: the amount is the borrower's own request, carried on the application, not
            something the officer types. The engine has already run against it by the time this
            panel renders  opening the file IS the assessment. */}
        <label style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 600, color: p.ink2, display: 'block', marginBottom: 6 }}>Requested by applicant</label>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '9px 12px', borderRadius: 8, background: p.surface2, border: `1.5px solid ${p.hairline}` }}>
          <span style={{ fontFamily: FONT.num, fontSize: 12, fontWeight: 600, color: p.ink3 }}>RM</span>
          <span style={{ fontFamily: FONT.num, fontSize: 14.5, fontWeight: 700, color: p.ink1 }}>{amount}</span>
        </div>
        {setPurpose && (
          <div style={{ marginTop: 8 }}>
            <label style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 600, color: p.ink3, display: 'block', marginBottom: 4 }}>Declared purpose</label>
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

      {/* Declined apps have nothing actionable left in ApplicationCard (no resolve/overturn
          controls) and its status/purpose/resolution summary just repeats the verdict banner,
          the Declared purpose field, and the audit trail already shown on this same panel. */}
      {selectedApp && onResolve && selectedApp.status !== 'declined' && <ApplicationCard p={p} app={selectedApp} passport={passport} acceptance={acceptance} onResolve={onResolve} onRecordRepayment={onRecordRepayment} />}

      {decision ? (
        <>
          <TourAnchor id="decision-card">
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
          </TourAnchor>

          {/* Repayment-standing evidence (Task 11): shows the numbers behind decideLoan's adverseRecord
              reason. A clean current standing still shows its scar note, if any -- "clean today" and
              "not clean once" are two different facts, and only the current-arrears line (not the whole
              block) should disappear once cured. */}
          {(() => {
            if (!passport) return null;
            const standing = mergedStanding(passport, ownApplications, storedPolicy);
            if (standing.current.bucket === 'clean' && !standing.scar) return null;
            const color = standing.current.bucket === 'impaired' ? p.red : p.amber; // AA-audited palette tokens, not the sub-AA raw hex CHIP_STYLE still uses
            return (
              <div style={{ margin: '10px 20px 0', borderRadius: 10, border: `1.5px solid ${color}`, background: `${color}14`, padding: '10px 14px', flexShrink: 0 }}>
                {standing.current.bucket !== 'clean' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color }}>
                      {standing.current.monthsInArrears} month{standing.current.monthsInArrears > 1 ? 's' : ''} behind, RM{Math.round(standing.current.amountOverdue).toLocaleString('en-MY')} overdue
                    </span>
                    <InfoButton entry="repayment_standing" onOpen={setInfo} />
                  </div>
                )}
                {standing.scar && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <p style={{ fontFamily: FONT.ui, fontSize: 11.5, color: p.ink3, margin: 0 }}>
                      Prior arrears event {standing.scar.reachedMonthsAgo} month{standing.scar.reachedMonthsAgo > 1 ? 's' : ''} ago, still on file (12-month window)
                    </p>
                    {standing.current.bucket === 'clean' && <InfoButton entry="repayment_standing" onOpen={setInfo} />}
                  </div>
                )}
              </div>
            );
          })()}

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
              {/* Keyed on the anchors + what's in force: a new file, a policy edit, or an
                  applied rate all reset the draft slider rather than carrying a stale one over. */}
              <RateAdjustmentStrip
                key={`${toBps(pricing.ladderApr)}-${toBps(pricing.suggestedRate)}-${appliedRate ? toBps(appliedRate.rate) : 'ladder'}`}
                p={p}
                pricing={pricing}
                applied={appliedRate ?? null}
                onApply={onApplyRate}
                previewAt={previewRate}
              />
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
                              <span style={{ fontFamily: FONT.mono, fontSize: 12, fontWeight: 600, color: p.accentInk, lineHeight: 1.6, minWidth: 20, textAlign: 'right', flexShrink: 0 }}>{String(offset + i + 1).padStart(2, '0')}</span>
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
                    <span style={{ fontFamily: FONT.mono, fontSize: 12, fontWeight: 600, color: p.accentInk, lineHeight: 1.6, minWidth: 20, textAlign: 'right', flexShrink: 0 }}>{String(i + 1).padStart(2, '0')}</span>
                    <div style={{ width: 1, background: p.accentSoft, alignSelf: 'stretch', marginTop: 3 }} />
                    <p style={{ fontFamily: FONT.mono, fontSize: 12, lineHeight: 1.55, color: p.ink1 }}>{reason}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {passport && (
            <TourAnchor id="memo-button">
              <div style={{ padding: '12px 20px 0', flexShrink: 0 }}>
                <button
                  onClick={() => {
                    emitTourSignal('memo-opened');
                    setMemoOpen(true);
                  }}
                  disabled={memoLocked}
                  title={memoLocked ? TOUR_LOCK_TITLE : undefined}
                  style={{ width: '100%', padding: '10px 0', borderRadius: 9, border: `1.5px solid ${p.primary}`, cursor: 'pointer', background: 'transparent', color: p.accentInk, fontFamily: FONT.ui, fontSize: 12.5, fontWeight: 700, ...tourLockStyle(memoLocked) }}
                >
                  Generate audit memo
                </button>
              </div>
            </TourAnchor>
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
            <TourAnchor id="letter-button">
              <div style={{ padding: '8px 20px 0', flexShrink: 0 }}>
                <button
                  onClick={() => {
                    emitTourSignal('letter-generated');
                    onGenerateLetter?.();
                    setLetterOpen(true);
                  }}
                  disabled={letterLocked}
                  title={letterLocked ? TOUR_LOCK_TITLE : 'Borrower-facing adverse-action letter: decision, reasons in plain language, data relied on, and how to strengthen a future application.'}
                  style={{ width: '100%', padding: '10px 0', borderRadius: 9, border: `1.5px solid ${p.hairline}`, cursor: 'pointer', background: 'transparent', color: p.ink2, fontFamily: FONT.ui, fontSize: 12.5, fontWeight: 700, ...tourLockStyle(letterLocked) }}
                >
                  Generate adverse-action letter
                </button>
              </div>
            </TourAnchor>
          )}
        </>
      ) : (
        <div style={{ padding: '20px', flex: 1 }}>
          <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3, lineHeight: 1.6 }}>No automated decision.</p>
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
      </div>
      <div style={{ padding: '14px 20px 0' }}>
        {/* No amount and no engine run on a passport that failed integrity: nothing about this
            subject is trustworthy enough to size against. */}
        <div style={{ padding: '9px 12px', borderRadius: 8, background: '#fff8f8', border: `1.5px solid ${p.hairline}` }}>
          <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 600, color: p.ink2 }}>Assessment withheld · integrity breach</span>
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
          <p style={{ fontFamily: FONT.ui, fontSize: 12, color: '#7a5c00', lineHeight: 1.6, fontStyle: 'italic' }}>Suspected fabrication routes to a human, not an auto-decline.</p>
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
            <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3 }}>Shariah-compliant profit-sharing</p>
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
      </div>

      <TourAnchor id="capital-tranches">
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
      </TourAnchor>
    </div>
  );
}

// Active lender persona (Lender Tenancy spec, 2026-07-12): persisted so a refresh stays
// "signed in" as the chosen lender. The interactive judge tour (v2) lives in `TourCard.tsx`
// + `useConsoleTour.ts`; its own localStorage keys are owned by that hook.
const ACTIVE_LENDER_KEY = 'pip-console-active-lender';
/** Panel widths are a per-machine preference, not per-lender: an officer's monitor is the
 *  same monitor whichever tenancy they enter as. */
const PANEL_WIDTHS_KEY = 'pip-console-panel-widths';
const DEFAULT_LENDER_ID = 'tekun';

/** Persona picker (Lender Tenancy spec, 2026-07-12): the console's entry screen. One click
 *  scopes the entire workbench to a registry lender  tenancy, not authentication, so there
 *  are no credentials to check and no session to establish. */
function PersonaPicker({ onSelect }: { onSelect: (id: string) => void }) {
  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f4f6f4', padding: 24 }}>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <p style={{ fontFamily: FONT.ui, fontSize: 20, fontWeight: 800, color: '#1a2b22' }}>Pip Credit · Lender Console</p>
        <p style={{ fontFamily: FONT.ui, fontSize: 12.5, color: '#5d6b63', marginTop: 4 }}>Demo: select a lender, no credentials.</p>
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

// ── Servicing tab (console IA split, 2026-07-18) ────────────────────────────────
// The approved book's operational home: watchlist pinned first, a performance/watchlist
// status chip per card (never more than one, per lib/servicing.ts's priority rule), and a
// detail pane that reuses ApplicationCard's resolve/monitoring/schedule/record-repayment
// stack  read-and-service only; resolution controls stay a Verify-tab job.

const CHIP_STYLE: Record<import('../lib/servicing').ChipKind, { label: string; color: string; bg: string }> = {
  defaulted: { label: 'Defaulted', color: '#8a1f14', bg: '#f5d4cf' },
  watchlist: { label: 'Watchlist', color: '#c0392b', bg: '#fde8e8' },
  settled: { label: 'Settled', color: '#1f8a5b', bg: '#e7f4ec' },
  delinquent: { label: 'Delinquent', color: '#c0392b', bg: '#fde8e8' },
  late: { label: 'Late', color: '#a3791f', bg: '#fdf3dc' },
  direct: { label: 'Direct', color: '#2b8a3e', bg: '#d3f9d8' },
};

function ServicingChip({ app, isWatchlisted, settled }: { app: ApplicationRecord; isWatchlisted: boolean; settled: boolean }) {
  const book = mapBook([app]);
  const perfStatus = book.length > 0 ? loanPerformance(book[0]).status : null;
  const kind = chipKindFor(app, isWatchlisted, perfStatus, settled);
  if (!kind) return null;
  const s = CHIP_STYLE[kind];
  return (
    <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: s.color, background: s.bg, borderRadius: 5, padding: '1px 6px', marginLeft: 4, flexShrink: 0 }}>
      {s.label}
    </span>
  );
}

const rmShort = (n: number): string => `RM${Math.round(n).toLocaleString('en-MY')}`;

function ServicingCard({ p, a, selected, isWatchlisted, settled, onSelect }: { p: Palette; a: ApplicationRecord; selected: boolean; isWatchlisted: boolean; settled: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '7px 9px',
        marginBottom: 4,
        borderRadius: 8,
        cursor: 'pointer',
        border: selected ? (isWatchlisted ? '1.5px solid #c0392b' : `1.5px solid ${p.primary}`) : isWatchlisted ? '1px solid #f0c4bd' : `1px solid ${p.hairline}`,
        background: selected ? (isWatchlisted ? '#fdecea' : p.accentTint) : isWatchlisted ? '#fff8f7' : p.surface,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
        <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.ink1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{a.applicantLabel}</span>
        <ServicingChip app={a} isWatchlisted={isWatchlisted} settled={settled} />
      </div>
      <p style={{ fontFamily: FONT.num, fontSize: 12, color: p.ink2, marginTop: 2 }}>
        {rmShort(a.offeredAmount)} · disbursed {formatAgo(a.resolvedAt ?? a.filedAt)}
      </p>
    </button>
  );
}

function ServicingSectionBlock({ p, label, dotColor, apps, isWatchlisted, settled, selectedId, onSelect }: { p: Palette; label: string; dotColor: string; apps: ApplicationRecord[]; isWatchlisted: boolean; settled: boolean; selectedId: string | null; onSelect: (a: ApplicationRecord) => void }) {
  if (apps.length === 0) return null;
  return (
    <div style={{ padding: '10px 8px 4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px', marginBottom: 5 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.ink2, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, display: 'inline-block' }} />
          {label}
        </span>
        <span style={{ fontFamily: FONT.num, fontSize: 12, fontWeight: 700, color: p.ink1 }}>{apps.length}</span>
      </div>
      {apps.map((a) => (
        <ServicingCard key={a.id} p={p} a={a} selected={a.id === selectedId} isWatchlisted={isWatchlisted} settled={settled} onSelect={() => onSelect(a)} />
      ))}
    </div>
  );
}

function ServicingList({ p, apps, sections, selectedId, onSelect }: { p: Palette; apps: ApplicationRecord[]; sections: ServicingSections; selectedId: string | null; onSelect: (app: ApplicationRecord) => void }) {
  return (
    // Act 10 spotlights the book the judge's own accepted loan just landed on.
    <TourAnchor id="servicing-list">
      <nav aria-label="Serviced loans" style={{ width: 260, background: p.surface2, borderRight: `1px solid ${p.hairline}`, display: 'flex', flexDirection: 'column', flexShrink: 0, overflowY: 'auto' }}>
        <div style={{ padding: '14px 12px 10px', borderBottom: `1px solid ${p.hairline}` }}>
          <p role="heading" aria-level={2} style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.ink2, letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 4 }}>Servicing · Approved Book</p>
          <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3, lineHeight: 1.5 }}>{apps.filter((a) => a.status === 'approved').length} loan(s) disbursed</p>
        </div>
        <ServicingSectionBlock p={p} label="Defaulted" dotColor="#8a1f14" apps={sections.defaulted} isWatchlisted={false} settled={false} selectedId={selectedId} onSelect={onSelect} />
        <ServicingSectionBlock p={p} label="Watchlist" dotColor="#c0392b" apps={sections.watchlist} isWatchlisted settled={false} selectedId={selectedId} onSelect={onSelect} />
        <ServicingSectionBlock p={p} label="Active" dotColor="#3b5bdb" apps={sections.active} isWatchlisted={false} settled={false} selectedId={selectedId} onSelect={onSelect} />
        <ServicingSectionBlock p={p} label="Settled" dotColor="#1f8a5b" apps={sections.settled} isWatchlisted={false} settled selectedId={selectedId} onSelect={onSelect} />
      </nav>
    </TourAnchor>
  );
}

function ServicingEmpty({ p, text }: { p: Palette; text: string }) {
  return (
    <div style={{ flex: 1, background: p.bg, overflowY: 'auto', padding: '40px', minWidth: 360 }}>
      <div style={{ maxWidth: 480, padding: '18px 20px', borderRadius: 12, background: p.surface, border: `1px solid ${p.hairline}`, boxShadow: p.shadow }}>
        <p style={{ fontFamily: FONT.ui, fontSize: 12.5, color: p.ink2, lineHeight: 1.6 }}>{text}</p>
      </div>
    </div>
  );
}

function ServicingDetail({ p, app, passport, acceptance, onResolve, onRecordRepayment, onMarkDefault }: { p: Palette; app: ApplicationRecord; passport: CreditPassport | null; acceptance?: AcceptanceState | null; onResolve: (outcome: 'approved' | 'declined', rationale: string) => void; onRecordRepayment: (instalmentSeq: number, amount: number, outcome: RepaymentOutcome) => void; onMarkDefault: () => void }) {
  return (
    <div style={{ width: 340, background: p.surface, borderLeft: `1px solid ${p.hairline}`, display: 'flex', flexDirection: 'column', flexShrink: 0, overflowY: 'auto', padding: '14px 0' }}>
      <ApplicationCard p={p} app={app} passport={passport} acceptance={acceptance} onResolve={onResolve} onRecordRepayment={onRecordRepayment} onMarkDefault={onMarkDefault} />
    </div>
  );
}

export default function Console() {
  const [tab, setTab] = useState<Tab>('verify');
  // The passport code of the open subject. Always set from an application (or the
  // fabricated demo passport); never typed, now that walk-in presentment is gone.
  const [code, setCode] = useState('');
  // The requested amount of the open application. Officer-set walk-in presentment was removed,
  // so this is never typed  it is always the amount the borrower actually asked for, carried
  // on the application record.
  const [amount, setAmount] = useState('10,000');
  const [flagged, setFlagged] = useState(false);
  // Real timestamp captured the moment the flag was raised  the alert's flag time
  // and case id are derived from this + the loaded code, never hardcoded (Brief A).
  const [flaggedAt, setFlaggedAt] = useState<Date | null>(null);
  // The lender's stored policy (Brief N): boot renders under the defaults, then the
  // fetch swaps in the persisted policy and re-evaluates so every verdict on screen
  // was produced by the policy the note cites.
  const [storedPolicy, setStoredPolicy] = useState<StoredPolicy>(DEFAULT_STORED_POLICY);
  const [state, setState] = useState<ViewState>({ status: 'empty' });
  // Prior presentments of the currently verified passport (24h window, this console's log).
  const [priors, setPriors] = useState<Presentment[]>([]);
  // The application pipeline (Brief O): persisted per-console, loaded after mount (SSR-safe).
  const [apps, setApps] = useState<ApplicationRecord[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [purpose, setPurpose] = useState<DeclaredPurpose | null>(null);
  // Capital Markets pool source (Brief Q): defaults to the live approved book, auto-falling
  // back to the sample pool while the book is empty (handled inside CapitalMarkets).
  const [poolSource, setPoolSource] = useState<PoolSource>('live');
  // The rate in force on the open file: null = the tier's ladder rate, a record = the officer
  // applied one off the adjustment slider, carrying its reason code when it needed one.
  const [appliedRate, setAppliedRate] = useState<AppliedRate | null>(null);
  // Draggable column widths (2026-08-06). This is the officer's INTENT — what they dragged
  // to, persisted — not what is on screen: `panelLayout` below fits it to the window every
  // render. Keeping the two apart is what lets a panel squeezed by a narrow window come
  // back to its full width when the window grows, instead of being permanently shrunk.
  // Starts at the defaults on BOTH server and first client render (reading localStorage in
  // the initializer would hydrate-mismatch); the saved layout swaps in from the boot effect.
  const [panelIntent, setPanelIntent] = useState<PanelWidths>(DEFAULT_PANEL_WIDTHS);
  const [viewportWidth, setViewportWidth] = useState(ASSUMED_VIEWPORT_PX);
  const panelLayout = useMemo(() => fitPanels(panelIntent, viewportWidth), [panelIntent, viewportWidth]);
  // Interactive judge tour (v2): the driver hook owns visibility, the resumable step index,
  // tab-driving, the spotlight anchor, and the semantic-signal subscription. It only observes
  // and advances  it never performs the officer's actions (open a file, load flagged, seed, open
  // memo, issue a letter); those stay the officer's own taps, which the tour detects.
  // Active lender persona (Lender Tenancy spec): scopes policy, pipeline, and book to
  // one of the three registry lenders. Tenancy, not authentication  no credentials, no
  // session, just a stored id (same pattern as the tour dismissal above).
  // This lender's published offers keyed by subject (borrower acceptance, 2026-07-21). Server
  // state, never written from here: the console publishes through /api/offers and the borrower
  // answers through its PATCH, so this is a read-only mirror refreshed on the pipeline poll.
  const [offerBook, setOfferBook] = useState<OfferBook>({});
  // Declared after `apps`/`offerBook` because the tour reads its own branch and handoff gate
  // out of them — it follows the real loan rather than being told where the story is.
  const tour = useConsoleTour({
    tab,
    setTab,
    apps,
    offerAnswered: Object.values(offerBook).some((o) => o?.response != null),
  });
  const [activeLenderId, setActiveLenderIdState] = useState(DEFAULT_LENDER_ID);
  const [showPersonaPicker, setShowPersonaPicker] = useState(false);
  const [resettingDefaults, setResettingDefaults] = useState(false);
  // Custom reset-confirmation modal + post-reset success toast (2026-07-20 follow-up),
  // replacing a bare window.confirm/none at all.
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetToast, setResetToast] = useState<string | null>(null);
  const activeLender: LenderProfile = LENDER_REGISTRY.find((l) => l.id === activeLenderId) ?? LENDER_REGISTRY[0];

  /** Pull `lenderId`'s server-side direct-apply mailbox and merge any new borrower
   *  submissions into the local pipeline (poll-on-focus, mirrors pullServicing below): a
   *  borrower who sends a passport while the officer already has the console open now
   *  shows up without a manual reload. Deduped by fileApplication's subject+amount identity,
   *  then persisted so an adopted submission behaves exactly like an officer-filed one on
   *  every later load. */
  const pullDirectApply = async (lenderId: string) => {
    try {
      const res = await fetch(`/api/apply?lender=${lenderId}`);
      if (!res.ok) return;
      const server: unknown = await res.json();
      if (!Array.isArray(server) || server.length === 0) return;
      const merged = mergeServerApplications(readApplications(undefined, lenderId), server);
      if (merged.changed) {
        writeApplications(merged.apps, undefined, lenderId);
        if (lenderId === activeLenderId) setApps(merged.apps);
      }
    } catch {
      // offline/malformed  the pipeline just stays whatever it was locally.
    }
  };

  /** Pull this lender's published offer book (borrower acceptance, 2026-07-21) so the rail can
   *  separate "approved, waiting on the borrower" from "accepted and disbursed". Server-side
   *  only  the borrower writes their answer through the public PATCH, so the console learns
   *  about it by re-reading, on exactly the same schedule it already polls direct-apply on.
   *  A failure leaves the book as-is: the rail then shows the two triage queues alone, which
   *  is the pre-acceptance behaviour, not a broken one. */
  const pullOfferBook = async (lenderId: string) => {
    try {
      const res = await fetch(`/api/offers/book?lender=${lenderId}`);
      if (!res.ok) return;
      const parsed = parseOfferBook(await res.json());
      if (lenderId === activeLenderId) setOfferBook(parsed);
    } catch {
      // offline/malformed  keep whatever book we already had.
    }
  };

  /** Opens one application as the console's subject: its stored code re-evaluated at the amount
   *  the borrower actually requested, under the given policy. Now that walk-in presentment is
   *  gone this is the ONLY way a subject reaches the screen  boot, lender switch and queue
   *  clicks all funnel through here. Everything it needs is passed in rather than read from
   *  state, because boot calls it from inside a fetch callback where `apps`/`storedPolicy`
   *  still hold the previous lender's values. */
  const openApplication = (
    app: ApplicationRecord,
    sp: StoredPolicy,
    ownApplications: ApplicationRecord[],
    lenderId: string
  ): ViewState => {
    const amtStr = app.requestedAmount.toLocaleString('en-MY');
    const next = evaluate(app.passportCode, amtStr, sp, ownApplications);
    setCode(app.passportCode);
    setAmount(amtStr);
    setState(next);
    setSelectedAppId(app.id);
    setPurpose(app.purpose ?? null);
    // Cleared rather than left standing when the passport doesn't verify: priors belong to the
    // subject, and a stale list under a failed verification reads as that subject's history.
    setPriors(next.status === 'valid' ? findRecentPresentments(readPresentmentLog(undefined, lenderId), presentmentKey(next.passport)) : []);
    return next;
  };

  /** Loads everything scoped to `lenderId`: its stored policy, its own applications pipeline,
   *  and its first queued file as the open subject (or the empty state when the queue is
   *  empty). Used on boot and on every lender switch. */
  const loadForLender = (lenderId: string) => {
    // Read into a local const rather than relying on the `apps` state var below: setApps is
    // async, so the .then() callback's `apps` closure would still hold the PREVIOUS lender's
    // applications at the moment evaluate() needs them for the standing merge.
    const ownApplications = readApplications(undefined, lenderId);
    setApps(ownApplications);
    // Servicing sync (2026-07-18 design) runs after the direct-apply adoption above so it
    // sees any just-adopted approved loans too, not just the ones already in the pipeline.
    pullDirectApply(lenderId).finally(() => {
      pullOfferBook(lenderId).catch(() => {});
      pullServicing(lenderId).catch(() => {});
    });
    fetch(`/api/policy?lender=${lenderId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((sp: StoredPolicy | null) => {
        if (!sp) return;
        setStoredPolicy(sp);
        if (ownApplications.length === 0) {
          // Auto-seed (2026-08-06): a judge should never have to find and click "Seed demo
          // pipeline" before the desk shows anything  the console arrives pre-stocked, via
          // the exact same seedApplications/writeApplications path the manual button used
          // (see onSeed below). Looked up from the registry by `lenderId`, not the `activeLender`
          // closure  this runs from inside a fetch callback for a lender switch that may not
          // have committed to state yet (same reasoning as openApplication's own doc comment).
          const lenderProfile = LENDER_REGISTRY.find((l) => l.id === lenderId) ?? LENDER_REGISTRY[0];
          const { apps: seeded, presentments } = seedApplications(ownApplications, sp.products, sp.policy, lenderProfile.name);
          writeApplications(seeded, undefined, lenderId);
          presentments.forEach((p) => recordPresentment(p, undefined, lenderId));
          setApps(seeded);
          const firstSeeded = seeded[0];
          if (firstSeeded) {
            openApplication(firstSeeded, sp, seeded, lenderId);
            return;
          }
        }
        const first = ownApplications[0];
        if (!first) {
          setState({ status: 'empty' });
          setSelectedAppId(null);
          setPurpose(null);
          setPriors([]);
          return;
        }
        openApplication(first, sp, ownApplications, lenderId);
      })
      .catch(() => {});
  };

  // Boot pre-verifies the sample as a demo convenience  that is not an officer action, so it
  // is not logged; it only reads any history a previous session already recorded. A saved
  // lender id skips straight to that lender's workbench; none saved shows the picker.
  useEffect(() => {
    setViewportWidth(window.innerWidth);
    try {
      // Parsed against the panel specs alone, NOT this window: a layout saved on a wide
      // monitor is still the officer's intent on a narrow one, and `panelLayout` fits it.
      setPanelIntent(parsePanelWidths(window.localStorage.getItem(PANEL_WIDTHS_KEY)));
    } catch {
      // localStorage unavailable — the desk just opens at its default column widths.
    }
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
    loadForLender(lenderId);
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
    setAppliedRate(null);
    setSelectedAppId(null);
    setPurpose(null);
    loadForLender(lenderId);
  };

  /** Opens the custom reset-confirmation modal (2026-07-20 follow-up: replaces a bare
   *  `window.confirm`, which can't carry the console's own styling or explain the borrower-app
   *  consequence as clearly as a real dialog). The actual reset only runs from the modal's
   *  Confirm button, in `performReset` below. */
  const onResetToDefaults = () => setResetConfirmOpen(true);

  /** Reset-to-defaults: wipes this lender's own mutations  its application pipeline (both the
   *  console's own filings and the server-side direct-apply mailbox, so a reset genuinely
   *  empties the queue rather than having it silently repopulate on the next load), its
   *  presentment log, saved policy edits (reverting to that lender's registry package, not the
   *  generic ladder), its servicing ledger, and its published offer book  then stamps a reset
   *  marker (data-consistency follow-up, 2026-07-20) so the borrower app can find out and clear
   *  its own now-orphaned copy of any loan routed to this lender, and reloads a clean
   *  workbench. Scoped to the active lender only, mirroring every other lender-scoped store
   *  here; switching lenders still sees that lender's own untouched state. Does not touch the
   *  tour (Restart tour is a separate, deliberate action). This is a demo console with no
   *  authentication (spec: "no credentials"), so the mailbox holds only test submissions from
   *  the paired borrower app, never a real lender's live pipeline  wiping it here is safe by
   *  design, not an oversight. */
  const performReset = async () => {
    setResetConfirmOpen(false);
    setResettingDefaults(true);
    try {
      writeApplications([], undefined, activeLenderId);
      clearPresentmentLog(undefined, activeLenderId);
      try {
        await Promise.all([
          fetch(`/api/policy?lender=${activeLenderId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ policy: activeLender.policy ?? DEFAULT_POLICY, products: activeLender.products }),
          }),
          fetch(`/api/apply?lender=${activeLenderId}`, { method: 'DELETE' }),
          fetch(`/api/servicing?lender=${activeLenderId}`, { method: 'DELETE' }),
          fetch(`/api/offers?lender=${activeLenderId}`, { method: 'DELETE' }),
          fetch(`/api/reset?lender=${activeLenderId}`, { method: 'POST' }),
        ]);
      } catch {
        // Best-effort; loadForLender below still re-reads whatever the server ends up with.
      }
      setTab('verify');
      setFlagged(false);
      setFlaggedAt(null);
        setAppliedRate(null);
      setSelectedAppId(null);
      setPurpose(null);
      setState({ status: 'empty' });
      setApps([]);
      setPriors([]);
      setOfferBook({});
      loadForLender(activeLenderId);
      setResetToast(`${activeLender.name}'s console was reset to defaults. Any matching loan on the borrower app's side will clear on its next sync.`);
    } finally {
      setResettingDefaults(false);
    }
  };

  /** A saved policy takes effect immediately: keep it in state and re-evaluate whatever
   *  is currently loaded so the Verify tab can never show a verdict from a stale policy. */
  const onPolicySaved = (sp: StoredPolicy) => {
    setStoredPolicy(sp);
    setAppliedRate(null);
    if (state.status === 'valid') setState(evaluate(code, amount, sp, apps));
  };

  const syncApps = (next: ApplicationRecord[]) => {
    setApps(next);
    writeApplications(next, undefined, activeLenderId);
  };

  /** Write-through one repayment/default action to the shared servicing ledger (Bidirectional
   *  Servicing Sync, 2026-07-18 design), best-effort: fire-and-forget, never blocks or
   *  reverts the local update already applied by syncApps  offline degrades silently, same
   *  posture as direct-apply. */
  const writeThroughServicing = (app: ApplicationRecord, lenderId: string, write: { event: { instalmentSeq: number; outcome: RepaymentOutcome } } | { default: true }) => {
    const payload = servicingWritePayload(app, lenderId, write);
    if (!payload) return;
    fetch('/api/servicing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => {});
  };

  /** Publish an approved offer to the borrower back-channel (approval-notify, 2026-07-19):
   *  when an officer approves a referred application, the borrower app has no way to accept it
   *  (it only ever saw the "refer" verdict). Publishing the decided terms lets the borrower app
   *  auto-book the financing on its next poll. Best-effort, fire-and-forget  a network failure
   *  never blocks the officer's local resolution. Only meaningful for an approved loan with a
   *  positive offer; a zero-offer or subject-less record publishes nothing. */
  const publishOffer = (app: ApplicationRecord, lenderId: string) => {
    if (!app.subject || !(app.offeredAmount > 0)) return;
    // Tenor of the tier this file was priced on, so the borrower books the term we approved
    // rather than re-deriving one from the amount (which can pick a different, longer tier).
    const tier = storedPolicy.products.find((pr) => pr.label === app.tierLabel);
    fetch('/api/offers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: app.subject,
        lenderId,
        maxAmount: app.offeredAmount,
        installment: app.installment,
        ...(tier ? { tenorMonths: tier.tenorMonths } : {}),
        ...(app.purpose ? { purpose: app.purpose } : {}),
      }),
    }).catch(() => {});
  };

  /** Pull every approved loan's shared servicing record for `lenderId` and merge server
   *  events/defaults into the local pipeline (poll-on-focus, 2026-07-18 design): a
   *  borrower-recorded repayment, miss, or default now surfaces in the console. Re-reads
   *  applications fresh from storage rather than trusting a possibly-stale `apps` closure, so
   *  it composes safely after the direct-apply merge in loadForLender. Best-effort per loan
   *  one unreachable/malformed GET never blocks the rest of the book. */
  const pullServicing = async (lenderId: string) => {
    const current = readApplications(undefined, lenderId);
    const approvedApps = current.filter((a) => a.status === 'approved');
    if (approvedApps.length === 0) return;

    let next = current;
    let anyChanged = false;
    for (const app of approvedApps) {
      try {
        const res = await fetch(`/api/servicing?subject=${encodeURIComponent(app.subject)}&lender=${encodeURIComponent(lenderId)}`);
        if (!res.ok) continue;
        const record: ServicingRecord | null = await res.json();
        if (!record) continue;
        const result = mergeAppWithServicing(app, lenderId, record);
        if (result.changed) {
          next = next.map((a) => (a.id === app.id ? result.app : a));
          anyChanged = true;
        }
      } catch {
        // offline/malformed  this loan's servicing state just stays whatever it was locally.
      }
    }
    if (anyChanged) {
      writeApplications(next, undefined, lenderId);
      if (lenderId === activeLenderId) setApps(next);
    }
  };

  // Poll-on-focus (2026-07-18 design): every time the officer switches onto the Servicing
  // tab, re-pull the shared ledger so a borrower-recorded repayment/miss/default made since
  // the last load or tab switch shows up without a manual refresh.
  useEffect(() => {
    if (tab === 'servicing') pullServicing(activeLenderId).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, activeLenderId]);

  // Poll-on-focus, same pattern, for the pipeline: the officer typically leaves the console
  // open on the Verify tab (where QueueRail lives) while a borrower sends a passport from the
  // Pip app. Without this, a direct-apply submission only ever adopted on mount/lender-switch,
  // so it silently sat in the server mailbox until the next reload. Also re-checks on window
  // focus (tab-switch back to the console, not just in-app tab switch) for the same reason.
  // The offer book rides along on every one of these: a borrower accepting or declining is
  // exactly as much "news" for the rail as a fresh submission is.
  const pullPipeline = (lenderId: string) => {
    pullDirectApply(lenderId).catch(() => {});
    pullOfferBook(lenderId).catch(() => {});
  };

  useEffect(() => {
    if (tab === 'verify') pullPipeline(activeLenderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, activeLenderId]);

  useEffect(() => {
    const onFocus = () => {
      if (tab === 'verify') pullPipeline(activeLenderId);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, activeLenderId]);

  // A live demo typically runs the borrower phone and this console side by side, so the
  // window never actually loses/regains focus  a light interval poll while parked on the
  // Verify tab covers that case too.
  useEffect(() => {
    if (tab !== 'verify') return;
    const id = setInterval(() => {
      pullPipeline(activeLenderId);
    }, 5_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, activeLenderId]);

  const filingInput =(codeUsed: string, passport: CreditPassport, decision: LoanDecision, amountNum: number, declared?: DeclaredPurpose | null): FileApplicationInput => ({
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

  /** Loads the fabricated passport into the verifier to demonstrate integrity detection. Not a
   *  walk-in presentment: it never files an application and never produces a decision  the
   *  alert view renders off `flagged` alone. */
  const onLoadFlagged = () => {
    setFlagged(true);
    setFlaggedAt(new Date());
    setCode(SUSPECT_CODE);
    emitTourSignal('flagged-loaded');
  };

  /** Commit a dragged (or arrowed) column width: it becomes the new intent, and is written
   *  through so the desk opens the same way tomorrow. `resizePanel` has already clamped it
   *  against the live viewport, so what lands here is always something that fits. */
  const onPanelResize = (key: PanelKey, width: number) => {
    const next = { ...panelIntent, [key]: width };
    setPanelIntent(next);
    try {
      window.localStorage.setItem(PANEL_WIDTHS_KEY, serializePanelWidths(next));
    } catch {
      // Best-effort: a session that can't write localStorage still resizes, it just
      // re-opens at the defaults next time.
    }
  };

  /** Track the window so `panelLayout` can re-fit against it. Only the measurement is
   *  tracked, never the intent — a window that shrinks borrows pixels from the panels, and
   *  gives them back on the way out. */
  useEffect(() => {
    const onWindowResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onWindowResize);
    return () => window.removeEventListener('resize', onWindowResize);
  }, []);

  /** What the engine says at `rate` without committing to it — the slider's live readout.
   *  Pure and cheap (decideLoan is a pure function), so it can run on every drag tick, and
   *  it is the SAME call onApplyRate makes: what the officer previews is what they get. */
  const previewRate = (rate: number): { installment: number; maxAmount: number } | null => {
    if (state.status !== 'valid' || !state.decision?.breakdown) return null;
    const products = repriceProducts(storedPolicy.products, state.decision.breakdown.tierLabel, rate);
    const decision = decisionFor(state.passport, amount, storedPolicy, apps, products);
    return decision ? { installment: decision.installment, maxAmount: decision.maxAmount } : null;
  };

  /** Apply an officer rate off the adjustment slider (Brief R, widened 2026-08-06): re-run
   *  decideLoan with the applicant's tier APR replaced by it  the engine re-checks
   *  affordability at the new installment. A discount frees headroom, a premium can tighten
   *  it. The reason code (when the move needed one) rides along to the memo. */
  const onApplyRate = (applied: AppliedRate) => {
    if (state.status !== 'valid' || !state.decision?.breakdown) return;
    const products = repriceProducts(storedPolicy.products, state.decision.breakdown.tierLabel, applied.rate);
    const decision = decisionFor(state.passport, amount, storedPolicy, apps, products);
    const next: ViewState = { ...state, decision };
    setState(next);
    setAppliedRate(applied);
    if (decision) fileAndSelect(code, next);
  };

  /** Opening a file from the queue IS the assessment: the stored code is re-evaluated at the
   *  borrower's own requested amount under the current policy, so the verdict is on screen
   *  without an officer-typed amount or a separate Assess click. Reviewing is not a new
   *  presentment (no log entry). */
  const onSelectApp = (app: ApplicationRecord) => {
    setFlagged(false);
    setAppliedRate(null);
    openApplication(app, storedPolicy, apps, activeLenderId);
    // Cross-app tour act 7: only opening the file that actually came from the borrower app
    // completes the step. Opening a seeded applicant is a perfectly reasonable thing for the
    // officer to do, but it is not the beat the tour is asking for, so it must not advance.
    if (app.source === 'direct') emitTourSignal('subject-opened');
  };

  const onResolve =(outcome: 'approved' | 'declined', rationale: string) => {
    if (!selectedAppId) return;
    const app = apps.find((a) => a.id === selectedAppId);
    syncApps(resolveApplication(apps, selectedAppId, outcome, rationale, new Date(), activeLender.officer));
    // Approving a referred application is the one transition the borrower app can't reach on
    // its own (it only ever saw the "refer" verdict), so publish the offer back-channel so the
    // borrower auto-books it. Declines aren't published (the borrower simply gets no offer).
    if (outcome === 'approved' && app) publishOffer(app, activeLenderId);
    // Cross-app tour act 7: only an APPROVE completes the officer's do-step, because only an
    // approve publishes the offer the borrower is about to be sent back to answer.
    if (outcome === 'approved') emitTourSignal('application-approved');
  };

  /** Officer-recorded repayment (portfolio performance): appends one instalment outcome to
   *  the selected loan's ledger, audit-trailed. Never touches status/resolution. Writes
   *  through to the shared servicing ledger (2026-07-18 design) in addition to the local
   *  update, best-effort  the local record is never blocked or reverted by a network failure. */
  const onRecordRepayment = (instalmentSeq: number, amt: number, outcome: RepaymentOutcome) => {
    if (!selectedAppId) return;
    const app = apps.find((a) => a.id === selectedAppId);
    syncApps(recordRepayment(apps, selectedAppId, { instalmentSeq, amount: amt, outcome }, new Date()));
    if (app) writeThroughServicing(app, activeLenderId, { event: { instalmentSeq, outcome } });
    emitTourSignal('repayment-recorded');
  };

  /** Officer "mark defaulted" action (Bidirectional Servicing Sync, 2026-07-18 design): a
   *  loan-level terminal flag, audit-trailed, write-through to the shared servicing ledger.
   *  A monotonic latch  markDefault itself is a no-op on an already-defaulted loan. */
  const onMarkDefault = () => {
    if (!selectedAppId) return;
    const app = apps.find((a) => a.id === selectedAppId);
    if (!app || app.defaulted?.value) return;
    syncApps(markDefault(apps, selectedAppId, 'lender', new Date()));
    writeThroughServicing(app, activeLenderId, { default: true });
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
    // The queue is the only way in, so seeding into an empty console must also open something
    // otherwise the officer is left staring at the empty state with a full rail beside it.
    if (state.status === 'empty' && next.length > 0) openApplication(next[0], storedPolicy, next, activeLenderId);
    emitTourSignal('pipeline-seeded');
  };

  const selectedApp = apps.find((a) => a.id === selectedAppId) ?? null;
  // Null for officer-filed/seeded files (no offer governs them) — the strip then doesn't render.
  const selectedAcceptance = selectedApp ? acceptanceStateFor(selectedApp, offerBook) : null;
  // The live approved book (Brief Q)  maps approved applications into the pool shape.
  // Everything that answers "what is actually on our book?" runs off `booked`, not `apps`:
  // an offer the borrower turned down keeps status 'approved' (that's the officer's decision,
  // and the override matrix forbids rewriting it) but it is not a loan, and it must not appear
  // in Servicing, the securitisation pool, or the portfolio's exposure numbers.
  const booked = useMemo(() => liveBook(apps, offerBook), [apps, offerBook]);
  const book = useMemo(() => bookToPool(booked), [booked]);
  // Servicing tab (console IA split, 2026-07-18; settled loans, 2026-07-18 stats/advisor
  // design): the approved book split into watchlist / active / settled sections.
  const servicingSections = useMemo(() => orderServicingSections(booked), [booked]);
  const servicingCount = servicingSections.defaulted.length + servicingSections.watchlist.length + servicingSections.active.length + servicingSections.settled.length;
  const servicingWatchlistIds = useMemo(() => new Set(watchlistApplications(booked).map((a) => a.id)), [booked]);

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
      standingClean: mergedStanding(state.passport, apps, storedPolicy).discountEligible,
    });
  }, [state, storedPolicy, apps]);

  const showAlert = tab === 'verify' && flagged;
  const flagTime = flagTimeLabel(flaggedAt ?? new Date());
  const flagCaseId = caseIdFor(SUSPECT_CODE);
  const p = palette(showAlert);
  const stackingSignal: StackingSignal | undefined =
    priors.length > 0 ? { priorCount: priors.length, lastAgo: formatAgo(priors[0].at), windowHours: 24 } : undefined;

  if (showPersonaPicker) return <PersonaPicker onSelect={switchLender} />;

  const TAB_LABELS: Record<Tab, string> = { verify: 'Verify Passport', servicing: 'Servicing', portfolio: 'Portfolio', capital: 'Capital Markets', policy: 'Policy' };

  return (
    <TourActiveAnchorContext.Provider value={tour.activeAnchorId}>
    <TourLockedControlsContext.Provider value={tour.lockedControls}>
    <TourRunningContext.Provider value={tour.running}>
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: p.bg }}>
      <h1 style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
        Pip Credit Lender Console: {activeLender.name}
      </h1>
      <Header p={p} tab={tab} setTab={setTab} alert={showAlert} onRestartTour={tour.restart} onResetToDefaults={onResetToDefaults} resettingDefaults={resettingDefaults} activeLender={activeLender} onSwitchLender={switchLender} watchlistCount={servicingWatchlistIds.size} />
      <ConfirmModal
        open={resetConfirmOpen}
        title={`Reset ${activeLender.name} to defaults?`}
        body={`This clears the applications queue (including any direct applications from the borrower app), presentment log, servicing ledger, published offers, and any saved policy edits. The borrower app will clear its matching loan record on its next sync. Can't be undone.`}
        confirmLabel="Reset console"
        danger
        onConfirm={performReset}
        onCancel={() => setResetConfirmOpen(false)}
        p={p}
      />
      <Toast message={resetToast} onClose={() => setResetToast(null)} p={p} />
      {showAlert && <AlertBanner caseId={flagCaseId} flagTime={flagTime} />}
      {tour.visible && !tour.paused && <TourSpotlight onDimPress={tour.pause} />}
      {tour.visible && <TourCard p={p} c={tour} officer={activeLender.officer} lender={activeLender.name} />}
      <main aria-label={TAB_LABELS[tab]} style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {tab === 'verify' ? (
          <>
            <QueueRail p={p} apps={apps} offerBook={offerBook} selectedId={selectedAppId} onSelect={onSelectApp} onSeed={onSeed} onLoadFlagged={onLoadFlagged} lockedToAppId={tour.queueLockedToAppId} width={panelLayout.pipeline} />
            <PanelResizer p={p} spec={PIPELINE_PANEL} width={panelLayout.pipeline} otherWidth={panelLayout.decision} onResize={(w) => onPanelResize('pipeline', w)} />
            {showAlert ? <CenterAlert p={p} flagTime={flagTime} /> : state.status === 'valid' ? <VerifiedCenter p={p} passport={state.passport} decision={state.decision} priors={priors} issuerVerified={Boolean(state.credential.issuerSignature)} stacking={stackingSignal} lapsedTiers={state.credential.verification.lapsedTiers} policy={storedPolicy.policy} /> : state.status === 'invalid' ? <InvalidCenter p={p} reasons={state.reasons} /> : <ServicingEmpty p={p} text="No application open. Pick a file from the pipeline to see the engine's verdict, or seed a demo pipeline to get started." />}
            <PanelResizer p={p} spec={DECISION_PANEL} width={panelLayout.decision} otherWidth={panelLayout.pipeline} onResize={(w) => onPanelResize('decision', w)} />
            {showAlert ? <RightAlert p={p} /> : state.status === 'valid' ? <RightDecision p={p} passport={state.passport} decision={state.decision} credential={state.credential} amount={amount} stacking={stackingSignal} selectedApp={selectedApp} acceptance={selectedAcceptance} onResolve={onResolve} onRecordRepayment={onRecordRepayment} onGenerateLetter={onGenerateLetter} purpose={purpose} setPurpose={setPurpose} policy={storedPolicy.policy} policyUpdatedAt={storedPolicy.updatedAt} pricing={pricing} appliedRate={appliedRate} onApplyRate={onApplyRate} previewRate={previewRate} lenderName={activeLender.name} ownApplications={apps} storedPolicy={storedPolicy} width={panelLayout.decision} /> : <RightDecision p={p} passport={null} decision={null} credential={null} amount={amount} policy={storedPolicy.policy} policyUpdatedAt={storedPolicy.updatedAt} lenderName={activeLender.name} ownApplications={apps} storedPolicy={storedPolicy} width={panelLayout.decision} />}
          </>
        ) : tab === 'servicing' ? (
          <>
            <ServicingList p={p} apps={booked} sections={servicingSections} selectedId={selectedAppId} onSelect={onSelectApp} />
            {servicingCount === 0 ? (
              <ServicingEmpty p={p} text="No approved loans yet. Approved applications appear here." />
            ) : selectedApp && selectedApp.status === 'approved' && state.status === 'valid' ? (
              <>
                <VerifiedCenter p={p} passport={state.passport} decision={state.decision} priors={priors} issuerVerified={Boolean(state.credential.issuerSignature)} stacking={stackingSignal} lapsedTiers={state.credential.verification.lapsedTiers} policy={storedPolicy.policy} />
                <ServicingDetail p={p} app={selectedApp} passport={state.passport} acceptance={selectedAcceptance} onResolve={onResolve} onRecordRepayment={onRecordRepayment} onMarkDefault={onMarkDefault} />
              </>
            ) : (
              <ServicingEmpty p={p} text="Select a loan to service it." />
            )}
          </>
        ) : tab === 'portfolio' ? (
          <PortfolioTab p={palette(false)} apps={booked} onStructure={() => { setPoolSource('live'); setTab('capital'); }} />
        ) : tab === 'capital' ? (
          <CapitalMarkets p={palette(false)} book={book} source={poolSource} setSource={setPoolSource} />
        ) : (
          <PolicyTab key={`${activeLenderId}:${storedPolicy.updatedAt ?? 'defaults'}`} p={palette(false)} stored={storedPolicy} onSaved={onPolicySaved} lenderId={activeLenderId} lenderName={activeLender.name} apps={apps} />
        )}
      </main>
    </div>
    </TourRunningContext.Provider>
    </TourLockedControlsContext.Provider>
    </TourActiveAnchorContext.Provider>
  );
}
