// Test suite for Live Draft Strategy Radar and Opponent Threat Detection
import { createRequire } from 'module';
import { eq, assert, printSuiteHeader, finishSuite, resetFailures } from './test-helper.mjs';

const require = createRequire(import.meta.url);
const L = require('../draft-logic.js');

resetFailures();
printSuiteHeader('Live Draft Strategy Radar & Opponent Threat Analysis');

const mockPlayers = {
  101: { id: 101, name: 'Josh Allen', pos: 'QB', team: 'BUF', bye: 12, adp: 22, rank: 15 },
  102: { id: 102, name: 'Ja\'Marr Chase', pos: 'WR', team: 'CIN', bye: 12, adp: 3, rank: 3 },
  103: { id: 103, name: 'Bijan Robinson', pos: 'RB', team: 'ATL', bye: 12, adp: 5, rank: 4 },
  104: { id: 104, name: 'Brock Bowers', pos: 'TE', team: 'LV', bye: 10, adp: 28, rank: 25 },
  105: { id: 105, name: 'Justin Tucker', pos: 'K', team: 'BAL', bye: 14, adp: 140, rank: 150 },
  106: { id: 106, name: 'San Francisco 49ers', pos: 'DST', team: 'SF', bye: 9, adp: 130, rank: 145 },
  107: { id: 107, name: 'CeeDee Lamb', pos: 'WR', team: 'DAL', bye: 7, adp: 2, rank: 2 },
  108: { id: 108, name: 'Breece Hall', pos: 'RB', team: 'NYJ', bye: 12, adp: 6, rank: 6 }
};

const byIdLookup = id => mockPlayers[id] || null;

const availablePool = [
  { id: 201, name: 'Lamar Jackson', pos: 'QB', team: 'BAL', bye: 14, adp: 25, rank: 20 },
  { id: 202, name: 'Justin Jefferson', pos: 'WR', team: 'MIN', bye: 6, adp: 4, rank: 5 },
  { id: 203, name: 'Jahmyr Gibbs', pos: 'RB', team: 'DET', bye: 5, adp: 8, rank: 8 },
  { id: 204, name: 'George Kittle', pos: 'TE', team: 'SF', bye: 9, adp: 45, rank: 40 }
];

// Scenario: 4 teams, 3 rounds, Snake draft.
// My slot is 4.
// Current pick is #1.
// User's next pick is pick #4 (Round 1 Slot 4) and pick #5 (Round 2 Slot 4).
const stratRes = L.analyzeLiveDraftStrategy({
  teams: 4,
  rounds: 3,
  mode: 'snake',
  log: [],
  keepers: [],
  tradedPicks: {},
  teamNames: ['Alpha', 'Bravo', 'Charlie', 'Delta'],
  mySlot: 4,
  currentPickNum: 1,
  playersLookup: byIdLookup,
  rosterSlots: { qb: 1, rb: 2, wr: 2, te: 1, flex: 1, superflex: 0, k: 0, dst: 0, bench: 3 },
  availablePlayers: availablePool
});

assert(stratRes != null, 'Strategy result generated');
eq(stratRes.isComplete, false, 'Draft is not complete');
eq(stratRes.mySlot, 4, 'My slot is 4');
eq(stratRes.nextUserPick, 4, 'Next user pick is #4');
eq(stratRes.picksUntilUserTurn, 3, '3 picks until user turn (picks 1, 2, 3)');
eq(stratRes.isOnClock, false, 'User is not yet on clock');

// Check opponent threats for picks 1, 2, 3
eq(stratRes.opponentThreats.length, 3, '3 opponent picks in threat window');
eq(stratRes.opponentThreats[0].overall, 1, 'First opponent pick is #1 (Alpha)');
eq(stratRes.opponentThreats[0].teamName, 'Alpha', 'Opponent team name is Alpha');
eq(stratRes.opponentThreats[1].overall, 2, 'Second opponent pick is #2 (Bravo)');
eq(stratRes.opponentThreats[2].overall, 3, 'Third opponent pick is #3 (Charlie)');

// Check opponent unfilled needs (all empty at start of draft)
assert(stratRes.opponentThreats[0].urgentNeeds.some(n => n.pos === 'QB'), 'Alpha needs QB');
assert(stratRes.opponentThreats[0].urgentNeeds.some(n => n.pos === 'RB'), 'Alpha needs RB');

// Check user needs (all empty at start of draft)
const qbNeed = stratRes.userNeeds.find(n => n.pos === 'QB');
assert(qbNeed != null, 'QB need tracked');
eq(qbNeed.urgency, 'CRITICAL', '0/1 QB is CRITICAL need');
eq(qbNeed.filled, 0, '0 QBs filled');

// Check targets by position (Top 5 BPA per position)
assert(stratRes.targetsByPosition != null, 'targetsByPosition is defined');
assert(Array.isArray(stratRes.targetsByPosition.QB), 'QB targets is an array');
eq(stratRes.targetsByPosition.QB[0].name, 'Lamar Jackson', 'Top QB target is Lamar Jackson');
eq(stratRes.targetsByPosition.WR[0].name, 'Justin Jefferson', 'Top WR target is Justin Jefferson');
eq(stratRes.targetsByPosition.RB[0].name, 'Jahmyr Gibbs', 'Top RB target is Jahmyr Gibbs');
eq(stratRes.targetsByPosition.TE[0].name, 'George Kittle', 'Top TE target is George Kittle');

// Scenario 2: User is on the clock (Pick 4)
const onClockRes = L.analyzeLiveDraftStrategy({
  teams: 4,
  rounds: 3,
  mode: 'snake',
  log: [
    { overall: 1, playerId: 101 }, // Alpha picked Josh Allen (QB)
    { overall: 2, playerId: 103 }, // Bravo picked Bijan Robinson (RB)
    { overall: 3, playerId: 102 }  // Charlie picked Ja'Marr Chase (WR)
  ],
  keepers: [],
  tradedPicks: {},
  teamNames: ['Alpha', 'Bravo', 'Charlie', 'Delta'],
  mySlot: 4,
  currentPickNum: 4,
  playersLookup: byIdLookup,
  rosterSlots: { qb: 1, rb: 2, wr: 2, te: 1, flex: 1, superflex: 0, k: 0, dst: 0, bench: 3 },
  availablePlayers: availablePool
});

eq(onClockRes.isOnClock, true, 'User is on the clock at Pick 4');
eq(onClockRes.picksUntilUserTurn, 0, '0 picks until turn');
eq(onClockRes.opponentThreats.length, 0, '0 opponent picks before current pick');

// Scenario 3: Draft completed
const completeRes = L.analyzeLiveDraftStrategy({
  teams: 4,
  rounds: 2,
  mode: 'snake',
  log: [
    { overall: 1, playerId: 101 },
    { overall: 2, playerId: 102 },
    { overall: 3, playerId: 103 },
    { overall: 4, playerId: 104 },
    { overall: 5, playerId: 105 },
    { overall: 6, playerId: 106 },
    { overall: 7, playerId: 107 },
    { overall: 8, playerId: 108 }
  ],
  keepers: [],
  tradedPicks: {},
  mySlot: 1,
  currentPickNum: 9,
  playersLookup: byIdLookup
});

eq(completeRes.isComplete, true, 'Draft is complete');

const success = finishSuite('Live Draft Strategy Radar & Opponent Threat Analysis');
if (!success) {
  process.exit(1);
}

