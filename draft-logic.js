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

// Canonical NFL defense definitions across all 32 teams
const NFL_DEFENSES = {
  ARI: { name: 'Arizona Cardinals', city: 'Arizona', mascot: 'Cardinals' },
  ATL: { name: 'Atlanta Falcons', city: 'Atlanta', mascot: 'Falcons' },
  BAL: { name: 'Baltimore Ravens', city: 'Baltimore', mascot: 'Ravens' },
  BUF: { name: 'Buffalo Bills', city: 'Buffalo', mascot: 'Bills' },
  CAR: { name: 'Carolina Panthers', city: 'Carolina', mascot: 'Panthers' },
  CHI: { name: 'Chicago Bears', city: 'Chicago', mascot: 'Bears' },
  CIN: { name: 'Cincinnati Bengals', city: 'Cincinnati', mascot: 'Bengals' },
  CLE: { name: 'Cleveland Browns', city: 'Cleveland', mascot: 'Browns' },
  DAL: { name: 'Dallas Cowboys', city: 'Dallas', mascot: 'Cowboys' },
  DEN: { name: 'Denver Broncos', city: 'Denver', mascot: 'Broncos' },
  DET: { name: 'Detroit Lions', city: 'Detroit', mascot: 'Lions' },
  GB:  { name: 'Green Bay Packers', city: 'Green Bay', mascot: 'Packers' },
  HOU: { name: 'Houston Texans', city: 'Houston', mascot: 'Texans' },
  IND: { name: 'Indianapolis Colts', city: 'Indianapolis', mascot: 'Colts' },
  JAX: { name: 'Jacksonville Jaguars', city: 'Jacksonville', mascot: 'Jaguars' },
  KC:  { name: 'Kansas City Chiefs', city: 'Kansas City', mascot: 'Chiefs' },
  LV:  { name: 'Las Vegas Raiders', city: 'Las Vegas', mascot: 'Raiders' },
  LAC: { name: 'Los Angeles Chargers', city: 'Los Angeles', mascot: 'Chargers' },
  LAR: { name: 'Los Angeles Rams', city: 'Los Angeles', mascot: 'Rams' },
  MIA: { name: 'Miami Dolphins', city: 'Miami', mascot: 'Dolphins' },
  MIN: { name: 'Minnesota Vikings', city: 'Minnesota', mascot: 'Vikings' },
  NE:  { name: 'New England Patriots', city: 'New England', mascot: 'Patriots' },
  NO:  { name: 'New Orleans Saints', city: 'New Orleans', mascot: 'Saints' },
  NYG: { name: 'New York Giants', city: 'New York Giants', mascot: 'Giants' },
  NYJ: { name: 'New York Jets', city: 'New York Jets', mascot: 'Jets' },
  PHI: { name: 'Philadelphia Eagles', city: 'Philadelphia', mascot: 'Eagles' },
  PIT: { name: 'Pittsburgh Steelers', city: 'Pittsburgh', mascot: 'Steelers' },
  SF:  { name: 'San Francisco 49ers', city: 'San Francisco', mascot: '49ers' },
  SEA: { name: 'Seattle Seahawks', city: 'Seattle', mascot: 'Seahawks' },
  TB:  { name: 'Tampa Bay Buccaneers', city: 'Tampa Bay', mascot: 'Buccaneers' },
  TEN: { name: 'Tennessee Titans', city: 'Tennessee', mascot: 'Titans' },
  WAS: { name: 'Washington Commanders', city: 'Washington', mascot: 'Commanders' }
};

