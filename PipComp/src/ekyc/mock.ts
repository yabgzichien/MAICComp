// src/ekyc/mock.ts
// Mock eKYC provider — validates NRIC structure and (in lieu of real document/liveness
// checks) returns verified. CLEARLY a demo: it confirms the IC is well-formed and extracts
// real DOB/gender/state, but does not check the IC against any registry. A real provider
// (MyDigital ID / CTOS) implements EkycProvider.verify with document OCR + liveness.

import { maskNric, parseNric, validateNric } from '../lib/ekyc';
import type { EkycProvider, EkycInput, EkycResult } from './types';

export const MockEkycProvider: EkycProvider = {
  id: 'mock',
  label: 'Demo verification (mock)',

  async verify({ fullName, nric }: EkycInput): Promise<EkycResult> {
    const name = fullName.trim();
    if (name.length < 2) {
      return { verified: false, provider: 'Demo verification (mock)', reason: 'Enter your full name.' };
    }
    const check = validateNric(nric);
    if (!check.valid) {
      return { verified: false, provider: 'Demo verification (mock)', reason: check.reason };
    }
    const info = parseNric(nric)!;
    // Simulate a provider round-trip.
    await new Promise((r) => setTimeout(r, 600));
    return {
      verified: true,
      provider: 'Demo verification (mock)',
      fullName: name,
      nricMasked: maskNric(nric),
      dob: info.dob,
      gender: info.gender,
      stateOfBirth: info.stateOfBirth,
    };
  },
};
