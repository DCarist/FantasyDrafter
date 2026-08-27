// Test suite for Draft Target Queue Management
import { createRequire } from 'module';
import { eq, assert, printSuiteHeader, finishSuite, resetFailures } from './test-helper.mjs';

const require = createRequire(import.meta.url);
const L = require('../draft-logic.js');

resetFailures();
printSuiteHeader('Draft Queue & Target Shortlist Management');

// 1. isQueued
eq(L.isQueued([], 10), false, 'Empty queue returns isQueued=false');
eq(L.isQueued([5, 10, 15], 10), true, 'isQueued=true when player in queue');
eq(L.isQueued([5, 10, 15], 20), false, 'isQueued=false when player not in queue');
eq(L.isQueued(null, 10), false, 'Null queue returns isQueued=false');
eq(L.isQueued([5, 10], null), false, 'Null playerId returns isQueued=false');

// 2. addToQueue (idempotent addition to end of list)
const q1 = L.addToQueue([], 10);
eq(q1, [10], 'Adds player to empty queue');

const q2 = L.addToQueue(q1, 20);
eq(q2, [10, 20], 'Appends second player to queue');

const q3 = L.addToQueue(q2, 10);
eq(q3, [10, 20], 'Adding existing player does not duplicate in queue');

eq(L.addToQueue(null, 5), [5], 'Handles null queue');
eq(L.addToQueue([5, 10], null), [5, 10], 'Handles null playerId');

// 3. removeFromQueue
const q4 = L.removeFromQueue([10, 20, 30], 20);
eq(q4, [10, 30], 'Removes middle player from queue');

const q5 = L.removeFromQueue(q4, 99);
eq(q5, [10, 30], 'Removing non-existent player leaves queue unchanged');

// 4. reorderQueue (drag-and-drop simulation)
const initialQueue = [101, 102, 103, 104, 105];

// Move 104 (index 3) to top (index 0)
const reordered1 = L.reorderQueue(initialQueue, 3, 0);
eq(reordered1, [104, 101, 102, 103, 105], 'Moves player from index 3 to top');

// Move 101 (index 1) to bottom (index 4)
const reordered2 = L.reorderQueue(reordered1, 1, 4);
eq(reordered2, [104, 102, 103, 105, 101], 'Moves player from index 1 to bottom');

// Out of bounds safety
eq(L.reorderQueue(initialQueue, -1, 2), initialQueue, 'Invalid fromIdx leaves queue unchanged');
eq(L.reorderQueue(initialQueue, 0, 10), initialQueue, 'Invalid toIdx leaves queue unchanged');
eq(L.reorderQueue(null, 0, 1), [], 'Null queue returns empty array');

// 5. cleanQueue (auto-removal on draft pick)
const activeQueue = [1, 5, 8, 12, 15];
const cleaned1 = L.cleanQueue(activeQueue, [8]);
eq(cleaned1, [1, 5, 12, 15], 'cleanQueue removes drafted player #8');

const cleaned2 = L.cleanQueue(activeQueue, new Set([5, 12]));
eq(cleaned2, [1, 8, 15], 'cleanQueue works with Set container');

// 6. getAvailableQueue
const mockPlayers = {
  1: { id: 1, name: 'Josh Allen', pos: 'QB' },
  8: { id: 8, name: 'Bijan Robinson', pos: 'RB' },
  15: { id: 15, name: 'CeeDee Lamb', pos: 'WR' }
};

const avail = L.getAvailableQueue([1, 8, 15], [8], mockPlayers);
eq(avail.map(p => p.name), ['Josh Allen', 'CeeDee Lamb'], 'getAvailableQueue returns player objects for untaken items');

const success = finishSuite('Draft Queue & Target Shortlist Management');
if (!success) {
  process.exit(1);
}

