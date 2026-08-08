// src/data/belanjawanku.ts
// GENERATED FILE. Do not edit by hand. Run `node tools/belanjawanku/build.js` instead.
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
// edition. The build script verifies all 108 city and household combinations sum to the
// totals the guide itself publishes in Table 12, so a mistyped figure fails the build.

export const GUIDE_EDITION = '2024/2025';
export const GUIDE_SOURCE =
  'Belanjawanku 2024/2025, Social Wellbeing Research Centre, Universiti Malaya and EPF';

export type HouseholdProfileId = 'single-transit' | 'single-vehicle' | 'couple' | 'couple-1-child' | 'couple-2-children' | 'senior-single' | 'senior-couple' | 'single-parent-1-child' | 'single-parent-2-children';

export type GuideCityId = 'klang-valley' | 'alor-setar' | 'georgetown' | 'ipoh' | 'johor-bahru' | 'kota-bharu' | 'kota-kinabalu' | 'kuala-terengganu' | 'kuantan' | 'kuching' | 'malacca-city' | 'seremban';

export type BasketId = 'food' | 'housing' | 'utility' | 'transport' | 'personal' | 'healthcare' | 'childcare' | 'adhoc' | 'social' | 'discretionary' | 'savings';

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

/** Cities the guide covers, ordered most to least expensive by its own total column. */
export const GUIDE_CITIES: GuideCity[] = [
  { id: 'klang-valley', label: 'Klang Valley' },
  { id: 'alor-setar', label: 'Alor Setar' },
  { id: 'georgetown', label: 'Georgetown' },
  { id: 'ipoh', label: 'Ipoh' },
  { id: 'johor-bahru', label: 'Johor Bahru' },
  { id: 'kota-bharu', label: 'Kota Bharu' },
  { id: 'kota-kinabalu', label: 'Kota Kinabalu' },
  { id: 'kuala-terengganu', label: 'Kuala Terengganu' },
  { id: 'kuantan', label: 'Kuantan' },
  { id: 'kuching', label: 'Kuching' },
  { id: 'malacca-city', label: 'Malacca City' },
  { id: 'seremban', label: 'Seremban' },
];

/**
 * basket -> city -> the nine household figures, in HOUSEHOLD_PROFILES order.
 * Amounts are whole ringgit per month.
 */
