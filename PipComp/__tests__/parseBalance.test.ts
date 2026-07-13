import { parseBalance } from '../src/lib/parseBalance';

describe('parseBalance', () => {
  it('reads a numeric amount', () => {
    expect(parseBalance('{"amount": 1234.5}')).toBe(1234.5);
  });
  it('coerces a formatted string amount', () => {
    expect(parseBalance('{"amount": "RM 1,234.50"}')).toBe(1234.5);
  });
  it('tolerates code fences', () => {
    expect(parseBalance('```json\n{"amount": 88.8}\n```')).toBe(88.8);
  });
  it('returns null for null / unreadable / invalid', () => {
    expect(parseBalance('{"amount": null}')).toBeNull();
    expect(parseBalance('not json')).toBeNull();
    expect(parseBalance('{"amount": -5}')).toBeNull();
    expect(parseBalance('{"amount": "abc"}')).toBeNull();
  });
});
