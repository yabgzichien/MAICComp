# Deploying the Lender Console

Console first (per the CEO action plan) — the borrower app's Coach fetches the live policy
from `GET /api/lenders`, so a stable console URL should exist before the borrower app is
pointed at it for the demo.

## Recommended: Vercel

The console is a stock Next.js 14 App Router project — Vercel auto-detects it.

1. **Import the repo** in the Vercel dashboard, or run `vercel` from this directory with the
   Vercel CLI installed.
2. **Root Directory:** set to `LenderConsole` (this is a monorepo; the console isn't at the
   repo root).
3. **Environment variables** (Project → Settings → Environment Variables):
   - `GROQ_API_KEY` — required for the AI Assessment Panel's Live-AI narration. Without it the
     panel still renders (falls back to scripted rationale), so this isn't launch-blocking,
     but the demo is stronger with it live.
   - `GROQ_MODEL` — optional, defaults to `meta-llama/llama-4-scout-17b-16e-instruct`.
4. **Attach a persistent store** (Project → Storage → Create Database → pick a KV/Redis
   option, e.g. Upstash for Redis): **do this before the demo, not after.** Without it, the
   Policy tab's thresholds and the direct-apply mailbox (`lib/kvStore.ts`) fall back to a
   local file, which does **not** survive Vercel's serverless filesystem — policy edits would
   silently reset between requests, breaking the "policy edit flows live into the borrower
   coach" flywheel beat the demo video is built around. Attaching a store auto-injects the
   right env vars (`KV_REST_API_URL`/`KV_REST_API_TOKEN` or the `UPSTASH_REDIS_REST_*`
   equivalent — `lib/kvStore.ts` accepts either); no code change needed.
5. Deploy. `vercel.json` is not required — Next.js is auto-detected.

## After deploying

- Confirm `GET /api/lenders` returns the live ladder (CORS-open by design — this is the
  public flywheel surface the borrower app polls).
- Confirm a Policy tab edit persists across a hard refresh (proves the KV store is wired up,
  not silently falling back to the ephemeral file).
- Point `PipComp`'s lender directory (`src/lib/lenderDirectory.ts`) at the deployed
  `/api/lenders` URL before recording the demo video or handing the judge link out.

## Alternative: any persistent (non-serverless) host

Railway, Render, Fly.io, a plain VPS, or `next start` in a long-running container all work
with **zero code changes** — the `lib/kvStore.ts` file-fallback is exactly the old
`.data/*.json` behavior, and a persistent filesystem across requests is all it needs. Skip
the KV store step above in that case.

## Known limitations to carry into the demo script

- The `/api/apply` rate limiter is in-memory (per the comment in `app/api/apply/route.ts`) —
  it resets on every serverless cold start and isn't shared across instances. Fine for a
  single-instance demo; not a real rate limit at scale.
- Applications filed through the console UI live in the browser's own `localStorage`, not the
  server store — only submissions via `POST /api/apply` (the borrower app's direct-apply
  transport) go through `lib/kvStore.ts`. This is by design (see `applicationsFile.ts`'s
  header comment) — don't expect an officer's manually-pasted applications to appear on a
  different device.
