# Market-Aligned Product Ladder and Pricing Policy

*Repricing `DEFAULT_PRODUCTS` and lowering `targetReturn` in `lib/loans.ts`, plus the matching band APRs in `lib/samplePool.ts`, so the demo models Malaysian microfinance instead of a payday product. Constants and comments only — no engine logic changed.*

---

## 1. Problem

The old ladder priced Emergency Micro at **36%**, Starter at 28%, Growth at 22%, Scale at 16%, on amounts of RM100–500 / RM2k–5k / RM4k–10k / RM8k–20k.

**The rates were unlawful at the top of the ladder.** Under the Moneylenders Act 1951 s.17A the maximum interest on an *unsecured* loan is **18% per annum**, and an agreement charging above it is **void and unenforceable**. Three of the four tiers sat above that. (Licensed banks under BNM are not bound by the Act; Pip Credit does not present itself as one, and its buyers — AIM, TEKUN, koperasi, digital lenders — mostly are not either.)

**The rates were also far outside the market.** Every legitimate Malaysian microcredit provider prices between 4% and 18%: BNM's Skim Pembiayaan Mikro at roughly 8.25% flat, TEKUN Niaga at 4% flat, Amanah Ikhtiar Malaysia at a 10% service charge, SC-licensed P2P platforms such as Funding Societies at 0.8–1.5% per month. A 36% headline undercut the inclusion thesis the whole entry rests on.

**The Emergency floor sat below the regulated category.** BNM defines microfinance as collateral-free business financing of RM1,000 to RM50,000. A RM100–500 tier is beneath the category's entry point, and RM500 was the number the demo actually put on screen — it read as a payday advance rather than working capital.

## 2. What changed

Emergency Micro is now RM500–2,000 at 18% over 6 months; Starter Capital RM2,000–5,000 at 16% over 12; Growth Capital RM4,000–10,000 at 14% over 18; Scale Capital RM8,000–20,000 at 12% over 24. `targetReturn` drops from 6% to 4%; `costOfFunds` is unchanged at 5%.

Two deliberate limits on how far the amounts moved.

**The RM20,000 ceiling stays.** RM2k–RM20k working capital is locked positioning, carried by the authoritative spec, the pitch narrative, HANDOFF.md and the securitization plan. Lifting the ladder to BNM's RM50,000 would be a strategy change, not a constants change, and would leave the deck describing a different product from the code. Only the Emergency tier moved, because only the Emergency tier was off-strategy.

**The Emergency minimum stays at RM500, not BNM's RM1,000.** `minAmount` is a *decline* threshold, not a marketing floor: `selectTier` picks the single highest tier a score qualifies for with no fallback, and when affordability scales an offer below `tier.minAmount`, `affordablePrincipal` returns zero and `decideLoan` declines outright. Raising the floor to RM1,000 would therefore reject the thinnest files rather than offer them less — precisely inverting the product's purpose. The ceiling does the work instead: four times the old cap.

## 3. Why `targetReturn` had to move with the ladder

`priceLoan` clamps its suggestion to the tier APR as a ceiling, and the floor of any suggestion is cost of funds plus expected loss plus target return. At the old 6% target that floor was 11% before risk and 15.8% for a Good-band file — above three of the four new tiers.

Cutting ladder rates without touching the target would have clamped nearly every band, driving `discountBps` to zero and making the risk-based-pricing panel render "ladder rate stands" for almost every applicant. The feature would have died silently on screen. At a 4% target the top three bands price below their tier on all four tiers, and the discount stays visible.

## 4. Verified behaviour

Suggested rates are now 10.2% for Excellent, 11.4% for Strong and 13.8% for Good, against ladder rates of 18/16/14/12. That yields discounts of 780/660/420 bps on Emergency, 580/460/220 on Starter, 380/260/20 on Growth, and 180/60/0 on Scale. Fair and Building clamp at the ladder on every tier, which is the honest signal rather than a defect.

One consequence is worth stating plainly: at the 18% statutory cap the Building band prices at a **negative 2% net margin**, where the old 36% ladder showed roughly +16%. That is not an artefact. It is the actual economics of lending to a 25%-PD file under a legal rate ceiling, and it is the reason that band is underserved in the real market. It also sharpens the product argument — the value of the fraud and confidence layer is that it moves files *out* of that band by evidence rather than pricing them punitively.

Affordability was re-checked against the Farid persona (income RM3,200, surplus RM950, existing debt service RM150). The binding constraint is the surplus cap at RM332.50 per month, which now supports about RM1,894 on Emergency and RM3,665 on Starter. His headline offer moves from RM500 to roughly RM1,900 with no change to his passport.

Reaching Growth's RM10,000 ceiling needs an instalment near RM620 per month, so about RM1,770 of monthly surplus. No current demo persona is close, so the upper tiers remain unexercised by the seeded book. Adding a persona at roughly RM6,000 income with RM2,000 surplus would fix that, but demo applicants are **signed passport blobs** — this is a generate-and-sign job against the issuer key, not a data edit, and it is deliberately deferred.

