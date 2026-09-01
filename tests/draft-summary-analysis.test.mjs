// Test suite for Post-Draft Summary, Positional Value Rankings, and Superlatives
import { createRequire } from 'module';
import { eq, assert, printSuiteHeader, finishSuite, resetFailures } from './test-helper.mjs';

const require = createRequire(import.meta.url);
const L = require('../draft-logic.js');

resetFailures();
printSuiteHeader('Post-Draft Summary, Positional Value & League Rankings');

const mockPlayers = {
  101: { id: 101, name: 'Josh Allen', pos: 'QB', team: 'BUF', bye: 12, adp: 22, score: 95 },
  102: { id: 102, name: 'Ja\'Marr Chase', pos: 'WR', team: 'CIN', bye: 12, adp: 3, score: 98 },
  103: { id: 103, name: 'Bijan Robinson', pos: 'RB', team: 'ATL', bye: 12, adp: 5, score: 96 },
  104: { id: 104, name: 'Brock Bowers', pos: 'TE', team: 'LV', bye: 10, adp: 28, score: 88 },
  105: { id: 105, name: 'Justin Tucker', pos: 'K', team: 'BAL', bye: 14, adp: 140, score: 60 },
  106: { id: 106, name: 'San Francisco 49ers', pos: 'DST', team: 'SF', bye: 9, adp: 130, score: 65 },
  107: { id: 107, name: 'CeeDee Lamb', pos: 'WR', team: 'DAL', bye: 7, adp: 2, score: 99 },
  108: { id: 108, name: 'Breece Hall', pos: 'RB', team: 'NYJ', bye: 12, adp: 6, score: 94 }
};

const byIdLookup = id => mockPlayers[id] || null;

// Scenario: 4 teams, 2 rounds (8 picks total)
const summary = L.generateDraftSummaryAnalysis({
  teams: 4,
  rounds: 2,
  mode: 'snake',
  log: [
    { overall: 1, playerId: 101 }, // Team 1: Josh Allen (QB, 95 pts, adp 22 vs pick 1 = reach -21)
    { overall: 2, playerId: 107 }, // Team 2: CeeDee Lamb (WR, 99 pts, adp 2 vs pick 2 = 0)
    { overall: 3, playerId: 102 }, // Team 3: Ja'Marr Chase (WR, 98 pts, adp 3 vs pick 3 = 0)
    { overall: 4, playerId: 103 }, // Team 4: Bijan Robinson (RB, 96 pts, adp 5 vs pick 4 = -1)
    { overall: 5, playerId: 104 }, // Team 4 (R2 slot 4): Brock Bowers (TE, 88 pts, adp 28 vs pick 5 = steal +23)
    { overall: 6, playerId: 108 }, // Team 3 (R2 slot 3): Breece Hall (RB, 94 pts, adp 6 vs pick 6 = 0)
    { overall: 7, playerId: 105 }, // Team 2 (R2 slot 2): Justin Tucker (K, 60 pts, adp 140 vs pick 7 = steal +133)
    { overall: 8, playerId: 106 }  // Team 1 (R2 slot 1): 49ers (DST, 65 pts, adp 130 vs pick 8 = steal +122)
  ],
  keepers: [],
  tradedPicks: {},
  teamNames: ['Alpha', 'Bravo', 'Charlie', 'Delta'],
  mySlot: 1,
  playersLookup: byIdLookup,
  rosterSlots: { qb: 1, rb: 1, wr: 1, te: 1, flex: 0, superflex: 0, k: 1, dst: 1, bench: 0 }
});

assert(summary != null, 'Summary analysis generated');
eq(summary.isComplete, true, 'Draft is complete');
eq(summary.teamsCount, 4, '4 teams evaluated');
eq(summary.teams.length, 4, '4 team summaries generated');

// Team 1 has Josh Allen (QB 95) + 49ers (DST 65) = Total 160
// Team 2 has CeeDee Lamb (WR 99) + Justin Tucker (K 60) = Total 159
// Team 3 has Ja'Marr Chase (WR 98) + Breece Hall (RB 94) = Total 192
// Team 4 has Bijan Robinson (RB 96) + Brock Bowers (TE 88) = Total 184

// Charlie (Team 3) should be ranked #1 with 192 pts
const tRank1 = summary.teams[0];
eq(tRank1.teamName, 'Charlie', 'Charlie has highest total value score (192)');
eq(tRank1.rank, 1, 'Charlie is rank #1');
eq(tRank1.totalScore, 192, 'Charlie total score is 192');

// Check positional rankings
const teamAlpha = summary.teams.find(t => t.teamName === 'Alpha');
assert(teamAlpha != null, 'Alpha found in summary');
eq(teamAlpha.qbRank, 1, 'Alpha is #1 in QB score');
eq(teamAlpha.qbScore, 95, 'Alpha QB score is 95');

const teamDelta = summary.teams.find(t => t.teamName === 'Delta');
eq(teamDelta.teRank, 1, 'Delta is #1 in TE score');
eq(teamDelta.teScore, 88, 'Delta TE score is 88');

// Check superlatives
assert(summary.superlatives.champion != null, 'Champion superlative generated');
eq(summary.superlatives.champion.teamName, 'Charlie', 'Champion is Charlie');

assert(summary.superlatives.bestQb != null, 'Best QB superlative generated');
eq(summary.superlatives.bestQb.teamName, 'Alpha', 'Best QB room is Alpha');

assert(summary.superlatives.bestTe != null, 'Best TE superlative generated');
eq(summary.superlatives.bestTe.teamName, 'Delta', 'Best TE room is Delta');

const success = finishSuite('Post-Draft Summary, Positional Value & League Rankings');
if (!success) {
  process.exit(1);
}
