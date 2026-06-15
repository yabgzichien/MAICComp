# Pip Credit — Competition Rubric Self-Assessment & Improvement Plan

*An honest, evidence-grounded scoring of the project against the MAIC Nexus T3 rubric, plus concrete moves to score higher. This is a self-assessment to guide effort, not the judges' actual marks. Figures dated June 2026.*

**Re-scored after the 12-slide pitch deck (the deck is built).** A judged competition scores what the panel can *see and understand* — so a deck that converts narrated claims into evidenced ones legitimately lifts the marks, even though it doesn't change the underlying artifact. The per-domain notes below carry a **Deck impact** line; the residual gaps (no signed LOIs, mock eKYC, foreign ML data, no backend) are what still cap each score.

Improvements are tagged **[Build]** (code/artifact), **[Deck]** (pitch/narrative — often the cheapest points), or **[Outreach]** (people/partners).

---

## Scoreboard (post-deck)

| Domain | Weight | Pre-deck | Score | Weighted | One-line verdict |
|---|---|---|---|---|---|
| Technical Feasibility | 25% | 86 | 88 | 22.0 | Strongest pillar — and the deck now makes the depth legible to judges. |
| Commercial Viability | 25% | 68 | 76 | 19.0 | Biggest gain — explicit price, model & bottom-up SOM. Capped only by no LOIs. |
| Industry Relevance | 20% | 85 | 88 | 17.6 | The regulatory-clock slide makes "why now" undeniable. |
| Scalability | 15% | 70 | 76 | 11.4 | Near-zero marginal cost + Open Finance rail now clearly framed. |
| ESG / National Impact | 15% | 83 | 86 | 12.9 | Responsible-lending/governance angle now explicit; E still light. |
| **Overall** | **100%** | **≈ 78.5** | — | **≈ 83 / 100** | A strong, well-evidenced entry; remaining points need *proof* (a buyer), not more slides. |

The deck moved the project from **~78.5 → ~83**, almost entirely by turning "narrated" into "evidenced" — especially in Commercial. The headline is unchanged: you are **technically credible and perfectly timed**, and the last points you're missing are **a proven buyer and production-hardening**, not communication.

---

## 1. Technical Feasibility — 88 / 100 (weight 25%)

> *How well-built is the artifact? Is the AI work real and load-bearing — not just a wrapper?*

**Deck impact (+2).** Slides 5–7 now *show* the artifact (real borrower-app + lender-console screenshots) and spell out the "two real AI pillars + deterministic decision" story, surfacing depth a judge would otherwise miss (the integrity rings, the capital-markets/sukuk view, AUC 0.90). Underlying gaps unchanged — so the lift is modest; Technical is judged mostly on the artifact, which the deck reflects but doesn't alter.

**Why this score.** This is your best domain and the rubric question is almost tailor-made for the architecture. The AI is genuinely **load-bearing in two distinct places**, and deliberately *absent* from a third — which is itself a sophisticated answer:

- **Vision OCR pipeline** turns bank/e-wallet screenshots into structured transactions — without this there is no product. Real, not a wrapper.
- **ML fraud / data-confidence layer** — a logistic model trained on **real** Berka bank data (AUC 0.90, not synthetic), now hardened with the deterministic **asymmetric-fraud integrity rings**. This is real risk engineering, not a prompt.
- **The credit *decision* is deliberately deterministic and explainable** (`creditScore`, `decideLoan`) — "AI is a coach, not a calculator." Judges who probe for "LLM wrapper" hit a wall: the consequential math is auditable and the AI is scoped to where it earns its place.
- **Depth signals:** Ed25519-signed passport + issuer attestation, eKYC NRIC parsing, a securitization/tranche engine, 324 passing tests, typecheck + web-bundle gates.

**Gaps costing points.**
- **eKYC verification is a mock** (NRIC parsing is real; the provider is stubbed).
- **ML is trained on Czech (Berka) data**, not Malaysian — a sharp judge will ask.
- **No backend** — issuance, revocation, and the presentment registry are on-device only; "production-grade" is not yet demonstrable.
- **Ring 1 (balance reconciliation) is inert** until OCR captures the running-balance column; web SQLite is alpha; camera UX unverified on-device.

