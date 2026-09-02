// Test suite for League Type Configuration, Ranking Filtering, and ESPN Depth Charts
import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';
import { eq, assert, printSuiteHeader, finishSuite, resetFailures } from './test-helper.mjs';

const require = createRequire(import.meta.url);
const L = require('../draft-logic.js');

resetFailures();
printSuiteHeader('League Type Filtering & ESPN Depth Charts');

// --- 1. State Normalization & Default Settings ---
await import('../js/draft-state.js');

eq(globalThis.DEFAULTS.leagueType, 'dynasty', 'Default leagueType is dynasty');

const stateDynasty = { settings: {} };
globalThis.normalizeState(stateDynasty);
eq(stateDynasty.settings.leagueType, 'dynasty', 'normalizeState defaults missing leagueType to dynasty');

const stateRedraft = { settings: { leagueType: 'redraft' } };
globalThis.normalizeState(stateRedraft);
eq(stateRedraft.settings.leagueType, 'redraft', 'normalizeState preserves valid redraft leagueType');

const stateInvalid = { settings: { leagueType: 'invalid_type' } };
globalThis.normalizeState(stateInvalid);
eq(stateInvalid.settings.leagueType, 'dynasty', 'normalizeState sanitizes invalid leagueType to dynasty');


// --- 2. Player Ranking Filtering (Redraft vs Dynasty) ---
const mockPlayer = {
  id: 10,
  name: 'Joe Burrow',
  pos: 'QB',
  team: 'CIN',
  bye: 6,
  age: 29.7,
  rookie: false,
  rookieRank: null,
  dynSF: 6.0,
  dyn1QB: 42.0,
  redraft: 43.0,
  adp: 58.0,
  red_1qb_ppr: 44.0,
  red_1qb_half: 49.0,
  red_1qb_std: 43.0,
  red_sf_ppr: 4.0,
  red_sf_half: 4.0,
  red_sf_std: 4.0,
  espn_ppr: 64.0,
  espn_std: 64.0,
  yahoo: 64.0,
  boris_half: 6.0,
  boris_ppr: 6.0,
  boris_std: 6.0
};

const mockRookie = {
  id: 25,
  name: 'Marvin Harrison Jr.',
  pos: 'WR',
  team: 'ARI',
  bye: 11,
  age: 22.0,
  rookie: true,
  rookieRank: 1,
  dynSF: 12.0,
  dyn1QB: 8.0,
  redraft: 20.0,
  adp: 18.0,
  red_1qb_half: 22.0,
  espn_ppr: 25.0,
  yahoo: 24.0,
  boris_half: 21.0
};

// Test Redraft 1QB Half mode stats
const redraftStats = L.formatPlayerStats(mockPlayer, {
  leagueType: 'redraft',
  qbFormat: '1qb',
  scoring: 'half'
}, 75.9);

const redraftLabels = redraftStats.map(s => s[0]);
assert(redraftLabels.includes('Active Mode (1QB HALF)'), 'Redraft includes Active Mode (1QB HALF)');
assert(redraftLabels.includes('Redraft (1QB HALF)'), 'Redraft includes matching Redraft (1QB HALF) rank');
assert(redraftLabels.includes('ADP'), 'Redraft includes ADP');
assert(redraftLabels.includes('Age'), 'Redraft includes Age');
assert(redraftLabels.includes('ESPN'), 'Redraft includes ESPN');
assert(redraftLabels.includes('Yahoo'), 'Redraft includes Yahoo');
assert(redraftLabels.includes('Boris Chen'), 'Redraft includes Boris Chen');

// Assert Dynasty & alternate formats are hidden in Redraft
assert(!redraftLabels.some(l => l.startsWith('Dynasty')), 'Redraft hides Dynasty rank');
assert(!redraftLabels.includes('Dyn SF'), 'Redraft hides Dyn SF');
assert(!redraftLabels.includes('Dyn 1QB'), 'Redraft hides Dyn 1QB');
assert(!redraftLabels.includes('Rookie Draft Rank'), 'Redraft hides Rookie Draft Rank');
assert(!redraftLabels.includes('SF PPR'), 'Redraft hides SF PPR');
assert(!redraftLabels.includes('SF Half'), 'Redraft hides SF Half');
assert(!redraftLabels.includes('1QB PPR'), 'Redraft hides non-matching 1QB PPR');
assert(!redraftLabels.includes('Bye'), 'Bye week is removed from top stats in Redraft');

// Test Dynasty Superflex PPR mode stats
const dynastyStats = L.formatPlayerStats(mockRookie, {
  leagueType: 'dynasty',
  qbFormat: 'sf',
  scoring: 'ppr'
}, 88.5);

