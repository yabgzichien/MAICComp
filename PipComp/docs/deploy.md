# Deploying the borrower app (web)

Web export is the fast path for a judge link; an Android APK (via EAS Build) is a separate,
optional step for the semifinal table — see the end of this doc.

## Recommended: Vercel

1. **Import the repo** in the Vercel dashboard, or run `vercel` from this directory with the
   Vercel CLI installed.
2. **Root Directory:** set to `PipComp`.
3. `vercel.json` (already in this folder) sets the build command
   (`npx expo export --platform web`), the output directory (`dist`), and — the one
   non-obvious requirement — the `Cross-Origin-Opener-Policy: same-origin` /
   `Cross-Origin-Embedder-Policy: require-corp` headers every route needs. **Web SQLite
   (wa-sqlite/WASM) will not load without these headers**; `metro.config.js` sets them for
   `expo start --web`'s dev server, but a hosted static build needs the host itself to send
   them, which is what `vercel.json` does here. If you deploy anywhere other than Vercel,
   port the same two headers to that host's config (Netlify: a `_headers` file; Cloudflare
   Pages: a `_headers` file; Nginx: `add_header` in the server block).
4. **Environment variables:** `EXPO_PUBLIC_GROQ_API_KEY` and, if you want document import
   live, `EXPO_PUBLIC_GEMINI_API_KEY` (see `.env.example`). Both are inlined into the client
   bundle at build time (that's how `EXPO_PUBLIC_*` vars work) — not secret in a shipped app,
   same caveat as local dev. The in-app Settings screen's key (stored via `expo-secure-store`
   on native / browser storage on web) takes precedence at runtime if a judge pastes their
   own.
5. Deploy.

## After deploying

- Load the URL, go to Settings → Load demo profile, and confirm the dashboard renders (not a
  blank screen) — this is the SQLite/COOP/COEP check.
- Confirm Credit → Passport → mint works (QR renders, no white-screen) and Loans shows the
  coverage-gated tiers, not "Likely approved" everywhere.
- Point the console's borrower-facing surfaces (or the demo script) at this URL once it's
  stable, and update `src/lib/lenderDirectory.ts` / the console deploy if the two need to
  reference each other's live URLs.

## Android APK (optional, for the semifinal table)

Not attempted in this pass — it needs an Expo/EAS account and app signing credentials that
only the account owner has. Once you have an EAS account: `npx eas build --platform android`
from this directory (after `npx eas login` and `eas build:configure`). Keep the web build as
the primary judge-facing artifact; the APK is a nice-to-have for a physical demo table.

## Known limitation

Web SQLite is alpha upstream (wa-sqlite). If the COOP/COEP headers can't be set on a chosen
host for some reason, fall back to the Android APK or Expo Go for the borrower app and rely
on the console for the web-only judge experience.
