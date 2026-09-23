// Test Suite for Sleeper In-Season Sync, ID Extraction, Player Resolution, and UI Handlers
import { execFileSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { assert, eq, finishSuite, printSuiteHeader, resetFailures } from './test-helper.mjs';

resetFailures();
printSuiteHeader('Sleeper In-Season League Sync & Player Resolution');

const TEST_DB = resolve('tests/fixtures/test_sleeper_sync.db');
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

// 1. Sleeper ID Extraction Tests (raw, prefixed, web URL, app URL)
const idExtractionScript = `
import json, sys, os
sys.path.insert(0, os.path.abspath('.'))
from scripts import in_season_manager as mgr

ids = [
    mgr.extract_sleeper_league_id("1125219984928374784"),
    mgr.extract_sleeper_league_id("sleeper_1125219984928374784"),
    mgr.extract_sleeper_league_id("https://sleeper.com/leagues/1125219984928374784"),
    mgr.extract_sleeper_league_id("https://sleeper.app/leagues/1222367201336508416/matchup"),
    mgr.extract_sleeper_league_id("invalid_id")
]

print(json.dumps({
    "ids": ids
}))
`;

const res1 = pyRunner(idExtractionScript);
eq(res1.ids[0], '1125219984928374784', 'Extracts raw numeric Sleeper league ID');
eq(res1.ids[1], '1125219984928374784', 'Extracts ID from sleeper_ prefixed string');
eq(res1.ids[2], '1125219984928374784', 'Extracts ID from sleeper.com URL');
eq(res1.ids[3], '1222367201336508416', 'Extracts ID from sleeper.app URL with subpaths');

// 2. Sleeper Player ID & Defense Resolution
const playerResolutionScript = `
import json, sys, os
sys.path.insert(0, os.path.abspath('.'))
from scripts import in_season_manager as mgr

mgr.load_players_data()
sp_dict = mgr.load_sleeper_players()

# Test 4984 (Josh Allen)
josh_entry = sp_dict.get("4984", {})
josh_name = josh_entry.get("full_name") or josh_entry.get("name")
josh_consensus = mgr.get_player_by_name(josh_name) if josh_name else None

# Test Defense BAL (Baltimore Ravens)
bal_entry = sp_dict.get("BAL", {})
bal_name = bal_entry.get("full_name") or f"{bal_entry.get('first_name', '')} {bal_entry.get('last_name', '')}".strip()
bal_consensus = mgr.get_player_by_name(bal_name) if bal_name else None

print(json.dumps({
    "has_sleeper_dict": len(sp_dict) > 0,
    "josh_name": josh_name,
    "josh_team": josh_entry.get("team"),
    "josh_has_consensus": josh_consensus is not None,
    "josh_bye": josh_consensus.get("bye") if josh_consensus else None,
    "bal_name": bal_name,
    "bal_has_consensus": bal_consensus is not None,
    "bal_pos": bal_consensus.get("pos") if bal_consensus else None
}))
`;

const res2 = pyRunner(playerResolutionScript);
assert(res2.has_sleeper_dict, 'Sleeper player dictionary loaded successfully');
eq(res2.josh_name, 'Josh Allen', 'Sleeper ID 4984 resolves to Josh Allen');
eq(res2.josh_team, 'BUF', 'Josh Allen team is BUF');
assert(res2.josh_has_consensus, 'Josh Allen matches consensus dataset');
eq(res2.josh_bye, 7, 'Josh Allen has consensus bye week 7');
eq(res2.bal_name, 'Baltimore Ravens', 'Sleeper ID BAL resolves to Baltimore Ravens');
assert(res2.bal_has_consensus, 'Baltimore Ravens matches consensus dataset');
eq(res2.bal_pos, 'DST', 'Baltimore Ravens maps to DST position');

// 3. Database Persistence & Target League In-Place Update
const dbSyncScript = `
import json, sys, os
sys.path.insert(0, os.path.abspath('.'))
from scripts import in_season_manager as mgr

db = '${TEST_DB.replace(/\\/g, '\\\\')}'
mgr.init_db(db)

# Create pre-existing league entry as if created from League Setup modal
target_lid = "league_custom_sleeper"
mgr.save_league(
    league_id=target_lid,
    platform="sleeper",
    name="My Sleeper League",
    season="2026",
    settings={"platformLeagueId": "1354636057651445760", "scoring": "half", "teams": 12},
    my_team_id="DougC95",
    db_path=db
)

# Mock sync rosters by invoking sync_sleeper_league on real Sleeper API
# or verifying the in-place merge logic
leagues_before = mgr.get_leagues(db_path=db)
target_before = next(lg for lg in leagues_before if lg["id"] == target_lid)

# Perform sync targeting this existing league
sync_res = mgr.sync_sleeper_league(
    "1354636057651445760",
    my_username="DougC95",
    target_league_id=target_lid,
    db_path=db
)

leagues_after = mgr.get_leagues(db_path=db)
target_after = next(lg for lg in leagues_after if lg["id"] == target_lid)
snaps = mgr.get_roster_snapshots(target_lid, db_path=db)
my_team = next((r for r in snaps if str(r["team_id"]) == str(target_after.get("my_team_id"))), None)

print(json.dumps({
    "sync_ok": sync_res.get("ok"),
    "target_id": target_after["id"],
    "preserved_scoring": target_after["settings"].get("scoring"),
    "teams_synced": len(snaps),
    "my_team_found": my_team is not None,
    "my_team_owner": my_team.get("owner_name") if my_team else None,
    "starters_count": len(my_team.get("starters", [])) if my_team else 0,
    "has_named_starters": all(
        isinstance(p, dict) and not p.get("name", "").isdigit()
        for p in (my_team.get("starters", []) if my_team else [])
    ),
    "all_have_slots": all(
        bool(p.get("slot"))
        for p in (my_team.get("starters", []) if my_team else [])
    ),
    "qb_first": (my_team.get("starters", [])[0].get("slot") == "QB") if (my_team and len(my_team.get("starters", [])) > 0) else False
}))
`;

const res3 = pyRunner(dbSyncScript);
assert(res3.sync_ok, 'sync_sleeper_league executes successfully');
eq(res3.target_id, 'league_custom_sleeper', 'Preserves target league ID in SQLite');
eq(res3.preserved_scoring, 'half', 'Preserves custom settings during in-place league update');
eq(res3.teams_synced, 12, 'Synced all 12 teams in Sleeper league');
assert(res3.my_team_found, 'Matched user team by username');
eq(res3.my_team_owner, 'DougC95', 'User team owner matched to DougC95');
assert(res3.starters_count > 0, 'Populated starter players');
assert(res3.has_named_starters, 'All starters resolved to real player names, no bare numeric IDs');
assert(res3.all_have_slots, 'All Sleeper starters have slot attribute populated');
assert(res3.qb_first, 'Sleeper starters are sorted with QB in lead position');

// 4. Client State & UI Integration
const clientUiScript = execFileSync(
  process.execPath,
  [
    '-e',
    `
  const fs = require('fs');
  const vm = require('vm');
  const sandbox = {
    window: {},
    globalThis: {},
    document: {
      querySelectorAll: () => [],
      getElementById: () => null,
      querySelector: () => null
    },
    localStorage: { getItem: () => null, setItem: () => {} },
    fetch: async () => ({ ok: true, json: async () => ({ ok: true, leagues: [] }) })
  };
  vm.createContext(sandbox);
  const codeState = fs.readFileSync('js/roster-manager-state.js', 'utf8');
  vm.runInContext(codeState, sandbox);
  const codeUi = fs.readFileSync('js/roster-manager-ui.js', 'utf8');
  vm.runInContext(codeUi, sandbox);

  const mgr = sandbox.window.inSeasonManager;
  console.log(JSON.stringify({
    ok: true,
    hasSyncLeague: typeof mgr.syncLeague === 'function',
    hasRefreshActive: typeof sandbox.window.refreshActiveManagerView === 'function',
    hasSyncManagerLeague: typeof sandbox.window.syncManagerLeague === 'function',
    hasSyncDirectSleeperLeague: typeof sandbox.window.syncDirectSleeperLeague === 'function',
    hasImportDiscovered: typeof sandbox.window.importDiscoveredSleeperLeague === 'function'
  }));
`,
  ],
  { encoding: 'utf-8' },
);

const res4 = JSON.parse(clientUiScript.trim());
assert(res4.ok, 'Browser scripts evaluate in sandbox');
assert(res4.hasSyncLeague, 'inSeasonManager.syncLeague is defined');
assert(res4.hasRefreshActive, 'window.refreshActiveManagerView is defined');
assert(res4.hasSyncManagerLeague, 'window.syncManagerLeague is defined');
assert(res4.hasSyncDirectSleeperLeague, 'window.syncDirectSleeperLeague is defined');
assert(res4.hasImportDiscovered, 'window.importDiscoveredSleeperLeague is defined');

// Clean up fixture db
if (existsSync(TEST_DB)) {
  try {
    unlinkSync(TEST_DB);
  } catch (_e) {}
}

const success = finishSuite('Sleeper In-Season League Sync & Player Resolution');
if (!success) {
  process.exit(1);
}
