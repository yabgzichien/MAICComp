// __tests__/import.test.ts
import {
  docKindFromMime,
  docxXmlToText,
  matchSourceCategory,
  assignImported,
  applyDedup,
} from '../src/lib/import';
import { DROP, type Category, type ExtractedTxn, type MemoryMap, type Transaction } from '../src/lib/types';

function cat(over: Partial<Category>): Category {
  return { id: 'dining', label: 'Dining', icon: 'utensils', hue: 20, kind: 'expense', isDefault: false, ...over };
}

function item(over: Partial<ExtractedTxn>): ExtractedTxn {
  return { merchant: 'Starbucks', amount: 12, type: 'expense', date: '2026-05-01', method: null, ...over };
}

describe('docKindFromMime', () => {
  it('routes PDFs and images to the binary (vision) path', () => {
    expect(docKindFromMime('application/pdf', 'statement.pdf')).toBe('binary');
    expect(docKindFromMime('image/png', 'shot.png')).toBe('binary');
    expect(docKindFromMime('image/jpeg', 'a.jpg')).toBe('binary');
  });
  it('routes CSV by mime or extension', () => {
    expect(docKindFromMime('text/csv', 'x.csv')).toBe('csv');
    expect(docKindFromMime('application/octet-stream', 'export.csv')).toBe('csv');
  });
  it('routes Excel and Word by mime or extension', () => {
    expect(docKindFromMime('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'b.xlsx')).toBe('xlsx');
    expect(docKindFromMime('application/octet-stream', 'old.xls')).toBe('xlsx');
    expect(docKindFromMime('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'c.docx')).toBe('docx');
  });
  it('returns unsupported for unknown types', () => {
    expect(docKindFromMime('application/zip', 'a.zip')).toBe('unsupported');
  });
});

describe('docxXmlToText', () => {
  it('turns paragraphs into lines and strips tags + entities', () => {
    const xml =
      '<w:document><w:body>' +
      '<w:p><w:r><w:t>Tesco &amp; Co</w:t></w:r><w:r><w:t> 25.40</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>Salary</w:t></w:r></w:p>' +
      '</w:body></w:document>';
    expect(docxXmlToText(xml)).toBe('Tesco & Co 25.40\nSalary');
  });
});

describe('matchSourceCategory', () => {
  const cats = [cat({ id: 'dining', label: 'Dining', kind: 'expense' }), cat({ id: 'salary', label: 'Salary', kind: 'income' })];
  it('matches a hint to a category of the right kind, case-insensitively', () => {
    expect(matchSourceCategory('dining', cats, 'expense')).toBe('dining');
    expect(matchSourceCategory('  SALARY ', cats, 'income')).toBe('salary');
  });
  it('does not match across kinds, or unknown hints, or null', () => {
    expect(matchSourceCategory('dining', cats, 'income')).toBeNull();
    expect(matchSourceCategory('groceries', cats, 'expense')).toBeNull();
    expect(matchSourceCategory(null, cats, 'expense')).toBeNull();
  });
});

describe('assignImported', () => {
  const cats = [
    cat({ id: 'dining', label: 'Dining', kind: 'expense' }),
    cat({ id: 'groceries', label: 'Groceries', kind: 'expense' }),
    cat({ id: 'salary', label: 'Salary', kind: 'income' }),
  ];
  const catById: Record<string, Category> = Object.fromEntries(cats.map((c) => [c.id, c]));

  it('prefers learned memory when the kind matches', () => {
    const memory: MemoryMap = { starbucks: 'dining' };
    const out = assignImported([item({ merchant: 'Starbucks' })], memory, cats, catById);
    expect(out).toEqual(['dining']);
  });
  it('falls back to a matching source category hint', () => {
    const out = assignImported([item({ merchant: 'Unknown Shop', categoryHint: 'Groceries' })], {}, cats, catById);
    expect(out).toEqual(['groceries']);
  });
  it('ignores a learned category whose kind mismatches the item, using the fallback', () => {
    const memory: MemoryMap = { acme: 'dining' }; // expense category on an income row
    const out = assignImported([item({ merchant: 'Acme', type: 'income' })], memory, cats, catById);
    expect(out).toEqual(['income']); // DEFAULT_INCOME_ID
  });
  it('falls back to Other for an uncategorizable expense', () => {
    const out = assignImported([item({ merchant: 'Mystery', categoryHint: null })], {}, cats, catById);
    expect(out).toEqual(['other']); // DEFAULT_EXPENSE_ID
  });
});

describe('applyDedup', () => {
  const saved: Transaction[] = [
    {
      id: 't1', merchantRaw: 'Starbucks', merchantKey: 'starbucks', amount: 12, currency: 'MYR',
      type: 'expense', date: '2026-05-01', categoryId: 'dining', createdAt: '2026-05-01T09:00:00.000Z', source: 'manual',
    },
  ];

  it('marks exact duplicates as DROP and counts them', () => {
    const items = [item({ merchant: 'Starbucks', amount: 12, date: '2026-05-01' }), item({ merchant: 'New Cafe', amount: 8, date: '2026-05-02' })];
    const { assignments, skipped } = applyDedup(items, ['dining', 'dining'], saved, '2026-06-02');
    expect(assignments).toEqual([DROP, 'dining']);
    expect(skipped).toBe(1);
  });

  it('keeps everything when nothing matches', () => {
    const items = [item({ merchant: 'New Cafe', amount: 8, date: '2026-05-02' })];
    const { assignments, skipped } = applyDedup(items, ['dining'], saved, '2026-06-02');
    expect(assignments).toEqual(['dining']);
    expect(skipped).toBe(0);
  });
});
