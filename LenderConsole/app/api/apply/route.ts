// POST /api/apply  direct-apply-transport (spec 2026-07-11): the borrower app sends a
// signed passport + requested amount + declared purpose straight into this console's
// queue, replacing the manual QR/paste courier step (which stays as the offline
// fallback). Public, cross-origin: the borrower app runs on a different origin. The
// passport is re-verified here exactly as a pasted code is in the UI  the console
// trusts the signatures, not the transport. GET is same-origin only (no CORS headers),
// mirroring /api/policy: it exists for Console.tsx to pull submissions into its own
// queue on load, not for public consumption.

import { NextResponse } from 'next/server';
import { parsePassportCode, verifyPassport, type CreditPassport, type PassportAssessment } from '../../../lib/passport';
import { decideLoan, type LoanDecision } from '../../../lib/loans';
import { decidePriced } from '../../../lib/decidePriced';
import { mergedStanding } from '../../../lib/repaymentStanding';
import { readLenderPolicy } from '../../../lib/policyFile';
import { appendServerApplication, clearServerApplications, readServerApplications } from '../../../lib/applicationsFile';
import { writeOffer } from '../../../lib/offersStore';
import { LENDER_REGISTRY } from '../../../lib/lenderRegistry';
import type { DeclaredPurpose, PurposeCategory } from '../../../lib/applications';
import type { StoredPolicy } from '../../../lib/policyStore';
import type { PricingSuggestion } from '../../../lib/pricing';
import type { CreditBand } from '../../../lib/securitization';

const DEFAULT_LENDER_ID = 'tekun';

/** Resolve an untrusted lender id to a known registry id, or null. Defaults to TEKUN when
 *  omitted (a borrower app that predates multi-lender routing still files into TEKUN). */
function resolveLenderId(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_LENDER_ID;
  if (typeof raw !== 'string') return null;
  return LENDER_REGISTRY.some((l) => l.id === raw) ? raw : null;
}

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

/** Decide + price a direct-apply submission the same way Console.tsx's "adopt" strip already
 *  does for a manually-resolved file: read this lender's own applications, merge them with the
 *  passport's signed cross-lender standing, and re-decide at the discounted rate priceLoan finds
 *  (if any). Falls back to a plain ladder-rate decideLoan  today's exact behaviour, with no
 *  adverseRecord/band/standingClean involved  on any failure, so a mergedStanding/decidePriced
 *  bug degrades gracefully instead of blocking the applicant. */
