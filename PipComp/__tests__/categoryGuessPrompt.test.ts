import {
  buildCategoryGuessPrompt,
  CATEGORY_GUESS_SYSTEM_PROMPT,
  CategoryGuessParseError,
  parseCategoryGuess,
  type CategoryOption,
  type GuessableItem,
} from '../src/llm/categoryGuessPrompt';

const categories: CategoryOption[] = [
  { id: 'groceries', label: 'Groceries', kind: 'expense' },
  { id: 'transport', label: 'Transport', kind: 'expense' },
  { id: 'income', label: 'Income', kind: 'income' },
];

const items: GuessableItem[] = [
  { index: 0, merchant: 'Grab', amount: 15.5, method: 'DuitNow QR', kind: 'expense' },
  { index: 2, merchant: 'Mystery Shop Sdn Bhd', amount: 42, method: null, kind: 'expense' },
];

describe('buildCategoryGuessPrompt', () => {
  it('includes each category id and label', () => {
    const prompt = buildCategoryGuessPrompt(items, categories);
    expect(prompt).toContain('groceries');
    expect(prompt).toContain('Groceries');
    expect(prompt).toContain('transport');
  });

  it('includes each item merchant and original index', () => {
    const prompt = buildCategoryGuessPrompt(items, categories);
    expect(prompt).toContain('Grab');
    expect(prompt).toContain('Mystery Shop Sdn Bhd');
    expect(prompt).toContain('0:');
    expect(prompt).toContain('2:');
  });

  it('does not include an index for an item not in the batch', () => {
    const prompt = buildCategoryGuessPrompt(items, categories);
    expect(prompt).not.toContain('1:');
  });
});

describe('CATEGORY_GUESS_SYSTEM_PROMPT', () => {
  it('is a non-empty string that forbids inventing category ids', () => {
    expect(typeof CATEGORY_GUESS_SYSTEM_PROMPT).toBe('string');
    expect(CATEGORY_GUESS_SYSTEM_PROMPT.length).toBeGreaterThan(0);
    expect(CATEGORY_GUESS_SYSTEM_PROMPT).toMatch(/not in the provided list/i);
  });
});

describe('parseCategoryGuess', () => {
  it('maps a well-formed reply back to original indices', () => {
    const result = parseCategoryGuess('{"0":"transport","2":"groceries"}', items, categories);
    expect(result).toEqual({ 0: 'transport', 2: 'groceries' });
  });

  it('tolerates a ```json fenced block', () => {
    const result = parseCategoryGuess('```json\n{"0":"transport","2":null}\n```', items, categories);
    expect(result[0]).toBe('transport');
    expect(result[2]).toBeNull();
  });

  it('drops a category id that does not exist', () => {
    const result = parseCategoryGuess('{"0":"not-a-real-category","2":"groceries"}', items, categories);
    expect(result[0]).toBeNull();
    expect(result[2]).toBe('groceries');
  });

  it('drops a category id whose kind does not match the item', () => {
    // item 0 is an expense; "income" is an income-kind category
    const result = parseCategoryGuess('{"0":"income","2":"groceries"}', items, categories);
    expect(result[0]).toBeNull();
    expect(result[2]).toBe('groceries');
  });

  it('treats a missing key as null rather than throwing', () => {
    const result = parseCategoryGuess('{"0":"transport"}', items, categories);
    expect(result[0]).toBe('transport');
    expect(result[2]).toBeNull();
  });

  it('throws CategoryGuessParseError on non-JSON', () => {
    expect(() => parseCategoryGuess('not json at all', items, categories)).toThrow(CategoryGuessParseError);
  });

  it('throws CategoryGuessParseError when the reply is a JSON array, not an object', () => {
    expect(() => parseCategoryGuess('["transport","groceries"]', items, categories)).toThrow(CategoryGuessParseError);
  });
});
