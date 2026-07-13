// __tests__/prices.test.ts
import {
  parseYahooSearch,
  cryptoUsdResults,
  matchedCommodities,
  subFromType,
  typeFromSub,
  groupHoldings,
  toQuantityUnitPrice,
  pickTickerMatch,
  parseYahooChart,
  priceToMYR,
  change24Pct,
  holdingValue,
  holdingProfit,
  accountValue,
  mergeAccountValues,
  parseCryptoHoldings,
} from '../src/lib/prices';
import type { Account, BalanceEntry, PriceQuote } from '../src/lib/types';

function acct(over: Partial<Account>): Account {
  return {
    id: 'a1', name: 'A', kind: 'asset', cls: 'cash', archived: false, createdAt: '2026-01-01T00:00:00.000Z',
    sub: null, symbol: null, ticker: null, quantity: null, cost: null, ...over,
  };
}
function entry(over: Partial<BalanceEntry>): BalanceEntry {
  return { id: Math.random().toString(36).slice(2), accountId: 'a1', value: 100, asOf: '2026-05-01', createdAt: '2026-05-01T00:00:00.000Z', ...over };
}

describe('parseYahooSearch', () => {
  const json = {
    quotes: [
      { symbol: 'BTC-USD', quoteType: 'CRYPTOCURRENCY', shortname: 'Bitcoin USD' },
      { symbol: 'AAPL', quoteType: 'EQUITY', shortname: 'Apple Inc.' },
      { symbol: '', quoteType: 'EQUITY', shortname: 'Bad' },
    ],
  };
  it('maps symbols, deriving a crypto ticker from the base', () => {
    expect(parseYahooSearch(json)).toEqual([
      { id: 'BTC-USD', ticker: 'BTC', name: 'Bitcoin USD', type: 'CRYPTOCURRENCY' },
      { id: 'AAPL', ticker: 'AAPL', name: 'Apple Inc.', type: 'EQUITY' },
    ]);
  });
  it('filters by allowed quote types', () => {
    expect(parseYahooSearch(json, ['CRYPTOCURRENCY']).map((r) => r.id)).toEqual(['BTC-USD']);
  });
  it('is empty for a malformed payload', () => {
    expect(parseYahooSearch({})).toEqual([]);
  });
});

describe('cryptoUsdResults', () => {
  it('keeps only -USD pairs and strips the trailing currency from the name', () => {
    const results = [
      { id: 'BTC-USD', ticker: 'BTC', name: 'Bitcoin USD', type: 'CRYPTOCURRENCY' },
      { id: 'BTC-GBP', ticker: 'BTC', name: 'Bitcoin GBP', type: 'CRYPTOCURRENCY' },
      { id: 'ETH-EUR', ticker: 'ETH', name: 'Ethereum EUR', type: 'CRYPTOCURRENCY' },
    ];
    expect(cryptoUsdResults(results)).toEqual([{ id: 'BTC-USD', ticker: 'BTC', name: 'Bitcoin', type: 'CRYPTOCURRENCY' }]);
  });
});

describe('matchedCommodities', () => {
  it('returns one canonical entry for gold / silver', () => {
    expect(matchedCommodities('gold')).toEqual([{ id: 'GC=F', ticker: 'Gold', name: 'Gold', type: 'COMMODITY' }]);
    expect(matchedCommodities('SILV').map((c) => c.id)).toEqual(['SI=F']);
  });
  it('matches nothing for other commodities', () => {
    expect(matchedCommodities('oil')).toEqual([]);
    expect(matchedCommodities('')).toEqual([]);
  });
});

describe('subFromType', () => {
  it('maps Yahoo quote types to a holding sub-category', () => {
    expect(subFromType('CRYPTOCURRENCY')).toBe('crypto');
    expect(subFromType('COMMODITY')).toBe('commodity');
    expect(subFromType('EQUITY')).toBe('stock');
    expect(subFromType('ETF')).toBe('stock');
  });
});

