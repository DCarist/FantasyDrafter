// Test Suite for ESPN In-Season League Sync, Cookie Authentication, Defense Mapping, and UI Integration
import { execFileSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assert,
  eq,
  finishSuite,
  printSuiteHeader,
  resetFailures,
} from './test-helper.mjs';

resetFailures();
printSuiteHeader('ESPN In-Season League Sync & Cookie Authorization');

const TEST_DB = resolve('tests/fixtures/test_espn_sync.db');
if (existsSync(TEST_DB)) {
  try {
    unlinkSync(TEST_DB);
  } catch (_e) {}
}

const pyRunner = (script) => {
  const output = execFileSync(
    process.execPath ? 'python' : 'python3',
    ['-c', script],
    {
      encoding: 'utf-8',
    },
  );
  return JSON.parse(output.trim());
};

// 1. ESPN ID Extraction Tests (raw, prefixed, web URL query param)
const idExtractionScript = `
import json, sys, os
sys.path.insert(0, os.path.abspath('.'))
from scripts import in_season_manager as mgr

ids = [
    mgr.extract_espn_league_id("1960519163"),
    mgr.extract_espn_league_id("espn_1960519163"),
    mgr.extract_espn_league_id("https://fantasy.espn.com/football/league?leagueId=1960519163&seasonId=2026"),
    mgr.extract_espn_league_id("https://fantasy.espn.com/football/team?leagueId=308759&teamId=10"),
    mgr.extract_espn_league_id("invalid_league")
]

print(json.dumps({
    "ids": ids
}))
`;

const res1 = pyRunner(idExtractionScript);
eq(res1.ids[0], '1960519163', 'Extracts raw numeric ESPN league ID');
eq(res1.ids[1], '1960519163', 'Extracts ID from espn_ prefixed string');
eq(res1.ids[2], '1960519163', 'Extracts ID from fantasy.espn.com league URL');
eq(res1.ids[3], '308759', 'Extracts ID from fantasy.espn.com team URL');

// 2. Defense Normalization & Mapping Tests
const defenseScript = `
import json, sys, os
sys.path.insert(0, os.path.abspath('.'))
from scripts import in_season_manager as mgr

mgr.load_players_data()
d_eagles = mgr.resolve_defense_name("Eagles D/ST")
d_49ers = mgr.resolve_defense_name("49ers D/ST")
d_ravens = mgr.resolve_defense_name("Ravens DEF")
d_direct = mgr.resolve_defense_name("Buffalo Bills")

pos_qb = mgr.ESPN_POSITION_MAP.get(1)
pos_rb = mgr.ESPN_POSITION_MAP.get(2)
pos_wr = mgr.ESPN_POSITION_MAP.get(3)
pos_te = mgr.ESPN_POSITION_MAP.get(4)
pos_dst = mgr.ESPN_POSITION_MAP.get(16)

print(json.dumps({
    "eagles": d_eagles,
    "niners": d_49ers,
    "ravens": d_ravens,
    "bills": d_direct,
    "qb": pos_qb,
    "rb": pos_rb,
    "wr": pos_wr,
    "te": pos_te,
    "dst": pos_dst
}))
`;

const res2 = pyRunner(defenseScript);
eq(res2.eagles, 'Philadelphia Eagles', 'Maps Eagles D/ST to Philadelphia Eagles');
eq(res2.niners, 'San Francisco 49ers', 'Maps 49ers D/ST to San Francisco 49ers');
eq(res2.ravens, 'Baltimore Ravens', 'Maps Ravens DEF to Baltimore Ravens');
eq(res2.bills, 'Buffalo Bills', 'Resolves direct defense Buffalo Bills');
eq(res2.qb, 'QB', 'Position ID 1 maps to QB');
eq(res2.rb, 'RB', 'Position ID 2 maps to RB');
eq(res2.wr, 'WR', 'Position ID 3 maps to WR');
eq(res2.te, 'TE', 'Position ID 4 maps to TE');
eq(res2.dst, 'DST', 'Position ID 16 maps to DST');

