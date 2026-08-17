import { derivedSurcharges, parseReceipt, receiptSubtotal } from '../src/lib/parseReceipt';

const FULL = JSON.stringify({
  merchant: 'Nasi Kandar Pelita',
  items: [
    { label: 'Nasi Campur', amount: 12.5, quantity: 1 },
    { label: 'Teh Tarik', amount: 6.0, quantity: 2 },
  ],
  subtotal: 18.5,
  serviceCharge: 1.85,
  tax: 1.22,
  total: 21.57,
});

describe('parseReceipt', () => {
  it('reads a well-formed receipt', () => {
    const r = parseReceipt(FULL);
    expect(r.merchant).toBe('Nasi Kandar Pelita');
    expect(r.items).toHaveLength(2);
    expect(r.items[1]).toEqual({ label: 'Teh Tarik', amount: 6, quantity: 2 });
    expect(r.total).toBe(21.57);
  });

  it('strips markdown fences the model sometimes adds', () => {
    expect(parseReceipt('```json\n' + FULL + '\n```').items).toHaveLength(2);
  });

  it('returns an empty receipt rather than throwing on junk', () => {
    for (const junk of ['', 'not json', '[]', 'null', '{"items": "nope"}']) {
      const r = parseReceipt(junk);
      expect(r.items).toEqual([]);
      expect(r.total).toBeNull();
    }
  });

  it('cleans currency symbols and separators out of amounts', () => {
    const r = parseReceipt(JSON.stringify({ items: [{ label: 'Feast', amount: 'RM 1,234.50' }], total: 'RM 1,234.50' }));
    expect(r.items[0].amount).toBe(1234.5);
    expect(r.total).toBe(1234.5);
  });

  it('keeps a discount row negative', () => {
    const r = parseReceipt(JSON.stringify({ items: [{ label: 'Voucher', amount: -5 }] }));
    expect(r.items[0].amount).toBe(-5);
  });

  it('drops a row with no readable price but keeps the rest', () => {
    const r = parseReceipt(
      JSON.stringify({ items: [{ label: 'Readable', amount: 9 }, { label: 'Smudged', amount: null }] })
    );
    expect(r.items).toHaveLength(1);
    expect(r.items[0].label).toBe('Readable');
  });

  it('names an unlabelled row by position', () => {
    expect(parseReceipt(JSON.stringify({ items: [{ amount: 9 }] })).items[0].label).toBe('Item 1');
  });

  it('ignores a nonsense quantity', () => {
    const r = parseReceipt(JSON.stringify({ items: [{ label: 'A', amount: 9, quantity: 'two' }] }));
    expect(r.items[0].quantity).toBeNull();
  });
});

describe('receiptSubtotal', () => {
  it('prefers the printed subtotal', () => {
    expect(receiptSubtotal(parseReceipt(FULL))).toBe(18.5);
  });

  it('adds the lines up when none was printed', () => {
    const r = parseReceipt(JSON.stringify({ items: [{ label: 'A', amount: 10.1 }, { label: 'B', amount: 5.2 }] }));
    expect(receiptSubtotal(r)).toBe(15.3);
  });
});

describe('derivedSurcharges', () => {
  it('backs the usual 10% and 6% out of the printed amounts', () => {
    // Tax is read against subtotal + service (18.50 + 1.85 = 20.35), which is how the
    // receipt computed it. Reading it against the subtotal alone would give 6.6%.
    expect(derivedSurcharges(parseReceipt(FULL))).toEqual({ serviceChargePct: 10, taxPct: 6 });
  });

  it('stays at zero when the receipt printed no surcharges', () => {
    const r = parseReceipt(JSON.stringify({ items: [{ label: 'A', amount: 20 }], total: 20 }));
    expect(derivedSurcharges(r)).toEqual({ serviceChargePct: 0, taxPct: 0 });
  });

  it('reports an unusual rate rather than snapping it to a convention', () => {
    const r = parseReceipt(JSON.stringify({ items: [{ label: 'A', amount: 100 }], serviceCharge: 5 }));
    expect(derivedSurcharges(r).serviceChargePct).toBe(5);
  });

  it('survives a receipt with no items at all', () => {
    expect(derivedSurcharges(parseReceipt('{}'))).toEqual({ serviceChargePct: 0, taxPct: 0 });
  });
});
