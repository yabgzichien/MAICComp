// @ts-check
/**
 * tools/contrastAudit/audit.js
 * Repeatable WCAG contrast check (2026-07-15 agent-work review, item 1). The review found
 * ink3-on-white failing at 2.50:1, white-on-primary-green buttons at 4.33:1, and two new
 * sub-AA colors (amber verdict text, the Benford "Looks genuine" chip) that shipped after the
 * original fix. All four were fixed at the TOKEN level (not per call-site); this script is the
 * regression guard the review asked for so the fix can't quietly regress.
 *
 * Design-token based, not a live DOM crawl: no new dependency (no headless browser), and it
 * catches the defect at its source  every text/background token PAIR this codebase actually
 * pairs together, read directly from the real token files below, so it can never drift from
 * what "the token" means. It will NOT catch a wrong pairing invented ad hoc at some call site
 * that isn't listed in KNOWN_PAIRS  see the honest scope note at the bottom of this file.
 *
 * Run:  node tools/contrastAudit/audit.js
 * Exits non-zero (and prints every failure) if any pair drops below its WCAG AA threshold.
 */

'use strict';
const path = require('path');
const fs = require('fs');

// ── WCAG contrast math (relative luminance, standard formula) ──────────────────
function hexToRgb(hex) {
  const c = hex.replace('#', '');
  const full = c.length === 3 ? c.split('').map((ch) => ch + ch).join('') : c;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const f = (x) => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG 2.x contrast ratio, 1..21. */
function contrastRatio(hexA, hexB) {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  const [hi, lo] = lA > lB ? [lA, lB] : [lB, lA];
  return (hi + 0.05) / (lo + 0.05);
}

/** AA thresholds: 4.5:1 for normal text, 3:1 for large text (>=18px, or >=14px bold) or
 *  non-text UI components (borders, icons). `large` covers both large-text and UI-component. */
function passesAA(ratio, large) {
  return ratio >= (large ? 3.0 : 4.5);
}

// ── Read the real token files so this can never drift from the actual palette ──────────────
function extractHexAssignments(source) {
  // Matches `name: '#rrggbb'` / `name: "#rrggbb"` — every token file in this repo uses this
  // literal-object-property shape (see PipComp/src/theme.ts, LenderConsole/app/tokens.ts).
  const out = {};
  const re = /(\w+):\s*['"](#[0-9a-fA-F]{3,6})['"]/g;
  let m;
  while ((m = re.exec(source))) out[m[1]] = m[2];
  return out;
}

function readTokens(relPath) {
  const full = path.join(__dirname, '../../..', relPath);
  const source = fs.readFileSync(full, 'utf8');
  return extractHexAssignments(source);
}

const pipThemeSrc = fs.readFileSync(path.join(__dirname, '../../..', 'PipComp/src/theme.ts'), 'utf8');
const consoleTokensSrc = fs.readFileSync(path.join(__dirname, '../../../LenderConsole/app/tokens.ts'), 'utf8');
// Two palettes (CLEAN, ALERT) share property names in the same file — split by the `const NAME:
// Palette = { ... }` blocks so CLEAN's ink3 isn't shadowed by ALERT's ink3 in a flat regex pass.
function readPaletteBlock(source, constName, typeAnnotation) {
  const m = source.match(new RegExp(`const ${constName}${typeAnnotation}\\s*=\\s*\\{([\\s\\S]*?)\\n\\}[;\\s]`));
  if (!m) throw new Error(`Could not find palette block "${constName}" in source`);
  return extractHexAssignments(m[1]);
}
const consoleClean = readPaletteBlock(consoleTokensSrc, 'CLEAN', ': Palette');
const consoleAlert = readPaletteBlock(consoleTokensSrc, 'ALERT', ': Palette');

// theme.ts's `colors` export still holds the fixed, scheme-independent literals (accent*,
// onAccent, shotHead/shotInk, deltaUp, passportDark) — the structural bg/surface/ink*/line*/
// amber/red* properties moved out into LIGHT_COLORS/DARK_COLORS (dark-mode migration), which
// share property names with each other so need the same block-isolation as CLEAN/ALERT above.
const pipFixed = readPaletteBlock(pipThemeSrc, 'colors', '');
const pipLight = readPaletteBlock(pipThemeSrc, 'LIGHT_COLORS', ': StructuralColors');
const pipDark = readPaletteBlock(pipThemeSrc, 'DARK_COLORS', ': StructuralColors');
const pipTheme = { ...pipLight, ...pipFixed }; // light-mode structural + fixed accent/onAccent

// Same shadowing problem as CLEAN/ALERT above, but N-ways per preset AND per light/dark: the
// Settings accent-color picker's presets (src/state/accentPresets.ts) all share the same
// property names (accent/accentInk/accentSoft/accentTint) inside one array literal, twice each
// (light + dark), so a flat regex pass would let every one of them stomp the last. Pull each
// preset's `light: { ... }` and `dark: { ... }` objects out individually — safe to match on
// `[^}]*` since neither object nests any braces of its own.
function readAccentPresets(relPath) {
  const source = fs.readFileSync(path.join(__dirname, '../../..', relPath), 'utf8');
  const presets = [];
  const re = /id:\s*'(\w+)'[\s\S]*?light:\s*\{([^}]*)\}[\s\S]*?dark:\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(source))) {
    presets.push({ id: m[1], light: extractHexAssignments(m[2]), dark: extractHexAssignments(m[3]) });
  }
  return presets;
}
const accentPresets = readAccentPresets('PipComp/src/state/accentPresets.ts');

