// GET /api/lenders — publishes the lender directory for the borrower app's Coach
// (the Lender Match flywheel). Public, unauthenticated, permissive CORS by design:
// the payload is rate-sheet-equivalent information only — no PII in or out, and the
// borrower's simulation against these ladders happens entirely on their device.

import { NextResponse } from 'next/server';
import { composeRegistry } from '../../../lib/lenderRegistry';
import { readStoredPolicy } from '../../../lib/policyFile';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function GET() {
  // TEKUN's entry is composed from the stored policy (Brief N): the ladder the
  // Policy tab edits is the ladder borrowers are coached toward — the flywheel.
  return NextResponse.json(composeRegistry(readStoredPolicy()), { headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
