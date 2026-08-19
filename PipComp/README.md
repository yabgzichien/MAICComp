# PipComp: Pip Credit borrower app

It started as an AI expense tracker: attach a screenshot of your bank or e-wallet history and
Pip (a friendly coin-sprout mascot) reads each line with a vision LLM, asks which category it
belongs to, and **learns** your choices, so next time it sees the same merchant it pre-fills
the category. That loop is still the foundation. The app has since grown around it into the
full Pip Credit borrower experience: a deterministic credit score, an ML fraud/data-confidence
layer, a signed Credit Passport, and a loans flow that talks to the Lender Console.

Built with **Expo (React Native) + TypeScript**, on-device **SQLite**, and the free **Groq**
vision API. For the product pitch and the system architecture, see the
[root README](../README.md).

---

## Screenshots

<table>
<tr>
<td align="center" width="33%">
<img src="assets/screenshots/dashboard.png" width="220"><br>
<sub><b>Dashboard</b></sub>
</td>
<td align="center" width="33%">
<img src="assets/screenshots/credit-score.png" width="220"><br>
<sub><b>Credit Profile</b></sub>
</td>
<td align="center" width="33%">
<img src="assets/screenshots/passport.png" width="220"><br>
<sub><b>Credit Passport</b></sub>
</td>
</tr>
</table>

---

## The loop

1. **Scan**: attach a transaction screenshot (camera or gallery).
2. **Extract**: Groq reads the image → structured transactions (merchant, amount, in/out, date).
3. **Categorize**: tap a category per expense. Merchants you've taught before come **pre-filled** with a "learned" badge.
4. **Saved**: records update, and Pip remembers any new merchant → category mappings.

Everything stays **on your device** (local SQLite). No account, no cloud.

---

## Prerequisites

- **Node 18+** (developed on Node 22)
- The **Expo Go** app on your phone ([iOS](https://apps.apple.com/app/expo-go/id982107779) / [Android](https://play.google.com/store/apps/details?id=host.exp.exponent)), or an Android emulator / iOS simulator
- A **free Groq API key**

### Get a free Groq API key

1. Go to **https://console.groq.com** and sign in (free).
2. Open **API Keys → Create API Key**.
3. Copy the key (starts with `gsk_…`). You'll paste it into the app's Settings.

> The default model is `qwen/qwen3.6-27b` (vision-capable, free tier). The model ID is
> editable in Settings: paste any Groq vision model.

---

## Run it

This project targets **Expo SDK 54** (matches Expo Go 54). Start with the cache cleared
and force Expo Go mode:

```bash
npm install
node tools/issuerKey/generate.js               # first clone only, see note below
node tools/demoPassport/generate.js
node tools/demoPassport/generateApplicants.js
npx expo start --go -c
```

> **Issuer signing key:** `src/data/issuerKey.ts` is gitignored (rotated 2026-07-12 after
> the previous key was found committed/public). Generate your own local one with the
> command above before running the app, or the passport/loan demo screens won't verify.
> After regenerating, copy the new `ISSUER_PUBLIC_KEY` into
> `LenderConsole/lib/passport.ts`'s `ISSUER_PUBLIC_KEY_HEX`. Then paste the
> `SAMPLE_CODE` line that `tools/demoPassport/generate.js` prints into
> `LenderConsole/app/tokens.ts` (manual, see that file's own comment).
> `generateApplicants.js` writes `LenderConsole/app/demoApplicants.ts` directly.

Then:

- **Phone:** scan the QR code in the terminal with the **Expo Go** app.
- **Android emulator:** press `a` · **iOS simulator (macOS):** press `i`.

> `--go` forces Expo Go (in case a stray `android/` prebuild folder makes the CLI
> default to a dev build); `-c` clears the Metro cache. Plain `npx expo start` also
> works once any `android/` folder is removed.

### First run

1. Open the app → tap the **gear** (top-right) → **Settings**.
2. Paste your Groq API key, then tap **Test connection** (should say "Key works").
3. Go back → tap **Scan a receipt** → pick a transaction screenshot.
4. Categorize each line. Tap **Finish** to save.
5. Scan another screenshot with a repeat merchant and watch Pip pre-fill the category. 🎉

---

## How the learning works

- On save, each categorized **expense** writes a `merchantKey → category` row into the
  local `merchant_memory` table.
- `merchantKey` normalizes the label (lowercase, trim, collapse spaces, drop card-network
  suffixes after `*`) so casing/spacing variants of the same merchant match.
- Income rows (money received) are auto-tagged **Income**, never prompt, and aren't learned.
- Reset everything Pip has learned in **Settings → Learning → Reset**.

Matching is intentionally **exact (case/space-tolerant)**: "TEALIVE" and "Tealive"
match, but two different tolls won't. (Fuzzy matching is a documented future enhancement.)

---

## Switching model / provider

Extraction sits behind an `LLMProvider` interface (`src/llm/`). Groq ships as the
default; the **model ID and key are editable in Settings** with a live Test button.
Adding another provider (e.g. Gemini) is just another adapter that satisfies the same
interface, registered in `src/llm/index.ts`.

---

## Project structure

The original expense-tracking loop lives in a handful of files; everything the app grew
into since (credit scoring, passport, loans, eKYC, the guided tour) sits alongside it under
the same `src/` layout:

```
App.tsx               root: fonts + providers + screen state machine
src/
  theme.ts             design tokens (colors, fonts, radii, shadows)
  screens/              30+ screens, grouped roughly into:
                          tracking   Dashboard, Add flow, Budget, Net worth, Recap,
                                     Balance scan, Import, Calendar…
                          credit     Credit, Passport ceremony, Passport coach,
                                     Attack gallery
                          loans      Loans, Owed, Commitments
                          identity   Onboarding, KYC, Settings
  lib/                  scoring (creditScore.ts), fraud model, data confidence,
                         passport assembly, offers, the guided tour, and other
                         pure business logic
  db/                   expo-sqlite schema + repositories (transactions,
                         categories, merchant memory, budget, loans, KYC…)
  crypto/                issuer.ts + keys.ts: Ed25519 signing (issuer key + holder key)
  data/                  demoPersonas.ts, seed data, the gitignored issuer key
  ekyc/                  identity-verification flow
  llm/                   LLMProvider interface + the Groq adapter
  settings/              settingsStore.ts: API key/model in expo-secure-store
  state/                 AppDataProvider, credit-profile and reminder-sync hooks
  components/            Pip mascot, icon set, credit gauge, and shared UI
  notifications/         local notification scheduling
  prices/                Yahoo Finance adapter (net worth tracking)
  widget/                iOS/Android home-screen streak widget
__tests__/               pure-logic + adapter unit tests
docs/superpowers/specs/  design specs (the 2026-06-03 spec is called out as
                          authoritative in the root HANDOFF.md)
```

---

## Testing & quality

```bash
npm test            # jest: unit tests across scoring, fraud detection, passport
                     # signing, and the original extraction/categorization logic
npm run typecheck    # tsc --noEmit (strict)
npx expo-doctor      # project health checks
```

The reference fixture in `__tests__/parseExtraction.test.ts` is the exact bank
screenshot that started this project (tolls, transfers, DuitNow QR, incoming money).

---

## Notes & limitations

- **Key safety:** the key is stored in `expo-secure-store` and calls Groq directly from
  the app, which is fine for personal/learning use. A real product would proxy calls
  through a backend to keep the key off-device.
- **Budget** on the dashboard is a fixed RM 2,000 placeholder (easy to make editable later).
- **Future:** fuzzy merchant grouping (tolls), duplicate-import detection, editing saved
  transactions, cloud sync, a Gemini adapter.
