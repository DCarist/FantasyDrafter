// Test Suite for Draft League Setup & In-Season Manager Connection

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
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
assert(
  /^\d{4}$/.test(currentSeason),
  'getDefaultSeason() returns a 4-digit string without arguments',
);

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
stateSandbox.window = stateSandbox;
vm.createContext(stateSandbox);
const draftStateCode = readFileSync('js/draft-state.js', 'utf8');
vm.runInContext(draftStateCode, stateSandbox);

const draftState = stateSandbox.window.state;
eq(draftState.settings.platform, 'manual', 'New draft starts without a platform connection');
eq(draftState.settings.inSeasonConnected, false, 'New draft is not linked to an in-season league');
const restored = {
  settings: {
    platform: 'espn',
    platformLeagueId: 'provider-123',
    platformUserId: 'owner-5',
    season: '2026',
    espnSwid: 'swid-value',
    espnS2: 'cookie-value',
    inSeasonLeagueId: 'manager-123',
    inSeasonConnected: 1,
  },
  log: [],
  keepers: [],
};
const restoredStore = new Map([
  [
    'fantasy_drafter_leagues_manifest',
    JSON.stringify({
      activeLeagueId: 'league_restored',
      leagues: [{ id: 'league_restored', name: 'Restored League' }],
    }),
  ],
  ['fantasy_drafter_league_league_restored', JSON.stringify(restored)],
]);
const restoredSandbox = {
  localStorage: {
    getItem: (key) => restoredStore.get(key) ?? null,
    setItem: (key, value) => restoredStore.set(key, String(value)),
  },
  document: { getElementById: () => null },
};
restoredSandbox.window = restoredSandbox;
restoredSandbox.globalThis = restoredSandbox;
vm.createContext(restoredSandbox);
vm.runInContext(draftStateCode, restoredSandbox);
const restoredSettings = restoredSandbox.state.settings;
eq(
  restoredSettings.platformLeagueId,
  'provider-123',
  'Restored draft retains provider league identity',
);
eq(restoredSettings.platformUserId, 'owner-5', 'Restored draft retains its platform user');
eq(restoredSettings.inSeasonLeagueId, 'manager-123', 'Restored draft retains manager connection');
eq(restoredSettings.espnS2, 'cookie-value', 'Restored draft retains private ESPN credentials');
eq(restoredSettings.inSeasonConnected, true, 'Restored connection status is normalized');

