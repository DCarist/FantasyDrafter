// Test suite for Sleeper Sync Disconnect, Key/Username Removal, and Auto-Save
import { createRequire } from 'node:module';
import { assert, eq, finishSuite, printSuiteHeader, resetFailures } from './test-helper.mjs';

const require = createRequire(import.meta.url);
const logic = require('../draft-logic.js');

resetFailures();
printSuiteHeader('Sleeper Sync Disconnect & Key Removal');

// --- 1. duplicateLeagueSettings clears both sleeperDraftId and sleeperUsername ---
const sourceState = {
  settings: {
    leagueName: 'Main Dynasty',
    sleeperDraftId: '1398522574945710080',
    sleeperUsername: 'DougC95',
    teams: 12,
    mode: 'snake',
  },
  keepers: [],
  log: [],
  watchlist: [1, 2],
};

const duplicated = logic.duplicateLeagueSettings(sourceState, 'Cloned League');
assert(duplicated != null, 'duplicateLeagueSettings returns object');
eq(duplicated.name, 'Cloned League', 'Cloned league has new name');
eq(duplicated.settings.sleeperDraftId, '', 'Clears sleeperDraftId on duplicated league');
eq(duplicated.settings.sleeperUsername, '', 'Clears sleeperUsername on duplicated league');

// --- 2. In-browser draft-state & draft-sync-client mock testing ---
// Set up mock DOM and window environment
const domElements = {};
global.document = {
  getElementById: (id) => domElements[id] || null,
  activeElement: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  title: '',
};
global.window = global;
global.localStorage = {
  _store: {},
  getItem(k) {
    return this._store[k] || null;
  },
  setItem(k, v) {
    this._store[k] = String(v);
  },
  removeItem(k) {
    delete this._store[k];
  },
};

// Import draft-state and draft-sync-client into this environment
await import('../js/draft-state.js');
await import('../js/draft-sync-client.js');

// Verify initial state
assert(typeof global.saveSleeperSyncSettings === 'function', 'saveSleeperSyncSettings is exported');
assert(typeof global.disconnectSleeperDraft === 'function', 'disconnectSleeperDraft is exported');

// Setup state with active sleeper sync
global.state.settings.sleeperDraftId = '1398522574945710080';
global.state.settings.sleeperUsername = 'DougC95';
global.syncState.type = 'sleeper';
global.syncState.sleeperTimer = 12345;

// Mock input elements in DOM
domElements.sync_sleeper_draft_id = { value: '1398522574945710080' };
domElements.sync_sleeper_username = { value: 'DougC95' };
domElements.sleeper_status_box = { innerHTML: '' };
domElements.sleeper_import_msg = { innerHTML: '' };
domElements.sync_badge = { className: '', innerHTML: '' };
domElements.sleeper_toggle_btn = { textContent: '', className: '' };

// --- 3. Removing draft ID and username via saveSleeperSyncSettings() ---
// User clears out draft ID and username inputs
domElements.sync_sleeper_draft_id.value = '';
domElements.sync_sleeper_username.value = '';

global.saveSleeperSyncSettings(true);

eq(
  global.state.settings.sleeperDraftId,
  '',
  'saveSleeperSyncSettings clears sleeperDraftId in state',
);
eq(
  global.state.settings.sleeperUsername,
  '',
  'saveSleeperSyncSettings clears sleeperUsername in state',
);
eq(global.syncState.sleeperTimer, null, 'saveSleeperSyncSettings stops active polling timer');
eq(global.syncState.type, 'off', 'saveSleeperSyncSettings resets syncState.type to off');
assert(
  domElements.sleeper_import_msg.innerHTML.includes('unlinked'),
  'Displays unlinked feedback message',
);

// Verify saved in localStorage
const savedState = global.load();
eq(savedState.settings.sleeperDraftId, '', 'Empty sleeperDraftId is persisted to storage');
eq(savedState.settings.sleeperUsername, '', 'Empty sleeperUsername is persisted to storage');

// --- 4. Explicit disconnectSleeperDraft() ---
// Re-populate and activate
global.state.settings.sleeperDraftId = '987654321';
global.state.settings.sleeperUsername = 'TestUser';
domElements.sync_sleeper_draft_id.value = '987654321';
domElements.sync_sleeper_username.value = 'TestUser';
global.syncState.type = 'sleeper';
global.syncState.sleeperTimer = 99999;

global.disconnectSleeperDraft();

eq(domElements.sync_sleeper_draft_id.value, '', 'disconnectSleeperDraft clears DOM draftId input');
eq(domElements.sync_sleeper_username.value, '', 'disconnectSleeperDraft clears DOM username input');
eq(
  global.state.settings.sleeperDraftId,
  '',
  'disconnectSleeperDraft clears sleeperDraftId in state',
);
eq(
  global.state.settings.sleeperUsername,
  '',
  'disconnectSleeperDraft clears sleeperUsername in state',
);
eq(global.syncState.sleeperTimer, null, 'disconnectSleeperDraft clears polling timer');
eq(global.syncState.type, 'off', 'disconnectSleeperDraft sets syncState.type to off');

// --- 5. pollSleeperPicks halts when draftId is empty ---
global.syncState.sleeperTimer = 88888;
global.syncState.type = 'sleeper';
global.state.settings.sleeperDraftId = '';

await global.pollSleeperPicks();

eq(
  global.syncState.sleeperTimer,
  null,
  'pollSleeperPicks halts and clears timer when draftId is empty',
);
eq(
  global.syncState.type,
  'off',
  'pollSleeperPicks sets syncState.type to off when draftId is empty',
);

// --- 6. toggleSleeperSync with empty draftId unlinks cleanly ---
domElements.sync_sleeper_draft_id.value = '';
domElements.sync_sleeper_username.value = '';
global.state.settings.sleeperDraftId = '';
global.syncState.sleeperTimer = 77777;

let alerted = false;
global.alert = (_msg) => {
  alerted = true;
};

global.toggleSleeperSync();

assert(alerted, 'toggleSleeperSync alerts user when draftId is empty');
eq(global.syncState.sleeperTimer, null, 'toggleSleeperSync halts timer');
eq(global.state.settings.sleeperDraftId, '', 'toggleSleeperSync maintains empty draftId');

const success = finishSuite('Sleeper Sync Disconnect & Key Removal');
process.exit(success ? 0 : 1);
