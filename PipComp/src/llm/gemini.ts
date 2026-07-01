// src/llm/gemini.ts
import { ExtractionParseError, parseExtraction } from '../lib/parseExtraction';
import { parseBalance } from '../lib/parseBalance';
import { parseSnapshot, type ScannedSnapshot } from '../lib/parseSnapshot';
import { parseCryptoHoldings, type ScannedHolding } from '../lib/prices';
import type { ExtractedTxn } from '../lib/types';
import {
  BALANCE_SYSTEM_PROMPT,
  BALANCE_USER_PROMPT,
  DOC_SYSTEM_PROMPT,
  DOC_USER_PROMPT,
  HOLDINGS_SYSTEM_PROMPT,
  HOLDINGS_USER_PROMPT,
  SNAPSHOT_SYSTEM_PROMPT,
  SNAPSHOT_USER_PROMPT,
} from './extractPrompt';
import {
  LLMError,
  type CoachInput,
  type DocExtractInput,
  type ExtractInput,
  type LLMProvider,
  type TestInput,
} from './types';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-3.1-flash-lite';

interface GeminiPart {
  text?: string;
  inline_data?: { mime_type: string; data: string };
}

interface GenOpts {
  system?: string;
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  /** Disable model "thinking" — keeps short, capped replies from being eaten by reasoning. */
  noThinking?: boolean;
}

/** POST to generateContent and return the parsed JSON, mapping HTTP failures to typed errors. */
async function callGemini(model: string, apiKey: string, parts: GeminiPart[], opts: GenOpts = {}): Promise<any> {
  if (!apiKey) throw new LLMError('no_key', 'Missing API key.');
  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: opts.temperature ?? 0,
      ...(opts.json ? { responseMimeType: 'application/json' } : {}),
      ...(opts.maxTokens ? { maxOutputTokens: opts.maxTokens } : {}),
      ...(opts.noThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    },
  };
  if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };

  let res: Response;
  try {
    res = await fetch(`${BASE}/${model || DEFAULT_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new LLMError('network', 'Network request failed.');
  }

  let json: any = null;
  try {
    json = await res.json();
  } catch {
    // leave json null; handled below
  }

  if (!res.ok) {
    const msg: string = json?.error?.message ?? '';
    if (res.status === 429) throw new LLMError('rate_limit', 'Rate limit reached.');
    if (res.status === 401 || res.status === 403) throw new LLMError('auth', msg || 'API key rejected.');
    // Gemini returns 400 "API key not valid" for a bad key, but also 400 for many
    // other request problems — only the former is an auth issue.
    if (res.status === 400 && /api[_ ]?key[_ ]?(not\s*valid|invalid)/i.test(msg)) {
      throw new LLMError('auth', 'API key rejected.');
    }
    throw new LLMError('unknown', `Request failed (${res.status}). ${msg}`.trim());
  }
  if (!json) throw new LLMError('bad_response', 'Response was not JSON.');
  return json;
}

/** Pull the text out of a successful response, or fail with bad_response. */
function contentOf(json: any): string {
  const parts0 = json?.candidates?.[0]?.content?.parts;
  const content = Array.isArray(parts0) ? parts0.map((p: GeminiPart) => p.text ?? '').join('') : '';
  if (!content.trim()) throw new LLMError('bad_response', 'Empty model response.');
  return content;
}

function parseOrThrow(content: string): ExtractedTxn[] {
  try {
    return parseExtraction(content);
  } catch (e) {
    if (e instanceof ExtractionParseError) throw new LLMError('bad_response', e.message);
    throw e;
  }
}

export const GeminiProvider: LLMProvider = {
  id: 'gemini',
  label: 'Google Gemini',
  defaultModel: DEFAULT_MODEL,
  acceptsDocuments: true,

  async extract({ apiKey, model, imageBase64, mimeType }: ExtractInput): Promise<ExtractedTxn[]> {
    const json = await callGemini(
      model,
      apiKey,
      [{ text: DOC_USER_PROMPT }, { inline_data: { mime_type: mimeType, data: imageBase64 } }],
      { system: DOC_SYSTEM_PROMPT, json: true }
    );
    return parseOrThrow(contentOf(json));
  },

  async extractDocument({ apiKey, model, parts }: DocExtractInput): Promise<ExtractedTxn[]> {
    const geminiParts: GeminiPart[] = [{ text: DOC_USER_PROMPT }];
    for (const p of parts) {
      if (p.kind === 'binary') geminiParts.push({ inline_data: { mime_type: p.mimeType, data: p.base64 } });
      else geminiParts.push({ text: p.text });
    }
    const json = await callGemini(model, apiKey, geminiParts, { system: DOC_SYSTEM_PROMPT, json: true });
    return parseOrThrow(contentOf(json));
  },

  async extractHoldings({ apiKey, model, parts }: DocExtractInput): Promise<ScannedHolding[]> {
    const geminiParts: GeminiPart[] = [{ text: HOLDINGS_USER_PROMPT }];
    for (const p of parts) {
      if (p.kind === 'binary') geminiParts.push({ inline_data: { mime_type: p.mimeType, data: p.base64 } });
      else geminiParts.push({ text: p.text });
    }
    const json = await callGemini(model, apiKey, geminiParts, { system: HOLDINGS_SYSTEM_PROMPT, json: true });
    return parseCryptoHoldings(contentOf(json));
  },

  async extractBalance({ apiKey, model, parts }: DocExtractInput): Promise<number | null> {
    const geminiParts: GeminiPart[] = [{ text: BALANCE_USER_PROMPT }];
    for (const p of parts) {
      if (p.kind === 'binary') geminiParts.push({ inline_data: { mime_type: p.mimeType, data: p.base64 } });
      else geminiParts.push({ text: p.text });
    }
    const json = await callGemini(model, apiKey, geminiParts, { system: BALANCE_SYSTEM_PROMPT, json: true });
    return parseBalance(contentOf(json));
  },

  async extractSnapshot({ apiKey, model, parts }: DocExtractInput): Promise<ScannedSnapshot> {
    const geminiParts: GeminiPart[] = [{ text: SNAPSHOT_USER_PROMPT }];
    for (const p of parts) {
      if (p.kind === 'binary') geminiParts.push({ inline_data: { mime_type: p.mimeType, data: p.base64 } });
      else geminiParts.push({ text: p.text });
    }
    const json = await callGemini(model, apiKey, geminiParts, { system: SNAPSHOT_SYSTEM_PROMPT, json: true });
    return parseSnapshot(contentOf(json));
  },

  async test({ apiKey, model }: TestInput): Promise<void> {
    // Success = a 200 from the API. Don't require text back (thinking models can
    // return an empty part under a tight token cap).
    await callGemini(model, apiKey, [{ text: 'ping' }], { maxTokens: 8, noThinking: true });
  },

  async coach({ apiKey, model, prompt, system }: CoachInput): Promise<string> {
    const json = await callGemini(model, apiKey, [{ text: prompt }], {
      system,
      maxTokens: 256,
      temperature: 0.4,
      noThinking: true,
    });
    return contentOf(json).trim();
  },
};
