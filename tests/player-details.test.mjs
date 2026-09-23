// Test Suite for Player Details Intelligence Dossier
// Covers: Backend Dossier Engine, 18-Week Schedules, 2026 Game Logs & Stats,
// Depth Chart Unit Rooms, Defensive Matchup Rankings, Multi-League Portfolio Matrix,
// and Frontend Dossier Modal Rendering & Tab Navigation.

import { execFileSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { assert, eq, finishSuite, printSuiteHeader, resetFailures } from './test-helper.mjs';

resetFailures();
printSuiteHeader('Player Details Intelligence Dossier & Matchup Engine');

const TEST_DB = resolve('tests/fixtures/test_player_details.db');
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

// ----------------------------------------------------------------------------
// 1. Pipeline Initialization & Database Schema
// ----------------------------------------------------------------------------
const initScript = `
import json, sys, os
sys.path.insert(0, os.path.abspath('.'))
from scripts import in_season_manager as mgr

mgr.init_db('${TEST_DB.replace(/\\/g, '\\\\')}')
mgr.seed_demo_data(db_path='${TEST_DB.replace(/\\/g, '\\\\')}')

# Sync baseline NFL schedules and weekly stats
sched_count = mgr.sync_nfl_schedules(season=2026, db_path='${TEST_DB.replace(/\\/g, '\\\\')}')
logs_count = mgr.sync_nfl_weekly_stats(season=2026, weeks=[1, 2], db_path='${TEST_DB.replace(/\\/g, '\\\\')}')
def_count = mgr.calculate_defensive_rankings(season=2026, db_path='${TEST_DB.replace(/\\/g, '\\\\')}')

conn = mgr.get_db_connection('${TEST_DB.replace(/\\/g, '\\\\')}')
cur = conn.cursor()
cur.execute("SELECT COUNT(*) FROM nfl_team_schedules")
total_sched = cur.fetchone()[0]
cur.execute("SELECT COUNT(*) FROM player_game_logs")
total_logs = cur.fetchone()[0]
cur.execute("SELECT COUNT(*) FROM defensive_rankings")
total_def = cur.fetchone()[0]
conn.close()

print(json.dumps({
    "ok": True,
    "total_sched": total_sched,
    "total_logs": total_logs,
    "total_def": total_def
}))
`;

const res1 = pyRunner(initScript);
assert(res1.ok, 'Pipeline initializes and seeds SQLite tables');
assert(res1.total_sched === 32, 'NFL schedules contains rows for all 32 teams');
assert(res1.total_logs > 0, 'Player game logs populated for 2026 weeks');
assert(res1.total_def >= 32 * 4, 'Defensive rankings computed for all teams and positions');

// ----------------------------------------------------------------------------
// 2. QB Dossier Engine (Baker Mayfield)
// ----------------------------------------------------------------------------
const qbDossierScript = `
import json, sys, os
sys.path.insert(0, os.path.abspath('.'))
from scripts import in_season_manager as mgr

dossier = mgr.get_player_details('Baker Mayfield', db_path='${TEST_DB.replace(/\\/g, '\\\\')}')
print(json.dumps(dossier))
`;

const qbDossier = pyRunner(qbDossierScript);
assert(qbDossier != null, 'QB dossier returned successfully');
eq(qbDossier.player.name, 'Baker Mayfield', 'Dossier player name matches');
eq(qbDossier.player.pos, 'QB', 'Dossier player pos matches');
eq(qbDossier.player.team, 'TB', 'Dossier player NFL team is TB');
assert(qbDossier.player.bye != null, 'Player bye week exists');

// Verify Game Logs
assert(Array.isArray(qbDossier.game_logs), 'Game logs is an array');
assert(qbDossier.game_logs.length >= 2, 'Has at least 2 weekly game logs (W1, W2)');
const w1 = qbDossier.game_logs.find((g) => g.week === 1);
assert(w1 != null, 'Week 1 game log found');
assert(w1.snaps > 0, 'Week 1 snaps recorded');
assert(w1.snap_pct > 0, 'Week 1 snap pct recorded');
assert(w1.fantasy_pts_ppr > 0, 'Week 1 fantasy points recorded');
assert(w1.stats != null, 'Week 1 detailed stats object exists');
assert(w1.stats.pass_att != null, 'Pass attempts recorded');
assert(w1.stats.pass_yd != null, 'Pass yards recorded');

// Verify Season Summary
const qbSummary = qbDossier.season_summary;
assert(qbSummary.games_played >= 2, 'Summary games played >= 2');
assert(qbSummary.total_snaps > 0, 'Summary total snaps > 0');
assert(qbSummary.avg_snap_pct > 0, 'Summary avg snap pct > 0');
assert(qbSummary.pts_ppr_total > 0, 'Summary PPR total points > 0');
assert(qbSummary.pts_ppr_avg > 0, 'Summary PPR average points > 0');
assert(qbSummary.pass_yd_total > 0, 'Summary total passing yards > 0');

// Verify Next Matchup Card
const nextM = qbDossier.next_matchup;
assert(nextM != null, 'Next matchup card generated');
eq(nextM.week, 3, 'Next matchup is Week 3');
assert(nextM.opponent && nextM.opponent !== 'BYE', 'Next matchup has valid opponent');
assert(['home', 'away'].includes(nextM.home_away), 'Next matchup specifies home or away');
assert(nextM.defensive_rank != null, 'Defensive ranking attached to next matchup');
assert(
  nextM.defensive_rank.rank >= 1 && nextM.defensive_rank.rank <= 32,
  'Defensive rank between 1 and 32',
);
assert(
  ['favorable', 'neutral', 'tough'].includes(nextM.defensive_rank.tier),
  'Defensive tier valid',
);

// Verify Official Depth Chart Room
const depth = qbDossier.depth_chart;
assert(depth != null, 'Depth chart data generated');
eq(depth.team, 'TB', 'Depth chart team matches TB');
eq(depth.pos, 'QB', 'Depth chart pos matches QB');
eq(depth.my_rank, 1, 'Baker Mayfield is QB1 on depth chart');
assert(Array.isArray(depth.players) && depth.players.length >= 1, 'Depth chart contains players');
assert(depth.handcuff_note && depth.handcuff_note.length > 5, 'Handcuff analysis note generated');

// Verify 18-Week Schedule
const sched = qbDossier.schedule;
assert(Array.isArray(sched), 'Schedule is an array');
eq(sched.length, 18, 'Schedule contains exactly 18 weeks');
const byeWk = sched.find((g) => g.opponent === 'BYE');
assert(byeWk != null, 'Schedule includes the official bye week');

// Verify Research Links
const links = qbDossier.links;
assert(links.espn.includes('espn.com'), 'ESPN link generated');
assert(links.sleeper.includes('sleeper.com'), 'Sleeper link generated');
assert(links.fantasypros.includes('fantasypros.com'), 'FantasyPros link generated');
assert(links.pfr.includes('pro-football-reference.com'), 'PFR link generated');

// ----------------------------------------------------------------------------
// 3. WR / Skill Player Dossier Engine (CeeDee Lamb)
// ----------------------------------------------------------------------------
const wrDossierScript = `
import json, sys, os
sys.path.insert(0, os.path.abspath('.'))
from scripts import in_season_manager as mgr

dossier = mgr.get_player_details('CeeDee Lamb', db_path='${TEST_DB.replace(/\\/g, '\\\\')}')
print(json.dumps(dossier))
`;

const wrDossier = pyRunner(wrDossierScript);
assert(wrDossier != null, 'WR dossier returned successfully');
eq(wrDossier.player.name, 'CeeDee Lamb', 'CeeDee Lamb name matches');
eq(wrDossier.player.pos, 'WR', 'CeeDee Lamb pos is WR');
eq(wrDossier.player.team, 'DAL', 'CeeDee Lamb team is DAL');

// WR game logs should include receiving targets, catches, air yards, and YAC
assert(wrDossier.game_logs.length >= 2, 'CeeDee Lamb has >= 2 game logs');
const cdW1 = wrDossier.game_logs[0];
assert(cdW1.stats.rec_tgt != null, 'WR log tracks targets');
assert(cdW1.stats.rec != null, 'WR log tracks receptions');
assert(cdW1.stats.rec_yd != null, 'WR log tracks receiving yards');
assert(wrDossier.season_summary.rec_tgt_total != null, 'WR summary tracks targets');

// ----------------------------------------------------------------------------
// 4. Multi-League Portfolio Cross-Referencing
// ----------------------------------------------------------------------------
const portfolioScript = `
import json, sys, os
sys.path.insert(0, os.path.abspath('.'))
from scripts import in_season_manager as mgr

# Josh Allen is seeded on the demo Sleeper roster
dossier_allen = mgr.get_player_details('Josh Allen', db_path='${TEST_DB.replace(/\\/g, '\\\\')}')

# Bryce Young is an available free agent on waivers
dossier_bryce = mgr.get_player_details('Bryce Young', db_path='${TEST_DB.replace(/\\/g, '\\\\')}')

print(json.dumps({
    "allen_port": dossier_allen["portfolio"],
    "bryce_port": dossier_bryce["portfolio"]
}))
`;

const portRes = pyRunner(portfolioScript);
assert(
  portRes.allen_port.rostered.length > 0,
  'Josh Allen is correctly marked rostered in user league',
);
eq(portRes.allen_port.rostered[0].platform, 'sleeper', 'Rostered platform is Sleeper');
assert(
  portRes.bryce_port.waivers.length > 0,
  'Bryce Young is correctly listed in available waivers pool',
);

// ----------------------------------------------------------------------------
// 5. Frontend Sandbox & UI Modal Rendering
// ----------------------------------------------------------------------------
const setupSandbox = () => {
  const elements = {};
  const createElement = (id, tag = 'div') => {
    const el = {
      id,
      tagName: tag.toUpperCase(),
      style: {},
      classList: {
        classes: new Set(),
        add(c) {
          this.classes.add(c);
        },
        remove(c) {
          this.classes.delete(c);
        },
        contains(c) {
          return this.classes.has(c);
        },
      },
      innerHTML: '',
      className: '',
      value: '',
      focus() {},
      setAttribute: () => {},
      getAttribute: () => null,
      addEventListener: () => {},
      appendChild: () => {},
    };
    elements[id] = el;
    return el;
  };

  const modalbox = createElement('playerModalbox');
  const overlay = createElement('playerOverlay');
  overlay.style.display = 'none';

  const doc = {
    getElementById(id) {
      if (!elements[id]) {
        return createElement(id);
      }
      return elements[id];
    },
    querySelectorAll() {
      return [];
    },
    createElement(tag) {
      return createElement(`mock_${Date.now()}_${Math.random()}`, tag);
    },
  };

  const win = {
    document: doc,
    localStorage: {
      _data: {},
      getItem(k) {
        return this._data[k] || null;
      },
      setItem(k, v) {
        this._data[k] = String(v);
      },
      removeItem(k) {
        delete this._data[k];
      },
    },
    fetch: async () => ({
      ok: true,
      json: async () => ({ ok: true }),
    }),
    inSeasonState: null,
    inSeasonManager: null,
    location: { reload: () => {} },
    setTimeout: (fn) => fn(),
    alert: () => {},
    confirm: () => true,
    URLSearchParams: globalThis.URLSearchParams,
    console: console,
  };
  win.window = win;
  win.global = win;

  const context = vm.createContext(win);
  return { context, elements, modalbox, overlay };
};

const { context, elements, modalbox, overlay } = setupSandbox();

// Load client state and UI scripts
import { readFileSync } from 'node:fs';

const stateCode = readFileSync(resolve('js/roster-manager-state.js'), 'utf-8');
const uiCode = readFileSync(resolve('js/roster-manager-ui.js'), 'utf-8');

vm.runInContext(stateCode, context);
vm.runInContext(uiCode, context);

// Mock fetchPlayerDetails to return qbDossier
context.inSeasonManager.fetchPlayerDetails = async (playerName) => {
  if (playerName === 'Baker Mayfield') return qbDossier;
  if (playerName === 'CeeDee Lamb') return wrDossier;
  return null;
};

// Test openPlayerModal
await context.openPlayerModal('Baker Mayfield');
eq(overlay.style.display, 'flex', 'openPlayerModal shows the overlay');
assert(overlay.classList.contains('show'), 'Overlay has "show" class');
assert(modalbox.className.includes('player-dossier-modal'), 'Modal has player-dossier-modal class');
assert(modalbox.innerHTML.includes('Baker Mayfield'), 'Modal header contains player name');
assert(modalbox.innerHTML.includes('Next Matchup'), 'Default overview tab renders Next Matchup');
assert(
  modalbox.innerHTML.includes('Passing Yards'),
  'Default overview tab renders QB KPI stat card',
);

// Test Tab Navigation: 2026 Game Logs
context.setPlayerModalTab('logs');
eq(context.inSeasonState.activePlayerModalTab, 'logs', 'Active tab set to logs');
assert(modalbox.innerHTML.includes('Pass Yds'), 'Logs tab renders QB pass yards column');
assert(modalbox.innerHTML.includes('Season Totals'), 'Logs tab renders season totals footer row');

// Test Tab Navigation: Depth Chart
context.setPlayerModalTab('depth');
eq(context.inSeasonState.activePlayerModalTab, 'depth', 'Active tab set to depth');
assert(
  modalbox.innerHTML.includes('TB Official QB Depth Chart'),
  'Depth tab renders team room title',
);
assert(
  modalbox.innerHTML.includes('Handcuff & Contingency Note'),
  'Depth tab renders handcuff note',
);

// Test Tab Navigation: Full Schedule
context.setPlayerModalTab('schedule');
eq(context.inSeasonState.activePlayerModalTab, 'schedule', 'Active tab set to schedule');
assert(modalbox.innerHTML.includes('2026 Regular Season Schedule'), 'Schedule tab title renders');
assert(modalbox.innerHTML.includes('W18'), 'Schedule grid renders through Week 18');

// Test Tab Navigation: Portfolio Matrix
context.setPlayerModalTab('portfolio');
eq(context.inSeasonState.activePlayerModalTab, 'portfolio', 'Active tab set to portfolio');
assert(
  modalbox.innerHTML.includes('Rostered on My Teams'),
  'Portfolio tab renders user squads header',
);
assert(
  modalbox.innerHTML.includes('Available on Free Agency'),
  'Portfolio tab renders waivers header',
);

// Test Tab Navigation: News & Research Links
context.setPlayerModalTab('news');
eq(context.inSeasonState.activePlayerModalTab, 'news', 'Active tab set to news');
assert(modalbox.innerHTML.includes('ESPN Player Profile'), 'News tab renders ESPN link');
assert(modalbox.innerHTML.includes('Pro-Football-Reference'), 'News tab renders PFR link');

// Test Watchlist Toggle from Dossier
context.toggleWatchlist = async () => {};
await context.toggleDossierWatchlist('Baker Mayfield');
assert(
  context.inSeasonState.activePlayerDetails.player.is_watchlisted !== undefined,
  'toggleDossierWatchlist updates player watchlist status',
);

// Test Modal Close
context.closePlayerModal();
eq(overlay.style.display, 'none', 'closePlayerModal hides overlay');
assert(!overlay.classList.contains('show'), 'closePlayerModal removes "show" class');

// Test openPlayerNewsModal backwards compatibility alias
await context.openPlayerNewsModal('Baker Mayfield');
eq(overlay.style.display, 'flex', 'openPlayerNewsModal opens overlay');
eq(
  context.inSeasonState.activePlayerModalTab,
  'news',
  'openPlayerNewsModal directly opens news tab',
);
context.closePlayerModal();

// ----------------------------------------------------------------------------
// 6. Dossier Modal CSS Performance & Multi-Row Tab Layout Rules
// ----------------------------------------------------------------------------
const cssContent = readFileSync(resolve('css/draft-board.css'), 'utf-8');

const playerOverlayCssMatch = cssContent.match(/#playerOverlay\s*\{([^}]+)\}/);
assert(playerOverlayCssMatch != null, '#playerOverlay rule exists in draft-board.css');
const playerOverlayBody = playerOverlayCssMatch[1];
assert(
  !playerOverlayBody.includes('backdrop-filter'),
  '#playerOverlay does NOT use backdrop-filter blur (prevents compositor lag)',
);
assert(
  playerOverlayBody.includes('background: rgba(5, 8, 15, 0.85);'),
  '#playerOverlay has crisp dark background',
);

const dossierModalCssMatch = cssContent.match(/\.modal\.player-dossier-modal\s*\{([^}]+)\}/);
assert(dossierModalCssMatch != null, '.modal.player-dossier-modal rule exists in draft-board.css');
const dossierModalBody = dossierModalCssMatch[1];
assert(
  dossierModalBody.includes('1160px'),
  '.modal.player-dossier-modal width increased to 1160px to fit all 6 tabs on desktop',
);
assert(
  dossierModalBody.includes('contain: layout paint;'),
  '.modal.player-dossier-modal uses contain: layout paint for isolated rendering',
);
assert(
  dossierModalBody.includes('transform: translateZ(0);'),
  '.modal.player-dossier-modal has hardware acceleration layer promotion',
);

const navTabsCssMatch = cssContent.match(/\.dossier-nav-tabs\s*\{([^}]+)\}/);
assert(navTabsCssMatch != null, '.dossier-nav-tabs rule exists in draft-board.css');
const navTabsBody = navTabsCssMatch[1];
assert(
  navTabsBody.includes('flex-wrap: wrap;'),
  '.dossier-nav-tabs has flex-wrap: wrap for multi-row tab layout',
);
assert(
  !navTabsBody.includes('overflow-x: auto;'),
  '.dossier-nav-tabs does not force horizontal scrollbar',
);

