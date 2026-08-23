// Test suite for Multi-Format League Rankings, Scoring Models, and Prospect Evaluations
import { createRequire } from 'module';
import { eq, assert, printSuiteHeader, finishSuite, resetFailures } from './test-helper.mjs';

const require = createRequire(import.meta.url);
const L = require('../draft-logic.js');

resetFailures();
printSuiteHeader('Multi-Format Rankings & League Scoring Models');

// --- Mock Player Fixtures ---
const joshAllen = {
  name: 'Josh Allen',
  pos: 'QB',
  team: 'BUF',
  rookie: false,
  dynSF: 1.0,
  dyn1QB: 22.0,
  red_1qb_ppr: 27.0,
  red_1qb_half: 26.0,
  red_1qb_std: 22.0,
  red_sf_ppr: 1.0,
  red_sf_half: 1.0,
  red_sf_std: 1.0,
  redraft: 26.0,
  adp: 24.0,
};

const jamarrChase = {
  name: "Ja'Marr Chase",
  pos: 'WR',
  team: 'CIN',
  rookie: false,
  dynSF: 5.0,
  dyn1QB: 1.0,
  red_1qb_ppr: 1.0,
  red_1qb_half: 3.0,
  red_1qb_std: 2.0,
  red_sf_ppr: 6.0,
  red_sf_half: 9.0,
  red_sf_std: 10.0,
  redraft: 1.0,
  adp: 2.0,
};

const brockBowers = {
  name: 'Brock Bowers',
  pos: 'TE',
  team: 'LV',
  rookie: false,
  dynSF: 20.0,
  dyn1QB: 15.0,
  red_1qb_ppr: 18.0,
  red_1qb_half: 22.0,
  red_1qb_std: 25.0,
  red_sf_ppr: 30.0,
  red_sf_half: 32.0,
  red_sf_std: 35.0,
  redraft: 22.0,
  adp: 20.0,
};

const jeremiyahLove = {
  name: 'Jeremiyah Love',
  pos: 'RB',
  team: 'ARI',
  rookie: true,
  rookieRank: 1,
  dynSF: 24.0,
  dyn1QB: 11.0,
  red_1qb_ppr: 41.0,
  red_1qb_half: 41.0,
  red_1qb_std: 44.0,
  red_sf_ppr: 59.0,
  red_sf_half: 61.0,
  red_sf_std: 63.0,
  redraft: 41.0,
};

const fernandoMendoza = {
  name: 'Fernando Mendoza',
  pos: 'QB',
  team: 'LV',
  rookie: true,
  rookieRank: 8,
  dynSF: 53.0,
  dyn1QB: 113.0,
  red_1qb_ppr: 247.0,
  red_1qb_half: 250.0,
  red_1qb_std: 260.0,
  red_sf_ppr: 137.0,
  red_sf_half: 140.0,
  red_sf_std: 145.0,
  redraft: 247.0,
};

// 1. Format Constants & Supported Modes
assert(L.FORMAT_OPTIONS && typeof L.FORMAT_OPTIONS === 'object', 'FORMAT_OPTIONS exists');
assert(L.FORMAT_OPTIONS.scoring.ppr && L.FORMAT_OPTIONS.scoring.half && L.FORMAT_OPTIONS.scoring.std, 'Includes PPR, Half-PPR, STD scoring modes');
assert(L.FORMAT_OPTIONS.qb.sf && L.FORMAT_OPTIONS.qb['1qb'], 'Includes Superflex and 1QB formats');

// 2. getDynastyRank
eq(L.getDynastyRank(joshAllen, 'sf'), 1.0, 'Josh Allen is #1 in Dynasty Superflex');
eq(L.getDynastyRank(joshAllen, '1qb'), 22.0, 'Josh Allen drops to #22 in Dynasty 1QB');
eq(L.getDynastyRank(jamarrChase, '1qb'), 1.0, "Ja'Marr Chase is #1 in Dynasty 1QB");
eq(L.getDynastyRank(jamarrChase, 'sf'), 5.0, "Ja'Marr Chase is #5 in Dynasty Superflex");

