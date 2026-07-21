import { parseExtraction, ExtractionParseError } from '../lib/parseExtraction';
import { parseBalance } from '../lib/parseBalance';
import { parseSnapshot, type ScannedSnapshot } from '../lib/parseSnapshot';
import { parseCryptoHoldings, type ScannedHolding } from '../lib/prices';
import type { ExtractedTxn } from '../lib/types';
import {
  LLMError,
  type CategoryGuessInput,
  type CoachInput,
  type DocExtractInput,
  type DocPart,
  type ExtractInput,
  type LLMProvider,
  type TestInput,
} from './types';
import {
  IDENTITY_SYSTEM_PROMPT,
  IDENTITY_USER_PROMPT,
  IdentityParseError,
  parseIdentityExtraction,
  type IdentityExtraction,
} from './ekycPrompt';
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
  buildCategoryGuessPrompt,
  CATEGORY_GUESS_SYSTEM_PROMPT,
  CategoryGuessParseError,
  parseCategoryGuess,
} from './categoryGuessPrompt';

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
// qwen/qwen3.6-27b is the only vision-capable (text+image) model Groq currently serves; the
// Llama 4 vision models it replaced are retired. Its "thinking" output is returned in a
// separate `reasoning` field, so `message.content` stays clean JSON. Override with
// EXPO_PUBLIC_GROQ_MODEL if Groq's lineup changes again.
const DEFAULT_MODEL = 'qwen/qwen3.6-27b';

const SYSTEM_PROMPT =
  'You are a precise data extractor for a personal expenses app. You read a ' +
  'screenshot of a bank or e-wallet transaction history and return ONLY JSON. ' +
  'Never add prose, explanations, or markdown fences.';

const USER_PROMPT = `Extract every transaction row visible in this screenshot.

Return a JSON object exactly in this shape:
{
  "transactions": [
    {
      "merchant": "string  the payee/merchant/title as shown",
      "amount": number  positive value, no currency symbol,
      "direction": "out" for money leaving the account (spending), "in" for money received,
      "date": "YYYY-MM-DD if derivable, otherwise null",
      "method": "optional sub-label like 'DuitNow QR' or 'RFID Payment', otherwise null"
    }
  ]
}

Rules:
- One object per transaction row. Do not merge or invent rows.
- amount is always positive; use "direction" to indicate spend vs received.
- Keep merchant text close to what is shown (you may trim trailing reference codes).
- If you cannot read a field, use null (for date/method)  never guess amounts.
- Output JSON only.`;

async function postChat(body: object, apiKey: string): Promise<Response> {
  if (!apiKey) throw new LLMError('no_key', 'Missing API key.');
  // The default model (qwen/qwen3.6-27b) is a reasoning model: left on, it emits a `<think>…</think>`
  // block into the reply and, under a tight max_tokens cap (e.g. the coach), the reasoning eats the
  // whole budget and leaks/blanks the answer. Disabling it keeps replies direct, cheaper, and faster;
  // extraction quality is unaffected (it's OCR-style, not a reasoning task). A body may override.
  const payload = { reasoning_effort: 'none', ...body };
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new LLMError('network', 'Network request failed.');
  }
  if (res.status === 401 || res.status === 403) {
    throw new LLMError('auth', 'API key rejected.');
  }
  if (res.status === 429) {
    throw new LLMError('rate_limit', 'Rate limit reached.');
  }
  if (!res.ok) {
    const text = await safeText(res);
    throw new LLMError('unknown', `Request failed (${res.status}). ${text}`.trim());
  }
  return res;
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return '';
  }
}

/** Pull the assistant text out of a chat completion, or fail with bad_response. */
async function contentOf(res: Response): Promise<string> {
  let json: any;
  try {
    json = await res.json();
  } catch {
    throw new LLMError('bad_response', 'Response was not JSON.');
  }
  const content: unknown = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new LLMError('bad_response', 'Empty model response.');
  }
  return content;
}

/**
 * Run a JSON-returning multimodal completion over a set of document parts. Text parts
 * (CSV/XLSX/DOCX flattened upstream) go in as text; image parts as `image_url` — the vision
 * model reads them directly. PDF binaries are the one thing this model cannot ingest, so we
 * throw `bad_response`; the fallback layer then routes the PDF to the document-capable
 * secondary (Gemini). Keeps Groq the primary for everything it can actually do.
 */
async function visionJson(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  parts: DocPart[]
): Promise<string> {
  const content: any[] = [{ type: 'text', text: userPrompt }];
  for (const p of parts) {
    if (p.kind === 'text') {
      content.push({ type: 'text', text: p.text });
    } else if (p.mimeType === 'application/pdf') {
      throw new LLMError('bad_response', 'This model cannot read PDF documents.');
    } else {
      content.push({ type: 'image_url', image_url: { url: `data:${p.mimeType};base64,${p.base64}` } });
    }
  }
  const body = {
    model: model || DEFAULT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content },
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
  };
  return contentOf(await postChat(body, apiKey));
}

