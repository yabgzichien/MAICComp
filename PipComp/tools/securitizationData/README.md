# Securitization demo pool

Seeded generator for the Capital Markets demo pool used by the lender console.

## Regenerate

```
node tools/securitizationData/generate.js
```

This writes `src/data/samplePool.ts`  a typed `SAMPLE_POOL: PoolLoan[]` of ~1,000
micro-loans (~RM6.5M total). The seed (`1337`) is fixed, so regenerating reproduces the
exact same pool. Each loan carries `principal`, `apr`, `tenorMonths`, `score`, `band`, and a
`fraudProb` (the upstream ML fraud signal). The pool models credit-invisible
micro-entrepreneurs: mostly Fair/Good bands with a Building tail, RM2k–20k tickets, and a
low fraud-probability distribution with a small elevated tail.

The pool is consumed by `structurePool` in `src/lib/securitization.ts`; it is not used in
production, only in the demo Capital Markets view.
