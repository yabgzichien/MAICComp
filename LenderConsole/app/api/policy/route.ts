// GET/PUT /api/policy  the Lender Policy Editor's persistence (Brief N).
// Same-origin only (the lender's own console; not part of the public flywheel
// surface  /api/lenders republishes the ladder for borrowers). Thin by design:
// validation lives in lib/policyStore.ts, file I/O in lib/policyFile.ts, both tested.
//
// Keyed by lender id (Lender Tenancy spec): `?lender=<id>` scopes the read/write to that
// lender's own stored policy; an unknown id 400s rather than silently writing a stray key.

import { NextResponse } from 'next/server';
import { readLenderPolicy, writeStoredPolicy } from '../../../lib/policyFile';
import { LENDER_REGISTRY } from '../../../lib/lenderRegistry';

// The GET must re-read the store on every request  never prerendered at build time.
export const dynamic = 'force-dynamic';

const VALID_IDS = new Set(LENDER_REGISTRY.map((l) => l.id));

function lenderIdFrom(req: Request): { id: string } | { error: NextResponse } {
  const url = new URL(req.url);
  const id = url.searchParams.get('lender') ?? 'tekun';
  if (!VALID_IDS.has(id)) {
    return { error: NextResponse.json({ errors: [`Unknown lender id: ${id}`] }, { status: 400 }) };
  }
  return { id };
}

export async function GET(req: Request) {
  const lender = lenderIdFrom(req);
  if ('error' in lender) return lender.error;
  return NextResponse.json(await readLenderPolicy(lender.id));
}

export async function PUT(req: Request) {
  const lender = lenderIdFrom(req);
  if ('error' in lender) return lender.error;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ errors: ['Body must be JSON.'] }, { status: 400 });
  }
  const result = await writeStoredPolicy(undefined, body, lender.id);
  if (!result.ok) return NextResponse.json({ errors: result.errors }, { status: 400 });
  return NextResponse.json(result.value);
}
