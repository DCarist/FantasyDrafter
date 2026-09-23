// Test Suite for Draft Window to In-Season Manager League Import & Synchronization
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { assert, eq, finishSuite, printSuiteHeader, resetFailures } from './test-helper.mjs';

resetFailures();
printSuiteHeader('Draft Window to In-Season Manager League Import & Sync');

const TEST_DB = resolve('tests/fixtures/test_draft_import.db');
if (existsSync(TEST_DB)) {
  try {
    unlinkSync(TEST_DB);
  } catch (_e) {}
}

const pyRunner = (script) => {
  const output = execFileSync(process.execPath ? 'python' : 'python3', ['-c', script], {
    encoding: 'utf-8',
  });
  return JSON.parse(output.trim());
};

// 1. Ingest Draft Board Rosters Engine Test (Starters, Bench, Roster Slots, Waivers)
const ingestRostersScript = `
import json, sys, os
sys.path.insert(0, os.path.abspath('.'))
from scripts import in_season_manager as mgr

db_path = "${TEST_DB.replace(/\\/g, '/')}"
mgr.init_db(db_path)

draft_state = {
    "settings": {
        "leagueName": "Apex Dynasty SF 6-Pack",
        "teams": 12,
        "teamNames": ["Dan's Dynasty", "Team Bravo", "Team Charlie", "Team Delta"],
        "slot": 1,
        "rosterSlots": {
            "qb": 1, "rb": 2, "wr": 3, "te": 1, "flex": 1, "superflex": 1, "k": 0, "dst": 0, "bench": 10
        },
        "platform": "manual",
        "season": "2026",
        "leagueType": "dynasty"
    },
    "keepers": [
        {"team": 1, "name": "C.J. Stroud", "player": {"name": "C.J. Stroud", "pos": "QB", "team": "HOU"}}
    ],
    "log": [
        {"slot": 1, "round": 1, "overall": 1, "team": "Dan's Dynasty", "player": {"name": "Justin Jefferson", "pos": "WR", "team": "MIN"}},
        {"slot": 1, "round": 2, "overall": 24, "team": "Dan's Dynasty", "player": {"name": "Breece Hall", "pos": "RB", "team": "NYJ"}},
        {"slot": 1, "round": 3, "overall": 25, "team": "Dan's Dynasty", "player": {"name": "Bijan Robinson", "pos": "RB", "team": "ATL"}},
        {"slot": 1, "round": 4, "overall": 48, "team": "Dan's Dynasty", "player": {"name": "Ja'Marr Chase", "pos": "WR", "team": "CIN"}},
        {"slot": 1, "round": 5, "overall": 49, "team": "Dan's Dynasty", "player": {"name": "Amon-Ra St. Brown", "pos": "WR", "team": "DET"}},
        {"slot": 1, "round": 6, "overall": 72, "team": "Dan's Dynasty", "player": {"name": "Trey McBride", "pos": "TE", "team": "ARI"}},
        {"slot": 1, "round": 7, "overall": 73, "team": "Dan's Dynasty", "player": {"name": "Jahmyr Gibbs", "pos": "RB", "team": "DET"}},
        {"slot": 1, "round": 8, "overall": 96, "team": "Dan's Dynasty", "player": {"name": "Lamar Jackson", "pos": "QB", "team": "BAL"}},
        {"slot": 1, "round": 9, "overall": 97, "team": "Dan's Dynasty", "player": {"name": "Drake London", "pos": "WR", "team": "ATL"}},
        {"slot": 1, "round": 10, "overall": 120, "team": "Dan's Dynasty", "player": {"name": "Jayden Daniels", "pos": "QB", "team": "WAS"}},
        {"slot": 2, "round": 1, "overall": 2, "team": "Team Bravo", "player": {"name": "Patrick Mahomes", "pos": "QB", "team": "KC"}},
        {"slot": 2, "round": 2, "overall": 23, "team": "Team Bravo", "player": {"name": "Josh Allen", "pos": "QB", "team": "BUF"}}
    ]
}

res = mgr.ingest_draft_board_rosters("league_apex_dynasty", draft_state, db_path=db_path)
rosters = mgr.get_roster_snapshots("league_apex_dynasty", db_path=db_path)
team_view = mgr.get_team_view_data("league_apex_dynasty", team_id="1", db_path=db_path)
waivers = mgr.get_waiver_matrix(league_id="league_apex_dynasty", db_path=db_path)

print(json.dumps({
    "ingest_result": res,
    "rosters_count": len(rosters),
    "my_team": team_view,
    "waivers_count": len(waivers)
}))
`;

