// Test suite for Keepers & Pre-Drafted Players feature
import { createRequire } from 'module';
import { eq, assert, printSuiteHeader, finishSuite, resetFailures } from './test-helper.mjs';

const require = createRequire(import.meta.url);
const L = require('../draft-logic.js');

resetFailures();
printSuiteHeader('Keepers & Pre-Drafted Players');

// --- 1. Keeper Validation: Max Keepers ---
const existingKeepers = [
  { id: 'k1', slot: 1, round: 1, playerId: 10 },
  { id: 'k2', slot: 1, round: 3, playerId: 25 },
  { id: 'k3', slot: 2, round: 2, playerId: 50 }
];

const resExceed = L.validateKeeperAssignment(
  { id: 'k4', slot: 1, round: 5, playerId: 70 },
  existingKeepers,
  2, // maxKeepers = 2
  12, 20, 'snake', {}
);
assert(!resExceed.valid, 'Disallows exceeding maxKeepers per team');
assert(resExceed.error.includes('maximum of 2 keepers'), 'Returns informative error message when max keepers exceeded');

const resWithinLimit = L.validateKeeperAssignment(
  { id: 'k4', slot: 2, round: 4, playerId: 70 },
  existingKeepers,
  2, // maxKeepers = 2 (Slot 2 currently has 1)
  12, 20, 'snake', {}
);
assert(resWithinLimit.valid, 'Allows adding keeper when within maxKeepers limit');

// --- 2. Keeper Validation: Duplicate Player ---
const resDup = L.validateKeeperAssignment(
  { id: 'k5', slot: 3, round: 1, playerId: 10 },
  existingKeepers,
  3,
  12, 20, 'snake', {}
);
assert(!resDup.valid, 'Disallows assigning a player already kept by another team');
assert(resDup.error.includes('already kept by Team 1'), 'Identifies existing keeper owner in duplicate error message');

// --- 3. Keeper Validation: Round Pick Ownership & Traded Picks ---
// In 12-team snake:
// Slot 1 natural picks: Rd 1 = Pick 1, Rd 2 = Pick 24, Rd 3 = Pick 25.
// Traded picks: Slot 1 traded away their Round 3 pick (Pick 25) to Slot 4.
const tradedPicks = { 25: 4 };

const resNoPick = L.validateKeeperAssignment(
  { id: 'k6', slot: 1, round: 3, playerId: 80 },
  [], // empty existing
  3,
  12, 20, 'snake', tradedPicks
);
assert(!resNoPick.valid, 'Disallows assigning keeper in round where team owns 0 picks due to trade');
assert(resNoPick.error.includes('0 picks in Round 3'), 'Returns 0 picks error message');

// Slot 4 acquired Pick 25, so Slot 4 has TWO picks in Round 3 (natural Pick 21, acquired Pick 25).
const resSlot4First = L.validateKeeperAssignment(
  { id: 'k7', slot: 4, round: 3, playerId: 80 },
  [],
  3,
  12, 20, 'snake', tradedPicks
);
assert(resSlot4First.valid, 'Allows Slot 4 first keeper in Round 3');

const resSlot4Second = L.validateKeeperAssignment(
  { id: 'k8', slot: 4, round: 3, playerId: 81 },
  [{ id: 'k7', slot: 4, round: 3, playerId: 80 }],
  3,
  12, 20, 'snake', tradedPicks
);
assert(resSlot4Second.valid, 'Allows Slot 4 second keeper in Round 3 because Slot 4 owns 2 picks in Round 3');

const resSlot4Third = L.validateKeeperAssignment(
  { id: 'k9', slot: 4, round: 3, playerId: 82 },
  [
    { id: 'k7', slot: 4, round: 3, playerId: 80 },
    { id: 'k8', slot: 4, round: 3, playerId: 81 }
  ],
  3,
  12, 20, 'snake', tradedPicks
);
assert(!resSlot4Third.valid, 'Disallows Slot 4 third keeper in Round 3 when only 2 picks are owned');

// --- 4. getKeeperPicksMap & isKeeperPick ---
const sampleKeepers = [
  { id: 'k1', slot: 2, round: 1, playerId: 100 }, // In 12-team 3RR: Slot 2 Rd 1 = Pick 2
  { id: 'k2', slot: 4, round: 3, playerId: 101 }, // Slot 4 Rd 3 (has 2 picks: 25 and 33) -> Pick 25
  { id: 'k3', slot: 4, round: 3, playerId: 102 }  // Slot 4 second keeper in Rd 3 -> Pick 33
];