export const GroqProvider: LLMProvider = {
  id: 'groq',
  label: 'Groq',
  defaultModel: DEFAULT_MODEL,
  // Ingests images and flattened text (CSV/XLSX/DOCX); PDF binaries fall back to Gemini.
  acceptsDocuments: true,

  async extract({ apiKey, model, imageBase64, mimeType }: ExtractInput): Promise<ExtractedTxn[]> {
    const body = {
      model: model || DEFAULT_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: USER_PROMPT },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    };

    const res = await postChat(body, apiKey);

    let json: any;
    try {
      json = await res.json();
    } catch {
      throw new LLMError('bad_response', 'Response was not JSON.');
    }
    const content: unknown = json?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new LLMError('bad_response', 'Empty model response.');
    }
    try {
      return parseExtraction(content);
    } catch (e) {
      if (e instanceof ExtractionParseError) {
        throw new LLMError('bad_response', e.message);
      }
      throw e;
    }
  },

  async extractIdentity({ apiKey, model, parts }: DocExtractInput): Promise<IdentityExtraction> {
    const img = parts.find((p) => p.kind === 'binary') as
      | { kind: 'binary'; base64: string; mimeType: string }
      | undefined;
    if (!img) throw new LLMError('bad_response', 'No document image provided.');

    const body = {
      model: model || DEFAULT_MODEL,
      messages: [
        { role: 'system', content: IDENTITY_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: IDENTITY_USER_PROMPT },
            { type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.base64}` } },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    };

    const res = await postChat(body, apiKey);
    let json: any;
    try {
      json = await res.json();
    } catch {
      throw new LLMError('bad_response', 'Response was not JSON.');
    }
    const content: unknown = json?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new LLMError('bad_response', 'Empty model response.');
    }
    try {
      return parseIdentityExtraction(content);
    } catch (e) {
      if (e instanceof IdentityParseError) throw new LLMError('bad_response', e.message);
      throw e;
    }
  },

  // Document/balance/holdings/snapshot capture — images and flattened text run on Groq's
  // vision model; PDFs throw inside visionJson and are picked up by the Gemini fallback.
  async extractDocument({ apiKey, model, parts }: DocExtractInput): Promise<ExtractedTxn[]> {
    const content = await visionJson(apiKey, model, DOC_SYSTEM_PROMPT, DOC_USER_PROMPT, parts);
    try {
      return parseExtraction(content);
    } catch (e) {
      if (e instanceof ExtractionParseError) throw new LLMError('bad_response', e.message);
      throw e;
    }
  },

  async extractHoldings({ apiKey, model, parts }: DocExtractInput): Promise<ScannedHolding[]> {
    return parseCryptoHoldings(await visionJson(apiKey, model, HOLDINGS_SYSTEM_PROMPT, HOLDINGS_USER_PROMPT, parts));
  },

  async extractBalance({ apiKey, model, parts }: DocExtractInput): Promise<number | null> {
    return parseBalance(await visionJson(apiKey, model, BALANCE_SYSTEM_PROMPT, BALANCE_USER_PROMPT, parts));
  },

  async extractSnapshot({ apiKey, model, parts }: DocExtractInput): Promise<ScannedSnapshot> {
    return parseSnapshot(await visionJson(apiKey, model, SNAPSHOT_SYSTEM_PROMPT, SNAPSHOT_USER_PROMPT, parts));
  },

  async guessCategories({ apiKey, model, items, categories }: CategoryGuessInput): Promise<Record<number, string | null>> {
    const body = {
      model: model || DEFAULT_MODEL,
      messages: [
        { role: 'system', content: CATEGORY_GUESS_SYSTEM_PROMPT },
        { role: 'user', content: buildCategoryGuessPrompt(items, categories) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    };

    const res = await postChat(body, apiKey);
    let json: any;
    try {
      json = await res.json();
    } catch {
      throw new LLMError('bad_response', 'Response was not JSON.');
    }
    const content: unknown = json?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new LLMError('bad_response', 'Empty model response.');
    }
    try {
      return parseCategoryGuess(content, items, categories);
    } catch (e) {
      if (e instanceof CategoryGuessParseError) throw new LLMError('bad_response', e.message);
      throw e;
    }
  },

  async test({ apiKey, model }: TestInput): Promise<void> {
    const body = {
      model: model || DEFAULT_MODEL,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 1,
      temperature: 0,
    };
    await postChat(body, apiKey); // throws on auth/rate/network/other
  },

  async coach({ apiKey, model, prompt, system }: CoachInput): Promise<string> {
    const body = {
      model: model || DEFAULT_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      max_tokens: 140,
      temperature: 0.4,
    };
    const res = await postChat(body, apiKey);
    let json: any;
    try {
      json = await res.json();
    } catch {
      throw new LLMError('bad_response', 'Response was not JSON.');
    }
    const content: unknown = json?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new LLMError('bad_response', 'Empty coach response.');
    }
    return content.trim();
  },
};
