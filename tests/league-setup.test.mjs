// Test suite for League Setup, Multi-team Slot Mapping, and Draft Reversals
import { createRequire } from 'module';
import { eq, assert, printSuiteHeader, finishSuite, resetFailures } from './test-helper.mjs';

const require = createRequire(import.meta.url);
const L = require('../draft-logic.js');

resetFailures();
printSuiteHeader('League Setup & Draft Simulation');

// 1. Team generation and default naming
const tenTeams = L.defaultTeams(10, 4, 'Dynasty Titans');
eq(tenTeams.length, 10, 'Generates exactly 10 teams');
eq(tenTeams[3], { slot: 4, name: 'Dynasty Titans' }, 'Slot 4 gets user custom name');
eq(tenTeams[0], { slot: 1, name: 'Team 1' }, 'Slot 1 gets default name');

// 2. 14-team 3RR pick assignment
const pick14_r1 = L.teamForOverall(1, 14, '3rr', null, 1);
eq(pick14_r1.slot, 1, '14-team R1 pick 1 belongs to slot 1');

const pick14_r2_first = L.teamForOverall(15, 14, '3rr', null, 14);
eq(pick14_r2_first.slot, 14, '14-team R2 pick 15 belongs to slot 14 (reverse)');

const pick14_r3_first = L.teamForOverall(29, 14, '3rr', null, 14);
eq(pick14_r3_first.slot, 14, '14-team R3 pick 29 belongs to slot 14 in 3RR (reverse again)');

const pick14_r4_first = L.teamForOverall(43, 14, '3rr', null, 1);
eq(pick14_r4_first.slot, 1, '14-team R4 pick 43 belongs to slot 1 (forward)');

// 3. Draft Simulation: Verify all slots get correct total picks without collision in 25-round draft
for (const size of [8, 10, 12, 14, 16]) {
  const totalRounds = 25;
  const pickMap = new Map();
  for (let slot = 1; slot <= size; slot++) {
    const picks = L.picksForSlot(slot, size, totalRounds, '3rr');
    eq(picks.length, totalRounds, `${size}-team league: slot ${slot} gets ${totalRounds} picks`);
    for (const p of picks) {
      assert(!pickMap.has(p), `${size}-team: pick #${p} is unique across slots`);
      pickMap.set(p, slot);
    }
  }
  eq(pickMap.size, size * totalRounds, `${size}-team: all ${size * totalRounds} picks assigned without gaps`);
}

const success = finishSuite('League Setup & Draft Simulation');
if (!success) {
  process.exit(1);
}
