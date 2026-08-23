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

// Resolves all player objects currently drafted to a given user/slot's roster.
function getMyRosterPlayers(log, players, mySlot, teamsCount, mode) {
  if (!Array.isArray(log)) return [];
  const myPicks = log.filter(e => {
    if (e.mine === true) return true;
    if (mySlot != null && teamsCount != null && mode != null) {
      return slotForOverall(e.overall, teamsCount, mode).slot === mySlot;
    }
    return false;
  });
  return myPicks.map(e => resolvePickPlayer(e, players)).filter(Boolean);
}

// Determines if a candidate player has a bye clash with the current roster.
// Returns { type: 'same-pos' | 'other-pos' | 'none', samePos: [...], otherPos: [...] }
function getByeClashStatus(candidate, myRosterPlayers) {
  if (!candidate || candidate.bye == null || !Array.isArray(myRosterPlayers) || myRosterPlayers.length === 0) {
    return { type: 'none', samePos: [], otherPos: [] };
  }

  const candBye = parseInt(candidate.bye, 10);
  if (isNaN(candBye) || candBye <= 0) {
    return { type: 'none', samePos: [], otherPos: [] };
  }

  const candPos = (candidate.pos || '').toUpperCase();
  const candId = candidate.id;

  const samePos = [];
  const otherPos = [];

  for (const p of myRosterPlayers) {
    if (!p || p.bye == null) continue;
    // Skip if comparing candidate against themselves on the roster
    if (candId != null && p.id != null && p.id === candId) continue;

    const pBye = parseInt(p.bye, 10);
    if (pBye === candBye) {
      const pPos = (p.pos || '').toUpperCase();
      if (pPos === candPos && candPos !== '') {
        samePos.push(p);
      } else {
        otherPos.push(p);
      }
    }
  }

  let type = 'none';
  if (samePos.length > 0) {
    type = 'same-pos';
  } else if (otherPos.length > 0) {
    type = 'other-pos';
  }

  return {
    type: type,
    samePos: samePos,
    otherPos: otherPos,
  };
}

// Checks whether a playerId is on the watchlist.
function isWatched(watchlist, playerId) {
  if (!Array.isArray(watchlist) || playerId == null) return false;
  return watchlist.includes(playerId);
}

// Toggles a playerId on or off the watchlist. Returns a new array.
function toggleWatchlist(watchlist, playerId) {
  if (playerId == null) return Array.isArray(watchlist) ? watchlist.slice() : [];
  const list = Array.isArray(watchlist) ? watchlist.slice() : [];
  const idx = list.indexOf(playerId);
  if (idx >= 0) {
    list.splice(idx, 1);
  } else {
    list.push(playerId);
  }
  return list;
}

// Removes any drafted/taken player IDs from the watchlist. Returns a new array.
function cleanWatchlist(watchlist, takenContainer) {
  if (!Array.isArray(watchlist)) return [];
  if (!takenContainer) return watchlist.slice();

  let hasTaken;
  if (takenContainer instanceof Set || takenContainer instanceof Map) {
    hasTaken = id => takenContainer.has(id);
  } else if (Array.isArray(takenContainer)) {
    const s = new Set(takenContainer);
    hasTaken = id => s.has(id);
  } else {
    hasTaken = id => !!takenContainer[id];
  }

  return watchlist.filter(id => !hasTaken(id));
}

const DEFAULT_ROSTER_SLOTS = {
  qb: 1,
  rb: 2,
  wr: 2,
  te: 1,
  flex: 3,
  superflex: 1,
  k: 0,
  dst: 0,
  bench: 15
};

// Generates a human-readable lineup summary string (e.g. "QB · 2RB · 2WR · TE · 3FLEX · SF · 15 BN")
function formatLineupSummary(rosterSlots) {
  const s = Object.assign({}, DEFAULT_ROSTER_SLOTS, rosterSlots);
  const parts = [];
  const add = (count, label) => {
    if (!count || count <= 0) return;
    parts.push((count > 1 ? count : '') + label);
  };
  add(s.qb, 'QB');
  add(s.rb, 'RB');
  add(s.wr, 'WR');
  add(s.te, 'TE');
  add(s.flex, 'FLEX');
  add(s.superflex, 'SF');
  add(s.k, 'K');
  add(s.dst, 'D/ST');
  if (s.bench && s.bench > 0) parts.push(s.bench + ' BN');
  return parts.join(' · ') || 'No Starters Configured';
}