const dynastyLabels = dynastyStats.map(s => s[0]);
assert(dynastyLabels.includes('Active Mode (SF PPR)'), 'Dynasty includes Active Mode (SF PPR)');
assert(dynastyLabels.includes('Dynasty SF'), 'Dynasty includes matching Dynasty SF rank');
assert(!dynastyLabels.includes('Dynasty 1QB'), 'Dynasty SF hides non-matching Dynasty 1QB rank');
assert(dynastyLabels.includes('Rookie Draft Rank'), 'Dynasty includes Rookie Draft Rank for rookie');
assert(dynastyLabels.includes('Age'), 'Dynasty includes Age');
assert(dynastyLabels.includes('ADP'), 'Dynasty includes ADP');
assert(dynastyLabels.includes('ESPN'), 'Dynasty includes ESPN reference rank');
assert(dynastyLabels.includes('Yahoo'), 'Dynasty includes Yahoo reference rank');
assert(dynastyLabels.includes('Boris Chen'), 'Dynasty includes Boris Chen reference rank');

// Assert Redraft formats are hidden in Dynasty
assert(!dynastyLabels.some(l => l.startsWith('Redraft')), 'Dynasty hides Redraft formats');
assert(!dynastyLabels.includes('1QB PPR'), 'Dynasty hides 1QB PPR');
assert(!dynastyLabels.includes('SF PPR'), 'Dynasty hides SF PPR');
assert(!dynastyLabels.includes('Bye'), 'Bye week is removed from top stats in Dynasty');


// --- 3. ESPN Depth Charts Dataset Schema & Linking ---
assert(existsSync('players-data.json'), 'players-data.json exists');
const rawJson = readFileSync('players-data.json', 'utf-8');
const data = JSON.parse(rawJson);

assert(data.depthCharts != null, 'players-data.json contains depthCharts dictionary');
const depthCharts = data.depthCharts;

const nfl32Teams = [
  'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE',
  'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC',
  'LAC', 'LAR', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG',
  'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WAS'
];

for (const t of nfl32Teams) {
  assert(depthCharts[t] != null, `depthCharts contains team ${t}`);
  const tc = depthCharts[t];
  assert(Array.isArray(tc.qb), `${t} has qb array`);
  assert(Array.isArray(tc.rb), `${t} has rb array`);
  assert(tc.wr != null, `${t} has wr object`);
  assert(Array.isArray(tc.wr.wr1), `${t} has wr1 array`);
  assert(Array.isArray(tc.wr.wr2), `${t} has wr2 array`);
  assert(Array.isArray(tc.wr.wr3), `${t} has wr3 array`);
  assert(Array.isArray(tc.te), `${t} has te array`);
  assert(Array.isArray(tc.pk), `${t} has pk array`);
}

// Sample team inspection: CIN Bengals
const cin = depthCharts['CIN'];
assert(cin.qb.length >= 2, 'CIN has at least 2 QBs');
eq(cin.qb[0].name, 'Joe Burrow', 'CIN QB1 is Joe Burrow');
eq(cin.qb[0].rank, 1, 'Joe Burrow rank is 1');
assert(cin.qb[0].playerId != null, 'Joe Burrow is linked to a valid playerId');
const burrowPlayer = data.players[cin.qb[0].playerId];
eq(burrowPlayer.name, 'Joe Burrow', 'CIN QB1 playerId correctly resolves to Joe Burrow player record');

// WR1 inspection: Ja'Marr Chase
assert(cin.wr.wr1.length >= 1, 'CIN has WR1');
eq(cin.wr.wr1[0].name, "Ja'Marr Chase", "CIN WR1 is Ja'Marr Chase");
assert(cin.wr.wr1[0].playerId != null, "Ja'Marr Chase has linked playerId");
const chasePlayer = data.players[cin.wr.wr1[0].playerId];
eq(chasePlayer.name, "Ja'Marr Chase", 'CIN WR1 playerId resolves to Ja\'Marr Chase player record');

// Sample team inspection: KC Chiefs
const kc = depthCharts['KC'];
eq(kc.qb[0].name, 'Patrick Mahomes', 'KC QB1 is Patrick Mahomes');
assert(kc.qb[0].playerId != null, 'Patrick Mahomes has linked playerId');

// Sample team inspection: SF 49ers
const sf = depthCharts['SF'];
eq(sf.qb[0].name, 'Brock Purdy', 'SF QB1 is Brock Purdy');


// --- 4. Availability & Active Player Matching ---
const mockTakenMap = new Map();
mockTakenMap.set(cin.qb[0].playerId, 'me'); // Joe Burrow drafted

const burrowAth = cin.qb[0];
const flaccoAth = cin.qb[1];

const isBurrowTaken = mockTakenMap.has(burrowAth.playerId);
const isFlaccoTaken = mockTakenMap.has(flaccoAth.playerId);

eq(isBurrowTaken, true, 'Drafted player Burrow is resolved as taken');
eq(isFlaccoTaken, false, 'Undrafted player Flacco is resolved as available');

const viewingPlayerId = cin.qb[0].playerId;
const isViewingBurrow = (burrowAth.playerId === viewingPlayerId);
const isViewingFlacco = (flaccoAth.playerId === viewingPlayerId);

eq(isViewingBurrow, true, 'Active player viewing match flags Burrow');
eq(isViewingFlacco, false, 'Active player viewing match does not flag Flacco');

const success = finishSuite('League Type Filtering & ESPN Depth Charts');
if (!success) {
  process.exit(1);
}
