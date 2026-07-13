/**
 * Pip issuer signer. Produces the issuer signature that attests "Pip issued this
 * passport"  distinct from the holder signature that proves "the holder controls
 * the subject key". The lender console pins ISSUER_PUBLIC_KEY_HEX and requires both.
 *
 * DEMO LIMITATION: the issuer secret is bundled on-device (src/data/issuerKey.ts).
 * Production moves issuer signing to a server / device-attestation service.
 */
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import { ISSUER_PUBLIC_KEY, ISSUER_SECRET_KEY } from '../data/issuerKey';

// Wire synchronous SHA-512 so ed.sign works without async.
ed.hashes.sha512 = sha512;

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Pip's pinned issuer public key (the lender console verifies against this). */
export const ISSUER_PUBLIC_KEY_HEX = ISSUER_PUBLIC_KEY;

/** Sign passport bytes with the bundled issuer secret. */
export function issuerSign(bytes: Uint8Array): Promise<Uint8Array> {
  return Promise.resolve(ed.sign(bytes, hexToBytes(ISSUER_SECRET_KEY)));
}
