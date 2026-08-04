'use client';

// Queue rail (Brief O; rescoped 2026-07-18 console IA split)  the left edge of the
// two-pane workbench. Pure triage: New and Referred are the officer's actual work,
// shown expanded; Declined is a collapsed Archive (its one real revisit case is
// generating an adverse-action letter). Accepted loans and the Watchlist live on the
// Servicing tab, which owns the disbursed book operationally.
//
// Offered (borrower acceptance, 2026-07-21) sits between the two: approved on policy but not
// yet taken up. It is not the officer's decision to make, so it isn't a triage queue — but it
// is visible here because the alternative is what shipped before, where an engine-approved
// direct application appeared nowhere at all on this tab and silently showed up in Servicing
// as a live loan the borrower had never agreed to.

import { useState } from 'react';
import { FONT, type Palette } from './tokens';
import { orderQueue, type ApplicationRecord, type ApplicationStatus } from '../lib/applications';
import { awaitingAcceptance, declinedByBorrower, type OfferBook } from '../lib/offerAcceptance';
import { formatAgo } from '../lib/presentment';
import { currentStandingAcross } from '../lib/repaymentStanding';
import { TourAnchor } from './TourAnchor';
import { useTourLocked } from './tourContext';

const BAND_COLOR: Record<string, string> = {
  Building: '#c0392b',
  Fair: '#d98a00',
  Good: '#3b5bdb',
  Strong: '#1f8a5b',
  Excellent: '#1f8a5b',
};

// Own-book repayment standing badge (Task 11): color comes from the themed Palette (p.amber/
// p.red, AA-audited in tokens.ts) rather than a static hex map, unlike BAND_COLOR/STATUS_COLOR
// above — those predate the contrast-audit pass and are out of scope to retrofit here.
const STANDING_LABEL: Record<string, string> = { slipping: '1 mo behind', arrears: '2 mo behind', impaired: 'Impaired' };

/** Verdict-driving signal (P2.10): band + confidence, so an officer can triage a queue
 *  without opening every card. Triage-only cards (New/Referred)  archived/serviced
 *  cards don't carry this; the detail pane shows it the moment the file opens. */
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
];

const STATUS_COLOR: Record<ApplicationStatus, string> = {
  new: '#3b5bdb',
  referred: '#d98a00',
  approved: '#1f8a5b',
  declined: '#c0392b',
};

const rm = (n: number): string => `RM${Math.round(n).toLocaleString('en-MY')}`;

/** Why a queue card is dead mid-tour. The script memos and decides on the SELECTED
 *  application, so letting the judge pick a neighbouring file would silently re-point the rest
 *  of act 7 at a file the narration is not about. */
const QUEUE_LOCK_TITLE = 'The guided tour is following your own application.';

function QueueCard({ p, a, selected, onSelect, standingBucket, locked = false }: { p: Palette; a: ApplicationRecord; selected: boolean; onSelect: () => void; standingBucket?: 'slipping' | 'arrears' | 'impaired'; locked?: boolean }) {
  // The cross-app tour spotlights the application the judge sent themselves, so act 7's "open
  // the file you sent" points at one card among a seeded deskful. TourAnchor renders
  // `display: contents`, so wrapping changes no layout; a card that is not the direct one is
  // returned bare rather than anchored.
  const card = (
    <button
      onClick={onSelect}
      disabled={locked}
      title={locked ? QUEUE_LOCK_TITLE : undefined}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '7px 9px',
        marginBottom: 4,
        borderRadius: 8,
        cursor: locked ? 'not-allowed' : 'pointer',
        border: selected ? `1.5px solid ${p.primary}` : `1px solid ${p.hairline}`,
        background: selected ? p.accentTint : p.surface,
        ...(locked ? { opacity: 0.45, filter: 'grayscale(0.5)' } : {}),
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
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              padding: '1px 5px',
              borderRadius: 4,
              background: 'transparent',
              border: `1px solid ${p.hairline}`,
              color: p.ink2,
              marginLeft: 4,
              flexShrink: 0,
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
      {standingBucket && (
        <span style={{ display: 'inline-block', marginTop: 3, fontFamily: FONT.ui, fontSize: 11, fontWeight: 700, color: standingBucket === 'impaired' ? p.red : p.amber }}>
          {STANDING_LABEL[standingBucket]}
        </span>
      )}
    </button>
  );
  return a.source === 'direct' ? <TourAnchor id="direct-file">{card}</TourAnchor> : card;
}