## 5. Sample pool

`lib/samplePool.ts` carries its own per-band APR table feeding the Portfolio and Capital Markets views. Left alone it would have described a book the console could no longer originate. Band APRs now track the ladder through each band's score range — Building to Emergency at 18%, Fair to Starter at 16%, Good to Growth at 14%, Strong and Excellent to Scale at 12%. Tenors are unchanged, and because `TERMS` is a lookup rather than a `rand()` call, the pool's principal and fraud-probability sequence is untouched; the seed-1337 pool is still reproduced loan-for-loan.

## 6. Two override layers above the constants

Changing `DEFAULT_PRODUCTS` does not by itself change what the app serves.

A **persisted policy** in `.data/policy.json` was pinning TEKUN to the old ladder. `readLenderPolicy` honours any stored policy carrying `updatedAt` as-is, and the Policy tab had been saved on 2026-08-04 without edits, so the file held a byte-for-byte copy of the old defaults. After the reprice the live `/api/policy` still returned 36/28/22/16 and a 6% target. It has been backed up to `.data.backup-20260806-ladder/` and cleared; a missing file reads as never-edited and falls back to defaults. Anyone testing a constants change here should check the API response, not the source.

`LENDER_REGISTRY` is the second layer: each lender carries its own ladder, and an unedited lender decides against that rather than the engine defaults. TEKUN aliases `DEFAULT_PRODUCTS`, so it inherited this change; the other two are independent.

That leaves an inconsistency worth a decision. **Dana Niaga still prices 29 / 25 / 22%**, above the same statutory cap that made the old TEKUN ladder unlawful; its comment justifies this against a CCA 2025 30% advisory ceiling, a different instrument from the Moneylenders Act. It is unchanged on purpose — it is the directory's "expensive but fast" archetype and the three-lender comparison depends on the spread — but the exemption needs either a reprice or an explicit licensing note in the copy. Koperasi at 12 / 10% is already compliant.

## 7. Test status

Full suite after the change: **909 passing, 15 failing**. All 15 failures are **pre-existing and unrelated** — verified by stashing this change and re-running, which reproduces the identical 15. They stem from a passport signature mismatch (`Farid bin Osman` fails `verify` under the pinned issuer key), which cascades into `demoSeed.test.ts` because the seeder drops entries that fail verification. That is a live issue in `demoApplicants.ts` / the issuer key, tracked separately.

No test asserted the old ladder constants directly, so no fixtures needed updating.

## 8. Not done

The pricing formula itself is unchanged and still omits operating cost and a capital charge for unexpected loss. Its flat target-return spread means a Building file and an Excellent file aim at the same margin per ringgit despite very different capital consumption; a RAROC-style term scaling with PD would fix that. Deferred deliberately — it changes the shape of the model rather than its constants, and the negative Building margin above is the visible edge of that gap.

---

## Sources

- [Bank Negara Malaysia — Microfinance](https://www.bnm.gov.my/microfinance)
- [BNM — Skim Pembiayaan Mikro policy document (PDF)](https://www.bnm.gov.my/documents/20124/938039/pd_Skim_Pembiayaan_Mikro_Policy.pdf)
- [Skrine — BNM issues Policy Document on Skim Pembiayaan Mikro](https://www.skrine.com/insights/alerts/november-2024/bank-negara-issues-policy-document-on-skim-pembiay)
- [Moneylenders Act 1951 (Revised 1989), CommonLII](https://www.commonlii.org/my/legis/consol_act/ma19511989233/)
- [Low & Partners — Moneylenders Act 1951](https://www.lowpartners.com/moneylenders-act-1951/)
- [Funding Societies Malaysia — Micro Financing](https://fundingsocieties.com.my/sme-financing/micro-financing)
- [Capital Markets Malaysia — Peer-to-Peer (P2P) Financing](https://www.capitalmarketsmalaysia.com/digital-peer-to-peer-p2p-financing/)
- [FundingBee — TEKUN vs BSN vs AIM vs FundingBee](https://www.fundingbee.my/en/corporate-article/tekun-vs-bsn-vs-aim-vs-fundingbee)
- [The Sun — AIM approves RM1.6b financing for 185,000 entrepreneurs](https://thesun.my/news/malaysia-news/aim-approves-rm1-6b-financing-for-185000-entrepreneurs/)
- [Wikipedia — Amanah Ikhtiar Malaysia](https://en.wikipedia.org/wiki/Amanah_Ikhtiar_Malaysia)
- [Minneapolis Fed — How do lenders set interest rates on loans?](https://www.minneapolisfed.org/article/2000/how-do-lenders-set-interest-rates-on-loans)
- [MDPI *Risks* — A RAROC Valuation Scheme for Loans](https://www.mdpi.com/2227-9091/8/2/63)
