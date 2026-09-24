// Test Suite for In-Season Roster Management, Date-Partitioned Snapshots,
// News Aggregation, Waiver Matrix, and Power Rankings
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assert, eq, finishSuite, printSuiteHeader, resetFailures } from './test-helper.mjs';

resetFailures();
printSuiteHeader('In-Season Roster Management & Multi-League Engine');

const tempDir = mkdtempSync(join(tmpdir(), 'fantasy-in-season-manager-'));
const TEST_DB = join(tempDir, 'manager.db');
try {
  // 1. Python In-Season Manager Core Engine & SQLite Verification
  const pyRunner = (script) => {
    const output = execFileSync(process.execPath ? 'python' : 'python3', ['-c', script], {
      encoding: 'utf-8',
      env: { ...process.env, TEST_DB },
    });
    return JSON.parse(output.trim());
  };

  const initAndSeedScript = `
import json, sys, os
sys.path.insert(0, os.path.abspath('.'))
from scripts import in_season_manager as mgr

mgr.init_db(os.environ["TEST_DB"])
mgr.seed_demo_data(db_path=os.environ["TEST_DB"])
leagues = mgr.get_leagues(db_path=os.environ["TEST_DB"])

print(json.dumps({
    "leagues_count": len(leagues),
    "leagues": leagues
}))
`;

  const res1 = pyRunner(initAndSeedScript);
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

db = os.environ["TEST_DB"]
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
  eq(res2.initial_history_len, 2, 'History tracks multiple dates (Yesterday + Today)');
  eq(res2.after_history_len, 2, 'Same-day refresh upserts in-place without duplicate rows');
  eq(res2.updated_points, 999.0, 'Snapshot data successfully updated on upsert');
  eq(res2.latest_teams_count, 12, 'Latest snapshot retains full 12-team roster');

  // 3. Lineup Optimization & Start/Sit Advice
  const lineupScript = `
import json, sys, os
sys.path.insert(0, os.path.abspath('.'))
from scripts import in_season_manager as mgr

db = os.environ["TEST_DB"]
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
  assert(res3.advice.length > 0, 'Start/Sit optimization generates advice for injured starter');
  eq(res3.advice[0].type, 'INJURY_SUB', 'First advice flags INJURY_SUB for injured starter');
  assert(res3.drop_candidates.length > 0, 'Drop candidates identified for bench cuts');

  // 3b. Start/Sit Weekly Projections & Mixed-Scale Regression Test Suite
  const startSitRegressionScript = `
import json, sys, os
sys.path.insert(0, os.path.abspath('.'))
from scripts import in_season_manager as mgr

db = os.environ["TEST_DB"]

# Seed mock projection context for deterministic test execution
with mgr._PROJECTIONS_CACHE_LOCK:
    mgr._PROJECTIONS_CACHE.clear()
    mgr._PROJECTIONS_CACHE[("2026", 3)] = {
        "timestamp": 9999999999.0,
        "context": {
            "status": "ready",
            "reason": None,
            "season": "2026",
            "week": 3,
            "source": "Sleeper",
            "fetched_at": "2026-09-24T00:00:00Z",
            "projections_by_player_id": {
                "9221": {"player_id": "9221", "season": "2026", "week": 3, "season_type": "regular", "stats": {
                    "rush_yd": 97.65, "rush_td": 0.72, "rec": 4.33, "rec_yd": 30.45, "rec_td": 0.28, "fum_lost": 0.1
                }},
                "11237": {"player_id": "11237", "season": "2026", "week": 3, "season_type": "regular", "stats": {
                    "rush_yd": 4.9, "rush_td": 0.03, "rec": 0.34, "rec_yd": 2.76, "rec_td": 0.02, "fum_lost": 0.01
                }},
                "6797": {"player_id": "6797", "season": "2026", "week": 3, "season_type": "regular", "stats": {
                    "pass_yd": 260.0, "pass_td": 2.0, "pass_int": 1.0, "rush_yd": 20.0, "rush_td": 0.0
                }},
                "13404": {"player_id": "13404", "season": "2026", "week": 3, "season_type": "regular", "stats": {
                    "adp": 1000.0
                }},
                "w_low": {"player_id": "w_low", "season": "2026", "week": 3, "season_type": "regular", "stats": {
                    "rec": 3.0, "rec_yd": 30.0, "rec_td": 0.0
                }},
                "w_high": {"player_id": "w_high", "season": "2026", "week": 3, "season_type": "regular", "stats": {
                    "rec": 8.0, "rec_yd": 110.0, "rec_td": 1.0
                }},
                "4984": {"player_id": "4984", "season": "2026", "week": 3, "season_type": "regular", "stats": {
                    "pass_yd": 280.0, "pass_td": 2.5, "pass_int": 0.5, "rush_yd": 30.0, "rush_td": 0.5
                }},
                "9488": {"player_id": "9488", "season": "2026", "week": 3, "season_type": "regular", "stats": {
                    "rec": 8.0, "rec_yd": 90.0, "rec_td": 1.0
                }},
            }
        }
    }
    mgr._NFL_STATE_CACHE["timestamp"] = 9999999999.0
    mgr._NFL_STATE_CACHE["data"] = {"season": "2026", "week": 3, "season_type": "regular"}

# 1. Mixed-Scale League: We Like Sportz regression scenario
league_mixed = {
    "scoring": "half",
    "scoring_settings": {
        "pass_yd": 0.04, "pass_td": 4.0, "pass_int": -2.0, "rush_yd": 0.1, "rush_td": 6.0,
        "rec": 1.0, "rec_yd": 0.1, "rec_td": 6.0, "fum_lost": -2.0, "bonus_rush_yd_100": 1.0
    }
}
mgr.save_league("test_mixed_league", "sleeper", "We Like Sportz Test", season="2026", settings=league_mixed, my_team_id="4", db_path=db)
starters_mixed = [
    {"id": "6797", "name": "Justin Herbert", "pos": "QB", "slot": "QB", "rank": 12.0, "score": 96.3},
    {"id": "9221", "name": "Jahmyr Gibbs", "pos": "RB", "slot": "RB", "rank": 9.0, "score": 97.3},
    {"id": "w_low", "name": "Starter Low WR", "pos": "WR", "slot": "WR", "rank": 100.0, "score": 60.0},
]
bench_mixed = [
    {"id": "11237", "name": "Jacob Saylors", "pos": "RB", "rank": 347.0, "score": 0.0, "team": "NYG"},
    {"id": "13404", "name": "Garrett Nussmeier", "pos": "QB", "rank": 353.3, "score": 0.0, "team": "KC"},
    {"id": "iosivas", "name": "Andrei Iosivas", "pos": "WR", "rank": 287.0, "score": 4.7, "team": "CIN"},
    {"id": "w_high", "name": "Bench High WR", "pos": "WR", "rank": 40.0, "score": 85.0, "team": "LAR"},
]
mgr.save_roster_snapshots("test_mixed_league", [{
    "team_id": "4", "owner_name": "Test", "team_name": "Team 4",
    "starters": starters_mixed, "bench": bench_mixed, "taxi": [], "ir": [], "points": 100.0, "wins": 1, "losses": 0
}], snapshot_date="2026-09-24", db_path=db)
tv_mixed = mgr.get_team_view_data("test_mixed_league", team_id="4", db_path=db)

# 2. Unsupported Scoring Rule League
league_unsupported = {
    "scoring": "half",
    "scoring_settings": {
        "pass_yd": 0.04, "rush_yd": 0.1, "rec": 0.5, "custom_super_td_bonus": 10.0
    }
}
mgr.save_league("test_unsupported", "sleeper", "Unsupported Scoring League", season="2026", settings=league_unsupported, my_team_id="1", db_path=db)
mgr.save_roster_snapshots("test_unsupported", [{
    "team_id": "1", "owner_name": "Test", "team_name": "Team 1",
    "starters": starters_mixed, "bench": bench_mixed, "taxi": [], "ir": [], "points": 100.0, "wins": 1, "losses": 0
}], snapshot_date="2026-09-24", db_path=db)
tv_unsupported = mgr.get_team_view_data("test_unsupported", team_id="1", db_path=db)

# 3. ESPN Restricted FLEX and Availability Hazards
espn_settings = {
    "scoring": "ppr",
    "rosterSlots": {"qb": 1, "rb": 1, "wr": 1, "te": 1, "flex": 1},
    "scoring_settings": {
        "scoringItems": [
            {"statId": 3, "points": 0.04, "pointsOverrides": {}},
            {"statId": 4, "points": 4.0, "pointsOverrides": {}},
            {"statId": 24, "points": 0.1, "pointsOverrides": {}},
            {"statId": 25, "points": 6.0, "pointsOverrides": {}},
            {"statId": 42, "points": 0.1, "pointsOverrides": {}},
            {"statId": 43, "points": 6.0, "pointsOverrides": {}},
            {"statId": 53, "points": 1.0, "pointsOverrides": {}},
        ]
    }
}
mgr.save_league("test_espn_hazards", "espn", "ESPN Hazards League", season="2026", settings=espn_settings, my_team_id="1", db_path=db)

conn = mgr.get_db_connection(db)
sched_rows = [
    ("DET", 2026, json.dumps([{"week": 3, "game_date": "2026-09-27T17:00Z"}])),
    ("KC", 2026, json.dumps([{"week": 3, "game_date": "2026-09-27T17:00Z"}])),
    ("BUF", 2026, json.dumps([{"week": 3, "game_date": "2026-09-27T17:00Z"}])),
    ("DAL", 2026, json.dumps([{"week": 4, "game_date": "2026-10-04T17:00Z"}])),
]
with conn:
    for team, s_year, s_json in sched_rows:
        conn.execute("INSERT OR REPLACE INTO nfl_team_schedules (team, season, schedule_json, updated_at) VALUES (?, ?, ?, '2026-09-24')", (team, s_year, s_json))

starters_espn = [
    {"name": "Dak Prescott", "pos": "QB", "team": "DAL", "slot": "SUPERFLEX"},
    {"name": "Jahmyr Gibbs", "pos": "RB", "team": "DET", "slot": "FLEX", "lineupSlotId": 3, "injury": {"status": "OUT"}},
    {"name": "Christian McCaffrey", "pos": "RB", "team": "SF", "slot": "RB", "injury": {"status": "QUESTIONABLE"}},
]
bench_espn = [
    {"name": "Josh Allen", "pos": "QB", "team": "BUF", "slot": "BENCH"},
    {"name": "Sam LaPorta", "pos": "TE", "team": "DET", "slot": "BENCH"},
]
mgr.save_roster_snapshots("test_espn_hazards", [{
    "team_id": "1", "owner_name": "Test", "team_name": "Team 1",
    "starters": starters_espn, "bench": bench_espn, "taxi": [], "ir": [], "points": 100.0, "wins": 1, "losses": 0
}], snapshot_date="2026-09-24", db_path=db)
tv_espn = mgr.get_team_view_data("test_espn_hazards", team_id="1", db_path=db)

print(json.dumps({
    "mixed_advice": tv_mixed.get("start_sit_advice", []),
    "mixed_drops": tv_mixed.get("drop_candidates", []),
    "mixed_ctx": tv_mixed.get("recommendation_context", {}),
    "unsupported_ctx": tv_unsupported.get("recommendation_context", {}),
    "espn_advice": tv_espn.get("start_sit_advice", []),
}))
`;

  const res3b = pyRunner(startSitRegressionScript);
  const mixedAdvice = res3b.mixed_advice;
  const mixedDrops = res3b.mixed_drops;
  const mixedCtx = res3b.mixed_ctx;
  const unsupportedCtx = res3b.unsupported_ctx;
  const espnAdvice = res3b.espn_advice;

  eq(mixedCtx.status, 'ready', 'Mixed league with all starters projected has ready status');
  eq(mixedCtx.reason, null, 'No missing projection warning when all starters are projected');
  // 1. Assert neither reported bogus swap is present
  assert(
    !mixedAdvice.some(
      (a) => a.bench_player === 'Jacob Saylors' && a.starter_player === 'Jahmyr Gibbs',
    ),
    'Regression fix: Jacob Saylors is never recommended over Jahmyr Gibbs',
  );
  assert(
    !mixedAdvice.some(
      (a) => a.bench_player === 'Garrett Nussmeier' && a.starter_player === 'Justin Herbert',
    ),
    'Regression fix: Garrett Nussmeier is never recommended over Justin Herbert',
  );

  // 2. Assert zero-score, low-ranked bench player is prioritized in drop candidates over positive-score asset
  assert(mixedDrops.length >= 2, 'Drop candidates populated');
  const saylorsDrop = mixedDrops.find((d) => d.name === 'Jacob Saylors');
  const iosivasDrop = mixedDrops.find((d) => d.name === 'Andrei Iosivas');
  assert(saylorsDrop != null, 'Jacob Saylors (score 0.0) is flagged as a drop candidate');
  assert(
    iosivasDrop == null,
    'Andrei Iosivas (score 4.7) is not in bottom drop candidates ahead of zero-score players',
  );

  // 3. Assert verified legal upgrade with guaranteed edge >= 3.0
  const upgradeAdv = mixedAdvice.find((a) => a.type === 'UPGRADE_START');
  assert(upgradeAdv != null, 'Legal upgrade advice generated for guaranteed gain >= 3.0');
  eq(
    upgradeAdv.bench_player,
    'Bench High WR',
    'Upgrade selects eligible bench player with higher points',
  );
  eq(
    upgradeAdv.starter_player,
    'Starter Low WR',
    'Upgrade replaces starter with lower projected points',
  );
  assert(upgradeAdv.guaranteed_gain >= 3.0, 'Upgrade guarantees at least 3.0 pt safe gain');
  assert(
    upgradeAdv.starter_points.lower != null && upgradeAdv.starter_points.upper != null,
    'Provides starter point bounds',
  );
  assert(
    upgradeAdv.bench_points.lower != null && upgradeAdv.bench_points.upper != null,
    'Provides bench point bounds',
  );

  // 4. Assert unsupported scoring marks status='unavailable' with reason='UNSUPPORTED_SCORING'
  eq(unsupportedCtx.status, 'unavailable', 'Unsupported scoring sets status to unavailable');
  eq(
    unsupportedCtx.reason,
    'UNSUPPORTED_SCORING',
    'Unsupported scoring sets reason code to UNSUPPORTED_SCORING',
  );

  // 5. Assert ESPN restricted flex & hazard handling
  const byeSub = espnAdvice.find((a) => a.type === 'BYE_SUB');
  assert(byeSub != null, 'BYE starter Dak Prescott triggers BYE_SUB');
  eq(byeSub.bench_player, 'Josh Allen', 'Eligible active bench QB substitutes for BYE starter');

  const restrictedHazard = espnAdvice.find((a) => a.starter_player === 'Jahmyr Gibbs');
  assert(restrictedHazard != null, 'OUT starter Jahmyr Gibbs has an alert card');
  eq(
    restrictedHazard.type,
    'LINEUP_HAZARD',
    'Restricted flex prevents ineligible bench TE from substituting',
  );
  eq(
    restrictedHazard.bench_player,
    null,
    'No illegal substitution made into restricted flex slotId 3',
  );

  const cmcAdv = espnAdvice.find((a) => a.starter_player === 'Christian McCaffrey');
  eq(cmcAdv, undefined, 'Questionable starter Christian McCaffrey does not trigger auto-sit');

  // 3c. Live Database League Coverage: Nifty Fifty's & We Like Sportz
  const liveDbRegressionScript = `
import json, sys, os
sys.path.insert(0, os.path.abspath('.'))
from scripts import in_season_manager as mgr

# Clear projection cache to ensure live execution
mgr.clear_projection_cache()

nifty_tv = mgr.get_team_view_data('league_1789304413980_1ml7l')
sportz_tv = mgr.get_team_view_data('league_1789957409670_oqnz8')

print(json.dumps({
    "nifty_ctx": nifty_tv.get("recommendation_context", {}),
    "nifty_advice": nifty_tv.get("start_sit_advice", []),
    "nifty_starters_count": len(nifty_tv.get("starters", [])),
    "sportz_ctx": sportz_tv.get("recommendation_context", {}),
    "sportz_advice": sportz_tv.get("start_sit_advice", []),
}))
`;

  const res3c = pyRunner(liveDbRegressionScript);
  const niftyCtx = res3c.nifty_ctx;
  const niftyAdvice = res3c.nifty_advice;
  const sportzCtx = res3c.sportz_ctx;
  const sportzAdvice = res3c.sportz_advice;

  // Nifty Fifty's standard ESPN league
  eq(niftyCtx.status, 'ready', 'Nifty Fiftys league has ready status');
  eq(niftyCtx.reason, 'NO_SAFE_EDGE', 'Nifty Fiftys optimal lineup reports NO_SAFE_EDGE reason');
  eq(niftyAdvice.length, 0, 'Nifty Fiftys optimal lineup has 0 swap recommendations');
  eq(res3c.nifty_starters_count, 9, 'All 9 starters present in Nifty Fiftys');

  // We Like Sportz dynasty Sleeper league
  eq(sportzCtx.status, 'ready', 'We Like Sportz league has ready status');
  assert(
    sportzAdvice.some(
      (a) =>
        a.type === 'UPGRADE_START' &&
        a.bench_player === 'Travis Kelce' &&
        a.starter_player === 'Pat Freiermuth',
    ),
    'Recommends Travis Kelce over Pat Freiermuth for projected edge',
  );
  assert(
    !sportzAdvice.some((a) => a.bench_player === 'Jacob Saylors'),
    'Never recommends Jacob Saylors',
  );
  assert(
    !sportzAdvice.some((a) => a.bench_player === 'Garrett Nussmeier'),
    'Never recommends Garrett Nussmeier',
  );
  // 4. Player News Aggregator & Filtering
  const newsScript = `
import json, sys, os
sys.path.insert(0, os.path.abspath('.'))
from scripts import in_season_manager as mgr

db = os.environ["TEST_DB"]
all_news = mgr.get_player_news(db_path=db)
injury_news = mgr.get_player_news(impact='injury', db_path=db)
target_player = all_news[0]["player_name"] if all_news else "Unknown"
target_news = mgr.get_player_news(player_names=[target_player], db_path=db)
waivers = mgr.get_waiver_matrix(limit=25, db_path=db)
pr = mgr.get_league_power_rankings('league_demo_sleeper_dynasty', db_path=db)
top_team = pr["teams"][0]

print(json.dumps({
    "total_news": len(all_news),
    "injury_count": len(injury_news),
    "target_count": len(target_news),
    "first_headline": all_news[0]["headline"] if all_news else "",
    "only_injuries": all(item["impact"] == "injury" for item in injury_news),
    "only_target": all(mgr.normalize_name(item["player_name"]) == mgr.normalize_name(target_player) for item in target_news),
    "waivers": {
        "count": len(waivers),
        "has_priority": any(w.get("is_priority") for w in waivers),
        "top_available_count": waivers[0]["available_count"] if waivers else 0
    },
    "power": {
        "total_teams": pr["total_teams"],
        "top_team_rank": top_team["power_rank"],
        "top_team_tier": top_team["tier"],
        "has_grades": all(pos in top_team["room_grades"] for pos in ("QB", "RB", "WR", "TE"))
    }
}))
`;

  const res4 = pyRunner(newsScript);
  assert(res4.total_news >= 4, 'Aggregated news items saved in database');
  assert(res4.injury_count >= 1, 'Filter by impact="injury" works');
  assert(res4.target_count >= 1, 'Filter by player name matches target player');
  assert(res4.only_injuries, 'Impact filter excludes non-injury news');
  assert(res4.only_target, 'Player filter excludes stories about other players');

  // 5. Multi-League Waiver Wire Recommendation Matrix
  const res5 = res4.waivers;
  assert(res5.count > 0, 'Waiver matrix generates recommendations');
  assert(res5.has_priority, 'Priority recommendations flagged for waiver wire');
  assert(res5.top_available_count > 0, 'Identified league availability count');

  // 6. League Power Rankings & Automated Trade Matchmaker
  const res6 = res4.power;
  eq(res6.total_teams, 12, 'Power rankings evaluates all 12 teams');
  eq(res6.top_team_rank, 1, 'Top team has rank 1');
  eq(res6.top_team_tier, 'Contender', 'Rank 1 is tiered as Contender');
  assert(res6.has_grades, 'Calculates positional room grades for QB, RB, WR, TE');

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
    currentView: state.currentView,
    hasSetView: typeof mgr.setView === 'function',
    hasRenderManager: typeof sandbox.window.renderManagerView === 'function'
  }));
`,
    ],
    { encoding: 'utf-8' },
  );

  const res7 = JSON.parse(stateCode.trim());
  eq(res7.currentView, 'draft', 'Default in-season view is draft');
  assert(res7.hasSetView, 'Exports setView on inSeasonManager');
  assert(res7.hasRenderManager, 'Exports renderManagerView on window');
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

const success = finishSuite('In-Season Roster Management & Multi-League Engine');
if (!success) {
  process.exit(1);
}
