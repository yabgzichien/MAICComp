export interface GlossaryEntry {
  term: string;
  short: string;
  body: string;
}

/** Glossary content for InfoButton/GlossaryModal, mirroring LenderConsole's GLOSSARY shape
 *  (LenderConsole/app/tokens.ts) so the two apps explain shared concepts consistently. */
export const GLOSSARY: Record<string, GlossaryEntry> = {
  score: {
    term: 'Credit score',
    short: 'A 0-100 number summarizing how reliably you manage money.',
    body: 'Built from your verified income, spending, and repayment history. It updates as you add more data sources or as your habits change, and it drives which loan offers and terms you unlock.',
  },
  band: {
    term: 'Credit band',
    short: 'The tier your score falls into: Building, Fair, Good, Strong, or Excellent.',
    body: 'Lenders use the band as a quick read on risk. Moving up a band typically unlocks larger loan amounts and lower rates, even if your raw score only moved a few points.',
  },
  confidence: {
    term: 'Data confidence',
    short: 'How much verified data backs your score.',
    body: 'Based on how many days of transaction history are covered and how many sources are verified. Low confidence can cap your band even if your raw score is high, since there is not enough evidence yet to trust it fully.',
  },
  net_cash_flow: {
    term: 'Net cash flow',
    short: 'What is left after expenses are subtracted from income, over a period.',
    body: 'A positive number means you are taking in more than you spend. Lenders and the score model both watch this trend over time, not just a single month.',
  },
  where_it_goes: {
    term: 'Spending breakdown',
    short: 'How your spending splits across categories.',
    body: 'Grouping transactions by category (food, transport, bills, etc.) makes it easier to spot where a budget is being overspent, and feeds the category-level detail on the Budget screen.',
  },
  apr: {
    term: 'APR',
    short: 'Annual Percentage Rate — the yearly cost of borrowing, as a percentage.',
    body: 'APR includes interest and standard fees, expressed as a yearly rate, so offers with different tenors or fee structures can be compared on equal footing.',
  },
  tenor: {
    term: 'Tenor',
    short: 'The length of the loan, i.e. how many months you have to repay it.',
    body: 'A longer tenor usually means smaller monthly payments but more total interest paid; a shorter tenor means the opposite. Offers on the same score can differ in tenor as well as rate.',
  },
  repayment_schedule: {
    term: 'Repayment schedule',
    short: 'The list of upcoming payments for an active loan: dates and amounts.',
    body: 'Each installment covers a mix of principal and interest. Paying on schedule (or early) is one of the strongest positive signals for your credit score.',
  },
  unallocated: {
    term: 'Unallocated',
    short: 'Income you have not yet assigned to a budget category.',
    body: 'Money sitting here is not tracked against any spending limit. Allocating it to a category (including savings) is what makes the budget reflect your actual plan.',
  },
  holdings: {
    term: 'Holdings',
    short: 'The individual assets (accounts, investments, or lots) that make up your net worth.',
    body: 'Net worth is the sum of what you own (holdings) minus what you owe. Tracking holdings individually lets you see which ones are growing or shrinking your overall position.',
  },
  credit_passport: {
    term: 'Credit Passport',
    short: 'A signed, portable credential summarizing your verified credit profile.',
    body: 'Generated from your score, factors, and verified data sources, then cryptographically signed so a lender can trust it without re-collecting your raw financial data themselves.',
  },
  micro_sukuk: {
    term: 'AI-Structured Micro-Sukuk',
    short: 'A small, Shariah-compliant financing instrument structured around your credit profile.',
    body: 'Instead of a conventional interest-bearing loan, funding is structured as a micro-sukuk (asset/profit-sharing based), sized and priced using your credit score and verified data.',
  },
};
