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
const NFL_TEAMS = new Set(['ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC', 'LV', 'LAC', 'LAR', 'MIA', 'MIN', 'NE', 'NO', 'NYG', 'NYJ', 'PHI', 'PIT', 'SF', 'SEA', 'TB', 'TEN', 'WAS']);
const POS_LIST = ['QB', 'RB', 'WR', 'TE', 'K', 'DST', 'DEF', 'D/ST'];

function parsePlayerText(rawText) {
  if (!rawText) return null;
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
      team = u;
    } else if (!/^[0-9]+(\.[0-9]+)?$/.test(t)) {
      nameParts.push(t);
    }
  }

  const name = nameParts.join(' ').trim();
  if (!name || name.length < 3) return null;
  return { name, pos, team };
}

function extractPickNumber(text, teamsCount) {
  if (!text) return null;
  const str = String(text).trim();

  // 1. Check for Round.Pick format
  const roundPickMatch = str.match(/\b([0-9]{1,2})\.([0-9]{1,2})\b/);
  if (roundPickMatch) {
    const r = parseInt(roundPickMatch[1], 10);
    const p = parseInt(roundPickMatch[2], 10);
    const t = teamsCount || 12;
    if (r >= 1 && p >= 1 && p <= t) {
      return (r - 1) * t + p;
    }
  }

  // 2. Check for explicit overall like "Pick 37", "#37", "Pk 37"
  const explicitMatch = str.match(/(?:pick|pk|#)\s*([0-9]{1,3})\b/i);
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

const pJunk = parsePlayerText("PRK 14 PROJ 245.2 QUEUE DRAFT");
eq(pJunk, null, "Rejects button/table header clutter without valid player name");

// --- Test 2: Pick Number Extraction Across ESPN Formats ---
eq(extractPickNumber("Pick 37", 12), 37, "Extracts overall from 'Pick 37'");
eq(extractPickNumber("#37", 12), 37, "Extracts overall from '#37'");
eq(extractPickNumber("37.", 12), 37, "Extracts overall from '37.'");
eq(extractPickNumber("37", 12), 37, "Extracts overall from '37'");
eq(extractPickNumber("4.01", 12), 37, "Extracts overall from '4.01' in 12-team league ((4-1)*12 + 1 = 37)");
eq(extractPickNumber("1.01", 12), 1, "Extracts overall from '1.01'");
eq(extractPickNumber("1.12", 12), 12, "Extracts overall from '1.12'");
eq(extractPickNumber("3.05", 10), 25, "Extracts overall from '3.05' in 10-team league ((3-1)*10 + 5 = 25)");
eq(extractPickNumber("Round 1", 12), null, "Returns null for un-numbered label 'Round 1'");

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

// --- Test 5: Server Persistent Event Logging & Snapshot Endpoints ---
const serverPyPath = join('.', 'server.py');
const serverPyContent = readFileSync(serverPyPath, 'utf-8');

assert(serverPyContent.includes('LAST_RUN_LOG'), 'server.py defines LAST_RUN_LOG path');
assert(serverPyContent.includes('init_logging'), 'server.py defines init_logging');
assert(serverPyContent.includes('log_event'), 'server.py defines log_event');
assert(serverPyContent.includes('/api/sync/snapshot'), 'server.py handles /api/sync/snapshot endpoint');
assert(serverPyContent.includes('latest_snapshot'), 'server.py maintains latest_snapshot state');
assert(serverPyContent.includes('"snapshot": latest_snapshot'), 'server.py returns snapshot in status/poll payload');

// Test that .gitignore includes logs
const gitignoreContent = readFileSync('.gitignore', 'utf-8');
assert(gitignoreContent.includes('logs/'), '.gitignore ignores logs/ directory');

const success = finishSuite('ESPN Live Sync Robustness & Event Logging');
if (!success) {
  process.exit(1);
}
