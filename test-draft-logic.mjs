// Tests for the 3rd-round-reversal pick math. Run: node test-draft-logic.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const L = require('./draft-logic.js');

let failures = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failures++;
    console.error(`FAIL ${label}: expected ${e}, got ${a}`);
  } else {
    console.log(`ok   ${label}`);
  }
}

// --- Commissioner's own examples (12-team language from the league message) ---
// "The team in the 12th draft slot will pick 1.12, 2.1, and then 3.1"
eq(L.overallPick(1, 12, 12, '3rr'), 12, 'slot 12 R1 = overall 12 (1.12)');
eq(L.overallPick(2, 12, 12, '3rr'), 13, 'slot 12 R2 = overall 13 (2.01)');
eq(L.overallPick(3, 12, 12, '3rr'), 25, 'slot 12 R3 = overall 25 (3.01)');
// "The team in the 1st draft slot will pick 1.1, 2.12, and then 3.12"
eq(L.overallPick(1, 1, 12, '3rr'), 1, 'slot 1 R1 = overall 1 (1.01)');
eq(L.overallPick(2, 1, 12, '3rr'), 24, 'slot 1 R2 = overall 24 (2.12)');
eq(L.overallPick(3, 1, 12, '3rr'), 36, 'slot 1 R3 = overall 36 (3.12)');

// --- Ken: slot 2 ---
// 10 teams
eq(L.picksForSlot(2, 10, 8, '3rr'), [2, 19, 29, 32, 49, 52, 69, 72], 'Ken slot 2, 10 teams, first 8 rounds');
// 12 teams (in case league size turns out to be 12)
eq(L.picksForSlot(2, 12, 6, '3rr'), [2, 23, 35, 38, 59, 62], 'Ken slot 2, 12 teams, first 6 rounds');

// --- Normal snake sanity check ---
eq(L.picksForSlot(2, 10, 4, 'snake'), [2, 19, 22, 39], 'slot 2 normal snake, 10 teams');

// --- Round direction table for 3RR ---
eq([1, 2, 3, 4, 5, 6, 7].map(r => L.roundIsForward(r, '3rr')),
   [true, false, false, true, false, true, false],
   '3RR direction: F, R, R, F, R, F, R');

// --- slotForOverall is the inverse of overallPick ---
let inverseOk = true;
for (const teams of [10, 12]) {
  for (let r = 1; r <= 20; r++) {
    for (let s = 1; s <= teams; s++) {
      const o = L.overallPick(r, s, teams, '3rr');
      const back = L.slotForOverall(o, teams, '3rr');
      if (back.round !== r || back.slot !== s) inverseOk = false;
    }
  }
}
eq(inverseOk, true, 'slotForOverall inverts overallPick for every pick, 10 and 12 teams');

// --- Every round covers each overall pick exactly once ---
let coverage = true;
for (const teams of [10, 12]) {
  const seen = new Set();
  for (let s = 1; s <= teams; s++) {
    for (const p of L.picksForSlot(s, teams, 15, '3rr')) {
      if (seen.has(p)) coverage = false;
      seen.add(p);
    }
  }
  if (seen.size !== teams * 15) coverage = false;
}
eq(coverage, true, 'all overall picks 1..N*rounds assigned exactly once');

// --- Name normalization ---
eq(L.normalizeName('Marvin Harrison Jr.'), 'marvin harrison', 'strips Jr.');
eq(L.normalizeName("De'Von  Achane"), 'devon achane', 'strips apostrophe + double space');
eq(L.normalizeName('Kenneth Walker III'), 'kenneth walker', 'strips III');

// --- Scoring ---
eq(L.rankToScore(1, 200), 100, 'rank 1 scores 100');
eq(L.rankToScore(null, 200), null, 'missing rank scores null');
const te = { pos: 'TE', dynScore: 50, redScore: 50 };
eq(L.compositeScore(te, 0.5, true) > L.compositeScore(te, 0.5, false), true, 'TE premium boosts TEs');
const wr = { pos: 'WR', dynScore: 80, redScore: null };
eq(L.compositeScore(wr, 0.5, false), 80, 'missing redraft falls back to dynasty score');

if (failures > 0) {
  console.error(`\n${failures} test(s) FAILED`);
  process.exit(1);
}
console.log('\nAll tests passed');
