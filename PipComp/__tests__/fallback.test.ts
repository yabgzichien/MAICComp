import { FallbackProvider } from '../src/llm/fallback';
import type { LLMSettings } from '../src/settings/settingsStore';

// Route a mocked fetch to the right provider by URL, so we can drive Groq and Gemini
// independently. Each side returns a Response-like object shaped like the one the real
// providers read (status/ok/json/text).
function routeFetch(handlers: {
  groq: () => { status?: number; ok?: boolean; json: unknown };
  gemini: () => { status?: number; ok?: boolean; json: unknown };
}) {
  (global as any).fetch = jest.fn((url: string) => {
    const h = String(url).includes('api.groq.com') ? handlers.groq() : handlers.gemini();
    const status = h.status ?? 200;
    return Promise.resolve({
      status,
      ok: h.ok ?? (status >= 200 && status < 300),
      json: async () => h.json,
      text: async () => JSON.stringify(h.json ?? ''),
    });
  });
}

const groqReply = (text: string) => ({ choices: [{ message: { content: text } }] });
const geminiReply = (text: string) => ({ candidates: [{ content: { parts: [{ text }] } }] });

const bothKeys: LLMSettings = {
  groqKey: 'gsk_test',
  groqModel: 'qwen/qwen3.6-27b',
  geminiKey: 'AIza_test',
  geminiModel: 'gemini-3.1-flash-lite',
};

describe('FallbackProvider — Groq primary, Gemini fallback', () => {
  afterEach(() => jest.restoreAllMocks());

  it('uses Groq (primary) when it succeeds, and never calls Gemini', async () => {
    routeFetch({
      groq: () => ({ json: groqReply('from groq') }),
      gemini: () => ({ json: geminiReply('from gemini') }),
    });
    const llm = new FallbackProvider(bothKeys);
    const text = await llm.coach({ system: 's', prompt: 'p' });
    expect(text).toBe('from groq');
    const calls = (global as any).fetch.mock.calls.map((c: any[]) => String(c[0]));
    expect(calls.some((u: string) => u.includes('api.groq.com'))).toBe(true);
    expect(calls.some((u: string) => u.includes('generativelanguage'))).toBe(false);
  });

  it('falls back to Gemini when the Groq call fails', async () => {
    routeFetch({
      groq: () => ({ status: 500, json: { error: 'boom' } }),
      gemini: () => ({ json: geminiReply('from gemini') }),
    });
    const llm = new FallbackProvider(bothKeys);
    const text = await llm.coach({ system: 's', prompt: 'p' });
    expect(text).toBe('from gemini');
    const calls = (global as any).fetch.mock.calls.map((c: any[]) => String(c[0]));
    expect(calls.some((u: string) => u.includes('api.groq.com'))).toBe(true);
    expect(calls.some((u: string) => u.includes('generativelanguage'))).toBe(true);
  });

  it('routes a PDF straight to Gemini (Groq cannot read PDFs) without a Groq HTTP call', async () => {
    routeFetch({
      groq: () => ({ json: groqReply('{"transactions":[]}') }),
      gemini: () => ({ json: geminiReply('{"transactions":[{"merchant":"X","amount":5,"direction":"out"}]}') }),
    });
    const llm = new FallbackProvider(bothKeys);
    const rows = await llm.extractDocument({ parts: [{ kind: 'binary', base64: 'AAAA', mimeType: 'application/pdf' }] });
    expect(rows).toHaveLength(1);
    // Groq throws before any network call for a PDF; only Gemini is hit.
    const calls = (global as any).fetch.mock.calls.map((c: any[]) => String(c[0]));
    expect(calls.some((u: string) => u.includes('api.groq.com'))).toBe(false);
    expect(calls.some((u: string) => u.includes('generativelanguage'))).toBe(true);
  });

  it('skips a keyless primary and serves from the provider that has a key', async () => {
    routeFetch({
      groq: () => ({ json: groqReply('unused') }),
      gemini: () => ({ json: geminiReply('from gemini') }),
    });
    const geminiOnly: LLMSettings = { ...bothKeys, groqKey: '' };
    const llm = new FallbackProvider(geminiOnly);
    const text = await llm.coach({ system: 's', prompt: 'p' });
    expect(text).toBe('from gemini');
    const calls = (global as any).fetch.mock.calls.map((c: any[]) => String(c[0]));
    expect(calls.some((u: string) => u.includes('api.groq.com'))).toBe(false);
  });

  it('can() reflects whether any provider has a key + implements the capability', () => {
    expect(new FallbackProvider(bothKeys).can('extractSnapshot')).toBe(true);
    // No keys at all → nothing is available.
    const noKeys: LLMSettings = { ...bothKeys, groqKey: '', geminiKey: '' };
    expect(new FallbackProvider(noKeys).can('coach')).toBe(false);
  });

  it('rejects with the last error when every provider fails', async () => {
    routeFetch({
      groq: () => ({ status: 500, json: {} }),
      gemini: () => ({ status: 500, json: {} }),
    });
    const llm = new FallbackProvider(bothKeys);
    await expect(llm.coach({ system: 's', prompt: 'p' })).rejects.toBeTruthy();
  });
});
