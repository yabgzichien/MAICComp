import { parseExtraction, ExtractionParseError } from '../lib/parseExtraction';
import type { ExtractedTxn } from '../lib/types';
import { LLMError, type CategoryGuessInput, type CoachInput, type DocExtractInput, type ExtractInput, type LLMProvider, type TestInput } from './types';
import {
  IDENTITY_SYSTEM_PROMPT,
  IDENTITY_USER_PROMPT,
  IdentityParseError,
  parseIdentityExtraction,
  type IdentityExtraction,
} from './ekycPrompt';
import {
  buildCategoryGuessPrompt,
  CATEGORY_GUESS_SYSTEM_PROMPT,
  CategoryGuessParseError,
  parseCategoryGuess,
} from './categoryGuessPrompt';

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

const SYSTEM_PROMPT =
  'You are a precise data extractor for a personal expenses app. You read a ' +
  'screenshot of a bank or e-wallet transaction history and return ONLY JSON. ' +
  'Never add prose, explanations, or markdown fences.';

const USER_PROMPT = `Extract every transaction row visible in this screenshot.

Return a JSON object exactly in this shape:
{
  "transactions": [
    {
      "merchant": "string — the payee/merchant/title as shown",
      "amount": number — positive value, no currency symbol,
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
- If you cannot read a field, use null (for date/method) — never guess amounts.
- Output JSON only.`;

async function postChat(body: object, apiKey: string): Promise<Response> {
  if (!apiKey) throw new LLMError('no_key', 'Missing API key.');
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
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

export const GroqProvider: LLMProvider = {
  id: 'groq',
  label: 'Groq',
  defaultModel: DEFAULT_MODEL,
  acceptsDocuments: false,

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
