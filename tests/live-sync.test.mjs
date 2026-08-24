import { eq, assert, printSuiteHeader, finishSuite, resetFailures } from './test-helper.mjs';
import * as logic from '../draft-logic.js';

resetFailures();
printSuiteHeader('Live Draft Synchronization & Player Resolution');

// Sample mock player database
const mockPlayers = [
  { id: 0, name: "Ja'Marr Chase", pos: 'WR', team: 'CIN', bye: 12 },
  { id: 1, name: 'Bijan Robinson', pos: 'RB', team: 'ATL', bye: 12 },
  { id: 2, name: 'Josh Allen', pos: 'QB', team: 'BUF', bye: 12 },
  { id: 3, name: 'Marvin Harrison Jr.', pos: 'WR', team: 'ARI', bye: 11 },
  { id: 4, name: 'Brock Bowers', pos: 'TE', team: 'LV', bye: 10 },
  { id: 5, name: 'San Francisco 49ers', pos: 'DST', team: 'SF', bye: 9 },
  { id: 6, name: 'Kansas City Chiefs', pos: 'DST', team: 'KC', bye: 6 },
  { id: 7, name: 'Michael Thomas', pos: 'WR', team: 'NO', bye: 14 }
];

// --- 1. Sleeper Settings & League Setup Parsing ---
const sampleSleeperDraft = {
  draft_id: '10492850284',
  league_id: '10492850000',
  status: 'drafting',
  type: 'snake',
  settings: {
    teams: 12,
    rounds: 25,
    reversal_round: 3
  },
  metadata: {
    name: "Dynasty Champions 2026"
  },
  draft_order: {
    'user_101': 1,
    'user_102': 2,
    'user_103': 3,
    'user_104': 4
  }
};

const sampleSleeperUsers = [
  { user_id: 'user_101', display_name: 'GridironGuru', metadata: { team_name: 'The Empire' } },
  { user_id: 'user_102', display_name: 'KenDrafts', metadata: {} },
  { user_id: 'user_103', display_name: 'TouchdownKing', metadata: { team_name: 'Blitz City' } },
  { user_id: 'user_104', display_name: 'FantasyBoss', metadata: {} }
];

const parsed3RR = logic.parseSleeperDraft(sampleSleeperDraft, sampleSleeperUsers, 'KenDrafts');

assert(parsed3RR != null, 'parseSleeperDraft returns valid object');
eq(parsed3RR.leagueName, 'Dynasty Champions 2026', 'Extracts custom league name');
eq(parsed3RR.teams, 12, 'Extracts team count');
eq(parsed3RR.rounds, 25, 'Extracts total rounds');
eq(parsed3RR.mode, '3rr', 'Detects 3rd-Round Reversal mode (reversal_round === 3)');
eq(parsed3RR.slot, 2, 'Matches user slot by display name (KenDrafts -> Slot 2)');
eq(parsed3RR.teamNames[0], 'The Empire', 'Maps Slot 1 to custom team name');
eq(parsed3RR.teamNames[1], 'KenDrafts', 'Maps Slot 2 to display name when no custom team name');
eq(parsed3RR.teamNames[2], 'Blitz City', 'Maps Slot 3 to custom team name');
eq(parsed3RR.teamNames[4], 'Team 5', 'Falls back to default Team 5 when unassigned');

// Test standard snake without 3RR
const sampleSnakeDraft = {
  draft_id: '99999',
  settings: { teams: 10, rounds: 16, reversal_round: 0 },
  draft_order: { 'u1': 1, 'u2': 2 }
};
const parsedSnake = logic.parseSleeperDraft(sampleSnakeDraft, [{ user_id: 'u1', display_name: 'UserOne' }], 'u1');
eq(parsedSnake.mode, 'snake', 'Detects standard snake when reversal_round is 0');
eq(parsedSnake.slot, 1, 'Resolves user slot by user_id');

// --- 2. Remote Pick Player Resolution ---

