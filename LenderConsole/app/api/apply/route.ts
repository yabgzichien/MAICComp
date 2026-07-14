// POST /api/apply  direct-apply-transport (spec 2026-07-11): the borrower app sends a
// signed passport + requested amount + declared purpose straight into this console's
// queue, replacing the manual QR/paste courier step (which stays as the offline
// fallback). Public, cross-origin: the borrower app runs on a different origin. The
// passport is re-verified here exactly as a pasted code is in the UI  the console
// trusts the signatures, not the transport. GET is same-origin only (no CORS headers),
// mirroring /api/policy: it exists for Console.tsx to pull submissions into its own
// queue on load, not for public consumption.

import { NextResponse } from 'next/server';
import { parsePassportCode, verifyPassport } from '../../../lib/passport';
import { decideLoan } from '../../../lib/loans';
import { readStoredPolicy } from '../../../lib/policyFile';
import { appendServerApplication, readServerApplications } from '../../../lib/applicationsFile';
import type { DeclaredPurpose, PurposeCategory } from '../../../lib/applications';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// A rich passport (all consent tiers + spending profile + obligations + two signatures)
// runs a few KB; purpose note is capped separately. This bounds the whole request body.
const MAX_BODY_BYTES = 8_000;

const PURPOSE_CATEGORIES: PurposeCategory[] = ['stock', 'equipment', 'working-capital', 'emergency', 'education', 'other'];

// Simple in-memory sliding-window rate limit  good enough for a single-instance demo
// deployment; a real multi-instance deployment would need a shared store (Redis etc.).
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

function parsePurpose(raw: unknown): DeclaredPurpose | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const p = raw as Record<string, unknown>;
  if (typeof p.category !== 'string' || !PURPOSE_CATEGORIES.includes(p.category as PurposeCategory)) return undefined;
  const note = typeof p.note === 'string' ? p.note.slice(0, 140).trim() : undefined;
  return { category: p.category as PurposeCategory, ...(note ? { note } : {}) };
}

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
  if (rateLimited(ip)) {
    return NextResponse.json({ filed: false, errors: ['Too many requests  try again shortly.'] }, { status: 429, headers: CORS_HEADERS });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ filed: false, errors: ['Request too large.'] }, { status: 413, headers: CORS_HEADERS });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ filed: false, errors: ['Body must be JSON.'] }, { status: 400, headers: CORS_HEADERS });
  }

  const b = body as Record<string, unknown>;
  if (typeof b.passportCode !== 'string' || !b.passportCode) {
    return NextResponse.json({ filed: false, errors: ['passportCode is required.'] }, { status: 400, headers: CORS_HEADERS });
  }
  const requestedAmount = Number(b.requestedAmount);
  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
    return NextResponse.json({ filed: false, errors: ['requestedAmount must be a positive number.'] }, { status: 400, headers: CORS_HEADERS });
  }

  let parsed;
  try {
    parsed = parsePassportCode(b.passportCode);
  } catch (e) {
    return NextResponse.json({ filed: false, errors: [e instanceof Error ? e.message : String(e)] }, { status: 400, headers: CORS_HEADERS });
  }

  const verification = verifyPassport(parsed.passport, parsed.signature, parsed.issuerSignature);
  if (!verification.valid) {
    return NextResponse.json({ filed: false, errors: verification.reasons }, { status: 400, headers: CORS_HEADERS });
  }

  const assessment = parsed.passport.assessment;
  if (!assessment) {
    return NextResponse.json({ filed: false, errors: ['Passport carries no affordability assessment to decide against.'] }, { status: 400, headers: CORS_HEADERS });
  }

  const stored = await readStoredPolicy();
  const decision = decideLoan({
    score: parsed.passport.score,
    confidence: assessment.confidence,
    avgMonthlySurplus: assessment.avgMonthlySurplus,
    monthlyDebtService: assessment.monthlyDebtService,
    avgIncome: assessment.avgIncome,
    requestedAmount,
    products: stored.products,
    coverageRatio: assessment.coverageRatio,
    coverageDaysCovered: assessment.coverageDays,
    policy: stored.policy,
  });

  const purpose = parsePurpose(b.purpose);
  const result = await appendServerApplication(undefined, {
    passportCode: b.passportCode,
    subject: parsed.passport.subject,
    applicantLabel: parsed.passport.holder?.name ?? 'Applicant',
    requestedAmount,
    engineDecision: decision.decision,
    offeredAmount: decision.maxAmount,
    installment: decision.installment,
    ...(decision.breakdown?.tierLabel ? { tierLabel: decision.breakdown.tierLabel } : {}),
    ...(purpose ? { purpose } : {}),
    source: 'direct',
  });

  return NextResponse.json(
    {
      filed: result.filed,
      id: result.id,
      decision: { decision: decision.decision, maxAmount: decision.maxAmount, installment: decision.installment, reasons: decision.reasons },
      alreadyFiled: !result.filed,
    },
    { headers: CORS_HEADERS },
  );
}

// Same-origin only  Console.tsx pulls this on load to merge direct submissions into its
// own queue. Not part of the public surface (unlike GET /api/lenders).
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await readServerApplications());
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
