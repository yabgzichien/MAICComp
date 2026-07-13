# Pip Credit  Cryptographic Security Audit

*Scope: the Credit Passport sign/verify system  `PipComp/src/lib/passport.ts`, `src/crypto/keys.ts`, `src/crypto/issuer.ts`, `src/data/issuerKey.ts`, and the verifiers in `LenderConsole/lib/passport.ts`, `LenderConsole/app/Console.tsx`, `PipComp/src/screens/LenderScreen.tsx`. Reviewed June 2026.*

## Verdict up front (honest)

The cryptographic **design is sound** and the **primitives are used correctly**, with genuinely strong privacy properties. But the system as it ships **is not "impossible to exploit"**  it is a **demo posture** with one critical issue that fully breaks forgery-resistance, plus three high-severity gaps. None require a redesign; the two-signature model is the right one. With the fixes below  chiefly **server-side issuer signing**, **expiry enforcement**, and a **presentation challenge**  forgery becomes infeasible and the system reaches production grade. "Impossible to exploit" is a destination, and this lists the road to it.

### Update  hardening applied in this build

The **client-side findings are now fixed and tested** (both verifiers  `PipComp/src/lib/passport.ts` and `LenderConsole/lib/passport.ts`):
- **H1  Expiry enforced.** `verifyPassport` now rejects passports outside their signed `issuedAt`…`validUntil` window (±5 min clock skew), checked only after signatures prove the dates authentic. The demo sample was re-issued with an extended window so "Load sample" still verifies.
- **M3  Strict schema validation.** A new `validatePassportShape` rejects malformed/typed-wrong fields before the payload reaches the decision engine.
- **L1  Null-prototype canonicalization** (`Object.create(null)`), neutralising `__proto__`/`constructor` keys.
- **L3  Hex charset validation** on every signature/key, not just length.

**Still open (backend-dependent or pending):** **C1** (server/HSM issuer signing)  *the critical one*; **H2** (presentation challenge); **H3** (non-extractable web keys); **M1** (server-computed evidence); **M2** (revocation list); **M4** (web anti-stacking parity). These cannot be closed inside the offline client and remain the production roadmap. **So forgery via the bundled issuer key (C1) is still possible until issuer signing moves server-side**  that, not the items above, is the gating risk.

## What is already done right (keep these)

- **Ed25519 via audited `@noble` libraries**  modern, correct primitive; no home-rolled crypto.
- **Two-signature model is correct and enforced**  holder signature proves integrity, issuer signature proves Pip issued it; a missing/invalid issuer signature is rejected (`passport.ts:241`, `LenderConsole/lib/passport.ts:96`). Self-minted passports fail.
- **Fail-closed verification**  length guards on signature/public key run before verifying; all exceptions are caught and return invalid, never throw past the boundary.
- **Deterministic canonicalization**  sorted-key JSON makes signing reproducible; tamper of any field flips the result to invalid (covered by `__tests__/passport.test.ts`).
- **Key storage on native**  device private key in Secure Enclave / Keystore via `expo-secure-store`.
- **Privacy by construction**  only aggregates + a hash leave the device; raw transactions never do, and the NRIC is masked.

## Findings