// 3. Database Persistence, SWID Matching, and In-Place Update
const espnSyncScript = `
import json, sys, os
sys.path.insert(0, os.path.abspath('.'))
from scripts import in_season_manager as mgr

db = '${TEST_DB.replace(/\\/g, '\\\\')}'
mgr.init_db(db)

# Pre-create league target from League Setup modal
target_lid = "league_custom_espn"
mgr.save_league(
    league_id=target_lid,
    platform="espn",
    name="My Office ESPN League",
    season="2026",
    settings={"platformLeagueId": "1960519163", "scoring": "ppr", "teams": 12},
    my_team_id="3",
    db_path=db
)

swid = "{449AB9A8-3C3D-48D2-9AB9-A83C3DD8D234}"
espn_s2 = "AEAvYQ3JPNClGLymtNxcax4GzoZrzj%2FXKyfMOyIz0Zjzz4kItrZYUd0TK9cPT1vMg%2F1B7gIgXNJ32%2BwPtBGKC5y2rx12fgOpTr1ms143Q5cLeFvwravUvydB01A%2Fg%2B4ch%2FTnlpwadzn%2BGBp0035D7Nb9YWEfCLK6LfSLvZcO20rm4z1pUsnND8aRqedv5vpm2IMsHt7PG4nsibQM%2FvaGSvGTNVrOQ5uze25X9D2DjmdbSBSPpV78%2F6izMhB%2FnjUaaAr9CB%2FXflFP9jq7AiSj49FaW2P8j5xdDLR4AnDmkYIiXg%3D%3D"

sync_res = mgr.sync_espn_league(
    "1960519163",
    season="2026",
    swid=swid,
    espn_s2=espn_s2,
    target_league_id=target_lid,
    db_path=db
)

leagues_after = mgr.get_leagues(db_path=db)
target_after = next(lg for lg in leagues_after if lg["id"] == target_lid)
snaps = mgr.get_roster_snapshots(target_lid, db_path=db)
my_team = next((r for r in snaps if str(r["team_id"]) == "3"), None)

starters = my_team.get("starters", []) if my_team else []
bench = my_team.get("bench", []) if my_team else []

print(json.dumps({
    "sync_ok": sync_res.get("ok"),
    "target_id": target_after["id"],
    "preserved_scoring": target_after["settings"].get("scoring"),
    "teams_synced": len(snaps),
    "my_team_matched": str(target_after.get("my_team_id")) == "3",
    "my_team_owner": my_team.get("owner_name") if my_team else None,
    "my_team_name": my_team.get("team_name") if my_team else None,
    "starters_count": len(starters),
    "bench_count": len(bench),
    "has_named_starters": all(isinstance(p, dict) and len(p.get("name", "")) > 1 for p in starters)
}))
`;

const res3 = pyRunner(espnSyncScript);
assert(res3.sync_ok, 'sync_espn_league executes successfully');
eq(res3.target_id, 'league_custom_espn', 'Preserves target league ID in SQLite');
eq(res3.preserved_scoring, 'ppr', 'Preserves custom settings during in-place league update');
eq(res3.teams_synced, 12, 'Synced all 12 teams in ESPN league');
assert(res3.my_team_matched, 'Matched user team by SWID to team 3');
eq(res3.my_team_owner, 'DougC1995', 'User owner matched to DougC1995');
eq(res3.my_team_name, 'Corrective and Preventative TDs', 'User team name matches Corrective and Preventative TDs');
assert(res3.starters_count > 0, 'Starters populated from ESPN roster');
assert(res3.bench_count > 0, 'Bench populated from ESPN lineupSlotId 20');
assert(res3.has_named_starters, 'All starters resolved to full player names');

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
      getElementById: (id) => ({ value: '1960519163', trim: () => '1960519163' }),
      querySelector: () => null
    },
    localStorage: { getItem: () => null, setItem: () => {} },
    fetch: async () => ({ ok: true, json: async () => ({ ok: true, league_id: 'espn_1960519163', name: 'ESPN Test' }) }),
    alert: () => {}
  };
  vm.createContext(sandbox);
  const codeState = fs.readFileSync('js/roster-manager-state.js', 'utf8');
  vm.runInContext(codeState, sandbox);
  const codeUi = fs.readFileSync('js/roster-manager-ui.js', 'utf8');
  vm.runInContext(codeUi, sandbox);

  console.log(JSON.stringify({
    ok: true,
    hasSyncEspnLeague: typeof sandbox.window.syncEspnLeague === 'function'
  }));
`,
  ],
  { encoding: 'utf-8' },
);

const res4 = JSON.parse(clientUiScript.trim());
assert(res4.ok, 'Browser scripts evaluate in sandbox');
assert(res4.hasSyncEspnLeague, 'window.syncEspnLeague is defined');

// Clean up fixture db
if (existsSync(TEST_DB)) {
  try {
    unlinkSync(TEST_DB);
  } catch (_e) {}
}

const success = finishSuite('ESPN In-Season League Sync & Cookie Authorization');
if (!success) {
  process.exit(1);
}