const keeperMap = L.getKeeperPicksMap(sampleKeepers, 12, 20, '3rr', tradedPicks);
assert(keeperMap[2] != null, 'Pick 2 mapped to keeper');
eq(keeperMap[2].playerId, 100, 'Pick 2 has player 100');
assert(keeperMap[25] != null, 'Pick 25 mapped to Slot 4 first keeper');
eq(keeperMap[25].playerId, 101, 'Pick 25 has player 101');
assert(keeperMap[33] != null, 'Pick 33 mapped to Slot 4 second keeper');
eq(keeperMap[33].playerId, 102, 'Pick 33 has player 102');

const isP2 = L.isKeeperPick(2, sampleKeepers, 12, 20, '3rr', tradedPicks);
assert(isP2 != null && isP2.playerId === 100, 'isKeeperPick returns keeper data for Pick 2');

const isP3 = L.isKeeperPick(3, sampleKeepers, 12, 20, '3rr', tradedPicks);
assert(isP3 === null, 'isKeeperPick returns null for non-keeper pick');

// --- 5. Serialization & Deserialization ---
const stateWithKeepers = {
  settings: {
    teams: 12,
    slot: 2,
    maxKeepers: 2
  },
  keepers: sampleKeepers,
  draftLog: [{ overall: 1, playerId: 5, mine: false }],
  watchlist: [12, 14],
  queue: [30],
  tradedPicks: tradedPicks
};

const serialized = L.serializeDraftState(stateWithKeepers);
eq(serialized.keepers.length, 3, 'Serializes keepers array');
eq(serialized.settings.maxKeepers, 2, 'Serializes maxKeepers setting');

const deserialized = L.deserializeDraftState(serialized);
assert(deserialized.ok, 'Deserialization succeeds');
eq(deserialized.state.keepers.length, 3, 'Deserializes keepers array');
eq(deserialized.state.settings.maxKeepers, 2, 'Restores maxKeepers');

// Backward compatibility with V2 state without keepers
const legacyV2 = {
  version: 2,
  settings: { teams: 10, slot: 1 },
  draftLog: [],
  watchlist: [],
  queue: [],
  tradedPicks: {}
};
const migrated = L.deserializeDraftState(legacyV2);
assert(migrated.ok, 'Migrates legacy state without keepers');
eq(migrated.state.keepers, [], 'Initializes empty keepers array for legacy state');
eq(migrated.state.settings.maxKeepers, 2, 'Defaults maxKeepers to 2 for legacy state');

// --- 6. Roster Allocation with Keepers ---
const draftedWithKeeper = [
  { name: 'Justin Jefferson', pos: 'WR', isKeeper: true, entry: { overall: 2, isKeeper: true } }
];
const rosterHtml = L.formatRosterSlotHtml({ player: draftedWithKeeper[0], label: 'WR' }, true, 12);
assert(rosterHtml.includes('🔒') || rosterHtml.includes('keeper'), 'Roster slot HTML renders keeper badge indicator');

// --- 7. 0-Keeper and Variable Keeper Formats ---
// League format where maxKeepers is 0 (keepers disabled)
const resZeroMax = L.validateKeeperAssignment(
  { id: 'k10', slot: 1, round: 1, playerId: 5 },
  [],
  0, // maxKeepers = 0
  12, 20, 'snake', {}
);
assert(!resZeroMax.valid, 'Disallows assigning keepers when maxKeepers is 0');

// Teams can have 0 keepers while other teams have 1 or 2 keepers
const mixedKeepers = [
  { id: 'k_team2', slot: 2, round: 2, playerId: 50 },
  { id: 'k_team3_a', slot: 3, round: 1, playerId: 51 },
  { id: 'k_team3_b', slot: 3, round: 4, playerId: 52 }
  // Team 1 has 0 keepers
];
const mixedMap = L.getKeeperPicksMap(mixedKeepers, 12, 20, 'snake', {});
// Team 1 round 1 (Pick 1) is NOT a keeper
assert(mixedMap[1] === undefined, 'Team 1 with 0 keepers has no keeper on Pick 1');
// Team 3 round 1 (Pick 3) is a keeper
assert(mixedMap[3] != null && mixedMap[3].playerId === 51, 'Team 3 Pick 3 is correctly mapped as keeper');

