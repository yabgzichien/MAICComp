# LenderConsole: Pip Credit lender console (web)

The B2B, web-first counterpart to the Pip Credit borrower app: a dense, compliance-grade UI
for a loan officer, not a consumer app. Built with Next.js (App Router) + TypeScript, backed
by real API routes and a decision engine, not a static mockup. For the product pitch and the
system architecture, see the [root README](../README.md).

---

## Screenshots

<table>
<tr>
<td align="center" width="33%">
<img src="docs/screenshots/verify-trust-panel.png" width="280"><br>
<sub><b>Verify Passport</b><br>Signature check + trust panel</sub>
</td>
<td align="center" width="33%">
<img src="docs/screenshots/decision-audit-trail.png" width="280"><br>
<sub><b>Loan Decision Engine</b><br>Verdict + numbered audit trail</sub>
</td>
<td align="center" width="33%">
<img src="docs/screenshots/servicing.png" width="280"><br>
<sub><b>Servicing</b><br>Post-loan check-ins and the watchlist</sub>
</td>
</tr>
<tr>
<td align="center" width="33%">
<img src="docs/screenshots/portfolio.png" width="280"><br>
<sub><b>Portfolio</b><br>Book-wide validation loop</sub>
</td>
<td align="center" width="33%">
<img src="docs/screenshots/capital-markets.png" width="280"><br>
<sub><b>Capital Markets</b><br>Rated tranches over a loan pool</sub>
</td>
<td align="center" width="33%">
<img src="docs/screenshots/policy.png" width="280"><br>
<sub><b>Policy</b><br>Affordability caps, pricing ladder, AI advisor</sub>
</td>
</tr>
</table>

---

## Verify Passport

A borrower's passport code is checked, not trusted. Verification runs two independent
Ed25519 signature checks over the same canonicalized payload: a **holder signature**,
proving the contents weren't altered since signing, and an **issuer signature**, checked
against Pip's pinned public key, proving the passport was actually issued by Pip and not
self-minted.

Once a passport verifies, a **trust panel** runs five further checks:

1. **Holder signature**: contents unaltered since signing.
2. **Issuer attestation**: genuinely Pip-issued.
3. **Freshness**: inside its validity window, with a warning inside the final 7 days.
4. **Consent**: which tiers were actually granted, and whether any have lapsed.
5. **Stacking check**: how many times this exact passport has been presented at this
   console in the last 24 hours. Zero prior presentments passes; one or two warns; three or
   more fails, surfacing a borrower who may be shopping the same passport to multiple
   lenders before any one of them notices.

---

## Loan Decision Engine

A deterministic engine, not a model, evaluates every application through the same ordered
gates every time:

1. A hard adverse credit record, or a data-integrity floor breach, declines immediately.
2. Confidence below 35% declines outright, too little of the data could be corroborated.
3. Data coverage gates which tiers are even eligible: under 30 covered days restricts an
   applicant to the Emergency tier and forces manual review regardless of affordability;
   under 90 days (or under 50% coverage) caps eligibility to the entry tiers.
4. The highest tier the score qualifies for is selected from the ladder: **Emergency
   Micro** (score 300+), **Starter Capital** (500+), **Growth Capital** (620+), and **Scale
   Capital** (740+). Emergency's rate is pinned at 18% APR, the Moneylenders Act 1951
   statutory ceiling for unsecured lending, not a business choice.
5. The offered amount is the tightest of two independent caps: no more than 35% of monthly
   surplus going to the installment, and no more than a 40% total debt-service ratio. If
   neither cap can support the tier's minimum amount, the application declines instead of
   being force-fit.
6. A soft adverse record, sub-70% confidence, or the coverage gate forces a manual **refer**
   instead of an automatic approve.

Every decision carries a full breakdown (requested amount, tier ceiling, each cap's implied
principal, and the final offer) that drives the on-screen decision waterfall and headroom
bar, and every reason is categorized (affordability, data quality, integrity, credit record,
or policy) so the audit trail always explains itself.

### Risk-based pricing and counter-offers

A pricing assistant can suggest a rate below a tier's published ceiling, based on the
applicant's credit band, expected loss, cost of funds, and target return, but only for a
borrower with a clean or slipping repayment standing, and only ever as a **discount**: it is
mathematically clamped so it can never suggest a rate above the tier's advertised ceiling.
When the requested amount exceeds what the engine can affordably offer, a **counter-offer**
surfaces the largest amount that would actually be approved, naming the exact constraint
that capped it. It never appears on a decline: offering a counter into a declined
application would misrepresent the decision.

### Fraud alert mode

