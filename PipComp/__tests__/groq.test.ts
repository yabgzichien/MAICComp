import { GroqProvider } from '../src/llm/groq';
import { LLMError } from '../src/llm/types';

function mockFetchOnce(opts: {
  status?: number;
  ok?: boolean;
  json?: unknown;
  reject?: boolean;
}) {
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

const input = {
  apiKey: 'gsk_test',
  model: 'qwen/qwen3.6-27b',
  imageBase64: 'AAAA',
  mimeType: 'image/png',
};

describe('GroqProvider.extract', () => {
  it('parses a well-formed chat completion', async () => {
    mockFetchOnce({
      json: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                transactions: [{ merchant: 'Tealive', amount: 9.5, direction: 'out' }],
              }),
            },
          },
        ],
      },
    });
    const rows = await GroqProvider.extract(input);
    expect(rows).toHaveLength(1);
    expect(rows[0].merchant).toBe('Tealive');
    expect(rows[0].type).toBe('expense');
  });

  it('maps HTTP 401 to an auth error', async () => {
    mockFetchOnce({ status: 401, json: {} });
    await expect(GroqProvider.extract(input)).rejects.toMatchObject({ code: 'auth' });
  });

  it('maps HTTP 429 to a rate_limit error', async () => {
    mockFetchOnce({ status: 429, json: {} });
    await expect(GroqProvider.extract(input)).rejects.toMatchObject({ code: 'rate_limit' });
  });

  it('throws no_key when the key is empty', async () => {
    mockFetchOnce({ json: {} });
    await expect(GroqProvider.extract({ ...input, apiKey: '' })).rejects.toBeInstanceOf(LLMError);
    await expect(GroqProvider.extract({ ...input, apiKey: '' })).rejects.toMatchObject({
      code: 'no_key',
    });
  });

  it('maps a thrown fetch to a network error', async () => {
    mockFetchOnce({ reject: true });
    await expect(GroqProvider.extract(input)).rejects.toMatchObject({ code: 'network' });
  });

  it('maps an unreadable model reply to bad_response', async () => {
    mockFetchOnce({
      json: { choices: [{ message: { content: 'the model is down' } }] },
    });
    await expect(GroqProvider.extract(input)).rejects.toMatchObject({ code: 'bad_response' });
  });
});
