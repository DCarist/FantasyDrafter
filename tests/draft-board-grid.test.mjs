// Test suite for Draft Board Grid matrix generation and pick resolution
import { createRequire } from 'module';
import { eq, assert, printSuiteHeader, finishSuite, resetFailures } from './test-helper.mjs';

const require = createRequire(import.meta.url);
const L = require('../draft-logic.js');

resetFailures();
printSuiteHeader('Draft Board Grid Matrix & Pick Resolution');

const mockPlayers = {
  101: { id: 101, name: 'Josh Allen', pos: 'QB', team: 'BUF', bye: 12 },
  102: { id: 102, name: 'Ja\'Marr Chase', pos: 'WR', team: 'CIN', bye: 12 },
  103: { id: 103, name: 'Bijan Robinson', pos: 'RB', team: 'ATL', bye: 12 },
  104: { id: 104, name: 'Brock Bowers', pos: 'TE', team: 'LV', bye: 10 },
  105: { id: 105, name: 'Justin Tucker', pos: 'K', team: 'BAL', bye: 14 },
  106: { id: 106, name: 'San Francisco 49ers', pos: 'DST', team: 'SF', bye: 9 }
};

const byIdLookup = id => mockPlayers[id] || null;

// 1. Grid structure & dimensions
const gridRes = L.generateDraftBoardGrid({
  teams: 4,
  rounds: 3,
  mode: 'snake',
  log: [],
  keepers: [],
  tradedPicks: {},
  teamNames: ['Alpha', 'Bravo', 'Charlie', 'Delta'],
  mySlot: 2,
  currentPickNum: 1,
  playersLookup: byIdLookup
});

assert(gridRes != null, 'Grid result is generated');
eq(gridRes.teams, 4, 'Correct teams count');
eq(gridRes.rounds, 3, 'Correct rounds count');
eq(gridRes.grid.length, 3, 'Grid has exactly 3 round rows');
eq(gridRes.grid[0].picks.length, 4, 'Round 1 has 4 pick columns');
eq(gridRes.grid[1].picks.length, 4, 'Round 2 has 4 pick columns');
eq(gridRes.grid[2].picks.length, 4, 'Round 3 has 4 pick columns');

// 2. Snake vs 3RR pick numbering in cells
// Round 1 (Forward): Pick 1 (Slot 1), Pick 2 (Slot 2), Pick 3 (Slot 3), Pick 4 (Slot 4)
eq(gridRes.grid[0].picks[0].overall, 1, 'R1 Col 1 is Pick #1');
eq(gridRes.grid[0].picks[1].overall, 2, 'R1 Col 2 is Pick #2');
eq(gridRes.grid[0].picks[2].overall, 3, 'R1 Col 3 is Pick #3');
eq(gridRes.grid[0].picks[3].overall, 4, 'R1 Col 4 is Pick #4');
assert(gridRes.grid[0].isForward, 'Round 1 is forward');

// Round 2 (Reverse): Pick 8 (Slot 1), Pick 7 (Slot 2), Pick 6 (Slot 3), Pick 5 (Slot 4)
eq(gridRes.grid[1].picks[0].overall, 8, 'R2 Col 1 is Pick #8');
eq(gridRes.grid[1].picks[1].overall, 7, 'R2 Col 2 is Pick #7');
eq(gridRes.grid[1].picks[2].overall, 6, 'R2 Col 3 is Pick #6');
eq(gridRes.grid[1].picks[3].overall, 5, 'R2 Col 4 is Pick #5');
assert(!gridRes.grid[1].isForward, 'Round 2 is reverse');

// 3. 3RR Reversal check
const grid3rr = L.generateDraftBoardGrid({
  teams: 4,
  rounds: 4,
  mode: '3rr',
  log: [],
  keepers: [],
  tradedPicks: {},
  mySlot: 1,
  currentPickNum: 1
});

// In 3RR 4-team:
// R1: 1, 2, 3, 4 (Fwd)
// R2: 8, 7, 6, 5 (Rev)
// R3: 12, 11, 10, 9 (Rev again!)
// R4: 13, 14, 15, 16 (Fwd)
assert(grid3rr.grid[0].isForward, '3RR R1 is forward');
assert(!grid3rr.grid[1].isForward, '3RR R2 is reverse');
assert(!grid3rr.grid[2].isForward, '3RR R3 is reverse again');
assert(grid3rr.grid[3].isForward, '3RR R4 is forward');
eq(grid3rr.grid[2].picks[0].overall, 12, '3RR R3 Col 1 is Pick #12');
eq(grid3rr.grid[2].picks[3].overall, 9, '3RR R3 Col 4 is Pick #9');
eq(grid3rr.grid[3].picks[0].overall, 13, '3RR R4 Col 1 is Pick #13');

// 4. On-the-clock pick detection
eq(gridRes.grid[0].picks[0].isOnClock, true, 'Pick #1 is on the clock');
eq(gridRes.grid[0].picks[1].isOnClock, false, 'Pick #2 is not on the clock');

// 5. Drafted players in grid
const gridWithPicks = L.generateDraftBoardGrid({
  teams: 4,
  rounds: 3,
  mode: 'snake',
  log: [
    { overall: 1, playerId: 101, mine: false },
    { overall: 2, playerId: 102, mine: true },
    { overall: 3, customName: 'Caleb Williams', customPos: 'QB', customTeam: 'CHI', customBye: 7 }
  ],
  keepers: [],
  tradedPicks: {},
  teamNames: ['Alpha', 'Bravo', 'Charlie', 'Delta'],
  mySlot: 2,
  currentPickNum: 4,
  playersLookup: byIdLookup
});

