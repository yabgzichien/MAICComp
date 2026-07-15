'use client';

// Queue rail (Brief O)  the left edge of the two-pane workbench. Lists the four
// queues with counts and age badges; Referred shows oldest first (the pure
// orderQueue rule), because the longest-waiting file is the officer's next job.

import { useState } from 'react';
import { FONT, type Palette } from './tokens';
import { orderQueue, watchlistApplications, type ApplicationRecord, type ApplicationStatus } from '../lib/applications';
import { formatAgo } from '../lib/presentment';

const BAND_COLOR: Record<string, string> = {
  Building: '#c0392b',
  Fair: '#d98a00',
  Good: '#3b5bdb',
  Strong: '#1f8a5b',
  Excellent: '#1f8a5b',
};

/** Verdict-driving signal (P2.10): band + confidence, so an officer can triage a queue
 *  without opening every card. */
function VerdictChip({ p, app }: { p: Palette; app: ApplicationRecord }) {
  if (!app.band && app.confidencePct === undefined) return null;
  const color = app.band ? BAND_COLOR[app.band] ?? p.ink2 : p.ink2;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
      {app.band && (
        <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color }}>{app.band}</span>
      )}
      {app.confidencePct !== undefined && (
        <span style={{ fontFamily: FONT.num, fontSize: 12, color: p.ink3 }}>· {app.confidencePct}% confidence</span>
      )}
    </span>
  );
}

const QUEUES: { status: ApplicationStatus; label: string }[] = [
  { status: 'new', label: 'New' },
  { status: 'referred', label: 'Referred' },
  { status: 'approved', label: 'Approved' },
  { status: 'declined', label: 'Declined' },
];

const STATUS_COLOR: Record<ApplicationStatus, string> = {
  new: '#3b5bdb',
  referred: '#d98a00',
  approved: '#1f8a5b',
  declined: '#c0392b',
};

const rm = (n: number): string => `RM${Math.round(n).toLocaleString('en-MY')}`;

