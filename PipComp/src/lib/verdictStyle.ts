// src/lib/verdictStyle.ts
// One place mapping a lender outcome to its visual identity, so a persona reads the same
// colour wherever it appears (onboarding front door, Settings' demo picker). Previously each
// screen kept its own hardcoded accent map and they had already drifted apart.
//
// The fills/borders are the audited token pairs — see tools/contrastAudit/audit.js.
import type { IconName } from '../components/Icon';
import type { DemoOutcome } from '../data/demoPersonas';
import { colors } from '../theme';

export type VerdictStyle = {
  /** Text/icon colour. AA-compliant on both `fill` and `colors.surface`. */
  ink: string;
  /** Pale background for pills, avatars, and the selected card. */
  fill: string;
  /** Border to pair with `fill`. */
  line: string;
  icon: IconName;
};

export const VERDICT_STYLE: Record<DemoOutcome['decision'], VerdictStyle> = {
  approve: { ink: colors.accentInk, fill: colors.accentTint, line: colors.accentSoft, icon: 'check' },
  refer: { ink: colors.amber, fill: colors.amberTint, line: colors.amberSoft, icon: 'clock' },
  decline: { ink: colors.red, fill: colors.redTint, line: colors.redSoft, icon: 'x' },
};