const res1 = pyRunner(ingestRostersScript);
assert(res1.ingest_result?.ok, 'ingest_draft_board_rosters succeeds');
eq(res1.rosters_count, 12, 'Ingests snapshots for all 12 teams');
assert(
  res1.my_team?.starters?.length >= 9,
  'Team 1 has starting lineup filled according to roster slots',
);
assert(res1.my_team?.bench?.length >= 1, 'Team 1 overflow picks are assigned to bench');
eq(res1.my_team?.starters?.[0]?.pos, 'QB', 'Lead starter in starting lineup is QB');
assert(
  res1.waivers_count > 0,
  'Unrostered consensus players are populated into available waiver matrix',
);

// 2. Draft State Sandbox: Auto-Registration on Multi-League Import & syncAllDraftLeaguesToManager
const stateSandbox = {
  window: {},
  globalThis: {},
  localStorage: (() => {
    const store = new Map();
    return {
      getItem: (k) => store.get(k) || null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
    };
  })(),
  document: {
    getElementById: () => null,
  },
  getDefaultSeason: () => '2026',
  fetchCalls: [],
};

stateSandbox.fetch = async (url, opts) => {
  stateSandbox.fetchCalls.push({ url, opts });
  return {
    ok: true,
    json: async () => ({ ok: true, count: 6 }),
  };
};

stateSandbox.window = stateSandbox;
stateSandbox.globalThis = stateSandbox;
vm.createContext(stateSandbox);

const draftStateCode = readFileSync('js/draft-state.js', 'utf8');
vm.runInContext(draftStateCode, stateSandbox);

assert(
  typeof stateSandbox.window.syncAllDraftLeaguesToManager === 'function',
  'Exports syncAllDraftLeaguesToManager on window',
);

// Test multi-league backup import triggers batch-add
const multiBackupPayload = {
  backupType: 'fantasy_drafter_multi_league_backup',
  manifest: {
    activeLeagueId: 'league_1',
    leagues: [
      { id: 'league_1', name: 'Dynasty Premier' },
      { id: 'league_2', name: 'Redraft High-Roller' },
      { id: 'league_3', name: 'Workplace Trophy' },
      { id: 'league_4', name: 'Superflex Showdown' },
      { id: 'league_5', name: 'Deep Sleeper Dynasty' },
      { id: 'league_6', name: 'Legacy League' },
    ],
  },
  leagues: {
    league_1: { settings: { leagueName: 'Dynasty Premier', teams: 12 } },
    league_2: { settings: { leagueName: 'Redraft High-Roller', teams: 10 } },
    league_3: { settings: { leagueName: 'Workplace Trophy', teams: 12 } },
    league_4: { settings: { leagueName: 'Superflex Showdown', teams: 12 } },
    league_5: { settings: { leagueName: 'Deep Sleeper Dynasty', teams: 14 } },
    league_6: { settings: { leagueName: 'Legacy League', teams: 12 } },
  },
};

const importRes = stateSandbox.window.importLeagueBackup(multiBackupPayload);
eq(importRes.ok, true, 'importLeagueBackup accepts 6-league multi-backup');
eq(importRes.count, 6, 'Reports 6 leagues imported');

const batchCall = stateSandbox.fetchCalls.find((c) =>
  c.url.includes('/api/manager/leagues/batch-add'),
);
assert(
  batchCall != null,
  'importLeagueBackup asynchronously posts to /api/manager/leagues/batch-add',
);
const postedBody = JSON.parse(batchCall.opts.body);
eq(postedBody.leagues?.length, 6, 'Batch-add payload contains all 6 imported leagues');

// 3. In-Season Manager State Sandbox: getUnsyncedDraftLeagues & pullDraftLeagues
const managerStateSandbox = {
  window: {},
  globalThis: {},
  localStorage: (() => {
    const store = new Map();
    // Simulate manifest with 6 draft leagues
    store.set(
      'fantasy_drafter_leagues_manifest',
      JSON.stringify({
        activeLeagueId: 'league_1',
        leagues: [
          { id: 'league_1', name: 'Dynasty Premier' },
          { id: 'league_2', name: 'Redraft High-Roller' },
          { id: 'league_3', name: 'Workplace Trophy' },
          { id: 'league_4', name: 'Superflex Showdown' },
          { id: 'league_5', name: 'Deep Sleeper Dynasty' },
          { id: 'league_6', name: 'Legacy League' },
        ],
      }),
    );
    for (let i = 1; i <= 6; i++) {
      store.set(
        `fantasy_drafter_league_league_${i}`,
        JSON.stringify({
          settings: {
            leagueName: `League ${i}`,
            teams: 12,
            platform: 'manual',
          },
          log: [],
          keepers: [],
        }),
      );
    }
    return {
      getItem: (k) => store.get(k) || null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
    };
  })(),
  document: {
    getElementById: () => null,
    querySelectorAll: () => [],
  },
  getDefaultSeason: () => '2026',
  managerFetchCalls: [],
};

