import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

interface AgentBrief {
  id: string;
  label: string;
  verdict: string;
  signals: string[];
}

const SYSTEM_PROMPT =
  'You are an underwriting-panel narrator. For each agent you are given a verdict ' +
  'that has ALREADY been decided by deterministic rules, plus the exact data ' +
  'signals behind it. Write ONE short sentence (max 22 words) per agent restating ' +
  'why, using ONLY the given signals, never invent a number, fact, or verdict ' +
  'that was not provided, and never change or hedge the given verdict. Return ONLY ' +
  'a JSON object mapping each agent id to its sentence.';

function buildUserPrompt(agents: AgentBrief[]): string {
  return [
    'Agents:',
    JSON.stringify(agents, null, 2),
    '',
    `Return JSON: {${agents.map((a) => `"${a.id}": "<one sentence>"`).join(', ')}}`,
  ].join('\n');
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const agents: AgentBrief[] | undefined = body?.agents;
  if (!Array.isArray(agents) || agents.length === 0) {
    return NextResponse.json({ rationales: {}, source: 'fallback' }, { status: 400 });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ rationales: {}, source: 'fallback' });
  }

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || DEFAULT_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(agents) },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4,
        max_tokens: 400,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return NextResponse.json({ rationales: {}, source: 'fallback' });
    }
    const json = await res.json();
    const content: unknown = json?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      return NextResponse.json({ rationales: {}, source: 'fallback' });
    }
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const rationales: Record<string, string> = {};
    for (const a of agents) {
      const text = parsed[a.id];
      if (typeof text === 'string' && text.trim()) rationales[a.id] = text.trim();
    }
    return NextResponse.json({ rationales, source: 'live' });
  } catch {
    return NextResponse.json({ rationales: {}, source: 'fallback' });
  }
}
