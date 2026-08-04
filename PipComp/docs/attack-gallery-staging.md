# The Attack Gallery: how it is built and why

Status: **shipped**. This describes the screen as it exists, and the reasoning behind the parts
that are easy to mistake for decoration. (It began life as an implementation plan; it is kept as a
design note because the *why* is load-bearing and not obvious from the code.)

## The problem it solves

The gallery runs six known fraud techniques through the real Phase-11 integrity rings and reports
what the engine did. The verdicts have always been genuinely computed — but the first version
rendered six finished "Caught" cards on mount, which is visually indistinguishable from six
hardcoded strings, and gave a reader no way to judge whether the result meant anything.

Three things were missing, and each maps to a question a sceptical reader asks:

| Their question | What answers it |
| --- | --- |
| "Is this actually running, or is it a mockup?" | The staged reveal — signals firing one at a time, confidence sweeping, verdicts landing |
| "What was even at stake?" | The setup block — the same deliberately-favourable borrower, stated in the runner's own constants |
| "Would it catch anything, or does it just refuse everyone?" | The control — an honest ledger through the identical probe, which must come back approved |

The third is the important one and the easiest to leave out.

## Structure

**The setup** ([AttackGalleryScreen.tsx](../src/screens/AttackGalleryScreen.tsx)) states the probe
profile — credit score 690 (Good), RM5,000/month claimed, asking for RM5,000 — read directly from
the exported `PROBE` object in [attackGallery.ts](../src/lib/attackGallery.ts), so the copy cannot
drift from what the runner actually does. Affordability clears and coverage is full *on purpose*:
that strips out every other reason to decline, leaving the data-integrity layer as the only thing
that can stop the fraud. Without this stated, the whole exercise looks arbitrary.

**The control** (`runControl()`) puts an honest ledger — real extracted spending, six months of
salary from a registered employer — through `evaluate()`, the same function the attacks go through.
It currently returns **approve at 71% confidence**. This is what makes "6/6 stopped" evidence:
an engine that declined every applicant would also score a perfect six. The card says so in as
many words, and if the control ever stops passing it says *that* instead, because a broken control
invalidates the catches rather than merely looking bad.

**Each attack** is then measured against that baseline: the confidence bar sweeps from the
control's 71% down to the attack's own score, with a tick left at 71% labelled "honest data". A
percentage on its own means nothing; a distance from a known-good reference means everything.
Below it, the money at stake (`RM5,000 refused` / `held back for a human`), then the checks that
fired — each named in plain English via `signalLabel()` with the engine's own detail string
underneath, so the reader learns *which defence spoke* without anything being paraphrased away.

**The payload expander** shows the actual rows the attack smuggled in, derived by
`buildAttackPayload()` under one ordered rule set (unreconciled running balance → hand-typed rows →
no expense side at all). The technique is shown, not only described.

## Timing and staging

`runGallery()` and `runControl()` are called **once, on mount**. Pressing "Run the control, then
the attacks" only *reveals* those already-computed results, on the schedule built by
[attackReveal.ts](../src/lib/attackReveal.ts). Nothing about any outcome depends on the animation —
this is what keeps it reliable on stage. The control leads the plan so the baseline exists before
any attack is measured against it, and the whole run lands in about 5 seconds.

The card state machine (`armedCards`, `applyRevealEvent`) is pure and unit-tested, so sequencing is
verified without timers or a rendered component.

## Rules this screen must keep

- **The UI never assumes 6/6.** The headline counts resolved cards whose engine verdict is
  `caught`; a `flagged` or `missed` verdict simply never increments it. The 6/6 invariant is pinned
  in tests, not in the interface.
- **The control must pass.** [attackGallery.test.ts](../__tests__/attackGallery.test.ts) asserts
  `runControl().passed` and that it scores above every attack. If a change to the rings starts
  rejecting honest data, that test fails before the demo does.
- **Engine strings are labelled, never rewritten.** `signalLabel()` names the check; the detail
  underneath is the engine's own text.
- **No `Math.random()` / `Date.now()`** in anything that decides *what* is shown.

## Reaching it

Two entrances: the Settings → Demo tools row, and the guided tour's passport step, which carries
`actionLabel: 'See the fraud defences work'` / `actionScreen: 'attacks'`. Back returns to whichever
one the visitor came from (`attacksOrigin` in [App.tsx](../App.tsx)) — a judge on the guided path
never opened Settings, so landing there would read as being dumped somewhere strange. A test pins
the tour deep-link to the passport step so it cannot silently fall out of the script.

## Deliberately not built

A "build your own attack" control (a slider that injects a fake salary of RM X and shows confidence
falling live). It is the strongest possible proof the engine is real, and it is also more scope
than everything above combined.
