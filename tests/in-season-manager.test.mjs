// Test Suite for In-Season Roster Management, Date-Partitioned Snapshots,
// News Aggregation, Waiver Matrix, and Power Rankings
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
printSuiteHeader('In-Season Roster Management & Multi-League Engine');

const TEST_DB = resolve('tests/fixtures/test_in_season.db');
if (existsSync(TEST_DB)) {
  try {
    unlinkSync(TEST_DB);
  } catch (_e) {}
}

// 1. Python In-Season Manager Core Engine & SQLite Verification
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

const initAndSeedScript = `
import json, sys, os
sys.path.insert(0, os.path.abspath('.'))
from scripts import in_season_manager as mgr

mgr.init_db('${TEST_DB.replace(/\\/g, '\\\\')}')
seed_res = mgr.seed_demo_data(db_path='${TEST_DB.replace(/\\/g, '\\\\')}')
leagues = mgr.get_leagues(db_path='${TEST_DB.replace(/\\/g, '\\\\')}')

print(json.dumps({
    "ok": True,
    "seed_res": seed_res,
    "leagues_count": len(leagues),
    "leagues": leagues
}))
`;

const res1 = pyRunner(initAndSeedScript);
assert(res1.ok, 'in_season_manager initializes and seeds demo data');
eq(res1.leagues_count, 2, 'Seeded exactly 2 leagues (Sleeper + ESPN)');
assert(
  res1.leagues.some((l) => l.platform === 'sleeper'),
  'Contains Sleeper league',
);
assert(
  res1.leagues.some((l) => l.platform === 'espn'),
  'Contains ESPN league',
);

// 2. Date-Partitioned Historical Snapshots & Daily Upsert
const historyScript = `
import json, sys, os
sys.path.insert(0, os.path.abspath('.'))
from scripts import in_season_manager as mgr

db = '${TEST_DB.replace(/\\/g, '\\\\')}'
lid = 'league_demo_sleeper_dynasty'

# Fetch history for Team 1
history = mgr.get_roster_history(lid, '1', db_path=db)

# Fetch latest snapshot
latest_rosters = mgr.get_roster_snapshots(lid, db_path=db)

# Perform same-day upsert test
today = history[-1]["snapshot_date"]
initial_count = len(history)
mgr.save_roster_snapshots(lid, [{"team_id": "12", "points": 999.0, "wins": 5}], snapshot_date=today, db_path=db)
history_after_upsert = mgr.get_roster_history(lid, '12', db_path=db)
updated_team_12 = mgr.get_roster_snapshots(lid, snapshot_date=today, db_path=db)
t12_points = [r["points"] for r in updated_team_12 if r["team_id"] == "12"][0]

print(json.dumps({
    "initial_history_len": initial_count,
    "after_history_len": len(history_after_upsert),
    "updated_points": t12_points,
    "latest_teams_count": len(latest_rosters)
}))
`;

const res2 = pyRunner(historyScript);
eq(
  res2.initial_history_len,
  2,
  'History tracks multiple dates (Yesterday + Today)',
);
eq(
  res2.after_history_len,
  2,
  'Same-day refresh upserts in-place without duplicate rows',
);
eq(res2.updated_points, 999.0, 'Snapshot data successfully updated on upsert');
eq(res2.latest_teams_count, 12, 'Latest snapshot retains full 12-team roster');

// 3. Lineup Optimization & Start/Sit Advice
const lineupScript = `
import json, sys, os
sys.path.insert(0, os.path.abspath('.'))
from scripts import in_season_manager as mgr

db = '${TEST_DB.replace(/\\/g, '\\\\')}'
lid = 'league_demo_sleeper_dynasty'

team_view = mgr.get_team_view_data(lid, team_id='1', db_path=db)
print(json.dumps({
    "team_id": team_view["team_id"],
    "starters_count": len(team_view["starters"]),
    "bench_count": len(team_view["bench"]),
    "advice": team_view.get("start_sit_advice", []),
    "drop_candidates": team_view.get("drop_candidates", [])
}))
`;

const res3 = pyRunner(lineupScript);
eq(res3.team_id, '1', 'Team view resolves requested team');
assert(res3.starters_count > 0, 'Team view populates starters');
assert(res3.bench_count > 0, 'Team view populates bench');
assert(
  res3.advice.length > 0,
  'Start/Sit optimization generates advice for injured starter',
);
eq(
  res3.advice[0].type,
  'INJURY_SUB',
  'First advice flags INJURY_SUB for injured starter',
);
assert(
  res3.drop_candidates.length > 0,
  'Drop candidates identified for bench cuts',
);