// 3. getRedraftRank (Scoring x QB Format)
eq(L.getRedraftRank(joshAllen, 'sf', 'ppr'), 1.0, 'Josh Allen SF PPR redraft rank is 1.0');
eq(L.getRedraftRank(joshAllen, '1qb', 'ppr'), 27.0, 'Josh Allen 1QB PPR redraft rank is 27.0');
eq(L.getRedraftRank(joshAllen, '1qb', 'std'), 22.0, 'Josh Allen 1QB Standard redraft rank is 22.0');
eq(L.getRedraftRank(jamarrChase, '1qb', 'ppr'), 1.0, "Ja'Marr Chase 1QB PPR redraft rank is 1.0");
eq(L.getRedraftRank(jamarrChase, '1qb', 'half'), 3.0, "Ja'Marr Chase 1QB Half-PPR redraft rank is 3.0");
eq(L.getRedraftRank(jamarrChase, '1qb', 'std'), 2.0, "Ja'Marr Chase 1QB Standard redraft rank is 2.0");
eq(L.getRedraftRank(jamarrChase, 'sf', 'ppr'), 6.0, "Ja'Marr Chase SF PPR redraft rank is 6.0");

// 4. computeFormatScore Calculations
const allenSFScore = L.computeFormatScore(joshAllen, { qbFormat: 'sf', scoring: 'half', blend: 0.6 });
const allen1QBScore = L.computeFormatScore(joshAllen, { qbFormat: '1qb', scoring: 'half', blend: 0.6 });
assert(allenSFScore > allen1QBScore + 10, 'Josh Allen draft score is significantly higher in Superflex than 1QB');

const chase1QBScore = L.computeFormatScore(jamarrChase, { qbFormat: '1qb', scoring: 'ppr', blend: 0.6 });
const chaseSFScore = L.computeFormatScore(jamarrChase, { qbFormat: 'sf', scoring: 'ppr', blend: 0.6 });
assert(chase1QBScore > chaseSFScore, "Ja'Marr Chase score is higher in 1QB than Superflex");

// 5. TE Premium Multiplier
const bowersStandard = L.computeFormatScore(brockBowers, { qbFormat: 'sf', scoring: 'half', tePremium: false });
const bowersPremium = L.computeFormatScore(brockBowers, { qbFormat: 'sf', scoring: 'half', tePremium: true });
eq(Math.round(bowersPremium * 100), Math.round(bowersStandard * 1.08 * 100), 'TE Premium applies exact 1.08x boost to TE score');

const chaseStandard = L.computeFormatScore(jamarrChase, { qbFormat: 'sf', scoring: 'half', tePremium: false });
const chasePremium = L.computeFormatScore(jamarrChase, { qbFormat: 'sf', scoring: 'half', tePremium: true });
eq(chaseStandard, chasePremium, 'TE Premium does not alter non-TE (WR) score');

// 6. Prospect / Rookie Evaluations
eq(L.getProspectRank(jeremiyahLove, '1qb'), 1, 'Jeremiyah Love is #1 rookie rank in 1QB');
eq(L.getProspectRank(jeremiyahLove, 'sf'), 24.0, 'Jeremiyah Love resolves to #24 overall in Superflex dynasty');

eq(L.getProspectRank(fernandoMendoza, '1qb'), 8, 'Fernando Mendoza rookie draft rank is #8 in 1QB');
eq(L.getProspectRank(fernandoMendoza, 'sf'), 53.0, 'Fernando Mendoza resolves to #53 in Superflex dynasty (big jump for rookie QB)');

eq(L.getProspectRank(joshAllen, 'sf'), null, 'Non-rookie returns null for prospect rank');

// 7. Edge Cases & Null Boundaries
eq(L.getDynastyRank(null, 'sf'), null, 'Handles null player gracefully in getDynastyRank');
eq(L.getRedraftRank(null, '1qb', 'ppr'), null, 'Handles null player gracefully in getRedraftRank');
eq(L.computeFormatScore(null, {}), null, 'Handles null player gracefully in computeFormatScore');
eq(L.getProspectRank(null, 'sf'), null, 'Handles null player gracefully in getProspectRank');

const success = finishSuite('Multi-Format Rankings & League Scoring Models');
if (!success) {
  process.exit(1);
}

