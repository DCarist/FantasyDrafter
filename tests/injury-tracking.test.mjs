// Test suite for NFL Injury Reports, Filtering, and Collapsible Modal UI

import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { assert, eq, finishSuite, printSuiteHeader, resetFailures } from './test-helper.mjs';

const require = createRequire(import.meta.url);
const L = require('../draft-logic.js');

resetFailures();
printSuiteHeader('NFL Injury Reports & UI Integration');

// --- 2. Dataset Schema & Injury Metadata ---
const playersJsonPath = existsSync('data/players-data.json')
  ? 'data/players-data.json'
  : 'players-data.json';
assert(existsSync(playersJsonPath), 'players-data.json exists');
const rawData = JSON.parse(readFileSync(playersJsonPath, 'utf-8'));
assert(rawData.injuriesUpdated != null, 'Dataset defines injuriesUpdated timestamp');

const injuredPlayers = rawData.players.filter((p) => p.injury != null);
assert(injuredPlayers.length > 0, 'Dataset contains injured players mapped from ESPN');

const invalidInjuries = injuredPlayers
  .filter(
    (player) =>
      !player.injury.status || !['Q', 'O', 'IR', 'SUSP', 'D', 'P'].includes(player.injury.code),
  )
  .map((player) => player.name);
eq(invalidInjuries, [], 'Every injured player has a status and normalized code');

// Check that healthy players have injury === null or undefined
const healthyPlayers = rawData.players.filter((p) => p.injury == null);
assert(healthyPlayers.length > 0, 'Dataset contains healthy players with null injury');

// Exercise the actual pool renderer rather than repeating its injury predicate here.
const mockPool = [
  { id: 1, name: 'Healthy Player', pos: 'QB', injury: null, score: 50 },
  {
    id: 2,
    name: 'Questionable Player',
    pos: 'RB',
    injury: { code: 'Q', status: 'Questionable' },
    score: 49,
  },
  { id: 3, name: 'Out Player', pos: 'WR', injury: { code: 'O', status: 'Out' }, score: 48 },
  {
    id: 4,
    name: 'IR Player',
    pos: 'TE',
    injury: { code: 'IR', status: 'Injured Reserve' },
    score: 47,
  },
  {
    id: 5,
    name: 'Suspended Player',
    pos: 'WR',
    injury: { code: 'SUSP', status: 'Suspension' },
    score: 46,
  },
];
// --- 4. Roster Item Rendering with Injury Tag ---
const qbWithInjury = {
  id: 10,
  name: 'Lamar Jackson',
  pos: 'QB',
  team: 'BAL',
  bye: 14,
  injury: {
    status: 'Questionable',
    code: 'Q',
    type: 'Ankle',
    detail: 'Sprain',
    returnDate: '2026-09-13',
  },
};

const qbWithoutInjury = {
  id: 11,
  name: 'Josh Allen',
  pos: 'QB',
  team: 'BUF',
  bye: 12,
  injury: null,
};

const slotWithInj = L.formatRosterSlotHtml({ player: qbWithInjury, label: 'QB' }, true, 12);
assert(slotWithInj.includes('injtag inj-q'), 'Roster slot includes injtag inj-q class');
assert(
  slotWithInj.includes('Questionable: Ankle (Sprain)'),
  'Roster slot includes injury tooltip title',
);
assert(slotWithInj.includes('>Q<'), 'Roster slot displays Q badge');

const slotWithoutInj = L.formatRosterSlotHtml({ player: qbWithoutInjury, label: 'QB' }, true, 12);
assert(!slotWithoutInj.includes('injtag'), 'Healthy player roster slot does not have injtag');

// The modal and the depth chart must render production code, not a copied
// approximation of the same markup in the test.
const mockAthInjured = {
  name: "Ja'Marr Chase",
  rank: 1,
  playerId: 100,
  injury: { status: 'Questionable', code: 'Q', type: 'Knee' },
};
const mockAthHealthy = { name: 'Joe Burrow', rank: 1, playerId: 101, injury: null };
const elements = new Map();
const element = (id) => {
  if (!elements.has(id)) {
    elements.set(id, {
      innerHTML: '',
      classList: { add() {}, remove() {}, contains: () => false },
      style: {},
    });
  }
  return elements.get(id);
};
const browserWindow = {
  state: {
    settings: { teams: 12, mode: 'snake', slot: 1, scoring: 'ppr', qbFormat: 'sf', blend: 50 },
    log: [],
    keepers: [],
    watchlist: [],
    tradedPicks: {},
  },
  ui: { search: '', posFilter: 'ALL', sort: 'score', hideOutIR: false },
  PLAYERS: mockPool,
  DRAFT_DATA: {
    injuriesUpdated: '2026-09-01',
    depthCharts: { BAL: { qb: [mockAthInjured, mockAthHealthy] } },
  },
};
const context = vm.createContext({
  ...L,
  window: browserWindow,
  globalThis: browserWindow,
  $: element,
  document: { getElementById: element },
  byId: (id) => [qbWithInjury, qbWithoutInjury, ...mockPool].find((p) => p.id === id),
  scored: () => mockPool.slice(),
  takenMap: () => new Map(),
  currentPick: () => 1,
  teamForOverall: () => ({ isMe: false, name: 'Other Team' }),
  getDynastyRank: () => null,
  getRedraftRank: () => null,
  computeFormatScore: () => null,
  console,
});
vm.runInContext(readFileSync('js/draft-ui.js', 'utf8'), context);

browserWindow.renderPool();
assert(
  elements.get('pool').innerHTML.includes('Out Player'),
  'Out players visible with injury filter off',
);
browserWindow.ui.hideOutIR = true;
browserWindow.renderPool();
const filteredHtml = elements.get('pool').innerHTML;
assert(filteredHtml.includes('Healthy Player'), 'Healthy players remain visible');
assert(filteredHtml.includes('Questionable Player'), 'Questionable players remain visible');
assert(filteredHtml.includes('Suspended Player'), 'Suspended players remain visible');
assert(!filteredHtml.includes('Out Player'), 'Out players are hidden');
assert(!filteredHtml.includes('IR Player'), 'IR players are hidden');

browserWindow.showPlayer(qbWithInjury.id);
const injuredHtml = elements.get('playerModalbox').innerHTML;
assert(
  injuredHtml.includes('injury-accordion active inj-theme-q'),
  'Injured modal has active injury card',
);
assert(injuredHtml.includes('Questionable:</b> Ankle (Sprain)'), 'Injured modal shows diagnosis');
assert(injuredHtml.includes('Est. Return: <b>2026-09-13</b>'), 'Injured modal shows return date');
assert(injuredHtml.includes('dc-inj inj-q'), 'Depth chart shows injured athlete badge');
assert(injuredHtml.includes('title="Questionable: Knee"'), 'Depth chart shows injury tooltip');
assert(injuredHtml.includes('Joe Burrow'), 'Healthy depth-chart teammate remains visible');

browserWindow.showPlayer(qbWithoutInjury.id);
const healthyHtml = elements.get('playerModalbox').innerHTML;
assert(
  healthyHtml.includes('No injury reported as of 2026-09-01'),
  'Healthy modal reports no injury',
);

const success = finishSuite('NFL Injury Reports & UI Integration');
if (!success) {
  process.exit(1);
}
