import { GeminiProvider } from '../src/llm/gemini';
import { LLMError } from '../src/llm/types';

function mockFetchOnce(opts: { status?: number; ok?: boolean; json?: unknown; reject?: boolean }) {
  const status = opts.status ?? 200;
  const ok = opts.ok ?? (status >= 200 && status < 300);
  const impl = opts.reject
    ? () => Promise.reject(new Error('offline'))
    : () =>
        Promise.resolve({
          status,
          ok,
          json: async () => opts.json,
          text: async () => JSON.stringify(opts.json ?? ''),
        });
  (global as any).fetch = jest.fn(impl);
}

/** A Gemini generateContent response wrapping the given model text. */
function reply(text: string) {
  return { candidates: [{ content: { parts: [{ text }] } }] };
}

const docInput = {
  apiKey: 'AIza_test',
  model: 'gemini-2.0-flash',
  parts: [{ kind: 'text' as const, text: 'Date,Description,Amount\n2026-05-01,Tealive,-9.50' }],
};

describe('GeminiProvider.extractDocument', () => {
  it('parses transactions and the category hint from a JSON reply', async () => {
    mockFetchOnce({
      json: reply(
        JSON.stringify({
          transactions: [{ merchant: 'Tealive', amount: 9.5, direction: 'out', date: '2026-05-01', category: 'Dining' }],
        })
      ),
    });
    const rows = await GeminiProvider.extractDocument!(docInput);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ merchant: 'Tealive', amount: 9.5, type: 'expense', categoryHint: 'Dining' });
  });

  it('sends binary parts as inline_data', async () => {
    mockFetchOnce({ json: reply(JSON.stringify({ transactions: [] })) });
    await GeminiProvider.extractDocument!({
      apiKey: 'AIza_test',
      model: 'gemini-2.0-flash',
      parts: [{ kind: 'binary', base64: 'AAAA', mimeType: 'application/pdf' }],
    });
    const body = JSON.parse((global as any).fetch.mock.calls[0][1].body);
    const inline = body.contents[0].parts.find((p: any) => p.inline_data);
    expect(inline.inline_data).toEqual({ mime_type: 'application/pdf', data: 'AAAA' });
  });

  it('advertises document support', () => {
    expect(GeminiProvider.acceptsDocuments).toBe(true);
  });

  it('throws no_key when the key is empty', async () => {
    mockFetchOnce({ json: {} });
    await expect(GeminiProvider.extractDocument!({ ...docInput, apiKey: '' })).rejects.toMatchObject({ code: 'no_key' });
  });

  it('maps HTTP 403 to an auth error', async () => {
    mockFetchOnce({ status: 403, json: {} });
    await expect(GeminiProvider.extractDocument!(docInput)).rejects.toMatchObject({ code: 'auth' });
  });

  it('maps HTTP 429 to a rate_limit error', async () => {
    mockFetchOnce({ status: 429, json: {} });
    await expect(GeminiProvider.extractDocument!(docInput)).rejects.toMatchObject({ code: 'rate_limit' });
  });

  it('maps a thrown fetch to a network error', async () => {
    mockFetchOnce({ reject: true });
    await expect(GeminiProvider.extractDocument!(docInput)).rejects.toMatchObject({ code: 'network' });
  });

  it('maps an unreadable model reply to bad_response', async () => {
    mockFetchOnce({ json: reply('the model is down') });
    await expect(GeminiProvider.extractDocument!(docInput)).rejects.toBeInstanceOf(LLMError);
    await expect(GeminiProvider.extractDocument!(docInput)).rejects.toMatchObject({ code: 'bad_response' });
  });
});
