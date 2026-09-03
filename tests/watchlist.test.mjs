// Test suite for Draft Watchlist management and auto-removal
import { createRequire } from 'module';
import { eq, assert, printSuiteHeader, finishSuite, resetFailures } from './test-helper.mjs';

const require = createRequire(import.meta.url);
const L = require('../draft-logic.js');

resetFailures();
printSuiteHeader('Draft Watchlist Management');

// --- 1. isWatched tests ---
eq(L.isWatched([], 10), false, 'Empty watchlist returns isWatched=false');
eq(L.isWatched([5, 10, 15], 10), true, 'isWatched=true when player in watchlist');
eq(L.isWatched([5, 10, 15], 20), false, 'isWatched=false when player not in watchlist');
eq(L.isWatched(null, 10), false, 'Null watchlist returns isWatched=false');
eq(L.isWatched([5, 10], null), false, 'Null playerId returns isWatched=false');

// --- 2. toggleWatchlist tests ---
const list1 = L.toggleWatchlist([], 10);
eq(list1, [10], 'Toggling unlisted player into empty list adds it');

const list2 = L.toggleWatchlist(list1, 20);
eq(list2, [10, 20], 'Toggling another player adds to list');

const list3 = L.toggleWatchlist(list2, 10);
eq(list3, [20], 'Toggling existing player removes it from list');

const list4 = L.toggleWatchlist(list3, 20);
eq(list4, [], 'Toggling last player empties list');

// Edge cases
eq(L.toggleWatchlist(null, 5), [5], 'Toggling with null list initializes and adds player');
eq(L.toggleWatchlist([5, 10], null), [5, 10], 'Toggling null playerId preserves list');

// --- 3. cleanWatchlist tests (auto-removal on draft pick) ---
const activeWatchlist = [1, 5, 8, 12, 15];

// Case A: Pick player #8
const cleaned1 = L.cleanWatchlist(activeWatchlist, [8]);
eq(cleaned1, [1, 5, 12, 15], 'cleanWatchlist removes drafted player #8');

// Case B: Pick non-watched player #99
const cleaned2 = L.cleanWatchlist(activeWatchlist, [99]);
eq(cleaned2, [1, 5, 8, 12, 15], 'cleanWatchlist leaves list unchanged when non-watched player picked');

// Case C: Multiple picks (e.g. from jumpTo or bulk draft log)
const cleaned3 = L.cleanWatchlist(activeWatchlist, [1, 12, 99]);
eq(cleaned3, [5, 8, 15], 'cleanWatchlist removes multiple drafted players in one call');

// Case D: Map or Set input for taken players
const takenSet = new Set([5, 15]);
const cleaned4 = L.cleanWatchlist(activeWatchlist, takenSet);
eq(cleaned4, [1, 8, 12], 'cleanWatchlist supports Set as taken container');

const takenMap = new Map([[5, 'me'], [12, 'other']]);
const cleaned5 = L.cleanWatchlist(activeWatchlist, takenMap);
eq(cleaned5, [1, 8, 15], 'cleanWatchlist supports Map as taken container');

// Edge cases
eq(L.cleanWatchlist(null, [1, 2]), [], 'cleanWatchlist on null returns empty array');
eq(L.cleanWatchlist([1, 2], null), [1, 2], 'cleanWatchlist with null taken container preserves list');

// --- 4. reorderWatchlist tests ---
const initialWatch = [10, 20, 30, 40];
const reordered1 = L.reorderWatchlist(initialWatch, 1, 2); // move 20 down to idx 2
eq(reordered1, [10, 30, 20, 40], 'reorderWatchlist moves item forward');

const reordered2 = L.reorderWatchlist(initialWatch, 3, 0); // move 40 to front
eq(reordered2, [40, 10, 20, 30], 'reorderWatchlist moves item to front');

const reordered3 = L.reorderWatchlist(initialWatch, 0, 3); // move 10 to end
eq(reordered3, [20, 30, 40, 10], 'reorderWatchlist moves item to end');

// Edge cases: out of bounds or invalid inputs
eq(L.reorderWatchlist(initialWatch, -1, 2), initialWatch, 'reorderWatchlist negative fromIdx returns original list copy');
eq(L.reorderWatchlist(initialWatch, 1, 10), initialWatch, 'reorderWatchlist out-of-bounds toIdx returns original list copy');
eq(L.reorderWatchlist(null, 0, 1), [], 'reorderWatchlist on null returns empty array');

// --- 5. Watchlist Priority Order Resolution for Strategy View ---
const priorityList = [302, 301, 303]; // 302 first, then 301, then 303
const watchedOrder = new Map();
priorityList.forEach((id, idx) => watchedOrder.set(id, idx));

const testCandidates = [
  { id: 301, name: 'Marvin Harrison Jr.' },
  { id: 303, name: 'Kyren Williams' },
  { id: 302, name: 'Malik Nabers' }
];

const sortedByPriority = testCandidates.slice().sort((a, b) => {
  return (watchedOrder.get(a.id) ?? 999) - (watchedOrder.get(b.id) ?? 999);
});

eq(sortedByPriority[0].id, 302, 'First player in strategy watchlist matches priority order (Malik Nabers)');
eq(sortedByPriority[1].id, 301, 'Second player matches priority order (Marvin Harrison Jr.)');
eq(sortedByPriority[2].id, 303, 'Third player matches priority order (Kyren Williams)');

// Drag-and-drop ID resolution
const fromPlayerId = 303; // Drag Kyren Williams to before Marvin Harrison Jr.
const toPlayerId = 301;
const fromIdx = priorityList.indexOf(fromPlayerId);
const toIdx = priorityList.indexOf(toPlayerId);
const reorderedByDrag = L.reorderWatchlist(priorityList, fromIdx, toIdx);

eq(reorderedByDrag, [302, 303, 301], 'Drag and drop reordering by player ID successfully moves Kyren before Marvin');

const success = finishSuite('Draft Watchlist Management');
if (!success) {
  process.exit(1);
}