// ── Known foreground/background pairings this codebase actually renders ────────────────────
// One entry per real text/UI-color pairing (label, fg, bg, large-text-or-UI-component flag).
// Add a pair here whenever a new fg/bg combination is introduced  that's what makes this a
// regression guard instead of a one-off snapshot.
function pipPairs(t) {
  return [
    ['PipComp ink3 on surface', t.ink3, t.surface, false],
    ['PipComp ink2 on surface', t.ink2, t.surface, false],
    ['PipComp ink on surface', t.ink, t.surface, false],
    ['PipComp amber on surface', t.amber, t.surface, false],
    ['PipComp onAccent on accentInk (buttons)', t.onAccent, t.accentInk, false],
    ['PipComp accentInk on surface', t.accentInk, t.surface, false],
    ['PipComp accentInk on accentSoft (chips)', t.accentInk, t.accentSoft, false],
    // Onboarding verdict pills (2026-07-25): one per demo persona's lender outcome.
    ['PipComp accentInk on accentTint (approve pill)', t.accentInk, t.accentTint, false],
    ['PipComp amber on amberTint (refer pill)', t.amber, t.amberTint, false],
    ['PipComp red on redTint (decline pill)', t.red, t.redTint, false],
    ['PipComp red on surface', t.red, t.surface, false],
  ];
}
// One preset's hex values, checked against the pairs the fixed green/amber tokens above are
// checked against (buttons, chip text, tint-background text) — a bad preset should fail this
// the same way a bad static token would. `light`/`dark` are AccentTheme objects (see
// src/state/accentPresets.ts): `accent`/`accentInk` are identical between the two (self-contained
// fills, used with onAccent/white text — accentInk's own luminance is too low to ever read as
// *text* against anything darker than itself, so it can't also serve as a dark-mode tint-text
// color); only `accentSoft`/`accentTint` differ, and dark-mode call sites use the structural
// `ink` color (not accentInk) as the readable text/icon on top of those dark tints.
function accentPresetPairs(preset) {
  return [
    [`AccentPreset ${preset.id} (light): onAccent on accentInk (buttons)`, '#ffffff', preset.light.accentInk, false],
    [`AccentPreset ${preset.id} (light): accentInk on surface`, preset.light.accentInk, pipLight.surface, false],
    [`AccentPreset ${preset.id} (light): accentInk on accentSoft (chips)`, preset.light.accentInk, preset.light.accentSoft, false],
    [`AccentPreset ${preset.id} (light): accentInk on accentTint (tint bg)`, preset.light.accentInk, preset.light.accentTint, false],
    [`AccentPreset ${preset.id} (dark): onAccent on accentInk (buttons)`, '#ffffff', preset.dark.accentInk, false],
    [`AccentPreset ${preset.id} (dark): ink on accentSoft (chips)`, pipDark.ink, preset.dark.accentSoft, false],
    [`AccentPreset ${preset.id} (dark): ink on accentTint (tint bg)`, pipDark.ink, preset.dark.accentTint, false],
  ];
}

// The non-accent structural pairs (ink ladder + amber/red status colors), checked against
// whichever scheme's own `surface`/tint tokens — same shape for light and dark.
function structuralPairs(label, t) {
  return [
    [`${label} ink3 on surface`, t.ink3, t.surface, false],
    [`${label} ink2 on surface`, t.ink2, t.surface, false],
    [`${label} ink on surface`, t.ink, t.surface, false],
    [`${label} amber on surface`, t.amber, t.surface, false],
    [`${label} amber on amberTint (refer pill)`, t.amber, t.amberTint, false],
    [`${label} red on redTint (decline pill)`, t.red, t.redTint, false],
    [`${label} red on surface`, t.red, t.surface, false],
  ];
}

function consolePairs(label, p) {
  return [
    [`${label} ink3 on surface`, p.ink3, p.surface, false],
    [`${label} ink2 on surface`, p.ink2, p.surface, false],
    [`${label} ink1 on surface`, p.ink1, p.surface, false],
    [`${label} amber on surface`, p.amber, p.surface, false],
    [`${label} white on accentInk (buttons, active tab)`, '#ffffff', p.accentInk, false],
    [`${label} white on red (alert banner)`, '#ffffff', p.red, false],
    [`${label} accentInk on accentSoft (Benford/provenance chip)`, p.accentInk, p.accentSoft, false],
  ];
}

const PAIRS = [
  ...pipPairs(pipTheme),
  ...structuralPairs('PipComp dark', pipDark),
  ...accentPresets.flatMap(accentPresetPairs),
  ...consolePairs('LenderConsole CLEAN', consoleClean),
  ...consolePairs('LenderConsole ALERT', consoleAlert),
];

// ── Run ──────────────────────────────────────────────────────────────────────────────────
let failed = 0;
for (const [label, fg, bg, large] of PAIRS) {
  if (!fg || !bg) {
    console.error(`SKIP (missing token): ${label}`);
    continue;
  }
  const ratio = contrastRatio(fg, bg);
  const ok = passesAA(ratio, large);
  const status = ok ? 'PASS' : 'FAIL';
  const line = `${status}  ${ratio.toFixed(2)}:1  ${label}  (${fg} on ${bg})`;
  if (ok) console.log(line);
  else {
    console.error(line);
    failed++;
  }
}

console.log(`\n${PAIRS.length - failed}/${PAIRS.length} pairs pass WCAG AA.`);
if (failed > 0) {
  console.error(`${failed} pair(s) FAILED. Darken the token, don't patch the call site.`);
  process.exit(1);
}

// ── Honest scope note ───────────────────────────────────────────────────────────────────
// This audits the KNOWN_PAIRS list above, read live from the token files  it does not crawl
// a rendered DOM, so it cannot catch a genuinely new fg/bg combination introduced at some call
// site that isn't listed here (e.g. a one-off inline color). Add the pair here when you add the
// call site; that discipline is what keeps this a real regression guard.