// --- 8. Custom Unlisted Keepers ---
const customKeeper = {
  id: 'k_custom',
  slot: 5,
  round: 6,
  playerId: null,
  customName: 'Arch Manning',
  customPos: 'QB',
  customTeam: 'TEX',
  customBye: 7
};
const resCustomValid = L.validateKeeperAssignment(customKeeper, [], 2, 12, 20, 'snake', {});
assert(resCustomValid.valid, 'Allows custom unlisted keeper player');

// --- 9. Draft Order Slot Swap Remapping ---
const keepersBeforeSwap = [
  { id: 'k_bryan_1', slot: 9, round: 8, customName: 'Puka Nacua' },
  { id: 'k_bryan_2', slot: 9, round: 10, customName: 'Trey McBride' },
  { id: 'k_doug_1', slot: 10, round: 8, customName: 'Brock Bowers' },
  { id: 'k_doug_2', slot: 10, round: 9, customName: 'Josh Allen' },
  { id: 'k_other', slot: 2, round: 1, customName: 'Justin Jefferson' }
];

const remapped = L.remapKeepersOnSlotSwap(keepersBeforeSwap, 10, 9);
const dougRemapped = remapped.filter(k => k.id.startsWith('k_doug'));
const bryanRemapped = remapped.filter(k => k.id.startsWith('k_bryan'));
const otherRemapped = remapped.find(k => k.id === 'k_other');

eq(dougRemapped.length, 2, 'Preserves Doug keepers count');
assert(dougRemapped.every(k => k.slot === 9), 'Doug keepers moved from Slot 10 to Slot 9');
eq(bryanRemapped.length, 2, 'Preserves Bryan keepers count');
assert(bryanRemapped.every(k => k.slot === 10), 'Bryan keepers moved from Slot 9 to Slot 10');
eq(otherRemapped.slot, 2, 'Slot 2 keeper unaffected by Slot 9/10 swap');

// Verify pick mapping recalculated for remapped slots
const remappedPickMap = L.getKeeperPicksMap(remapped, 12, 20, 'snake', {});
// In 12-team snake:
// Slot 9: Round 8 is reverse round: (8 - 1)*12 + (12 + 1 - 9) = 84 + 4 = 88. Round 9 is forward: (9 - 1)*12 + 9 = 96 + 9 = 105.
// Doug has Brock Bowers (Rd 8 -> Pick 88) and Josh Allen (Rd 9 -> Pick 105).
assert(remappedPickMap[88] != null && remappedPickMap[88].customName === 'Brock Bowers', 'Doug Rd 8 keeper mapped to Slot 9 pick #88');
assert(remappedPickMap[105] != null && remappedPickMap[105].customName === 'Josh Allen', 'Doug Rd 9 keeper mapped to Slot 9 pick #105');

// --- 10. Editing Existing Keepers Validation ---
const existingForEdit = [
  { id: 'k_edit_1', slot: 6, round: 5, playerId: 46 }, // JT (Slot 6, Rd 5)
  { id: 'k_edit_2', slot: 6, round: 6, playerId: 55 }  // JJ (Slot 6, Rd 6)
];

// Editing k_edit_2 to change round from 6 to 7 (Slot 6 already has 2 keepers max, but editing itself shouldn't fail max check)
const resEditRound = L.validateKeeperAssignment(
  { id: 'k_edit_2', slot: 6, round: 7, playerId: 55 },
  existingForEdit,
  2, 12, 20, 'snake', {}
);
assert(resEditRound.valid, 'Allows editing keeper round without violating maxKeepers limit on own team');

// Editing k_edit_2 to change slot to 7 (Brody)
const resEditTeam = L.validateKeeperAssignment(
  { id: 'k_edit_2', slot: 7, round: 6, playerId: 55 },
  existingForEdit,
  2, 12, 20, 'snake', {}
);
assert(resEditTeam.valid, 'Allows editing keeper team slot without duplicate collision against itself');

// --- 11. Pre-Draft Inline Keeper Roster Allocation ---
// Verify keepers display in starting slots prior to their pick being reached
const dougPreDraftPicks = [
  {
    entry: { overall: 88, isKeeper: true, isPendingKeeper: true },
    player: { id: 17, name: 'Brock Bowers', pos: 'TE', team: 'LV', bye: 13, isKeeper: true }
  },
  {
    entry: { overall: 105, isKeeper: true, isPendingKeeper: true },
    player: { id: 25, name: 'Josh Allen', pos: 'QB', team: 'BUF', bye: 7, isKeeper: true }
  }
];

