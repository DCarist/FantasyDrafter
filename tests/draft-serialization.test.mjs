// Test suite for Draft State Serialization, Schema Versioning, and Export/Import
import { createRequire } from 'module';
import { eq, assert, printSuiteHeader, finishSuite, resetFailures } from './test-helper.mjs';

const require = createRequire(import.meta.url);
const L = require('../draft-logic.js');

resetFailures();
printSuiteHeader('Draft State Serialization & Schema Versioning');

// 1. Schema version constant
eq(L.DRAFT_SCHEMA_VERSION, 2, 'DRAFT_SCHEMA_VERSION is 2');

// 2. serializeDraftState
const sampleState = {
  settings: {
    teams: 12,
    rounds: 25,
    mySlot: 2,
    mode: '3rr',
    teamNames: ['Team 1', 'Ken', 'Team 3']
  },
  draftLog: [
    { overall: 1, playerId: 0, customName: null, customPos: null, customTeam: null, customBye: null, mine: false },
    { overall: 2, playerId: 3, customName: null, customPos: null, customTeam: null, customBye: null, mine: true },
    { overall: 3, playerId: null, customName: 'Caleb Downs', customPos: 'DB', customTeam: 'OSU', customBye: null, mine: false }
  ],
  watchlist: [5, 12, 18],
  queue: [3, 10, 25],
  tradedPicks: { 7: 4, 1: 2 },
  syncSettings: { sleeperDraftId: '12345678', espnAutoSync: true }
};

const serialized = L.serializeDraftState(sampleState);
eq(serialized.version, 2, 'Serialized state has schema version 2');
assert(typeof serialized.exportedAt === 'string', 'Serialized state has exportedAt ISO timestamp');
eq(serialized.settings.mySlot, 2, 'Preserves settings');
eq(serialized.draftLog.length, 3, 'Preserves draftLog entries');
eq(serialized.watchlist, [5, 12, 18], 'Preserves watchlist');
eq(serialized.queue, [3, 10, 25], 'Preserves queue');
eq(serialized.tradedPicks, { 7: 4, 1: 2 }, 'Preserves tradedPicks');

// 3. deserializeDraftState (V2 payload)
const jsonStr = JSON.stringify(serialized);
const desRes = L.deserializeDraftState(jsonStr);

eq(desRes.ok, true, 'deserializeDraftState succeeds for valid JSON');
eq(desRes.version, 2, 'Reported version is 2');
eq(desRes.migratedFrom, null, 'No migration needed for v2');
eq(desRes.state.settings.mySlot, 2, 'Deserialized mySlot');
eq(desRes.state.draftLog.length, 3, 'Deserialized 3 draft picks');
eq(desRes.state.draftLog[2].customName, 'Caleb Downs', 'Deserialized unlisted pick custom name');
eq(desRes.state.draftLog[2].customPos, 'DB', 'Deserialized unlisted pick custom pos');
eq(desRes.state.watchlist, [5, 12, 18], 'Deserialized watchlist');
eq(desRes.state.queue, [3, 10, 25], 'Deserialized queue');
eq(desRes.state.tradedPicks, { 7: 4, 1: 2 }, 'Deserialized tradedPicks');

// 4. deserializeDraftState (Legacy V1 payload migration)
const legacyV1Payload = {
  settings: { teams: 10, mySlot: 1, mode: 'snake' },
  draftLog: [
    { overall: 1, playerId: 5, mine: true }
  ],
  watchlist: ['5', '10', '15'], // Strings in legacy format
  // queue and tradedPicks were absent in V1
};

const v1Migrated = L.deserializeDraftState(legacyV1Payload);
eq(v1Migrated.ok, true, 'Migrates legacy V1 payload');
eq(v1Migrated.version, 2, 'Upgrades to version 2');
eq(v1Migrated.migratedFrom, 1, 'Records migratedFrom: 1');
eq(v1Migrated.state.watchlist, [5, 10, 15], 'Sanitizes string IDs in watchlist to integers');
eq(v1Migrated.state.queue, [], 'Initializes empty queue for migrated state');
eq(v1Migrated.state.tradedPicks, {}, 'Initializes empty tradedPicks for migrated state');

// 5. Error handling & malformed input
eq(L.deserializeDraftState(null).ok, false, 'Rejects null payload');
eq(L.deserializeDraftState('not json').ok, false, 'Rejects invalid JSON syntax');
eq(L.deserializeDraftState(12345).ok, false, 'Rejects primitive number payload');

const success = finishSuite('Draft State Serialization & Schema Versioning');
if (!success) {
  process.exit(1);
}

