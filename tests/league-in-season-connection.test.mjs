// Test Suite for Draft League Setup & In-Season Manager Connection
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { assert, eq, finishSuite, printSuiteHeader, resetFailures } from './test-helper.mjs';

const require = createRequire(import.meta.url);
const L = require('../draft-logic.js');

resetFailures();
printSuiteHeader('Draft League Setup & In-Season Manager Connection');

// 1. Season Default Calculation Logic (Jan vs beyond Jan 31)
const jan15 = new Date(2026, 0, 15); // Month 0 = January
eq(L.getDefaultSeason(jan15), '2025', 'January 15 defaults to prior year (2025)');

const jan31 = new Date(2026, 0, 31, 23, 59, 59);
eq(L.getDefaultSeason(jan31), '2025', 'January 31 defaults to prior year (2025)');

const feb1 = new Date(2026, 1, 1); // Month 1 = February
eq(L.getDefaultSeason(feb1), '2026', 'February 1 defaults to current year (2026)');

const sep20 = new Date(2026, 8, 20); // Month 8 = September
eq(L.getDefaultSeason(sep20), '2026', 'September 20 defaults to current year (2026)');

const currentSeason = L.getDefaultSeason();
assert(/^\d{4}$/.test(currentSeason), 'getDefaultSeason() returns a 4-digit string without arguments');

// 2. Duplicate League Settings with In-Season Fields
const sourceState = {
  settings: {
    leagueName: 'Premier Dynasty',
    teams: 12,
    platform: 'sleeper',
    platformLeagueId: '1049281928374',
    platformUserId: 'commish_dan',
    season: '2026',
    inSeasonLeagueId: 'sleeper_1049281928374',
    inSeasonConnected: true,
    espnSwid: '',
    espnS2: '',
    sleeperDraftId: '999888777',
    sleeperUsername: 'commish_dan',
  },
  keepers: [],
  log: [],
  watchlist: [1, 2, 3],
};

const cloned = L.duplicateLeagueSettings(sourceState, 'Premier Dynasty (Dev)');
eq(cloned.settings.leagueName, 'Premier Dynasty (Dev)', 'Cloned league gets new name');
eq(cloned.settings.platformLeagueId, '', 'Cloned league resets platformLeagueId');
eq(cloned.settings.inSeasonLeagueId, '', 'Cloned league resets inSeasonLeagueId');
eq(cloned.settings.inSeasonConnected, false, 'Cloned league sets inSeasonConnected to false');
eq(cloned.settings.sleeperDraftId, '', 'Cloned league resets sleeperDraftId');
eq(cloned.settings.sleeperUsername, '', 'Cloned league resets sleeperUsername');

// 3. Draft State Sandbox: Normalization of In-Season Properties
const stateSandbox = {
  window: {},
  globalThis: {},
  localStorage: {
    getItem: () => null,
    setItem: () => {},
  },
  document: {
    getElementById: () => null,
  },
  getDefaultSeason: L.getDefaultSeason,
};
vm.createContext(stateSandbox);
const draftStateCode = readFileSync('js/draft-state.js', 'utf8');
vm.runInContext(draftStateCode, stateSandbox);

const draftState = stateSandbox.window.state;
assert(draftState != null, 'Draft state loaded in sandbox');
assert(draftState.settings != null, 'Draft state settings initialized');
assert('platform' in draftState.settings, 'Settings defines platform');
assert('platformLeagueId' in draftState.settings, 'Settings defines platformLeagueId');
assert('platformUserId' in draftState.settings, 'Settings defines platformUserId');
assert('season' in draftState.settings, 'Settings defines season');
assert('espnSwid' in draftState.settings, 'Settings defines espnSwid');
assert('espnS2' in draftState.settings, 'Settings defines espnS2');
assert('inSeasonLeagueId' in draftState.settings, 'Settings defines inSeasonLeagueId');
assert('inSeasonConnected' in draftState.settings, 'Settings defines inSeasonConnected');

