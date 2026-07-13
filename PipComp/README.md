# Pip  AI Expenses Tracker

Attach a screenshot of your bank/e-wallet transaction history. Pip (a friendly
coin-sprout mascot) reads each line with a vision LLM, asks which category it
belongs to, and **learns** your choices  so the next time it sees the same
merchant, it pre-fills the category for you.

Built with **Expo (React Native) + TypeScript**, on-device **SQLite**, and the
free **Groq** vision API. The look is ported from the approved Pip design
(clean fintech-green, Hanken Grotesk + Space Grotesk).

---

## The loop

1. **Scan**  attach a transaction screenshot (camera or gallery).
2. **Extract**  Groq reads the image → structured transactions (merchant, amount, in/out, date).
3. **Categorize**  tap a category per expense. Merchants you've taught before come **pre-filled** with a "learned" badge.
4. **Saved**  records update, and Pip remembers any new merchant → category mappings.

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

> The default model is `meta-llama/llama-4-scout-17b-16e-instruct` (vision-capable,
> free tier). The model ID is editable in Settings  paste any Groq vision model.

---

## Run it

This project targets **Expo SDK 54** (matches Expo Go 54). Start with the cache cleared
and force Expo Go mode:

```bash
npm install
node tools/issuerKey/generate.js               # first clone only — see note below
node tools/demoPassport/generate.js
node tools/demoPassport/generateApplicants.js
npx expo start --go -c
```

> **Issuer signing key:** `src/data/issuerKey.ts` is gitignored (rotated 2026-07-12 after
> the previous key was found committed/public) — generate your own local one with the
> command above before running the app, or the passport/loan demo screens won't verify.
> After regenerating, copy the new `ISSUER_PUBLIC_KEY` into
> `LenderConsole/lib/passport.ts`'s `ISSUER_PUBLIC_KEY_HEX`, and copy the regenerated
> `src/data/samplePassport.ts` code into `LenderConsole/app/tokens.ts`'s `SAMPLE_CODE`
> (manual — see that file's own comment).

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
5. Scan another screenshot with a repeat merchant  watch Pip pre-fill the category. 🎉

---

## How the learning works

- On save, each categorized **expense** writes a `merchantKey → category` row into the
  local `merchant_memory` table.
- `merchantKey` normalizes the label (lowercase, trim, collapse spaces, drop card-network
  suffixes after `*`) so casing/spacing variants of the same merchant match.
- Income rows (money received) are auto-tagged **Income**, never prompt, and aren't learned.
- Reset everything Pip has learned in **Settings → Learning → Reset**.

Matching is intentionally **exact (case/space-tolerant)**  e.g. "TEALIVE" and "Tealive"
match, but two different tolls won't. (Fuzzy matching is a documented future enhancement.)

---

## Switching model / provider

Extraction sits behind an `LLMProvider` interface (`src/llm/`). Groq ships as the
default; the **model ID and key are editable in Settings** with a live Test button.
Adding another provider (e.g. Gemini) is just another adapter that satisfies the same
interface, registered in `src/llm/index.ts`.

---

## Project structure

```
App.tsx                      root: fonts + providers + screen state machine
src/
  theme.ts                   design tokens (colors, fonts, radii, shadows)
  data/categories.ts         the 10 default categories (+ Income)
  components/
    Pip.tsx                  the mascot (4 expressions, idle float)  react-native-svg
    Icon.tsx                 monoline icon set
    ui.tsx                   Amount, CatBadge, CategoryChip, PipSays, TopBar, buttons…
  lib/
    normalize.ts             merchantKey()  the learning key
    parseExtraction.ts       defensive parser for the LLM reply
    recommend.ts             deterministic category suggestion
    oklch.ts / catColors.ts  OKLCH→hex for the category tints
    format.ts / dates.ts     formatting helpers
  db/
    db.ts                    open + migrate + seed (expo-sqlite)
    categoriesRepo / txnRepo / memoryRepo
  llm/
    types.ts                 LLMProvider interface + typed errors
    groq.ts                  Groq adapter (vision, JSON, error mapping)
    index.ts                 provider registry
  settings/settingsStore.ts  API key/model in expo-secure-store
  state/store.tsx            AppDataProvider (categories, txns, memory, save+learn)
  screens/
    DashboardScreen          spend hero + breakdown + recents + scan CTA
    AddFlow                  Attach → Extract → Categorize → Saved
    SettingsScreen / CategoriesScreen
__tests__/                   pure-logic + adapter unit tests
docs/superpowers/specs/      the approved design spec
```

---

## Testing & quality

```bash
npm test            # jest  32 unit tests (logic + Groq adapter, fetch mocked)
npm run typecheck   # tsc --noEmit (strict)
npx expo-doctor     # project health (21 checks)
```

The reference fixture in `__tests__/parseExtraction.test.ts` is the exact bank
screenshot that started this project (tolls, transfers, DuitNow QR, incoming money).

---

## Notes & limitations

- **Key safety:** the key is stored in `expo-secure-store` and calls Groq directly from
  the app  fine for personal/learning use. A real product would proxy calls through a
  backend to keep the key off-device.
- **Budget** on the dashboard is a fixed RM 2,000 placeholder (easy to make editable later).
- **Future:** fuzzy merchant grouping (tolls), duplicate-import detection, editing saved
  transactions, cloud sync, a Gemini adapter.
