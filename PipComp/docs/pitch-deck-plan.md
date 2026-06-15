# Pip Credit — Pitch Deck Plan (12 slides)

*Slide-by-slide plan for the MAIC Nexus T3 submission. Max 12 slides; PDF/PPTX. The brief: **tell the story, show the artifact, frame the market opportunity.** This is the content/structure plan — not the deck file itself. Every stat that goes on a slide is listed with a source in the appendix; verify each before exporting.*

---

## Design principles (apply to every slide)

- **One message per slide.** A judge should grasp the point in 5 seconds; the detail is your spoken narration.
- **Visual-first.** Big number, one diagram, or a real screenshot — not paragraphs. Aim ≤ 25 words of body text per slide.
- **Show, don't claim.** Real artifact screenshots beat adjectives. The artifact is your strongest asset — give it two full slides.
- **Cite on-slide.** Put the source in small grey footnote text under any stat. It signals rigor and survives the rubric.
- **Consistent system.** Forest-green accent, Hanken/Space Grotesk, the coin-sprout mascot as a light motif. Match the app so the deck and artifact feel like one product.

## The narrative spine (the story arc)

A credit-invisible hawker can't borrow → a lender is now *legally required* to assess affordability but has no tool for her → **Pip turns her phone screenshots into a fraud-checked, portable, signed Credit Passport** → the lender verifies it in seconds and lends with confidence → this scales on near-zero marginal cost and advances national financial inclusion.

## How the 12 slides cover the rubric

| Rubric domain | Weight | Carried by slides |
|---|---|---|
| Technical Feasibility | 25% | 5, 6, 7 (+8) |
| Commercial Viability | 25% | 9, 10 (+8) |
| Industry Relevance | 20% | 2, 3 |
| Scalability | 15% | 11 |
| ESG / National Impact | 15% | 11 |
| Story / artifact (the brief) | — | 1, 4, 5, 6, 12 |

---

## Slide 1 — Title & hook

- **Goal:** identity + one-line promise in 5 seconds.
- **One message:** *We make the un-assessable assessable.*
- **On the slide:** Logo + mascot · product name **Pip Credit** · tagline ("Credit infrastructure for the credit-invisible") · a one-sentence descriptor ("Turn phone screenshots into a fraud-checked, portable Credit Passport — so lenders can finance Malaysia's micro-entrepreneurs"). Team name + MAIC Nexus T3 footer.
- **Speaker note:** open with the human, not the tech — name a hawker who can't get RM5,000 of working capital.

## Slide 2 — The problem (the human + the lender, two-sided)

