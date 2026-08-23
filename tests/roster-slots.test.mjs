// Test suite for Starter Slots, Bench Allocation, and Lineup Configuration
import { createRequire } from 'module';
import { eq, assert, printSuiteHeader, finishSuite, resetFailures } from './test-helper.mjs';

const require = createRequire(import.meta.url);
const L = require('../draft-logic.js');

resetFailures();
printSuiteHeader('Starter Slots & Bench Roster Allocation');

// --- 1. Default Roster Configuration & Lineup Summary ---
const defaultSlots = {
  qb: 1,
  rb: 2,
  wr: 2,
  te: 1,
  flex: 3,        // RB/WR/TE
  superflex: 1,   // QB/RB/WR/TE
  k: 0,
  dst: 0,
  bench: 15
};

eq(L.formatLineupSummary(defaultSlots), 'QB · 2RB · 2WR · TE · 3FLEX · SF · 15 BN', 'Formats standard superflex lineup');

const customSlots = {
  qb: 2,
  rb: 2,
  wr: 3,
  te: 1,
  flex: 2,
  superflex: 0,
  k: 1,
  dst: 1,
  bench: 8
};
eq(L.formatLineupSummary(customSlots), '2QB · 2RB · 3WR · TE · 2FLEX · K · D/ST · 8 BN', 'Formats 2QB + K + DST lineup');

// --- 2. Empty drafted players list ---
const emptyRoster = L.assignRosterSlots([], defaultSlots);
eq(emptyRoster.totalStarters, 10, 'Default total starters is 10');
eq(emptyRoster.totalBench, 15, 'Default total bench is 15');
eq(emptyRoster.starters.length, 10, 'Starters array contains exactly 10 slots');
eq(emptyRoster.bench.length, 0, 'Bench array is empty when no players drafted');
eq(emptyRoster.starters.every(s => s.player === null), true, 'All starter slots are open when no players drafted');

// --- 3. Positional Starter Filling & Flex / Superflex Allocation ---
const draftedPlayers = [
  { id: 0, name: 'Josh Allen', pos: 'QB', bye: 7 },
  { id: 1, name: 'Jahmyr Gibbs', pos: 'RB', bye: 6 },
  { id: 2, name: 'Justin Jefferson', pos: 'WR', bye: 10 },
  { id: 3, name: 'CeeDee Lamb', pos: 'WR', bye: 7 },
  { id: 4, name: 'Brock Bowers', pos: 'TE', bye: 6 },
  { id: 5, name: 'Bijan Robinson', pos: 'RB', bye: 11 },
  { id: 6, name: 'Amon-Ra St. Brown', pos: 'WR', bye: 5 },
  { id: 7, name: 'Garrett Wilson', pos: 'WR', bye: 13 },
  { id: 8, name: 'Breece Hall', pos: 'RB', bye: 12 },
  { id: 9, name: 'Lamar Jackson', pos: 'QB', bye: 7 },
  { id: 10, name: 'Jayden Daniels', pos: 'QB', bye: 14 },
  { id: 11, name: 'Malik Nabers', pos: 'WR', bye: 8 },
];

const filledRoster = L.assignRosterSlots(draftedPlayers, defaultSlots);

// Verify Primary Starters
eq(filledRoster.starters[0].slotType, 'QB', 'Slot 0 is QB');
eq(filledRoster.starters[0].player.name, 'Josh Allen', 'Josh Allen is starting QB');

eq(filledRoster.starters[1].slotType, 'RB', 'Slot 1 is RB');
eq(filledRoster.starters[1].player.name, 'Jahmyr Gibbs', 'Gibbs is starting RB1');
eq(filledRoster.starters[2].slotType, 'RB', 'Slot 2 is RB');
eq(filledRoster.starters[2].player.name, 'Bijan Robinson', 'Bijan is starting RB2');

eq(filledRoster.starters[3].slotType, 'WR', 'Slot 3 is WR');
eq(filledRoster.starters[3].player.name, 'Justin Jefferson', 'Jefferson is starting WR1');
eq(filledRoster.starters[4].slotType, 'WR', 'Slot 4 is WR');
eq(filledRoster.starters[4].player.name, 'CeeDee Lamb', 'CeeDee is starting WR2');

