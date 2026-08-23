// Test suite for Unlisted Picks, Custom Positions, and Team Roster Statistics
import { createRequire } from 'module';
import { eq, assert, printSuiteHeader, finishSuite, resetFailures } from './test-helper.mjs';

const require = createRequire(import.meta.url);
const L = require('../draft-logic.js');

resetFailures();
printSuiteHeader('Unlisted Picks & Custom Player Resolution');

// 1. Resolving standard listed players
const mockPlayers = [
  { id: 0, name: 'Josh Allen', pos: 'QB', bye: 7 },
  { id: 1, name: 'Bijan Robinson', pos: 'RB', bye: 11 }
];

const listedPick = { overall: 1, playerId: 0, mine: true };
const resolvedListed = L.resolvePickPlayer(listedPick, mockPlayers);
eq(resolvedListed.name, 'Josh Allen', 'Resolves listed player name');
eq(resolvedListed.pos, 'QB', 'Resolves listed player position');
eq(resolvedListed.bye, 7, 'Resolves listed player bye');
eq(resolvedListed.isUnlisted, undefined, 'Listed player is not marked unlisted');

// 2. Resolving unlisted player with custom name & position
const customPick = {
  overall: 2,
  playerId: null,
  customName: 'Ray-Ray McCloud',
  customPos: 'WR',
  customBye: 9,
  mine: false
};
const resolvedCustom = L.resolvePickPlayer(customPick, mockPlayers);
eq(resolvedCustom.name, 'Ray-Ray McCloud', 'Resolves custom name for unlisted pick');
eq(resolvedCustom.pos, 'WR', 'Resolves custom position for unlisted pick');
eq(resolvedCustom.bye, 9, 'Resolves custom bye for unlisted pick');
eq(resolvedCustom.isUnlisted, true, 'Unlisted pick has isUnlisted=true');

// 3. Resolving unlisted player with default generated name
const fallbackPick = {
  overall: 3,
  playerId: null,
  customPos: 'TE',
  mine: false
};
const resolvedFallback = L.resolvePickPlayer(fallbackPick, mockPlayers);
eq(resolvedFallback.name, 'Unlisted TE', 'Generates clean fallback name based on position');
eq(resolvedFallback.pos, 'TE', 'Preserves position on fallback');

// 4. Roster counting simulation with mixed listed and unlisted picks
const draftLog = [
  { overall: 1, playerId: 0, mine: true },                                    // Slot 1 (Josh Allen, QB)
  { overall: 2, playerId: 1, mine: false },                                   // Slot 2 (Bijan Robinson, RB)
  { overall: 3, playerId: null, customName: 'Carnell Tate', customPos: 'WR' }, // Slot 3 (Unlisted WR)
  { overall: 4, playerId: null, customPos: 'QB' },                            // Slot 4 (Unlisted QB)
  { overall: 5, playerId: null, customPos: 'TE' },                            // Slot 5 (Unlisted TE)
];

// Verify slot assignments and team pick counts in a 10-team league
const slot3Picks = draftLog.filter(e => L.slotForOverall(e.overall, 10, '3rr').slot === 3);
eq(slot3Picks.length, 1, 'Slot 3 has 1 total pick');
const slot3Player = L.resolvePickPlayer(slot3Picks[0], mockPlayers);
eq(slot3Player.name, 'Carnell Tate', 'Slot 3 drafted player is Carnell Tate');
eq(slot3Player.pos, 'WR', 'Slot 3 drafted position is WR');

const success = finishSuite('Unlisted Picks & Custom Player Resolution');
if (!success) {
  process.exit(1);
}