const dossierBodyCssMatch = cssContent.match(/\.dossier-body\s*\{([^}]+)\}/);
assert(dossierBodyCssMatch != null, '.dossier-body rule exists in draft-board.css');
assert(
  dossierBodyCssMatch[1].includes('overscroll-behavior: contain;'),
  '.dossier-body contains overscroll-behavior to prevent scroll chaining',
);

// ----------------------------------------------------------------------------
// 7. Player Names with Apostrophes (Tre' Harris, De'Zhaun Stribling)
// ----------------------------------------------------------------------------
const treDossier = {
  player: {
    name: "Tre' Harris",
    pos: 'WR',
    team: 'LAC',
    bye: 7,
    ranks: { dynSF: 145, red_ppr: 174 },
    headshot_url: '',
  },
  next_matchup: {
    week: 3,
    opponent: 'KC',
    home_away: 'home',
    defensive_rank: { tier: 'favorable', label: 'Plus Matchup', points_allowed_avg: 32.5 },
  },
  season_summary: {
    games_played: 2,
    rec_total: 8,
    rec_tgt_total: 12,
    rec_yd_total: 115,
    rec_td_total: 1,
    pts_ppr_total: 25.5,
    pts_ppr_avg: 12.8,
  },
  game_logs: [
    {
      week: 1,
      opp: 'MIA',
      home_away: 'away',
      game_result: 'W',
      off_snp: 45,
      tm_off_snp: 65,
      snap_pct: 69.2,
      fantasy_pts_ppr: 14.2,
      stats: { rec: 5, rec_yd: 72, rec_td: 1 },
    },
  ],
  depth_chart: {
    team: 'LAC',
    pos: 'WR',
    players: [
      { name: "Tre' Harris", rank: 2, role: 'Depth #2', snaps: 95, snap_pct: 70.3 },
      { name: 'Quentin Johnston', rank: 1, role: 'Starter', snaps: 110, snap_pct: 81.5 },
    ],
    handcuff_note: 'Rotational target with high upside.',
  },
  schedule: [
    { week: 1, opponent: 'MIA', is_home: false, status: 'Final W 24-20', is_bye: false },
  ],
  portfolio: {
    rostered: [{ league_id: 'lg_1', league_name: 'Dynasty Championship', slot: 'WR2' }],
    waivers: [{ league_id: 'lg_2', league_name: 'Redraft Superflex' }],
  },
  news: [],
};

