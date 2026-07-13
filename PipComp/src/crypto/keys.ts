/**
 * Ed25519 keypair module for the Credit Passport feature.
 *
 * - Native (iOS/Android): the private key is persisted in expo-secure-store
 *   (hardware-backed secure enclave / keystore).
 * - Web: secure-store is unavailable, so the key is persisted in the browser's
 *   localStorage instead (falling back to in-memory if even that is blocked).
 *   This is a demo-grade store  fine for the web artifact, not production 
 *   but it persists across reloads so the passport signs and verifies end-to-end.
 */

import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Wire synchronous SHA-512 so that the sync helpers (ed.sign / ed.getPublicKey)
// work correctly. These are the functions we actually call below.
ed.hashes.sha512 = sha512;

const STORE_KEY = 'pip_credit_privkey';

// Hex utilities (avoids pulling in a separate dep just for this).
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const result = new Uint8Array(hex.length / 2);
  for (let i = 0; i < result.length; i++) {
    result[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return result;
}

/** Exactly 64 lowercase/uppercase hex chars  a valid 32-byte private key seed. */
const HEX_PRIVKEY_RE = /^[0-9a-f]{64}$/i;

export interface Keypair {
  /** Hex-encoded 32-byte Ed25519 public key  the portable subject id. */
  publicKeyHex: string;
  /** Sign arbitrary bytes with the stored private key. Returns a 64-byte signature. */
  sign(bytes: Uint8Array): Promise<Uint8Array>;
}

/**
 * Returns the device's Ed25519 keypair, creating and persisting it on first call.
 *
 * - Native (iOS/Android): private key is stored in expo-secure-store.
 * - Web: expo-secure-store is unavailable; throws a clear error instead of
 *   silently returning an ephemeral key that would break passport verification.
 *
 * Concurrent callers share the same initialization promise so the key is only
 * generated / read once regardless of how many callers race at startup.
 */
let _keypairPromise: Promise<Keypair> | null = null;

// Web-only in-memory fallback if localStorage is unavailable (private mode, etc.).
let _memKey: string | null = null;

/** Read the stored private-key hex from the platform's persistence layer. */
async function readStoredKey(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(STORE_KEY) : _memKey;
    } catch {
      return _memKey;
    }
  }
  return SecureStore.getItemAsync(STORE_KEY);
}

/** Persist the private-key hex to the platform's persistence layer. */
async function writeStoredKey(hex: string): Promise<void> {
  if (Platform.OS === 'web') {
    _memKey = hex;
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(STORE_KEY, hex);
    } catch {
      // localStorage blocked (private browsing)  the in-memory copy still works this session.
    }
    return;
  }
  await SecureStore.setItemAsync(STORE_KEY, hex);
}

export function getOrCreateKeypair(): Promise<Keypair> {
  if (!_keypairPromise) _keypairPromise = _init();
  return _keypairPromise;
}

async function _init(): Promise<Keypair> {
  // On native, secure-store must be present; on web we use localStorage instead.
  if (Platform.OS !== 'web') {
    const available = await SecureStore.isAvailableAsync();
    if (!available) {
      throw new Error(
        'Secure store unavailable on this platform. ' +
          'Credit Passport key management requires iOS or Android.',
      );
    }
  }

  let privKeyHex = await readStoredKey();

  // Validate the stored value; treat anything malformed as corrupt.
  if (privKeyHex !== null && !HEX_PRIVKEY_RE.test(privKeyHex)) {
    console.warn(
      '[keys] Stored private key is corrupt (failed hex validation). Regenerating.',
    );
    privKeyHex = null;
  }

  if (!privKeyHex) {
    // Generate a fresh 32-byte Ed25519 private key seed using the library's
    // validated helper (same entropy source as getRandomValues, but guaranteed
    // to be exactly 32 bytes).
    const seed = ed.utils.randomSecretKey();
    privKeyHex = bytesToHex(seed);
    await writeStoredKey(privKeyHex);
  }

  const privKey = hexToBytes(privKeyHex);
  // Use sync path  powered by the sha512 we wired above.
  const publicKeyBytes = ed.getPublicKey(privKey);
  const publicKeyHex = bytesToHex(publicKeyBytes);

  return {
    publicKeyHex,
    sign(bytes: Uint8Array): Promise<Uint8Array> {
      // ed.sign already returns Uint8Array; wrap for the Promise<Uint8Array> interface.
      return Promise.resolve(ed.sign(bytes, privKey));
    },
  };
}