const dougAllocation = L.assignRosterSlots(dougPreDraftPicks.map(p => Object.assign({ entry: p.entry }, p.player)), { qb: 1, te: 1, flex: 1 });
const qbStarter = dougAllocation.starters.find(s => s.slotType === 'QB');
const teStarter = dougAllocation.starters.find(s => s.slotType === 'TE');
assert(qbStarter && qbStarter.player && qbStarter.player.name === 'Josh Allen', 'Josh Allen occupies starter QB slot inline');
assert(teStarter && teStarter.player && teStarter.player.name === 'Brock Bowers', 'Brock Bowers occupies starter TE slot inline');

const qbHtml = L.formatRosterSlotHtml(qbStarter, true, 12);
assert(qbHtml.includes('🔒') && qbHtml.includes('9.09'), 'Renders keeper lock badge and formatted pick in starter slot');

// --- 12. Next Draft Picks & Countdown with Pending Keepers ---
// In 12-team snake, Slot 9 picks in rounds 8, 9, 10, 11:
// Round 8: #88. Round 9: #89 (or #105 depending on direction/traded picks).
// Let's test with a keeper at pick #89:
const keeperAt89 = [
  { id: 'k_josh', slot: 9, round: 8, customName: 'Josh Allen' } // maps to pick #88
];
// Or specifically test getKeeperPicksMap mapping and getNextDraftPicks:
// In 12-team snake:
// Slot 9 picks:
// R1: 9, R2: 16, R3: 33, R4: 40, R5: 57, R6: 64, R7: 81, R8: 88, R9: 105, R10: 112
// Suppose Slot 9 traded or has keeper assigned at round 8 (pick 88):
const keepersForDoug = [
  { id: 'k_rd8', slot: 9, round: 8, customName: 'Josh Allen' }
];

// At Pick 85: upcoming picks for Slot 9 are [88, 105, 112...].
// Pick 88 is a keeper. Next active selection is pick 105.
const nextDataAt85 = L.getNextDraftPicks(9, 85, 12, 20, 'snake', {}, keepersForDoug);
eq(nextDataAt85.upcoming[0], 88, 'Next scheduled overall pick is #88');
eq(nextDataAt85.nextDraftPick, 105, 'Correctly skips pending keeper #88 and gets next draft pick #105');
eq(nextDataAt85.distanceToNextDraftPick, 20, 'Distance is calculated to next active selection (105 - 85 = 20)');
assert(!nextDataAt85.isSoon, 'isSoon is false despite keeper pick #88 being in 3 turns');

// At Pick 103 (within 2 of next draft pick 105):
const nextDataAt103 = L.getNextDraftPicks(9, 103, 12, 20, 'snake', {}, keepersForDoug);
eq(nextDataAt103.nextDraftPick, 105, 'Next draft pick remains 105');
eq(nextDataAt103.distanceToNextDraftPick, 2, 'Distance is 2');
assert(nextDataAt103.isSoon, 'isSoon becomes true when actual draft selection is within 3 turns');

// --- 13. Keeper Modal UI & Navigation Action Handlers ---
const fs = require('fs');
const draftUiCode = fs.readFileSync('js/draft-ui.js', 'utf-8');

// A. Verify global exports in draft-ui.js
assert(
  draftUiCode.includes('global.saveKeepersAndBackToSetup = saveKeepersAndBackToSetup;'),
  'draft-ui.js exports saveKeepersAndBackToSetup to global scope'
);
assert(
  draftUiCode.includes('global.saveAndCloseKeepersModal = saveAndCloseKeepersModal;'),
  'draft-ui.js exports saveAndCloseKeepersModal to global scope'
);

// B. Verify inline onclick handlers in keeper modal template
assert(
  draftUiCode.includes('<button class="close" onclick="saveAndCloseKeepersModal()">×</button>'),
  'Keeper modal header X button triggers saveAndCloseKeepersModal()'
);
assert(
  draftUiCode.includes('onclick="saveKeepersAndBackToSetup()"'),
  'Keeper modal contains Back to League Setup button triggering saveKeepersAndBackToSetup()'
);
assert(
  draftUiCode.includes('onclick="saveAndCloseKeepersModal()"') &&
  draftUiCode.includes('Save & Close'),
  'Keeper modal contains primary Save & Close button triggering saveAndCloseKeepersModal()'
);

