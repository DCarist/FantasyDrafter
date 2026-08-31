// Test suite for ESPN Live Sync Robustness, Autopicker Burst Handling & Server Event Logging
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { eq, assert, printSuiteHeader, finishSuite, resetFailures } from './test-helper.mjs';
import { resolveRemotePick, reconcileDraftLog, normalizeName, teamForOverall } from '../draft-logic.js';

resetFailures();
printSuiteHeader('ESPN Live Sync Robustness & Event Logging');

// Load players dataset
const playersDataRaw = readFileSync('players-data.js', 'utf-8');
const jsonStr = playersDataRaw.slice(playersDataRaw.indexOf('=') + 1).trim().replace(/;$/, '');
const PLAYERS = JSON.parse(jsonStr).players;

// --- Helper simulation for extension text parsing ---
const NFL_TEAMS = new Set([
  'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN',
  'DET', 'GB', 'HOU', 'IND', 'JAX', 'JAC', 'KC', 'LV', 'LAC', 'LAR',
  'MIA', 'MIN', 'NE', 'NO', 'NYG', 'NYJ', 'PHI', 'PIT', 'SF', 'SEA',
  'TB', 'TEN', 'WAS', 'WSH'
]);
const TEAM_NORM = {
  'WSH': 'WAS',
  'JAC': 'JAX',
  'OAK': 'LV',
  'SD': 'LAC',
  'STL': 'LAR',
  'LA': 'LAR'
};
const POS_LIST = ['QB', 'RB', 'WR', 'TE', 'K', 'DST', 'DEF', 'D/ST'];

function isPlaceholderName(name, teamNames = []) {
  if (!name) return true;
  const clean = String(name).trim().toLowerCase();
  if (clean.length < 3) return true;
  if (/^(on\s*the\s*clock|the\s*clock|clock|drafting|picking|auto\s*pick|autopick|auto|make|make\s*pick|time\s*expired|available|empty|open|player|unknown|skipped|none)$/i.test(clean)) {
    return true;
  }
  if (/^[0-9]+(\.[0-9]+)?$/.test(clean)) return true;
  if (/^auto\b/i.test(clean)) return true;
  if (/^pick\s*[0-9]+/i.test(clean)) return true;
  if (/^team\s*[0-9]+$/i.test(clean)) return true;
  for (const t of teamNames) {
    if (t && typeof t === 'string') {
      const tClean = t.trim().toLowerCase();
      if (tClean && clean === tClean) {
        return true;
      }
    }
  }
  return false;
}