// A. Sleeper Metadata Pick (Bijan Robinson)
const sleeperPick1 = {
  pick_no: 1,
  round: 1,
  draft_slot: 1,
  player_id: '9221',
  metadata: {
    first_name: 'Bijan',
    last_name: 'Robinson',
    position: 'RB',
    team: 'ATL'
  }
};
const res1 = logic.resolveRemotePick(sleeperPick1, mockPlayers);
assert(res1 != null, 'Resolves remote pick 1');
eq(res1.playerId, 1, 'Matches Bijan Robinson to ID 1');
eq(res1.isUnlisted, false, 'Marked as listed player');
eq(res1.player.name, 'Bijan Robinson', 'Resolves correct player object');

// B. Suffix Handling (Marvin Harrison Jr.)
const sleeperPick2 = {
  pick_no: 2,
  metadata: {
    first_name: 'Marvin',
    last_name: 'Harrison', // Sleeper sometimes drops Jr. or includes it
    position: 'WR',
    team: 'ARI'
  }
};
const res2 = logic.resolveRemotePick(sleeperPick2, mockPlayers);
eq(res2.playerId, 3, 'Matches Marvin Harrison to Marvin Harrison Jr. (ID 3)');

// C. ESPN / Generic Broadcast Pick (Ja'Marr Chase)
const espnPick = {
  overall: 3,
  name: "Ja'Marr Chase",
  pos: 'WR',
  team: 'CIN'
};
const res3 = logic.resolveRemotePick(espnPick, mockPlayers);
eq(res3.playerId, 0, "Matches Ja'Marr Chase to ID 0");

// D. Defense Resolution (SF 49ers & KC Chiefs)
const defPick1 = {
  pick_no: 15,
  metadata: { first_name: 'San Francisco', last_name: '49ers', position: 'DEF', team: 'SF' }
};
const resDef1 = logic.resolveRemotePick(defPick1, mockPlayers);
eq(resDef1.playerId, 5, 'Matches SF 49ers defense to ID 5');

const defPick2 = {
  overall: 16,
  name: 'Kansas City Chiefs DST',
  pos: 'DST',
  team: 'KC'
};
const resDef2 = logic.resolveRemotePick(defPick2, mockPlayers);
eq(resDef2.playerId, 6, 'Matches KC Chiefs DST to ID 6');

// E. ESPN Abbreviated Name Resolution (D. Samuel Sr., J. Herbert, D. Metcalf, D. Swift, J. Williams)
const fullMockPlayers = [
  ...mockPlayers,
  { id: 10, name: 'Deebo Samuel Sr.', pos: 'WR', team: 'SF', adp: 118 },
  { id: 11, name: 'Justin Herbert', pos: 'QB', team: 'LAC', adp: 70 },
  { id: 12, name: 'DK Metcalf', pos: 'WR', team: 'PIT', adp: 76 },
  { id: 13, name: "D'Andre Swift", pos: 'RB', team: 'CHI', adp: 54 },
  { id: 14, name: 'Matthew Golden', pos: 'WR', team: 'TEX', adp: 180 },
  { id: 15, name: 'Javonte Williams', pos: 'RB', team: 'DEN', adp: 65 },
  { id: 16, name: 'Jameson Williams', pos: 'WR', team: 'DET', adp: 90 }
];

const resDeebo = logic.resolveRemotePick({ name: 'D. Samuel Sr.', pos: 'WR', team: 'SF' }, fullMockPlayers);
eq(resDeebo.playerId, 10, 'Resolves D. Samuel Sr. (WR, SF) to Deebo Samuel Sr.');

const resHerbert = logic.resolveRemotePick({ name: 'J. Herbert', pos: 'QB', team: 'LAC' }, fullMockPlayers);
eq(resHerbert.playerId, 11, 'Resolves J. Herbert (QB, LAC) to Justin Herbert');

const resMetcalf = logic.resolveRemotePick({ name: 'D. Metcalf', pos: 'WR', team: 'PIT' }, fullMockPlayers);
eq(resMetcalf.playerId, 12, 'Resolves D. Metcalf (WR, PIT) to DK Metcalf');

const resSwift = logic.resolveRemotePick({ name: 'D. Swift', pos: 'RB', team: 'CHI' }, fullMockPlayers);
eq(resSwift.playerId, 13, "Resolves D. Swift (RB, CHI) to D'Andre Swift");

