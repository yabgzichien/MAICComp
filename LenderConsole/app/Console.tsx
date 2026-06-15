'use client';

import React, { useState } from 'react';
import {
  ALERT_FACTORS,
  AUDIT_REFER,
  BAND_ORDER,
  FACTOR_LABELS,
  FONT,
  FORENSIC_FLAGS,
  palette,
  POOL_STATS,
  SAMPLE_CODE,
  SUSPECT_CODE,
  TRANCHES,
  type Palette,
} from './tokens';
import { type CreditPassport, parsePassportCode, verifyPassport } from '../lib/passport';
import { DEFAULT_PRODUCTS, decideLoan, type LoanDecision } from '../lib/loans';

type Tab = 'verify' | 'capital';
const BAND_SEGMENTS = ['#c0392b', '#d98a00', '#3ab07a', '#1f8a5b', '#145c3d'];

type ViewState =
  | { status: 'valid'; passport: CreditPassport; decision: LoanDecision | null }
  | { status: 'invalid'; reasons: string[] };

const parseAmount = (s: string): number => Number(s.replace(/[^0-9.]/g, '')) || 0;

function decisionFor(passport: CreditPassport, amountStr: string): LoanDecision | null {
  const a = passport.assessment;
  if (!a) return null;
  return decideLoan({
    score: passport.score,
    confidence: a.confidence,
    avgMonthlySurplus: a.avgMonthlySurplus,
    monthlyDebtService: a.monthlyDebtService,
    avgIncome: a.avgIncome,
    requestedAmount: parseAmount(amountStr),
    products: DEFAULT_PRODUCTS,
    coverageRatio: a.coverageRatio,
    coverageDaysCovered: a.coverageDays,
  });
}

/** Pure: parse + cryptographically verify a pasted code, then run the loan decision. */
function evaluate(code: string, amountStr: string): ViewState {
  try {
    const parsed = parsePassportCode(code);
    const res = verifyPassport(parsed.passport, parsed.signature, parsed.issuerSignature);
    if (!res.valid) return { status: 'invalid', reasons: res.reasons };
    return { status: 'valid', passport: parsed.passport, decision: decisionFor(parsed.passport, amountStr) };
  } catch (e) {
    return { status: 'invalid', reasons: [e instanceof Error ? e.message : String(e)] };
  }
}

// ── shared bits ───────────────────────────────────────────────────────────────
function SectionLabel({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <p style={{ fontFamily: FONT.ui, fontSize: 9.5, fontWeight: 700, color: color ?? '#9aa7a0', letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 3 }}>
      {children}
    </p>
  );
}

function MiniBar({ pct, color, track }: { pct: number; color: string; track: string }) {
  return (
    <div style={{ height: 5, borderRadius: 3, background: track, overflow: 'hidden', flex: 1 }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3 }} />
    </div>
  );
}

function BrandMark({ p }: { p: Palette }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
      <div style={{ width: 28, height: 28, borderRadius: 8, background: p.primary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="8.5" r="4" fill="white" opacity="0.92" />
          <path d="M7 4.5V1.5M5.5 3L7 1.5L8.5 3" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <span style={{ fontFamily: FONT.ui, fontSize: 14, fontWeight: 800, color: p.ink1, whiteSpace: 'nowrap' }}>Pip Credit</span>
      <span style={{ fontSize: 15, color: p.ink3, fontWeight: 300 }}>·</span>
      <span style={{ fontFamily: FONT.ui, fontSize: 12.5, fontWeight: 600, color: p.ink2, whiteSpace: 'nowrap' }}>Lender Console</span>
      <div style={{ marginLeft: 8, padding: '3px 9px 3px 8px', borderRadius: 6, background: '#0f2d5c', display: 'flex', alignItems: 'center', gap: 5 }}>
        <svg width="9" height="10" viewBox="0 0 10 11" fill="none">
          <path d="M5 1L1 3.5v3.8l4 2.7 4-2.7V3.5L5 1z" fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.55)" strokeWidth="1" />
        </svg>
        <span style={{ fontFamily: FONT.ui, fontSize: 10.5, fontWeight: 700, color: 'white', letterSpacing: '0.08em' }}>TEKUN</span>
      </div>
    </div>
  );
}

