#!/usr/bin/env node
/**
 * Generates src/data/belanjawanku.ts from tables.json.
 *
 * tables.json is a faithful transcription of the eleven per-basket tables (Tables 1 to 11)
 * in the published Belanjawanku 2024/2025 guide, plus the guide's own summary table
 * (Table 12) kept as `TOTAL` purely so the transcription can be checked: every city and
 * household column must sum across the eleven baskets to the published total. That check
 * runs here and again as a unit test, so a mistyped figure cannot ship.
 *
 * Yearly update procedure (the guide is republished annually):
 *   1. Download the new edition PDF from swrc.um.edu.my.
 *   2. `pdftotext -layout <edition>.pdf out.txt`
 *   3. Re-transcribe Tables 1 to 12 into tables.json in the same shape (each basket maps
 *      city name to the nine household-category figures, in HOUSEHOLD_ORDER below).
 *   4. `node tools/belanjawanku/build.js` and run the test suite.
 *
 * Source: Nik Osman, N. N. A., & Mansor, N. (2024). Belanjawanku 2024/2025 expenditure
 * guide for Malaysians: key findings and technical notes. Social Wellbeing Research Centre,
 * Universiti Malaya. ISBN 978-629-99003-2-0.
 */
const fs = require('fs');
const path = require('path');

const tables = JSON.parse(fs.readFileSync(path.join(__dirname, 'tables.json'), 'utf8'));

/** Column order of every table in the source guide. Do not reorder. */
const HOUSEHOLD_ORDER = [
  { id: 'single-transit', label: 'Single, public transport', adults: 1, children: 0 },
  { id: 'single-vehicle', label: 'Single, own vehicle', adults: 1, children: 0 },
  { id: 'couple', label: 'Couple, no children', adults: 2, children: 0 },
  { id: 'couple-1-child', label: 'Couple, one child', adults: 2, children: 1 },
  { id: 'couple-2-children', label: 'Couple, two children', adults: 2, children: 2 },
  { id: 'senior-single', label: 'Senior, living alone', adults: 1, children: 0 },
  { id: 'senior-couple', label: 'Senior couple', adults: 2, children: 0 },
  { id: 'single-parent-1-child', label: 'Single parent, one child', adults: 1, children: 1 },
  { id: 'single-parent-2-children', label: 'Single parent, two children', adults: 1, children: 2 },
];

/**
 * The twelve cities the guide covers. Klang Valley leads because it is the guide's flagship
 * region and this app's default; the rest are alphabetical so the picker is scannable.
 * `source` is the row label as it appears in the PDF tables.
 */
const CITY_ORDER = [
  { id: 'klang-valley', label: 'Klang Valley', source: 'Klang Valley' },
  { id: 'alor-setar', label: 'Alor Setar', source: 'Alor Setar' },
  { id: 'georgetown', label: 'Georgetown', source: 'Georgetown' },
  { id: 'ipoh', label: 'Ipoh', source: 'Ipoh' },
  { id: 'johor-bahru', label: 'Johor Bahru', source: 'Johor Bahru' },
  { id: 'kota-bharu', label: 'Kota Bharu', source: 'Kota Bharu' },
  { id: 'kota-kinabalu', label: 'Kota Kinabalu', source: 'Kota Kinabalu' },
  { id: 'kuala-terengganu', label: 'Kuala Terengganu', source: 'K. Terengganu' },
  { id: 'kuantan', label: 'Kuantan', source: 'Kuantan' },
  { id: 'kuching', label: 'Kuching', source: 'Kuching' },
  { id: 'malacca-city', label: 'Malacca City', source: 'Malacca City' },
  { id: 'seremban', label: 'Seremban', source: 'Seremban' },
];

/** The eleven spending baskets, in the guide's own table order. */
const BASKET_ORDER = [
  'food',
  'housing',
  'utility',
  'transport',
  'personal',
  'healthcare',
  'childcare',
  'adhoc',
  'social',
  'discretionary',
  'savings',
];

// Transcription check: the eleven baskets must reproduce the guide's published totals.
let checked = 0;
for (const city of CITY_ORDER) {
  for (let i = 0; i < HOUSEHOLD_ORDER.length; i++) {
    const sum = BASKET_ORDER.reduce((s, b) => s + tables[b][city.source][i], 0);
    const published = tables.TOTAL[city.source][i];
    if (sum !== published) {
      throw new Error(
        `Transcription error: ${city.label} / ${HOUSEHOLD_ORDER[i].id} sums to ${sum} but the guide publishes ${published}`
      );
    }
    checked++;
  }
}

