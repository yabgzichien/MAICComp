import { merchantKey } from './normalize';
import type { MemoryMap } from './types';

/**
 * Deterministic category suggestion from the learned memory.
 *
 * Pure functions so they can be unit-tested without a database. The screen
 * layer loads the MemoryMap from memoryRepo and passes it in.
 */

/** Look up a suggestion by an already-normalized key. */
export function suggestByKey(memory: MemoryMap, key: string): string | null {
  return memory[key] ?? null;
}

/** Look up a suggestion for a raw merchant label (normalizes first). */
export function suggestForMerchant(memory: MemoryMap, rawMerchant: string): string | null {
  return suggestByKey(memory, merchantKey(rawMerchant));
}
