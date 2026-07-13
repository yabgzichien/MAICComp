import { parseExtraction, ExtractionParseError } from '../src/lib/parseExtraction';

/**
 * Fixture mirroring the user's real banking-app screenshot (the one that
 * started this project): tolls, transfers, a DuitNow QR, and incoming money.
 */
const REFERENCE_REPLY = JSON.stringify({
  transactions: [
    { merchant: 'Automobile Innovative', amount: 80.0, direction: 'out', date: '2026-05-31', method: 'DuitNow QR' },
    { merchant: 'DNQR W01', amount: 10.0, direction: 'out', date: '2026-05-30', method: 'DuitNow QR' },
    { merchant: 'Transfer to FONG YAN YAN', amount: 26.0, direction: 'out', date: '2026-05-30', method: 'Transfer to Wallet' },
    { merchant: 'Transfer to FONG YAN YAN', amount: 17.1, direction: 'out', date: '2026-05-30', method: 'Transfer to Wallet' },
    { merchant: 'Receive from YANG ZI CHIEN', amount: 1000.0, direction: 'in', date: '2026-05-30', method: 'DuitNow Received' },
    { merchant: 'Exit Toll: SPE - SETIAWANGSA SOUTH BOUND', amount: 3.5, direction: 'out', date: '2026-05-30', method: 'RFID Payment' },
  ],
});

describe('parseExtraction  reference screenshot', () => {
  const rows = parseExtraction(REFERENCE_REPLY);

  it('extracts all six rows', () => {
    expect(rows).toHaveLength(6);
  });

  it('maps direction to type', () => {
    expect(rows[0].type).toBe('expense');
    const income = rows.find((r) => r.merchant.startsWith('Receive'));
    expect(income?.type).toBe('income');
  });

  it('keeps amounts positive and parses the toll', () => {
    const toll = rows.find((r) => r.merchant.startsWith('Exit Toll'));
    expect(toll?.amount).toBe(3.5);
    expect(toll?.method).toBe('RFID Payment');
  });
});

describe('parseExtraction  robustness', () => {
  it('strips ```json code fences', () => {
    const fenced = '```json\n{"transactions":[{"merchant":"Tealive","amount":9.5,"direction":"out"}]}\n```';
    expect(parseExtraction(fenced)).toHaveLength(1);
  });

  it('accepts a bare array', () => {
    const bare = '[{"merchant":"Grab","amount":18.2}]';
    const rows = parseExtraction(bare);
    expect(rows[0].merchant).toBe('Grab');
    expect(rows[0].type).toBe('expense'); // default when no direction
  });

  it('coerces messy amount strings', () => {
    const reply = '{"transactions":[{"merchant":"X","amount":"RM 1,234.50"},{"merchant":"Y","amount":"-18.20"}]}';
    const rows = parseExtraction(reply);
    expect(rows[0].amount).toBe(1234.5);
    expect(rows[1].amount).toBe(18.2);
  });

  it('drops invalid rows but keeps good ones', () => {
    const reply = '{"transactions":[{"merchant":"","amount":5},{"amount":5},{"merchant":"Ok","amount":"abc"},{"merchant":"Good","amount":12}]}';
    const rows = parseExtraction(reply);
    expect(rows).toHaveLength(1);
    expect(rows[0].merchant).toBe('Good');
  });

  it('salvages a JSON block embedded in prose', () => {
    const reply = 'Sure! Here are the items:\n{"transactions":[{"merchant":"Watsons","amount":37.8}]}\nHope that helps.';
    expect(parseExtraction(reply)).toHaveLength(1);
  });

  it('returns [] for empty input', () => {
    expect(parseExtraction('   ')).toEqual([]);
  });

  it('throws ExtractionParseError on non-JSON garbage', () => {
    expect(() => parseExtraction('the model is down, sorry')).toThrow(ExtractionParseError);
  });

  it('normalizes a YYYY-MM-DD date and nulls bad dates', () => {
    const reply = '{"transactions":[{"merchant":"A","amount":1,"date":"2026-05-31T14:00:00"},{"merchant":"B","amount":1,"date":"yesterday"}]}';
    const rows = parseExtraction(reply);
    expect(rows[0].date).toBe('2026-05-31');
    expect(rows[1].date).toBeNull();
  });
});