// 4. In-Season UI Sandbox: League Setup Buttons & openLeagueSetupForManager
const managerView = { innerHTML: '' };
const uiSandbox = {
  localStorage: {
    getItem: (k) => {
      if (k === 'fantasy_drafter_league_league_dynasty_1') {
        return JSON.stringify({
          settings: { leagueName: 'Alpha Dynasty', inSeasonLeagueId: 'lg_sleeper_100' },
        });
      }
      return null;
    },
    setItem: () => {},
  },
  document: {
    getElementById: (id) => (id === 'manager_views_container' ? managerView : null),
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

// Exercise the handlers in rendered league cards and the active-league header.
let switchedToLeague = null;
let openedSetup = false;
uiSandbox.switchLeague = (id) => {
  switchedToLeague = id;
};
uiSandbox.openLeagueSetup = () => {
  openedSetup = true;
};
const cards = uiSandbox.renderLeaguesView();
const cardActions = [...cards.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].filter(
  ([, , text]) => text.includes('League Setup'),
);
eq(cardActions.length, 2, 'Each in-season league offers a setup action');
const clickSetup = (markup) => {
  const handler = markup.match(/\bonclick="([^"]+)"/)?.[1];
  assert(handler, 'League setup action has a click handler');
  vm.runInContext(handler, uiSandbox);
};
clickSetup(cardActions[0][0]);
eq(
  switchedToLeague,
  'league_dynasty_1',
  'Existing matching draft league is selected from its card',
);
assert(openedSetup, 'League setup opens for the existing league');
uiSandbox.inSeasonState.currentView = 'team';
uiSandbox.renderManagerView();
const subheaderAction = [
  ...managerView.innerHTML.matchAll(/<button\b[^>]*onclick="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g),
].find(([, , text]) => text.includes('League Setup'));
assert(subheaderAction, 'Active league header offers League Setup');
switchedToLeague = null;
vm.runInContext(subheaderAction[1], uiSandbox);
eq(switchedToLeague, 'league_dynasty_1', 'Active league header opens the matching draft league');

// Test new league auto-creation when no draft league exists
let createdLeagueName = null;
uiSandbox.createNewLeague = (name) => {
  createdLeagueName = name;
  return { ok: true, id: 'new_league_espn' };
};
uiSandbox.state = { settings: {} };
uiSandbox.save = () => {};

openedSetup = false;
clickSetup(cardActions[1][0]);
eq(
  createdLeagueName,
  'Work ESPN League',
  'Creates matching draft league for unlinked in-season league',
);
eq(uiSandbox.state.settings.platform, 'espn', 'Sets platform on created draft league');
eq(
  uiSandbox.state.settings.inSeasonLeagueId,
  'lg_espn_200',
  'Sets inSeasonLeagueId on created draft league',
);
assert(openedSetup, 'Opens league setup modal after creating draft league');

eq(uiSandbox.state.settings.inSeasonConnected, true, 'Created draft league is marked connected');

// Open the real draft setup modal; test the user-visible connection fields and provider transition.
const inputs = new Map();
const getInput = (id) => {
  if (!inputs.has(id)) {
    const defaults = {
      setup_roster_qb: 1,
      setup_roster_rb: 2,
      setup_roster_wr: 2,
      setup_roster_te: 1,
      setup_roster_flex: 3,
      setup_roster_superflex: 1,
      setup_roster_k: 0,
      setup_roster_dst: 0,
      setup_roster_bench: 15,
    };
    inputs.set(id, {
      value: defaults[id] ?? '',
      innerHTML: '',
      style: {},
      classList: { add: () => {} },
      addEventListener: () => {},
    });
  }
  return inputs.get(id);
};
const draftUi = {
  document: { getElementById: getInput },
  state: {
    settings: {
      ...sourceState.settings,
      slot: 1,
      rounds: 25,
      mode: 'snake',
      scoring: 'half',
      qbFormat: 'sf',
      teamNames: Array.from({ length: 12 }, (_, i) => `Team ${i + 1}`),
      rosterSlots: {},
    },
    keepers: [],
  },
  getLeagueList: () => [{ id: 'league_dynasty_1', name: 'Alpha Dynasty' }],
  formatLineupSummary: () => 'Lineup',
};
draftUi.window = draftUi;
draftUi.globalThis = draftUi;
vm.createContext(draftUi);
vm.runInContext(readFileSync('js/draft-ui.js', 'utf8'), draftUi);
draftUi.openLeagueSetup();
const setupMarkup = getInput('modalbox').innerHTML;
for (const label of [
  'Platform Provider',
  'Platform League ID',
  'My Team / User ID',
  'Season',
  'SWID',
  'espn_s2',
]) {
  assert(setupMarkup.includes(label), `League setup presents ${label}`);
}
assert(
  setupMarkup.includes('Sleeper Fantasy') && setupMarkup.includes('ESPN Fantasy'),
  'League setup offers both platform providers',
);
draftUi.onSetupPlatformChange('espn');
eq(
  getInput('setup_espn_creds_container').style.display,
  'block',
  'Selecting ESPN reveals credential fields',
);
draftUi.onSetupPlatformChange('sleeper');
eq(
  getInput('setup_espn_creds_container').style.display,
  'none',
  'Selecting Sleeper hides ESPN credentials',
);

const success = finishSuite('Draft League Setup & In-Season Manager Connection');
if (!success) {
  process.exit(1);
}
