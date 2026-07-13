// Template for src/data/issuerKey.ts — the real file is gitignored (rotated 2026-07-12
// after the previous key was found committed/public). After cloning:
//   node tools/issuerKey/generate.js         (writes a fresh keypair to issuerKey.ts)
//   node tools/demoPassport/generate.js       (re-signs the sample passport with it)
//   node tools/demoPassport/generateApplicants.js   (re-signs the console demo applicants)
// Then copy the new ISSUER_PUBLIC_KEY into LenderConsole/lib/passport.ts's
// ISSUER_PUBLIC_KEY_HEX, and copy the regenerated PipComp/src/data/samplePassport.ts's
// code into LenderConsole/app/tokens.ts's SAMPLE_CODE (that copy is manual — see its
// own comment). The values below are placeholders and will not verify against anything.
export const ISSUER_PUBLIC_KEY = '0'.repeat(64);
export const ISSUER_SECRET_KEY = '0'.repeat(64);
