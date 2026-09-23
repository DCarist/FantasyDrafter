// Test Suite for Waivers & Market Radar, Need Matching Tiers, Watchlist, and Positional Depth Rooms
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import vm from 'node:vm';
import { assert, eq, finishSuite, printSuiteHeader, resetFailures } from './test-helper.mjs';

resetFailures();
printSuiteHeader('Waivers & Market Radar, Need Matching & Team Rooms');

const tempDir = mkdtempSync(join(tmpdir(), 'fantasy-waivers-market-'));
const TEST_DB = join(tempDir, 'waivers.db');
try {
  const pyRunner = (script, watchlistPlayer = '') => {
    const output = execFileSync(process.execPath ? 'python' : 'python3', ['-c', script], {
      encoding: 'utf-8',
      env: { ...process.env, TEST_DB, WATCHLIST_PLAYER: watchlistPlayer },
    });
    return JSON.parse(output.trim());
  };

  // 1. Availability Exclusion & Roster Protection
  const availabilityScript = `
import json, sys, os
sys.path.insert(0, os.path.abspath('.'))
from scripts import in_season_manager as mgr

mgr.init_db(os.environ["TEST_DB"])
mgr.seed_demo_data(db_path=os.environ["TEST_DB"])

waivers = mgr.get_waiver_matrix(limit=50, db_path=os.environ["TEST_DB"])
leagues = mgr.get_leagues(db_path=os.environ["TEST_DB"])

# Get all rostered players across all leagues
conn = mgr.get_db_connection(os.environ["TEST_DB"])
cur = conn.execute("SELECT league_id, starters_json, bench_json FROM roster_snapshots")
rostered_by_league = {}
for row in cur.fetchall():
    lid = row["league_id"]
    if lid not in rostered_by_league:
        rostered_by_league[lid] = set()
    s_list = json.loads(row["starters_json"])
    b_list = json.loads(row["bench_json"])
    for p in s_list + b_list:
        if isinstance(p, dict) and p.get("name"):
            rostered_by_league[lid].add(mgr.normalize_name(p["name"]))
conn.close()

# Verify that no waiver recommendation claims availability in a league where the player is rostered
violations = []
for w in waivers:
    norm_name = mgr.normalize_name(w["name"])
    for avail in w.get("available_in", []):
        lid = avail["league_id"]
        if norm_name in rostered_by_league.get(lid, set()):
            violations.append(f"{w['name']} marked available in {lid} but is rostered!")
qb = {"name": "Test QB", "pos": "QB", "dynSF": 15, "dyn1QB": 65, "redraft": 40}
rank_sf, score_sf = mgr.calculate_player_rank_and_score(qb, "dyn_sf")
rank_1qb, score_1qb = mgr.calculate_player_rank_and_score(qb, "dyn_1qb")
rank_red, score_red = mgr.calculate_player_rank_and_score(qb, "red_ppr")
waivers_with_needs = mgr.get_waiver_matrix(needs_only=True, limit=50, db_path=os.environ["TEST_DB"])
types_found = {m["type"] for w in waivers_with_needs for m in w.get("need_matches", [])}

print(json.dumps({
    "ok": len(violations) == 0,
    "violations": violations,
    "waiver_count": len(waivers),
    "first_player": waivers[0] if waivers else None,
    "format": {
        "sf": {"rank": rank_sf, "score": score_sf},
        "one_qb": {"rank": rank_1qb, "score": score_1qb},
        "redraft": {"rank": rank_red, "score": score_red}
    },
    "needs": {
        "count": len(waivers_with_needs),
        "types_found": list(types_found),
        "all_have_matches": all(w.get("need_matches") for w in waivers_with_needs),
        "sample_match": waivers_with_needs[0]["need_matches"][0] if waivers_with_needs and waivers_with_needs[0].get("need_matches") else None
    }
}))
`;

  const res1 = pyRunner(availabilityScript);
  assert(res1.ok, 'No rostered player is marked available on waivers');
  eq(res1.violations.length, 0, 'Zero availability violations');
  assert(res1.waiver_count > 0, 'Waiver matrix produces candidates');

  // 2. Format-Aware Scoring & Dynamic Ranking
  const res2 = res1.format;
  eq(res2.sf.rank, 15, 'Dynasty SF rank is 15');
  eq(res2.one_qb.rank, 65, 'Dynasty 1QB rank is 65');
  eq(res2.redraft.rank, 40, 'Redraft rank uses the fixture redraft value');
  assert(res2.sf.score > res2.one_qb.score, 'QB has higher score in Superflex than 1QB');
  assert(res2.sf.score >= 0 && res2.sf.score <= 100, 'Score is normalized within 0-100');

  // 3. Need Matching Tiers (Injury, Bye, Upgrade, Handcuff, Empty Slot)
  const res3 = res1.needs;
  assert(res3.count > 0, 'Found waiver recommendations with need matches');
  assert(res3.all_have_matches, 'Every needs-only candidate has a matching team need');
  assert(
    res3.types_found.some((t) =>
      ['INJURY_SUB', 'UPGRADE', 'BYE_FILLER', 'HANDCUFF', 'EMPTY_SLOT'].includes(t),
    ),
    'Matches at least one authentic need tier (Injury, Upgrade, Bye, Handcuff, Empty Slot)',
  );
  assert(res3.sample_match?.icon != null, 'Need match has icon');
  assert(res3.sample_match?.tag != null, 'Need match has tag explanation');

  // 4. Waiver Watchlist & Note Persistence
  const watchlistScript = `
import json, sys, os
sys.path.insert(0, os.path.abspath('.'))
from scripts import in_season_manager as mgr
player_name = os.environ["WATCHLIST_PLAYER"]
player_key = mgr.normalize_name(player_name)

# 1. Add to watchlist
add_res = mgr.toggle_watchlist_item(player_name, note="Target if starter sits", db_path=os.environ["TEST_DB"])
wl1 = mgr.get_watchlist(db_path=os.environ["TEST_DB"])

# 2. Update note
note_res = mgr.save_watchlist_note(player_name, "Bid $18 FAAB week 4", db_path=os.environ["TEST_DB"])
wl2 = mgr.get_watchlist(db_path=os.environ["TEST_DB"])

# 3. Check waiver matrix reflects watchlist
matrix_wl = mgr.get_waiver_matrix(watchlist_only=True, db_path=os.environ["TEST_DB"])
watchlisted_item = next((w for w in matrix_wl if mgr.normalize_name(w["name"]) == player_key), None)

# 4. Remove from watchlist
del_res = mgr.toggle_watchlist_item(player_name, db_path=os.environ["TEST_DB"])
wl3 = mgr.get_watchlist(db_path=os.environ["TEST_DB"])

print(json.dumps({
    "add_res": add_res,
    "wl1": wl1,
    "wl2": wl2,
    "watchlisted_item": watchlisted_item,
    "player_key": player_key,
    "del_res": del_res,
    "wl3": wl3
}))
`;

  const res4 = pyRunner(watchlistScript, res1.first_player.name);
  eq(res4.add_res.is_watchlisted, true, 'Available player added to watchlist');
  assert(res4.wl1[res4.player_key] != null, 'Normalized player key appears in watchlist');
  eq(res4.wl2[res4.player_key], 'Bid $18 FAAB week 4', 'Watchlist note updated');
  assert(
    res4.watchlisted_item != null,
    'Watched available player remains in the filtered waiver matrix',
  );
  eq(res4.watchlisted_item?.is_watchlisted, true, 'Waiver matrix item marked watchlisted');
  eq(
    res4.watchlisted_item?.watchlist_note,
    'Bid $18 FAAB week 4',
    'Waiver matrix item includes note',
  );
  eq(res4.del_res.is_watchlisted, false, 'Available player toggled off watchlist');
  assert(res4.wl3[res4.player_key] == null, 'Removed player is absent from watchlist map');

  // 5. Team View Positional Room Hierarchy
  const teamRoomsScript = `
import json, sys, os
sys.path.insert(0, os.path.abspath('.'))
from scripts import in_season_manager as mgr

leagues = mgr.get_leagues(db_path=os.environ["TEST_DB"])
target_league = leagues[0]["id"]
team_data = mgr.get_team_view_data(target_league, db_path=os.environ["TEST_DB"])

pos_rooms = team_data.get("position_rooms", {})

print(json.dumps({
    "has_rooms": len(pos_rooms) > 0,
    "positions": list(pos_rooms.keys()),
    "qb_room": pos_rooms.get("QB", []),
    "rb_room": pos_rooms.get("RB", [])
}))
`;

  const res5 = pyRunner(teamRoomsScript);
  assert(res5.has_rooms, 'Team view provides position rooms');
  assert(res5.positions.includes('QB'), 'Includes QB room');
  assert(res5.positions.includes('RB'), 'Includes RB room');
  assert(res5.qb_room.length > 0, 'Selected seeded team has a QB room');
  eq(res5.qb_room[0].room_depth, 1, 'Top QB has room depth #1');
  eq(res5.qb_room[0].is_starter, true, 'First QB in the room starts');

  // 6. Frontend State & UI Sandbox Verification
  const ctx = {
    window: {},
    globalThis: {},
    document: {
      getElementById: () => null,
      querySelectorAll: () => [],
    },
    localStorage: {
      getItem: () => null,
      setItem: () => {},
    },
    fetch: async () => ({
      ok: true,
      json: async () => ({ ok: true, waivers: [], watchlist: {} }),
    }),
    URLSearchParams: globalThis.URLSearchParams,
    console: console,
  };
  ctx.global = ctx.window;
  vm.createContext(ctx);

  const stateCode = readFileSync(resolve('js/roster-manager-state.js'), 'utf-8');
  const uiCode = readFileSync(resolve('js/roster-manager-ui.js'), 'utf-8');

  vm.runInContext(stateCode, ctx);
  vm.runInContext(uiCode, ctx);

  const state = ctx.window.inSeasonState;
  const mgr = ctx.window.inSeasonManager;

  assert(state != null, 'inSeasonState initialized in sandbox');
  eq(state.waiverFilters.leagueId, 'all', 'Default league filter is all');
  eq(state.waiverFilters.format, 'dyn_sf', 'Default format is dyn_sf');
  eq(state.waiverFilters.pos, 'ALL', 'Default pos is ALL');
  eq(state.waiverFilters.needsOnly, false, 'Default needsOnly is false');
  eq(state.waiverFilters.watchlistOnly, false, 'Default watchlistOnly is false');

  assert(typeof mgr.toggleWatchlist === 'function', 'Exports toggleWatchlist');
  assert(typeof mgr.saveWatchlistNote === 'function', 'Exports saveWatchlistNote');
  assert(typeof mgr.fetchWatchlist === 'function', 'Exports fetchWatchlist');
  assert(typeof ctx.window.onWaiverLeagueFilter === 'function', 'Exports onWaiverLeagueFilter');
  assert(typeof ctx.window.onWaiverFormatFilter === 'function', 'Exports onWaiverFormatFilter');
  assert(typeof ctx.window.onWaiverPosFilter === 'function', 'Exports onWaiverPosFilter');
  assert(typeof ctx.window.onWaiverNeedsToggle === 'function', 'Exports onWaiverNeedsToggle');
  assert(
    typeof ctx.window.onWaiverWatchlistToggle === 'function',
    'Exports onWaiverWatchlistToggle',
  );
  assert(typeof ctx.window.openWaiverNoteModal === 'function', 'Exports openWaiverNoteModal');

  // 7. Strict Dynasty vs Redraft League Isolation
  const isolationScript = `
import json, sys, os
sys.path.insert(0, os.path.abspath('.'))
from scripts import in_season_manager as mgr

leagues = mgr.get_leagues(db_path=os.environ["TEST_DB"])
dynasty_lids = {lg["id"] for lg in leagues if lg["is_dynasty"]}
redraft_lids = {lg["id"] for lg in leagues if not lg["is_dynasty"]}

dyn_waivers = mgr.get_waiver_matrix(format_key="dyn_sf", limit=50, db_path=os.environ["TEST_DB"])
red_waivers = mgr.get_waiver_matrix(format_key="red_ppr", limit=50, db_path=os.environ["TEST_DB"])

dyn_avail_lids = {a["league_id"] for w in dyn_waivers for a in w.get("available_in", [])}
dyn_need_lids = {m["league_id"] for w in dyn_waivers for m in w.get("need_matches", [])}

red_avail_lids = {a["league_id"] for w in red_waivers for a in w.get("available_in", [])}
red_need_lids = {m["league_id"] for w in red_waivers for m in w.get("need_matches", [])}

# Format scoring fallback test: dynasty rookie should NOT inherit rank in redraft
college_stash = {"name": "College Rookie", "pos": "WR", "dynSF": 35}
dyn_rank, dyn_score = mgr.calculate_player_rank_and_score(college_stash, "dyn_sf")
red_rank, red_score = mgr.calculate_player_rank_and_score(college_stash, "red_ppr")

print(json.dumps({
    "dynasty_lids": list(dynasty_lids),
    "redraft_lids": list(redraft_lids),
    "dyn_avail_has_redraft": bool(dyn_avail_lids.intersection(redraft_lids)),
    "dyn_need_has_redraft": bool(dyn_need_lids.intersection(redraft_lids)),
    "red_avail_has_dynasty": bool(red_avail_lids.intersection(dynasty_lids)),
    "red_need_has_dynasty": bool(red_need_lids.intersection(dynasty_lids)),
    "college_stash_dyn_rank": dyn_rank,
    "college_stash_red_rank": red_rank,
    "college_stash_red_score": red_score,
}))
`;

  const res7 = pyRunner(isolationScript);
  assert(
    !res7.dyn_avail_has_redraft,
    'Dynasty waiver matrix contains 0 Redraft leagues in available_in',
  );
  assert(
    !res7.dyn_need_has_redraft,
    'Dynasty waiver matrix contains 0 Redraft leagues in need_matches',
  );
  assert(
    !res7.red_avail_has_dynasty,
    'Redraft waiver matrix contains 0 Dynasty leagues in available_in',
  );
  assert(
    !res7.red_need_has_dynasty,
    'Redraft waiver matrix contains 0 Dynasty leagues in need_matches',
  );
  eq(res7.college_stash_dyn_rank, 35, 'College prospect has rank 35 in Dynasty SF');
  eq(
    res7.college_stash_red_rank,
    999.0,
    'College prospect without redraft rank is unranked in Redraft PPR',
  );
  eq(
    res7.college_stash_red_score,
    0.0,
    'College prospect without redraft rank has 0 score in Redraft PPR',
  );

  // 8. Frontend Auto-Sync & Scope Isolation in Sandbox
  state.leagues = [
    { id: 'lg_dyn_1', name: 'Dynasty League', platform: 'sleeper', is_dynasty: true },
    { id: 'lg_red_1', name: 'Redraft League', platform: 'espn', is_dynasty: false },
  ];

  // Selecting redraft league auto-switches format to red_ppr
  await ctx.window.onWaiverLeagueFilter('lg_red_1');
  eq(state.waiverFilters.leagueId, 'lg_red_1', 'Selected redraft league');
  eq(
    state.waiverFilters.format,
    'red_ppr',
    'Auto-switched format to red_ppr on redraft league selection',
  );

  // Selecting dynasty league auto-switches format to dyn_sf
  await ctx.window.onWaiverLeagueFilter('lg_dyn_1');
  eq(state.waiverFilters.leagueId, 'lg_dyn_1', 'Selected dynasty league');
  eq(
    state.waiverFilters.format,
    'dyn_sf',
    'Auto-switched format to dyn_sf on dynasty league selection',
  );

  // Switching format to red_ppr while on dynasty league auto-resets leagueId to 'all'
  await ctx.window.onWaiverFormatFilter('red_ppr');
  eq(state.waiverFilters.format, 'red_ppr', 'Switched format to red_ppr');
  eq(
    state.waiverFilters.leagueId,
    'all',
    'Auto-reset leagueId to all when switching format category',
  );

  // 9. Standard Scoring Resolution, Needs-Only Differentiation & Instant Star Toggle
  const stdAndNeedsScript = `
import json, sys, os
sys.path.insert(0, os.path.abspath('.'))
from scripts import in_season_manager as mgr

# 1. Standard scoring league resolution
std_league = {
    "id": "lg_test_std",
    "name": "Test Standard League",
    "settings": {"scoring": "std", "qbFormat": "1qb", "rosterSlots": {"qb": 1, "rb": 2, "wr": 2, "te": 1, "k": 1, "dst": 1}}
}
std_format = mgr.get_league_format_key(std_league)

# Standard scoring player ranking
rb_test = {"name": "Test Standard RB", "pos": "RB", "red_1qb_std": 12, "red_1qb_ppr": 25}
rb_std_rank, rb_std_score = mgr.calculate_player_rank_and_score(rb_test, "red_std")
rb_ppr_rank, rb_ppr_score = mgr.calculate_player_rank_and_score(rb_test, "red_ppr")

# 2. Needs-only differentiation
all_w = mgr.get_waiver_matrix(needs_only=False, format_key="dyn_sf", limit=100, db_path=os.environ["TEST_DB"])
needs_w = mgr.get_waiver_matrix(needs_only=True, format_key="dyn_sf", limit=100, db_path=os.environ["TEST_DB"])
all_needs_have_matches = all(len(w.get("need_matches", [])) > 0 for w in needs_w)

print(json.dumps({
    "std_format": std_format,
    "rb_std_rank": rb_std_rank,
    "rb_ppr_rank": rb_ppr_rank,
    "all_needs_have_matches": all_needs_have_matches,
    "needs_count": len(needs_w),
    "all_count": len(all_w)
}))
`;

  const res9 = pyRunner(stdAndNeedsScript);
  eq(
    res9.std_format,
    'red_std',
    'get_league_format_key correctly resolves red_std for standard scoring league',
  );
  eq(res9.rb_std_rank, 12, 'Standard format resolves red_1qb_std rank (12)');
  eq(res9.rb_ppr_rank, 25, 'PPR format resolves red_1qb_ppr rank (25)');
  assert(
    res9.needs_count > 0 && res9.needs_count <= res9.all_count,
    'Needs filter retains a nonempty subset of available candidates',
  );
  assert(res9.all_needs_have_matches, '100% of candidates in needs_only query match team needs');

  // Instant watchlist star update in sandbox
  state.waivers = [
    { name: 'Kyren Williams', is_watchlisted: false, need_matches: [] },
    { name: 'Greg Dulcich', is_watchlisted: false, need_matches: [] },
  ];

  await ctx.window.toggleWaiverWatchlist('Kyren Williams');
  eq(
    state.waivers[0].is_watchlisted,
    true,
    'Kyren Williams is_watchlisted is immediately true after toggle',
  );
  assert(state.watchlist['kyren williams'] !== undefined, 'Kyren Williams in state.watchlist');

  await ctx.window.toggleWaiverWatchlist('Kyren Williams');
  eq(
    state.waivers[0].is_watchlisted,
    false,
    'Kyren Williams is_watchlisted is immediately false after toggle off',
  );
  assert(
    state.watchlist['kyren williams'] === undefined,
    'Kyren Williams removed from state.watchlist',
  );

  // League selection with format_key auto-selects red_std
  state.leagues.push({
    id: 'lg_std_1',
    name: 'Standard League',
    is_dynasty: false,
    format_key: 'red_std',
  });
  await ctx.window.onWaiverLeagueFilter('lg_std_1');
  eq(
    state.waiverFilters.format,
    'red_std',
    'Selecting standard league auto-switches format to red_std',
  );
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

const suitePassed = finishSuite('Waivers & Market Radar, Need Matching & Team Rooms');
if (!suitePassed) {
  process.exit(1);
}
