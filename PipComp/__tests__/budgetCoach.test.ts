import { buildBudgetPrompt } from '../src/llm/budgetPrompt';
import { GroqProvider } from '../src/llm/groq';

describe('buildBudgetPrompt', () => {
  it('includes income, leftover and each category line', () => {
    const p = buildBudgetPrompt(3000, 200, [{ label: 'Dining', allocated: 300, recentAverage: 380 }]);
    expect(p).toContain('RM3000');
    expect(p).toContain('RM200');
    expect(p).toContain('Dining: budget RM300, recent avg RM380');
  });
});

function mockFetchOnce(opts: { status?: number; json?: unknown; reject?: boolean }) {
  const status = opts.status ?? 200;
  (global as any).fetch = jest.fn(
    opts.reject
      ? () => Promise.reject(new Error('offline'))
      : () => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => opts.json, text: async () => '' })
  );
}

describe('GroqProvider.coach', () => {
  const input = { apiKey: 'gsk_x', model: 'm', prompt: 'hi', system: 'sys' };

  it('returns the assistant text', async () => {
    mockFetchOnce({ json: { choices: [{ message: { content: 'Spend less on dining.' } }] } });
    await expect(GroqProvider.coach(input)).resolves.toBe('Spend less on dining.');
  });

  it('maps 401 to an auth error', async () => {
    mockFetchOnce({ status: 401, json: {} });
    await expect(GroqProvider.coach(input)).rejects.toMatchObject({ code: 'auth' });
  });

  it('throws no_key when key missing', async () => {
    mockFetchOnce({ json: {} });
    await expect(GroqProvider.coach({ ...input, apiKey: '' })).rejects.toMatchObject({ code: 'no_key' });
  });
});
