// Test suite for Bye Week Conflict Detection and Positional Alignment Highlighting
import { createRequire } from 'module';
import { eq, assert, printSuiteHeader, finishSuite, resetFailures } from './test-helper.mjs';

const require = createRequire(import.meta.url);
const L = require('../draft-logic.js');

resetFailures();
printSuiteHeader('Bye Week Conflict Detection & Alignment');

// --- Mock Data ---
const mockPlayers = [
  { id: 0, name: 'Josh Allen', pos: 'QB', bye: 7 },
  { id: 1, name: 'Lamar Jackson', pos: 'QB', bye: 7 },
  { id: 2, name: 'Patrick Mahomes', pos: 'QB', bye: 6 },
  { id: 3, name: 'Bijan Robinson', pos: 'RB', bye: 11 },
  { id: 4, name: 'Breece Hall', pos: 'RB', bye: 12 },
  { id: 5, name: 'Justin Jefferson', pos: 'WR', bye: 10 },
  { id: 6, name: 'CeeDee Lamb', pos: 'WR', bye: 7 },
  { id: 7, name: 'Brock Bowers', pos: 'TE', bye: 6 },
  { id: 8, name: 'Free Agent Player', pos: 'WR', bye: null },
];

// --- 1. Edge cases: Empty roster or null candidate/bye ---
eq(L.getByeClashStatus(null, []), { type: 'none', samePos: [], otherPos: [] }, 'Null candidate returns type=none');
eq(L.getByeClashStatus({ pos: 'QB', bye: null }, [{ name: 'Josh Allen', pos: 'QB', bye: 7 }]), { type: 'none', samePos: [], otherPos: [] }, 'Candidate with null bye returns type=none');
eq(L.getByeClashStatus({ pos: 'QB', bye: 7 }, []), { type: 'none', samePos: [], otherPos: [] }, 'Empty roster returns type=none');

// --- 2. Direct same-position bye clash ---
const rosterWithAllen = [
  { id: 0, name: 'Josh Allen', pos: 'QB', bye: 7 }
];

const lamarClash = L.getByeClashStatus(mockPlayers[1], rosterWithAllen);
eq(lamarClash.type, 'same-pos', 'Lamar Jackson (QB, Bye 7) has same-pos clash with Josh Allen');
eq(lamarClash.samePos.length, 1, 'One same-position player found');
eq(lamarClash.samePos[0].name, 'Josh Allen', 'Identifies Josh Allen as the conflicting QB');
eq(lamarClash.otherPos.length, 0, 'No other-position players involved');

// --- 3. Cross-position bye alignment (less emphasis) ---
const ceedeClash = L.getByeClashStatus(mockPlayers[6], rosterWithAllen); // CeeDee Lamb is WR, Bye 7
eq(ceedeClash.type, 'other-pos', 'CeeDee Lamb (WR, Bye 7) has other-pos clash with Josh Allen (QB, Bye 7)');
eq(ceedeClash.samePos.length, 0, 'No same-position clash for WR CeeDee Lamb');
eq(ceedeClash.otherPos.length, 1, 'One other-position player found');
eq(ceedeClash.otherPos[0].name, 'Josh Allen', 'Identifies Josh Allen as the cross-position clash');

// --- 4. No clash with different bye weeks ---
const mahomesCheck = L.getByeClashStatus(mockPlayers[2], rosterWithAllen); // Mahomes is QB, Bye 6
eq(mahomesCheck.type, 'none', 'Patrick Mahomes (Bye 6) has no clash with Allen (Bye 7)');

// --- 5. Candidate already on roster (self-match exclusion) ---
const allenSelfCheck = L.getByeClashStatus(mockPlayers[0], rosterWithAllen);
eq(allenSelfCheck.type, 'none', 'Player does not clash with themselves if already on roster');

