// src/llm/extractPrompt.ts
// Prompts for pulling structured transactions out of a document (PDF, image, or
// flattened CSV/XLSX/DOCX text). Shared by document-capable providers.

export const DOC_SYSTEM_PROMPT =
  'You are a precise data extractor for a personal expenses app. You read a ' +
  'bank statement, an exported transaction file, or a screenshot and return ONLY ' +
  'JSON. Never add prose, explanations, or markdown fences.';

export const DOC_USER_PROMPT = `Extract every transaction in the attached document.

Return a JSON object exactly in this shape:
{
  "transactions": [
    {
      "merchant": "string — the payee / description / narration as shown",
      "amount": number — positive value, no currency symbol,
      "direction": "out" for money leaving the account (spending), "in" for money received,
      "date": "YYYY-MM-DD if derivable, otherwise null",
      "category": "the category/label from the source if the document has one, otherwise null",
      "method": "optional sub-label, otherwise null"
    }
  ]
}

Rules:
- One object per transaction. Do not merge, split, or invent rows.
- amount is always positive; use "direction" for spend vs received.
- For tabular data, infer which columns are date, description, amount, and (debit/credit) direction.
- ALSO record interest credited and any bank fees or service charges, even when they
  appear only in an account summary rather than the transaction list. Treat interest
  as income ("in") and fees/charges as expense ("out"). Use the per-account or
  per-pocket amounts; never add a combined "Total" row.
- Skip pure balance rows (opening balance, closing balance), headers, and "Total"/subtotal rows.
- If a summary item such as interest has no explicit date, use the statement's end
  date (the "to" date of the statement period).
- If you cannot read a field, use null (never guess amounts or dates).
- Output JSON only.`;

export const HOLDINGS_SYSTEM_PROMPT =
  'You are a precise data extractor for a personal finance app. You read a ' +
  'screenshot of a crypto wallet or exchange and return ONLY JSON. Never add ' +
  'prose, explanations, or markdown fences.';

export const HOLDINGS_USER_PROMPT = `Extract every cryptocurrency holding shown in this screenshot.

Return a JSON object exactly in this shape:
{
  "holdings": [
    {
      "ticker": "the coin's ticker symbol in uppercase, e.g. BTC, ETH, SOL",
      "quantity": number — the AMOUNT of coins held (not its fiat value)
    }
  ]
}

Rules:
- One object per coin. Use the coin QUANTITY (e.g. 0.0123 for 0.0123 BTC), never the fiat/USD/MYR value.
- ticker is the short symbol only (BTC, ETH, …), uppercase.
- Skip totals, fiat balances, staking labels, and any row without a coin amount.
- If you cannot read a coin's quantity, omit that row. Output JSON only.`;

export const BALANCE_SYSTEM_PROMPT =
  'You read a screenshot of a bank account, e-wallet, or loan statement and ' +
  'return ONLY JSON. Never add prose, explanations, or markdown fences.';

export const BALANCE_USER_PROMPT = `Return the main balance or amount shown in this screenshot as JSON:
{ "amount": number }

Rules:
- Use the primary account balance or the outstanding loan amount — NOT available credit, rewards points, or interest.
- Remove currency symbols and thousands separators (e.g. "RM 1,234.50" → 1234.50).
- If you cannot read a single clear amount, return { "amount": null }.
- Output JSON only.`;
