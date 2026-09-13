// Test suite for Multi-League Profiles, Manifest Management, and Workspace Switching
import { createRequire } from 'module';
import { eq, assert, printSuiteHeader, finishSuite, resetFailures } from './test-helper.mjs';

const require = createRequire(import.meta.url);
const L = require('../draft-logic.js');

resetFailures();
printSuiteHeader('Multi-League Profiles & Manifest Management');

// 1. Manifest Initialization
const defaultManifest = L.createDefaultLeagueManifest();
eq(defaultManifest.version, 1, 'Manifest has schema version 1');
eq(defaultManifest.activeLeagueId, 'league_default', 'Default active league id is league_default');
eq(defaultManifest.leagues.length, 1, 'Default manifest contains 1 initial league');
eq(defaultManifest.leagues[0].name, "Ken's Draft Board", 'Initial league name is default');

const customManifest = L.createDefaultLeagueManifest('Dynasty Superflex 2026', 'league_custom_1');
eq(customManifest.activeLeagueId, 'league_custom_1', 'Custom manifest sets active league id');
eq(customManifest.leagues[0].name, 'Dynasty Superflex 2026', 'Custom manifest sets custom league name');

// 2. League Profile Creation
const sampleState = {
  settings: {
    teams: 10,
    slot: 3,
    rounds: 20,
    mode: 'snake',
    scoring: 'ppr',
    qbFormat: '1qb',
    rosterSlots: { qb: 1, rb: 2, wr: 2, te: 1, flex: 2, superflex: 0, k: 1, dst: 1, bench: 10 }
  },
  keepers: [
    { id: 'k1', slot: 3, round: 5, playerId: 10, customName: null, customPos: 'WR' }
  ],
  log: [
    { overall: 1, playerId: 0, mine: false },
    { overall: 2, playerId: 4, mine: false },
    { overall: 3, playerId: 10, mine: true, isKeeper: true }
  ],
  watchlist: [20, 25, 30],
  queue: [25, 30],
  tradedPicks: { 5: 2 }
};

const profile = L.createLeagueProfile('Work Redraft League', 'league_work_1', sampleState);
eq(profile.id, 'league_work_1', 'Profile has requested id');
eq(profile.name, 'Work Redraft League', 'Profile has requested name');
eq(profile.settings.leagueName, 'Work Redraft League', 'Settings leagueName synced');
eq(profile.settings.teams, 10, 'Preserves settings team count');
eq(profile.keepers.length, 1, 'Preserves keeper configuration');
eq(profile.log.length, 3, 'Preserves draft log');
eq(profile.watchlist, [20, 25, 30], 'Preserves watchlist');
eq(profile.queue, [25, 30], 'Preserves draft queue');
eq(profile.tradedPicks, { 5: 2 }, 'Preserves traded picks');

// 3. Duplicate League Settings (Clone rules & slots, fresh draft board)
const cloned = L.duplicateLeagueSettings(sampleState, 'Work Redraft 2027', 'league_work_cloned');
eq(cloned.id, 'league_work_cloned', 'Cloned profile receives new ID');
eq(cloned.name, 'Work Redraft 2027', 'Cloned profile receives new name');
eq(cloned.settings.leagueName, 'Work Redraft 2027', 'Cloned settings has new league name');
eq(cloned.settings.teams, 10, 'Cloned settings preserves teams');
eq(cloned.settings.rosterSlots.flex, 2, 'Cloned settings preserves roster slots');
eq(cloned.keepers.length, 0, 'Cloned league starts with fresh keepers');
eq(cloned.log.length, 0, 'Cloned league starts with empty draft board');
eq(cloned.tradedPicks, {}, 'Cloned league starts with empty traded picks');
eq(cloned.watchlist, [20, 25, 30], 'Cloned league retains user watchlist');

// Duplicate fallback naming when new name omitted
const autoNamedCopy = L.duplicateLeagueSettings(sampleState);
assert(autoNamedCopy.name.includes('(Copy)'), 'Generates (Copy) suffix when name omitted');

// 4. Multi-League Backup Serialization & Deserialization
const multiLeaguesMap = {
  [defaultManifest.activeLeagueId]: profile,
  [cloned.id]: cloned
};
const backupPayload = L.serializeLeagueBackup(defaultManifest, multiLeaguesMap);
eq(backupPayload.backupType, 'fantasy_drafter_multi_league_backup', 'Backup has correct type identifier');
eq(backupPayload.manifest.activeLeagueId, 'league_default', 'Backup preserves manifest active ID');
assert(backupPayload.leagues[cloned.id] != null, 'Backup includes cloned league profile');

const deserializedMulti = L.deserializeLeagueBackup(backupPayload);
eq(deserializedMulti.ok, true, 'Successfully deserializes multi-league backup');
eq(deserializedMulti.type, 'multi', 'Reports multi-league type');
eq(deserializedMulti.manifest.leagues.length, 1, 'Manifest preserved in multi restore');
assert(deserializedMulti.leagues[cloned.id] != null, 'Restored cloned league in map');

