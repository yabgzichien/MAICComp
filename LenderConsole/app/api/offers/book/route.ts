// GET /api/offers/book  same-origin read of one lender's whole offer book (borrower
// acceptance, 2026-07-21). The console needs every offer at once to answer "which approved
// files are still waiting on the borrower?", which the public per-subject GET on /api/offers
// deliberately can't serve: that route is keyed by a single subject hash precisely so a caller
// can only read the one borrower they already hold the key for. Handing the whole book out
// cross-origin would turn that into an enumeration of every applicant this lender has, so this
// route carries NO CORS headers  same posture as GET /api/apply and GET /api/policy.

import { NextResponse } from 'next/server';
import { readOfferBook } from '../../../../lib/offersStore';
import { LENDER_REGISTRY } from '../../../../lib/lenderRegistry';
import { isOfficer, unauthorized } from '../../../../lib/officerAuth';

const DEFAULT_LENDER_ID = 'tekun';

function resolveLenderId(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_LENDER_ID;
  if (typeof raw !== 'string') return null;
  return LENDER_REGISTRY.some((l) => l.id === raw) ? raw : null;
}

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  // Officer-only. The header above already reasoned that handing the whole book out would let
  // a caller enumerate every applicant this lender has; the mistake was resting that on the
  // absence of CORS headers, which a non-browser client simply ignores. This is the check.
  if (!isOfficer(req)) return unauthorized();
  const lenderId = resolveLenderId(new URL(req.url).searchParams.get('lender'));
  // An unknown lender reads as empty rather than erroring  the console must never fail to load.
  return NextResponse.json(lenderId === null ? {} : await readOfferBook(undefined, lenderId));
}
