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

const success = finishSuite('Keepers & Pre-Drafted Players');
if (!success) {
  process.exit(1);
}
