import { NextResponse } from 'next/server';
import { buildLetterMessages, parseLetterResponse, type LetterBrief } from '../../../lib/adverseActionNarration';

export const runtime = 'nodejs';

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

function isBrief(b: unknown): b is LetterBrief {
  if (!b || typeof b !== 'object') return false;
  const o = b as Record<string, unknown>;
  return (
    (o.kind === 'decline' || o.kind === 'refer' || o.kind === 'counter-offer') &&
    typeof o.applicant === 'string' &&
    typeof o.requestedAmount === 'string' &&
    typeof o.offeredAmount === 'string' &&
    Array.isArray(o.reasons) &&
    o.reasons.every((r) => typeof r === 'string') &&
    typeof o.improvementText === 'string'
  );
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const brief = body?.brief;
  if (!isBrief(brief)) {
    return NextResponse.json({ opening: '', closing: '', source: 'fallback' }, { status: 400 });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ opening: '', closing: '', source: 'fallback' });
  }

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || DEFAULT_MODEL,
        messages: buildLetterMessages(brief),
        response_format: { type: 'json_object' },
        temperature: 0.4,
        max_tokens: 500,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return NextResponse.json({ opening: '', closing: '', source: 'fallback' });
    }
    const json = await res.json();
    const content: unknown = json?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      return NextResponse.json({ opening: '', closing: '', source: 'fallback' });
    }
    const parsed = parseLetterResponse(content);
    if (!parsed) {
      return NextResponse.json({ opening: '', closing: '', source: 'fallback' });
    }
    return NextResponse.json({ ...parsed, source: 'live' });
  } catch {
    return NextResponse.json({ opening: '', closing: '', source: 'fallback' });
  }
}
