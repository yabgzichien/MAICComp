import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Policy Advisor narration (2026-07-18 stats/advisor design). Mirrors app/api/agents'
// route exactly: the suggestion (kind, headline, evidence, action) is ALREADY decided
// deterministically by lib/policyAdvisor.ts before this route is ever called. The LLM
// may only restate that decision in one grounded sentence  it never invents a number,
// never proposes a value, and never overrides the "consider" framing. Always 200 (source
// 'live' or 'fallback') so the Advisor card renders identically either way; the Groq key
// stays server-only.

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

interface SuggestionBrief {
  id: string;
  headline: string;
  evidence: string[];
  action: string;
}

const SYSTEM_PROMPT =
  'You are a policy-advisor narrator. For each suggestion you are given a headline, ' +
  'cited evidence, and a recommended "consider…" action that have ALREADY been decided ' +
  'by deterministic rules. Write ONE short sentence (max 24 words) per suggestion that ' +
  'restates the headline and evidence in plain English, using ONLY the given facts — ' +
  'never invent a number, never propose a specific rate or threshold value, never soften ' +
  'or strengthen the "consider" framing into a command. Return ONLY a JSON object ' +
  'mapping each suggestion id to its sentence.';

function buildUserPrompt(suggestions: SuggestionBrief[]): string {
  return [
    'Suggestions:',
    JSON.stringify(suggestions, null, 2),
    '',
    `Return JSON: {${suggestions.map((s) => `"${s.id}": "<one sentence>"`).join(', ')}}`,
  ].join('\n');
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const suggestions: SuggestionBrief[] | undefined = body?.suggestions;
  if (!Array.isArray(suggestions) || suggestions.length === 0) {
    return NextResponse.json({ narrations: {}, source: 'fallback' }, { status: 400 });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ narrations: {}, source: 'fallback' });
  }

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || DEFAULT_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(suggestions) },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4,
        max_tokens: 400,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return NextResponse.json({ narrations: {}, source: 'fallback' });
    }
    const json = await res.json();
    const content: unknown = json?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      return NextResponse.json({ narrations: {}, source: 'fallback' });
    }
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const narrations: Record<string, string> = {};
    for (const s of suggestions) {
      const text = parsed[s.id];
      if (typeof text === 'string' && text.trim()) narrations[s.id] = text.trim();
    }
    return NextResponse.json({ narrations, source: 'live' });
  } catch {
    return NextResponse.json({ narrations: {}, source: 'fallback' });
  }
}