async function priceDecision(
  passport: CreditPassport,
  assessment: PassportAssessment,
  requestedAmount: number,
  stored: StoredPolicy,
  lenderId: string,
): Promise<{ priced: LoanDecision; pricing: PricingSuggestion | null }> {
  try {
    const lenderApps = await readServerApplications(undefined, lenderId);
    const standing = mergedStanding(passport, lenderApps, stored);
    const { pricing, priced } = decidePriced({
      score: passport.score,
      confidence: assessment.confidence,
      avgMonthlySurplus: assessment.avgMonthlySurplus,
      monthlyDebtService: assessment.monthlyDebtService,
      avgIncome: assessment.avgIncome,
      requestedAmount,
      products: stored.products,
      coverageRatio: assessment.coverageRatio,
      coverageDaysCovered: assessment.coverageDays,
      policy: stored.policy,
      adverseRecord: standing.current.adverseRecord,
      band: passport.band as CreditBand,
      standingClean: standing.discountEligible,
    });
    return { priced, pricing };
  } catch {
    const priced = decideLoan({
      score: passport.score,
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
    return { priced, pricing: null };
  }
}

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
  if (rateLimited(ip)) {
    return NextResponse.json({ filed: false, errors: ['Too many requests. Try again shortly.'] }, { status: 429, headers: CORS_HEADERS });
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
  const lenderId = resolveLenderId(b.lenderId);
  if (lenderId === null) {
    return NextResponse.json({ filed: false, errors: ['Unknown lender.'] }, { status: 400, headers: CORS_HEADERS });
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

  const stored = await readLenderPolicy(lenderId);
  const { priced, pricing } = await priceDecision(parsed.passport, assessment, requestedAmount, stored, lenderId);

  const purpose = parsePurpose(b.purpose);
  const result = await appendServerApplication(
    undefined,
    {
      passportCode: b.passportCode,
      subject: parsed.passport.subject,
      applicantLabel: parsed.passport.holder?.name ?? 'Applicant',
      requestedAmount,
      engineDecision: priced.decision,
      offeredAmount: priced.maxAmount,
      installment: priced.installment,
      ...(priced.breakdown?.tierLabel ? { tierLabel: priced.breakdown.tierLabel } : {}),
      ...(purpose ? { purpose } : {}),
      source: 'direct',
    },
    new Date(),
    lenderId,
  );

  // Publish the offer whenever the engine approves outright (borrower acceptance, 2026-07-21).
  // Previously only an OFFICER resolving a referred file published one, so an auto-approved
  // direct-apply had no offer record at all: the console filed it straight to 'approved' (i.e.
  // a live loan in Servicing) while the borrower app, which had nothing to poll, showed only
  // the verdict it got back in this response. Nothing was ever accepted by anyone, and the
  // officer never saw a file to work. Publishing here makes the approval a standing OFFER the
  // borrower must answer  which is also what makes it visible as "awaiting borrower" in the
  // queue. Idempotent by writeOffer's same-terms rule, so a repeat apply can't un-accept.
  if (priced.decision === 'approve' && priced.maxAmount > 0 && parsed.passport.subject) {
    try {
      // Carry the tenor of the tier the engine actually priced on. Without it the borrower app
      // re-derives a tier from the amount alone and can land on a longer one — booking a term
      // and a total this lender never approved.
      const tier = stored.products.find((pr) => pr.label === priced.breakdown?.tierLabel);
      const discounted = pricing !== null && pricing.discountBps > 0;
      await writeOffer(
        undefined,
        lenderId,
        parsed.passport.subject,
        {
          maxAmount: priced.maxAmount,
          installment: priced.installment,
          ...(tier ? { tenorMonths: tier.tenorMonths } : {}),
          ...(purpose ? { purpose } : {}),
          ...(discounted
            ? { apr: pricing!.suggestedRate, discountBps: pricing!.discountBps }
            : tier
              ? { apr: tier.apr }
              : {}),
        },
        new Date(),
      );
    } catch {
      // Best-effort: the application is already filed and the verdict is already in this
      // response. A failed publish costs the borrower the in-app accept button, not the
      // application  they can still be approved by the officer from the console side.
    }
  }

  return NextResponse.json(
    {
      filed: result.filed,
      id: result.id,
      decision: { decision: priced.decision, maxAmount: priced.maxAmount, installment: priced.installment, reasons: priced.reasons },
      alreadyFiled: !result.filed,
    },
    { headers: CORS_HEADERS },
  );
}

// Same-origin only  Console.tsx pulls this per lender on load to merge that lender's direct
// submissions into its own queue. Not part of the public surface (unlike GET /api/lenders).
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const lenderId = resolveLenderId(new URL(req.url).searchParams.get('lender'));
  // An unknown lender reads as empty rather than erroring  the console must never fail to load.
  return NextResponse.json(lenderId === null ? [] : await readServerApplications(undefined, lenderId));
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// Same-origin only, like GET  the console's own "Reset to defaults" action empties its
// mailbox. Demo-only: this console has no authentication, so the mailbox holds only test
// submissions from the paired borrower app, never a real lender's live pipeline.
export async function DELETE(req: Request) {
  const lenderId = resolveLenderId(new URL(req.url).searchParams.get('lender'));
  if (lenderId === null) {
    return NextResponse.json({ cleared: false, errors: ['Unknown lender.'] }, { status: 400 });
  }
  await clearServerApplications(undefined, lenderId);
  return NextResponse.json({ cleared: true });
}
