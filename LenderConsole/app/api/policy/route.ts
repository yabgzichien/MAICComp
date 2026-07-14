// GET/PUT /api/policy  the Lender Policy Editor's persistence (Brief N).
// Same-origin only (the lender's own console; not part of the public flywheel
// surface  /api/lenders republishes the ladder for borrowers). Thin by design:
// validation lives in lib/policyStore.ts, file I/O in lib/policyFile.ts, both tested.

import { NextResponse } from 'next/server';
import { readStoredPolicy, writeStoredPolicy } from '../../../lib/policyFile';

// The GET must re-read the store on every request  never prerendered at build time.
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await readStoredPolicy());
}

export async function PUT(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ errors: ['Body must be JSON.'] }, { status: 400 });
  }
  const result = await writeStoredPolicy(undefined, body);
  if (!result.ok) return NextResponse.json({ errors: result.errors }, { status: 400 });
  return NextResponse.json(result.value);
}
