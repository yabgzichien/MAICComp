# Judge self-scan kit

Five deterministic statement mockups a judge photographs or screenshots and scans through the
running app, so they personally execute the coverage-unlock beat instead of only watching the
pre-loaded seed (spec `Fable5Evaluation/2026-07-12-demo-data-spec.md` sections D/E). Rebuild any
time with:

```
npx tsx tools/demoKit/build.ts
```

This writes five HTML files to `tools/demoKit/templates/`. Rebuilding is deterministic (a
committed PRNG seed) and always uses "now" as the build date, so the rows stay inside the
current month  regenerate close to the actual judging date, not months ahead.

## The five kits

| # | File | What it mimics | Genuine? |
|---|---|---|---|
| 1 | `kit-1-tng-ewallet.html` | Touch 'n Go eWallet | Yes |
| 2 | `kit-2-mae-bank.html` | Maybank2u / MAE statement | Yes  shares "Kedai Kopi Ah Seng" with Kit 1 |
| 3 | `kit-3-grabfood-payout.html` | Grab driver weekly payouts | Yes  income only |
| 4 | `kit-4-mixed-month.html` | A generic e-wallet, wider category spread | Yes |
| 5 | `kit-5-fabricated.html` | A bank transfer history | No  all-round RM500/1,000/2,000 |

Kits 1-4 pass the app's own authenticity checks (Benford-plausible amounts with cents, round
ratio ≤5%, no duplicate amounts). Kit 5 is the honest "we tried to fake it" counter-example:
every row is a round income figure, designed to visibly drop data confidence and surface the
round-number/plausibility reason chips  without tripping the hard integrity-floor decline (that
drama belongs to the console's flagged path and the Attack Gallery, not this kit).

## Capture steps (human-gated  H7 in the human-task guide)

No headless-browser dependency was added for this (would be a heavy addition for five one-off
screenshots); capture by hand:

1. Rebuild the kit close to the judging date: `npx tsx tools/demoKit/build.ts`.
2. Open each `tools/demoKit/templates/kit-*.html` file in a browser.
3. Resize the viewport to **390×844** (an iPhone-sized viewport  devtools' device toolbar, or
   any screenshot tool that can crop to that aspect ratio).
4. Screenshot just the phone mockup (the white rounded-corner card, not the grey page
   background) and save as PNG into `tools/demoKit/out/` with the same base name, e.g.
   `kit-1-tng-ewallet.png`.
5. Repeat for all five. Commit `templates/`, `out/`, this README, `build.ts`, and
   `build.test.ts` together.

## Live smoke test (human-gated  spec F5)

Needs a live Groq key (`EXPO_PUBLIC_GROQ_API_KEY` configured), so it can't run in CI or from this
tool alone:

1. In the running app, scan `kit-1` then `kit-2`. Expect: ≥90% of rows extracted; the repeated
   merchant "Kedai Kopi Ah Seng" fires the learning beat on its second appearance (pre-filled,
   not a guess); the coverage chip visibly moves.
2. Scan `kit-5` (fabricated). Expect: data confidence drops by ≥8 points with round-number/
   plausibility reason chips, and **no** integrity-floor breach. If it does breach, the kit's
   amounts need retuning (dial down `buildFabricatedKit`'s row count or vary a couple of the
   amounts)  a full floor-breach decline is the console's flagged-path demo, not this kit's.

## Judge instruction card (five lines, spec E)

Pair this with the physical/digital kit handed to a judge:

> **Try it yourself.** Attach a screenshot of one of these five sample statements in the app's
> "Add a receipt" flow. Watch Pip read it, learn a merchant it's seen before, and move your
> coverage chip. Try the fifth one (the bank transfer) to see the same checks catch fabricated
> data live. Prefer typing? You can enter one transaction manually instead  the app tells you
> which entries are typed versus scanned.