| ID | Severity | Issue | Exploit | Fix |
|----|----------|-------|---------|-----|
| **C1** | **Critical** | **Issuer private key bundled on-device** (`src/data/issuerKey.ts`, used by `src/crypto/issuer.ts`). Already flagged in-code as a demo limitation. | Extract `ISSUER_SECRET_KEY` from the app bundle/JS, then sign **any** passport  arbitrary score, income, identity  that fully verifies against the pinned issuer key. Defeats the entire trust model. | Move issuer signing **off-device**: the app sends its canonical passport to an authenticated Pip endpoint that signs with a key held in an **HSM/KMS**; the secret never ships. Until then the system must not be trusted for real lending. |
| **H1** | High | **Expiry is signed but never enforced.** `validUntil` is in the signed payload, but no verifier checks it (`passport.ts` verify, `LenderConsole/lib/passport.ts:77`, `Console.tsx:47`). | A stale/expired passport verifies as valid and produces a loan decision **indefinitely**; combined with the bearer model, a once-valid passport never dies. | In verification, reject when `now > validUntil` or `now < issuedAt` (allow small clock skew); surface "expired" as a distinct, non-"tampered" reason. |
| **H2** | High | **Bearer credential  no proof-of-possession.** The passport string alone is sufficient; the presenter never proves they hold the `subject` private key. | Anyone who obtains the string (screenshot, shared link, intercepted paste) presents it as the borrower  impersonation and replay. | Presentation challenge: lender sends a random nonce; the borrower's device signs it with the subject key; lender verifies against `passport.subject`. Binds the presentation to key possession and defeats replay. |
| **H3** | High | **Web holder key is extractable**  stored in `localStorage` (`src/crypto/keys.ts` web path), acknowledged as demo-grade. | Any XSS or local access reads `pip_credit_privkey`, then impersonates the holder / signs challenges. | Production: non-extractable WebCrypto keys, or restrict passport issuance to the native app (Secure Enclave/Keystore). |
| **M1** | Medium | **`evidenceHash` is not lender-verifiable.** The raw aggregates aren't in the passport, so a lender cannot recompute the hash  it is only a commitment for later dispute. | A modified borrower app could embed arbitrary aggregates and a matching hash; nothing live catches it (only server-side issuance would). | Compute aggregates and the hash **server-side** at issuance; document the hash as audit-time evidence, not live proof. |
| **M2** | Medium | **No revocation.** Trust is bounded only by the ≤30-day expiry. | A passport known to be fraudulent/compromised cannot be invalidated before it expires. | Server-side **status/revocation list** (or short-lived passports + re-issue). |
| **M3** | Medium | **Thin validation of untrusted JSON.** `parsePassportCode` checks only that `passport` + `signature` exist; field types/ranges (`score`, `assessment.*`, `factorSummary` shape) are used unchecked (`Console.tsx:30`). | With server issuer signing the signed bytes constrain values, but absent that, type confusion (string score, `NaN`, missing band) can reach the decision engine. | Validate the parsed passport against a **strict schema** (types + numeric ranges) before verify/decide. |
| **M4** | Medium | **Web console lacks anti-stacking.** The in-app `LenderScreen` records a presentment log; the web `Console.tsx` does not. | The same passport is presented to many lenders with no re-use signal on web. | Port the presentment check, or move it to a shared issuer-side presentment registry. |
| **L1** | Low | **`sortKeys` assigns attacker-controlled keys to a plain object.** A `__proto__` key targets the prototype setter rather than an own property. Both signer and verifier mangle identically, so it is **not** a verification bypass  but it is a latent robustness issue. | None practical today (consistent on both sides). | Build canonical objects with `Object.create(null)` or skip `__proto__`/`constructor`; ideally adopt a vetted JCS (RFC 8785) canonicaliser. |
| **L2** | Low | **No domain separation / versioning** in the signed message. | Theoretical cross-context signature reuse if Pip ever signs similar structures elsewhere. | Prefix a context string (e.g. `pip-passport-v1`) before sign/verify. |
| **L3** | Low | **`hexToBytes` tolerates non-hex** (parses to `NaN`), validating length but not charset. | Low  downstream verify fails closed. | Validate `/^[0-9a-f]+$/i` before decoding. |
| **L4** | Low | **Numeric canonicalization** relies on `JSON.stringify` of JS numbers. | Theoretical cross-engine float formatting differences; negligible for the value ranges used. | For rigor, adopt JCS number formatting. |

## Threat model summary

- **Tampering an existing passport** → caught (holder signature). Strong.
- **Self-minting (pick your own score)** → caught (issuer signature required). Strong  *provided the issuer key is secret*, which today it is not (**C1**).
- **Forging a fully-valid passport** → currently **possible** by extracting the bundled issuer key (**C1**). After server-side signing, **infeasible**.
- **Stealing/replaying a valid passport** → currently **possible** (bearer, no PoP, no expiry check  **H2/H1**). After challenge + expiry, **defeated**.
- **Reading the borrower's raw data** → not possible; only aggregates + masked IC are exposed. Strong.

## Remediation checklist (priority order)

1. **[C1] Server-side / HSM issuer signing.** ⬜ Open  the single change that makes forgery infeasible. Everything else is secondary to this.
2. **[H1] Enforce `validUntil`/`issuedAt`** in every verifier. ✅ Done (app lib + console lib; the in-app lender and web console call the hardened verifier).
3. **[H2] Presentation challenge** (nonce signed by the subject key) to bind possession and stop replay. ⬜ Open (needs lender↔borrower channel).
4. **[H3] Non-extractable web keys** (or native-only issuance) for production. ⬜ Open.
5. **[M2] Revocation/status list** server-side. ⬜ Open.
6. **[M1] Server-computed aggregates + evidence hash.** ⬜ Open.
7. **[M3] Strict schema validation** of pasted passports before verify/decide. ✅ Done (`validatePassportShape`).
8. **[M4] Anti-stacking on web** ⬜ Open (in-app already has it); **[L1] null-proto canonicalisation** ✅ Done; **[L2] domain separation** ⬜ Open (deferred  would re-sign the sample/break compat); **[L3] hex charset check** ✅ Done.

**Done this build: H1, M3, L1, L3** (5 of the verifier-local items, +4 unit tests). **Open: C1, H2, H3, M1, M2, M4, L2**  all require a backend or a breaking signature-format change.

## Bottom line for the competition

Be precise and confident: *"The design is right  Ed25519, a holder signature for integrity and an issuer signature for attestation, verified offline, with raw data never leaving the device. The demo signs the issuer key on-device, which we disclose; production moves issuer signing to an HSM and adds expiry enforcement, a presentation challenge, and a revocation list. At that point forging or replaying a passport is cryptographically infeasible."* Claiming "impossible to exploit" today would be false; claiming a **correct design with a clear hardening path** is true and stronger.