/** Single-quoted string literal, matching the codebase's style. */
const lit = (v) => {
  if (/['\\\n]/.test(v)) throw new Error(`Unescapable literal: ${v}`);
  return `'${v}'`;
};
const unionOf = (items, key) => items.map((x) => lit(x[key])).join(' | ');

const basketBlock = BASKET_ORDER.map((basket) => {
  const rows = CITY_ORDER.map(
    (c) => `    ${lit(c.id)}: [${tables[basket][c.source].join(', ')}],`
  ).join('\n');
  return `  ${basket}: {\n${rows}\n  },`;
}).join('\n');

const out = `// src/data/belanjawanku.ts
// GENERATED FILE. Do not edit by hand. Run \`node tools/belanjawanku/build.js\` instead.
//
// Belanjawanku is Malaysia's official reference budget: the minimum monthly expenditure a
// household needs for a decent standard of living, published annually by the Social
// Wellbeing Research Centre at Universiti Malaya together with the EPF. It is used here as
// a neutral, citable benchmark so the app can tell a borrower how their own spending compares
// against a national reference rather than against a number this app invented.
//
// Citation: Nik Osman, N. N. A., & Mansor, N. (2024). Belanjawanku 2024/2025 expenditure
// guide for Malaysians: key findings and technical notes. Social Wellbeing Research Centre,
// Universiti Malaya. ISBN 978-629-99003-2-0.
//
// Every figure below is a monthly ringgit amount transcribed from Tables 1 to 11 of that
// edition. The build script verifies all ${checked} city and household combinations sum to the
// totals the guide itself publishes in Table 12, so a mistyped figure fails the build.

export const GUIDE_EDITION = '2024/2025';
export const GUIDE_SOURCE =
  'Belanjawanku 2024/2025, Social Wellbeing Research Centre, Universiti Malaya and EPF';

export type HouseholdProfileId = ${unionOf(HOUSEHOLD_ORDER, 'id')};

export type GuideCityId = ${unionOf(CITY_ORDER, 'id')};

export type BasketId = ${BASKET_ORDER.map(lit).join(' | ')};

export interface HouseholdProfile {
  id: HouseholdProfileId;
  label: string;
  adults: number;
  children: number;
}

export interface GuideCity {
  id: GuideCityId;
  label: string;
}

/** Household categories in the guide's own column order. Index into the basket rows below. */
export const HOUSEHOLD_PROFILES: HouseholdProfile[] = [
${HOUSEHOLD_ORDER.map(
  (h) => `  { id: ${lit(h.id)}, label: ${lit(h.label)}, adults: ${h.adults}, children: ${h.children} },`
).join('\n')}
];

/** Cities the guide covers, ordered most to least expensive by its own total column. */
export const GUIDE_CITIES: GuideCity[] = [
${CITY_ORDER.map((c) => `  { id: ${lit(c.id)}, label: ${lit(c.label)} },`).join('\n')}
];

/**
 * basket -> city -> the nine household figures, in HOUSEHOLD_PROFILES order.
 * Amounts are whole ringgit per month.
 */
export const BELANJAWANKU_BASKETS: Record<BasketId, Record<GuideCityId, number[]>> = {
${basketBlock}
};

/** The guide's own published monthly total, kept so the transcription stays checkable. */
export const BELANJAWANKU_PUBLISHED_TOTALS: Record<GuideCityId, number[]> = {
${CITY_ORDER.map((c) => `  ${lit(c.id)}: [${tables.TOTAL[c.source].join(', ')}],`).join('\n')}
};

/** Column index of a household profile in the basket rows, or -1 when unknown. */
export function profileIndex(profile: HouseholdProfileId): number {
  return HOUSEHOLD_PROFILES.findIndex((p) => p.id === profile);
}
`;

const target = path.join(__dirname, '..', '..', 'src', 'data', 'belanjawanku.ts');
fs.writeFileSync(target, out);
console.log(`Wrote ${target} (${checked} city/household combinations verified against the guide totals).`);