export const BELANJAWANKU_BASKETS: Record<BasketId, Record<GuideCityId, number[]>> = {
  food: {
    'klang-valley': [660, 660, 1040, 1540, 1830, 660, 1010, 1150, 1450],
    'alor-setar': [560, 560, 900, 1260, 1500, 560, 850, 930, 1160],
    'georgetown': [640, 640, 1010, 1500, 1790, 640, 990, 1130, 1410],
    'ipoh': [620, 620, 960, 1350, 1630, 630, 970, 1030, 1280],
    'johor-bahru': [640, 640, 1020, 1490, 1750, 640, 990, 1120, 1400],
    'kota-bharu': [580, 580, 920, 1300, 1510, 580, 890, 950, 1160],
    'kota-kinabalu': [620, 620, 980, 1360, 1640, 630, 950, 1010, 1280],
    'kuala-terengganu': [600, 600, 960, 1340, 1570, 600, 920, 990, 1220],
    'kuantan': [610, 610, 970, 1350, 1590, 620, 940, 990, 1240],
    'kuching': [620, 620, 960, 1350, 1580, 610, 920, 980, 1220],
    'malacca-city': [620, 620, 980, 1360, 1650, 630, 970, 1010, 1280],
    'seremban': [620, 620, 990, 1410, 1680, 630, 980, 1030, 1310],
  },
  housing: {
    'klang-valley': [400, 400, 1130, 1130, 1130, 700, 700, 1130, 1130],
    'alor-setar': [220, 220, 650, 650, 650, 400, 400, 650, 650],
    'georgetown': [330, 330, 1000, 1000, 1000, 680, 680, 1000, 1000],
    'ipoh': [270, 270, 800, 800, 800, 480, 480, 800, 800],
    'johor-bahru': [280, 280, 850, 850, 850, 580, 580, 850, 850],
    'kota-bharu': [220, 220, 660, 660, 660, 400, 400, 660, 660],
    'kota-kinabalu': [260, 260, 800, 800, 800, 540, 540, 800, 800],
    'kuala-terengganu': [240, 240, 720, 720, 720, 400, 400, 720, 720],
    'kuantan': [240, 240, 710, 710, 710, 410, 410, 720, 710],
    'kuching': [260, 260, 750, 750, 750, 460, 460, 750, 750],
    'malacca-city': [270, 270, 800, 800, 800, 470, 470, 800, 800],
    'seremban': [300, 300, 950, 950, 950, 540, 540, 950, 950],
  },
  utility: {
    'klang-valley': [100, 100, 320, 330, 340, 160, 310, 290, 300],
    'alor-setar': [100, 100, 310, 320, 330, 160, 300, 270, 280],
    'georgetown': [100, 100, 310, 320, 330, 160, 300, 270, 280],
    'ipoh': [100, 100, 310, 320, 330, 160, 300, 270, 280],
    'johor-bahru': [100, 100, 310, 320, 330, 160, 300, 270, 280],
    'kota-bharu': [100, 100, 310, 320, 330, 160, 300, 270, 280],
    'kota-kinabalu': [100, 100, 290, 300, 310, 150, 290, 260, 270],
    'kuala-terengganu': [100, 100, 310, 320, 330, 160, 300, 270, 280],
    'kuantan': [100, 100, 310, 320, 330, 160, 300, 270, 280],
    'kuching': [100, 100, 290, 300, 310, 140, 280, 260, 270],
    'malacca-city': [100, 100, 310, 320, 330, 160, 300, 270, 280],
    'seremban': [100, 100, 310, 320, 330, 160, 300, 270, 280],
  },
  transport: {
    'klang-valley': [140, 840, 1070, 1080, 1090, 500, 500, 850, 860],
    'alor-setar': [130, 650, 870, 880, 890, 500, 500, 660, 670],
    'georgetown': [140, 730, 940, 950, 960, 500, 500, 740, 750],
    'ipoh': [130, 660, 870, 880, 890, 500, 500, 670, 680],
    'johor-bahru': [130, 650, 870, 880, 890, 500, 500, 660, 670],
    'kota-bharu': [120, 680, 900, 910, 920, 500, 500, 690, 700],
    'kota-kinabalu': [120, 630, 850, 860, 870, 500, 500, 640, 650],
    'kuala-terengganu': [160, 680, 890, 900, 910, 500, 500, 680, 700],
    'kuantan': [160, 660, 870, 880, 890, 500, 500, 670, 680],
    'kuching': [120, 620, 840, 850, 860, 500, 500, 630, 640],
    'malacca-city': [130, 670, 880, 890, 900, 500, 500, 680, 690],
    'seremban': [140, 670, 880, 890, 900, 500, 500, 680, 690],
  },
  personal: {
    'klang-valley': [90, 90, 120, 140, 160, 80, 110, 110, 130],
    'alor-setar': [90, 90, 120, 140, 160, 80, 110, 110, 130],
    'georgetown': [90, 90, 120, 140, 160, 80, 110, 110, 130],
    'ipoh': [90, 90, 120, 140, 160, 80, 110, 110, 130],
    'johor-bahru': [90, 90, 120, 140, 160, 80, 110, 110, 130],
    'kota-bharu': [90, 90, 120, 140, 160, 80, 110, 110, 130],
    'kota-kinabalu': [90, 90, 120, 140, 160, 80, 110, 110, 130],
    'kuala-terengganu': [90, 90, 120, 140, 160, 80, 110, 110, 130],
    'kuantan': [90, 90, 120, 140, 160, 80, 110, 110, 130],
    'kuching': [90, 90, 120, 140, 160, 80, 110, 110, 130],
    'malacca-city': [90, 90, 120, 140, 160, 80, 110, 110, 130],
    'seremban': [90, 90, 120, 140, 160, 80, 110, 110, 130],
  },
  healthcare: {
    'klang-valley': [30, 30, 70, 100, 120, 70, 140, 60, 80],
    'alor-setar': [30, 30, 50, 80, 90, 60, 100, 50, 60],
    'georgetown': [30, 30, 60, 90, 110, 70, 130, 60, 80],
    'ipoh': [30, 30, 70, 90, 110, 70, 130, 60, 80],
    'johor-bahru': [30, 30, 70, 110, 120, 80, 140, 60, 90],
    'kota-bharu': [30, 30, 60, 80, 100, 80, 140, 60, 80],
    'kota-kinabalu': [30, 30, 60, 80, 100, 80, 140, 60, 80],
    'kuala-terengganu': [30, 30, 60, 80, 100, 60, 120, 50, 70],
    'kuantan': [20, 20, 50, 70, 80, 80, 130, 40, 60],
    'kuching': [30, 30, 60, 80, 100, 70, 120, 60, 80],
    'malacca-city': [30, 30, 60, 90, 100, 70, 110, 50, 70],
    'seremban': [30, 30, 60, 90, 110, 70, 110, 60, 80],
  },
  childcare: {
    'klang-valley': [0, 0, 0, 670, 1210, 0, 0, 670, 1210],
    'alor-setar': [0, 0, 0, 580, 930, 0, 0, 580, 930],
    'georgetown': [0, 0, 0, 670, 1020, 0, 0, 670, 1020],
    'ipoh': [0, 0, 0, 620, 980, 0, 0, 620, 980],
    'johor-bahru': [0, 0, 0, 670, 1020, 0, 0, 670, 1020],
    'kota-bharu': [0, 0, 0, 620, 980, 0, 0, 620, 980],
    'kota-kinabalu': [0, 0, 0, 630, 990, 0, 0, 630, 990],
    'kuala-terengganu': [0, 0, 0, 580, 930, 0, 0, 580, 930],
    'kuantan': [0, 0, 0, 620, 980, 0, 0, 620, 980],
    'kuching': [0, 0, 0, 620, 980, 0, 0, 620, 980],
    'malacca-city': [0, 0, 0, 630, 990, 0, 0, 630, 990],
    'seremban': [0, 0, 0, 670, 1020, 0, 0, 670, 1020],
  },
  adhoc: {
    'klang-valley': [90, 220, 370, 450, 560, 190, 250, 260, 290],
    'alor-setar': [80, 170, 320, 400, 490, 150, 210, 230, 250],
    'georgetown': [90, 210, 360, 450, 560, 190, 240, 260, 290],
    'ipoh': [80, 170, 320, 400, 490, 170, 210, 230, 250],
    'johor-bahru': [90, 180, 340, 420, 530, 170, 220, 240, 270],
    'kota-bharu': [80, 170, 320, 400, 490, 150, 210, 230, 250],
    'kota-kinabalu': [90, 180, 340, 420, 530, 170, 230, 240, 270],
    'kuala-terengganu': [80, 170, 320, 400, 490, 150, 210, 230, 240],
    'kuantan': [90, 180, 340, 420, 530, 170, 220, 240, 270],
    'kuching': [90, 180, 340, 420, 530, 170, 220, 240, 270],
    'malacca-city': [80, 170, 320, 400, 490, 170, 210, 230, 250],
    'seremban': [80, 170, 320, 400, 490, 170, 210, 230, 250],
  },
  social: {
    'klang-valley': [180, 180, 250, 290, 300, 180, 200, 230, 240],
    'alor-setar': [130, 130, 180, 220, 230, 130, 150, 170, 180],
    'georgetown': [170, 170, 240, 280, 300, 170, 200, 220, 230],
    'ipoh': [150, 150, 200, 240, 260, 150, 170, 190, 210],
    'johor-bahru': [160, 160, 220, 260, 270, 160, 190, 210, 220],
    'kota-bharu': [130, 130, 180, 220, 230, 130, 150, 170, 180],
    'kota-kinabalu': [150, 150, 200, 240, 250, 150, 170, 190, 200],
    'kuala-terengganu': [150, 150, 200, 240, 260, 150, 170, 200, 210],
    'kuantan': [150, 150, 200, 240, 260, 150, 180, 200, 210],
    'kuching': [150, 150, 200, 240, 260, 140, 180, 200, 210],
    'malacca-city': [150, 150, 200, 240, 260, 150, 180, 200, 210],
    'seremban': [150, 150, 200, 240, 260, 160, 180, 190, 210],
  },
  discretionary: {
    'klang-valley': [130, 130, 300, 390, 400, 150, 170, 220, 230],
    'alor-setar': [110, 110, 240, 300, 310, 120, 140, 170, 180],
    'georgetown': [120, 120, 260, 330, 340, 130, 150, 190, 200],
    'ipoh': [120, 120, 260, 330, 340, 130, 150, 190, 200],
    'johor-bahru': [120, 120, 260, 330, 340, 130, 150, 190, 200],
    'kota-bharu': [110, 110, 240, 300, 310, 120, 140, 170, 180],
    'kota-kinabalu': [120, 120, 260, 330, 340, 130, 150, 190, 200],
    'kuala-terengganu': [110, 110, 240, 300, 310, 120, 140, 170, 180],
    'kuantan': [120, 120, 260, 330, 340, 130, 150, 190, 200],
    'kuching': [120, 120, 260, 330, 340, 130, 150, 190, 200],
    'malacca-city': [120, 120, 260, 330, 340, 130, 150, 190, 200],
    'seremban': [120, 120, 260, 330, 340, 130, 150, 190, 200],
  },
  savings: {
    'klang-valley': [150, 150, 300, 300, 300, 0, 0, 150, 150],
    'alor-setar': [150, 150, 300, 300, 300, 0, 0, 150, 150],
    'georgetown': [150, 150, 300, 300, 300, 0, 0, 150, 150],
    'ipoh': [150, 150, 300, 300, 300, 0, 0, 150, 150],
    'johor-bahru': [150, 150, 300, 300, 300, 0, 0, 150, 150],
    'kota-bharu': [150, 150, 300, 300, 300, 0, 0, 150, 150],
    'kota-kinabalu': [150, 150, 300, 300, 300, 0, 0, 150, 150],
    'kuala-terengganu': [150, 150, 300, 300, 300, 0, 0, 150, 150],
    'kuantan': [150, 150, 300, 300, 300, 0, 0, 150, 150],
    'kuching': [150, 150, 300, 300, 300, 0, 0, 150, 150],
    'malacca-city': [150, 150, 300, 300, 300, 0, 0, 150, 150],
    'seremban': [150, 150, 300, 300, 300, 0, 0, 150, 150],
  },
};

