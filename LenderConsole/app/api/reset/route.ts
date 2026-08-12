// GET/POST /api/reset  lender-reset marker (data-consistency follow-up, 2026-07-20). When an
// officer resets their console to defaults, the applications/servicing/offers stores for that
// lender are wiped server-side, but the borrower app's own locally-booked loan for that lender
// has no way to find out  the two apps would permanently disagree about whether the loan
// exists. This stamps "reset at T" for the lender; the borrower polls it per lender it has a
// loan with (mirrors /api/offers's polling shape) and clears any local loan booked before T.
//
// GET is public + CORS (the borrower reads from a different origin, same trust posture as
// /api/offers and /api/servicing: the only "auth" is knowing which lender to ask about, which
// every borrower who applied already does). POST is same-origin only  only this console's own
// reset action may stamp a new marker.

import { NextResponse } from 'next/server';
import { readResetMarker, writeResetMarker } from '../../../lib/resetStore';
import { LENDER_REGISTRY } from '../../../lib/lenderRegistry';

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

export const dynamic = 'force-dynamic';

// Public, CORS: the borrower app polls this per lender it has a loan with. Never errors the
// caller out of a poll loop  an unknown lender reads as "never reset".
export async function GET(req: Request) {
  const lenderId = resolveLenderId(new URL(req.url).searchParams.get('lender'));
  if (lenderId === null) {
    return NextResponse.json(null, { headers: CORS_HEADERS });
  }
  const marker = await readResetMarker(undefined, lenderId);
  return NextResponse.json(marker, { headers: CORS_HEADERS });
}

// Same-origin only: stamped by this console's own "Reset to defaults" action, immediately
// after it clears that lender's applications/servicing/offers stores.
export async function POST(req: Request) {
  const lenderId = resolveLenderId(new URL(req.url).searchParams.get('lender'));
  if (lenderId === null) {
    return NextResponse.json({ ok: false, errors: ['Unknown lender.'] }, { status: 400 });
  }
  const marker = await writeResetMarker(undefined, lenderId, new Date());
  return NextResponse.json({ ok: true, marker });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