eq(filledRoster.starters[5].slotType, 'TE', 'Slot 5 is TE');
eq(filledRoster.starters[5].player.name, 'Brock Bowers', 'Bowers is starting TE');

// Verify 3 Regular Flex (RB/WR/TE): St. Brown (WR), Wilson (WR), Hall (RB)
const flexStarters = filledRoster.starters.filter(s => s.slotType === 'FLEX');
eq(flexStarters.length, 3, 'Exactly 3 FLEX slots');
eq(flexStarters.map(s => s.player.name), ['Amon-Ra St. Brown', 'Garrett Wilson', 'Breece Hall'], 'Flex slots filled with remaining RB/WRs');

// Verify Superflex: Lamar Jackson (QB)
const sfStarter = filledRoster.starters.find(s => s.slotType === 'SF');
eq(sfStarter.player.name, 'Lamar Jackson', 'Lamar Jackson fills Superflex');

// Verify Bench Spillover: Jayden Daniels (QB) and Malik Nabers (WR)
eq(filledRoster.bench.length, 2, '2 players spill over to bench');
eq(filledRoster.bench.map(b => b.player.name), ['Jayden Daniels', 'Malik Nabers'], 'Bench contains Daniels and Nabers');

// --- 4. Kicker (K) and Defense (DST) Slot Support ---
const draftedWithKDST = [
  { id: 20, name: 'Brandon Aubrey', pos: 'K', bye: 14 },
  { id: 21, name: 'San Francisco 49ers', pos: 'DST', bye: 8 },
  { id: 22, name: 'Justin Tucker', pos: 'K', bye: 13 },
];

const kdstRoster = L.assignRosterSlots(draftedWithKDST, customSlots);
const kStarter = kdstRoster.starters.find(s => s.slotType === 'K');
const dstStarter = kdstRoster.starters.find(s => s.slotType === 'DST');

eq(kStarter.player.name, 'Brandon Aubrey', 'Aubrey fills starter K');
eq(dstStarter.player.name, 'San Francisco 49ers', '49ers fills starter D/ST');
eq(kdstRoster.bench.length, 1, 'Extra kicker Tucker goes to bench');
eq(kdstRoster.bench[0].player.name, 'Justin Tucker', 'Justin Tucker on bench');

// --- 5. Flex Allocation Edge Cases (WR-heavy & Superflex RB fallback) ---
const wrHeavyDraft = [
  { id: 101, name: 'WR 1', pos: 'WR' },
  { id: 102, name: 'WR 2', pos: 'WR' },
  { id: 103, name: 'WR 3', pos: 'WR' },
  { id: 104, name: 'WR 4', pos: 'WR' },
  { id: 105, name: 'WR 5', pos: 'WR' },
  { id: 106, name: 'WR 6', pos: 'WR' },
];
const wrHeavyRoster = L.assignRosterSlots(wrHeavyDraft, defaultSlots);
// 2 WR starter slots, 3 FLEX slots, 1 SF slot (filled by 6th WR!)
eq(wrHeavyRoster.starters.filter(s => s.player !== null).length, 6, '6 WRs fill 2 WR + 3 FLEX + 1 SF');
eq(wrHeavyRoster.starters.find(s => s.slotType === 'SF').player.name, 'WR 6', 'Superflex filled by WR when no QB drafted');
eq(wrHeavyRoster.bench.length, 0, 'No bench spillover yet');

// --- 6. D/ST Aliases ('DEF', 'D/ST', 'DST') ---
const defAliasDraft = [
  { id: 201, name: 'Dallas DEF', pos: 'DEF' },
  { id: 202, name: 'Philly D/ST', pos: 'D/ST' },
];
const defAliasRoster = L.assignRosterSlots(defAliasDraft, customSlots);
eq(defAliasRoster.starters.find(s => s.slotType === 'DST').player.name, 'Dallas DEF', 'Recognizes DEF alias for D/ST starter slot');
eq(defAliasRoster.bench[0].player.name, 'Philly D/ST', 'Spills second defense to bench');
eq(defAliasRoster.counts.DST, 2, 'Counts both DEF and D/ST under DST count');