// 4. Player News Aggregator & Filtering
const newsScript = `
import json, sys, os
sys.path.insert(0, os.path.abspath('.'))
from scripts import in_season_manager as mgr

db = '${TEST_DB.replace(/\\/g, '\\\\')}'
all_news = mgr.get_player_news(db_path=db)
injury_news = mgr.get_player_news(impact='injury', db_path=db)
target_player = all_news[0]["player_name"] if all_news else "Unknown"
target_news = mgr.get_player_news(player_names=[target_player], db_path=db)

print(json.dumps({
    "total_news": len(all_news),
    "injury_count": len(injury_news),
    "target_count": len(target_news),
    "first_headline": all_news[0]["headline"] if all_news else ""
}))
`;

const res4 = pyRunner(newsScript);
assert(res4.total_news >= 4, 'Aggregated news items saved in database');
assert(res4.injury_count >= 1, 'Filter by impact="injury" works');
assert(res4.target_count >= 1, 'Filter by player name matches target player');

// 5. Multi-League Waiver Wire Recommendation Matrix
const waiverScript = `
import json, sys, os
sys.path.insert(0, os.path.abspath('.'))
from scripts import in_season_manager as mgr

db = '${TEST_DB.replace(/\\/g, '\\\\')}'
waivers = mgr.get_waiver_matrix(limit=25, db_path=db)

print(json.dumps({
    "count": len(waivers),
    "has_priority": any(w.get("is_priority") for w in waivers),
    "top_player": waivers[0]["name"] if waivers else "",
    "top_available_count": waivers[0]["available_count"] if waivers else 0
}))
`;

const res5 = pyRunner(waiverScript);
assert(res5.count > 0, 'Waiver matrix generates recommendations');
assert(res5.has_priority, 'Priority recommendations flagged for waiver wire');
assert(res5.top_available_count > 0, 'Identified league availability count');

// 6. League Power Rankings & Automated Trade Matchmaker
const prScript = `
import json, sys, os
sys.path.insert(0, os.path.abspath('.'))
from scripts import in_season_manager as mgr

db = '${TEST_DB.replace(/\\/g, '\\\\')}'
lid = 'league_demo_sleeper_dynasty'
pr = mgr.get_league_power_rankings(lid, db_path=db)

top_team = pr["teams"][0]
print(json.dumps({
    "total_teams": pr["total_teams"],
    "top_team_rank": top_team["power_rank"],
    "top_team_tier": top_team["tier"],
    "has_grades": all(pos in top_team["room_grades"] for pos in ("QB", "RB", "WR", "TE")),
    "trade_matches_count": len(pr.get("trade_matches", []))
}))
`;

const res6 = pyRunner(prScript);
eq(res6.total_teams, 12, 'Power rankings evaluates all 12 teams');
eq(res6.top_team_rank, 1, 'Top team has rank 1');
eq(res6.top_team_tier, 'Contender', 'Rank 1 is tiered as Contender');
assert(
  res6.has_grades,
  'Calculates positional room grades for QB, RB, WR, TE',
);

// 7. Client-Side Browser State & UI Scripts Compilation Integrity
const stateCode = execFileSync(
  process.execPath,
  [
    '-e',
    `
  const fs = require('fs');
  const vm = require('vm');
  const sandbox = { window: {}, globalThis: {}, localStorage: { getItem: () => null, setItem: () => {} } };
  vm.createContext(sandbox);
  const codeState = fs.readFileSync('js/roster-manager-state.js', 'utf8');
  vm.runInContext(codeState, sandbox);
  const codeUi = fs.readFileSync('js/roster-manager-ui.js', 'utf8');
  vm.runInContext(codeUi, sandbox);

  const state = sandbox.window.inSeasonState;
  const mgr = sandbox.window.inSeasonManager;
  console.log(JSON.stringify({
    ok: true,
    currentView: state.currentView,
    hasSetView: typeof mgr.setView === 'function',
    hasRenderManager: typeof sandbox.window.renderManagerView === 'function'
  }));
`,
  ],
  { encoding: 'utf-8' },
);

const res7 = JSON.parse(stateCode.trim());
assert(res7.ok, 'roster-manager-state and ui evaluate in sandbox');
eq(res7.currentView, 'draft', 'Default in-season view is draft');
assert(res7.hasSetView, 'Exports setView on inSeasonManager');
assert(res7.hasRenderManager, 'Exports renderManagerView on window');

// Clean up fixture db
if (existsSync(TEST_DB)) {
  try {
    unlinkSync(TEST_DB);
  } catch (_e) {}
}

const success = finishSuite(
  'In-Season Roster Management & Multi-League Engine',
);
if (!success) {
  process.exit(1);
}
