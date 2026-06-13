// src/prices/yahoo.ts
// Yahoo Finance adapter (unofficial JSON endpoints): symbol search + MYR quotes
// for crypto, stocks, and commodities, converting native currency via FX.
// Network only; parsing is the tested code in src/lib/prices.ts. Best-effort.
import {
  change24Pct,
  parseYahooChart,
  parseYahooSearch,
  priceToMYR,
  toQuantityUnitPrice,
  type TickerResult,
} from '../lib/prices';

const SEARCH = 'https://query1.finance.yahoo.com/v1/finance/search';
const CHART = 'https://query1.finance.yahoo.com/v8/finance/chart';
// A desktop UA avoids some Yahoo edge rejections.
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' };

export async function searchSymbols(query: string, allowedTypes?: string[]): Promise<TickerResult[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const res = await fetch(`${SEARCH}?q=${encodeURIComponent(q)}&quotesCount=25&newsCount=0`, { headers: HEADERS });
    if (!res.ok) return [];
    return parseYahooSearch(await res.json(), allowedTypes).slice(0, 25);
  } catch {
    return [];
  }
}

async function chart(symbol: string) {
  try {
    const res = await fetch(`${CHART}/${encodeURIComponent(symbol)}?range=2d&interval=1d`, { headers: HEADERS });
    if (!res.ok) return null;
    return parseYahooChart(await res.json());
  } catch {
    return null;
  }
}

/** MYR price + 24h change for a set of Yahoo symbols (native currency converted via FX). */
export async function quotesMYR(symbols: string[]): Promise<Record<string, { priceMYR: number; change24: number | null }>> {
  const unique = [...new Set(symbols)].filter(Boolean);
  if (unique.length === 0) return {};

  const quotes = await Promise.all(unique.map((s) => chart(s)));
  const bySymbol = new Map(unique.map((s, i) => [s, quotes[i]]));

  // Fetch FX rates for every non-MYR currency we saw (one call per currency).
  const currencies = [...new Set(quotes.filter((q): q is NonNullable<typeof q> => !!q).map((q) => q.currency).filter((c) => c !== 'MYR'))];
  const fx: Record<string, number> = {};
  await Promise.all(
    currencies.map(async (cur) => {
      const r = await chart(`${cur}MYR=X`);
      if (r) fx[cur] = r.price;
    })
  );

  const out: Record<string, { priceMYR: number; change24: number | null }> = {};
  for (const sym of unique) {
    const q = bySymbol.get(sym);
    if (!q) continue;
    const priceMYR = priceToMYR(q.price, q.currency, fx);
    if (priceMYR == null) continue;
    // Gold/silver are quoted per troy ounce but held in grams.
    out[sym] = { priceMYR: toQuantityUnitPrice(sym, priceMYR), change24: change24Pct(q.price, q.prevClose) };
  }
  return out;
}