/** The guide's own published monthly total, kept so the transcription stays checkable. */
export const BELANJAWANKU_PUBLISHED_TOTALS: Record<GuideCityId, number[]> = {
  'klang-valley': [1970, 2800, 4970, 6420, 7440, 2690, 3390, 5120, 6070],
  'alor-setar': [1600, 2210, 3940, 5130, 5880, 2160, 2760, 3970, 4640],
  'georgetown': [1860, 2570, 4600, 6030, 6870, 2620, 3300, 4800, 5540],
  'ipoh': [1740, 2360, 4210, 5470, 6290, 2370, 3020, 4320, 5040],
  'johor-bahru': [1790, 2400, 4360, 5770, 6560, 2500, 3180, 4530, 5280],
  'kota-bharu': [1610, 2260, 4010, 5250, 5990, 2200, 2840, 4080, 4750],
  'kota-kinabalu': [1730, 2330, 4200, 5460, 6290, 2430, 3080, 4280, 5020],
  'kuala-terengganu': [1710, 2320, 4120, 5320, 6080, 2220, 2870, 4150, 4830],
  'kuantan': [1730, 2320, 4130, 5380, 6170, 2300, 2940, 4200, 4910],
  'kuching': [1730, 2320, 4120, 5380, 6170, 2300, 2940, 4190, 4900],
  'malacca-city': [1740, 2370, 4230, 5500, 6320, 2360, 3000, 4320, 5050],
  'seremban': [1780, 2400, 4390, 5740, 6540, 2440, 3080, 4530, 5270],
};

/** Column index of a household profile in the basket rows, or -1 when unknown. */
export function profileIndex(profile: HouseholdProfileId): number {
  return HOUSEHOLD_PROFILES.findIndex((p) => p.id === profile);
}