describe('groupHoldings', () => {
  it('combines same-symbol lots, summing quantity/value/cost, sorted by value', () => {
    const lots = [
      acct({ id: 'b1', symbol: 'BTC-USD', ticker: 'BTC', sub: 'crypto', quantity: 0.01, cost: 100 }),
      acct({ id: 'b2', symbol: 'BTC-USD', ticker: 'BTC', sub: 'crypto', quantity: 0.02, cost: 200 }),
      acct({ id: 'e1', symbol: 'ETH-USD', ticker: 'ETH', sub: 'crypto', quantity: 1, cost: 50 }),
    ];
    const values = { b1: 1000, b2: 2000, e1: 500 };
    const groups = groupHoldings(lots, values);
    expect(groups.map((g) => g.symbol)).toEqual(['BTC-USD', 'ETH-USD']);
    const btc = groups[0];
    expect(btc.quantity).toBe(0.03);
    expect(btc.value).toBe(3000);
    expect(btc.cost).toBe(300);
    expect(btc.accounts.map((a) => a.id)).toEqual(['b1', 'b2']);
  });
  it('leaves cost null when no lot recorded one', () => {
    const lots = [acct({ id: 'x', symbol: 'SOL-USD', ticker: 'SOL', sub: 'crypto', quantity: 5, cost: null })];
    expect(groupHoldings(lots, { x: 100 })[0].cost).toBeNull();
  });
});

describe('typeFromSub', () => {
  it('inverts subFromType', () => {
    expect(typeFromSub('crypto')).toBe('CRYPTOCURRENCY');
    expect(typeFromSub('commodity')).toBe('COMMODITY');
    expect(typeFromSub('stock')).toBe('EQUITY');
  });
});

describe('toQuantityUnitPrice', () => {
  it('converts gold/silver per-ounce price to per-gram', () => {
    expect(toQuantityUnitPrice('GC=F', 31.1034768)).toBeCloseTo(1, 6);
    expect(toQuantityUnitPrice('SI=F', 3110.34768)).toBeCloseTo(100, 4);
  });
  it('leaves non-gram symbols unchanged', () => {
    expect(toQuantityUnitPrice('BTC-USD', 250000)).toBe(250000);
    expect(toQuantityUnitPrice('AAPL', 900)).toBe(900);
  });
});

describe('pickTickerMatch', () => {
  const results = [
    { id: 'ETH-USD', ticker: 'ETH', name: 'Ethereum', type: 'CRYPTOCURRENCY' },
    { id: 'ETHW-USD', ticker: 'ETHW', name: 'EthereumPoW', type: 'CRYPTOCURRENCY' },
  ];
  it('prefers an exact ticker match', () => {
    expect(pickTickerMatch('eth', results)?.id).toBe('ETH-USD');
  });
  it('falls back to the top hit when no exact match', () => {
    expect(pickTickerMatch('xyz', results)?.id).toBe('ETH-USD');
  });
  it('is null with no results', () => {
    expect(pickTickerMatch('btc', [])).toBeNull();
  });
});

describe('parseYahooChart', () => {
  it('reads price, currency, and previous close from meta', () => {
    const json = { chart: { result: [{ meta: { regularMarketPrice: 66324.75, currency: 'USD', chartPreviousClose: 66667.61 } }] } };
    expect(parseYahooChart(json)).toEqual({ price: 66324.75, currency: 'USD', prevClose: 66667.61 });
  });
  it('returns null when there is no price', () => {
    expect(parseYahooChart({ chart: { result: [{ meta: {} }] } })).toBeNull();
    expect(parseYahooChart({})).toBeNull();
  });
});

describe('priceToMYR', () => {
  it('passes through MYR prices', () => {
    expect(priceToMYR(12.5, 'MYR', {})).toBe(12.5);
  });
  it('converts via the FX table', () => {
    expect(priceToMYR(100, 'USD', { USD: 3.98 })).toBe(398);
  });
  it('is null when no rate is available', () => {
    expect(priceToMYR(100, 'USD', {})).toBeNull();
  });
});