**How to score higher.**
- **[Build]** Wire one **real eKYC** connector (CTOS eKYC / Innov8tif / MyDigital ID), even sandbox — removes the single biggest "it's a mock" deduction. *(highest leverage)*
- **[Build]** Add a **live fraud-catch demo beat**: paste a tampered statement → confidence collapses → DECLINE with the integrity reasons shown on screen. Makes the ML *visibly* load-bearing in the demo video. Cheap — it reuses what's already built.
- **[Build]** Retrain the fraud model on a **small real Malaysian / DuitNow sample** and ship the deferred 5 income-segmented features (vector 9→14). Turns the "foreign data" critique into a strength.
- **[Build]** Take **Ring 1 live** — capture the balance column in extraction so reconciliation actually fires.
- **[Build/Deck]** Publish a one-page **robustness eval**: detection precision/recall on injected-income attacks. Quantifying "real AI" beats asserting it.
- **[Build]** A thin **serverless backend** for passport issuance + revocation moves you from "on-device toy" to "infrastructure."

---

## 2. Commercial Viability — 76 / 100 (weight 25%)

> *Who pays? How big is the opportunity? Is there a credible path from artifact to revenue?*

**Deck impact (+8 — the biggest gain).** This was the weakest domain and the deck directly fixes the *communication* half: slide 9 gives a layered TAM/SAM/SOM with a bottom-up beachhead (10 lenders × ~50k/yr ≈ 500k verified passports), slide 10 names a concrete (provisional) price (RM2/verified query), states "lenders are the buyer, the app stays free", and shows a pilot→registry→scale path. The remaining cap is real and not a slide problem: **no signed LOIs/pilots and no billing backend** — i.e. demand is now well-argued but still unproven.

**Why this score.** The *opportunity* is large and the *timing* is excellent; the *proof* is thin. You have a clear "who pays" (licensed lenders — koperasi, AIM, TEKUN, BNPL, digital lenders) and a real tailwind:

