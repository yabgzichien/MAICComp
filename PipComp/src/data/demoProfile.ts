import { addTransactions } from '../db/txnRepo';
import { addAccount, addBalanceEntry } from '../db/accountsRepo';
import { setAllocations, setExpectedIncome } from '../db/budgetRepo';
import { buildDemoSeed } from './demoSeed';

export { buildDemoSeed, type DemoAccountSeed, type DemoSeed } from './demoSeed';

/**
 * Seed a realistic **credit-invisible** gig-worker history for the demo.
 *
 * Deliberately tuned so the Passport Builder Coach tells the inclusion story:
 *  - ~RM2,595/mo gig income vs a healthy surplus (a real, bankable saver);
 *  - spending recorded on only ~5 shared days/month → **thin coverage (~15 of 90 days)**, so
 *    the borrower starts **gated to the RM500 Emergency tier** despite the healthy cash-flow
 *    the "un-assessable" starting point;
 *  - a motorbike hire-purchase liability being paid down, and two rising cash accounts, so net
 *    worth is mildly negative and honestly improving rather than a flat zero.
 *
 * Result: the coach's headline lever is live  extending recorded history to 30 days flips the
 * offer from Emergency REFER to an **approved Starter loan**  the "make the un-assessable
 * assessable" beat, made interactive. Building an on-time repayment record lifts the score too.
 *
 * This is a thin persister: `buildDemoSeed` (src/data/demoSeed.ts) is the pure, unit-tested
 * builder; this function just writes its shape into the store.
 */
export async function loadDemoProfile(): Promise<void> {
  const seed = buildDemoSeed(new Date());

  await addTransactions(seed.transactions);

  for (const account of seed.accounts) {
    const [opening, ...rest] = account.entries;
    const created = await addAccount(account.name, account.kind, account.cls, opening.value, opening.asOf);
    for (const entry of rest) {
      await addBalanceEntry(created.id, entry.value, entry.asOf);
    }
  }

  await setExpectedIncome(seed.budget.expectedIncome);
  await setAllocations(seed.budget.allocations);
}