function buildDstLookup() {
  const map = {};
  for (const [abbr, info] of Object.entries(NFL_DEFENSES)) {
    const m = info.mascot.toLowerCase();
    const c = info.city.toLowerCase();
    const n = info.name.toLowerCase();
    const a = abbr.toLowerCase();
    const variants = [
      n, `${n} dst`, `${n} defense`, `${n} def`,
      m, `${m} dst`, `${m} defense`, `${m} def`,
      `${c} dst`, `${c} defense`, `${c} def`,
      `${a} dst`, `${a} defense`, `${a} def`
    ];
    if (abbr === 'NYG') variants.push('ny giants', 'ny giants dst', 'ny giants def');
    if (abbr === 'NYJ') variants.push('ny jets', 'ny jets dst', 'ny jets def');
    if (abbr === 'SF') variants.push('sf 49ers', 'sf 49ers dst', 'san francisco dst', '49ers dst');
    if (abbr === 'GB') variants.push('gb packers', 'gb packers dst');
    if (abbr === 'TB') variants.push('tb buccaneers', 'tb buccaneers dst', 'bucs dst');
    if (abbr === 'KC') variants.push('kc chiefs', 'kc chiefs dst');
    if (abbr === 'NE') variants.push('ne patriots', 'ne patriots dst', 'pats dst');
    if (abbr === 'NO') variants.push('no saints', 'no saints dst');
    if (abbr === 'LV') variants.push('lv raiders', 'lv raiders dst');
    if (abbr === 'LAC') variants.push('la chargers', 'la chargers dst');
    if (abbr === 'LAR') variants.push('la rams', 'la rams dst');

    for (const v of variants) {
      const clean = v.replace(/[.'’,"/-]/g, '').replace(/\s+/g, ' ').trim();
      map[clean] = abbr;
    }
  }
  return map;
}

const DST_LOOKUP_MAP = buildDstLookup();

// Resolves any defense name or team variant into canonical { name, team, pos: 'DST' }
function resolveDstCanonical(name, team) {
  if (!name && !team) return null;
  if (name) {
    const clean = String(name).toLowerCase().replace(/[.'’,"/-]/g, '').replace(/\s+/g, ' ').trim();
    const upper = clean.toUpperCase();
    if (NFL_DEFENSES[upper]) {
      return { name: NFL_DEFENSES[upper].name, team: upper, pos: 'DST' };
    }
    const match = DST_LOOKUP_MAP[clean];
    if (match) {
      return { name: NFL_DEFENSES[match].name, team: match, pos: 'DST' };
    }
  }
  if (team) {
    const t = String(team).toUpperCase().trim();
    if (NFL_DEFENSES[t]) {
      return { name: NFL_DEFENSES[t].name, team: t, pos: 'DST' };
    }
  }
  return null;
}

// Supported league formats
const FORMAT_OPTIONS = {
  scoring: {
    ppr: 'Full PPR (1.0)',
    half: 'Half-PPR (0.5)',
    std: 'Standard (0 PPR)',
  },
  qb: {
    sf: 'Superflex (2QB/SF)',
    '1qb': '1 QB (Single QB)',
  }
};

// Resolves active Dynasty ranking based on QB mode (Superflex vs 1QB)
function getDynastyRank(player, qbFormat) {
  if (!player) return null;
  const is1QB = (qbFormat === '1qb' || qbFormat === '1QB');
  if (is1QB) {
    if (player.dyn1QB != null) return player.dyn1QB;
    if (player.dyn_1qb != null) return player.dyn_1qb;
    return player.pos !== 'QB' ? (player.dynSF ?? player.dyn_sf ?? null) : null;
  }
  // Superflex / 2QB mode
  if (player.dynSF != null) return player.dynSF;
  if (player.dyn_sf != null) return player.dyn_sf;
  return player.pos !== 'QB' ? (player.dyn1QB ?? player.dyn_1qb ?? null) : null;
}

// Resolves active Redraft ranking based on QB mode and Scoring mode (PPR, Half, STD)
function getRedraftRank(player, qbFormat, scoringFormat) {
  if (!player) return null;
  const is1QB = (qbFormat === '1qb' || qbFormat === '1QB');
  const scoring = String(scoringFormat || 'half').toLowerCase();

  if (is1QB) {
    if (scoring === 'ppr' || scoring === '1.0' || scoring === '1') {
      return player.red_1qb_ppr ?? player.redraft ?? player.red_1qb_half ?? player.red_1qb_std ?? player.adp ?? null;
    }
    if (scoring === 'std' || scoring === 'standard' || scoring === '0') {
      return player.red_1qb_std ?? player.redraft ?? player.red_1qb_half ?? player.red_1qb_ppr ?? player.adp ?? null;
    }
    // Default 0.5 Half-PPR
    return player.red_1qb_half ?? player.redraft ?? player.red_1qb_ppr ?? player.red_1qb_std ?? player.adp ?? null;
  }

  // Superflex / 2QB mode
  if (scoring === 'ppr' || scoring === '1.0' || scoring === '1') {
    if (player.red_sf_ppr != null) return player.red_sf_ppr;
    if (player.pos !== 'QB') return player.red_1qb_ppr ?? player.redraft ?? player.red_1qb_half ?? null;
    return player.red_sf_half ?? player.red_sf_std ?? player.dynSF ?? null;
  }
  if (scoring === 'std' || scoring === 'standard' || scoring === '0') {
    if (player.red_sf_std != null) return player.red_sf_std;
    if (player.pos !== 'QB') return player.red_1qb_std ?? player.redraft ?? player.red_1qb_half ?? null;
    return player.red_sf_half ?? player.red_sf_ppr ?? player.dynSF ?? null;
  }
  // Default 0.5 Half-PPR in SF
  if (player.red_sf_half != null) return player.red_sf_half;
  if (player.pos !== 'QB') return player.red_1qb_half ?? player.redraft ?? player.red_1qb_ppr ?? null;
  return player.red_sf_ppr ?? player.red_sf_std ?? player.dynSF ?? null;
}

// Format-aware Composite Draft Score (0-100 scale)
function computeFormatScore(player, options) {
  if (!player) return null;
  const opt = options || {};
  const blend = (opt.blend != null) ? opt.blend : 0.6; // 0 (pure redraft) to 1 (pure dynasty)
  const qbFormat = opt.qbFormat || 'sf';
  const scoring = opt.scoring || opt.scoringFormat || 'half';
  const tePremium = !!opt.tePremium;
  const depth = opt.depth || 250;

  const dynRank = getDynastyRank(player, qbFormat);
  const redRank = getRedraftRank(player, qbFormat, scoring);

  const dynScore = rankToScore(dynRank, depth);
  const redScore = rankToScore(redRank, depth);

  return compositeScore({ pos: player.pos, dynScore: dynScore, redScore: redScore }, blend, tePremium);
}

// Format-adjusted Prospect / Rookie rank calculation
function getProspectRank(player, qbFormat, scoringFormat) {
  if (!player || !player.rookie) return null;
  const is1QB = (qbFormat === '1qb' || qbFormat === '1QB');
  if (is1QB && player.rookieRank != null) {
    return player.rookieRank;
  }
  // If in Superflex mode or no explicit rookieRank, use active dynasty rank
  return getDynastyRank(player, qbFormat);
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

// Formats overall pick number into round.pick format (e.g. 1.04)
function fmtPick(overall, teams) {
  if (!overall || !teams || teams <= 0) return '—';
  const r = Math.ceil(overall / teams);
  const i = overall - (r - 1) * teams;
  return r + '.' + String(i).padStart(2, '0');
}

// Formats an individual starter or bench slot item as HTML
function formatRosterSlotHtml(item, isStarter, teamsCount, byBye = {}) {
  const p = item.player;
  if (!p) {
    return '<div class="rosteritem starter-slot empty-slot">'
      + '<span class="slot-label-tag">[' + item.label + ']</span>'
      + '<span class="meta" style="font-style:italic">Open Starter Slot</span>'
      + '</div>';
  }
  const order = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
  const posUpper = (p.pos || '').toUpperCase();
  const posClass = order.includes(posUpper) ? posUpper : (['DEF', 'D/ST'].includes(posUpper) ? 'DST' : 'other');
  const clash = p.bye && byBye[p.bye] && byBye[p.bye].length >= 2;
  const clickHandler = (p.id != null) ? ('showPlayer(' + p.id + ')') : ('showUnlistedPlayer(' + (p.entry ? p.entry.overall : 0) + ')');
  const unlistedBadge = p.isUnlisted ? ' <span class="meta" style="font-size:10px">(custom)</span>' : '';
  const teamBadge = (p.team && p.team !== '—') ? ' <span class="meta" style="font-size:11.5px; font-weight:600">' + p.team + '</span>' : '';
  const pkStr = p.entry ? '<span class="pk" style="margin-left:auto; margin-right:4px">' + fmtPick(p.entry.overall, teamsCount) + '</span>' : '';

  return '<div class="rosteritem ' + (isStarter ? 'starter-slot' : 'bench-slot') + '">'
    + '<span class="pos ' + posClass + '">' + p.pos + '</span>'
    + '<span class="pname" onclick="' + clickHandler + '">' + p.name + unlistedBadge + '</span>'
    + teamBadge
    + pkStr
    + '<span class="bye' + (clash ? ' clash' : '') + '">' + (p.bye ? 'bye ' + p.bye : '—') + '</span>'
    + '</div>';
}

// Parses Sleeper API draft settings and user data into FantasyDrafter league settings
function parseSleeperDraft(draftData, usersData, currentUsernameOrId) {
  if (!draftData) return null;

  const metadata = draftData.metadata || {};
  const settings = draftData.settings || {};
  const draftOrder = draftData.draft_order || {};
  const slotToRoster = draftData.slot_to_roster_id || {};

  const leagueName = metadata.name || 'Sleeper Draft';
  const teamsCount = Math.max(2, Math.min(32, parseInt(settings.teams, 10) || Object.keys(draftOrder).length || 12));
  const rounds = Math.max(1, Math.min(50, parseInt(settings.rounds, 10) || 25));

  // Determine draft mode: 3RR vs Snake vs Linear
  let mode = 'snake';
  if (settings.reversal_round === 3) {
    mode = '3rr';
  } else if (draftData.type === 'linear') {
    mode = 'linear';
  }

  // Build user mapping from usersData
  const userMap = new Map();
  if (Array.isArray(usersData)) {
    for (const u of usersData) {
      if (!u || !u.user_id) continue;
      const tName = (u.metadata && u.metadata.team_name) ? u.metadata.team_name.trim() : '';
      const dName = u.display_name ? u.display_name.trim() : '';
      userMap.set(String(u.user_id), {
        userId: String(u.user_id),
        displayName: dName,
        teamName: tName || dName || ('User ' + u.user_id)
      });
    }
  }

  // Build teamNames list ordered by slot (1..teamsCount)
  const teamNames = [];
  const slotToUser = {};

  // Inverse draft_order to find which user has slot N
  const slotToUserId = {};
  for (const [userId, slot] of Object.entries(draftOrder)) {
    slotToUserId[slot] = userId;
  }

  for (let s = 1; s <= teamsCount; s++) {
    const uId = slotToUserId[s];
    if (uId) {
      slotToUser[s] = uId;
      const uInfo = userMap.get(String(uId));
      if (uInfo) {
        teamNames.push(uInfo.teamName);
      } else {
        teamNames.push('Slot ' + s);
      }
    } else {
      teamNames.push('Team ' + s);
    }
  }

  // Resolve user slot if username or ID provided
  let mySlot = 1;
  if (currentUsernameOrId) {
    const searchTarget = String(currentUsernameOrId).trim().toLowerCase();
    for (let s = 1; s <= teamsCount; s++) {
      const uId = slotToUser[s];
      const uInfo = uId ? userMap.get(String(uId)) : null;
      const tName = (teamNames[s - 1] || '').toLowerCase();
      if (uId && String(uId).toLowerCase() === searchTarget) {
        mySlot = s;
        break;
      }
      if (uInfo && (uInfo.displayName.toLowerCase() === searchTarget || uInfo.teamName.toLowerCase() === searchTarget)) {
        mySlot = s;
        break;
      }
      if (tName === searchTarget) {
        mySlot = s;
        break;
      }
    }
  }

  return {
    leagueName: leagueName,
    teams: teamsCount,
    rounds: rounds,
    mode: mode,
    teamNames: teamNames,
    slot: mySlot,
    draftId: draftData.draft_id || null,
    leagueId: draftData.league_id || null,
    status: draftData.status || 'pre_draft',
    slotToUserId: slotToUser
  };
}

// Resolves a remote pick payload (from Sleeper or ESPN) against local players list
function resolveRemotePick(remotePick, playersList, options) {
  if (!remotePick) return null;

  const opt = options || {};
  const unlistedFallback = opt.unlistedFallback !== false;
  const overall = remotePick.pick_no != null ? parseInt(remotePick.pick_no, 10) : (remotePick.overall != null ? parseInt(remotePick.overall, 10) : null);

  let rawName = '';
  let rawPos = '';
  let rawTeam = '';

  if (remotePick.metadata) {
    const meta = remotePick.metadata;
    const fn = (meta.first_name || '').trim();
    const ln = (meta.last_name || '').trim();
    rawName = (fn + ' ' + ln).trim() || meta.name || '';
    rawPos = (meta.position || meta.pos || '').trim().toUpperCase();
    rawTeam = (meta.team || '').trim().toUpperCase();
  } else {
    rawName = (remotePick.name || remotePick.playerName || '').trim();
    rawPos = (remotePick.pos || remotePick.position || '').trim().toUpperCase();
    rawTeam = (remotePick.team || '').trim().toUpperCase();
  }

  function stripSuffix(name) {
    if (!name) return '';
    return String(name)
      .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const NICKNAME_ALIASES = {
    'hollywood brown': 'marquise brown',
    'gabe davis': 'gabriel davis',
    'mitch trubisky': 'mitchell trubisky',
    'josh palmer': 'joshua palmer',
    'cam akers': 'cameron akers',
    'chig okonkwo': 'chigoziem okonkwo',
    'dj moore': 'dj moore',
    'd.j. moore': 'dj moore',
    'cj stroud': 'cj stroud',
    'c.j. stroud': 'cj stroud',
    'aj brown': 'aj brown',
    'a.j. brown': 'aj brown',
    'jk dobbins': 'jk dobbins',
    'j.k. dobbins': 'jk dobbins',
    'tj hockenson': 'tj hockenson',
    't.j. hockenson': 'tj hockenson',
    'dk metcalf': 'dk metcalf',
    'd.k. metcalf': 'dk metcalf',
    'd metcalf': 'dk metcalf'
  };

  // Handle Defense / Special Teams resolution (only if position or name indicates defense)
  const isDefPos = ['DST', 'DEF', 'D/ST'].includes(rawPos);
  const hasDefKeyword = /\b(dst|def|d\/st|defense)\b/i.test(rawName) || /\b(49ers|chiefs|cowboys|eagles|ravens|bills|packers|steelers)\s+(dst|def|d\/st|defense)\b/i.test(rawName);
  const dstCanonical = (isDefPos || hasDefKeyword) ? resolveDstCanonical(rawName, rawTeam) : null;

  if (Array.isArray(playersList)) {
    if (isDefPos || dstCanonical) {
      const targetTeam = dstCanonical ? dstCanonical.team : rawTeam;
      const targetNameNorm = dstCanonical ? normalizeName(dstCanonical.name) : normalizeName(rawName);
      const matchDst = playersList.find(p => {
        if (!['DST', 'DEF', 'D/ST'].includes((p.pos || '').toUpperCase())) return false;
        if (targetTeam && p.team && p.team.toUpperCase() === targetTeam) return true;
        return normalizeName(p.name) === targetNameNorm;
      });
      if (matchDst) {
        return {
          playerId: matchDst.id,
          player: matchDst,
          isUnlisted: false,
          overall: overall
        };
      }
    }

    const cleanRaw = rawName.trim();
    const normName = normalizeName(cleanRaw);
    const noSuffixNorm = normalizeName(stripSuffix(cleanRaw));
    const aliasTarget = NICKNAME_ALIASES[cleanRaw.toLowerCase()] || NICKNAME_ALIASES[normName] || NICKNAME_ALIASES[noSuffixNorm];

    // Tier 1 & Tier 2: Exact, Suffix-Insensitive, or Nickname Match
    if (normName) {
      let matches = playersList.filter(p => {
        const pNorm = normalizeName(p.name);
        const pNoSuffix = normalizeName(stripSuffix(p.name));
        if (pNorm === normName || pNoSuffix === noSuffixNorm) return true;
        if (aliasTarget && (pNorm === aliasTarget || pNoSuffix === aliasTarget)) return true;
        return false;
      });

      if (matches.length === 1) {
        return {
          playerId: matches[0].id,
          player: matches[0],
          isUnlisted: false,
          overall: overall
        };
      }

      if (matches.length > 1) {
        if (rawPos) {
          const posMatches = matches.filter(p => (p.pos || '').toUpperCase() === rawPos);
          if (posMatches.length === 1) {
            return {
              playerId: posMatches[0].id,
              player: posMatches[0],
              isUnlisted: false,
              overall: overall
            };
          }
          if (posMatches.length > 1) matches = posMatches;
        }

        if (rawTeam) {
          const teamMatches = matches.filter(p => (p.team || '').toUpperCase() === rawTeam);
          if (teamMatches.length > 0) {
            return {
              playerId: teamMatches[0].id,
              player: teamMatches[0],
              isUnlisted: false,
              overall: overall
            };
          }
        }

        return {
          playerId: matches[0].id,
          player: matches[0],
          isUnlisted: false,
          overall: overall
        };
      }
    }

    // Tier 3: Abbreviated First Initial Match (e.g. 'D. Samuel Sr.', 'J. Herbert', 'D. Metcalf', 'D. Swift', 'M. Golden')
    const initMatch = cleanRaw.match(/^([a-zA-Z])\.?\s+([a-zA-Z'\-]+(?:\s+(?:jr|sr|ii|iii|iv|v)\.?)?)$/i);
    if (initMatch) {
      const firstInit = initMatch[1].toLowerCase();
      const lastNameRaw = stripSuffix(initMatch[2]).trim();
      const normLastName = normalizeName(lastNameRaw);

      let initialCandidates = playersList.filter(p => {
        const parts = stripSuffix(p.name).trim().split(/\s+/);
        if (parts.length < 2) return false;
        const pFirst = parts[0].toLowerCase();
        const pLast = normalizeName(parts.slice(1).join(' '));
        const pFirstInit = pFirst.charAt(0);
        return pFirstInit === firstInit && pLast === normLastName;
      });

      if (rawPos) {
        const posMatches = initialCandidates.filter(p => (p.pos || '').toUpperCase() === rawPos);
        if (posMatches.length > 0) initialCandidates = posMatches;
      }
      if (rawTeam) {
        const teamMatches = initialCandidates.filter(p => (p.team || '').toUpperCase() === rawTeam);
        if (teamMatches.length > 0) initialCandidates = teamMatches;
      }

      if (initialCandidates.length === 1) {
        return {
          playerId: initialCandidates[0].id,
          player: initialCandidates[0],
          isUnlisted: false,
          overall: overall
        };
      }

      if (initialCandidates.length > 1) {
        // Disambiguate by ADP / consensus ranking
        initialCandidates.sort((a, b) => (a.adp || 999) - (b.adp || 999));
        return {
          playerId: initialCandidates[0].id,
          player: initialCandidates[0],
          isUnlisted: false,
          overall: overall
        };
      }
    }
  }

  // Fallback to Unlisted Pick if not found
  if (unlistedFallback) {
    const finalPos = rawPos || (dstCanonical ? 'DST' : 'OTHER');
    const finalName = rawName || ('Unlisted ' + (finalPos !== 'OTHER' ? finalPos : 'Player'));
    const finalTeam = rawTeam || (dstCanonical ? dstCanonical.team : '—');
    return {
      playerId: null,
      customName: finalName,
      customPos: finalPos,
      customTeam: finalTeam,
      customBye: null,
      isUnlisted: true,
      overall: overall
    };
  }

  return null;
}

// Reconciles local draft log against a full remote pick list (supporting additions, rollbacks, and idempotency)
function reconcileDraftLog(currentLog, remotePicks, playersList, draftContext) {
  const existing = Array.isArray(currentLog) ? currentLog : [];
  const remote = Array.isArray(remotePicks) ? remotePicks : [];
  const ctx = draftContext || {};
  const teams = ctx.teams || 12;
  const slot = ctx.slot || 1;
  const mode = ctx.mode || '3rr';
  const teamNames = ctx.teamNames || null;

  const newLog = [];
  let addedCount = 0;
  let rolledBackCount = 0;
  let changed = false;

  const targetLength = remote.length;
  if (existing.length > targetLength) {
    rolledBackCount = existing.length - targetLength;
    changed = true;
  }

  for (let i = 0; i < targetLength; i++) {
    const overall = i + 1;
    const rPick = remote[i];
    const resolved = resolveRemotePick(rPick, playersList, { unlistedFallback: true });
    const slotInfo = teamForOverall(overall, teams, mode, teamNames, slot);
    const isMine = slotInfo.isMe;

    const existingEntry = existing[i];
    let isMatch = false;

    if (existingEntry && existingEntry.overall === overall) {
      if (resolved.playerId != null && existingEntry.playerId === resolved.playerId) {
        isMatch = true;
      } else if (resolved.playerId == null && existingEntry.playerId == null && existingEntry.customName === resolved.customName && existingEntry.customPos === resolved.customPos) {
        isMatch = true;
      }
    }

    if (isMatch) {
      newLog.push(existingEntry);
    } else {
      changed = true;
      if (i >= existing.length) addedCount++;
      newLog.push({
        overall: overall,
        playerId: resolved.playerId,
        customName: resolved.customName || null,
        customPos: resolved.customPos || null,
        customTeam: resolved.customTeam || null,
        customBye: resolved.customBye || null,
        mine: isMine
      });
    }
  }

  return {
    log: newLog,
    added: addedCount,
    rolledBack: rolledBackCount,
    changed: changed
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
    fmtPick: fmtPick,
    formatRosterSlotHtml: formatRosterSlotHtml,
    FORMAT_OPTIONS: FORMAT_OPTIONS,
    getDynastyRank: getDynastyRank,
    getRedraftRank: getRedraftRank,
    computeFormatScore: computeFormatScore,
    getProspectRank: getProspectRank,
    NFL_DEFENSES: NFL_DEFENSES,
    resolveDstCanonical: resolveDstCanonical,
    parseSleeperDraft: parseSleeperDraft,
    resolveRemotePick: resolveRemotePick,
    reconcileDraftLog: reconcileDraftLog,
  };
}
