# OCR Extraction Accuracy Eval

Measures the vision pipeline's field-level accuracy on real Malaysian bank and
e-wallet screenshots, through the exact production path the app ships
(`GroqProvider.extract` → `parseExtraction`). Produces `METRICS.md`.

## Three steps

1. **Collect + label** (human). Drop 30–50 screenshots into `dataset/images/`,
   named `<app>__<name>.png` (e.g. `maybank__aug-1.png`, `tng__wallet-2.jpg`) —
   the `<app>` prefix drives the per-app breakdown. For each image, write
   `dataset/labels/<same-stem>.json`:

   `{ "rows": [ { "merchant": "GrabFood MY", "amount": 12.50, "date": "2026-08-02", "direction": "out" } ] }`

   `date` is `"YYYY-MM-DD"` or `null` when the screenshot shows none;
   `direction` is `"in"` (money received) or `"out"`. Label every visible row.
   **Label independently from the model's output** — correcting the model's own
   extraction biases the ground truth toward agreement.

2. **Extract** (spends API calls): `npx tsx tools/ocrEval/run.ts`
   Key from `GROQ_API_KEY` / `EXPO_PUBLIC_GROQ_API_KEY` / `.env.local`.
   Sequential with 3s pacing (`OCR_EVAL_DELAY_MS` to change), one 20s-backoff
   retry on rate limits, skips already-extracted images (`--force` to redo).

3. **Score** (offline, re-runnable): `npx tsx tools/ocrEval/score.ts`
   Writes `METRICS.md`, `dataset/out/results.json`, `dataset/out/failures.json`.

## Ground rules

- `dataset/` is **gitignored** (root `.gitignore` covers it): screenshots are
  real financial data — only code and the aggregate `METRICS.md` are committed.
  Use your own accounts' screenshots; no third-party PII.
- **Do not tune the extraction prompt against this set.** An eval you tuned
  against is not an eval — prompt improvements need a fresh holdout.
- Scoring method: fuzzy row alignment (amount exact to the sen, OR merchant
  key + date within one day), field accuracy over aligned rows, missed and
  hallucinated rows reported separately. Details in `lib.ts`; unit tests in
  `__tests__/ocrEval.test.ts`.