// --- 7. Zero Bench & Total Rounds Math ---
const zeroBenchSlots = { qb: 1, rb: 2, wr: 2, te: 1, flex: 1, superflex: 0, k: 0, dst: 0, bench: 0 };
eq(L.formatLineupSummary(zeroBenchSlots), 'QB · 2RB · 2WR · TE · FLEX', 'Formats lineup without bench suffix when bench is 0');
eq(L.formatLineupSummary({ qb: 0, rb: 0, wr: 0, te: 0, flex: 0, superflex: 0, k: 0, dst: 0, bench: 0 }), 'No Starters Configured', 'Fallback for empty configuration');

function computeTotalRounds(rosterSlots) {
  const s = Object.assign({}, defaultSlots, rosterSlots);
  const starters = (s.qb || 0) + (s.rb || 0) + (s.wr || 0) + (s.te || 0) +
                   (s.flex || 0) + (s.superflex || 0) + (s.k || 0) + (s.dst || 0);
  const bench = s.bench || 0;
  return starters + bench;
}

eq(computeTotalRounds(defaultSlots), 25, '10 starters + 15 bench = 25 rounds');
eq(computeTotalRounds(customSlots), 20, '12 starters + 8 bench = 20 rounds');
eq(computeTotalRounds(zeroBenchSlots), 7, '7 starters + 0 bench = 7 rounds');

// --- 8. Roster Slot HTML Rendering (Labels on empty slots, position badges on selected players) ---
const emptyQbSlot = { slotType: 'QB', label: 'QB', player: null };
const emptyQbHtml = L.formatRosterSlotHtml(emptyQbSlot, true, 12);
assert(emptyQbHtml.includes('starter-slot empty-slot'), 'Empty starter slot has empty-slot class');
assert(emptyQbHtml.includes('<span class="slot-label-tag">[QB]</span>'), 'Empty slot renders [QB] tag');
assert(emptyQbHtml.includes('Open Starter Slot'), 'Empty slot renders "Open Starter Slot"');
assert(!emptyQbHtml.includes('<span class="pos'), 'Empty slot does NOT have pos badge');

const emptySfSlot = { slotType: 'SF', label: 'SF', player: null };
const emptySfHtml = L.formatRosterSlotHtml(emptySfSlot, true, 12);
assert(emptySfHtml.includes('<span class="slot-label-tag">[SF]</span>'), 'Empty Superflex renders [SF] tag');

const filledQbSlot = {
  slotType: 'QB',
  label: 'QB',
  player: { id: 10, name: 'Jalen Hurts', pos: 'QB', team: 'PHI', bye: 10, entry: { overall: 4 } }
};
const filledQbHtml = L.formatRosterSlotHtml(filledQbSlot, true, 12);
assert(filledQbHtml.includes('starter-slot'), 'Filled starter slot has starter-slot class');
assert(!filledQbHtml.includes('empty-slot'), 'Filled starter slot does not have empty-slot class');
assert(!filledQbHtml.includes('slot-label-tag'), 'Filled starter slot does NOT have slot-label-tag [QB]');
assert(!filledQbHtml.includes('[QB]'), 'Filled starter slot does NOT have bracketed [QB]');
assert(filledQbHtml.includes('<span class="pos QB">QB</span>'), 'Filled starter slot begins with inline position badge');
assert(filledQbHtml.includes('Jalen Hurts'), 'Filled starter slot displays player name');
assert(filledQbHtml.includes('PHI'), 'Filled starter slot displays NFL team');
assert(filledQbHtml.includes('1.04'), 'Filled starter slot displays formatted pick');

const filledBenchSlot = {
  slotType: 'BN',
  label: 'BN',
  player: { id: 30, name: 'Jared Goff', pos: 'QB', team: 'DET', bye: 6, entry: { overall: 30 } }
};
const filledBenchHtml = L.formatRosterSlotHtml(filledBenchSlot, false, 12);
assert(filledBenchHtml.includes('bench-slot'), 'Filled bench slot has bench-slot class');
assert(!filledBenchHtml.includes('slot-label-tag'), 'Filled bench slot does NOT have slot-label-tag [BN]');
assert(!filledBenchHtml.includes('[BN]'), 'Filled bench slot does NOT have bracketed [BN]');
assert(filledBenchHtml.includes('<span class="pos QB">QB</span>'), 'Filled bench slot renders position badge inline');

const success = finishSuite('Starter Slots & Bench Roster Allocation');
if (!success) {
  process.exit(1);
}