- **RM90bn MSME financing gap** ([Funding Societies / IFC](https://www.smefinanceforum.org/sites/default/files/Data%20Sites%20downloads/IFC%20Report_MAIN%20Final%203%2025.pdf)); MSMEs are ~97% of businesses, 39.5% of GDP.
- **CCA 2025 forces the demand:** in force 1 March 2026, with **credit-provider licensing effective 1 June 2026** ([DFDL](https://www.dfdl.com/insights/content-hub/articles/malaysia-a-summary-of-the-consumer-credit-act-2025/)) — licensed lenders now *legally* need defensible affordability assessment, and have no tool for the credit-invisible.
- **BNPL is a ready buyer pool:** RM12bn over 140.4M transactions in H2 2025, 7.5M active accountholders ([Conventus Law](https://conventuslaw.com/report/malaysia-consumer-credit-act-2025/)).
- The **credit-reporting market itself** is ~RM406m and growing ~28% CAGR — a paying, expanding category.

**Gaps costing points.** No signed pilots or LOIs; the **monetization backend** (issuer + presentment-registry billing) isn't built; no validated pricing; long B2B sales cycles; incumbents (CTOS, Experian) own the lender relationships.

**How to score higher.**
- **[Outreach]** Land **1–2 design-partner LOIs** from a koperasi / AIM / TEKUN / BNPL provider. A single letter of intent converts "credible path" into "proven demand" — the biggest single point-swing available to you.
- **[Deck]** State **explicit pricing + unit economics**: e.g. per-verification fee or SaaS tier × lender query volume; show one clean revenue line and a bottom-up **SOM** (e.g. 50 lenders × N queries/yr), nested in the RM90bn gap / 7.5M BNPL TAM.
- **[Deck]** **Position vs CTOS/Experian as complementary**, not competitive — you fill the thin-file gap their bureau data can't, making you a channel partner or acquisition target. De-risks the GTM in judges' eyes.
- **[Build]** A **billing-hook MVP** on the registry backend so the revenue mechanism is demonstrable, not described.

---

## 3. Industry Relevance — 88 / 100 (weight 20%)

> *Does the solution address a real, current need within its chosen industry track?*

**Deck impact (+3).** Slide 3's regulatory-clock timeline (CCA in force → 1 June 2026 licensing → BNPL boom → Open Finance 2027) makes "why now" undeniable, and slide 2's precise "banked but thin-file, not unbanked" framing lifts relevance above the crowded "alt-data score" pack. Slides also tag the served rubric domain, so the panel can't miss the fit.

**Why this score.** Close to a bullseye for T3 Financial Services. The need is real, current, and *regulator-driven* rather than invented: the CCA affordability mandate, the RM90bn gap, and the structural exclusion of thin-file micro-entrepreneurs. You also credibly hit all five T3 sub-themes (fintech, risk modelling, fraud detection, capital-markets AI, inclusive finance). A timely nuance strengthens the thesis: the **Dec 2025 MyInvois change** raised the permanent e-invoice exemption to **RM1m turnover** ([ClearTax](https://www.cleartax.com/my/en/different-phases-implementation-timelines-einvoicing-malaysia)) — so your target micro-segment stays *off* the formal-data grid and *remains credit-invisible*. The need isn't closing; it's structurally persistent.

**Gaps costing points.** "Alt-data credit scoring" is the most crowded theme in the track — judges will have seen many. Your differentiation (user-owned signed passport + on-device + integrity rings) is what rescues relevance from sameness, so it must be loud.

**How to score higher.**
- **[Deck]** Open the pitch with the **1 June 2026 licensing deadline**: "lenders are now legally compelled to assess affordability — and have no instrument for the credit-invisible." Urgency = relevance.
- **[Deck]** Map artifact features **1:1 to CCA obligations** (affordability assessment, responsible lending, anti over-indebtedness). Show regulatory fit on a single slide.
- **[Deck]** Lead with the **passport + on-device + fraud-integrity** wedge, explicitly *not* "another alt-data score," so you don't drown in the crowded theme.
- **[Outreach]** One credit-officer interview quote validating the workflow pain is worth more than another stat.

---

## 4. Scalability — 76 / 100 (weight 15%)

> *Can this grow beyond the prototype — more users, more data, more markets?*

**Deck impact (+6).** Slide 11 now states the scaling case plainly — ~RM0 marginal cost per borrower, bank-agnostic capture (no per-bank integration), SEA portability, the free data-upgrade onto Open Finance (2027), and a multi-tenant lender API on the roadmap. The build gaps (the backend, per-market ML retraining) are unchanged, so it's well-argued but not yet demonstrated.

**Why this score.** Architecturally cheap to scale: on-device compute means ~zero marginal cost per borrower; the deterministic engines and cached ML scale trivially; and **screenshot capture is bank-agnostic**, so it works without per-bank API integrations and ports to any emerging market (alt-credit already has traction in Indonesia/Philippines). There's also a clean data-upgrade path: **BNM Open Finance** (exposure draft Nov 2025, first batch **1 Jan 2027**, built on PayNet + 7 banks + EPF — [Fintech News MY](https://fintechnews.my/54091/regtech-fintech-regulation-malaysia/malaysia-open-finance/)) is the permissioned, auto-scaling income rail you can migrate onto.

**Gaps costing points.** Screenshot capture has **manual friction** (data volume doesn't auto-scale per user); **no multi-tenant backend** to onboard lenders without code; the ML needs **per-market retraining**; regional expansion needs localized eKYC and credit norms.

**How to score higher.**
- **[Deck]** Draw the **data-rail migration story** explicitly: screenshots today → BNM Open Finance API (2027) tomorrow. Same engine, friction falls away — this directly answers "more data."
- **[Build]** A **multi-tenant lender API/console** so onboarding a new lender is configuration, not engineering — the core of "more users."
- **[Deck]** Quantify the **cost curve**: on-device inference + cached pricing = near-zero marginal cost; contrast with API-per-call incumbents.
- **[Deck]** Articulate **SEA portability** (Indonesia/Philippines) with a transfer-learning plan for the ML and a pluggable eKYC seam (you already have the interface) — answers "more markets."

---

## 5. ESG / National Impact — 86 / 100 (weight 15%)

> *Does it advance environmental, social, governance, or national-priority outcomes for Malaysia?*

**Deck impact (+3).** Slide 11 finally makes the under-sold **governance** point explicit — "integrity rings + affordability caps actively prevent over-indebtedness (the CCA's intent)" — alongside inclusion (3–4M reachable, MADANI-aligned) and data sovereignty. **Environmental is still the gap**: the ~RM0 / on-device line doubles as a low-carbon signal but isn't framed as one.

**Why this score.** Strong on **Social** and **National**, real on **Governance**, light on **Environmental**:

- **Social / national priority** — financial inclusion of credit-invisible micro-entrepreneurs and the **~3–4M self-employed / gig workers** (≈26% of the workforce; [HR Asia](https://hr.asia/workforce-management/gig-workers-remain-outside-safety-net-in-malaysia/)), directly serving MADANI Economy inclusion goals and MSME growth (39.5% of GDP).
- **Governance** — this is underplayed but genuine: the **integrity rings + affordability caps actively prevent over-indebtedness**, i.e. an anti-predatory, responsible-lending mechanism that *embodies* the CCA's consumer-protection intent. Plus auditable, explainable decisions.
- **Data sovereignty** — a user-owned passport, computed on-device, whose evidence hash never exposes raw transactions: privacy-by-design and a national data-sovereignty angle.

**Gaps costing points.** The **Environmental** leg is near-empty; impact claims are qualitative (no measurement framework).

**How to score higher.**
- **[Deck]** Make the **responsible-lending / anti-over-indebtedness** story explicit — frame the fraud-integrity work and affordability caps as an ESG *governance* feature, not just a tech feature. This is your most under-sold point.
- **[Deck]** **Quantify inclusion impact**: addressable 3–4M gig/self-employed, alignment with Budget 2026 gig protections and BNM financial-inclusion targets; add a simple impact-measurement plan (# credit-invisible approved, default-rate vs a control).
- **[Deck]** Reframe **on-device, no-datacenter inference** as a low-carbon footprint — turns the weak Environmental leg into a small positive.
- **[Deck]** Position as **public-good infrastructure** that can plug into national digital ID / Open Finance — national-priority framing.

---

## The highest-leverage moves now (post-deck)

The deck already executed the narrative-spine move (✓ CCA-deadline → Open Finance rail is now slide 3 + 11). What's left is mostly *proof* and *production*, not slides:

1. **[Outreach] Prove the buyer** — 1–2 design-partner LOIs from a koperasi / AIM / TEKUN / BNPL lender. This is now the single biggest remaining lever: it's the only thing capping Commercial (25%) below ~80, and it converts slide 10's "LOIs in progress" into a fact.
2. **[Build] Make the AI *visibly* real in the demo video** — a live fraud-catch beat (tampered statement → confidence collapses → DECLINE, reusing the integrity rings) + one real eKYC connector + a small Malaysian-data retrain. Turns Technical's residual deductions (mock eKYC, foreign data) into strengths.
3. **[Build] A thin multi-tenant backend** (issuance + revocation + a billing hook) — moves Scalability and Commercial from "argued" to "demonstrated," and makes the registry revenue mechanism real.

## Making the deck itself better (polish before submission)

The deck is strong; these are tightening notes, not rebuilds:

- **Verify the page count.** The exported PDF reports **16 pages but only 12 carry content** — trim any trailing blank pages so the file is exactly 12 (the hard limit). A 16-page file risks an automatic-compliance ding.
- **Check headline legibility.** In the export the display font renders with a slightly rough/distressed texture. Confirm it's crisp natively and on a projector; if it's a deliberate hand-sketch face, consider a cleaner weight — fintech credibility leans on crisp, trustworthy type.
- **Close the SOM→revenue loop on slide 9/10.** You give volume (≈500k verified passports/yr) and price (RM2/query) separately — state the product once (**≈ RM1M/yr beachhead revenue**) so the judge doesn't have to multiply. Biggest single content upgrade.
- **Add one environmental line** to slide 11 (e.g. "on-device inference = no datacenter footprint") to stop leaving the E in ESG empty.
- **Slide 6 is dense** for a live room — fine as a read-along PDF, but if presented, zoom to one console view. Consider a tiny "verified ✓ signature + issuer key" callout so the cryptographic check reads at a glance.
- **Spelling/consistency pass** — e.g. "unscoreable" → "unscorable"; confirm every footnote source matches the appendix.

---

## Sources

- [Consumer Credit Act 2025 — Conventus Law](https://conventuslaw.com/report/malaysia-consumer-credit-act-2025/) · [DFDL summary](https://www.dfdl.com/insights/content-hub/articles/malaysia-a-summary-of-the-consumer-credit-act-2025/) · [RAM: credit-positive for securitisation](https://www.ram.com.my/pressrelease/?prviewid=7068)
- [IFC MSME Finance Gap report (Mar 2025)](https://www.smefinanceforum.org/sites/default/files/Data%20Sites%20downloads/IFC%20Report_MAIN%20Final%203%2025.pdf) · [SME Bank RM4.3bn 2025 approvals](https://fintechnews.my/57656/fintech-lending-malaysia/sme-bank-financing/)
- [MyInvois timeline & RM1m exemption — ClearTax](https://www.cleartax.com/my/en/different-phases-implementation-timelines-einvoicing-malaysia)
- [BNM Open Finance exposure draft — Fintech News MY](https://fintechnews.my/54091/regtech-fintech-regulation-malaysia/malaysia-open-finance/) · [Rahmat Lim & Partners](https://www.rahmatlim.com/publication/articles/31748/bank-negara-issues-exposure-draft-on-open-finance)
- [CTOS — credit scoring takes centre stage](https://ctoscredit.com.my/news-media/credit-scoring-takes-centre-stage/) · [Funding Societies — credit scoring for businesses](https://blog.fundingsocieties.com.my/credit-scoring-for-businesses/)
- [Gig economy / self-employed numbers — HR Asia](https://hr.asia/workforce-management/gig-workers-remain-outside-safety-net-in-malaysia/) · [Budget 2026 gig economy — iMoney](https://www.imoney.my/articles/is-the-gig-economy-in-malaysia-dying-or-evolving-budget-2026)