const dezhaunDossier = {
  player: {
    name: "De'Zhaun Stribling",
    pos: 'WR',
    team: 'SF',
    bye: 8,
    ranks: { dynSF: 140, red_ppr: 123 },
    headshot_url: '',
  },
  next_matchup: null,
  season_summary: {},
  game_logs: [],
  depth_chart: { team: 'SF', pos: 'WR', players: [], handcuff_note: '' },
  schedule: [],
  portfolio: { rostered: [], waivers: [] },
  news: [],
};

const origFetch = context.inSeasonManager.fetchPlayerDetails;
context.inSeasonManager.fetchPlayerDetails = async (playerName) => {
  if (playerName === "Tre' Harris") return treDossier;
  if (playerName === "De'Zhaun Stribling") return dezhaunDossier;
  return origFetch(playerName);
};

// Test Team View Roster Row Escaping
context.inSeasonState.rosterData = {
  team_name: 'Super Team',
  starters: [
    { name: "Tre' Harris", pos: 'WR', team: 'LAC', bye: 7, rank: 145, projected_score: 12.4 },
  ],
  bench: [
    { name: "De'Zhaun Stribling", pos: 'WR', team: 'SF', bye: 8, rank: 140, projected_score: 8.5 },
  ],
};

context.inSeasonState.currentView = 'team';
context.renderManagerView();
const containerEl = context.document.getElementById('manager_views_container');
const teamHtml = containerEl.innerHTML;