When the borrower app's fraud model flags likely-fabricated data, the whole console shifts
to a red alert state: a data-integrity banner, a forensics panel breaking down the ML
probability, round-number ratio, and Benford deviation, and a forced **refer** that routes
the case to manual review instead of an automatic decision.

---

## Decision documents

Every decision can generate three documents, all assembled from the same underlying facts
so none of them can disagree with each other:

- **Credit memo**: the officer's internal write-up, including a **Consumer Credit Act 2025
  affordability finding** with four checkable lines (repayment capacity, installment
  affordability, data confidence, and coverage), each computed from the same policy
  thresholds the decision engine itself used.
- **Adverse-action letter**: a borrower-facing explanation, generated only for a decline,
  refer, or shortfall counter-offer (a clean approval has nothing adverse to explain). The
  engine's own reasons are rewritten into plain, second-person language, and every letter
  carries an explicit caveat that it's a template for review, not legal advice.
- **Decision file**: a self-contained evidence bundle, the full signed passport, the
  verification result, and the decision, that a lender can retain and independently
  re-verify later without needing this console.

---

## Servicing and early warning

Post-loan, a borrower can share fresh check-in passports that get diffed against their
original approval to catch trouble early:

| Warning flag | Watch threshold | Critical threshold |
| --- | --- | --- |
| Income drop | 15% fall | 30% fall |
| Surplus erosion | 25% fall | 50% fall, or surplus turns negative |
| Coverage stagnation | Tracking activity drops by 10 days | Drops by 25 days |
| Momentum reversal | Score trend turns from rising/flat to falling | (single tier) |
| Repayment decline | On-time ratio falls 15 points | Falls 30 points |

A flag is informational only: it can't restructure or accelerate anything on its own, but it
surfaces the loan on a **watchlist** that sits alongside the ordinary active, settled, and
defaulted sections of the loan book. Repayment standing itself moves through four buckets
(clean, slipping, arrears, impaired), and a serious lapse leaves a "scar" that stays
visible for a year even after the borrower recovers.

---

## Portfolio

A book-wide view across every approved loan: total exposure, a principal-weighted average
score and probability of default, expected loss, and a breakdown by credit band and by
declared loan purpose. Any single band or purpose that makes up more than 40% of total
exposure is automatically flagged as a concentration risk.

---

## Capital Markets

The institutional view: bundling many small loans into a pool and splitting it into
tranches for outside investors. Losses are absorbed bottom-up, a **Subordinated** tranche
(12% of the pool) takes the first losses, then **Mezzanine** (the next 16%), and only once
losses exceed 28% of the pool does the **Senior** tranche (the remaining 72%) take any hit
at all. Each tranche is rated by how many multiples of expected loss sit beneath it as a
buffer, from AAA (well covered) down to unrated Equity (the Subordinated tranche, always the
first-loss piece), and priced with a matching risk spread. The console ships with a
reproducible 1,000-loan sample pool for demonstration, clearly labeled as illustrative
rather than a real securitization.

---

## Policy

A lender configures its own affordability thresholds (confidence floors, surplus and DSR
caps, coverage requirements), its pricing inputs (cost of funds, target return), and its
product ladder (score cutoffs, amount ranges, tenors, rates) here, and it's this exact
configuration the decision engine applies and the borrower app's coach reads when it shows a
borrower their path to qualifying. Any tier priced above 30% APR is flagged for regulatory
scrutiny under the CCA 2025, a warning, not a block.

An **AI policy advisor** compares realized losses against expected losses per credit band
and suggests, in plain language, tightening underwriting where a band is underperforming its
risk model, reviewing thresholds where collection rates are weak, or considering a rate cut
where a band is consistently outperforming. It's a deterministic rules engine, not a trained
model, on the reasoning that training on a handful of demo loans would just repeat the
overfitting problem the fraud model was built to avoid. It only ever suggests; an officer
applies any change manually in the Policy tab.

---

## AI Assessment Panel

Five specialist perspectives review every application: **Fraud & Integrity**, **Credit**,
**Affordability**, **Risk & Stability**, and a **Decision** agent that pulls the other four
together into an overall recommendation. Each specialist's tone (positive, caution, or
negative) is computed from the same numbers already on screen, provenance, score, DSR,
coverage, and so on, and an AI model only narrates that already-computed verdict into one
plain sentence per specialist; it's explicitly instructed never to invent a number or change
a verdict, and a deterministic fallback sentence renders if the AI call fails for any reason.

Critically, the panel **can only add caution, never remove it**: if the deterministic engine
already declined or referred an application, the panel concurs. If the engine approved it
but any specialist disagrees, the panel can flag a dissent and recommend manual review, but
it can never override the engine's decision, amount, or installment. There is no code path
in which the AI panel makes an approval more lenient than what the deterministic engine
already decided.
