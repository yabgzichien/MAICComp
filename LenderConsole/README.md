# Pip Credit  Lender Console (web)

The B2B, web-first counterpart to the Pip Credit borrower app. Built with Next.js
(App Router) for the MAIC Nexus 2026 entry. Dense, compliance-grade UI  a loan-officer
console, not a consumer app. Implements the approved Claude Design mockups.

## What's here

- **Verify Passport** tab  paste a borrower passport code → Ed25519 signature check →
  a privacy-locked verified card (aggregate-only, no raw transactions), a 7-factor
  breakdown table with provenance, and a deterministic **Loan Decision Engine** (APPROVE
  verdict + numbered audit trail, auditable under the Consumer Credit Act 2025).
- **Alert mode**  when the ML fraud model flags fabricated data, the whole console shifts
  to red: a data-integrity alert banner, a **Data Forensics** panel (ML probability,
  round-number ratio, Benford deviation), an invalidated score, and a **REFER** verdict
  routing the case to manual review.
- **Capital Markets** tab  the institutional view: an AI-structured micro-sukuk pool
  with a loss-waterfall bar and three rated tranches (Senior A / Mezzanine BB /
  Subordinated Equity), priced deterministically from pool expected loss.

## Try it

- **Verify**  the sample passport loads verified by default. Click **Verify** to re-check.
- **Load flagged** (left panel)  switches the console into the red fraud-alert state.
- **Load sample**  returns to the clean verified applicant.
- **Capital Markets**  toggle the header tab.

## Run

```bash
npm install
npm run dev      # http://localhost:3000
npm run build && npm start   # production
```

Fonts (Hanken Grotesk, Space Grotesk, JetBrains Mono) are loaded via `next/font/google`.
This prototype is presentation-faithful and self-contained (no backend); the real
verification + decision logic lives in the borrower app's `src/lib` (`verifyPassport`,
`decideLoan`, `securitization`).