export default function QueueRail({
  p,
  apps,
  offerBook,
  selectedId,
  onSelect,
  onSeed,
  onLoadFlagged,
  forceSeedButton = false,
  lockedToAppId = null,
}: {
  p: Palette;
  apps: ApplicationRecord[];
  /** This lender's published offers, keyed by subject (borrower acceptance, 2026-07-21).
   *  Drives the "Offered" section below. Empty until the book loads, or when the console is
   *  offline — the rail then just shows the two triage queues as it always did. */
  offerBook: OfferBook;
  selectedId: string | null;
  onSelect: (app: ApplicationRecord) => void;
  onSeed: () => void;
  /** Loads the fabricated demo passport into the verifier, switching the console to its alert
   *  view. Optional so the rail still renders without it. */
  onLoadFlagged?: () => void;
  /** The console tour keeps the seed button visible even on a non-empty pipeline so the
   *  "seed the pipeline" step stays completable on a restart. */
  forceSeedButton?: boolean;
  /** While the tour runs, the id of the one application it is about: every other card is
   *  disabled so the rest of act 7 cannot be re-pointed at a file the narration is not about
   *  (see `QUEUE_LOCK_TITLE`). Null when no tour is running — the rail is then a normal rail. */
  lockedToAppId?: string | null;
}) {
  const [search, setSearch] = useState('');
  const [archiveOpen, setArchiveOpen] = useState(false);
  // Both are their own do-step's control, so the script holds them until it asks.
  const seedLocked = useTourLocked('seed-button');
  const flaggedLocked = useTourLocked('load-flagged');
  const directFileLocked = useTourLocked('direct-file');
  /** No tour → nothing locked. Otherwise the followed file opens when act 7 asks for it, and
   *  every neighbouring file stays shut for the whole run. */
  const cardLocked = (a: ApplicationRecord): boolean =>
    lockedToAppId === null ? false : a.id === lockedToAppId ? directFileLocked : true;
  const q = search.trim().toLowerCase();
  const matches = (a: ApplicationRecord) => !q || a.applicantLabel.toLowerCase().includes(q) || a.id.toLowerCase().includes(q);

  const triageQueues = QUEUES.map(({ status, label }) => ({ status, label, queue: orderQueue(apps, status).filter(matches) }));
  const archived = orderQueue(apps, 'declined').filter(matches);
  // Approved on policy, not yet taken up (borrower acceptance, 2026-07-21). These are the files
  // that used to vanish: the engine approved them outright, so they skipped both triage queues
  // and landed in Servicing as loans nobody had agreed to. They are not the officer's decision
  // to make — hence a section of their own rather than a row in New — but the officer does need
  // to see that they exist and that nothing has been disbursed on them yet.
  const offered = awaitingAcceptance(apps, offerBook).filter(matches);
  // Offers the borrower turned down. They are off the book entirely (see liveBook) — but they
  // still need somewhere to live, or a file the officer worked would appear to have vanished.
  const notTakenUp = declinedByBorrower(apps, offerBook).filter(matches);
  const acceptedCount = apps.filter((a) => a.status === 'approved').length - offered.length - notTakenUp.length;
  const triageEmpty = triageQueues.every((t) => t.queue.length === 0) && offered.length === 0;

  // Display-only per-card own-book standing estimate (Task 11). The real tenor-aware value is
  // computed at assess time by Console.tsx's mergedStanding (Task 10); this is a queue-triage
  // signal only, so a fixed 12-month tenor assumption is fine here.
  const standingByApp: Map<string, 'slipping' | 'arrears' | 'impaired' | undefined> = new Map(
    apps.map((a) => {
      const siblings = apps
        .filter((x) => x.subject === a.subject && x.status === 'approved')
        .map((x) => ({ app: x, tenorMonths: 12 }));
      const s = currentStandingAcross(siblings);
      return [a.id, s.bucket === 'clean' ? undefined : s.bucket] as const;
    })
  );

  return (
    <TourAnchor id="queue-rail">
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
        {/* Entry point to the fabricated-passport demo. `onLoadFlagged` and the whole alert view
            (AlertBanner / CenterAlert / RightAlert, and the `fraud-signals` anchor inside it)
            would otherwise be unreachable — nothing else calls setFlagged(true), so the "Catch a
            fraudster" act would narrate a screen that could never render. Lives on the rail
            because loading a passport into the verifier is a pipeline-level action. */}
        {onLoadFlagged && (
          <TourAnchor id="load-flagged">
            <button
              onClick={onLoadFlagged}
              disabled={flaggedLocked}
              title={flaggedLocked ? QUEUE_LOCK_TITLE : undefined}
              style={{ width: '100%', marginTop: 6, padding: '7px 0', borderRadius: 8, border: `1.5px dashed ${p.red}`, cursor: flaggedLocked ? 'not-allowed' : 'pointer', background: 'transparent', fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.red, ...(flaggedLocked ? { opacity: 0.45 } : {}) }}
            >
              ⚠ Load flagged applicant
            </button>
          </TourAnchor>
        )}
      </div>

      {(apps.length === 0 || forceSeedButton) && (
        <div style={{ padding: '14px 12px' }}>
          {apps.length === 0 && (
            <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink2, lineHeight: 1.55, marginBottom: 9 }}>
              No applications yet. Seed a demo pipeline:
            </p>
          )}
          <TourAnchor id="seed-button">
            <button
              onClick={onSeed}
              disabled={seedLocked}
              title={seedLocked ? QUEUE_LOCK_TITLE : undefined}
              style={{ width: '100%', padding: '8px 0', borderRadius: 8, border: 'none', cursor: seedLocked ? 'not-allowed' : 'pointer', background: p.accentInk, color: 'white', fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, ...(seedLocked ? { opacity: 0.45 } : {}) }}
            >
              Seed demo pipeline
            </button>
          </TourAnchor>
        </div>
      )}

      {q && triageEmpty && archived.length === 0 && (
        <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3, padding: '10px 12px' }}>No applicants match &quot;{search}&quot;.</p>
      )}

      {!q && triageEmpty && acceptedCount > 0 && (
        <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3, padding: '10px 12px', lineHeight: 1.5 }}>
          Nothing needs your review right now. {acceptedCount} loan{acceptedCount === 1 ? '' : 's'} in <strong style={{ color: p.ink2 }}>Servicing</strong>.
        </p>
      )}

      {offered.length > 0 && (
        <div style={{ padding: '10px 8px 4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px', marginBottom: 5 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.ink2, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR.approved, display: 'inline-block' }} />
              Offered
            </span>
            <span style={{ fontFamily: FONT.num, fontSize: 12, fontWeight: 700, color: p.ink1 }}>{offered.length}</span>
          </div>
          <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3, lineHeight: 1.45, padding: '0 4px 6px' }}>
            Waiting on the borrower. Not disbursed yet.
          </p>
          {offered.map((a) => (
            <QueueCard key={a.id} p={p} a={a} selected={a.id === selectedId} onSelect={() => onSelect(a)} standingBucket={standingByApp.get(a.id)} locked={cardLocked(a)} />
          ))}
        </div>
      )}

      {triageQueues.map(({ status, label, queue }) => {
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
            {queue.map((a) => (
              <QueueCard key={a.id} p={p} a={a} selected={a.id === selectedId} onSelect={() => onSelect(a)} standingBucket={standingByApp.get(a.id)} locked={cardLocked(a)} />
            ))}
          </div>
        );
      })}

      {notTakenUp.length > 0 && (
        <div style={{ padding: '10px 8px 4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px', marginBottom: 5 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.ink3, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.ink3, display: 'inline-block' }} />
              Not taken up
            </span>
            <span style={{ fontFamily: FONT.num, fontSize: 12, fontWeight: 700, color: p.ink3 }}>{notTakenUp.length}</span>
          </div>
          <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink3, lineHeight: 1.45, padding: '0 4px 6px' }}>
            Borrower declined. Off the book.
          </p>
          {notTakenUp.map((a) => (
            <QueueCard key={a.id} p={p} a={a} selected={a.id === selectedId} onSelect={() => onSelect(a)} standingBucket={standingByApp.get(a.id)} locked={cardLocked(a)} />
          ))}
        </div>
      )}

      {archived.length > 0 && (() => {
        const expanded = archiveOpen || q.length > 0; // a search that matches an archived file must actually show it
        return (
          <div style={{ padding: '10px 8px 4px' }}>
            <button
              onClick={() => setArchiveOpen((v) => !v)}
              aria-expanded={expanded}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '0 4px', marginBottom: 5, border: 'none', background: 'transparent', cursor: 'pointer' }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, color: p.ink3, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR.declined, display: 'inline-block' }} />
                Archive · Declined
                <svg width="8" height="6" viewBox="0 0 9 6" fill="none" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                  <path d="M1 1L4.5 4.5L8 1" stroke={p.ink3} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span style={{ fontFamily: FONT.num, fontSize: 12, fontWeight: 700, color: p.ink3 }}>{archived.length}</span>
            </button>
            {expanded && archived.map((a) => (
              <QueueCard key={a.id} p={p} a={a} selected={a.id === selectedId} onSelect={() => onSelect(a)} standingBucket={standingByApp.get(a.id)} locked={cardLocked(a)} />
            ))}
          </div>
        );
      })()}

      <div style={{ marginTop: 'auto', padding: '10px 12px' }}>
        <p style={{ fontFamily: FONT.ui, fontSize: 12, color: p.ink2, lineHeight: 1.5 }}>
          Age badge: time since filing.
        </p>
      </div>
    </nav>
    </TourAnchor>
  );
}
