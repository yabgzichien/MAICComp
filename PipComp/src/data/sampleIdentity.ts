// Tour-only sample identity (Interactive Judge Tour spec, 2026-07-16). Clearly synthetic:
// pairs with the demo persona the tour narrates ("You are Aina") so the judge can run the
// mock eKYC in two taps instead of inventing a name and IC on stage. Only the KYC screen's
// tour-mode prefill button references this; nothing else may treat it as a real person.
// The NRIC is format-valid (real calendar date, Selangor birthplace code) but belongs to
// no one  the verification provider behind it is the existing clearly-labeled mock.
export const SAMPLE_IDENTITY = {
  fullName: 'Aina Binti Rahman',
  nric: '980412-10-5566',
};
