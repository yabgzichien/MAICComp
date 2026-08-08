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
  belanjawanku: {
    term: 'Belanjawanku',
    short: "Malaysia's official reference budget: what a decent standard of living costs per month.",
    body: 'Published annually by the Social Wellbeing Research Centre at Universiti Malaya together with the EPF, with a separate figure for each household type in twelve cities. Pip compares your spending against this published figure instead of a number the app made up. The essential categories are a minimum, not a target, so spending above them only matters when the category is discretionary.',
  },
  pay_yourself_first: {
    term: 'Pay yourself first',
    short: 'Set aside savings the moment income arrives, before spending on anything else.',
    body: "The habit this app tracks: keep a fixed amount back each month, ideally as soon as you get paid. Belanjawanku's own recommendation is a starting point, but the target is yours to set and raise. This is a habit tracker, not a credit signal; it does not feed your score.",
  },
  safe_income: {
    term: 'Safe monthly income',
    short: 'A conservative floor to budget against when your earnings swing month to month.',
    body: 'Taken from the lower end of your recent months, not the average, because a budget built on the average fails in every month you earn less than that. Planning against the floor turns a good month into savings instead of turning a bad month into a shortfall. This is a budgeting figure only: your credit score and affordability still use your real income.',
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
  net_worth: {
    term: 'Net worth',
    short: 'Everything you own minus everything you owe.',
    body: 'Assets (cash, savings, investments) minus liabilities (loans, credit cards). Watching it rise over time is a clearer picture of financial health than any single month of cash flow.',
  },
  apr: {
    term: 'APR',
    short: 'Annual Percentage Rate: the yearly cost of borrowing, as a percentage.',
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
  income_floor: {
    term: 'Income floor',
    short: 'The monthly income that held up, rather than the one an average implies.',
    body: 'Your monthly income totals are ranked and a low one is taken as the floor, so it is a level you actually reached in most months rather than a midpoint between good and bad ones. An average can be dragged around by a single unusual month; the floor is what a lender can rely on being there.',
  },
  committed_spend: {
    term: 'Committed, essential & flexible',
    short: 'Three tiers of spending, ordered by how much choice you have over each one.',
    body:
      'Committed: recurring outflows at a steady amount, like rent or an instalment. Fixed; cannot be cut this month.\n\n' +
      'Essential: necessary spending that still moves, like food or fuel. Can compress, but never disappears.\n\n' +
      'Flexible: everything else. The part you could genuinely redirect if a month came in weak.',
  },
  micro_sukuk: {
    term: 'AI-Structured Micro-Sukuk',
    short: 'A small, Shariah-compliant financing instrument structured around your credit profile.',
    body: 'Instead of a conventional interest-bearing loan, funding is structured as a micro-sukuk (asset/profit-sharing based), sized and priced using your credit score and verified data.',
  },
};