describe('change24Pct', () => {
  it('computes percentage change from previous close', () => {
    expect(change24Pct(110, 100)).toBeCloseTo(10);
    expect(change24Pct(90, 100)).toBeCloseTo(-10);
  });
  it('is null without a previous close', () => {
    expect(change24Pct(100, null)).toBeNull();
  });
});

describe('holdingValue', () => {
  it('multiplies quantity by price and rounds to cents', () => {
    expect(holdingValue(0.01, 250000)).toBe(2500);
    expect(holdingValue(1.2345, 100)).toBe(123.45);
  });
});

describe('holdingProfit', () => {
  it('computes profit and percent vs invested', () => {
    expect(holdingProfit(150, 100)).toEqual({ profit: 50, pct: 50 });
  });
  it('handles a loss', () => {
    expect(holdingProfit(80, 100)).toEqual({ profit: -20, pct: -20 });
  });
  it('returns null pct when no cost recorded', () => {
    expect(holdingProfit(150, null)).toEqual({ profit: 150, pct: null });
    expect(holdingProfit(150, 0)).toEqual({ profit: 150, pct: null });
  });
});

describe('accountValue', () => {
  const prices: Record<string, PriceQuote> = {
    bitcoin: { symbol: 'bitcoin', priceMYR: 250000, change24: null, asOf: 'x' },
  };
  it('uses qty × live price for a holding', () => {
    const a = acct({ id: 'h', cls: 'investments', sub: 'crypto', symbol: 'bitcoin', ticker: 'BTC', quantity: 0.01 });
    expect(accountValue(a, [], prices)).toBe(2500);
  });
  it('falls back to 0 when a holding has no cached price', () => {
    const a = acct({ id: 'h', symbol: 'dogecoin', quantity: 100 });
    expect(accountValue(a, [], prices)).toBe(0);
  });
  it('uses the latest balance entry for a manual account', () => {
    const a = acct({ id: 'm' });
    const es = [entry({ accountId: 'm', value: 100, asOf: '2026-04-01' }), entry({ accountId: 'm', value: 300, asOf: '2026-06-01' })];
    expect(accountValue(a, es, prices)).toBe(300);
  });
});

describe('mergeAccountValues', () => {
  it('computes value per account across holdings and manual entries', () => {
    const accounts = [
      acct({ id: 'cash', cls: 'cash' }),
      acct({ id: 'btc', cls: 'investments', sub: 'crypto', symbol: 'bitcoin', ticker: 'BTC', quantity: 0.02 }),
    ];
    const entries = [entry({ accountId: 'cash', value: 500, asOf: '2026-05-01' })];
    const prices: Record<string, PriceQuote> = { bitcoin: { symbol: 'bitcoin', priceMYR: 250000, change24: null, asOf: 'x' } };
    expect(mergeAccountValues(accounts, entries, prices)).toEqual({ cash: 500, btc: 5000 });
  });
});

describe('parseCryptoHoldings', () => {
  it('extracts ticker + positive quantity rows', () => {
    const content = JSON.stringify({ holdings: [{ ticker: 'btc', quantity: 0.01 }, { ticker: 'ETH', quantity: '2.5' }, { ticker: '', quantity: 1 }, { ticker: 'X', quantity: 0 }] });
    expect(parseCryptoHoldings(content)).toEqual([
      { ticker: 'BTC', quantity: 0.01 },
      { ticker: 'ETH', quantity: 2.5 },
    ]);
  });
  it('tolerates code fences and bad rows', () => {
    const content = '```json\n{"holdings":[{"ticker":"SOL","quantity":10}]}\n```';
    expect(parseCryptoHoldings(content)).toEqual([{ ticker: 'SOL', quantity: 10 }]);
  });
});
