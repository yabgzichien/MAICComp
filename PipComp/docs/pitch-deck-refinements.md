# Pip Credit Pitch Deck  Refinement Decisions

*A record of per-slide refinement decisions for the 12-slide MAIC Nexus T3 deck, consolidating critiques from external LLM reviews (DeepSeek, Qwen) and evaluating each against the judging rubric and  most importantly  what the artifact can truthfully claim. The final column marks whether the change was already sent to Claude Design or is new this round.*

## Principles applied to every decision

- **Truthful over impressive.** Only depict capabilities that work on live data: OCR extraction, ML fraud probability + confidence dampening, robust point-anomaly, source-isolation. Running-balance reconciliation is implemented and unit-tested but **inert** (the OCR pipeline doesn't capture the balance column yet) → never shown as a live catch.
- **Rubric-weighted.** Commercial 25 + Industry 20 + Scalability 15 = 60% justifies the business content. The fix for "not enough AI" is to make the AI **concrete and visible**, not to add more AI or cut business.
- **Stay at 12 slides.** Enhance existing slides; no additions.
- **No buzzword-chasing.** We deliberately dropped blockchain; we do not reframe the passport as "Web3."

## Per-slide decisions

| Slide | Suggestion (source) | Decision | Why | Status |
|---|---|---|---|---|
| 1 Cover | Add "AI-driven … CCA 2025 era" subtitle (DeepSeek) | **Adopt, lightened**  add "AI-driven" only | Cover stays clean; CCA already owns Slide 3 | New |
| 2 Problem | Add emotional pain ("cycle of poverty" / "denied despite paying rent") (DeepSeek) | **Adopt the concrete one, reject the cliché** | "Pays rent on time, still declined  none of it on a credit file" is true to the thin-file thesis; "cycle of poverty" is melodramatic | New |
| 3 Why-now | Arrow: CCA affordability mandate → Screenshot→Score (DeepSeek) | **Adopt** | Makes "the law requires X → we are X" explicit  the sharpest argument | New |
| 4 Solution | Make AI node badges prominent (DeepSeek) | **Adopt (reinforce)** | Flowchart already has AI badges; ensure they're visually obvious | New (minor) |
| 5 Borrower UI | Enlarge screenshots + AI-role captions (DeepSeek) | **Adopt** | Biggest visual win | Already sent |
| 6 Lender/Capital-mkts | Explain Micro-Sukuk in 1–2 lines (DeepSeek) | **Adopt**  add the score→PD→pool-loss→tranche bridge. *No Shariah-compliance claim.* | Shows financial depth without confusing judges | New |
| 7 AI depth | OCR before/after; ROC **or** Benford visual (DeepSeek) | **Adopt**  OCR before/after already sent; **add Benford first-digit chart** for the fraud side (more distinctive than a generic ROC, and specific to our method) | Demonstrate, don't claim | OCR sent · Benford new |
| 7 AI depth | 5-Track-theme badge strip (Qwen/earlier) | **Adopt** | Makes breadth explicit | Already sent |
| 8 Moat | Add "Self-Sovereign Identity / Web3 / user-owned" (DeepSeek) | **Half-adopt**  use *user-owned / borrower-controlled / self-sovereign*; **reject "Web3"** | Web3 re-invites the "where's the chain?" question we dropped on purpose | New (SSI) / Rejected (Web3) |
| 8 Moat | Add cost / speed / reach comparison rows (earlier) | **Adopt** | Sharpens differentiation | Already sent |
| 9–10 Market | Frame SOM as a beachhead, not "small" (DeepSeek) | **Adopt**  add a "land early adopters → expand" line | Small honest SOM reads as discipline, not weakness | New (line) |
| 10 Model | Slide-12 close reframe + flywheel + ARR derivation (earlier) | **Adopt** |  | Already sent |
| 11 Scale/ESG | Bold/enlarge "~RM0 marginal cost"; echo MADANI (DeepSeek) | **Adopt**  emphasise RM0 visually (MADANI already present) | Core scalability sell | New (emphasis) |
| 11 Scale | Daily-utility flywheel line (earlier) | **Adopt** |  | Already sent |
| 12 Close | Specific CTA  design-partner program / BNM sandbox (DeepSeek) | **Adopt** |  | Already sent (reframe) |
| all | Expand non-obvious abbreviations inline (earlier) | **Adopt** | Non-specialist judges | Already sent |

## Rejected / cautions (do not implement)

- **"Web3" framing for the passport**  contradicts the deliberate no-blockchain stance; buzzword risk with fintech judges. Keep "user-owned / self-sovereign."
- **Shariah-compliance claims** for the Micro-Sukuk  it's a conventional tranche model branded "Micro-Sukuk"; explain the structure, don't assert Shariah certification.
- **"Cycle of poverty"** and similar melodrama  use concrete, dignified pain ("pays rent on time, still declined").
- **Running-balance reconciliation as a live demo**  it's inert until OCR captures balances; present point-anomaly + source-isolation as the live catches.
- **Over-rotating into tech** at the expense of the (rubric-justified) commercial story  make the AI visible, not dominant.