export default function QueueRail({
  p,
  apps,
  selectedId,
  onSelect,
  onSeed,
  onPasteNew,
}: {
  p: Palette;
  apps: ApplicationRecord[];
  selectedId: string | null;
  onSelect: (app: ApplicationRecord) => void;
  onSeed: () => void;
  onPasteNew: () => void;
}) {
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const matches = (a: ApplicationRecord) => !q || a.applicantLabel.toLowerCase().includes(q) || a.id.toLowerCase().includes(q);

  return (
    <nav aria-label="Applicant pipeline" style={{ width: 212, background: p.surface2, borderRight: `1px solid ${p.hairline}`, display: 'flex', flexDirection: 'column', flexShrink: 0, overflowY: 'auto' }}>
      <div style={{ padding: '14px 12px 10px', borderBottom: `1px solid ${p.hairline}` }}>
        <p role="heading" aria-level={2} style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.ink2, letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 8 }}>Pipeline</p>
        {apps.length > 0 && (
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search applicant…"
            style={{ width: '100%', padding: '6px 9px', borderRadius: 7, border: `1px solid ${p.hairline}`, fontFamily: FONT.ui, fontSize: 12, color: p.ink1, background: p.surface, outline: 'none', marginBottom: 8 }}
          />
        )}
        <button
          onClick={onPasteNew}
          style={{ width: '100%', padding: '7px 0', borderRadius: 8, border: `1.5px dashed ${p.hairline}`, cursor: 'pointer', background: 'transparent', fontFamily: FONT.ui, fontSize: 12, fontWeight: 600, color: p.ink2 }}
        >
          + Paste new application
        </button>
      </div>

      {apps.length === 0 && (
        <div style={{ padding: '14px 12px' }}>
          <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink2, lineHeight: 1.55, marginBottom: 9 }}>
            No applications yet. Verifying a passport files one automatically, or seed a demo pipeline:
          </p>
          <button
            onClick={onSeed}
            style={{ width: '100%', padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer', background: p.accentInk, color: 'white', fontFamily: FONT.ui, fontSize: 12, fontWeight: 700 }}
          >
            Seed demo pipeline
          </button>
        </div>
      )}

      {(() => {
        const watchlist = watchlistApplications(apps).filter(matches);
        if (watchlist.length === 0) return null;
        return (
          <div style={{ padding: '10px 8px 4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px', marginBottom: 5 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: '#c0392b', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#c0392b', display: 'inline-block' }} />
                Watchlist
              </span>
              <span style={{ fontFamily: FONT.num, fontSize: 12, fontWeight: 700, color: '#c0392b' }}>{watchlist.length}</span>
            </div>
            {watchlist.map((a) => {
              const selected = a.id === selectedId;
              const latest = a.checkIns![a.checkIns!.length - 1];
              const critical = latest.flags.some((f) => f.severity === 'critical');
              return (
                <button
                  key={a.id}
                  onClick={() => onSelect(a)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '7px 9px',
                    marginBottom: 4,
                    borderRadius: 8,
                    cursor: 'pointer',
                    border: selected ? '1.5px solid #c0392b' : '1px solid #f0c4bd',
                    background: selected ? '#fdecea' : '#fff8f7',
                  }}
                >
                  <p style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.ink1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.applicantLabel}</p>
                  <p style={{ fontFamily: FONT.ui, fontSize: 12, color: critical ? '#c0392b' : '#a3791f', marginTop: 2, fontWeight: 600 }}>
                    {latest.flags.length} flag(s){critical ? ' · critical' : ''}
                  </p>
                </button>
              );
            })}
          </div>
        );
      })()}

      {q && watchlistApplications(apps).filter(matches).length === 0 && QUEUES.every(({ status }) => orderQueue(apps, status).filter(matches).length === 0) && (
        <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3, padding: '10px 12px' }}>No applicants match &quot;{search}&quot;.</p>
      )}

      {QUEUES.map(({ status, label }) => {
        const queue = orderQueue(apps, status).filter(matches);
        if (q && queue.length === 0) return null;
        return (
          <div key={status} style={{ padding: '10px 8px 4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px', marginBottom: 5 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.ink2, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR[status], display: 'inline-block' }} />
                {label}
              </span>
              <span style={{ fontFamily: FONT.num, fontSize: 12, fontWeight: 700, color: queue.length > 0 ? p.ink1 : p.ink3 }}>{queue.length}</span>
            </div>
            {queue.map((a) => {
              const selected = a.id === selectedId;
              return (
                <button
                  key={a.id}
                  onClick={() => onSelect(a)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '7px 9px',
                    marginBottom: 4,
                    borderRadius: 8,
                    cursor: 'pointer',
                    border: selected ? `1.5px solid ${p.primary}` : `1px solid ${p.hairline}`,
                    background: selected ? p.accentTint : p.surface,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <span style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.ink1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{a.applicantLabel}</span>
                    {a.source === 'direct' && (
                      <span
                        title="Submitted by the borrower via direct apply. No officer transcribed this"
                        style={{
                          fontFamily: FONT.ui,
                          fontSize: 12,
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          padding: '1px 4px',
                          borderRadius: 4,
                          background: '#d3f9d8',
                          color: '#2b8a3e',
                          marginLeft: 4,
                          flexShrink: 0
                        }}
                      >
                        direct
                      </span>
                    )}
                  </div>
                  <p style={{ fontFamily: FONT.num, fontSize: 12, color: p.ink2, marginTop: 2 }}>
                    {rm(a.requestedAmount)} · filed {formatAgo(a.filedAt)}
                  </p>
                  <VerdictChip p={p} app={a} />
                </button>
              );
            })}
          </div>
        );
      })}

      <div style={{ marginTop: 'auto', padding: '10px 12px' }}>
        <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink2, lineHeight: 1.5 }}>
          Age badges show time since filing.
        </p>
      </div>
    </nav>
  );
}