// C. Verify behavioral execution of keeper modal exit handlers in simulated environment
let maxKeepersUpdated = null;
let savedCalled = false;
let renderCalled = false;

const mockElements = {
  keeper_modal_max: { value: '4' },
  modalbox: { className: 'modal modal-wide keepers-modal-box', innerHTML: '', classList: { contains: () => false } },
  overlay: { classList: { remove: () => {}, add: () => {} } },
  playerOverlay: { classList: { remove: () => {}, add: () => {} } },
  postabs: { innerHTML: '' }
};

const mockGlobal = {
  state: {
    settings: {
      teams: 12,
      rounds: 16,
      slot: 1,
      teamNames: ['Ken', 'Team 2'],
      maxKeepers: 2,
      mode: 'snake',
      rosterSlots: {}
    },
    keepers: [],
    tradedPicks: {},
    watchlist: [],
    queue: [],
    log: []
  },
  updateMaxKeepers: (val) => {
    maxKeepersUpdated = parseInt(val, 10);
    mockGlobal.state.settings.maxKeepers = maxKeepersUpdated;
  },
  save: () => { savedCalled = true; },
  render: () => { renderCalled = true; },
  ui: { posFilter: 'ALL', search: '', sort: 'score' },
  PLAYERS: []
};

const dummyEl = {
  value: '',
  textContent: '',
  innerHTML: '',
  classList: { add: () => {}, remove: () => {}, contains: () => false },
  style: {},
  addEventListener: () => {}
};

const vm = require('vm');
const context = vm.createContext(Object.assign({}, L, {
  window: mockGlobal,
  globalThis: mockGlobal,
  currentPick: () => 1,
  fmtPick: () => '1.01',
  roundForOverall: () => 1,
  teamForOverall: () => ({ slot: 1, name: 'Ken', isMe: true }),
  getTeamName: (slot) => (mockGlobal.state.settings.teamNames && mockGlobal.state.settings.teamNames[slot - 1]) || ('Team ' + slot),
  picksForSlot: () => [],
  scored: () => [],
  takenMap: () => new Map(),
  cleanName: (n) => n || '',
  byId: () => null,
  getKeeperPicksMap: () => ({}),
  isDraftOver: () => false,
  ui: { posFilter: 'ALL', search: '', sort: 'score' },
  viewingRosterSlot: null,
  DEFAULT_ROSTER_SLOTS: { qb: 1, rb: 2, wr: 2, te: 1, flex: 3, superflex: 1, k: 0, dst: 0, bench: 15 },
  $: (id) => mockElements[id] || { value: '', textContent: '', innerHTML: '', classList: { add: () => {}, remove: () => {}, contains: () => false }, style: {}, addEventListener: () => {} },
  document: {
    getElementById: (id) => mockElements[id] || { value: '', textContent: '', innerHTML: '', classList: { add: () => {}, remove: () => {}, contains: () => false }, style: {}, addEventListener: () => {} },
    addEventListener: () => {}
  },
  console: console
}));

vm.runInContext(draftUiCode, context);

// Verify functions are exported onto mockGlobal
assert(typeof mockGlobal.saveAndCloseKeepersModal === 'function', 'saveAndCloseKeepersModal is defined on global scope');
assert(typeof mockGlobal.saveKeepersAndBackToSetup === 'function', 'saveKeepersAndBackToSetup is defined on global scope');

// Test 1: saveAndCloseKeepersModal execution
savedCalled = false;
renderCalled = false;
maxKeepersUpdated = null;
mockElements.modalbox.className = 'modal modal-wide keepers-modal-box';

mockGlobal.saveAndCloseKeepersModal();

eq(maxKeepersUpdated, 4, 'saveAndCloseKeepersModal updates maxKeepers from #keeper_modal_max');
eq(mockGlobal.state.settings.maxKeepers, 4, 'Settings maxKeepers updated to 4');
assert(savedCalled, 'saveAndCloseKeepersModal calls global.save()');
assert(mockElements.postabs.innerHTML.includes('ALL'), 'saveAndCloseKeepersModal triggers render()');
eq(mockElements.modalbox.className, 'modal', 'closeModal() resets modalbox className to "modal"');

