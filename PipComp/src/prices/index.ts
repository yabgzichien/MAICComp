// src/prices/index.ts
// Orchestrates a price refresh across holdings. All holdings (crypto, stocks,
// commodities) are priced through Yahoo Finance and converted to MYR.
import type { Account, PriceQuote } from '../lib/types';
import { cryptoUsdResults, isHolding, matchedCommodities, pickTickerMatch, type ScannedHolding, type TickerResult } from '../lib/prices';
import { quotesMYR, searchSymbols } from './yahoo';

export interface ResolvedHolding {
  ticker: string;
  quantity: number;
  coin: TickerResult | null; // null when no symbol matched
}

/** Resolve scanned {ticker, quantity} rows to Yahoo symbols (sequential to ease rate limits). */
export async function resolveCryptoTickers(scanned: ScannedHolding[]): Promise<ResolvedHolding[]> {
  const out: ResolvedHolding[] = [];
  for (const h of scanned) {
    const results = await searchCrypto(h.ticker);
    out.push({ ticker: h.ticker, quantity: h.quantity, coin: pickTickerMatch(h.ticker, results) });
  }
  return out;
}

/** Search crypto tickers (Yahoo), keeping only USD-quoted pairs. */
export async function searchCrypto(query: string): Promise<TickerResult[]> {
  return cryptoUsdResults(await searchSymbols(query, ['CRYPTOCURRENCY']));
}

/** One universal search across crypto, stocks/ETFs, and the supported commodities (gold/silver). */
export async function searchInvestments(query: string): Promise<TickerResult[]> {
  const raw = await searchSymbols(query);
  const crypto = cryptoUsdResults(raw.filter((r) => r.type === 'CRYPTOCURRENCY'));
  const stocks = raw.filter((r) => ['EQUITY', 'ETF', 'INDEX', 'MUTUALFUND'].includes(r.type));
  return [...matchedCommodities(query), ...crypto, ...stocks];
}

/** Fetch fresh MYR quotes for the given holdings. Best-effort: missing symbols are skipped. */
export async function refreshPrices(accounts: Account[]): Promise<PriceQuote[]> {
  const symbols = accounts.filter(isHolding).map((a) => a.symbol as string);
  if (symbols.length === 0) return [];
  const asOf = new Date().toISOString();
  const prices = await quotesMYR(symbols);
  return Object.entries(prices).map(([symbol, p]) => ({ symbol, priceMYR: p.priceMYR, change24: p.change24, asOf }));
}
