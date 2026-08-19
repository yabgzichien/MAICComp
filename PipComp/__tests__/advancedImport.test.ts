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

  it('defaults transfers, commitments, and account quantity/cost to empty/null when absent (a plain LLM reply never carries them)', () => {
    const result = parseJSON(JSON.stringify({ transactions: [], accounts: [{ name: 'X', type: 'Cash', balance: 100 }] }));
    expect(result.transfers).toEqual([]);
    expect(result.commitments).toEqual([]);
    expect(result.accounts[0].quantity).toBeNull();
    expect(result.accounts[0].cost).toBeNull();
  });

  it('parses a quantity/cost pair on an account row (version 2)', () => {
    const result = parseJSON(JSON.stringify({
      accounts: [{ name: 'VOO', type: 'Investments', balance: 600, quantity: 1.5, cost: 600 }],
    }));
    expect(result.accounts[0]).toMatchObject({ quantity: 1.5, cost: 600 });
  });

  it('parses transfers as their own array, unsigned, separate from transactions', () => {
    const result = parseJSON(JSON.stringify({
      transfers: [{ date: '2026-06-15', description: 'Stockbroker DCA', amount: 200, account: 'CIMB Bank' }],
    }));
    expect(result.transactions).toEqual([]);
    expect(result.transfers).toEqual([
      { date: '2026-06-15', description: 'Stockbroker DCA', amount: 200, account: 'CIMB Bank' },
    ]);
  });

  it('takes the absolute value of a negative transfer amount', () => {
    const result = parseJSON(JSON.stringify({ transfers: [{ description: 'X', amount: -50 }] }));
    expect(result.transfers[0].amount).toBe(50);
  });

  it('parses a commitment with its occurrence history', () => {
    const result = parseJSON(JSON.stringify({
      commitments: [{
        label: 'Maxis Postpaid', kind: 'expense', amount: 89, dueDay: 5, category: 'Communications',
        fromAccount: 'Touch \'n Go', toAccount: null, startMonth: '2026-06', endMonth: null,
        occurrences: [{ dueDate: '2026-06-05', status: 'paid', paidOn: '2026-06-03', paidAmount: 89 }],
      }],
    }));
    expect(result.commitments).toHaveLength(1);
    expect(result.commitments[0]).toMatchObject({
      label: 'Maxis Postpaid', kind: 'expense', amount: 89, dueDay: 5, category: 'Communications',
      fromAccount: "Touch 'n Go", toAccount: null, startMonth: '2026-06', endMonth: null,
    });
    expect(result.commitments[0].occurrences).toEqual([
      { dueDate: '2026-06-05', status: 'paid', paidOn: '2026-06-03', paidAmount: 89 },
    ]);
  });

  it('drops a commitment with no label, and a malformed occurrence with no dueDate', () => {
    const result = parseJSON(JSON.stringify({
      commitments: [
        { label: '', amount: 50, dueDay: 1 },
        { label: 'Astro', amount: 100, dueDay: 3, occurrences: [{ status: 'paid' }, { dueDate: '2026-06-03', status: 'paid' }] },
      ],
    }));
    expect(result.commitments).toHaveLength(1);
    expect(result.commitments[0].label).toBe('Astro');
    expect(result.commitments[0].occurrences).toHaveLength(1);
  });

  it('clamps an out-of-range dueDay and falls back to expense kind for an unrecognised kind', () => {
    const result = parseJSON(JSON.stringify({
      commitments: [{ label: 'X', amount: 10, dueDay: 45, kind: 'weird' }],
    }));
    expect(result.commitments[0].dueDay).toBe(31);
    expect(result.commitments[0].kind).toBe('expense');
  });
});
