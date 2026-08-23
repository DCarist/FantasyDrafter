// Pure draft-math and ranking logic for the draft board.
// Loaded by draft-board.html via <script>, and testable in Node.

// Which direction does a round go?
// mode 'snake': R1 forward, R2 reverse, alternating.
// mode '3rr' (third-round reversal): R1 forward, R2 reverse, R3 reverse AGAIN,
// then normal alternation resumes (R4 forward, R5 reverse, ...).
function roundIsForward(round, mode) {
  if (mode === '3rr') {
    return round === 1 || (round >= 4 && round % 2 === 0);
  }
  return round % 2 === 1;
}

// Overall pick number for a given draft slot in a given round.
// slot is 1-indexed (1 = first pick of round 1), teams = league size.
function overallPick(round, slot, teams, mode) {
  const indexInRound = roundIsForward(round, mode) ? slot : teams + 1 - slot;
  return (round - 1) * teams + indexInRound;
}

// Which slot owns a given overall pick number.
function slotForOverall(overall, teams, mode) {
  const round = Math.ceil(overall / teams);
  const indexInRound = overall - (round - 1) * teams;
  const slot = roundIsForward(round, mode) ? indexInRound : teams + 1 - indexInRound;
  return { round: round, slot: slot };
}

// All overall pick numbers belonging to one slot.
function picksForSlot(slot, teams, rounds, mode) {
  const picks = [];
  for (let r = 1; r <= rounds; r++) {
    picks.push(overallPick(r, slot, teams, mode));
  }
  return picks;
}

// Normalize a player name so the same player matches across ranking sources.
// "Marvin Harrison Jr." -> "marvin harrison"
function normalizeName(name) {
  return String(name)
    .toLowerCase()
    .replace(/[.'’,-]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Composite draft score, 0-100 scale.
// dynastyScore / redraftScore are each already 0-100 (100 = best available anywhere).
// blend: 0 = pure win-now (redraft), 1 = pure dynasty. TE premium gives TEs a bump.
function compositeScore(player, blend, tePremium) {
  const dyn = player.dynScore;
  const red = player.redScore;
  let score;
  if (dyn == null && red == null) return null;
  if (dyn == null) score = red;
  else if (red == null) score = dyn;
  else score = blend * dyn + (1 - blend) * red;
  if (tePremium && player.pos === 'TE') score *= 1.08;
  return score;
}

// Convert a 1-based rank in a list of `depth` players into a 0-100 score.
// Uses a gentle curve so the gap between rank 1 and 10 matters more
// than the gap between rank 150 and 160 (mirrors how value actually falls off).
function rankToScore(rank, depth) {
  if (rank == null) return null;
  const frac = Math.min(1, Math.max(0, (rank - 1) / depth));
  return 100 * Math.pow(1 - frac, 1.5);
}

// Generate default team list for a given league size.
function defaultTeams(count, mySlot, myName) {
  const list = [];
  for (let i = 1; i <= count; i++) {
    const isMe = (i === mySlot);
    const name = isMe ? (myName || 'My Team') : ('Team ' + i);
    list.push({ slot: i, name: name });
  }
  return list;
}

// Get team info for an overall pick given team name mappings.
// teamNames can be an array of strings (0-indexed for slot 1..N) or a map/object.
function teamForOverall(overall, teamsCount, mode, teamNames, mySlot) {
  const { round, slot } = slotForOverall(overall, teamsCount, mode);
  let name;
  if (Array.isArray(teamNames)) {
    name = teamNames[slot - 1];
  } else if (teamNames && typeof teamNames === 'object') {
    name = teamNames[slot] || teamNames[String(slot)];
  }
  if (!name || !name.trim()) {
    name = (slot === mySlot) ? 'My Team' : ('Team ' + slot);
  }
  return {
    round: round,
    slot: slot,
    name: name.trim(),
    isMe: slot === mySlot,
  };
}

// Resolves the player object for any draft log entry (supporting unlisted picks).
function resolvePickPlayer(entry, players) {
  if (!entry) return null;
  if (entry.playerId != null && players) {
    const p = (typeof players === 'function') ? players(entry.playerId) : players[entry.playerId];
    if (p) return Object.assign({ team: p.team || '—' }, p);
  }
  const pos = (entry.customPos || 'OTHER').toUpperCase();
  const name = entry.customName ? entry.customName.trim() : ('Unlisted ' + (pos !== 'OTHER' ? pos : 'Player'));
  return {
    id: entry.playerId != null ? entry.playerId : null,
    name: name,
    pos: pos,
    team: entry.customTeam ? entry.customTeam.trim().toUpperCase() : '—',
    bye: entry.customBye || null,
    isUnlisted: true,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    roundIsForward: roundIsForward,
    overallPick: overallPick,
    slotForOverall: slotForOverall,
    picksForSlot: picksForSlot,
    normalizeName: normalizeName,
    compositeScore: compositeScore,
    rankToScore: rankToScore,
    defaultTeams: defaultTeams,
    teamForOverall: teamForOverall,
    resolvePickPlayer: resolvePickPlayer,
  };
}