const r1p1 = gridWithPicks.grid[0].picks[0];
eq(r1p1.isDrafted, true, 'Pick 1 is drafted');
eq(r1p1.isOnClock, false, 'Pick 1 is not on the clock');
eq(r1p1.player.name, 'Josh Allen', 'Pick 1 player is Josh Allen');
eq(r1p1.player.pos, 'QB', 'Pick 1 pos is QB');
eq(r1p1.player.team, 'BUF', 'Pick 1 team is BUF');

const r1p2 = gridWithPicks.grid[0].picks[1];
eq(r1p2.isDrafted, true, 'Pick 2 is drafted');
eq(r1p2.isMe, true, 'Pick 2 is my pick');
eq(r1p2.player.name, 'Ja\'Marr Chase', 'Pick 2 player is Ja\'Marr Chase');

const r1p3 = gridWithPicks.grid[0].picks[2];
eq(r1p3.isDrafted, true, 'Pick 3 is drafted unlisted player');
eq(r1p3.player.name, 'Caleb Williams', 'Pick 3 name is Caleb Williams');
eq(r1p3.player.pos, 'QB', 'Pick 3 pos is QB');
eq(r1p3.player.team, 'CHI', 'Pick 3 team is CHI');

const r1p4 = gridWithPicks.grid[0].picks[3];
eq(r1p4.isDrafted, false, 'Pick 4 is not drafted');
eq(r1p4.isOnClock, true, 'Pick 4 is on the clock');

// 6. Keepers: Drafted keepers and Pending Future Keepers
const gridWithKeepers = L.generateDraftBoardGrid({
  teams: 4,
  rounds: 3,
  mode: 'snake',
  log: [
    { overall: 1, playerId: 101 }
  ],
  keepers: [
    { slot: 3, round: 2, playerId: 104 } // Slot 3, Round 2 in 4-team snake = Pick #6
  ],
  tradedPicks: {},
  mySlot: 1,
  currentPickNum: 2,
  playersLookup: byIdLookup
});

// Slot 3 Round 2 is Pick #6
const r2col3 = gridWithKeepers.grid[1].picks[2];
eq(r2col3.overall, 6, 'Slot 3 R2 is Pick 6');
eq(r2col3.isKeeper, true, 'Pick 6 is marked as keeper');
eq(r2col3.isPendingKeeper, true, 'Pick 6 is pending keeper');
eq(r2col3.player.name, 'Brock Bowers', 'Pending keeper resolves Brock Bowers');
eq(r2col3.player.pos, 'TE', 'Pending keeper pos is TE');

// 7. Traded Picks in Grid
const gridWithTrades = L.generateDraftBoardGrid({
  teams: 4,
  rounds: 3,
  mode: 'snake',
  log: [],
  keepers: [],
  tradedPicks: { 7: 4 }, // Pick 7 (Slot 2 R2) traded to Slot 4
  teamNames: ['Alpha', 'Bravo', 'Charlie', 'Delta'],
  mySlot: 4,
  currentPickNum: 1
});

const r2col2 = gridWithTrades.grid[1].picks[1]; // Slot 2, R2 = Pick 7
eq(r2col2.overall, 7, 'Slot 2 R2 is Pick 7');
eq(r2col2.originalSlot, 2, 'Pick 7 original slot is 2');
eq(r2col2.effectiveSlot, 4, 'Pick 7 effective slot is 4');
eq(r2col2.isTraded, true, 'Pick 7 is traded');
// 8. Large 12-team 25-round league & draft completion
const largeGrid = L.generateDraftBoardGrid({
  teams: 12,
  rounds: 25,
  mode: '3rr',
  log: Array.from({ length: 300 }, (_, i) => ({ overall: i + 1, playerId: 101 })),
  keepers: [],
  tradedPicks: {},
  mySlot: 1,
  currentPickNum: 301, // Draft completed
  playersLookup: byIdLookup
});

eq(largeGrid.teams, 12, '12 teams handled');
eq(largeGrid.rounds, 25, '25 rounds handled');
eq(largeGrid.grid.length, 25, 'Grid contains 25 round rows');
eq(largeGrid.grid[0].picks.length, 12, 'Each round row contains 12 pick columns');
eq(largeGrid.grid[24].picks[0].overall, 300, 'Reverse round 25 Slot 1 is pick #300');
eq(largeGrid.grid[24].picks[11].overall, 289, 'Reverse round 25 Slot 12 is pick #289');
eq(largeGrid.grid[24].picks[0].isOnClock, false, 'No pick on clock when draft is complete');

// 9. Null / empty fallback robustness
const fallbackGrid = L.generateDraftBoardGrid(null);
assert(fallbackGrid != null, 'Handles null options safely');
eq(fallbackGrid.teams, 12, 'Default 12 teams fallback');
eq(fallbackGrid.rounds, 20, 'Default 20 rounds fallback');
assert(Array.isArray(fallbackGrid.grid), 'Default grid array created');

const success = finishSuite('Draft Board Grid Matrix & Pick Resolution');
if (!success) {
  process.exit(1);
}
