// src/lib/verdictStyle.ts
// One place mapping a lender outcome to its visual identity, so a persona reads the same
// colour wherever it appears (onboarding front door, Settings' demo picker). Previously each
// screen kept its own hardcoded accent map and they had already drifted apart.
//
// The fills/borders are the audited token pairs — see tools/contrastAudit/audit.js.
import type { IconName } from '../components/Icon';
import type { DemoOutcome } from '../data/demoPersonas';
import type { ResolvedScheme } from '../state/colorScheme';
import { DARK_COLORS, LIGHT_COLORS } from '../theme';

export type VerdictStyle = {
  /** Text/icon colour. AA-compliant on both `fill` and the surface color for its scheme. */
  ink: string;
  /** Pale (light mode) or dark-tinted (dark mode) background for pills, avatars, and the
   *  selected card. */
  fill: string;
  /** Border to pair with `fill`. */
  line: string;
  icon: IconName;
};

// "Approved" is intentionally always green — a fixed semantic (like refer=amber, decline=red),
// independent of the user's chosen accent preset. accentInk's own luminance is too low to ever
// read as light text on a dark fill (same issue solved for the accent presets), so dark mode
// gets its own bright green `ink` rather than reusing the light value.
const APPROVE_LIGHT: VerdictStyle = { ink: '#1c6b48', fill: '#eff7f4', line: '#dbece5', icon: 'check' };
const APPROVE_DARK: VerdictStyle = { ink: '#5bd295', fill: '#1a2f23', line: '#19422c', icon: 'check' };

export function verdictStyle(scheme: ResolvedScheme): Record<DemoOutcome['decision'], VerdictStyle> {
  const c = scheme === 'dark' ? DARK_COLORS : LIGHT_COLORS;
  return {
    approve: scheme === 'dark' ? APPROVE_DARK : APPROVE_LIGHT,
    refer: { ink: c.amber, fill: c.amberTint, line: c.amberSoft, icon: 'clock' },
    decline: { ink: c.red, fill: c.redTint, line: c.redSoft, icon: 'x' },
  };
}
