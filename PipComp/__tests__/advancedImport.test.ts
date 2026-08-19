// __tests__/advancedImport.test.ts
import { buildPrompt, parseJSON } from '../src/lib/advancedImport';

describe('AdvancedImport buildPrompt', () => {
  it('includes clear instructions that merchant description is optional', () => {
    const prompt = buildPrompt();
    expect(prompt).toContain('description: merchant / payee name if available');
    expect(prompt).toContain('OR null if no merchant name is present');
    expect(prompt).toContain('exports from personal finance apps / trackers');
  });

  it('instructs LLM to preserve pre-labeled categories from financial trackers', () => {
    const prompt = buildPrompt();
    expect(prompt).toContain('If the document / tracker already labels a category, ALWAYS preserve and use that label');
    expect(prompt).toContain('leave description as null and capture the category label accurately');
  });

  it('includes accounts and transaction section instructions', () => {
    const prompt = buildPrompt();
    expect(prompt).toContain('SECTION 1 — TRANSACTIONS');
    expect(prompt).toContain('SECTION 2 — ACCOUNT BALANCES');
    expect(prompt).toContain('REPLY FORMAT — ONLY a JSON code block');
  });
});

describe('AdvancedImport parseJSON', () => {
  it('parses JSON with missing or null description from existing financial trackers', () => {
    const jsonStr = JSON.stringify({
      transactions: [
        {
          date: '2026-05-10',
          description: null,
          amount: -45.5,
          category: 'Groceries',
          account: 'Maybank',
        },
        {
          date: '2026-05-11',
          amount: 3500.0,
          category: 'Salary',
          account: 'Maybank',
        },
      ],
      accounts: [
        {
          name: 'Maybank Savings',
          type: 'Cash',
          balance: 12500.0,
          currency: 'MYR',
          as_of: '2026-05-11',
          notes: null,
        },
      ],
    });

    const result = parseJSON(jsonStr);
    expect(result.transactions).toHaveLength(2);

    // First txn: Expense with no merchant, categoryHint "Groceries"
    expect(result.transactions[0]).toEqual({
      merchant: '',
      amount: 45.5,
      type: 'expense',
      date: '2026-05-10',
      method: null,
      categoryHint: 'Groceries',
      account: 'Maybank',
    });

    // Second txn: Income with no merchant, categoryHint "Salary"
    expect(result.transactions[1]).toEqual({
      merchant: '',
      amount: 3500.0,
      type: 'income',
      date: '2026-05-11',
      method: null,
      categoryHint: 'Salary',
      account: 'Maybank',
    });

    // Accounts
    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0].name).toBe('Maybank Savings');
    expect(result.accounts[0].cls).toBe('cash');
    expect(result.accounts[0].balance).toBe(12500.0);
    expect(result.accounts[0].kind).toBe('asset');
    expect(result.accounts[0].include).toBe(true);
  });

  it('parses JSON with explicit merchant description and category', () => {
    const jsonStr = `\`\`\`json
{
  "transactions": [
    {
      "date": "2026-05-12",
      "description": "Village Grocer",
      "amount": -120.30,
      "category": "Food & Groceries",
      "account": "Credit Card"
    }
  ],
  "accounts": []
}
\`\`\``;

    const result = parseJSON(jsonStr);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]).toEqual({
      merchant: 'Village Grocer',
      amount: 120.3,
      type: 'expense',
      date: '2026-05-12',
      method: null,
      categoryHint: 'Food & Groceries',
      account: 'Credit Card',
    });
  });

  it('handles question marks in category as null categoryHint', () => {
    const jsonStr = JSON.stringify({
      transactions: [
        {
          date: '2026-05-12',
          description: 'Transfer Out',
          amount: -50.0,
          category: '?',
        },
      ],
    });

    const result = parseJSON(jsonStr);
    expect(result.transactions[0].categoryHint).toBeNull();
    expect(result.transactions[0].merchant).toBe('Transfer Out');
  });

  it('throws for invalid JSON', () => {
    expect(() => parseJSON('not valid json')).toThrow();
  });

  it('throws if parsed root is not an object', () => {
    expect(() => parseJSON('"a string"')).toThrow('Not a JSON object.');
  });
});