// 4. In-Season UI Sandbox: League Setup Buttons & openLeagueSetupForManager
const uiSandbox = {
  localStorage: {
    getItem: (k) => {
      if (k === 'fantasy_drafter_leagues_manifest') {
        return JSON.stringify({
          activeLeagueId: 'league_dynasty_1',
          leagues: [{ id: 'league_dynasty_1', name: 'Alpha Dynasty' }],
        });
      }
      return null;
    },
    setItem: () => {},
  },
  document: {
    getElementById: () => null,
    querySelectorAll: () => [],
  },
  inSeasonState: {
    currentView: 'leagues',
    activeLeagueId: 'lg_sleeper_100',
    leagues: [
      {
        id: 'lg_sleeper_100',
        name: 'Alpha Dynasty',
        platform: 'sleeper',
        season: '2026',
        team_count: 12,
      },
      {
        id: 'lg_espn_200',
        name: 'Work ESPN League',
        platform: 'espn',
        season: '2026',
        team_count: 10,
      },
    ],
  },
  getLeagueList: () => [{ id: 'league_dynasty_1', name: 'Alpha Dynasty' }],
  getDefaultSeason: L.getDefaultSeason,
};
uiSandbox.window = uiSandbox;
uiSandbox.globalThis = uiSandbox;
vm.createContext(uiSandbox);
const managerUiCode = readFileSync('js/roster-manager-ui.js', 'utf8');
vm.runInContext(managerUiCode, uiSandbox);

assert(
  typeof uiSandbox.window.openLeagueSetupForManager === 'function',
  'Exports openLeagueSetupForManager on window',
);

// Verify openLeagueSetupForManager switches or creates league
let switchedToLeague = null;
let openedSetup = false;
uiSandbox.switchLeague = (id) => {
  switchedToLeague = id;
};
uiSandbox.openLeagueSetup = () => {
  openedSetup = true;
};

// Test existing match by name
uiSandbox.window.openLeagueSetupForManager('lg_sleeper_100');
assert(openedSetup, 'openLeagueSetupForManager calls openLeagueSetup');

// Test new league auto-creation when no draft league exists
let createdLeagueName = null;
uiSandbox.createNewLeague = (name) => {
  createdLeagueName = name;
  return { ok: true, id: 'new_league_espn' };
};
uiSandbox.state = { settings: {} };
uiSandbox.save = () => {};

openedSetup = false;
uiSandbox.window.openLeagueSetupForManager('lg_espn_200');
eq(createdLeagueName, 'Work ESPN League', 'Creates matching draft league for unlinked in-season league');
eq(uiSandbox.state.settings.platform, 'espn', 'Sets platform on created draft league');
eq(uiSandbox.state.settings.inSeasonLeagueId, 'lg_espn_200', 'Sets inSeasonLeagueId on created draft league');
assert(openedSetup, 'Opens league setup modal after creating draft league');

// 5. Verify HTML Templates Contain League Setup Buttons
assert(
  managerUiCode.includes('openLeagueSetupForManager(global.inSeasonState.activeLeagueId)'),
  'Sub-header contains League Setup button linking to active league',
);
assert(
  managerUiCode.includes("openLeagueSetupForManager('${esc(lg.id)}')"),
  'Leagues cards contain League Setup button linking to each specific league',
);
assert(
  managerUiCode.includes('league-setup-btn'),
  'Leagues cards use .league-setup-btn class',
);

// 6. Verify Draft UI Code Contains In-Season Connection Inputs
const draftUiCode = readFileSync('js/draft-ui.js', 'utf8');
assert(
  draftUiCode.includes('setup_platform_select'),
  'draft-ui.js renders platform provider selector',
);
assert(
  draftUiCode.includes('setup_platform_league_id'),
  'draft-ui.js renders platform league ID input',
);
assert(
  draftUiCode.includes('setup_platform_user_id'),
  'draft-ui.js renders platform user ID input',
);
assert(
  draftUiCode.includes('setup_espn_creds_container'),
  'draft-ui.js renders collapsible ESPN credentials container',
);
assert(
  draftUiCode.includes('/api/manager/leagues/add'),
  'draft-ui.js syncs league setup changes to in-season manager endpoint',
);
assert(
  draftUiCode.includes('onSetupPlatformChange'),
  'draft-ui.js exports onSetupPlatformChange handler',
);

const success = finishSuite('Draft League Setup & In-Season Manager Connection');
if (!success) {
  process.exit(1);
}