// --- 6. Complex multi-player roster with mixed same-pos and other-pos clashes ---
const multiRoster = [
  { id: 0, name: 'Josh Allen', pos: 'QB', bye: 7 },
  { id: 3, name: 'Bijan Robinson', pos: 'RB', bye: 11 },
  { id: 5, name: 'Justin Jefferson', pos: 'WR', bye: 10 },
  { id: 6, name: 'CeeDee Lamb', pos: 'WR', bye: 7 },
  { id: 7, name: 'Brock Bowers', pos: 'TE', bye: 6 },
  { id: null, name: 'Unlisted Receiver', pos: 'WR', bye: 10, isUnlisted: true }
];

// Target WR on Week 7: My roster has CeeDee Lamb (WR, Bye 7) AND Josh Allen (QB, Bye 7)
const candidateWR7 = { id: 99, name: 'Amon-Ra St. Brown', pos: 'WR', bye: 7 };
const wr7Status = L.getByeClashStatus(candidateWR7, multiRoster);
eq(wr7Status.type, 'same-pos', 'Candidate WR on Bye 7 prioritizes same-pos clash');
eq(wr7Status.samePos.map(p => p.name), ['CeeDee Lamb'], 'samePos list contains CeeDee Lamb');
eq(wr7Status.otherPos.map(p => p.name), ['Josh Allen'], 'otherPos list contains Josh Allen');

// Target QB on Week 10: My roster has Justin Jefferson (WR, Bye 10) & Unlisted Receiver (WR, Bye 10), but NO QB
const candidateQB10 = { id: 100, name: 'C.J. Stroud', pos: 'QB', bye: 10 };
const qb10Status = L.getByeClashStatus(candidateQB10, multiRoster);
eq(qb10Status.type, 'other-pos', 'Candidate QB on Bye 10 reports other-pos clash');
eq(qb10Status.samePos.length, 0, 'No same-pos clash for QB');
eq(qb10Status.otherPos.length, 2, 'Two other-pos receivers on Bye 10');
eq(qb10Status.otherPos.map(p => p.name), ['Justin Jefferson', 'Unlisted Receiver'], 'Lists both cross-position receivers');

// --- 7. Testing getMyRosterPlayers helper ---
const draftLog = [
  { overall: 1, playerId: 0, mine: false }, // Slot 1
  { overall: 2, playerId: 1, mine: true },  // Slot 2 (My Slot) -> Lamar Jackson (QB, Bye 7)
  { overall: 3, playerId: 5, mine: false }, // Slot 3
  { overall: 7, playerId: 3, mine: true },  // Slot 2 (My Slot) -> Bijan Robinson (RB, Bye 11)
  { overall: 11, playerId: null, customName: 'Ray-Ray McCloud', customPos: 'WR', customBye: 9, mine: true } // Slot 2 -> Custom WR Bye 9
];

const myRoster = L.getMyRosterPlayers(draftLog, mockPlayers, 2, 4, '3rr');
eq(myRoster.length, 3, 'getMyRosterPlayers extracts exactly 3 picks for slot 2');
eq(myRoster[0].name, 'Lamar Jackson', 'First pick is Lamar Jackson');
eq(myRoster[0].pos, 'QB', 'Lamar is QB');
eq(myRoster[0].bye, 7, 'Lamar bye is 7');
eq(myRoster[1].name, 'Bijan Robinson', 'Second pick is Bijan Robinson');
eq(myRoster[2].name, 'Ray-Ray McCloud', 'Third pick is custom unlisted player');
eq(myRoster[2].pos, 'WR', 'Custom player pos is WR');
eq(myRoster[2].bye, 9, 'Custom player bye is 9');

// Test clash against resolved roster
const testCandidate = { id: 200, name: 'Terry McLaurin', pos: 'WR', bye: 9 };
const testClash = L.getByeClashStatus(testCandidate, myRoster);
eq(testClash.type, 'same-pos', 'Terry McLaurin (WR, Bye 9) has same-pos clash with custom Ray-Ray McCloud (WR, Bye 9)');

const success = finishSuite('Bye Week Conflict Detection & Alignment');
if (!success) {
  process.exit(1);
}

