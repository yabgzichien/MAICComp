/**
 * TDD: src/lib/directApply.ts  direct-apply-transport (spec 2026-07-11). Posts the
 * signed passport + requested amount + declared purpose to a lender's POST /api/apply.
 * Untrusted network output: the response is defensively parsed (same idiom as
 * lenderDirectory.ts) and any transport failure degrades to an 'offline' result rather
 * than throwing  the caller falls back to the QR/paste path.
 */
import { submitApplication } from '../src/lib/directApply';

const GOOD_RESPONSE = {
  filed: true,
  id: 'abc123',
  decision: { decision: 'refer', maxAmount: 2769, installment: 180, reasons: ['Some reason'] },
  alreadyFiled: false,
};

describe('submitApplication', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('returns a filed result on a valid 200 response', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => GOOD_RESPONSE }) as unknown as typeof fetch;
    const result = await submitApplication('https://console.example', { passportCode: '{}', requestedAmount: 5000 });
    expect(result.status).toBe('filed');
    if (result.status === 'filed') {
      expect(result.decision.decision).toBe('refer');
      expect(result.decision.maxAmount).toBe(2769);
    }
  });

  it('sends the passport code, amount, and purpose in the request body', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => GOOD_RESPONSE });
    global.fetch = fetchMock as unknown as typeof fetch;
    await submitApplication('https://console.example', {
      passportCode: '{"passport":{}}',
      requestedAmount: 4000,
      purpose: { category: 'stock', note: 'Raya stock-up' },
    });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://console.example/api/apply');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body).toEqual({ passportCode: '{"passport":{}}', requestedAmount: 4000, purpose: { category: 'stock', note: 'Raya stock-up' } });
  });

  it('returns a rejected result with server-given reasons on a 400 response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ filed: false, errors: ['Passport expired'] }),
    }) as unknown as typeof fetch;
    const result = await submitApplication('https://console.example', { passportCode: '{}', requestedAmount: 5000 });
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') {
      expect(result.reasons).toEqual(['Passport expired']);
    }
  });

  it('returns "offline" when the network fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
    const result = await submitApplication('https://console.example', { passportCode: '{}', requestedAmount: 5000 });
    expect(result.status).toBe('offline');
  });

  it('returns "offline" on a malformed (non-JSON-shaped) success response, never throws', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => 'not an object' }) as unknown as typeof fetch;
    const result = await submitApplication('https://console.example', { passportCode: '{}', requestedAmount: 5000 });
    expect(result.status).toBe('offline');
  });

  it('reports "duplicate" when the server says this exact application already exists', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...GOOD_RESPONSE, filed: false, alreadyFiled: true }),
    }) as unknown as typeof fetch;
    const result = await submitApplication('https://console.example', { passportCode: '{}', requestedAmount: 5000 });
    expect(result.status).toBe('duplicate');
  });
});
