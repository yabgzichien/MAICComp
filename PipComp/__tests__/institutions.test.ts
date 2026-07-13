import { matchInstitution, findMatchingAccounts, searchInstitutions, INSTITUTIONS } from '../src/lib/institutions';
import type { Account } from '../src/lib/types';

function acct(over: Partial<Account>): Account {
  return {
    id: 'a1', name: 'Acct', kind: 'asset', cls: 'cash', archived: false, createdAt: '2026-01-01T00:00:00.000Z',
    sub: null, symbol: null, ticker: null, quantity: null, cost: null, ...over,
  };
}

describe('matchInstitution', () => {
  it('returns null for empty/null input', () => {
    expect(matchInstitution(null)).toBeNull();
    expect(matchInstitution(undefined)).toBeNull();
    expect(matchInstitution('')).toBeNull();
    expect(matchInstitution('   ')).toBeNull();
  });

  it('matches an exact canonical name, case-insensitively', () => {
    expect(matchInstitution('maybank')?.id).toBe('maybank');
    expect(matchInstitution('HSBC Bank Malaysia')?.id).toBe('hsbc');
  });

  it('matches when the provider text contains the canonical name plus extra wording', () => {
    expect(matchInstitution("Touch 'n Go eWallet (TNG Digital)")?.id).toBe('tng');
    expect(matchInstitution('CIMB Bank Berhad - Savings')?.id).toBe('cimb');
  });

  it('matches a known abbreviation alias as a whole word', () => {
    expect(matchInstitution('MBB')?.id).toBe('maybank');
    expect(matchInstitution('PBB')?.id).toBe('public_bank');
    expect(matchInstitution('TNG')?.id).toBe('tng');
  });

  it('does not false-positive a short alias inside an unrelated longer word', () => {
    // "BI" (Bank Islam's alias) must not match inside "BigPay" as a bare substring.
    expect(matchInstitution('BigPay')?.id).toBe('bigpay');
    expect(matchInstitution('BigPay')?.id).not.toBe('bank_islam');
  });

  it('matches common e-wallets', () => {
    expect(matchInstitution('Boost')?.id).toBe('boost');
    expect(matchInstitution('GrabPay')?.id).toBe('grabpay');
    expect(matchInstitution('ShopeePay')?.id).toBe('shopeepay');
  });

  it('returns null when nothing reasonably matches', () => {
    expect(matchInstitution('Some Random Foreign App')).toBeNull();
  });

  it('every institution has a unique id and a non-empty monogram/color', () => {
    const ids = new Set(INSTITUTIONS.map((i) => i.id));
    expect(ids.size).toBe(INSTITUTIONS.length);
    for (const inst of INSTITUTIONS) {
      expect(inst.monogram.length).toBeGreaterThan(0);
      expect(inst.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

describe('findMatchingAccounts', () => {
  const tng = matchInstitution('TnG')!;
  const bankIslam = matchInstitution('Bank Islam')!;

  it('matches an account whose name equals the institution name', () => {
    const a = acct({ id: 'a1', name: "Touch 'n Go eWallet" });
    expect(findMatchingAccounts([a], tng, null)).toEqual([a]);
  });

  it('matches an account whose name contains the institution name plus extra words', () => {
    const a = acct({ id: 'a1', name: 'TNG eWallet (Main)' });
    expect(findMatchingAccounts([a], tng, null).map((x) => x.id)).toEqual(['a1']);
  });

  it('matches an account named after a whole-word alias, without false-positiving short aliases', () => {
    const named = acct({ id: 'a1', name: 'BIMB Savings' });
    const unrelated = acct({ id: 'a2', name: 'BigPay' });
    const matches = findMatchingAccounts([named, unrelated], bankIslam, null).map((x) => x.id);
    expect(matches).toContain('a1');
    expect(matches).not.toContain('a2');
  });

  it('excludes holding (investment) accounts and archived accounts', () => {
    const holding = acct({ id: 'a1', name: 'Maybank', symbol: 'BTC-USD', quantity: 0.1, sub: 'crypto' });
    const archived = acct({ id: 'a2', name: 'Maybank', archived: true });
    const maybank = matchInstitution('Maybank')!;
    expect(findMatchingAccounts([holding, archived], maybank, null)).toEqual([]);
  });

  it('falls back to matching raw provider text when no curated institution matched', () => {
    const a = acct({ id: 'a1', name: 'Some Random Foreign App' });
    expect(findMatchingAccounts([a], null, 'Some Random Foreign App').map((x) => x.id)).toEqual(['a1']);
  });

  it('returns an empty array when neither an institution nor provider text is given', () => {
    const a = acct({ id: 'a1', name: 'Maybank' });
    expect(findMatchingAccounts([a], null, null)).toEqual([]);
  });
});

describe('searchInstitutions', () => {
  it('returns [] for empty/whitespace/null query', () => {
    expect(searchInstitutions('')).toEqual([]);
    expect(searchInstitutions('   ')).toEqual([]);
  });

  it('ranks a name-starts-with match before a contains match', () => {
    const r = searchInstitutions('Bank');
    // "Bank Islam" / "Bank Rakyat" / "Bank Muamalat" / "Bank of China..." start with "Bank";
    // "Public Bank" only contains it  so the starts-with hits must come first.
    const startIdx = r.findIndex((i) => i.name === 'Bank Islam');
    const containsIdx = r.findIndex((i) => i.name === 'Public Bank');
    expect(startIdx).toBeGreaterThanOrEqual(0);
    if (containsIdx >= 0) expect(startIdx).toBeLessThan(containsIdx);
  });

  it('matches by alias prefix', () => {
    const r = searchInstitutions('MB');
    expect(r.some((i) => i.id === 'maybank')).toBe(true);
  });

  it('finds TnG by partial name', () => {
    const r = searchInstitutions('Tn');
    expect(r[0]?.id).toBe('tng');
  });

  it('caps results to 6', () => {
    // "a" appears in a large fraction of names/aliases  a broad query should still be capped.
    expect(searchInstitutions('a').length).toBeLessThanOrEqual(6);
  });

  it('returns [] when nothing matches', () => {
    expect(searchInstitutions('zzzznotabank')).toEqual([]);
  });

  it('is case-insensitive', () => {
    expect(searchInstitutions('hsbc')[0]?.id).toBe('hsbc');
    expect(searchInstitutions('HSBC')[0]?.id).toBe('hsbc');
  });
});