// 5. Single-League JSON Import Compatibility
const singleSerialized = L.serializeDraftState({
  settings: { leagueName: 'Standalone League', teams: 12, mySlot: 1 },
  draftLog: [{ overall: 1, playerId: 5, mine: true }],
  watchlist: [12]
});
const deserializedSingle = L.deserializeLeagueBackup(singleSerialized);
eq(deserializedSingle.ok, true, 'Successfully deserializes single-league draft payload');
eq(deserializedSingle.type, 'single', 'Reports single-league type');
eq(deserializedSingle.league.name, 'Standalone League', 'Extracts name from single-league payload');
eq(deserializedSingle.league.state.settings.teams, 12, 'Extracts settings from single-league payload');
eq(deserializedSingle.league.state.log.length, 1, 'Extracts draft log from single-league payload');

// 6. Error & Malformed Input Handling
eq(L.deserializeLeagueBackup(null).ok, false, 'Rejects null backup payload');
eq(L.deserializeLeagueBackup('{ broken json').ok, false, 'Rejects malformed JSON string');
eq(L.deserializeLeagueBackup({ someRandom: 'object' }).ok, false, 'Rejects unrecognized object format');

// 7. Mock Storage & draft-state.js Lifecycle Integration
const mockStorage = new Map();
globalThis.localStorage = {
  getItem: k => mockStorage.has(k) ? mockStorage.get(k) : null,
  setItem: (k, v) => mockStorage.set(k, String(v)),
  removeItem: k => mockStorage.delete(k),
  clear: () => mockStorage.clear()
};

// Seed legacy storage
mockStorage.set('kenDraftBoard-v1', JSON.stringify({
  settings: { leagueName: 'My Old Dynasty League', teams: 10, slot: 2 },
  log: [{ overall: 1, playerId: 5, mine: false }, { overall: 2, playerId: 12, mine: true }]
}));

// Load draft-state.js in mock environment
Object.assign(globalThis, L);
const fs = require('fs');
const stateCode = fs.readFileSync('./js/draft-state.js', 'utf8');
eval(stateCode);

// Verify legacy migration on first load
assert(mockStorage.has('fantasy_drafter_leagues_manifest'), 'Manifest created on migration');
assert(mockStorage.has('fantasy_drafter_league_league_default'), 'Default league storage created from legacy data');
const initialList = globalThis.getLeagueList();
eq(initialList.length, 1, 'One league migrated in list');
eq(initialList[0].name, 'My Old Dynasty League', 'Migrated legacy league name preserved');
eq(globalThis.state.log.length, 2, 'Migrated legacy picks loaded into state');

// Verify clean migration: updating state does NOT write to legacy key
globalThis.draftPlayer(20, true);
eq(globalThis.state.log.length, 3, 'Draft pick registered in memory');
const legacyAfterSave = JSON.parse(mockStorage.get('kenDraftBoard-v1'));
eq(legacyAfterSave.log.length, 2, 'Clean migration: legacy key is NOT written to on save');

// Create new league
const createRes = globalThis.createNewLeague('Fresh Redraft League');
eq(createRes.ok, true, 'Created new league successfully');
eq(globalThis.getLeagueList().length, 2, 'Two leagues now in manifest');
eq(globalThis.state.settings.leagueName, 'Fresh Redraft League', 'Switched to new league');
eq(globalThis.state.log.length, 0, 'New league has clean draft board');

// Switch back to original migrated league
const switchRes = globalThis.switchLeague('league_default');
eq(switchRes.ok, true, 'Switched back to default league');
eq(globalThis.state.settings.leagueName, 'My Old Dynasty League', 'Restored original league settings');
eq(globalThis.state.log.length, 3, 'Restored all original draft picks intact');

// Duplicate league
const dupRes = globalThis.duplicateCurrentLeague('Dynasty Clone 2027');
eq(dupRes.ok, true, 'Duplicated league successfully');
eq(globalThis.getLeagueList().length, 3, 'Three leagues now in manifest');
eq(globalThis.state.settings.leagueName, 'Dynasty Clone 2027', 'Active league is now cloned league');
eq(globalThis.state.settings.teams, 10, 'Cloned league preserves team count');
eq(globalThis.state.log.length, 0, 'Cloned league starts with clean board');

// Delete active league
const deleteRes = globalThis.deleteLeague(dupRes.id);
eq(deleteRes.ok, true, 'Deleted cloned league');
eq(globalThis.getLeagueList().length, 2, 'Two leagues remain in manifest');
assert(mockStorage.get('fantasy_drafter_league_' + dupRes.id) == null, 'Deleted league storage removed');

// Prevent deleting when only 1 league left
const remaining = globalThis.getLeagueList();
globalThis.deleteLeague(remaining[1].id);
eq(globalThis.getLeagueList().length, 1, 'Only 1 league left');
const lastDeleteRes = globalThis.deleteLeague(remaining[0].id);
eq(lastDeleteRes.ok, false, 'Prevents deleting the last remaining league');

const success = finishSuite('Multi-League Profiles & Manifest Management');
if (!success) {
  process.exit(1);
}