// Test 2: saveKeepersAndBackToSetup execution
savedCalled = false;
maxKeepersUpdated = null;
mockElements.keeper_modal_max.value = '3';

mockGlobal.saveKeepersAndBackToSetup();

eq(maxKeepersUpdated, 3, 'saveKeepersAndBackToSetup updates maxKeepers from #keeper_modal_max');
eq(mockGlobal.state.settings.maxKeepers, 3, 'Settings maxKeepers updated to 3');
assert(savedCalled, 'saveKeepersAndBackToSetup calls global.save()');
assert(mockElements.modalbox.innerHTML.includes('League Setup'), 'saveKeepersAndBackToSetup navigates back to League Setup');
eq(mockElements.modalbox.className, 'modal modal-wide', 'openLeagueSetup resets modalbox className to modal modal-wide');

// Test 3: closeModal resets keeper modal editing flags
assert(typeof mockGlobal.closeModal === 'function', 'closeModal is exported to global scope');
mockGlobal.closeModal();
eq(mockElements.modalbox.className, 'modal', 'closeModal resets modalbox class');

// Test 4: openKeepersModal syncs settings from League Setup DOM
mockElements.setup_team_count = { value: '10' };
mockElements.setup_mode_select = { value: '3rr' };
mockElements.setup_max_keepers = { value: '3' };
mockElements.setup_rounds_count = { value: '18' };
mockGlobal.openKeepersModal();

eq(mockGlobal.state.settings.teams, 10, 'openKeepersModal syncs teams from DOM');
eq(mockGlobal.state.settings.mode, '3rr', 'openKeepersModal syncs mode from DOM');
eq(mockGlobal.state.settings.rounds, 18, 'openKeepersModal syncs rounds from DOM');
eq(mockElements.modalbox.className, 'modal modal-wide keepers-modal-box', 'openKeepersModal sets keepers-modal-box class');

// ============================================================================
// 14. Data Refresh Stability & Player Pool Reconciliation
// ============================================================================

// 1. buildPlayerLookupIndex and findPlayerInPool tests
const samplePool = [
  { id: 0, name: 'Justin Jefferson', pos: 'WR', team: 'MIN', bye: 6 },
  { id: 1, name: "Ja'Marr Chase", pos: 'WR', team: 'CIN', bye: 12 },
  { id: 2, name: 'CeeDee Lamb', pos: 'WR', team: 'DAL', bye: 7 },
  { id: 3, name: 'Marvin Harrison Jr.', pos: 'WR', team: 'ARI', bye: 11 },
  { id: 4, name: 'San Francisco 49ers', pos: 'DST', team: 'SF', bye: 9 },
  { id: 5, name: 'Saquon Barkley', pos: 'RB', team: 'PHI', bye: 5 }
];

const lookup = L.buildPlayerLookupIndex(samplePool);
assert(lookup && lookup.exactMap, 'buildPlayerLookupIndex builds lookup maps');

// Exact match
const matchExact = L.findPlayerInPool({ name: 'Justin Jefferson', pos: 'WR', team: 'MIN' }, samplePool, lookup);
eq(matchExact.id, 0, 'findPlayerInPool matches exact player');

// Suffix match (e.g. without "Jr.")
const matchSuffix = L.findPlayerInPool({ name: 'Marvin Harrison', pos: 'WR', team: 'ARI' }, samplePool, lookup);
eq(matchSuffix.id, 3, 'findPlayerInPool matches name without suffix variant (Jr.)');

// Team changed (e.g. Barkley formerly NYG, now PHI)
const matchTraded = L.findPlayerInPool({ name: 'Saquon Barkley', pos: 'RB', team: 'NYG' }, samplePool, lookup);
eq(matchTraded.id, 5, 'findPlayerInPool matches by name + pos when player changes team');

// DST match
const matchDst = L.findPlayerInPool({ name: '49ers DST', pos: 'DST', team: 'SF' }, samplePool, lookup);
eq(matchDst.id, 4, 'findPlayerInPool matches defense by canonical team');

// Non-existent player
const matchMissing = L.findPlayerInPool({ name: 'Nonexistent Player', pos: 'WR', team: 'FA' }, samplePool, lookup);
eq(matchMissing, null, 'findPlayerInPool returns null for unranked/missing player');