const resGolden = logic.resolveRemotePick({ name: 'M. Golden', pos: 'WR' }, fullMockPlayers);
eq(resGolden.playerId, 14, 'Resolves M. Golden (WR) to Matthew Golden');

const resJavonte = logic.resolveRemotePick({ name: 'J. Williams', pos: 'RB' }, fullMockPlayers);
eq(resJavonte.playerId, 15, 'Resolves J. Williams (RB) to Javonte Williams');

const resJameson = logic.resolveRemotePick({ name: 'J. Williams', pos: 'WR' }, fullMockPlayers);
eq(resJameson.playerId, 16, 'Resolves J. Williams (WR) to Jameson Williams');

// F. Unlisted / Sleeper Fallback Pick (Deep rookie not in rankings)
const unlistedPick = {
  pick_no: 24,
  metadata: {
    first_name: 'Bub',
    last_name: 'Means',
    position: 'WR',
    team: 'NO'
  }
};
const resUnlisted = logic.resolveRemotePick(unlistedPick, mockPlayers);
assert(resUnlisted != null, 'Produces fallback object for unlisted player');
eq(resUnlisted.playerId, null, 'Unlisted player has null playerId');
eq(resUnlisted.isUnlisted, true, 'isUnlisted flag is true');
eq(resUnlisted.customName, 'Bub Means', 'Extracts full unlisted player name');
eq(resUnlisted.customPos, 'WR', 'Extracts unlisted player position');
eq(resUnlisted.customTeam, 'NO', 'Extracts unlisted player NFL team');

// --- 3. Draft Log State Reconciliation & Rollback ---

const initialContext = {
  teams: 12,
  slot: 2,
  mode: '3rr',
  teamNames: ['Team 1', 'Ken', 'Team 3', 'Team 4']
};

// Initial state: 0 picks -> sync arrives with 2 picks
const remoteFeed = [
  sleeperPick1, // Pick 1 (Team 1)
  sleeperPick2  // Pick 2 (Ken / My Pick)
];

const syncResult1 = logic.reconcileDraftLog([], remoteFeed, mockPlayers, initialContext);
eq(syncResult1.log.length, 2, 'Reconciled log has 2 picks');
eq(syncResult1.added, 2, 'Added 2 picks');
eq(syncResult1.rolledBack, 0, '0 picks rolled back');
eq(syncResult1.log[0].overall, 1, 'Pick 1 is overall 1');
eq(syncResult1.log[0].mine, false, 'Pick 1 is not mine (Slot 1)');
eq(syncResult1.log[1].overall, 2, 'Pick 2 is overall 2');
eq(syncResult1.log[1].mine, true, 'Pick 2 is mine (Slot 2)');
eq(syncResult1.log[1].playerId, 3, 'Pick 2 has Marvin Harrison ID');

// Idempotency: re-running with same picks produces no new additions
const syncResult2 = logic.reconcileDraftLog(syncResult1.log, remoteFeed, mockPlayers, initialContext);
eq(syncResult2.changed, false, 'Re-running same feed indicates changed=false');
eq(syncResult2.added, 0, '0 added on idempotent poll');

// Advance draft: 3rd pick arrives
const remoteFeed3 = [...remoteFeed, espnPick];
const syncResult3 = logic.reconcileDraftLog(syncResult1.log, remoteFeed3, mockPlayers, initialContext);
eq(syncResult3.log.length, 3, 'Advances to 3 picks');
eq(syncResult3.added, 1, 'Exactly 1 pick added');
eq(syncResult3.log[2].playerId, 0, "Pick 3 is Ja'Marr Chase");

// Rollback scenario: Commissioner resets Pick 2 and 3 on host platform
const remoteRollback = [sleeperPick1]; // only pick 1 remains
const syncResult4 = logic.reconcileDraftLog(syncResult3.log, remoteRollback, mockPlayers, initialContext);
eq(syncResult4.log.length, 1, 'Rolled back log to 1 pick');
eq(syncResult4.rolledBack, 2, 'Reported 2 picks rolled back');
eq(syncResult4.changed, true, 'Indicates state changed');

finishSuite('Live Draft Synchronization & Player Resolution');

