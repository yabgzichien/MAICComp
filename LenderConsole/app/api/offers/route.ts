// GET/POST /api/offers  approved-offer back-channel (approval-notify, 2026-07-19). The
// narrow status channel the direct-apply transport deliberately omitted: when an officer
// approves a REFERRED application, the console POSTs the offer here; the borrower app polls
// GET (cross-origin) and auto-books it, so a console approval reaches the borrower without a
// manual re-share.
//
// GET is public + CORS (the borrower reads from a different origin), keyed by the opaque
// passport `subject` hash only the borrower and their chosen lender hold  same trust posture
// as the servicing channel and the passport itself. POST is same-origin only (no CORS
// headers): ONLY this console publishes offers, so a cross-origin POST is neither needed nor
// allowed  the borrower never writes here.

import { NextResponse } from 'next/server';
import { readOffer, writeOffer } from '../../../lib/offersStore';
import { LENDER_REGISTRY } from '../../../lib/lenderRegistry';
import type { DeclaredPurpose, PurposeCategory } from '../../../lib/applications';

const DEFAULT_LENDER_ID = 'tekun';

function resolveLenderId(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_LENDER_ID;
  if (typeof raw !== 'string') return null;
  return LENDER_REGISTRY.some((l) => l.id === raw) ? raw : null;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const MAX_BODY_BYTES = 2_000;

// Simple in-memory sliding-window rate limit, same shape as the other public routes.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 40;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_LIMIT_MAX;
}

const isPositiveFinite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0;
const isNonNegativeFinite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0;

const PURPOSE_CATEGORIES: PurposeCategory[] = ['stock', 'equipment', 'working-capital', 'emergency', 'education', 'other'];

/** Same defensive posture as /api/apply's own parsePurpose  a malformed purpose is dropped
 *  rather than failing the whole publish (the offer's terms are what matters). */
function parsePurpose(raw: unknown): DeclaredPurpose | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const p = raw as Record<string, unknown>;
  if (typeof p.category !== 'string' || !PURPOSE_CATEGORIES.includes(p.category as PurposeCategory)) return undefined;
  const note = typeof p.note === 'string' ? p.note.slice(0, 140).trim() : undefined;
  return { category: p.category as PurposeCategory, ...(note ? { note } : {}) };
}

export const dynamic = 'force-dynamic';

// Public, CORS: the borrower app polls this per lender for its own subject. Never errors the
// caller out of a poll loop  an unknown subject / lender reads as null.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
  if (rateLimited(ip)) {
    return NextResponse.json(null, { status: 429, headers: CORS_HEADERS });
  }
  const subject = url.searchParams.get('subject');
  if (!subject) {
    return NextResponse.json(null, { headers: CORS_HEADERS });
  }
  const lenderId = resolveLenderId(url.searchParams.get('lender'));
  if (lenderId === null) {
    return NextResponse.json(null, { headers: CORS_HEADERS });
  }
  const offer = await readOffer(subject, undefined, lenderId);
  return NextResponse.json(offer, { headers: CORS_HEADERS });
}

// Same-origin only (no CORS headers): the console publishes an approved offer here when an
// officer resolves a referred application to approved. Defensively parsed, body-capped.
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, errors: ['Request too large.'] }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, errors: ['Body must be JSON.'] }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  if (typeof b.subject !== 'string' || !b.subject) {
    return NextResponse.json({ ok: false, errors: ['subject is required.'] }, { status: 400 });
  }
  const lenderId = resolveLenderId(b.lenderId);
  if (lenderId === null) {
    return NextResponse.json({ ok: false, errors: ['Unknown lender.'] }, { status: 400 });
  }
  if (!isPositiveFinite(b.maxAmount)) {
    return NextResponse.json({ ok: false, errors: ['maxAmount must be a positive number.'] }, { status: 400 });
  }
  if (!isNonNegativeFinite(b.installment)) {
    return NextResponse.json({ ok: false, errors: ['installment must be a non-negative number.'] }, { status: 400 });
  }

  const purpose = parsePurpose(b.purpose);
  const record = await writeOffer(undefined, lenderId, b.subject, { maxAmount: b.maxAmount, installment: b.installment, ...(purpose ? { purpose } : {}) }, new Date());
  return NextResponse.json({ ok: true, record });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