managerStateSandbox.fetch = async (url, opts) => {
  managerStateSandbox.managerFetchCalls.push({ url, opts });
  if (url.includes('/api/manager/leagues/batch-add')) {
    return {
      ok: true,
      json: async () => ({ ok: true, count: 6 }),
    };
  }
  if (url.includes('/api/manager/leagues')) {
    return {
      ok: true,
      json: async () => ({
        ok: true,
        leagues: [
          { id: 'league_1', name: 'Dynasty Premier', platform: 'manual' },
          { id: 'league_demo_sleeper', name: 'Demo Sleeper', platform: 'sleeper' },
        ],
      }),
    };
  }
  return { ok: true, json: async () => ({ ok: true }) };
};

managerStateSandbox.window = managerStateSandbox;
managerStateSandbox.globalThis = managerStateSandbox;
vm.createContext(managerStateSandbox);

const managerStateCode = readFileSync('js/roster-manager-state.js', 'utf8');
vm.runInContext(managerStateCode, managerStateSandbox);

assert(
  typeof managerStateSandbox.inSeasonManager.getUnsyncedDraftLeagues === 'function',
  'Exports getUnsyncedDraftLeagues on inSeasonManager',
);
assert(
  typeof managerStateSandbox.inSeasonManager.pullDraftLeagues === 'function',
  'Exports pullDraftLeagues on inSeasonManager',
);

// Initially 1 league matches (league_1), so 5 should be unsynced
managerStateSandbox.inSeasonState.leagues = [
  { id: 'league_1', name: 'Dynasty Premier', platform: 'manual' },
];
const unsynced = managerStateSandbox.inSeasonManager.getUnsyncedDraftLeagues();
eq(unsynced.length, 5, 'getUnsyncedDraftLeagues identifies 5 un-pulled draft leagues');

// Test pullDraftLeagues
await managerStateSandbox.inSeasonManager.pullDraftLeagues();
const pullCall = managerStateSandbox.managerFetchCalls.find((c) =>
  c.url.includes('/api/manager/leagues/batch-add'),
);
assert(pullCall != null, 'pullDraftLeagues dispatches batch-add to server');

// 4. In-Season UI Sandbox: Draft Banner & Onboarding Detection
const managerUiSandbox = {
  window: {},
  globalThis: {},
  localStorage: managerStateSandbox.localStorage,
  document: {
    getElementById: () => null,
    querySelectorAll: () => [],
  },
  inSeasonState: {
    currentView: 'leagues',
    activeLeagueId: 'league_1',
    leagues: [{ id: 'league_1', name: 'Dynasty Premier', platform: 'manual' }],
  },
  inSeasonManager: managerStateSandbox.inSeasonManager,
  getLeagueList: () => [{ id: 'league_1', name: 'Dynasty Premier' }],
};

managerUiSandbox.window = managerUiSandbox;
managerUiSandbox.globalThis = managerUiSandbox;
vm.createContext(managerUiSandbox);

const managerUiCode = readFileSync('js/roster-manager-ui.js', 'utf8');
vm.runInContext(managerUiCode, managerUiSandbox);

assert(
  typeof managerUiSandbox.pullAllDraftLeagues === 'function',
  'Exports pullAllDraftLeagues action handler',
);
assert(
  typeof managerUiSandbox.pullSingleDraftLeague === 'function',
  'Exports pullSingleDraftLeague action handler',
);
assert(
  typeof managerUiSandbox.syncDraftBoardRoster === 'function',
  'Exports syncDraftBoardRoster action handler',
);

const leaguesViewHtml = managerUiSandbox.renderLeaguesView();
assert(
  leaguesViewHtml.includes('draft-import-banner'),
  'Renders draft-import-banner when unsynced draft window leagues exist',
);
assert(
  leaguesViewHtml.includes('Pull from Draft Window'),
  'Renders "Pull from Draft Window" section in onboarding panel',
);
assert(
  leaguesViewHtml.includes('pullAllDraftLeagues(this)'),
  'Includes one-click pull all draft leagues button',
);

// 5. Verify draft-ui.js saveLeagueSetup Bug Fix
const draftUiCode = readFileSync('js/draft-ui.js', 'utf8');
assert(
  !draftUiCode.includes('syncLeague(targetLeagueId)'),
  'Fixed targetLeagueId ReferenceError in saveLeagueSetup',
);
assert(
  draftUiCode.includes('syncLeague(inSeasonId)'),
  'saveLeagueSetup correctly passes inSeasonId to syncLeague',
);
assert(
  draftUiCode.includes('draft_state:'),
  'saveLeagueSetup includes draft_state payload for SQLite roster ingestion',
);

// Clean up fixture db
if (existsSync(TEST_DB)) {
  try {
    unlinkSync(TEST_DB);
  } catch (_e) {}
}

const success = finishSuite('Draft Window to In-Season Manager League Import & Sync');
if (!success) {
  process.exit(1);
}
