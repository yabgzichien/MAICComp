import { parseSnapshot } from '../src/lib/parseSnapshot';

describe('parseSnapshot', () => {
  it('reads a balance snapshot with provider, accountKind, and amount', () => {
    const r = parseSnapshot('{"kind":"balance","provider":"Touch \'n Go eWallet","accountKind":"asset","amount":65.78}');
    expect(r).toEqual({ kind: 'balance', provider: "Touch 'n Go eWallet", accountKind: 'asset', amount: 65.78 });
  });

  it('coerces a formatted string amount', () => {
    const r = parseSnapshot('{"kind":"balance","provider":"Maybank","accountKind":"asset","amount":"RM 1,234.50"}');
    expect(r).toMatchObject({ kind: 'balance', amount: 1234.5 });
  });

  it('treats a negative or unreadable amount as null', () => {
    expect(parseSnapshot('{"kind":"balance","provider":null,"accountKind":null,"amount":-5}')).toMatchObject({ amount: null });
    expect(parseSnapshot('{"kind":"balance","provider":null,"accountKind":null,"amount":"abc"}')).toMatchObject({ amount: null });
    expect(parseSnapshot('{"kind":"balance","provider":null,"accountKind":null,"amount":null}')).toMatchObject({ amount: null });
  });

  it('defaults accountKind to null when missing or invalid', () => {
    expect(parseSnapshot('{"kind":"balance","amount":10}')).toMatchObject({ accountKind: null });
    expect(parseSnapshot('{"kind":"balance","accountKind":"other","amount":10}')).toMatchObject({ accountKind: null });
  });

  it('reads a holdings snapshot with provider and coerced rows', () => {
    const r = parseSnapshot('{"kind":"holdings","provider":"Binance","holdings":[{"ticker":"btc","quantity":"0.0123"},{"ticker":"ETH","quantity":1.5}]}');
    expect(r).toEqual({
      kind: 'holdings',
      provider: 'Binance',
      holdings: [
        { ticker: 'BTC', quantity: 0.0123 },
        { ticker: 'ETH', quantity: 1.5 },
      ],
    });
  });

  it('drops invalid holdings rows', () => {
    const r = parseSnapshot('{"kind":"holdings","provider":null,"holdings":[{"ticker":"","quantity":1},{"ticker":"SOL","quantity":0},{"ticker":"SOL","quantity":-1}]}');
    expect(r).toMatchObject({ kind: 'holdings', holdings: [] });
  });

  it('returns unknown for an explicit unknown kind, a missing kind, or unrecognized kind', () => {
    expect(parseSnapshot('{"kind":"unknown"}')).toEqual({ kind: 'unknown' });
    expect(parseSnapshot('{}')).toEqual({ kind: 'unknown' });
    expect(parseSnapshot('{"kind":"something_else"}')).toEqual({ kind: 'unknown' });
  });

  it('returns unknown for malformed or empty input', () => {
    expect(parseSnapshot('not json')).toEqual({ kind: 'unknown' });
    expect(parseSnapshot('')).toEqual({ kind: 'unknown' });
    expect(parseSnapshot('null')).toEqual({ kind: 'unknown' });
  });

  it('tolerates code fences', () => {
    const r = parseSnapshot('```json\n{"kind":"balance","provider":"Boost","accountKind":"asset","amount":12}\n```');
    expect(r).toEqual({ kind: 'balance', provider: 'Boost', accountKind: 'asset', amount: 12 });
  });

  it('normalizes a blank/non-string provider to null', () => {
    expect(parseSnapshot('{"kind":"balance","provider":"  ","amount":1}')).toMatchObject({ provider: null });
    expect(parseSnapshot('{"kind":"balance","provider":42,"amount":1}')).toMatchObject({ provider: null });
  });
});
