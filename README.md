# Pip Credit

> Turning everyday phone screenshots into a trusted, portable credit identity for Malaysia's
> credit‑invisible micro‑entrepreneurs.

**MAIC Nexus 2026 — Track T3 (Financial Services).** Pip Credit is a two‑sided fintech
product: a friendly mobile app that helps a hawker, gig driver, or online seller build an
**explainable, fraud‑checked credit score** from data they already have — and a
professional web console that lets a licensed lender **verify that score and make an
auditable loan decision** without ever seeing the borrower's raw transactions.

---

## The problem

Around 97% of Malaysian businesses are micro, small, or medium enterprises, yet many of their
owners are *credit‑invisible*: they have a bank account but no payslip and no formal credit
history, so lenders can't assess them and default to "no." Pip Credit makes the
un‑assessable **assessable** — trust is *scored, not assumed*.

## How it works

1. **Capture** — the borrower attaches screenshots of their e‑wallet / bank history. An AI
   vision model reads them into structured transactions (no bank API needed).
2. **Score** — a transparent, deterministic engine turns those into a 300–900 credit score
   across seven plain‑English factors, dampened by a **data‑confidence** signal.
3. **Trust** — a machine‑learning layer flags fabricated or low‑quality data (Benford's Law,
   round‑number ratios, a trained fraud model) so a score can't be gamed.
4. **Carry** — the borrower gets a **Credit Passport**: a cryptographically signed, portable
   credential (Ed25519) they can present to *any* lender. It carries aggregates only —
   **raw transactions never leave the device.**
5. **Lend** — a lender verifies the passport in the web console and runs a deterministic,
   policy‑enforced loan decision with a full audit trail.

---

## What's in this repo

| Folder | What it is | Stack |
| --- | --- | --- |
| [`PipComp/`](PipComp) | **Borrower app** (mobile) — capture, score, passport, loans | Expo / React Native + TypeScript, on‑device SQLite |
| [`LenderConsole/`](LenderConsole) | **Lender console** (web) — verify passports, structure loan pools | Next.js (App Router) + TypeScript |

### Borrower app highlights
- **Dashboard** — net cash flow, spending breakdown, a logging streak, and a compact credit‑score card.
- **Credit Profile** — an animated score gauge, a data‑confidence badge, and a 7‑factor breakdown with reasons.
- **Credit Passport** — a boarding‑pass‑style signed credential with a QR code, bound to a verified identity (eKYC).
- **Pip** — a friendly coin‑sprout mascot and an optional AI "coach" for personalised, plain‑English tips.
- Everything is **on‑device**: local SQLite, no backend, no account.

### Lender console highlights
- **Verify Passport** — paste a passport code → Ed25519 signature check → a privacy‑locked
  verified card (aggregate‑only), a 7‑factor table, and a deterministic **Loan Decision
  Engine** (APPROVE / REFER / DECLINE) with a numbered audit trail.
- **Fraud alert mode** — when the ML model flags fabricated data, the console shifts to a
  red "data‑integrity alert" with a forensics panel and routes the case to manual review.
- **Capital Markets** — an AI‑structured micro‑sukuk pool view with a loss‑waterfall and
  deterministically rated tranches (Senior / Mezzanine / Subordinated).

---

## Getting started

You'll need **Node.js 18+**. Each app is independent.

### Borrower app (`PipComp`)

```bash
cd PipComp
npm install
npx expo start          # scan the QR with Expo Go, or press "w" for web
```

AI features (screenshot reading, the coach) are optional: copy `.env.example` to `.env.local`
and add a free [Groq](https://console.groq.com) key, or enter one in the app's Settings.
Without a key, the rest of the app still works.

### Lender console (`LenderConsole`)

```bash
cd LenderConsole
npm install
npm run dev             # http://localhost:3000
```

Try the **Load flagged** button to see fraud‑alert mode, and the **Capital Markets** tab.

---

## A note on privacy & data

Pip Credit's core principle is that **a borrower's raw financial data stays on their device.**
The Credit Passport shares signed *aggregates* only — never individual transactions. Real
personal data, API keys, and the large training dataset are deliberately **not** included in
this repository (see [`.gitignore`](.gitignore)).

The fraud model was trained offline on a *semi‑real* dataset derived from a public anonymised
bank dataset, then exported as weights the app runs locally. It is an academic prototype, not
a production credit bureau.

## Design principles

- **AI is a coach, not a calculator.** The credit score and loan decision are deterministic
  and explainable; machine learning is scoped to the fraud / data‑confidence layer.
- **Explainable & auditable.** Every score factor and every loan decision comes with reasons —
  designed to align with Malaysia's Consumer Credit Act 2025.

---

*Built for MAIC Nexus 2026. Prototype / demonstration software.*