// 2. Full State Reconciliation with Re-ordered Player Pool (Rankings Shuffle)
// Initial state before refresh:
// Ja'Marr Chase was index 1, CeeDee Lamb was index 2, Justin Jefferson was index 0
const stateToReconcile = {
  settings: { teams: 12, rounds: 20, mode: 'snake', slot: 1 },
  keepers: [
    {
      id: 'k_chase',
      slot: 1,
      round: 1,
      playerId: 1,
      playerName: "Ja'Marr Chase",
      playerPos: 'WR',
      playerTeam: 'CIN',
      playerBye: 12
    },
    {
      id: 'k_lamb',
      slot: 2,
      round: 1,
      playerId: 2,
      playerName: 'CeeDee Lamb',
      playerPos: 'WR',
      playerTeam: 'DAL',
      playerBye: 7
    },
    {
      id: 'k_dropped',
      slot: 3,
      round: 5,
      playerId: 99,
      playerName: 'Retired Player',
      playerPos: 'RB',
      playerTeam: 'DEN',
      playerBye: 14
    }
  ],
  log: [
    { overall: 1, playerId: 0, name: 'Justin Jefferson', pos: 'WR', team: 'MIN', mine: true }
  ],
  watchlist: [1, 2], // Chase, Lamb
  queue: [2],        // Lamb
  playerSnapshots: {
    0: { name: 'Justin Jefferson', pos: 'WR', team: 'MIN', bye: 6 },
    1: { name: "Ja'Marr Chase", pos: 'WR', team: 'CIN', bye: 12 },
    2: { name: 'CeeDee Lamb', pos: 'WR', team: 'DAL', bye: 7 },
    99: { name: 'Retired Player', pos: 'RB', team: 'DEN', bye: 14 }
  }
};

// Refreshed pool: rankings change array indices
// Now:
// 0 -> Ja'Marr Chase
// 1 -> CeeDee Lamb
// 2 -> Justin Jefferson
// Retired Player is NOT in pool
const refreshedPool = [
  { id: 0, name: "Ja'Marr Chase", pos: 'WR', team: 'CIN', bye: 12 },
  { id: 1, name: 'CeeDee Lamb', pos: 'WR', team: 'DAL', bye: 7 },
  { id: 2, name: 'Justin Jefferson', pos: 'WR', team: 'MIN', bye: 6 }
];

const reconcileResult = L.reconcileStateWithNewPlayerPool(stateToReconcile, refreshedPool);

// Verify Chase keeper in Slot 1 re-mapped from index 1 to new index 0
const chaseKeeper = stateToReconcile.keepers.find(k => k.id === 'k_chase');
eq(chaseKeeper.playerId, 0, "Slot 1 Ja'Marr Chase keeper re-mapped to new index 0");
eq(chaseKeeper.playerName, "Ja'Marr Chase", 'Keeper playerName is intact');
eq(chaseKeeper.wasDroppedFromPool, false, 'wasDroppedFromPool is false');

// Verify Lamb keeper in Slot 2 re-mapped from index 2 to new index 1
const lambKeeper = stateToReconcile.keepers.find(k => k.id === 'k_lamb');
eq(lambKeeper.playerId, 1, 'Slot 2 CeeDee Lamb keeper re-mapped to new index 1');

// Verify Retired Player keeper auto-converted to custom unlisted keeper
const droppedKeeper = stateToReconcile.keepers.find(k => k.id === 'k_dropped');
eq(droppedKeeper.playerId, null, 'Dropped keeper playerId is cleared to null');
eq(droppedKeeper.wasDroppedFromPool, true, 'Dropped keeper flagged wasDroppedFromPool = true');
eq(droppedKeeper.customName, 'Retired Player', 'Dropped keeper preserves name as customName');
eq(droppedKeeper.customPos, 'RB', 'Dropped keeper preserves customPos');
eq(droppedKeeper.customTeam, 'DEN', 'Dropped keeper preserves customTeam');
eq(droppedKeeper.customBye, 14, 'Dropped keeper preserves customBye');
eq(droppedKeeper.slot, 3, 'Dropped keeper preserves team slot');
eq(droppedKeeper.round, 5, 'Dropped keeper preserves round assignment');

// Verify draft log re-mapped from 0 to 2 (Justin Jefferson)
eq(stateToReconcile.log[0].playerId, 2, 'Log entry for Justin Jefferson re-mapped to index 2');
eq(stateToReconcile.log[0].name, 'Justin Jefferson', 'Log entry name preserved');

