# Why Pip Credit Does Not Use Blockchain or NFTs

*A locked architecture decision ("blockchain dropped"), recorded so it can be defended. Short version: digital signatures already give us the immutability we need; a chain would add cost, hurt privacy, and miss the real security gap.*

---

## The instinct vs. the actual need

The appeal of blockchain/NFT is "immutability + better security." But the property we actually need is **tamper-evidence of one credential**  nobody can alter a passport undetected. Our **Ed25519 signatures already guarantee that**: change one character and verification fails. That is immutability *of the credential*, achieved with ~64 bytes of math and no network.

Blockchain provides immutability *of a shared, public, append-only ledger*  a solution to a different problem (distributed consensus with no trusted party), which Pip does not have.

## Five reasons it doesn't fit

1. **We already have immutability.** Tamper-evidence comes from the signature, not a chain. A ledger to "make a document unforgeable" is re-solving a solved problem with far heavier machinery.

2. **It doesn't fix our real weakness.** Our genuine gap is **issuer-key custody** (see the crypto audit). If that key leaked, an attacker mints valid passports  and putting them on-chain wouldn't stop it, because the forgery carries a valid signature too. The fix is an HSM/server signer, not a ledger.

3. **It fights our core value  privacy.** Pip keeps raw financial data on-device; only aggregates + a hash leave. A public chain is the opposite: permanent, public, correlatable. Even on-chain *hashes* create permanent linkable fingerprints of someone's finances. For Malaysian personal financial data this collides with **PDPA** rights (erasure, "right to be forgotten") and BNM expectations. Our passports deliberately **expire in 30 days**  blockchain's permanence works *against* that.

4. **NFTs are the wrong semantic.** An NFT models *ownership and transferability* of an asset. A credit score is not tradeable  you specifically must **not** be able to sell your creditworthiness. And the data would either sit on-chain (privacy disaster) or off-chain (then the NFT just points to data you still sign and store  it adds nothing for integrity).

5. **It removes our advantages and adds friction.** Today the lender verifies against a pinned key with **zero network** (offline). A chain reintroduces network dependency, latency, gas fees, and wallet/seed-phrase UX  a non-starter for low-income micro-entrepreneurs, and it kills the near-zero-marginal-cost story. We are **B2B infrastructure with Pip as the single trusted issuer by design**, so blockchain's whole reason for existing (no trusted party) doesn't apply.

## When it *would* make sense (and the better alternative)

A chain earns its place only if we needed **no central issuer**, or a **public revocation registry shared by mutually-distrusting verifiers**. If we ever pursue decentralization, the standards-based path is **W3C Verifiable Credentials + DIDs**, which give portability and self-sovereignty **without putting any data on-chain**. For revocation specifically, a **server-side status list** is cheaper, faster, and more private than a ledger.

## What actually improves security (instead of a chain)

1. Move issuer signing **server-side / HSM**.
2. **Server-side revocation/status list**, plus the existing 30-day expiry.
3. Strengthen the **eKYC → key binding**.
4. Keep **Ed25519 signatures + offline verification**  the correct primitive and a real differentiator.

**One-line pitch answer:** "We chose digital signatures over a blockchain because the credential is already tamper-evident and offline-verifiable, and a public immutable ledger would damage the privacy our product is built on  our security roadmap is server-side issuance and revocation, not a token."
