// POST/GET /api/servicing  Bidirectional Servicing Sync (spec 2026-07-18): the one shared,
// authoritative repayment ledger per borrower-loan, keyed by the passport `subject` hash
// within a lender. Either app (this console, recording an officer's repayment/default; the
// borrower app, recording a simulated repayment/miss) writes an event or a default flag
// through here; either app reads the merged record back. Public, cross-origin, same
// defensive posture as /api/apply: the borrower app runs on a different origin, and this
// body is untrusted input parsed defensively field-by-field.
//
// No auth, no borrower accounts  the join key is the subject hash both sides already hold
// (same trust posture as the passport itself), explicitly a demo-scale, single-instance
// design (spec's "Sync trigger" section), not a production servicing registry.

import { NextResponse } from 'next/server';
import { clearServicingBook, readServicingRecord, writeServicingEvent } from '../../../lib/servicingStore';
import { LENDER_REGISTRY } from '../../../lib/lenderRegistry';
import type { ServicingOutcome, ServicingSource } from '../../../lib/mergeServicing';

const DEFAULT_LENDER_ID = 'tekun';

/** Resolve an untrusted lender id to a known registry id, or null. Defaults to TEKUN when
 *  omitted, same as /api/apply. */
function resolveLenderId(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_LENDER_ID;
  if (typeof raw !== 'string') return null;
  return LENDER_REGISTRY.some((l) => l.id === raw) ? raw : null;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// A servicing write is a handful of small fields  far smaller than a full passport code.
const MAX_BODY_BYTES = 2_000;

const OUTCOMES: ServicingOutcome[] = ['on-time', 'late', 'missed'];
const SOURCES: ServicingSource[] = ['lender', 'borrower'];

// Simple in-memory sliding-window rate limit, same shape as /api/apply's  good enough for a
// single-instance demo deployment.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_LIMIT_MAX;
}

const isPositiveInt = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x > 0;
const isFiniteNonNegative = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0;

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
  if (rateLimited(ip)) {
    return NextResponse.json({ ok: false, errors: ['Too many requests. Try again shortly.'] }, { status: 429, headers: CORS_HEADERS });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, errors: ['Request too large.'] }, { status: 413, headers: CORS_HEADERS });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, errors: ['Body must be JSON.'] }, { status: 400, headers: CORS_HEADERS });
  }

  const b = body as Record<string, unknown>;

  if (typeof b.subject !== 'string' || !b.subject) {
    return NextResponse.json({ ok: false, errors: ['subject is required.'] }, { status: 400, headers: CORS_HEADERS });
  }
  const lenderId = resolveLenderId(b.lenderId);
  if (lenderId === null) {
    return NextResponse.json({ ok: false, errors: ['Unknown lender.'] }, { status: 400, headers: CORS_HEADERS });
  }
  if (typeof b.source !== 'string' || !SOURCES.includes(b.source as ServicingSource)) {
    return NextResponse.json({ ok: false, errors: ["source must be 'lender' or 'borrower'."] }, { status: 400, headers: CORS_HEADERS });
  }
  const source = b.source as ServicingSource;

  const hasEvent = b.event !== undefined;
  const hasDefault = b.default !== undefined;
  if (hasEvent === hasDefault) {
    // both present or both absent  exactly one write per request
    return NextResponse.json({ ok: false, errors: ["Provide exactly one of 'event' or 'default: true'."] }, { status: 400, headers: CORS_HEADERS });
  }
  if (hasDefault && b.default !== true) {
    return NextResponse.json({ ok: false, errors: ['default, if present, must be true.'] }, { status: 400, headers: CORS_HEADERS });
  }

  let tenorMonths: number | undefined;
  if (b.tenorMonths !== undefined) {
    if (!isPositiveInt(b.tenorMonths)) {
      return NextResponse.json({ ok: false, errors: ['tenorMonths must be a positive integer.'] }, { status: 400, headers: CORS_HEADERS });
    }
    tenorMonths = b.tenorMonths;
  }
  let installment: number | undefined;
  if (b.installment !== undefined) {
    if (!isFiniteNonNegative(b.installment)) {
      return NextResponse.json({ ok: false, errors: ['installment must be a non-negative number.'] }, { status: 400, headers: CORS_HEADERS });
    }
    installment = b.installment;
  }

  let event: { instalmentSeq: number; outcome: ServicingOutcome } | undefined;
  if (hasEvent) {
    const e = b.event as Record<string, unknown>;
    if (!e || typeof e !== 'object' || !isPositiveInt(e.instalmentSeq)) {
      return NextResponse.json({ ok: false, errors: ['event.instalmentSeq must be a positive integer.'] }, { status: 400, headers: CORS_HEADERS });
    }
    if (typeof e.outcome !== 'string' || !OUTCOMES.includes(e.outcome as ServicingOutcome)) {
      return NextResponse.json({ ok: false, errors: ["event.outcome must be one of 'on-time', 'late', 'missed'."] }, { status: 400, headers: CORS_HEADERS });
    }
    const existing = await readServicingRecord(b.subject, undefined, lenderId);
    const tenor = tenorMonths ?? existing?.tenorMonths ?? 0;
    if (tenor <= 0) {
      return NextResponse.json(
        { ok: false, errors: ['No schedule established for this loan yet. Include tenorMonths and installment on the first write.'] },
        { status: 400, headers: CORS_HEADERS },
      );
    }
    if (e.instalmentSeq > tenor) {
      return NextResponse.json({ ok: false, errors: [`event.instalmentSeq must be within the loan's tenor (${tenor}).`] }, { status: 400, headers: CORS_HEADERS });
    }
    event = { instalmentSeq: e.instalmentSeq, outcome: e.outcome as ServicingOutcome };
  }

  const record = await writeServicingEvent(
    undefined,
    lenderId,
    b.subject,
    {
      ...(tenorMonths !== undefined ? { tenorMonths } : {}),
      ...(installment !== undefined ? { installment } : {}),
      ...(event ? { event } : {}),
      ...(hasDefault ? { default: true } : {}),
      source,
    },
    new Date(),
  );

  return NextResponse.json({ ok: true, record }, { headers: CORS_HEADERS });
}

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const subject = url.searchParams.get('subject');
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
  if (rateLimited(ip)) {
    return NextResponse.json(null, { status: 429, headers: CORS_HEADERS });
  }
  if (!subject) {
    // Malformed request, but GET must never error the caller out of a poll loop.
    return NextResponse.json(null, { headers: CORS_HEADERS });
  }
  const lenderId = resolveLenderId(url.searchParams.get('lender'));
  if (lenderId === null) {
    return NextResponse.json(null, { headers: CORS_HEADERS });
  }
  const record = await readServicingRecord(subject, undefined, lenderId);
  return NextResponse.json(record, { headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// Same-origin only (no CORS headers), mirrors DELETE /api/apply: the console's own
// "Reset to defaults" empties this lender's servicing ledger  a record for an application
// the same reset just deleted is orphaned data with no reason to survive.
export async function DELETE(req: Request) {
  const lenderId = resolveLenderId(new URL(req.url).searchParams.get('lender'));
  if (lenderId === null) {
    return NextResponse.json({ cleared: false, errors: ['Unknown lender.'] }, { status: 400 });
  }
  await clearServicingBook(undefined, lenderId);
  return NextResponse.json({ cleared: true });
}