function parsePlayerText(rawText, teamNames = []) {
  if (!rawText) return null;
  if (isPlaceholderName(rawText, teamNames)) return null;
  let clean = rawText.replace(/[\(\)\,\-\/]/g, ' ').replace(/\s+/g, ' ').trim();

  clean = clean.replace(/\b(autopick|drafted|draft|picked|by|round|pick|prk|proj|queue|view|action|status|rost|stats|team|slot|overall)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  const tokens = clean.split(' ');

  let pos = '';
  let team = '';
  let nameParts = [];

  for (const t of tokens) {
    const u = t.toUpperCase();
    if (!pos && POS_LIST.includes(u)) {
      pos = u;
    } else if (!team && NFL_TEAMS.has(u)) {
      team = TEAM_NORM[u] || u;
    } else if (!/^[0-9]+(\.[0-9]+)?$/.test(t)) {
      nameParts.push(t);
    }
  }

  const name = nameParts.join(' ').trim();
  if (!name || isPlaceholderName(name, teamNames)) return null;
  return { name, pos, team };
}

function extractPickNumber(text, teamsCount) {
  if (!text) return null;
  const str = String(text).trim();

  // 1. Check for Round.Pick format like "3.01", "3.1", "1.12", "1.14"
  const roundPickMatch = str.match(/\b([0-9]{1,2})\.([0-9]{1,2})\b/);
  if (roundPickMatch) {
    const r = parseInt(roundPickMatch[1], 10);
    const p = parseInt(roundPickMatch[2], 10);
    const t = teamsCount || 12;
    if (r >= 1 && p >= 1 && p <= t) {
      return (r - 1) * t + p;
    }
  }

  // 2. Check for explicit overall like "Pick 37", "#37", "Pk 37", "P50"
  const explicitMatch = str.match(/(?:pick|pk|#|p)\s*([0-9]{1,3})\b/i);
  if (explicitMatch) {
    const num = parseInt(explicitMatch[1], 10);
    if (!isNaN(num) && num > 0 && num <= 600) return num;
  }

  // 3. Standalone integer in a pick column
  const directMatch = str.match(/^([0-9]{1,3})\.?$/);
  if (directMatch) {
    const num = parseInt(directMatch[1], 10);
    if (!isNaN(num) && num > 0 && num <= 600) return num;
  }

  return null;
}

// --- Test 1: ESPN Text & Pick Parsing ---
const p1 = parsePlayerText("Justin Jefferson WR, MIN");
eq(p1.name, "Justin Jefferson", "Parses Justin Jefferson name");
eq(p1.pos, "WR", "Parses WR position");
eq(p1.team, "MIN", "Parses MIN team");

const p2 = parsePlayerText("Patrick Mahomes II QB - KC (Autopick)");
eq(p2.name, "Patrick Mahomes II", "Parses Patrick Mahomes II and strips autopick");
eq(p2.pos, "QB", "Parses QB position");
eq(p2.team, "KC", "Parses KC team");

const p3 = parsePlayerText("Marvin Harrison Jr. (WR - ARI)");
eq(p3.name, "Marvin Harrison Jr.", "Parses Marvin Harrison Jr. with parentheses");
eq(p3.pos, "WR", "Parses WR position");
eq(p3.team, "ARI", "Parses ARI team");

const pWsh = parsePlayerText("Jayden Daniels WSH QB (7)");
eq(pWsh.name, "Jayden Daniels", "Parses Jayden Daniels without WSH stuck in name");
eq(pWsh.pos, "QB", "Parses QB position for Jayden Daniels");
eq(pWsh.team, "WAS", "Normalizes ESPN WSH team abbreviation to WAS");

const pWsh2 = parsePlayerText("Terry McLaurin WSH WR");
eq(pWsh2.name, "Terry McLaurin", "Parses Terry McLaurin without WSH stuck in name");
eq(pWsh2.pos, "WR", "Parses WR position for Terry McLaurin");
eq(pWsh2.team, "WAS", "Normalizes WSH team to WAS for Terry McLaurin");

const pClock = parsePlayerText("On The Clock");
eq(pClock, null, "Rejects 'On The Clock' placeholder as a player");

const pClock2 = parsePlayerText("5.2 On The Clock");
eq(pClock2, null, "Rejects cell text with '5.2 On The Clock'");

const pMake = parsePlayerText("Make Pick");
eq(pMake, null, "Rejects 'Make Pick' button text as a player");

const pMake2 = parsePlayerText("Make");
eq(pMake2, null, "Rejects 'Make' button text as a player");

const sampleLeagueTeams = ["Dynamic Team Alpha", "Bravo Squad", "Team 12", "Allen", "Josh", "Josh Allen's Team", "Williams"];
const pAutoTeam = parsePlayerText("AUTO Dynamic Team Alpha", sampleLeagueTeams);
eq(pAutoTeam, null, "Rejects 'AUTO <TeamName>' pick train item");

const pAutoTeam2 = parsePlayerText("AUTO Bravo Squad", sampleLeagueTeams);
eq(pAutoTeam2, null, "Rejects 'AUTO <TeamName>' pick train item for another team");

const pDynamicTeamOnly = parsePlayerText("Dynamic Team Alpha", sampleLeagueTeams);
eq(pDynamicTeamOnly, null, "Rejects dynamically identified team name as a player");

const pJoshAllen = parsePlayerText("Josh Allen QB, BUF", sampleLeagueTeams);
eq(pJoshAllen.name, "Josh Allen", "Correctly parses Josh Allen when team named Allen or Josh exists");
eq(pJoshAllen.pos, "QB", "Parses QB for Josh Allen");
eq(pJoshAllen.team, "BUF", "Parses BUF for Josh Allen");

const pJoshAllenPlain = parsePlayerText("Josh Allen", sampleLeagueTeams);
eq(pJoshAllenPlain.name, "Josh Allen", "Correctly parses plain Josh Allen without pos/team when team named Allen exists");

const pCaleb = parsePlayerText("Caleb Williams QB CHI", sampleLeagueTeams);
eq(pCaleb.name, "Caleb Williams", "Correctly parses Caleb Williams when team named Williams exists");

const pJunk = parsePlayerText("PRK 14 PROJ 245.2 QUEUE DRAFT");
eq(pJunk, null, "Rejects button/table header clutter without valid player name");

// --- Test 2: Pick Number Extraction in 12-team and 14-team Leagues ---
eq(extractPickNumber("Pick 37", 12), 37, "Extracts overall from 'Pick 37'");
eq(extractPickNumber("#37", 12), 37, "Extracts overall from '#37'");
eq(extractPickNumber("37.", 12), 37, "Extracts overall from '37.'");
eq(extractPickNumber("37", 12), 37, "Extracts overall from '37'");
eq(extractPickNumber("P50", 14), 50, "Extracts overall from 'P50' sidebar format");
eq(extractPickNumber("4.01", 12), 37, "Extracts overall from '4.01' in 12-team league ((4-1)*12 + 1 = 37)");
eq(extractPickNumber("1.01", 12), 1, "Extracts overall from '1.01'");
eq(extractPickNumber("1.12", 12), 12, "Extracts overall from '1.12'");
eq(extractPickNumber("1.14", 14), 14, "Extracts overall from '1.14' in 14-team league");
eq(extractPickNumber("5.01", 14), 57, "Extracts overall from '5.01' in 14-team league ((5-1)*14 + 1 = 57)");
eq(extractPickNumber("5.02", 14), 58, "Extracts overall from '5.02' in 14-team league ((5-1)*14 + 2 = 58)");
eq(extractPickNumber("4.14", 14), 56, "Extracts overall from '4.14' in 14-team league ((4-1)*14 + 14 = 56)");
eq(extractPickNumber("3.05", 10), 25, "Extracts overall from '3.05' in 10-team league ((3-1)*10 + 5 = 25)");
eq(extractPickNumber("Round 1", 12), null, "Returns null for un-numbered label 'Round 1'");

// --- Test 2b: Consensus Player Resolution with WSH alias ---
const resolvedDaniels = resolveRemotePick({ name: "Jayden Daniels WSH", pos: "QB", team: "WSH" }, PLAYERS, { unlistedFallback: true });
eq(resolvedDaniels.isUnlisted, false, "Jayden Daniels WSH resolves to consensus player profile");
eq(resolvedDaniels.player.name, "Jayden Daniels", "Resolved name is Jayden Daniels");
eq(resolvedDaniels.player.team, "WAS", "Resolved team is WAS");

const resolvedTerry = resolveRemotePick({ name: "Terry McLaurin WSH", pos: "WR", team: "WSH" }, PLAYERS, { unlistedFallback: true });
eq(resolvedTerry.isUnlisted, false, "Terry McLaurin WSH resolves to consensus player profile");
eq(resolvedTerry.player.name, "Terry McLaurin", "Resolved name is Terry McLaurin");
eq(resolvedTerry.player.team, "WAS", "Resolved team is WAS");

// --- Test 3: Stale Pick Override Guard ---
// Simulate a state where picks 1..36 are already settled, and pick 9 is Ja'Marr Chase
const mockLog = [];
for (let i = 1; i <= 36; i++) {
  mockLog.push({
    overall: i,
    playerId: i === 9 ? 8 : (100 + i),
    customName: i === 9 ? "Ja'Marr Chase" : `Player ${i}`,
    mine: i === 1
  });
}

function simulateRemotePickWithGuard(pickData, currentLog, playersList) {
  const current = currentLog.length + 1; // 37
  let overall = pickData.overall;
  if (!overall || overall <= 0) overall = current;

  const existingIdx = currentLog.findIndex(e => e.overall === overall);
  if (existingIdx >= 0 && overall < current - 1) {
    const existing = currentLog[existingIdx];
    const resolved = resolveRemotePick(pickData, playersList, { unlistedFallback: true });
    const isSame = (resolved.playerId != null && existing.playerId === resolved.playerId) ||
      (resolved.playerId == null && existing.playerId == null && existing.customName === resolved.customName);
    if (!isSame) {
      // Guard blocked stale override
      return { blocked: true, log: currentLog };
    }
  }

  const resolved = resolveRemotePick(pickData, playersList, { unlistedFallback: true });
  const entry = {
    overall: overall,
    playerId: resolved.playerId,
    customName: resolved.customName || null,
    mine: false
  };

  const newLog = [...currentLog];
  if (existingIdx >= 0) {
    newLog[existingIdx] = entry;
  } else {
    newLog.push(entry);
  }
  newLog.sort((a, b) => a.overall - b.overall);
  return { blocked: false, log: newLog };
}

// Stale pick claiming to be for pick 9 (Marvin Harrison Jr.) while at pick 37
const staleEvent = { name: "Marvin Harrison Jr.", overall: 9 };
const guardResult = simulateRemotePickWithGuard(staleEvent, mockLog, PLAYERS);
eq(guardResult.blocked, true, "Guard blocks stale pick event from overwriting settled pick #9");
eq(mockLog[8].customName, "Ja'Marr Chase", "Pick #9 is preserved as Ja'Marr Chase");

// Legitimate pick 37
const validPick37 = { name: "Marvin Harrison Jr.", overall: 37 };
const validResult = simulateRemotePickWithGuard(validPick37, mockLog, PLAYERS);
eq(validResult.blocked, false, "Allows legitimate pick #37");
eq(validResult.log.length, 37, "Log advances to 37 picks");
eq(validResult.log[36].overall, 37, "Pick 37 is recorded at index 36");

// --- Test 4: Rapid Autopicker Snapshot Burst Reconciliation ---
// Simulate receiving a 10-pick autopicker burst all at once
const burstSnapshot = [
  { overall: 1, name: "Josh Allen", pos: "QB", team: "BUF" },
  { overall: 2, name: "Patrick Mahomes II", pos: "QB", team: "KC" },
  { overall: 3, name: "Lamar Jackson", pos: "QB", team: "BAL" },
  { overall: 4, name: "C.J. Stroud", pos: "QB", team: "HOU" },
  { overall: 5, name: "Justin Jefferson", pos: "WR", team: "MIN" },
  { overall: 6, name: "CeeDee Lamb", pos: "WR", team: "DAL" },
  { overall: 7, name: "Ja'Marr Chase", pos: "WR", team: "CIN" },
  { overall: 8, name: "Bijan Robinson", pos: "RB", team: "ATL" },
  { overall: 9, name: "Breece Hall", pos: "RB", team: "NYJ" },
  { overall: 10, name: "Jahmyr Gibbs", pos: "RB", team: "DET" }
];

const reconciled = reconcileDraftLog([], burstSnapshot, PLAYERS, { teams: 12, slot: 1, mode: '3rr' });
eq(reconciled.changed, true, "Reconciliation indicates state changed");
eq(reconciled.added, 10, "Added all 10 burst picks in one reconciliation");
eq(reconciled.log.length, 10, "Resulting log contains exactly 10 picks");
eq(reconciled.log[0].overall, 1, "Pick 1 is Josh Allen");
eq(reconciled.log[8].overall, 9, "Pick 9 is Breece Hall");
eq(reconciled.log[9].overall, 10, "Pick 10 is Jahmyr Gibbs");

// --- Test 5: Background Service Worker & Manifest V3 Extension Relay ---
const manifestPath = join('.', 'extensions', 'espn-sync', 'manifest.json');
const manifestContent = readFileSync(manifestPath, 'utf-8');
const manifestJson = JSON.parse(manifestContent);
assert(manifestJson.background && manifestJson.background.service_worker === 'background.js', 'manifest.json registers background.js service worker');
assert(manifestJson.host_permissions.includes('http://127.0.0.1:8517/*'), 'manifest.json grants host permissions for 127.0.0.1:8517');

const backgroundJsPath = join('.', 'extensions', 'espn-sync', 'background.js');
assert(existsSync(backgroundJsPath), 'extensions/espn-sync/background.js exists');
const backgroundJsContent = readFileSync(backgroundJsPath, 'utf-8');
assert(backgroundJsContent.includes('RELAY_REQUEST'), 'background.js listens for RELAY_REQUEST messages');
assert(backgroundJsContent.includes('127.0.0.1:8517'), 'background.js targets local drafter server');

// --- Test 6: Server Persistent Event Logging, Snapshot & Reset Endpoints ---
const serverPyPath = join('.', 'server.py');
const serverPyContent = readFileSync(serverPyPath, 'utf-8');

assert(serverPyContent.includes('LAST_RUN_LOG'), 'server.py defines LAST_RUN_LOG path');
assert(serverPyContent.includes('init_logging'), 'server.py defines init_logging');
assert(serverPyContent.includes('log_event'), 'server.py defines log_event');
assert(serverPyContent.includes('/api/sync/snapshot'), 'server.py handles /api/sync/snapshot endpoint');
assert(serverPyContent.includes('/api/sync/reset'), 'server.py handles /api/sync/reset endpoint');
assert(serverPyContent.includes('server_seen_picks'), 'server.py maintains server_seen_picks deduplication cache');
assert(serverPyContent.includes('latest_snapshot'), 'server.py maintains latest_snapshot state');
assert(serverPyContent.includes('"snapshot": latest_snapshot'), 'server.py returns snapshot in status/poll payload');
assert(serverPyContent.includes('latest_league_info'), 'server.py maintains latest_league_info state');
assert(serverPyContent.includes('"leagueInfo": latest_league_info'), 'server.py returns leagueInfo in status/poll payload');

// Test that .gitignore includes logs
const gitignoreContent = readFileSync('.gitignore', 'utf-8');
assert(gitignoreContent.includes('logs/'), '.gitignore ignores logs/ directory');

const success = finishSuite('ESPN Live Sync Robustness & Event Logging');
if (!success) {
  process.exit(1);
}