function Header({ p, tab, setTab, alert }: { p: Palette; tab: Tab; setTab: (t: Tab) => void; alert: boolean }) {
  return (
    <div style={{ height: 50, background: p.surface, borderBottom: alert ? `2px solid ${p.primary}` : `1px solid ${p.hairline}`, display: 'flex', alignItems: 'center', padding: '0 22px', flexShrink: 0 }}>
      <BrandMark p={p} />
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <div style={{ display: 'flex', background: p.surface2, borderRadius: 10, padding: 3, gap: 2, border: `1px solid ${p.hairline}` }}>
          {([['verify', 'Verify Passport'], ['capital', 'Capital Markets']] as [Tab, string][]).map(([key, label]) => {
            const active = key === tab;
            return (
              <button key={key} onClick={() => setTab(key)} style={{ padding: '6px 22px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: FONT.ui, fontSize: 12.5, fontWeight: active ? 700 : 500, background: active ? p.primary : 'transparent', color: active ? 'white' : p.ink3, whiteSpace: 'nowrap' }}>
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0 }}>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontFamily: FONT.ui, fontSize: 11.5, fontWeight: 600, color: p.ink1, lineHeight: 1 }}>Hamdan Z.</p>
          <p style={{ fontFamily: FONT.ui, fontSize: 10, color: p.ink3, lineHeight: 1.5 }}>Loan Officer · TEKUN</p>
        </div>
        <div style={{ width: 30, height: 30, borderRadius: '50%', background: p.primary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: FONT.ui, fontSize: 11, fontWeight: 700, color: 'white' }}>HZ</span>
        </div>
      </div>
    </div>
  );
}

function AlertBanner() {
  return (
    <div style={{ background: 'linear-gradient(90deg, #a93226 0%, #c0392b 40%, #a93226 100%)', padding: '0 22px', height: 38, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, animation: 'banner-slide 0.4s ease-out', borderBottom: '2px solid #922b21' }}>
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'white', animation: 'pulse-ring 1.8s ease-out infinite, blink-dot 1.8s ease-in-out infinite' }} />
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 1.5L1 14h14L8 1.5z" fill="rgba(255,255,255,0.22)" stroke="white" strokeWidth="1.3" strokeLinejoin="round" />
        <line x1="8" y1="6" x2="8" y2="10" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="8" cy="12.2" r="0.85" fill="white" />
      </svg>
      <span style={{ fontFamily: FONT.ui, fontSize: 13, fontWeight: 800, color: 'white', letterSpacing: '0.02em' }}>DATA INTEGRITY ALERT — Fabricated data suspected</span>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ padding: '3px 10px', borderRadius: 5, background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.22)' }}>
          <span style={{ fontFamily: FONT.mono, fontSize: 10.5, color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>Case #FL-2024-0831 · Flagged 14:38 today</span>
        </div>
        <div style={{ padding: '3px 10px', borderRadius: 5, background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.35)' }}>
          <span style={{ fontFamily: FONT.ui, fontSize: 10.5, fontWeight: 700, color: 'white' }}>ML Model v3.1 · 95% confidence</span>
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
        <SectionLabel color={p.ink3}>Passport Input</SectionLabel>
        <p style={{ fontFamily: FONT.ui, fontSize: 13, fontWeight: 700, color: p.ink1, marginBottom: 3 }}>Paste passport code</p>
        <p style={{ fontFamily: FONT.ui, fontSize: 11, color: p.ink3, lineHeight: 1.5 }}>Generated by the borrower&apos;s Pip Credit app. Carries score &amp; factors only — no raw transactions.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <textarea value={code} onChange={(e) => setCode(e.target.value)} rows={7} spellCheck={false} style={{ width: '100%', border: `${red ? 2 : 1.5}px solid ${red ? p.primary : p.primary}`, borderRadius: 9, padding: '10px 12px', fontSize: 10.5, lineHeight: 1.5, color: p.ink2, background: red ? '#fff8f8' : '#fafcfa', resize: 'none', outline: 'none', fontFamily: FONT.mono, letterSpacing: '0.01em' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 7, background: p.accentTint, border: `1.5px solid ${p.accentSoft}` }}>
          {red ? (
            <>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M6.5 1L1 4v3.6c0 3 2.5 5 5.5 5.4 3-.4 5.5-2.4 5.5-5.4V4L6.5 1z" fill="#fde8e8" stroke={p.primary} strokeWidth="1.1" />
                <path d="M4.5 8.5L8.5 4.5M8.5 8.5L4.5 4.5" stroke={p.primary} strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              <span style={{ fontFamily: FONT.ui, fontSize: 11, fontWeight: 700, color: p.accentInk }}>{flagged ? 'Signature mismatch · Integrity breach' : 'Could not verify this passport'}</span>
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 1L1.5 3.5v3.3C1.5 9.5 3.4 11.4 6 12c2.6-.6 4.5-2.5 4.5-5.2V3.5L6 1z" fill={p.accentSoft} stroke={p.primary} strokeWidth="1.1" />
                <path d="M3.8 6.5l1.5 1.5L8.2 5" stroke={p.primary} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span style={{ fontFamily: FONT.ui, fontSize: 11, fontWeight: 600, color: p.accentInk }}>{statusValid ? 'Ed25519 signature valid · issuer verified' : 'Ready to verify'}</span>
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
        <span style={{ fontFamily: FONT.ui, fontSize: 11, color: p.ink3 }}>or</span>
        <div style={{ flex: 1, height: 1, background: p.hairline }} />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onLoadSample} style={{ flex: 1, padding: '9px 0', borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${p.hairline}`, background: 'transparent', fontFamily: FONT.ui, fontSize: 12, fontWeight: 600, color: p.ink2 }}>Load sample</button>
        <button onClick={onLoadFlagged} style={{ flex: 1, padding: '9px 0', borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${p.red}33`, background: '#fff6f5', fontFamily: FONT.ui, fontSize: 12, fontWeight: 600, color: p.red }}>Load flagged</button>
      </div>

      <div style={{ marginTop: 'auto', padding: '10px 12px', borderRadius: 9, background: p.accentTint, border: `1.5px solid ${p.accentSoft}` }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ marginTop: 1, flexShrink: 0 }}>
            <circle cx="7" cy="7" r="6" fill={p.accentSoft} stroke={p.primary} strokeWidth="1" />
            <line x1="7" y1="6" x2="7" y2="10" stroke={p.primary} strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="7" cy="4.5" r="0.7" fill={p.primary} />
          </svg>
          <p style={{ fontFamily: FONT.ui, fontSize: 10.5, color: p.ink2, lineHeight: 1.5 }}>
            Passport carries <strong style={{ color: p.accentInk }}>aggregate signals only</strong>. Raw transactions remain on the borrower&apos;s device and are never transmitted.
          </p>
        </div>
      </div>
    </div>
  );
}

function VerifiedCenter({ p, passport }: { p: Palette; passport: CreditPassport }) {
  const factors = passport.factorSummary;
  const avg = factors.length ? Math.round(factors.reduce((s, f) => s + f.subScore, 0) / factors.length) : 0;
  const confidencePct = passport.assessment ? Math.round(passport.assessment.confidence * 100) : null;
  const activeBand = Math.max(0, BAND_ORDER.indexOf(passport.band));
  const evidenceShort = passport.evidenceHash ? `${passport.evidenceHash.slice(0, 6)}…${passport.evidenceHash.slice(-6)}` : '';
  return (
    <div style={{ flex: 1, background: p.bg, overflowY: 'auto', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 11, minWidth: 360 }}>
      <div style={{ background: p.surface, borderRadius: 12, padding: '14px 16px', boxShadow: p.shadow, animation: 'fade-in-up 0.4s ease-out both' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13, gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.primary, boxShadow: `0 0 0 3px ${p.accentSoft}` }} />
            <span style={{ fontFamily: FONT.ui, fontSize: 13, fontWeight: 700, color: p.primary }}>Verified ✓</span>
            <span style={{ fontFamily: FONT.num, fontSize: 11, color: p.ink3 }}>· {passport.holder?.name ?? 'Applicant'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 8, background: p.accentTint, border: `1.5px solid ${p.accentSoft}` }}>
            <svg width="11" height="13" viewBox="0 0 11 13" fill="none">
              <rect x="0.5" y="5.5" width="10" height="7" rx="1.5" fill={p.accentSoft} stroke={p.primary} strokeWidth="1" />
              <path d="M2.5 5.5V3.5a3 3 0 016 0v2" stroke={p.primary} strokeWidth="1.1" strokeLinecap="round" />
            </svg>
            <span style={{ fontFamily: FONT.ui, fontSize: 10.5, fontWeight: 700, color: p.accentInk }}>Privacy Locked — no raw transactions</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flexShrink: 0 }}>
            <span style={{ fontFamily: FONT.num, fontSize: 56, fontWeight: 700, color: p.ink1, lineHeight: 1, letterSpacing: '-2px' }}>{passport.score}</span>
            <span style={{ fontFamily: FONT.ui, fontSize: 10, color: p.ink3 }}>300 – 900</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7, flexWrap: 'wrap' }}>
              <div style={{ padding: '3px 11px', borderRadius: 6, background: p.accentSoft }}>
                <span style={{ fontFamily: FONT.ui, fontSize: 12.5, fontWeight: 700, color: p.accentInk }}>{passport.band}</span>
              </div>
              {confidencePct !== null && (
                <div style={{ marginLeft: 'auto', padding: '3px 9px', borderRadius: 6, background: '#eef2ff', border: '1px solid #c7d2ff' }}>
                  <span style={{ fontFamily: FONT.ui, fontSize: 10.5, fontWeight: 600, color: '#3b5bdb' }}>Data confidence {confidencePct}%</span>
                </div>
              )}
            </div>
            <div style={{ height: 7, borderRadius: 4, overflow: 'hidden', display: 'flex', gap: 2, marginBottom: 4 }}>
              {BAND_SEGMENTS.map((c, i) => (
                <div key={i} style={{ flex: 1, background: c, opacity: i <= activeBand ? 1 : 0.17, borderRadius: 2 }} />
              ))}
            </div>
            <div style={{ display: 'flex' }}>
              {BAND_ORDER.map((b, i) => (
                <span key={b} style={{ flex: 1, fontFamily: FONT.ui, fontSize: 9, color: i === activeBand ? p.accentInk : p.ink3, fontWeight: i === activeBand ? 700 : 400, textAlign: 'center' }}>{b}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ background: p.surface, borderRadius: 12, overflow: 'hidden', boxShadow: p.shadow }}>
        <div style={{ padding: '8px 16px', background: p.surface2, borderBottom: `1px solid ${p.hairline}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: FONT.ui, fontSize: 9.5, fontWeight: 700, color: p.ink3, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Factor Breakdown · {factors.length} components</span>
          <span style={{ fontFamily: FONT.num, fontSize: 11, color: p.ink3 }}>Avg <strong style={{ color: p.ink1 }}>{avg}</strong> / 100</span>
        </div>
        {factors.map((f, i) => {
          const color = f.subScore >= 70 ? p.primary : f.subScore >= 50 ? p.amber : p.red;
          return (
            <div key={f.key} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 68px', alignItems: 'center', padding: '7px 16px', borderBottom: i < factors.length - 1 ? `1px solid ${p.hairline}` : 'none', background: i % 2 === 0 ? p.surface : 'rgba(238,241,238,0.35)' }}>
              <span style={{ fontFamily: FONT.ui, fontSize: 11.5, fontWeight: 500, color: p.ink1 }}>{FACTOR_LABELS[f.key] ?? f.key}</span>
              <div style={{ paddingRight: 14, display: 'flex', alignItems: 'center' }}>
                <MiniBar pct={f.subScore} color={color} track={p.hairline} />
              </div>
              <span style={{ fontFamily: FONT.num, fontSize: 12.5, fontWeight: 700, color }}>{Math.round(f.subScore)}<span style={{ fontSize: 9.5, fontWeight: 400, color: p.ink3 }}>/100</span></span>
            </div>
          );
        })}
        <div style={{ padding: '8px 16px', borderTop: `1px solid ${p.hairline}`, background: p.accentTint, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M6 1L1 4v4l5 3 5-3V4L6 1z" fill={p.accentSoft} stroke={p.primary} strokeWidth="1" />
          </svg>
          <span style={{ fontFamily: FONT.ui, fontSize: 10.5, fontWeight: 600, color: p.accentInk }}>Provenance</span>
          <span style={{ fontFamily: FONT.ui, fontSize: 10.5, color: p.ink2, flex: 1, minWidth: 180 }}>{passport.provenanceSummary}</span>
          {evidenceShort && <span style={{ fontFamily: FONT.mono, fontSize: 9.5, color: p.ink3 }}>SHA-256: {evidenceShort}</span>}
        </div>
      </div>
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
        <p style={{ fontFamily: FONT.ui, fontSize: 11.5, color: p.ink3, lineHeight: 1.55, marginTop: 10 }}>
          Make sure you pasted the <strong>entire</strong> code copied from the borrower&apos;s Pip Credit app (Credit Passport → Share). Or click <strong>Load sample</strong> to see a valid passport.
        </p>
      </div>
    </div>
  );
}

function CenterAlert({ p }: { p: Palette }) {
  return (
    <div style={{ flex: 1, background: p.bg, overflowY: 'auto', padding: '14px 13px', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 360 }}>
      <div style={{ background: p.surface, borderRadius: 12, padding: '14px 16px', border: `2px solid ${p.primary}`, boxShadow: '0 4px 20px rgba(192,57,43,0.18)', animation: 'fade-in-up 0.4s ease-out both' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13, gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.primary, animation: 'blink-dot 1.4s ease-in-out infinite' }} />
            <span style={{ fontFamily: FONT.ui, fontSize: 13, fontWeight: 700, color: p.primary }}>Flagged ✕</span>
            <span style={{ fontFamily: FONT.num, fontSize: 11, color: p.ink3 }}>· 14:38 · Unknown applicant</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 8, background: p.accentTint, border: `1.5px solid ${p.accentSoft}` }}>
            <svg width="11" height="13" viewBox="0 0 11 13" fill="none">
              <rect x="0.5" y="5.5" width="10" height="7" rx="1.5" fill="#fde8e8" stroke={p.primary} strokeWidth="1" />
              <path d="M2.5 5.5V3.5a3 3 0 016 0v2" stroke={p.primary} strokeWidth="1.1" strokeLinecap="round" />
            </svg>
            <span style={{ fontFamily: FONT.ui, fontSize: 10.5, fontWeight: 700, color: p.accentInk }}>Data Integrity: UNVERIFIED</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <span style={{ fontFamily: FONT.num, fontSize: 56, fontWeight: 700, color: 'rgba(192,57,43,0.20)', lineHeight: 1, letterSpacing: '-2px', textDecoration: 'line-through', textDecorationColor: 'rgba(192,57,43,0.5)' }}>710</span>
            <span style={{ fontFamily: FONT.ui, fontSize: 9.5, color: p.ink3 }}>claimed · not verified</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ padding: '5px 14px', borderRadius: 7, background: p.primary }}>
                <span style={{ fontFamily: FONT.num, fontSize: 18, fontWeight: 700, color: 'white' }}>28%</span>
              </div>
              <div>
                <p style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.primary, lineHeight: 1.2 }}>Data Confidence</p>
                <p style={{ fontFamily: FONT.ui, fontSize: 10.5, color: p.ink3, lineHeight: 1.3 }}>Below 50% threshold — auto-approval blocked</p>
              </div>
            </div>
            <div style={{ height: 7, borderRadius: 4, background: 'rgba(192,57,43,0.10)', overflow: 'hidden', marginBottom: 4 }}>
              <div style={{ height: '100%', width: '28%', background: `linear-gradient(90deg, ${p.primary}, #e74c3c)`, borderRadius: 4 }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: FONT.ui, fontSize: 9, color: p.primary, fontWeight: 700 }}>28% ← here</span>
              <span style={{ fontFamily: FONT.ui, fontSize: 9, color: p.ink3 }}>50% threshold</span>
              <span style={{ fontFamily: FONT.ui, fontSize: 9, color: p.green }}>100%</span>
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
            <span style={{ fontFamily: FONT.ui, fontSize: 11.5, fontWeight: 800, color: 'white', letterSpacing: '0.04em' }}>DATA FORENSICS</span>
          </div>
          <span style={{ fontFamily: FONT.mono, fontSize: 10, color: 'rgba(255,255,255,0.65)' }}>ML v3.1 · Benford · Pattern analysis</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 100px', padding: '5px 16px', borderBottom: `1px solid ${p.hairline}`, background: '#fff4f4' }}>
          {['Red Flag', 'Finding', 'Severity'].map((h) => (
            <span key={h} style={{ fontFamily: FONT.ui, fontSize: 9, fontWeight: 600, color: p.ink3, letterSpacing: '0.07em', textTransform: 'uppercase' }}>{h}</span>
          ))}
        </div>
        {FORENSIC_FLAGS.map((f, i) => {
          const sc = f.critical ? p.primary : p.amber;
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 160px 100px', alignItems: 'center', padding: '8px 16px', borderBottom: i < FORENSIC_FLAGS.length - 1 ? `1px solid ${p.hairline}` : 'none', background: i % 2 === 0 ? p.surface : '#fff8f8' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: sc, boxShadow: `0 0 0 2px ${sc}33` }} />
                <span style={{ fontFamily: FONT.ui, fontSize: 11.5, fontWeight: 500, color: p.ink1 }}>{f.label}</span>
              </div>
              <span style={{ fontFamily: FONT.mono, fontSize: 11, fontWeight: 600, color: sc }}>{f.value}</span>
              <div style={{ display: 'inline-flex' }}>
                <div style={{ padding: '3px 9px', borderRadius: 5, background: f.critical ? '#fde8e8' : '#fdf3dc', border: `1px solid ${sc}33` }}>
                  <span style={{ fontFamily: FONT.ui, fontSize: 9.5, fontWeight: 700, color: sc }}>{f.sev}</span>
                </div>
              </div>
            </div>
          );
        })}
        <div style={{ padding: '7px 16px', background: '#fff0ef', borderTop: `1px solid ${p.hairline}` }}>
          <p style={{ fontFamily: FONT.ui, fontSize: 10, color: p.ink3, lineHeight: 1.5 }}>Analysis ran on submitted aggregates — <strong style={{ color: p.accentInk }}>not raw transactions</strong>. Statistical patterns suggest manual fabrication of income figures.</p>
        </div>
      </div>

      <div style={{ background: p.surface, borderRadius: 12, overflow: 'hidden', boxShadow: p.shadow, opacity: 0.55 }}>
        <div style={{ padding: '7px 16px', background: p.surface2, borderBottom: `1px solid ${p.hairline}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: FONT.ui, fontSize: 9.5, fontWeight: 700, color: p.ink3, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Factor Breakdown · Scores invalidated</span>
          <div style={{ padding: '2px 9px', borderRadius: 5, background: p.accentSoft }}>
            <span style={{ fontFamily: FONT.ui, fontSize: 9.5, fontWeight: 700, color: p.accentInk }}>⚠ Untrusted input</span>
          </div>
        </div>
        {ALERT_FACTORS.map((f, i) => (
          <div key={f.label} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 68px', alignItems: 'center', padding: '5px 16px', borderBottom: i < ALERT_FACTORS.length - 1 ? `1px solid ${p.hairline}` : 'none', background: i % 2 === 0 ? p.surface : '#fff8f8' }}>
            <span style={{ fontFamily: FONT.ui, fontSize: 11, fontWeight: 500, color: p.ink2 }}>{f.label}</span>
            <div style={{ paddingRight: 14, display: 'flex', alignItems: 'center' }}>
              <MiniBar pct={f.score} color={p.primary} track="rgba(192,57,43,0.10)" />
            </div>
            <span style={{ fontFamily: FONT.num, fontSize: 12, fontWeight: 700, color: p.primary }}>{f.score}<span style={{ fontSize: 9, fontWeight: 400, color: p.ink3 }}>/100</span></span>
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

function RightDecision({ p, decision, amount, setAmount, onAssess }: { p: Palette; decision: LoanDecision | null; amount: string; setAmount: (s: string) => void; onAssess: () => void }) {
  return (
    <div style={{ width: 340, background: p.surface, borderLeft: `1px solid ${p.hairline}`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <div style={{ padding: '14px 20px 11px', borderBottom: `1px solid ${p.hairline}` }}>
        <SectionLabel color={p.ink3}>Loan Decision Engine</SectionLabel>
        <p style={{ fontFamily: FONT.ui, fontSize: 11, color: p.ink3 }}>Deterministic · policy-enforced · audit-ready</p>
      </div>

      <div style={{ padding: '14px 20px 0' }}>
        <label style={{ fontFamily: FONT.ui, fontSize: 11, fontWeight: 600, color: p.ink2, display: 'block', marginBottom: 6 }}>Requested amount (RM)</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', fontFamily: FONT.num, fontSize: 12, fontWeight: 600, color: p.ink3, pointerEvents: 'none' }}>RM</span>
            <input type="text" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onAssess()} style={{ width: '100%', padding: '9px 12px 9px 33px', borderRadius: 8, border: `1.5px solid ${p.hairline}`, fontSize: 14.5, fontWeight: 700, color: p.ink1, background: p.surface2, outline: 'none', fontFamily: FONT.num }} />
          </div>
          <button onClick={onAssess} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', background: p.primary, color: 'white', fontFamily: FONT.ui, fontSize: 12.5, fontWeight: 700, flexShrink: 0 }}>Assess</button>
        </div>
      </div>

      {decision ? (
        <>
          <div key={decision.decision} style={{ margin: '14px 20px 0', borderRadius: 14, background: VERDICT[decision.decision].grad, padding: '16px 18px', boxShadow: `0 8px 28px ${VERDICT[decision.decision].shadow}`, position: 'relative', overflow: 'hidden', animation: 'fade-in-up 0.35s ease-out both' }}>
            <div style={{ position: 'absolute', top: -24, right: -20, width: 90, height: 90, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, position: 'relative' }}>
              <div style={{ padding: '4px 12px', borderRadius: 6, background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.30)' }}>
                <span style={{ fontFamily: FONT.ui, fontSize: 11.5, fontWeight: 800, color: 'white', letterSpacing: '0.12em' }}>{VERDICT[decision.decision].label}</span>
              </div>
            </div>
            {decision.maxAmount > 0 ? (
              <>
                <div style={{ marginBottom: 10, position: 'relative' }}>
                  <span style={{ fontFamily: FONT.num, fontSize: 42, fontWeight: 700, color: 'white', lineHeight: 1, letterSpacing: '-1.5px' }}>RM {Math.round(decision.maxAmount).toLocaleString('en-MY')}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', position: 'relative' }}>
                  <div style={{ padding: '4px 11px', borderRadius: 6, background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.22)' }}>
                    <span style={{ fontFamily: FONT.num, fontSize: 13, fontWeight: 600, color: 'white' }}>RM {Math.round(decision.installment).toLocaleString('en-MY')} / mo</span>
                  </div>
                  <span style={{ fontFamily: FONT.ui, fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>{decision.decision === 'refer' ? 'pending manual review' : 'estimated installment'}</span>
                </div>
              </>
            ) : (
              <p style={{ fontFamily: FONT.ui, fontSize: 18, fontWeight: 800, color: 'white', lineHeight: 1.25, position: 'relative' }}>No offer at this amount</p>
            )}
          </div>

          <div style={{ padding: '14px 20px 0', flex: 1 }}>
            <SectionLabel color={p.ink3}>Audit Trail</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {decision.reasons.map((reason, i) => (
                <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                  <span style={{ fontFamily: FONT.mono, fontSize: 10, fontWeight: 600, color: p.primary, lineHeight: 1.6, minWidth: 20, textAlign: 'right', flexShrink: 0 }}>{String(i + 1).padStart(2, '0')}</span>
                  <div style={{ width: 1, background: p.accentSoft, alignSelf: 'stretch', marginTop: 3 }} />
                  <p style={{ fontFamily: FONT.mono, fontSize: 10.5, lineHeight: 1.55, color: p.ink1 }}>{reason}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div style={{ padding: '20px', flex: 1 }}>
          <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3, lineHeight: 1.6 }}>This passport doesn&apos;t carry an affordability assessment, so no automated decision can be run. Verify a passport issued with assessment data.</p>
        </div>
      )}

      <div style={{ padding: '12px 20px 15px', borderTop: `1px solid ${p.hairline}`, marginTop: 'auto' }}>
        <p style={{ fontFamily: FONT.ui, fontSize: 9.5, color: p.ink3, lineHeight: 1.55 }}>Decision is deterministic and auditable under the <strong style={{ color: p.ink2 }}>Consumer Credit Act 2025</strong>.</p>
      </div>
    </div>
  );
}

function RightAlert({ p }: { p: Palette }) {
  return (
    <div style={{ width: 340, background: p.surface, borderLeft: `1px solid ${p.hairline}`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <div style={{ padding: '14px 20px 11px', borderBottom: `1px solid ${p.hairline}` }}>
        <SectionLabel color={p.ink3}>Loan Decision Engine</SectionLabel>
        <p style={{ fontFamily: FONT.ui, fontSize: 11, color: p.ink3 }}>Deterministic · policy-enforced · audit-ready</p>
      </div>
      <div style={{ padding: '14px 20px 0' }}>
        <label style={{ fontFamily: FONT.ui, fontSize: 11, fontWeight: 600, color: p.ink2, display: 'block', marginBottom: 6 }}>Requested amount (RM)</label>
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
            <span style={{ fontFamily: FONT.ui, fontSize: 11.5, fontWeight: 800, color: 'white', letterSpacing: '0.14em' }}>REFER</span>
          </div>
        </div>
        <p style={{ fontFamily: FONT.ui, fontSize: 20, fontWeight: 800, color: 'white', lineHeight: 1.2, marginBottom: 10 }}>Manual review required</p>
        <div style={{ padding: '5px 12px', borderRadius: 7, background: 'rgba(0,0,0,0.18)', border: '1px solid rgba(255,255,255,0.20)', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontFamily: FONT.ui, fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>Auto-approval blocked · escalated</span>
        </div>
      </div>
      <div style={{ padding: '14px 20px 0', flex: 1 }}>
        <SectionLabel color={p.ink3}>Audit Trail</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 8 }}>
          {AUDIT_REFER.map((reason, i) => (
            <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
              <span style={{ fontFamily: FONT.mono, fontSize: 10, fontWeight: 600, color: p.amber, lineHeight: 1.6, minWidth: 20, textAlign: 'right', flexShrink: 0 }}>{String(i + 1).padStart(2, '0')}</span>
              <div style={{ width: 1, background: '#f5d990', alignSelf: 'stretch', marginTop: 3 }} />
              <p style={{ fontFamily: FONT.mono, fontSize: 10.5, lineHeight: 1.55, color: p.ink1 }}>{reason}</p>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: 9, background: '#fffcf2', border: '1px solid #f5d990' }}>
          <p style={{ fontFamily: FONT.ui, fontSize: 10.5, color: '#7a5c00', lineHeight: 1.6, fontStyle: 'italic' }}>A hard adverse record would auto-decline; suspected fabrication routes to a human.</p>
        </div>
      </div>
      <div style={{ padding: '12px 20px 15px', borderTop: `1px solid ${p.hairline}`, marginTop: 'auto' }}>
        <p style={{ fontFamily: FONT.ui, fontSize: 9.5, color: p.ink3, lineHeight: 1.55 }}>Decision is deterministic and auditable under the <strong style={{ color: p.ink2 }}>Consumer Credit Act 2025</strong>.</p>
      </div>
    </div>
  );
}

function CapitalMarkets({ p }: { p: Palette }) {
  return (
    <div style={{ flex: 1, background: p.bg, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '20px 40px 18px', background: p.surface, borderBottom: `1px solid ${p.hairline}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <div>
            <SectionLabel color={p.ink3}>Capital Markets · Pool Structure</SectionLabel>
            <h2 style={{ fontFamily: FONT.ui, fontSize: 22, fontWeight: 800, color: p.ink1, letterSpacing: '-0.4px', marginTop: 4, marginBottom: 5 }}>AI-Structured Micro-Sukuk</h2>
            <p style={{ fontFamily: FONT.ui, fontSize: 11.5, color: p.ink3 }}>Tranched by deterministic loss-waterfall · Shariah-compliant profit-sharing</p>
          </div>
          <div style={{ padding: '8px 16px', borderRadius: 9, background: p.accentSoft, display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: p.primary }} />
            <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.accentInk }}>Funds the informal economy, safely.</span>
          </div>
        </div>
      </div>

      <div style={{ background: 'linear-gradient(135deg, #0e1812 0%, #17211a 100%)', padding: '22px 40px', display: 'flex', alignItems: 'stretch', flexShrink: 0, flexWrap: 'wrap', gap: 16 }}>
        {POOL_STATS.map((s, i) => (
          <React.Fragment key={s.label}>
            <div style={{ flex: 1, minWidth: 120, display: 'flex', flexDirection: 'column', gap: 7 }}>
              <span style={{ fontFamily: FONT.ui, fontSize: 9.5, fontWeight: 600, color: 'rgba(255,255,255,0.38)', letterSpacing: '0.10em', textTransform: 'uppercase' }}>{s.label}</span>
              <span style={{ fontFamily: FONT.num, fontSize: 30, fontWeight: 700, color: 'white', letterSpacing: '-0.5px', lineHeight: 1 }}>{s.value}</span>
            </div>
            {i < POOL_STATS.length - 1 && <div style={{ width: 1, background: 'rgba(255,255,255,0.08)' }} />}
          </React.Fragment>
        ))}
      </div>

      <div style={{ padding: '22px 40px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 10 }}>
          <SectionLabel color={p.ink3}>Loss-Waterfall Structure</SectionLabel>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            {TRANCHES.map((tr) => (
              <div key={tr.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: tr.color }} />
                <span style={{ fontFamily: FONT.ui, fontSize: 11, fontWeight: 500, color: p.ink2 }}>{tr.name[0] + tr.name.slice(1).toLowerCase()} {tr.pct}%</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ height: 32, borderRadius: 8, overflow: 'hidden', display: 'flex', gap: 2, boxShadow: '0 4px 14px rgba(16,32,24,0.14)' }}>
          {TRANCHES.map((tr) => (
            <div key={tr.name} style={{ width: `${tr.pct}%`, background: tr.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: FONT.num, fontSize: 11.5, fontWeight: 700, color: 'white' }}>{tr.pct}%</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          <span style={{ fontFamily: FONT.ui, fontSize: 10, color: p.ink3 }}>← Senior absorbs losses last (safest)</span>
          <span style={{ fontFamily: FONT.ui, fontSize: 10, color: p.ink3 }}>(highest risk) Subordinated absorbs losses first →</span>
        </div>
      </div>

      <div style={{ padding: '18px 40px 0', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, flexShrink: 0 }}>
        {TRANCHES.map((tr, i) => (
          <div key={tr.name} style={{ background: tr.tint, borderRadius: 14, border: `1.5px solid ${tr.border}`, padding: '18px 20px', boxShadow: p.shadow, display: 'flex', flexDirection: 'column', gap: 12, animation: 'fade-in-up 0.4s ease-out both', animationDelay: `${i * 70}ms` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: FONT.ui, fontSize: 10.5, fontWeight: 700, color: tr.color, letterSpacing: '0.10em', textTransform: 'uppercase' }}>{tr.name}</span>
              <div style={{ padding: '4px 12px', borderRadius: 7, background: tr.ratingBg, border: `1.5px solid ${tr.border}` }}>
                <span style={{ fontFamily: FONT.num, fontSize: 15, fontWeight: 700, color: tr.ratingColor }}>{tr.rating}</span>
              </div>
            </div>
            <div style={{ height: 1, background: tr.border }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
              <div>
                <p style={{ fontFamily: FONT.ui, fontSize: 9.5, color: p.ink3, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>Size</p>
                <p style={{ fontFamily: FONT.num, fontSize: 17, fontWeight: 700, color: p.ink1 }}>{tr.size}</p>
              </div>
              <div>
                <p style={{ fontFamily: FONT.ui, fontSize: 9.5, color: p.ink3, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>Slice</p>
                <p style={{ fontFamily: FONT.num, fontSize: 17, fontWeight: 700, color: tr.color }}>{tr.pct}%</p>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <p style={{ fontFamily: FONT.ui, fontSize: 9.5, color: p.ink3, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>Profit rate p.a.</p>
                <p style={{ fontFamily: FONT.num, fontSize: 26, fontWeight: 700, color: tr.color, lineHeight: 1 }}>{tr.profit}</p>
              </div>
            </div>
            <div style={{ padding: '8px 11px', borderRadius: 7, background: 'rgba(255,255,255,0.65)', border: `1px solid ${tr.border}` }}>
              <p style={{ fontFamily: FONT.mono, fontSize: 10.5, color: p.ink2, lineHeight: 1.55 }}>{tr.reason}</p>
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: '16px 40px 24px', marginTop: 'auto' }}>
        <div style={{ padding: '11px 18px', borderRadius: 10, background: p.surface, border: `1px solid ${p.hairline}`, boxShadow: p.shadow }}>
          <p style={{ fontFamily: FONT.ui, fontSize: 11, color: p.ink3, lineHeight: 1.6 }}>Ratings computed deterministically from pool expected loss — a <strong style={{ color: p.ink2 }}>weaker pool is downgraded, not rubber-stamped</strong>.</p>
        </div>
      </div>
    </div>
  );
}

export default function Console() {
  const [tab, setTab] = useState<Tab>('verify');
  const [code, setCode] = useState(SAMPLE_CODE);
  const [amount, setAmount] = useState('10,000');
  const [flagged, setFlagged] = useState(false);
  const [state, setState] = useState<ViewState>(() => evaluate(SAMPLE_CODE, '10,000'));

  const onVerify = () => {
    setFlagged(false);
    setState(evaluate(code, amount));
  };
  const onLoadSample = () => {
    setFlagged(false);
    setCode(SAMPLE_CODE);
    setState(evaluate(SAMPLE_CODE, amount));
  };
  const onLoadFlagged = () => {
    setFlagged(true);
    setCode(SUSPECT_CODE);
  };
  const onAssess = () => {
    if (state.status === 'valid') setState({ ...state, decision: decisionFor(state.passport, amount) });
  };

  const showAlert = tab === 'verify' && flagged;
  const p = palette(showAlert);
  const statusValid = flagged ? false : state.status === 'valid' ? true : false;

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: p.bg }}>
      <Header p={p} tab={tab} setTab={setTab} alert={showAlert} />
      {showAlert && <AlertBanner />}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {tab === 'verify' ? (
          <>
            <LeftPanel p={p} flagged={flagged} statusValid={flagged ? false : statusValid} code={code} setCode={setCode} onVerify={onVerify} onLoadSample={onLoadSample} onLoadFlagged={onLoadFlagged} />
            {showAlert ? <CenterAlert p={p} /> : state.status === 'valid' ? <VerifiedCenter p={p} passport={state.passport} /> : <InvalidCenter p={p} reasons={state.reasons} />}
            {showAlert ? <RightAlert p={p} /> : state.status === 'valid' ? <RightDecision p={p} decision={state.decision} amount={amount} setAmount={setAmount} onAssess={onAssess} /> : <RightDecision p={p} decision={null} amount={amount} setAmount={setAmount} onAssess={onAssess} />}
          </>
        ) : (
          <CapitalMarkets p={palette(false)} />
        )}
      </div>
    </div>
  );
}