// Allocates drafted players into starter slots first (by position, flex, superflex) and then bench.
function assignRosterSlots(draftedPlayers, rosterSlots) {
  const s = Object.assign({}, DEFAULT_ROSTER_SLOTS, rosterSlots);
  const pool = Array.isArray(draftedPlayers) ? draftedPlayers.slice() : [];

  const starterSlots = [];
  const addSlot = (type, label) => starterSlots.push({ slotType: type, label: label, player: null });

  for (let i = 0; i < (s.qb || 0); i++) addSlot('QB', 'QB');
  for (let i = 0; i < (s.rb || 0); i++) addSlot('RB', 'RB');
  for (let i = 0; i < (s.wr || 0); i++) addSlot('WR', 'WR');
  for (let i = 0; i < (s.te || 0); i++) addSlot('TE', 'TE');
  for (let i = 0; i < (s.flex || 0); i++) addSlot('FLEX', 'FLEX');
  for (let i = 0; i < (s.superflex || 0); i++) addSlot('SF', 'SF');
  for (let i = 0; i < (s.k || 0); i++) addSlot('K', 'K');
  for (let i = 0; i < (s.dst || 0); i++) addSlot('DST', 'D/ST');

  // Helper to extract first matching player from pool
  const extractMatch = predicate => {
    const idx = pool.findIndex(predicate);
    if (idx !== -1) {
      return pool.splice(idx, 1)[0];
    }
    return null;
  };

  const isDst = p => {
    const pos = (p.pos || '').toUpperCase();
    return pos === 'DST' || pos === 'DEF' || pos === 'D/ST';
  };

  // 1. Primary Position Starters
  for (const slot of starterSlots) {
    if (slot.player) continue;
    if (slot.slotType === 'QB') slot.player = extractMatch(p => (p.pos || '').toUpperCase() === 'QB');
    else if (slot.slotType === 'RB') slot.player = extractMatch(p => (p.pos || '').toUpperCase() === 'RB');
    else if (slot.slotType === 'WR') slot.player = extractMatch(p => (p.pos || '').toUpperCase() === 'WR');
    else if (slot.slotType === 'TE') slot.player = extractMatch(p => (p.pos || '').toUpperCase() === 'TE');
    else if (slot.slotType === 'K') slot.player = extractMatch(p => (p.pos || '').toUpperCase() === 'K');
    else if (slot.slotType === 'DST') slot.player = extractMatch(isDst);
  }

  // 2. Regular FLEX Starters (RB / WR / TE)
  for (const slot of starterSlots) {
    if (slot.player || slot.slotType !== 'FLEX') continue;
    slot.player = extractMatch(p => ['RB', 'WR', 'TE'].includes((p.pos || '').toUpperCase()));
  }

  // 3. Superflex Starters (QB / RB / WR / TE)
  for (const slot of starterSlots) {
    if (slot.player || slot.slotType !== 'SF') continue;
    slot.player = extractMatch(p => ['QB', 'RB', 'WR', 'TE'].includes((p.pos || '').toUpperCase()));
  }

  // 4. Remaining players go to bench
  const bench = pool.map(p => ({
    slotType: 'BN',
    label: 'BN',
    player: p
  }));

  // Calculate positional counts
  const counts = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 };
  if (Array.isArray(draftedPlayers)) {
    for (const p of draftedPlayers) {
      if (!p) continue;
      const pos = (p.pos || '').toUpperCase();
      if (isDst(p)) counts.DST++;
      else if (counts[pos] != null) counts[pos]++;
    }
  }

  const totalStarters = starterSlots.length;
  const totalBench = Math.max(0, s.bench || 0);

  return {
    starters: starterSlots,
    bench: bench,
    counts: counts,
    totalStarters: totalStarters,
    totalBench: totalBench,
    rosterSlots: s
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
    getMyRosterPlayers: getMyRosterPlayers,
    getByeClashStatus: getByeClashStatus,
    isWatched: isWatched,
    toggleWatchlist: toggleWatchlist,
    cleanWatchlist: cleanWatchlist,
    DEFAULT_ROSTER_SLOTS: DEFAULT_ROSTER_SLOTS,
    formatLineupSummary: formatLineupSummary,
    assignRosterSlots: assignRosterSlots,
  };
}
