// src/ekyc/types.ts
// eKYC provider seam. The mock provider validates NRIC structure today; a real provider
// (MyDigital ID / CTOS / Innov8tif) implements the same interface later  the UI and the
// passport binding do not change when the real one drops in.

import type { Gender } from '../lib/ekyc';

export interface EkycInput {
  fullName: string;
  nric: string; // raw IC the user typed (never persisted unmasked)
}

export interface EkycResult {
  verified: boolean;
  /** Present when verified. */
  fullName?: string;
  nricMasked?: string;
  dob?: string;
  gender?: Gender;
  stateOfBirth?: string;
  /** Provider label shown in the UI (e.g. 'Demo verification (mock)'). */
  provider: string;
  /** Failure reason when not verified. */
  reason?: string;
}

export interface EkycProvider {
  id: string;
  label: string;
  verify(input: EkycInput): Promise<EkycResult>;
}