// Verify watchlist and queue re-mapped
eq(stateToReconcile.watchlist.includes(0), true, 'Watchlist contains Chase at new index 0');
eq(stateToReconcile.watchlist.includes(1), true, 'Watchlist contains Lamb at new index 1');
eq(stateToReconcile.queue.includes(1), true, 'Queue contains Lamb at new index 1');

eq(reconcileResult.keepersReconciled, 2, 'reconcileResult counts 2 keepers reconciled');
eq(reconcileResult.keepersDropped, 1, 'reconcileResult counts 1 keeper dropped');
eq(reconcileResult.logReconciled, 1, 'reconcileResult counts 1 log entry reconciled');
eq(reconcileResult.watchlistReconciled, 2, 'reconcileResult counts 2 watchlist items reconciled');
eq(reconcileResult.queueReconciled, 1, 'reconcileResult counts 1 queue item reconciled');

// 3. UI: Dropped keeper badge in keepers table view
mockGlobal.state.keepers = [
  {
    id: 'k_test_dropped',
    slot: 1,
    round: 2,
    playerId: null,
    playerName: 'Nuk Hopkins',
    playerPos: 'WR',
    playerTeam: 'KC',
    customName: 'Nuk Hopkins',
    customPos: 'WR',
    customTeam: 'KC',
    wasDroppedFromPool: true
  }
];
mockGlobal.renderKeepersModalView();
assert(mockElements.modalbox.innerHTML.includes('⚠️ (unranked in pool)'), 'Keeper table displays ⚠️ (unranked in pool) badge for dropped keeper');
assert(mockElements.modalbox.innerHTML.includes('Nuk Hopkins'), 'Keeper table displays dropped keeper name');

// 4. UI: Auto-save League Setup before data refresh
mockElements.setup_team_count = { value: '14' };
mockElements.setup_league_name = { value: 'Pre-Refresh Championship League' };
mockElements.setup_mode_select = { value: 'snake' };
mockElements.setup_scoring_select = { value: 'ppr' };
mockElements.setup_qb_select = { value: 'sf' };

const mockSessionStorage = {
  _data: {},
  getItem(k) { return this._data[k]; },
  setItem(k, v) { this._data[k] = v; },
  removeItem(k) { delete this._data[k]; }
};
mockGlobal.window = mockGlobal;
mockGlobal.sessionStorage = mockSessionStorage;
context.sessionStorage = mockSessionStorage;
mockGlobal.location = { reload: () => {} };
context.location = mockGlobal.location;

let fetchCalledWith = null;
const mockFetch = async (url) => {
  fetchCalledWith = url;
  return {
    ok: true,
    headers: { get: () => 'application/json' },
    json: async () => ({ ok: true, message: 'Rankings updated' })
  };
};
mockGlobal.fetch = mockFetch;
context.fetch = mockFetch;

const mockRefreshBtn = { disabled: false, textContent: 'Refresh' };
savedCalled = false;
await mockGlobal.triggerDataRefresh(mockRefreshBtn);

eq(fetchCalledWith, '/api/data/refresh', 'triggerDataRefresh posts to /api/data/refresh');
eq(mockGlobal.state.settings.leagueName, 'Pre-Refresh Championship League', 'triggerDataRefresh auto-saves modified league name before refresh');
eq(mockGlobal.state.settings.teams, 14, 'triggerDataRefresh auto-saves modified teams count before refresh');
assert(savedCalled, 'global.save() was called prior to server fetch');
assert(Boolean(mockSessionStorage.getItem('pendingDataRefreshToast')), 'pendingDataRefreshToast flag set in sessionStorage');

// 5. UI: renderBanner renders confirmation and clears toast flag
mockElements.databanner = { innerHTML: '' };
mockGlobal.window.DRAFT_DATA = { players: [{ name: 'Test Player' }], generated: '2026-09-06' };
mockGlobal.renderBanner();

assert(mockElements.databanner.innerHTML.includes('Rankings Refreshed'), 'renderBanner displays rankings refreshed banner');
assert(mockElements.databanner.innerHTML.includes('Keepers and draft picks were safely reconciled'), 'renderBanner displays reconciliation confirmation');
eq(mockSessionStorage.getItem('pendingDataRefreshToast'), undefined, 'pendingDataRefreshToast flag was cleared from sessionStorage');

const success = finishSuite('Keepers & Pre-Drafted Players');
if (!success) {
  process.exit(1);
}