for (const name of ["Tre' Harris", "De'Zhaun Stribling"]) {
  const expectedEscaped = name.replace(/'/g, "\\'");
  assert(
    teamHtml.includes(`openPlayerModal('${expectedEscaped}')`),
    `Team view contains valid escaped onclick handler for ${name}`,
  );

  const onclickRegex = new RegExp(
    `onclick="(global\\.openPlayerModal\\('${expectedEscaped.replace(/\\/g, '\\\\')}'\\))"`,
  );
  const match = teamHtml.match(onclickRegex);
  assert(match != null, `Found onclick handler attribute for ${name}`);

  let calledWith = null;
  const originalOpen = context.global.openPlayerModal;
  context.global.openPlayerModal = (arg) => {
    calledWith = arg;
  };
  vm.runInContext(match[1], context);
  eq(
    calledWith,
    name,
    `onclick execution successfully calls openPlayerModal with uncorrupted name "${name}"`,
  );
  context.global.openPlayerModal = originalOpen;
}

// Test Waivers Table Escaping
context.inSeasonState.waivers = [
  {
    name: "Tre' Harris",
    pos: 'WR',
    team: 'LAC',
    bye: 7,
    rank: 145,
    score: 68.5,
    is_watchlisted: false,
    available_in: [{ league_name: 'Dynasty Championship' }],
  },
];
context.inSeasonState.currentView = 'waivers';
context.renderManagerView();
const waiversHtml = containerEl.innerHTML;

assert(
  waiversHtml.includes("openPlayerModal('Tre\\' Harris')"),
  'Waivers table renders escaped openPlayerModal handler for Tre\' Harris',
);
assert(
  waiversHtml.includes("toggleWaiverWatchlist('Tre\\' Harris')"),
  'Waivers table renders escaped toggleWaiverWatchlist handler for Tre\' Harris',
);
assert(
  waiversHtml.includes("openWaiverNoteModal('Tre\\' Harris')"),
  'Waivers table renders escaped openWaiverNoteModal handler for Tre\' Harris',
);

// Test openPlayerModal for Tre' Harris
await context.openPlayerModal("Tre' Harris");
eq(overlay.style.display, 'flex', 'openPlayerModal shows overlay for Tre\' Harris');
assert(modalbox.innerHTML.includes("Tre' Harris"), 'Modal header displays "Tre\' Harris"');
assert(
  modalbox.innerHTML.includes('Overview &amp; Matchup') || modalbox.innerHTML.includes('Overview & Matchup'),
  'Renders overview tab',
);
assert(
  modalbox.innerHTML.includes('dossier-tab-btn active'),
  'Active tab button styled with active class',
);
assert(
  modalbox.innerHTML.includes("toggleDossierWatchlist('Tre\\' Harris')"),
  'Watchlist button in dossier header has escaped name',
);
assert(
  modalbox.innerHTML.includes("openWaiverNoteModal('Tre\\' Harris')"),
  'Notes button in dossier header has escaped name',
);

// Test tab switching
context.setPlayerModalTab('logs');
eq(context.inSeasonState.activePlayerModalTab, 'logs', 'Switched to logs tab');
assert(modalbox.innerHTML.includes('Game Logs'), 'Logs tab renders');

context.setPlayerModalTab('depth');
eq(context.inSeasonState.activePlayerModalTab, 'depth', 'Switched to depth tab');
assert(
  modalbox.innerHTML.includes("openPlayerModal('Quentin Johnston')"),
  'Depth chart tab renders sub-player links',
);

// Test watchlist toggling for Tre' Harris
context.inSeasonManager.toggleWatchlist = async (playerName) => {
  const norm = context.normalizePlayerName(playerName);
  if (context.inSeasonState.watchlist[norm] !== undefined) {
    delete context.inSeasonState.watchlist[norm];
  } else {
    context.inSeasonState.watchlist[norm] = 'Target';
  }
};
context.toggleWatchlist = context.inSeasonManager.toggleWatchlist;
await context.toggleDossierWatchlist("Tre' Harris");
assert(
  context.inSeasonState.activePlayerDetails.player.is_watchlisted,
  'toggleDossierWatchlist toggles Tre\' Harris watchlist status to true',
);

// Test openPlayerModal for De'Zhaun Stribling
await context.openPlayerModal("De'Zhaun Stribling");
eq(overlay.style.display, 'flex', 'openPlayerModal shows overlay for De\'Zhaun Stribling');
assert(modalbox.innerHTML.includes("De'Zhaun Stribling"), 'Modal header displays "De\'Zhaun Stribling"');
context.closePlayerModal();

// Test Waiver Note Modal for Tre' Harris
context.inSeasonManager.saveWatchlistNote = async (playerName, note) => {
  const norm = context.normalizePlayerName(playerName);
  context.inSeasonState.watchlist[norm] = note;
};
context.openWaiverNoteModal("Tre' Harris");
eq(overlay.style.display, 'flex', 'openWaiverNoteModal opens overlay');
assert(modalbox.innerHTML.includes("Waiver Note: Tre' Harris"), 'Modal title includes player name');
assert(
  modalbox.innerHTML.includes("saveWaiverNote('Tre\\' Harris')"),
  'Save button contains escaped player name',
);

elements.waiver_note_textarea.value = 'High priority waiver stash';
await context.saveWaiverNote("Tre' Harris");
eq(overlay.style.display, 'none', 'saveWaiverNote closes overlay');
const normKey = context.normalizePlayerName("Tre' Harris");
eq(context.inSeasonState.watchlist[normKey], 'High priority waiver stash', 'Watchlist note saved for Tre\' Harris');

// Clean up test DB
if (existsSync(TEST_DB)) {
  try {
    unlinkSync(TEST_DB);
  } catch (_e) {}
}

const success = finishSuite('Player Details Intelligence Dossier & Matchup Engine');
if (!success) {
  process.exit(1);
}