- **Goal:** establish a real, current, painful gap.
- **One message:** *Millions are banked but unscoreable — so lenders can't say yes.*
- **On the slide:** Left = the borrower (gig driver / online seller / hawker: income exists, no payslip, no credit file). Right = the lender (wants to lend, can't assess thin-file risk, fears fraud). Center stat: **RM90bn MSME financing gap.** Supporting: ~90% banked, yet credit-invisible; MSMEs = ~97% of businesses.
- **Cite:** RM90bn gap [IFC/Funding Societies]; ~90% banked [Statista/BNM]; 97% of establishments [DOSM 2024].
- **Serves:** Industry Relevance.
- **Speaker note:** the gap isn't "unbanked" (a crowded, wrong framing) — it's *banked but thin-file*. That precision is your insight.

## Slide 3 — Why now (the regulatory clock)

- **Goal:** create urgency the judges can't dismiss.
- **One message:** *The law just made affordability assessment mandatory — with a June 2026 deadline.*
- **On the slide:** A timeline ribbon — **CCA 2025 in force 1 Mar 2026 → credit-provider licensing effective 1 Jun 2026** → BNPL boom (RM12bn, 7.5M accounts, H2 2025) → **BNM Open Finance first batch 1 Jan 2027.** Headline: "Lenders must now assess affordability — and have no tool for the credit-invisible."
- **Cite:** CCA dates [DFDL/Conventus]; BNPL volume [Conventus Law]; Open Finance [Fintech News MY].
- **Serves:** Industry Relevance (urgency).
- **Speaker note:** this slide is your unfair timing advantage — sell the deadline.

## Slide 4 — The solution (one diagram)

- **Goal:** the whole product in a single picture.
- **One message:** *Capture → Score → Passport → Verify.*
- **On the slide:** A 4-step horizontal flow: (1) **Capture** — screenshot of bank/e-wallet, AI reads it; (2) **Score** — explainable 300–900 score + affordability; (3) **Passport** — a signed, portable, user-owned credit credential; (4) **Verify** — lender confirms in seconds, no raw data exposed. Tagline under it: "No bank API. Trust *scored*, not assumed. The borrower owns the passport."
- **Serves:** Story + bridge to Technical.
- **Speaker note:** emphasize the wedge — screenshot capture means it works *today*, before Open Finance exists.

## Slide 5 — Artifact, part 1: the borrower app

- **Goal:** prove it's built and real (mandate: show the artifact).
- **One message:** *A working app turns a screenshot into a score and a passport.*
- **On the slide:** 3 real screenshots in phone frames — (a) screenshot capture/extraction, (b) the explainable credit gauge + factor breakdown + data-confidence badge, (c) the signed Credit Passport with QR. Caption each in 4–5 words.
- **Serves:** Technical Feasibility / Artifact functionality.
- **Speaker note:** point out the score is *explained* (per-factor reasons) — not a black box.

## Slide 6 — Artifact, part 2: the lender console

- **Goal:** show the B2B side (where the money is) works end-to-end.
- **One message:** *A lender verifies a passport and gets an auditable lend/refer/decline in seconds.*
- **On the slide:** 2–3 console screenshots — paste/scan passport → **verified** (signature + issuer attestation) → affordability decision **(approve / refer / decline)** with the audit-trail reasons and fraud flags. Optional: the capital-markets / tranche view as a depth flourish.
- **Serves:** Technical Feasibility + Commercial (the buyer's product).
- **Speaker note:** stress the cryptographic verify — self-minted/forged passports are rejected.

## Slide 7 — The AI is real and load-bearing

- **Goal:** win the 25% "is the AI real, not a wrapper?" question outright.
- **One message:** *AI does the hard perception and fraud work; the lending decision stays deterministic and explainable.*
- **On the slide:** Two "real AI" pillars + one principle. Pillar 1: **Vision OCR** (screenshots → structured transactions). Pillar 2: **ML fraud / data-confidence** trained on real bank data (AUC 0.90) + the **asymmetric-fraud integrity rings** (catches fabricated income hidden among genuine transactions — running-balance reconciliation, robust point-anomaly, source-isolation). Principle: **"AI is a coach, not a calculator"** — the decision engine is auditable math, so it's defensible and regulator-friendly.
- **Cite:** AUC 0.90 on real (Berka) data [internal METRICS]; integrity rings [docs/confidence-hardening.md].
- **Serves:** Technical Feasibility (the heart of the 25%).
- **Speaker note:** this is where you beat the LLM-wrapper crowd — name the fraud vector you defeat and how.

## Slide 8 — Moat & differentiation

- **Goal:** show why this is defensible and not "another alt-credit score."
- **One message:** *A user-owned, signed, fraud-checked passport — fills the gap the bureaus structurally can't.*
- **On the slide:** A small 3-column compare: **Pip** (on-device, user-owned portable passport, works without a credit file, fraud-integrity) vs **Bureaus (CTOS/Experian)** (need an existing file) vs **Raw alt-data scorers** (no portability, no tamper-evidence). Punchline: "We're *complementary* to CTOS/Experian — we make the thin-file applicant they can't score, scoreable." Privacy line: evidence hash never exposes raw transactions.
- **Cite:** CTOS market leadership / RM406m market [CTOS].
- **Serves:** Commercial + Technical + Industry.
- **Speaker note:** "complementary, not competitive" reframes incumbents from threat to channel/acquirer.

## Slide 9 — Market opportunity (frame it)

- **Goal:** answer "how big?" with credible, sourced layering.
- **One message:** *A large, regulator-activated market with a clear bottom-up beachhead.*
- **On the slide:** TAM/SAM/SOM funnel — **TAM:** RM90bn MSME financing gap + RM406m credit-reporting market. **SAM:** licensed lenders serving micro/thin-file (koperasi, AIM, TEKUN, BNPL — 7.5M BNPL accounts) now under CCA. **SOM:** a concrete beachhead, e.g. *N koperasi/lenders × verifications/yr* (state your assumption). Adjacent demand pool: ~3–4M self-employed/gig workers.
- **Cite:** RM90bn [IFC]; RM406m / 28% CAGR [CTOS]; BNPL 7.5M [Conventus]; 3M self-employed [DOSM], 4M gig [4IR Centre/HR Asia].
- **Serves:** Commercial Viability.
- **Speaker note:** keep SOM honest and bottom-up — judges trust a small defensible number over a giant hand-wave.

## Slide 10 — Business model (who pays, how)

- **Goal:** a credible artifact-to-revenue path.
- **One message:** *Lenders pay per verified passport / per query — recurring, usage-based.*
- **On the slide:** Revenue model — **B2B SaaS + per-verification fee** (lenders pay to verify a passport & run affordability); optional tiers (volume, capital-markets analytics). A one-line unit economic ("RM X / verification × queries → gross margin near-100% on-device"). Path: pilot → design-partner lenders → registry/billing backend → scale. Flag traction asks (LOIs in progress).
- **Serves:** Commercial Viability.
- **Speaker note:** name a price. A concrete (even provisional) number reads as a real business; "TBD" reads as a science project.

## Slide 11 — Scale & national impact (Scalability + ESG in one)

- **Goal:** cover both 15% domains efficiently and end on purpose.
- **One message:** *Near-zero marginal cost to scale — and it advances national financial inclusion + responsible lending.*
- **On the slide:** Two halves. **Scale:** on-device compute = ~zero cost per borrower; screenshot capture is bank-agnostic (no per-bank integration) and ports across SEA; data upgrades free onto **BNM Open Finance (2027)**; multi-tenant lender API on the roadmap. **Impact (ESG/national):** financial inclusion of ~3–4M credit-invisible workers (MADANI alignment); **responsible lending** — the fraud-integrity rings + affordability caps actively prevent over-indebtedness, embodying the CCA's consumer-protection intent (governance); **data sovereignty** — user-owned, on-device, privacy-by-design.
- **Cite:** Open Finance 2027 [Fintech News MY]; gig/self-employed counts [DOSM/4IR]; MyInvois sub-RM1m exempt (segment stays credit-invisible) [ClearTax].
- **Serves:** Scalability + ESG / National Impact.
- **Speaker note:** the responsible-lending angle is your most under-sold point — say plainly that Pip *prevents* predatory lending, it doesn't just enable lending.

## Slide 12 — Roadmap, traction & the ask (close)

- **Goal:** land feasibility + a clear close.
- **One message:** *Built, tested, and timed to the market — here's what we need next.*
- **On the slide:** A short proof line (working borrower app + lender console, 324 tests, real-data ML). A 3-point roadmap (real eKYC connector → lender pilots → Open Finance integration). The **ask** (pilot partners / funding / mentorship — whatever the competition stage warrants). One-line team credibility. Closing tagline repeating slide 1: *"Make the un-assessable assessable."* + contact.
- **Serves:** Story close + feasibility signal.
- **Speaker note:** end on the mission line and a single specific ask, not a generic "thank you."

---

## Verified stats & sources (for on-slide footnotes)

Double-check each before export; dates are as of June 2026.

- **RM90bn MSME financing gap** — [IFC MSME Finance Gap (Mar 2025)](https://www.smefinanceforum.org/sites/default/files/Data%20Sites%20downloads/IFC%20Report_MAIN%20Final%203%2025.pdf); popularized by [Funding Societies](https://blog.fundingsocieties.com.my/credit-scoring-for-businesses/).
- **MSMEs = 39.5% of GDP (RM652.4bn, 2024), 48.7% of employment (8.1M workers), ~97% of establishments** — [DOSM MSME Performance 2024](https://www.dosm.gov.my/portal-main/release-content/micro-small--medium-enterprises-msmes-performance-2024).
- **~90% of adults banked (2023)** — [Statista / BNM](https://www.statista.com/topics/11672/banking-industry-in-malaysia/).
- **CCA 2025: in force 1 Mar 2026; credit-provider licensing effective 1 Jun 2026** — [DFDL](https://www.dfdl.com/insights/content-hub/articles/malaysia-a-summary-of-the-consumer-credit-act-2025/) · [Conventus Law](https://conventuslaw.com/report/malaysia-consumer-credit-act-2025/).
- **BNPL: RM12bn / 140.4M transactions (H2 2025), 7.5M active accounts** — [Conventus Law](https://conventuslaw.com/report/malaysia-consumer-credit-act-2025/).
- **Credit-reporting market ~RM406m by 2025, ~28% CAGR; CTOS market leader** — [CTOS](https://ctoscredit.com.my/news-media/credit-scoring-takes-centre-stage/).
- **BNM Open Finance: exposure draft Nov 2025; first batch 1 Jan 2027 (PayNet + 7 banks + EPF)** — [Fintech News MY](https://fintechnews.my/54091/regtech-fintech-regulation-malaysia/malaysia-open-finance/).
- **MyInvois: sub-RM1m turnover permanently exempt (Phase 5 cancelled, Dec 2025)** — [ClearTax](https://www.cleartax.com/my/en/different-phases-implementation-timelines-einvoicing-malaysia).
- **~3M self-employed (Dec 2023); ~4M in gig economy / ≈26% of workforce** — [DOSM informal economy](https://www.dosm.gov.my/) · [HR Asia](https://hr.asia/workforce-management/gig-workers-remain-outside-safety-net-in-malaysia/).
- **Internal artifact facts (state honestly):** real-data fraud ML AUC ~0.90; 324 passing tests; asymmetric-fraud integrity rings — see `docs/confidence-hardening.md` and HANDOFF.md. (These are your figures; keep them current.)

## Two cautions

- **Don't invent a "credit-invisible millions" number** — no reliable Malaysian figure exists. Size the segment with the verified 3M self-employed / 4M gig counts and the "banked but thin-file" framing instead.
- **Label internal metrics as internal.** AUC and test counts are yours, not third-party — present them as "our results," and be ready to show the artifact live if asked.
