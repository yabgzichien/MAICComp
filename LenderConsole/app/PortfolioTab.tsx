'use client';

// Portfolio tab (Brief Q): the lender's approved book  exposure, weighted risk, expected
// loss, band/purpose breakdowns, and concentration warnings  with a bridge action that
// structures the live book in Capital Markets. No new risk math: buildPortfolio maps the
// approved-applications store into the pool shape and reuses securitization.ts's aggregates.

import React, { useMemo, useState } from 'react';
import { FONT, type Palette } from './tokens';
import { InfoButton, InfoModal, MiniBar, SectionLabel } from './shared';
import { TourAnchor } from './TourAnchor';
import { buildPortfolio, type BreakdownRow } from '../lib/portfolio';
import { buildPerformance, type CohortRow } from '../lib/performance';
import { formatPoolMoney } from '../lib/poolView';
import type { ApplicationRecord } from '../lib/applications';

const pct1 = (x: number): string => `${(x * 100).toFixed(1)}%`;
const pct2 = (x: number): string => `${(x * 100).toFixed(2)}%`;
const rm = (n: number): string => `RM${Math.round(n).toLocaleString('en-MY')}`;

function BreakdownTable({ p, title, rows, accent }: { p: Palette; title: string; rows: BreakdownRow[]; accent: string }) {
  return (
    <div style={{ background: p.surface, borderRadius: 12, padding: '14px 16px', boxShadow: p.shadow, flex: 1, minWidth: 280 }}>
      <SectionLabel color={p.ink2}>{title}</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 8 }}>
        {rows.length === 0 && <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3 }}>No approved loans yet.</p>}
        {rows.map((r) => (
          <div key={r.label} style={{ display: 'grid', gridTemplateColumns: '1.1fr 90px 60px', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 500, color: p.ink1 }}>{r.label}</span>
            <MiniBar pct={r.pct * 100} color={accent} track={p.hairline} />
            <span style={{ fontFamily: FONT.num, fontSize: 12, color: p.ink2, textAlign: 'right' }}>
              {formatPoolMoney(r.exposure)} · {Math.round(r.pct * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Verdict-first read of a band's realized loss against what the risk model predicted
 *  figures come second, mirroring the forensics table's verdict-first precedent. A cohort
 *  under the small-sample threshold never gets a confident verdict, honest or otherwise. */
function perfVerdict(row: CohortRow): { text: string; color: string } {
  if (row.smallSample) return { text: 'Too few loans yet to judge', color: '#5d6b63' };
  if (row.realizedLossRate <= row.expectedLossRate) return { text: 'Performing better than predicted', color: '#1f8a5b' };
  return { text: "Underperforming its risk model", color: '#c0392b' };
}

function PerformanceStat({ label, value, info, onInfo }: { label: string; value: string; info: string; onInfo: (entry: string) => void }) {
  return (
    <div style={{ flex: 1, minWidth: 110, display: 'flex', flexDirection: 'column', gap: 7 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: FONT.ui, fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.38)', letterSpacing: '0.10em', textTransform: 'uppercase' }}>
        {label}
        <InfoButton entry={info} onOpen={onInfo} dark />
      </span>
      <span style={{ fontFamily: FONT.num, fontSize: 27, fontWeight: 700, color: 'white', letterSpacing: '-0.5px', lineHeight: 1 }}>{value}</span>
    </div>
  );
}

function PerformanceTable({ p, rows, onInfo }: { p: Palette; rows: CohortRow[]; onInfo: (entry: string) => void }) {
  return (
    <div style={{ background: p.surface, borderRadius: 12, padding: '14px 16px', boxShadow: p.shadow }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <SectionLabel color={p.ink2}>Repayment Performance by Band</SectionLabel>
        <InfoButton entry="cohort" onOpen={onInfo} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '90px 60px 1fr 100px', gap: 10, padding: '4px 6px', borderBottom: `1px solid ${p.hairline}`, marginBottom: 4 }}>
        {['Band', 'Loans', 'Verdict', 'On-time / Collected'].map((h) => (
          <span key={h} style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 600, color: p.ink3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</span>
        ))}
      </div>
      {rows.map((r) => {
        const verdict = perfVerdict(r);
        return (
          <div key={r.band} style={{ display: 'grid', gridTemplateColumns: '90px 60px 1fr 100px', gap: 10, alignItems: 'center', padding: '8px 6px', borderBottom: `1px solid ${p.hairline}` }}>
            <span style={{ fontFamily: FONT.ui, fontSize: 12.5, fontWeight: 700, color: p.ink1 }}>{r.band}</span>
            <span style={{ fontFamily: FONT.num, fontSize: 12, color: p.ink2 }}>{r.loanCount}</span>
            <div>
              <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: verdict.color }}>{verdict.text}</span>
              {!r.smallSample && (
                <p style={{ fontFamily: FONT.num, fontSize: 12, color: p.ink3, marginTop: 1 }}>
                  realized {pct2(r.realizedLossRate)} vs expected {pct2(r.expectedLossRate)}
                </p>
              )}
            </div>
            <span style={{ fontFamily: FONT.num, fontSize: 12, color: p.ink2, textAlign: 'right' }}>
              {pct1(r.onTimeRate)} · {pct1(r.collectionRate)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PerformanceSection({ p, apps }: { p: Palette; apps: ApplicationRecord[] }) {
  const perf = useMemo(() => buildPerformance(apps), [apps]);
  const [info, setInfo] = useState<string | null>(null);

  if (perf.loanCount === 0) return null;

  return (
    <div style={{ padding: '4px 40px 8px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <InfoModal entry={info} onClose={() => setInfo(null)} p={p} />
      <SectionLabel color={p.ink2}>Performance · The Validation Loop</SectionLabel>

      {!perf.hasRepaymentData ? (
        <div style={{ padding: '18px 20px', borderRadius: 12, background: p.surface, border: `1px solid ${p.hairline}`, boxShadow: p.shadow }}>
          <p style={{ fontFamily: FONT.ui, fontSize: 13, fontWeight: 700, color: p.ink1, marginBottom: 4 }}>No repayments recorded yet</p>
          <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3, lineHeight: 1.55 }}>
            Performance appears here once the first instalment on an approved loan comes due and is recorded.
          </p>
        </div>
      ) : (
        <>
          <div style={{ background: 'linear-gradient(135deg, #0e1812 0%, #17211a 100%)', borderRadius: 12, padding: '18px 22px', display: 'flex', alignItems: 'stretch', flexWrap: 'wrap', gap: 16 }}>
            <PerformanceStat label="Collection Rate" value={pct1(perf.collectionRate)} info="collection_rate" onInfo={setInfo} />
            <PerformanceStat label="On-Time Rate" value={pct1(perf.onTimeRate)} info="on_time_rate" onInfo={setInfo} />
            <PerformanceStat label="Realized vs Expected Loss" value={`${pct2(perf.realizedLossRate)} / ${pct2(perf.expectedLossRate)}`} info="realized_loss" onInfo={setInfo} />
            <PerformanceStat label="Interest Collected" value={rm(perf.interestCollected)} info="interest_collected" onInfo={setInfo} />
          </div>
          <PerformanceTable p={p} rows={perf.bands} onInfo={setInfo} />
        </>
      )}
    </div>
  );
}

export default function PortfolioTab({ p, apps, onStructure }: { p: Palette; apps: ApplicationRecord[]; onStructure: () => void }) {
  const book = useMemo(() => buildPortfolio(apps), [apps]);
  const empty = book.loanCount === 0;

  const stats: { label: string; value: string }[] = [
    { label: 'Total Exposure', value: formatPoolMoney(book.totalExposure) },
    { label: 'Approved Loans', value: book.loanCount.toLocaleString('en-MY') },
    { label: 'Wtd-Avg Score', value: empty ? '' : String(Math.round(book.weightedAvgScore)) },
    { label: 'Wtd-Avg PD', value: empty ? '' : pct1(book.weightedAvgPD) },
    { label: 'Expected Loss', value: empty ? '' : pct2(book.expectedLossRate) },
    { label: 'Wtd Data Confidence', value: empty ? '' : pct1(book.weightedAvgConfidence) },
  ];

  return (
    <div style={{ flex: 1, background: p.bg, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '20px 40px 18px', background: p.surface, borderBottom: `1px solid ${p.hairline}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <div>
            <SectionLabel color={p.ink2}>Portfolio · Approved Book</SectionLabel>
            <h2 style={{ fontFamily: FONT.ui, fontSize: 22, fontWeight: 800, color: p.ink1, letterSpacing: '-0.4px', marginTop: 4, marginBottom: 5 }}>Loan Book Overview</h2>
            <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3, maxWidth: 620, lineHeight: 1.5 }}>
              Every loan you approve in the pipeline books here. Structure it into rated tranches in one click: <strong style={{ color: p.ink2 }}>approve → book → securitize</strong>, one continuous flow.
            </p>
          </div>
          <button
            onClick={onStructure}
            disabled={empty}
            style={{ padding: '10px 20px', borderRadius: 9, border: 'none', cursor: empty ? 'not-allowed' : 'pointer', background: empty ? 'rgba(20,40,30,0.12)' : p.accentInk, color: 'white', fontFamily: FONT.ui, fontSize: 12.5, fontWeight: 700, flexShrink: 0 }}
            title={empty ? 'Approve loans in the pipeline first' : 'Structure the live book in Capital Markets'}
          >
            Structure this pool →
          </button>
        </div>
      </div>

      {/* Headline cells  same dark grammar as the Capital Markets pool summary. */}
      <div style={{ background: 'linear-gradient(135deg, #0e1812 0%, #17211a 100%)', padding: '22px 40px', display: 'flex', alignItems: 'stretch', flexShrink: 0, flexWrap: 'wrap', gap: 16 }}>
        {stats.map((s, i) => (
          <React.Fragment key={s.label}>
            <div style={{ flex: 1, minWidth: 110, display: 'flex', flexDirection: 'column', gap: 7 }}>
              <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.38)', letterSpacing: '0.10em', textTransform: 'uppercase' }}>{s.label}</span>
              <span style={{ fontFamily: FONT.num, fontSize: 27, fontWeight: 700, color: 'white', letterSpacing: '-0.5px', lineHeight: 1 }}>{s.value}</span>
            </div>
            {i < stats.length - 1 && <div style={{ width: 1, background: 'rgba(255,255,255,0.08)' }} />}
          </React.Fragment>
        ))}
      </div>

      {empty ? (
        <div style={{ padding: '40px', flex: 1 }}>
          <div style={{ maxWidth: 520, padding: '18px 20px', borderRadius: 12, background: p.surface, border: `1px solid ${p.hairline}`, boxShadow: p.shadow }}>
            <p style={{ fontFamily: FONT.ui, fontSize: 13, fontWeight: 700, color: p.ink1, marginBottom: 6 }}>No approved loans yet</p>
            <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3, lineHeight: 1.6 }}>
              Approve applications on the Verify tab (or seed the pipeline) and they book here automatically. The Capital Markets tab shows the illustrative sample pool until then.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Concentration warnings */}
          {book.concentrations.length > 0 && (
            <div style={{ padding: '16px 40px 0', flexShrink: 0 }}>
              {book.concentrations.map((c, i) => (
                <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'center', padding: '9px 14px', borderRadius: 9, background: '#fdf3dc', border: '1px solid #f5d990', marginBottom: 8 }}>
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                    <path d="M8 1.5L1 14h14L8 1.5z" fill="#fbe6b0" stroke="#b87000" strokeWidth="1.3" strokeLinejoin="round" />
                    <line x1="8" y1="6" x2="8" y2="10" stroke="#b87000" strokeWidth="1.5" strokeLinecap="round" />
                    <circle cx="8" cy="12" r="0.85" fill="#b87000" />
                  </svg>
                  <p style={{ fontFamily: FONT.ui, fontSize: 12, color: '#7a5c00', lineHeight: 1.5 }}>
                    <strong>Concentration:</strong> {Math.round(c.pct * 100)}% of exposure is {c.kind === 'band' ? `${c.label}-band` : `for "${c.label}"`}  above the {Math.round(0.4 * 100)}% guidance. Diversify before scaling this pool.
                  </p>
                </div>
              ))}
            </div>
          )}

          <TourAnchor id="portfolio-bands">
          <div style={{ padding: '18px 40px 8px', display: 'flex', gap: 16, flexWrap: 'wrap', flexShrink: 0 }}>
            <BreakdownTable p={p} title="Exposure by Credit Band" rows={book.bandBreakdown} accent={p.primary} />
            <BreakdownTable p={p} title="Exposure by Declared Purpose" rows={book.purposeBreakdown} accent="#3b5bdb" />
          </div>
          </TourAnchor>

          <TourAnchor id="portfolio-performance">
            <PerformanceSection p={p} apps={apps} />
          </TourAnchor>

          <div style={{ padding: '4px 40px 24px', marginTop: 'auto' }}>
            <div style={{ padding: '11px 18px', borderRadius: 10, background: p.surface, border: `1px solid ${p.hairline}`, boxShadow: p.shadow }}>
              <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3, lineHeight: 1.6 }}>
                Pool risk comes from verified credit bands (approved loans already cleared the fraud and confidence gates). Confidence is shown for context. Declared purpose stands in for sector until verified occupation ships.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
