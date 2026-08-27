// Test suite for Pick Ownership, Grid Generation, and Pick Trading
import { createRequire } from 'module';
import { eq, assert, printSuiteHeader, finishSuite, resetFailures } from './test-helper.mjs';

const require = createRequire(import.meta.url);
const L = require('../draft-logic.js');

resetFailures();
printSuiteHeader('Draft Pick Trading & Ownership Grid');

// 1. generateDraftPicks without trades
const sampleTeams = ['Team 1', 'Team 2', 'Team 3', 'Team 4'];
const standardGrid = L.generateDraftPicks(4, 3, '3rr', {}, sampleTeams, 2);

eq(standardGrid.length, 12, '12 picks generated for 4 teams x 3 rounds');
eq(standardGrid[0], {
  overall: 1,
  round: 1,
  originalSlot: 1,
  currentSlot: 1,
  originalTeam: 'Team 1',
  currentTeam: 'Team 1',
  isTraded: false,
  isMe: false
}, 'Pick 1.01 natural ownership');

eq(standardGrid[1], {
  overall: 2,
  round: 1,
  originalSlot: 2,
  currentSlot: 2,
  originalTeam: 'Team 2',
  currentTeam: 'Team 2',
  isTraded: false,
  isMe: true
}, 'Pick 1.02 natural ownership (isMe=true for Slot 2)');

// Round 2 (reversal): Slot 4 -> Slot 3 -> Slot 2 -> Slot 1
// Pick 5 is Slot 4, Pick 6 is Slot 3, Pick 7 is Slot 2 (Ken), Pick 8 is Slot 1
eq(standardGrid[6].overall, 7, 'Pick 7 is in grid');
eq(standardGrid[6].originalSlot, 2, 'Pick 7 originally belongs to Slot 2');
eq(standardGrid[6].currentSlot, 2, 'Pick 7 currently belongs to Slot 2');
eq(standardGrid[6].isMe, true, 'Pick 7 is mine');

// 2. applyPickTrade
// Trade Pick 7 (originally Slot 2) to Slot 4
const tradedMap1 = L.applyPickTrade({}, 7, 4, 4, '3rr');
eq(tradedMap1, { 7: 4 }, 'applyPickTrade maps overall 7 to slot 4');

// Trade Pick 1 (originally Slot 1) to Slot 2 (me)
const tradedMap2 = L.applyPickTrade(tradedMap1, 1, 2, 4, '3rr');
eq(tradedMap2, { 7: 4, 1: 2 }, 'applyPickTrade adds trade for pick 1');

// Trade Pick 1 back to original Slot 1 -> should remove trade entry
const tradedMap3 = L.applyPickTrade(tradedMap2, 1, 1, 4, '3rr');
eq(tradedMap3, { 7: 4 }, 'Reverting pick to original owner removes trade');

// 3. generateDraftPicks with active trades
const tradedGrid = L.generateDraftPicks(4, 3, '3rr', tradedMap2, sampleTeams, 2);

// Pick 1 is now traded to Slot 2 (isMe=true)
eq(tradedGrid[0].currentSlot, 2, 'Pick 1 currentSlot is 2');
eq(tradedGrid[0].originalSlot, 1, 'Pick 1 originalSlot is 1');
eq(tradedGrid[0].currentTeam, 'Team 2', 'Pick 1 currentTeam is Team 2');
eq(tradedGrid[0].isTraded, true, 'Pick 1 is marked as traded');
eq(tradedGrid[0].isMe, true, 'Pick 1 is now marked as mine');

// Pick 7 is traded to Slot 4
eq(tradedGrid[6].currentSlot, 4, 'Pick 7 currentSlot is 4');
eq(tradedGrid[6].originalSlot, 2, 'Pick 7 originalSlot is 2');
eq(tradedGrid[6].currentTeam, 'Team 4', 'Pick 7 currentTeam is Team 4');
eq(tradedGrid[6].isTraded, true, 'Pick 7 is marked as traded');
eq(tradedGrid[6].isMe, false, 'Pick 7 is no longer mine');

// 4. getPicksForTeam
const myPicks = L.getPicksForTeam(2, tradedGrid);
eq(myPicks.map(p => p.overall), [1, 2, 11], 'My picks include acquired Pick 1, natural Pick 2, and 3RR Pick 11 (Pick 7 traded away)');

const slot4Picks = L.getPicksForTeam(4, tradedGrid);
eq(slot4Picks.map(p => p.overall), [4, 5, 7, 9], 'Slot 4 picks include natural Picks 4, 5, 9 plus acquired Pick 7');

// 5. picksForSlot with tradedPicks map
const slot2EffectivePicks = L.picksForSlot(2, 4, 3, '3rr', tradedMap2);
eq(slot2EffectivePicks, [1, 2, 11], 'picksForSlot computes correct picks with tradedPicks map');

const slot4EffectivePicks = L.picksForSlot(4, 4, 3, '3rr', tradedMap2);
eq(slot4EffectivePicks, [4, 5, 7, 9], 'picksForSlot computes correct picks for slot 4 with tradedPicks map');

const success = finishSuite('Draft Pick Trading & Ownership Grid');
if (!success) {
  process.exit(1);
}

