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
// Optionally accepts tradedPicks map { [overall]: toSlot } to compute effective picks.
function picksForSlot(slot, teams, rounds, mode, tradedPicks) {
  const picks = [];
  if (tradedPicks && typeof tradedPicks === 'object' && Object.keys(tradedPicks).length > 0) {
    const total = teams * rounds;
    for (let o = 1; o <= total; o++) {
      const natural = slotForOverall(o, teams, mode).slot;
      const effective = (tradedPicks[o] != null) ? parseInt(tradedPicks[o], 10) : natural;
      if (effective === slot) {
        picks.push(o);
      }
    }
    return picks;
  }
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
  GB: { name: 'Green Bay Packers', city: 'Green Bay', mascot: 'Packers' },
  HOU: { name: 'Houston Texans', city: 'Houston', mascot: 'Texans' },
  IND: { name: 'Indianapolis Colts', city: 'Indianapolis', mascot: 'Colts' },
  JAX: { name: 'Jacksonville Jaguars', city: 'Jacksonville', mascot: 'Jaguars' },
  KC: { name: 'Kansas City Chiefs', city: 'Kansas City', mascot: 'Chiefs' },
  LV: { name: 'Las Vegas Raiders', city: 'Las Vegas', mascot: 'Raiders' },
  LAC: { name: 'Los Angeles Chargers', city: 'Los Angeles', mascot: 'Chargers' },
  LAR: { name: 'Los Angeles Rams', city: 'Los Angeles', mascot: 'Rams' },
  MIA: { name: 'Miami Dolphins', city: 'Miami', mascot: 'Dolphins' },
  MIN: { name: 'Minnesota Vikings', city: 'Minnesota', mascot: 'Vikings' },
  NE: { name: 'New England Patriots', city: 'New England', mascot: 'Patriots' },
  NO: { name: 'New Orleans Saints', city: 'New Orleans', mascot: 'Saints' },
  NYG: { name: 'New York Giants', city: 'New York Giants', mascot: 'Giants' },
  NYJ: { name: 'New York Jets', city: 'New York Jets', mascot: 'Jets' },
  PHI: { name: 'Philadelphia Eagles', city: 'Philadelphia', mascot: 'Eagles' },
  PIT: { name: 'Pittsburgh Steelers', city: 'Pittsburgh', mascot: 'Steelers' },
  SF: { name: 'San Francisco 49ers', city: 'San Francisco', mascot: '49ers' },
  SEA: { name: 'Seattle Seahawks', city: 'Seattle', mascot: 'Seahawks' },
  TB: { name: 'Tampa Bay Buccaneers', city: 'Tampa Bay', mascot: 'Buccaneers' },
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

// Formats player ranking pills based on active leagueType and format settings
function formatPlayerStats(p, settings, activeScore) {
  if (!p) return [];
  const s = settings || {};
  const isRedraft = (s.leagueType === 'redraft');
  const qbTag = (s.qbFormat === '1qb' ? '1QB' : 'SF');
  const scTag = (s.scoring || 'half').toUpperCase();
  const activeDyn = getDynastyRank(p, s.qbFormat);
  const activeRed = getRedraftRank(p, s.qbFormat, s.scoring);

  let rawStats = [];
  if (isRedraft) {
    rawStats = [
      ['Active Mode (' + qbTag + ' ' + scTag + ')', activeScore != null ? Number(activeScore).toFixed(1) + ' pts' : null],
      ['Redraft (' + qbTag + ' ' + scTag + ')', activeRed],
      ['ADP', p.adp ? Number(p.adp).toFixed(0) : null],
      ['Age', p.age ? p.age + 'y' : null],
      ['ESPN', p.espn_ppr || p.espn_std],
      ['Yahoo', p.yahoo],
      ['Boris Chen', p.boris_half || p.boris_ppr || p.boris_std]
    ];
  } else {
    // Dynasty
    rawStats = [
      ['Active Mode (' + qbTag + ' ' + scTag + ')', activeScore != null ? Number(activeScore).toFixed(1) + ' pts' : null],
      ['Dynasty ' + qbTag, activeDyn],
      ['Rookie Draft Rank', p.rookieRank ? '#' + p.rookieRank : (p.rookie ? 'Rookie' : null)],
      ['Age', p.age ? p.age + 'y' : null],
      ['ADP', p.adp ? Number(p.adp).toFixed(0) : null],
      ['ESPN', p.espn_ppr || p.espn_std],
      ['Yahoo', p.yahoo],
      ['Boris Chen', p.boris_half || p.boris_ppr || p.boris_std]
    ];
  }

  return rawStats.filter(x => x[1] != null);
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

// 1D Natural Breaks (Fisher-Jenks Algorithm)
// Partitions a sorted array of numeric values into `numClasses` clusters that
// minimize the sum of squared deviations from cluster means (SSD).
function computeJenksBreaks(data, numClasses) {
  if (!Array.isArray(data) || data.length === 0) return [];
  const sorted = data.slice().filter(v => typeof v === 'number' && !isNaN(v)).sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return [];
  const kClasses = Math.max(1, Math.min(numClasses || 1, n));
  if (kClasses <= 1) return [sorted[n - 1]];
  if (n <= kClasses) return sorted;

  const sum = new Float64Array(n + 1);
  const sumSq = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    sum[i + 1] = sum[i] + sorted[i];
    sumSq[i + 1] = sumSq[i] + sorted[i] * sorted[i];
  }

  function ssd(j, i) {
    const count = i - j;
    if (count <= 0) return 0;
    const s = sum[i] - sum[j];
    const ss = sumSq[i] - sumSq[j];
    const v = ss - (s * s) / count;
    return v < 0 ? 0 : v;
  }

  const dp = Array.from({ length: kClasses + 1 }, () => new Float64Array(n + 1).fill(Infinity));
  const back = Array.from({ length: kClasses + 1 }, () => new Int32Array(n + 1));

  for (let i = 1; i <= n; i++) {
    dp[1][i] = ssd(0, i);
  }

  for (let k = 2; k <= kClasses; k++) {
    for (let i = k; i <= n; i++) {
      for (let j = k - 1; j < i; j++) {
        const val = dp[k - 1][j] + ssd(j, i);
        if (val < dp[k][i]) {
          dp[k][i] = val;
          back[k][i] = j;
        }
      }
    }
  }

  const breaks = [];
  let cur = n;
  for (let k = kClasses; k >= 2; k--) {
    const idx = back[k][cur];
    breaks.unshift(sorted[idx - 1]);
    cur = idx;
  }
  breaks.push(sorted[n - 1]);
  return breaks;
}

// Maps a 0-100 score to a 1-based Tier (1 = highest score cluster) based on Jenks breaks.
function scoreToTierFromBreaks(score, breaks) {
  if (!breaks || breaks.length <= 1 || score == null) return 1;
  let tier = 1;
  for (let i = breaks.length - 2; i >= 0; i--) {
    if (score <= breaks[i]) {
      tier++;
    } else {
      break;
    }
  }
  return tier;
}

// Assigns stable pre-computed Positional Tiers (`posTier`) and Overall Board Tiers (`overallTier`)
// to player records. Tiers remain invariant when players are drafted or hidden.
function assignTiers(players, options) {
  if (!Array.isArray(players) || players.length === 0) return players || [];
  const opt = options || {};

  const posTierCounts = {
    QB: 5,
    RB: 6,
    WR: 6,
    TE: 5,
    K: 3,
    DST: 3
  };

  // 1. Assign Positional Tiers (`posTier`) using 1D Natural Breaks (Jenks)
  const positions = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
  for (const pos of positions) {
    const posPlayers = players.filter(p => {
      const pPos = (p.pos || '').toUpperCase();
      if (pos === 'DST') return ['DST', 'DEF', 'D/ST'].includes(pPos);
      return pPos === pos;
    }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

    if (posPlayers.length === 0) continue;

    const targetK = posTierCounts[pos] || 5;
    const activeScores = posPlayers.filter(p => (p.score ?? 0) >= 5).map(p => p.score);
    const maxK = Math.max(1, Math.floor(activeScores.length / 2));
    const k = Math.min(targetK, maxK);
    const breaks = computeJenksBreaks(activeScores, k);

    for (const p of posPlayers) {
      if (p.score == null || p.score < 5) {
        p.posTier = breaks.length > 0 ? breaks.length + 1 : (targetK + 1);
      } else {
        p.posTier = scoreToTierFromBreaks(p.score, breaks);
      }
    }
  }

  // 2. Assign Overall Board Tiers (`overallTier`) for ALL view (~12-14 round-equivalent value tiers)
  const allScored = players.filter(p => p.score != null && p.score >= 5).sort((a, b) => b.score - a.score).slice(0, 250);
  const targetOverallK = opt.numOverallTiers || 12;
  const maxOverallK = Math.max(1, Math.floor(allScored.length / 3));
  const overallK = Math.min(targetOverallK, maxOverallK);
  const overallBreaks = computeJenksBreaks(allScored.map(p => p.score), overallK);

  for (const p of players) {
    if (p.score == null || p.score < 5) {
      p.overallTier = overallBreaks.length > 0 ? overallBreaks.length + 1 : (overallK + 1);
    } else {
      p.overallTier = scoreToTierFromBreaks(p.score, overallBreaks);
    }
  }

  return players;
}

// Calculates remaining available player counts and tier scarcity alerts per tier.
function getTierScarcity(players, takenSet, posFilter) {
  const isTaken = (id) => {
    if (!takenSet) return false;
    if (typeof takenSet.has === 'function') return takenSet.has(id);
    if (Array.isArray(takenSet)) return takenSet.includes(id);
    return Boolean(takenSet[id]);
  };

  const isAll = (!posFilter || posFilter === 'ALL');
  const filtered = (players || []).filter(p => {
    if (!p) return false;
    if (isAll) return true;
    const pPos = (p.pos || '').toUpperCase();
    if (posFilter === 'DST') return ['DST', 'DEF', 'D/ST'].includes(pPos);
    return pPos === posFilter;
  });

  const tierMap = new Map();
  for (const p of filtered) {
    const t = isAll ? (p.overallTier || 1) : (p.posTier || 1);
    if (!tierMap.has(t)) {
      tierMap.set(t, { tier: t, total: 0, taken: 0, remaining: 0 });
    }
    const entry = tierMap.get(t);
    entry.total++;
    if (isTaken(p.id)) {
      entry.taken++;
    } else {
      entry.remaining++;
    }
  }

  const tiers = Array.from(tierMap.values()).sort((a, b) => a.tier - b.tier);
  const playerAlerts = new Map();

  for (const tInfo of tiers) {
    // Flag critical tier cliffs: top tiers (T1-T4) where players have been drafted and 1-2 remain
    tInfo.isScarcity = (tInfo.taken > 0 && tInfo.remaining > 0 && tInfo.remaining <= 2 && tInfo.tier <= 4);
    if (tInfo.isScarcity) {
      const isLast = (tInfo.remaining === 1);
      const label = isLast ? ('⚡ Last in T' + tInfo.tier) : ('⚠️ 2 left in T' + tInfo.tier);
      tInfo.scarcityLabel = label;

      // Find available players in this tier to attach row alerts
      for (const p of filtered) {
        const pt = isAll ? (p.overallTier || 1) : (p.posTier || 1);
        if (pt === tInfo.tier && !isTaken(p.id)) {
          playerAlerts.set(p.id, {
            tier: tInfo.tier,
            remaining: tInfo.remaining,
            label: label,
            isLast: isLast
          });
        }
      }
    }
  }

  return {
    isAll: isAll,
    tiers: tiers,
    playerAlerts: playerAlerts
  };
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
// Optionally accepts tradedPicks map { [overall]: toSlot } to resolve traded pick owners.
function teamForOverall(overall, teamsCount, mode, teamNames, mySlot, tradedPicks) {
  const { round, slot } = slotForOverall(overall, teamsCount, mode);
  const hasTrades = Boolean(tradedPicks && typeof tradedPicks === 'object' && Object.keys(tradedPicks).length > 0);
  const effectiveSlot = (hasTrades && tradedPicks[overall] != null) ? parseInt(tradedPicks[overall], 10) : slot;
  let name;
  if (Array.isArray(teamNames)) {
    name = teamNames[effectiveSlot - 1];
  } else if (teamNames && typeof teamNames === 'object') {
    name = teamNames[effectiveSlot] || teamNames[String(effectiveSlot)];
  }
  if (!name || !name.trim()) {
    name = (effectiveSlot === mySlot) ? 'My Team' : ('Team ' + effectiveSlot);
  }
  const res = {
    round: round,
    slot: effectiveSlot,
    name: name.trim(),
    isMe: effectiveSlot === mySlot,
  };
  if (hasTrades) {
    res.originalSlot = slot;
    res.isTraded = (effectiveSlot !== slot);
  }
  return res;
}

// Resolves the player object for any draft log entry (supporting unlisted picks and keepers).
function resolvePickPlayer(entry, players) {
  if (!entry) return null;
  let res = null;
  if (entry.playerId != null && players) {
    const p = (typeof players === 'function') ? players(entry.playerId) : players[entry.playerId];
    if (p) res = Object.assign({ team: p.team || '—' }, p);
  }
  if (!res) {
    const pos = (entry.customPos || 'OTHER').toUpperCase();
    const name = entry.customName ? entry.customName.trim() : ('Unlisted ' + (pos !== 'OTHER' ? pos : 'Player'));
    res = {
      id: entry.playerId != null ? entry.playerId : null,
      name: name,
      pos: pos,
      team: entry.customTeam ? entry.customTeam.trim().toUpperCase() : '—',
      bye: entry.customBye || null,
      isUnlisted: true,
    };
  }
  if (entry.isKeeper) {
    res.isKeeper = true;
  }
  return res;
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

// Reorders an item in the watchlist from fromIdx to toIdx. Returns a new array.
function reorderWatchlist(watchlist, fromIdx, toIdx) {
  if (!Array.isArray(watchlist)) return [];
  const list = watchlist.slice();
  if (fromIdx < 0 || fromIdx >= list.length || toIdx < 0 || toIdx >= list.length) {
    return list;
  }
  const [item] = list.splice(fromIdx, 1);
  list.splice(toIdx, 0, item);
  return list;
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
  const teamBadge = (p.team && p.team !== '—') ? ' <span class="meta team-meta" style="font-size:11.5px; font-weight:600">' + p.team + '</span>' : '';
  const isKeeper = p.isKeeper || (p.entry && p.entry.isKeeper);
  const keeperBadge = isKeeper ? '<span class="keeper-badge" title="Keeper" style="font-size:11px; margin-right:2px">🔒</span>' : '';
  const pkStr = p.entry ? '<span class="pk" style="margin-left:auto; margin-right:4px">' + keeperBadge + fmtPick(p.entry.overall, teamsCount) + '</span>' : (isKeeper ? '<span class="pk" style="margin-left:auto; margin-right:4px">' + keeperBadge + '</span>' : '');

  let injTag = '';
  if (p.injury && p.injury.code) {
    const c = p.injury.code;
    const tip = (p.injury.status || 'Injured')
      + (p.injury.type ? ': ' + p.injury.type : '')
      + (p.injury.detail ? ' (' + p.injury.detail + ')' : '')
      + (p.injury.returnDate ? ' - Est. Return: ' + p.injury.returnDate : '');
    injTag = ' <span class="injtag inj-' + c.toLowerCase() + '" title="' + tip.replace(/"/g, '&quot;') + '">' + c + '</span>';
  }

  return '<div class="rosteritem ' + (isStarter ? 'starter-slot' : 'bench-slot') + (isKeeper ? ' keeper-slot' : '') + '">'
    + '<span class="pos ' + posClass + '">' + p.pos + '</span>'
    + '<span class="pname" onclick="' + clickHandler + '" title="' + (p.name || '').replace(/"/g, '&quot;') + '">' + p.name + unlistedBadge + '</span>'
    + injTag
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

  const TEAM_ALIASES = {
    'WSH': 'WAS',
    'JAC': 'JAX',
    'OAK': 'LV',
    'SD': 'LAC',
    'STL': 'LAR',
    'LA': 'LAR'
  };
  if (TEAM_ALIASES[rawTeam]) {
    rawTeam = TEAM_ALIASES[rawTeam];
  }

  // If team abbreviation is stuck to the end of player name (e.g. "Jayden Daniels WSH")
  const trailingTeamMatch = rawName.match(/\b(WSH|WAS|JAC|JAX|KC|LV|LAC|LAR|SF|TB|TEN|MIN|NE|NO|NYG|NYJ|PHI|PIT|MIA|ARI|ATL|BAL|BUF|CAR|CHI|CIN|CLE|DAL|DEN|DET|GB|HOU|IND|SEA)\b$/i);
  if (trailingTeamMatch) {
    if (!rawTeam || rawTeam === 'FA' || rawTeam === '—') {
      const tUpper = trailingTeamMatch[1].toUpperCase();
      rawTeam = TEAM_ALIASES[tUpper] || tUpper;
    }
    rawName = rawName.slice(0, trailingTeamMatch.index).trim();
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
    const rPick = remote[i];
    if (!rPick) continue;
    const overall = (typeof rPick === 'object' && (rPick.overall || rPick.pick_no)) ? (rPick.overall || rPick.pick_no) : (i + 1);
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

// --- Pick Ownership & Trading ---
function generateDraftPicks(teams, rounds, mode, tradedPicks, teamNames, mySlot) {
  const list = [];
  const trades = tradedPicks || {};
  const total = teams * rounds;
  for (let o = 1; o <= total; o++) {
    const info = teamForOverall(o, teams, mode, teamNames, mySlot, trades);
    const natural = slotForOverall(o, teams, mode);
    list.push({
      overall: o,
      round: natural.round,
      originalSlot: natural.slot,
      currentSlot: info.slot,
      originalTeam: (Array.isArray(teamNames) ? teamNames[natural.slot - 1] : null) || ('Team ' + natural.slot),
      currentTeam: info.name,
      isTraded: !!info.isTraded,
      isMe: !!info.isMe
    });
  }
  return list;
}

function applyPickTrade(tradedPicks, overallPick, toSlot, teams, mode) {
  const current = Object.assign({}, tradedPicks);
  const natural = (teams && mode) ? slotForOverall(overallPick, teams, mode).slot : null;
  if (toSlot == null || (natural != null && parseInt(toSlot, 10) === natural)) {
    delete current[overallPick];
  } else {
    current[overallPick] = parseInt(toSlot, 10);
  }
  return current;
}

function getPicksForTeam(slot, picksGrid) {
  if (!Array.isArray(picksGrid)) return [];
  return picksGrid.filter(p => p.currentSlot === slot);
}

// --- Draft Queue Management ---
function isQueued(queue, playerId) {
  if (!Array.isArray(queue) || playerId == null) return false;
  return queue.includes(playerId);
}

function addToQueue(queue, playerId) {
  if (playerId == null) return Array.isArray(queue) ? queue.slice() : [];
  const list = Array.isArray(queue) ? queue.slice() : [];
  if (!list.includes(playerId)) {
    list.push(playerId);
  }
  return list;
}

function removeFromQueue(queue, playerId) {
  if (!Array.isArray(queue) || playerId == null) return Array.isArray(queue) ? queue.slice() : [];
  return queue.filter(id => id !== playerId);
}

function reorderQueue(queue, fromIdx, toIdx) {
  if (!Array.isArray(queue)) return [];
  const list = queue.slice();
  if (fromIdx < 0 || fromIdx >= list.length || toIdx < 0 || toIdx >= list.length) {
    return list;
  }
  const [item] = list.splice(fromIdx, 1);
  list.splice(toIdx, 0, item);
  return list;
}

function cleanQueue(queue, takenContainer) {
  if (!Array.isArray(queue)) return [];
  if (!takenContainer) return queue.slice();

  let hasTaken;
  if (takenContainer instanceof Set || takenContainer instanceof Map) {
    hasTaken = id => takenContainer.has(id);
  } else if (Array.isArray(takenContainer)) {
    const s = new Set(takenContainer);
    hasTaken = id => s.has(id);
  } else {
    hasTaken = id => !!takenContainer[id];
  }

  return queue.filter(id => !hasTaken(id));
}

function getAvailableQueue(queue, takenContainer, players) {
  const cleaned = cleanQueue(queue, takenContainer);
  if (!players) return [];
  return cleaned.map(id => {
    return (typeof players === 'function') ? players(id) : players[id];
  }).filter(Boolean);
}

// --- Keeper Validation & Pick Resolution Logic ---

// Validates whether a candidate keeper can be assigned to a team and round
function validateKeeperAssignment(candidate, existingKeepers, maxKeepers, teams, rounds, mode, tradedPicks) {
  if (!candidate || typeof candidate !== 'object') {
    return { valid: false, error: 'Invalid keeper configuration' };
  }
  const tCount = Math.max(2, Math.min(32, parseInt(teams, 10) || 12));
  const rCount = Math.max(1, Math.min(50, parseInt(rounds, 10) || 20));
  const slot = parseInt(candidate.slot, 10);
  if (isNaN(slot) || slot < 1 || slot > tCount) {
    return { valid: false, error: 'Invalid team slot ' + candidate.slot };
  }
  const round = parseInt(candidate.round, 10);
  if (isNaN(round) || round < 1 || round > rCount) {
    return { valid: false, error: 'Invalid draft round ' + candidate.round };
  }
  const hasPlayer = (candidate.playerId != null) || (candidate.customName && String(candidate.customName).trim().length > 0);
  if (!hasPlayer) {
    return { valid: false, error: 'A player must be selected for the keeper pick' };
  }

  const keepers = Array.isArray(existingKeepers) ? existingKeepers : [];
  const currentKeepersForTeam = keepers.filter(k => k && k.slot === slot && k.id !== candidate.id);

  // 1. Max Keepers limit check
  const maxLimit = (maxKeepers !== undefined && maxKeepers !== null) ? parseInt(maxKeepers, 10) : 2;
  if (maxLimit != null && currentKeepersForTeam.length >= maxLimit) {
    return { valid: false, error: 'Team ' + slot + ' has reached the maximum of ' + maxLimit + ' keepers' };
  }

  // 2. Duplicate player check
  for (const k of keepers) {
    if (!k || k.id === candidate.id) continue;
    if (candidate.playerId != null && k.playerId != null && candidate.playerId === k.playerId) {
      return { valid: false, error: 'Player is already kept by Team ' + k.slot };
    }
    if (candidate.customName && k.customName && normalizeName(candidate.customName) === normalizeName(k.customName)) {
      return { valid: false, error: 'Player "' + candidate.customName + '" is already kept by Team ' + k.slot };
    }
  }

  // 3. Round pick ownership check
  const allTeamPicks = picksForSlot(slot, tCount, rCount, mode || 'snake', tradedPicks || {});
  const roundPicks = allTeamPicks.filter(o => Math.ceil(o / tCount) === round);

  if (roundPicks.length === 0) {
    return { valid: false, error: 'Team ' + slot + ' owns 0 picks in Round ' + round + ' (due to traded picks)' };
  }

  const existingKeepersInRound = currentKeepersForTeam.filter(k => parseInt(k.round, 10) === round);
  if (existingKeepersInRound.length >= roundPicks.length) {
    return {
      valid: false,
      error: 'Team ' + slot + ' already has ' + existingKeepersInRound.length + ' keeper(s) assigned in Round ' + round + ' (owns ' + roundPicks.length + ' pick(s))'
    };
  }

  return { valid: true };
}

// Maps all keepers to their exact overall pick numbers based on draft order and traded picks
function getKeeperPicksMap(keepers, teams, rounds, mode, tradedPicks) {
  const map = {};
  if (!Array.isArray(keepers) || keepers.length === 0) return map;
  const tCount = Math.max(2, Math.min(32, parseInt(teams, 10) || 12));
  const rCount = Math.max(1, Math.min(50, parseInt(rounds, 10) || 20));
  const m = mode || 'snake';
  const trades = (tradedPicks && typeof tradedPicks === 'object') ? tradedPicks : {};

  // Group keepers by (slot, round)
  const grouped = {};
  for (const k of keepers) {
    if (!k || k.slot == null || k.round == null) continue;
    const key = k.slot + '_' + k.round;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(k);
  }

  for (const [key, list] of Object.entries(grouped)) {
    const [slotStr, roundStr] = key.split('_');
    const slot = parseInt(slotStr, 10);
    const round = parseInt(roundStr, 10);
    const allTeamPicks = picksForSlot(slot, tCount, rCount, m, trades);
    const roundPicks = allTeamPicks.filter(o => Math.ceil(o / tCount) === round).sort((a, b) => a - b);

    for (let i = 0; i < list.length; i++) {
      const keeper = list[i];
      if (i < roundPicks.length) {
        const overall = roundPicks[i];
        map[overall] = Object.assign({}, keeper, { overall: overall });
      }
    }
  }

  return map;
}

// Returns the keeper data if overall is a designated keeper pick, otherwise null
function isKeeperPick(overall, keepers, teams, rounds, mode, tradedPicks) {
  if (!overall || !Array.isArray(keepers) || keepers.length === 0) return null;
  const map = getKeeperPicksMap(keepers, teams, rounds, mode, tradedPicks);
  return map[overall] || null;
}

// Calculates upcoming picks for a slot, identifying which are keepers and determining the next active manual draft pick
function getNextDraftPicks(slot, fromPick, teams, rounds, mode, tradedPicks, keepers) {
  const tCount = Math.max(2, Math.min(32, parseInt(teams, 10) || 12));
  const rCount = Math.max(1, Math.min(50, parseInt(rounds, 10) || 20));
  const curPick = Math.max(1, parseInt(fromPick, 10) || 1);
  const trades = (tradedPicks && typeof tradedPicks === 'object') ? tradedPicks : {};
  const keeperList = Array.isArray(keepers) ? keepers : [];

  const allTeamPicks = (typeof picksForSlot === 'function')
    ? picksForSlot(slot, tCount, rCount, mode || 'snake', trades)
    : [];

  const upcoming = allTeamPicks.filter(p => p >= curPick);
  const keeperMap = getKeeperPicksMap(keeperList, tCount, rCount, mode || 'snake', trades);

  const draftPicks = upcoming.filter(p => !keeperMap[p]);
  const nextDraftPick = draftPicks.length > 0 ? draftPicks[0] : null;
  const distance = nextDraftPick != null ? (nextDraftPick - curPick) : null;
  const isSoon = distance != null && distance > 0 && distance <= 3;

  return {
    upcoming: upcoming,
    draftPicks: draftPicks,
    nextDraftPick: nextDraftPick,
    distanceToNextDraftPick: distance,
    isSoon: isSoon
  };
}

// Remaps keeper slot assignments when two draft slots are swapped (e.g. during draft order reordering)
function remapKeepersOnSlotSwap(keepers, slotA, slotB) {
  if (!Array.isArray(keepers)) return [];
  const a = parseInt(slotA, 10);
  const b = parseInt(slotB, 10);
  if (isNaN(a) || isNaN(b) || a === b) return keepers.slice();

  return keepers.map(k => {
    if (!k || typeof k !== 'object') return k;
    if (k.slot === a) {
      return Object.assign({}, k, { slot: b });
    }
    if (k.slot === b) {
      return Object.assign({}, k, { slot: a });
    }
    return Object.assign({}, k);
  });
}

// --- Draft State Serialization & Migration ---
const DRAFT_SCHEMA_VERSION = 2;

function serializeDraftState(state) {
  const s = state || {};
  const keepers = Array.isArray(s.keepers) ? s.keepers.slice() : (Array.isArray(s.settings?.keepers) ? s.settings.keepers.slice() : []);
  return {
    version: DRAFT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    settings: Object.assign({ maxKeepers: 2 }, s.settings || {}),
    keepers: keepers,
    draftLog: Array.isArray(s.draftLog) ? s.draftLog.slice() : [],
    watchlist: Array.isArray(s.watchlist) ? s.watchlist.slice() : [],
    queue: Array.isArray(s.queue) ? s.queue.slice() : [],
    tradedPicks: Object.assign({}, s.tradedPicks || {}),
    syncSettings: Object.assign({}, s.syncSettings || {}),
  };
}

function deserializeDraftState(input, currentPlayers) {
  if (!input) return { ok: false, error: 'Empty draft payload' };

  let raw = input;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch (err) {
      return { ok: false, error: 'Invalid JSON format: ' + err.message };
    }
  }

  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'Payload must be an object' };
  }

  // Handle version detection and migration
  const version = raw.version || 1;
  const settings = Object.assign({}, raw.settings || {});
  if (settings.maxKeepers === undefined || settings.maxKeepers === null) {
    settings.maxKeepers = 2;
  } else {
    settings.maxKeepers = Math.max(0, Math.min(10, parseInt(settings.maxKeepers, 10) || 0));
  }

  const rawKeepers = Array.isArray(raw.keepers) ? raw.keepers : (Array.isArray(settings.keepers) ? settings.keepers : []);
  const validKeepers = [];
  for (const k of rawKeepers) {
    if (!k || typeof k !== 'object') continue;
    validKeepers.push({
      id: k.id || ('k_' + Math.random().toString(36).substr(2, 9)),
      slot: parseInt(k.slot, 10) || 1,
      round: parseInt(k.round, 10) || 1,
      playerId: k.playerId != null ? parseInt(k.playerId, 10) : null,
      customName: k.customName ? String(k.customName).trim() : null,
      customPos: k.customPos ? String(k.customPos).trim().toUpperCase() : null,
      customTeam: k.customTeam ? String(k.customTeam).trim().toUpperCase() : null,
      customBye: k.customBye != null ? parseInt(k.customBye, 10) : null
    });
  }

  const draftLog = Array.isArray(raw.draftLog) ? raw.draftLog : [];
  const watchlist = Array.isArray(raw.watchlist) ? raw.watchlist : [];
  const queue = Array.isArray(raw.queue) ? raw.queue : [];
  const tradedPicks = (raw.tradedPicks && typeof raw.tradedPicks === 'object') ? raw.tradedPicks : {};
  const syncSettings = (raw.syncSettings && typeof raw.syncSettings === 'object') ? raw.syncSettings : {};

  // Sanitize draftLog entries
  const validLog = [];
  for (const entry of draftLog) {
    if (!entry || typeof entry !== 'object') continue;
    validLog.push({
      overall: parseInt(entry.overall, 10) || (validLog.length + 1),
      playerId: entry.playerId != null ? parseInt(entry.playerId, 10) : null,
      customName: entry.customName ? String(entry.customName).trim() : null,
      customPos: entry.customPos ? String(entry.customPos).trim().toUpperCase() : null,
      customTeam: entry.customTeam ? String(entry.customTeam).trim().toUpperCase() : null,
      customBye: entry.customBye != null ? parseInt(entry.customBye, 10) : null,
      mine: !!entry.mine,
      isKeeper: !!entry.isKeeper
    });
  }

  return {
    ok: true,
    version: DRAFT_SCHEMA_VERSION,
    migratedFrom: version < DRAFT_SCHEMA_VERSION ? version : null,
    state: {
      settings: settings,
      keepers: validKeepers,
      draftLog: validLog,
      watchlist: watchlist.map(x => parseInt(x, 10)).filter(x => !isNaN(x)),
      queue: queue.map(x => parseInt(x, 10)).filter(x => !isNaN(x)),
      tradedPicks: tradedPicks,
      syncSettings: syncSettings
    }
  };
}

// Generates the 2D grid matrix for the interactive Draft Board (rows = rounds, cols = slots 1..T)
function generateDraftBoardGrid(options) {
  const opt = options || {};
  const teams = Math.max(2, Math.min(32, parseInt(opt.teams, 10) || 12));
  const rounds = Math.max(1, Math.min(50, parseInt(opt.rounds, 10) || 20));
  const mode = opt.mode || '3rr';
  const log = Array.isArray(opt.log) ? opt.log : [];
  const keepers = Array.isArray(opt.keepers) ? opt.keepers : [];
  const tradedPicks = (opt.tradedPicks && typeof opt.tradedPicks === 'object') ? opt.tradedPicks : {};
  const teamNames = opt.teamNames || null;
  const mySlot = parseInt(opt.mySlot, 10) || 1;
  const currentPickNum = (opt.currentPickNum != null) ? parseInt(opt.currentPickNum, 10) : (log.length + 1);
  const playersLookup = opt.playersLookup || opt.byId || null;

  // Build lookup maps for fast access
  const pickMap = new Map();
  for (const entry of log) {
    if (entry && entry.overall != null) {
      pickMap.set(entry.overall, entry);
    }
  }

  const keeperMap = (typeof getKeeperPicksMap === 'function')
    ? getKeeperPicksMap(keepers, teams, rounds, mode, tradedPicks)
    : {};

  const gridRounds = [];

  for (let r = 1; r <= rounds; r++) {
    const isFwd = roundIsForward(r, mode);
    const rowPicks = [];

    for (let s = 1; s <= teams; s++) {
      const overall = overallPick(r, s, teams, mode);
      const teamInfo = teamForOverall(overall, teams, mode, teamNames, mySlot, tradedPicks);
      const entry = pickMap.get(overall);
      const keeperPick = keeperMap[overall];
      const isDrafted = Boolean(entry);
      const isOnClock = (overall === currentPickNum);

      let playerObj = null;
      let isKeeper = false;
      let isPendingKeeper = false;

      if (entry) {
        playerObj = resolvePickPlayer(entry, playersLookup);
        isKeeper = Boolean(entry.isKeeper || (playerObj && playerObj.isKeeper) || keeperPick);
      } else if (keeperPick) {
        const p = (keeperPick.playerId != null && playersLookup)
          ? ((typeof playersLookup === 'function') ? playersLookup(keeperPick.playerId) : playersLookup[keeperPick.playerId])
          : null;
        playerObj = {
          id: keeperPick.playerId != null ? keeperPick.playerId : null,
          name: keeperPick.customName || (p ? p.name : ('Keeper #' + (keeperPick.playerId || overall))),
          pos: (keeperPick.customPos || (p ? p.pos : 'WR') || 'WR').toUpperCase(),
          team: keeperPick.customTeam || (p ? p.team : '—') || '—',
          bye: keeperPick.customBye != null ? keeperPick.customBye : (p ? p.bye : null),
          isKeeper: true,
          isPendingKeeper: true,
          isUnlisted: Boolean(keeperPick.customName)
        };
        isKeeper = true;
        isPendingKeeper = true;
      }

      rowPicks.push({
        round: r,
        slot: s,
        overall: overall,
        originalSlot: teamInfo.originalSlot != null ? teamInfo.originalSlot : s,
        effectiveSlot: teamInfo.slot,
        originalTeamName: (Array.isArray(teamNames) ? teamNames[s - 1] : null) || ('Team ' + s),
        effectiveTeamName: teamInfo.name,
        isTraded: Boolean(teamInfo.isTraded),
        isMe: Boolean(teamInfo.isMe),
        isOnClock: isOnClock,
        isDrafted: isDrafted,
        isKeeper: isKeeper,
        isPendingKeeper: isPendingKeeper,
        player: playerObj,
        entry: entry || null,
        keeper: keeperPick || null
      });
    }

    gridRounds.push({
      round: r,
      isForward: isFwd,
      picks: rowPicks
    });
  }

  return {
    teams: teams,
    rounds: rounds,
    mode: mode,
    currentPick: currentPickNum,
    grid: gridRounds
  };
}

/**
 * Analyzes live draft strategy with a focus on the user's team needs,
 * upcoming pick distance, opponent threat predictions between turns, and target suggestions.
 */
function analyzeLiveDraftStrategy(options) {
  const opt = options || {};
  const teams = Math.max(2, parseInt(opt.teams, 10) || 12);
  const rounds = Math.max(1, parseInt(opt.rounds, 10) || 20);
  const mode = opt.mode === '3rr' ? '3rr' : 'snake';
  const log = Array.isArray(opt.log) ? opt.log : [];
  const keepers = Array.isArray(opt.keepers) ? opt.keepers : [];
  const tradedPicks = (opt.tradedPicks && typeof opt.tradedPicks === 'object') ? opt.tradedPicks : {};
  const teamNames = opt.teamNames || null;
  const mySlot = Math.max(1, Math.min(teams, parseInt(opt.mySlot, 10) || 1));
  const currentPickNum = Math.max(1, parseInt(opt.currentPickNum, 10) || (log.length + 1));
  const playersLookup = opt.playersLookup || null;
  const rosterSlots = Object.assign({}, DEFAULT_ROSTER_SLOTS, opt.rosterSlots);
  const scoringSettings = opt.scoringSettings || {};
  const availablePlayers = Array.isArray(opt.availablePlayers) ? opt.availablePlayers : [];

  const totalPicks = teams * rounds;
  const isComplete = currentPickNum > totalPicks || log.length >= totalPicks;

  // 1. Group drafted players by effective slot
  const teamDraftedMap = {};
  for (let s = 1; s <= teams; s++) {
    teamDraftedMap[s] = [];
  }

  for (let i = 0; i < log.length; i++) {
    const entry = log[i];
    const overall = entry.overall || (i + 1);
    const teamInfo = teamForOverall(overall, teams, mode, teamNames, mySlot, tradedPicks);
    const player = resolvePickPlayer(entry, playersLookup);
    if (player && teamDraftedMap[teamInfo.slot]) {
      const pCopy = Object.assign({}, player);
      pCopy.pickOverall = overall;
      pCopy.score = pCopy.score ?? computeFormatScore(pCopy, scoringSettings) ?? rankToScore(pCopy.adp || pCopy.rank, 250) ?? 50;
      teamDraftedMap[teamInfo.slot].push(pCopy);
    }
  }

  // Include pre-assigned keepers as drafted context for each team
  for (const k of keepers) {
    if (!k || k.slot == null || k.round == null) continue;
    const overall = overallPick(k.round, k.slot, teams, mode);
    if (overall >= currentPickNum && teamDraftedMap[k.slot]) {
      const p = (k.playerId != null && playersLookup)
        ? ((typeof playersLookup === 'function') ? playersLookup(k.playerId) : playersLookup[k.playerId])
        : null;
      const kPlayer = {
        id: k.playerId != null ? k.playerId : null,
        name: k.customName || (p ? p.name : ('Keeper #' + (k.playerId || overall))),
        pos: (k.customPos || (p ? p.pos : 'WR') || 'WR').toUpperCase(),
        team: k.customTeam || (p ? p.team : '—') || '—',
        bye: k.customBye != null ? k.customBye : (p ? p.bye : null),
        isKeeper: true,
        pickOverall: overall
      };
      kPlayer.score = computeFormatScore(kPlayer, scoringSettings) ?? kPlayer.score ?? rankToScore(kPlayer.adp || kPlayer.rank, 250) ?? 50;
      teamDraftedMap[k.slot].push(kPlayer);
    }
  }

  // 2. Find user's upcoming picks
  const allUserPicks = picksForSlot(mySlot, teams, rounds, mode, tradedPicks).sort((a, b) => a - b);
  const remainingUserPicks = allUserPicks.filter(p => p >= currentPickNum);
  const nextUserPick = remainingUserPicks[0] || null;
  const picksUntilUserTurn = nextUserPick != null ? Math.max(0, nextUserPick - currentPickNum) : 0;
  const isOnClock = (currentPickNum === nextUserPick);

  const currentRound = Math.ceil(currentPickNum / teams);
  const isLateRounds = (currentRound >= rounds - 2);

  // 3. User Roster Allocation & Needs
  const myPlayers = teamDraftedMap[mySlot] || [];
  const myAllocation = assignRosterSlots(myPlayers, rosterSlots);

  const starterReqs = {
    QB: (rosterSlots.qb || 0) + (rosterSlots.superflex ? 1 : 0),
    RB: (rosterSlots.rb || 0) + (rosterSlots.flex ? 1 : 0),
    WR: (rosterSlots.wr || 0) + (rosterSlots.flex ? 1 : 0),
    TE: (rosterSlots.te || 0) + (rosterSlots.flex ? 1 : 0),
    K: (rosterSlots.k || 0),
    DST: (rosterSlots.dst || 0)
  };

  const myCounts = myAllocation.counts || { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 };
  const baseStarterReqs = {
    QB: rosterSlots.qb || 0,
    RB: rosterSlots.rb || 0,
    WR: rosterSlots.wr || 0,
    TE: rosterSlots.te || 0,
    K: rosterSlots.k || 0,
    DST: rosterSlots.dst || 0
  };

  const userNeeds = [];
  const positionsList = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
  for (const pos of positionsList) {
    const filled = myCounts[pos] || 0;
    const baseReq = baseStarterReqs[pos] || 0;
    const maxReq = starterReqs[pos] || 0;
    let urgency = 'FILLED';
    let label = 'Filled';

    const isKOrDst = (pos === 'K' || pos === 'DST');

    if (filled === 0 && baseReq > 0) {
      if (isKOrDst && !isLateRounds) {
        urgency = 'OPTIONAL';
        label = 'Late Rounds';
      } else {
        urgency = 'CRITICAL';
        label = 'Need Starter';
      }
    } else if (filled < baseReq) {
      if (isKOrDst && !isLateRounds) {
        urgency = 'OPTIONAL';
        label = 'Late Rounds';
      } else {
        urgency = 'NEEDED';
        label = `Need ${baseReq - filled} Starter${(baseReq - filled) > 1 ? 's' : ''}`;
      }
    } else if (filled < maxReq) {
      urgency = 'OPTIONAL';
      label = 'Depth / Flex';
    }

    userNeeds.push({
      pos: pos,
      filled: filled,
      baseReq: baseReq,
      maxReq: maxReq,
      urgency: urgency,
      label: label
    });
  }

  // 4. Opponent Threat Timeline between currentPickNum and nextUserPick
  const opponentThreats = [];
  const uniqueTeamsNeedingPos = {
    QB: new Set(),
    RB: new Set(),
    WR: new Set(),
    TE: new Set()
  };

  if (nextUserPick != null && nextUserPick > currentPickNum) {
    for (let pNum = currentPickNum; pNum < nextUserPick; pNum++) {
      const oppTeamInfo = teamForOverall(pNum, teams, mode, teamNames, mySlot, tradedPicks);
      const oppDrafted = teamDraftedMap[oppTeamInfo.slot] || [];
      const oppAllocation = assignRosterSlots(oppDrafted, rosterSlots);
      const oppCounts = oppAllocation.counts || { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 };

      // Identify this opponent's open starter holes (suppress K/DST unless late rounds)
      const oppHoles = [];
      for (const pos of ['QB', 'RB', 'WR', 'TE', 'K', 'DST']) {
        const isKOrDst = (pos === 'K' || pos === 'DST');
        if (isKOrDst && !isLateRounds) continue;

        const oppFilled = oppCounts[pos] || 0;
        const oppBaseReq = baseStarterReqs[pos] || 0;
        if (oppFilled < oppBaseReq) {
          const isCritical = (oppFilled === 0 && oppBaseReq > 0);
          oppHoles.push({ pos: pos, needed: oppBaseReq - oppFilled, isCritical: isCritical });
          if (['QB', 'RB', 'WR', 'TE'].includes(pos)) {
            uniqueTeamsNeedingPos[pos].add(oppTeamInfo.slot);
          }
        }
      }

      oppHoles.sort((a, b) => (b.isCritical ? 1 : 0) - (a.isCritical ? 1 : 0));

      opponentThreats.push({
        overall: pNum,
        pickFmt: fmtPick(pNum, teams),
        slot: oppTeamInfo.slot,
        teamName: oppTeamInfo.name,
        urgentNeeds: oppHoles.slice(0, 3),
        totalDrafted: oppDrafted.length
      });
    }
  }

  // 5. Aggregate Run Danger Alerts (based on unique teams ahead needing that starter)
  const runDangers = [];
  for (const pos of ['QB', 'RB', 'WR', 'TE']) {
    const count = uniqueTeamsNeedingPos[pos].size;
    if (count >= 2) {
      runDangers.push({
        pos: pos,
        threatCount: count,
        level: count >= 3 ? 'HIGH' : 'MED',
        message: `${count} team${count === 1 ? '' : 's'} ahead need ${pos} starters`
      });
    }
  }

  // 6. Best Available Players by Position (Top 5 per Position)
  const criticalPositions = userNeeds
    .filter(n => n.urgency === 'CRITICAL' || n.urgency === 'NEEDED')
    .map(n => n.pos);
  const targetPositions = criticalPositions.length > 0 ? criticalPositions : ['WR', 'RB', 'QB', 'TE'];

  const targetsByPosition = {};
  const positionsToAnalyze = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
  const isDst = p => ['DST', 'DEF', 'D/ST'].includes((p.pos || '').toUpperCase());

  for (const pos of positionsToAnalyze) {
    const candidates = availablePlayers.filter(p => {
      const posUpper = (p.pos || '').toUpperCase();
      if (pos === 'DST') return isDst(p);
      return posUpper === pos;
    });

    candidates.sort((a, b) => {
      const scoreA = a.score ?? computeFormatScore(a, scoringSettings) ?? (100 - (a.rank || 200));
      const scoreB = b.score ?? computeFormatScore(b, scoringSettings) ?? (100 - (b.rank || 200));
      return scoreB - scoreA;
    });

    targetsByPosition[pos] = candidates.slice(0, 5).map(cand => {
      const cScore = cand.score ?? computeFormatScore(cand, scoringSettings) ?? (100 - (cand.rank || 200));
      const valSurplus = (cand.adp != null && nextUserPick != null) ? Math.round(nextUserPick - cand.adp) : 0;
      const byeClash = (typeof getByeClashStatus === 'function')
        ? getByeClashStatus(cand, myPlayers)
        : { type: 'none', samePos: [], otherPos: [] };
      const isWatched = Array.isArray(opt.watchlist) ? opt.watchlist.includes(cand.id) : false;

      return {
        id: cand.id,
        name: cand.name,
        pos: cand.pos,
        team: cand.team,
        bye: cand.bye,
        adp: cand.adp,
        rookie: cand.rookie,
        posTier: cand.posTier,
        score: Math.round(cScore * 10) / 10,
        valSurplus: valSurplus,
        isUrgentNeed: criticalPositions.includes((cand.pos || '').toUpperCase()),
        isWatched: isWatched,
        byeClash: byeClash
      };
    });
  }

  // Also maintain top overall recommended targets for backward compatibility
  const recommendedTargets = [];
  if (availablePlayers.length > 0) {
    const candidates = availablePlayers.filter(p => {
      const posUpper = (p.pos || '').toUpperCase();
      return targetPositions.some(tp => (tp === 'DST' ? isDst(p) : posUpper === tp));
    });

    candidates.sort((a, b) => {
      const scoreA = a.score ?? computeFormatScore(a, scoringSettings) ?? (100 - (a.rank || 200));
      const scoreB = b.score ?? computeFormatScore(b, scoringSettings) ?? (100 - (b.rank || 200));
      return scoreB - scoreA;
    });

    for (let i = 0; i < Math.min(5, candidates.length); i++) {
      const cand = candidates[i];
      const cScore = cand.score ?? computeFormatScore(cand, scoringSettings) ?? (100 - (cand.rank || 200));
      const valSurplus = (cand.adp != null && nextUserPick != null) ? Math.round(nextUserPick - cand.adp) : 0;
      const byeClash = (typeof getByeClashStatus === 'function')
        ? getByeClashStatus(cand, myPlayers)
        : { type: 'none', samePos: [], otherPos: [] };
      const isWatched = Array.isArray(opt.watchlist) ? opt.watchlist.includes(cand.id) : false;

      recommendedTargets.push({
        id: cand.id,
        name: cand.name,
        pos: cand.pos,
        team: cand.team,
        bye: cand.bye,
        adp: cand.adp,
        rookie: cand.rookie,
        posTier: cand.posTier,
        score: Math.round(cScore * 10) / 10,
        valSurplus: valSurplus,
        isUrgentNeed: criticalPositions.includes((cand.pos || '').toUpperCase()),
        isWatched: isWatched,
        byeClash: byeClash
      });
    }
  }

  return {
    isComplete: isComplete,
    currentPick: currentPickNum,
    mySlot: mySlot,
    nextUserPick: nextUserPick,
    picksUntilUserTurn: picksUntilUserTurn,
    isOnClock: isOnClock,
    userNeeds: userNeeds,
    opponentThreats: opponentThreats,
    runDangers: runDangers,
    recommendedTargets: recommendedTargets,
    targetsByPosition: targetsByPosition,
    totalPicks: totalPicks
  };
}

/**
 * Calculates comprehensive post-draft / live league valuation and rankings:
 * - Positional value captured (QB, RB, WR, TE, K, DST)
 * - Starters vs bench score splits
 * - Letter grades (A+ to D)
 * - ADP draft value surplus (best steals & biggest reaches)
 * - Global draft superlatives
 */
function generateDraftSummaryAnalysis(options) {
  const opt = options || {};
  const teams = Math.max(2, parseInt(opt.teams, 10) || 12);
  const rounds = Math.max(1, parseInt(opt.rounds, 10) || 20);
  const mode = opt.mode === '3rr' ? '3rr' : 'snake';
  const log = Array.isArray(opt.log) ? opt.log : [];
  const keepers = Array.isArray(opt.keepers) ? opt.keepers : [];
  const tradedPicks = (opt.tradedPicks && typeof opt.tradedPicks === 'object') ? opt.tradedPicks : {};
  const teamNames = opt.teamNames || null;
  const mySlot = Math.max(1, Math.min(teams, parseInt(opt.mySlot, 10) || 1));
  const playersLookup = opt.playersLookup || null;
  const rosterSlots = Object.assign({}, DEFAULT_ROSTER_SLOTS, opt.rosterSlots);
  const scoringSettings = opt.scoringSettings || {};

  const totalPicks = teams * rounds;
  const isComplete = log.length >= totalPicks;

  // 1. Group drafted players by effective slot
  const teamDraftedMap = {};
  for (let s = 1; s <= teams; s++) {
    teamDraftedMap[s] = [];
  }

  const allDraftedPicks = [];

  for (let i = 0; i < log.length; i++) {
    const entry = log[i];
    const overall = entry.overall || (i + 1);
    const teamInfo = teamForOverall(overall, teams, mode, teamNames, mySlot, tradedPicks);
    const player = resolvePickPlayer(entry, playersLookup);
    if (player && teamDraftedMap[teamInfo.slot]) {
      const pCopy = Object.assign({}, player);
      pCopy.pickOverall = overall;
      pCopy.effectiveSlot = teamInfo.slot;
      pCopy.effectiveTeamName = teamInfo.name;
      pCopy.score = pCopy.score ?? computeFormatScore(pCopy, scoringSettings) ?? rankToScore(pCopy.adp || pCopy.rank, 250) ?? 50;
      pCopy.adpSurplus = (pCopy.adp != null) ? (pCopy.adp - overall) : 0;
      teamDraftedMap[teamInfo.slot].push(pCopy);
      allDraftedPicks.push(pCopy);
    }
  }

  // Include pre-assigned keepers as drafted players
  for (const k of keepers) {
    if (!k || k.slot == null || k.round == null) continue;
    const overall = overallPick(k.round, k.slot, teams, mode);
    if (!log.some(e => (e.overall === overall))) {
      const p = (k.playerId != null && playersLookup)
        ? ((typeof playersLookup === 'function') ? playersLookup(k.playerId) : playersLookup[k.playerId])
        : null;
      const kPlayer = {
        id: k.playerId != null ? k.playerId : null,
        name: k.customName || (p ? p.name : ('Keeper #' + (k.playerId || overall))),
        pos: (k.customPos || (p ? p.pos : 'WR') || 'WR').toUpperCase(),
        team: k.customTeam || (p ? p.team : '—') || '—',
        bye: k.customBye != null ? k.customBye : (p ? p.bye : null),
        adp: p ? p.adp : null,
        isKeeper: true,
        pickOverall: overall,
        effectiveSlot: k.slot,
        effectiveTeamName: (Array.isArray(teamNames) ? teamNames[k.slot - 1] : null) || ('Team ' + k.slot)
      };
      kPlayer.score = computeFormatScore(kPlayer, scoringSettings) ?? kPlayer.score ?? rankToScore(kPlayer.adp || kPlayer.rank, 250) ?? 50;
      kPlayer.adpSurplus = (kPlayer.adp != null) ? (kPlayer.adp - overall) : 0;
      if (teamDraftedMap[k.slot]) {
        teamDraftedMap[k.slot].push(kPlayer);
        allDraftedPicks.push(kPlayer);
      }
    }
  }

  // 2. Evaluate each team
  const teamSummaries = [];
  for (let s = 1; s <= teams; s++) {
    const tPlayers = teamDraftedMap[s] || [];
    const tName = (Array.isArray(teamNames) ? teamNames[s - 1] : null) || (s === mySlot ? 'My Team' : ('Team ' + s));
    const allocation = assignRosterSlots(tPlayers, rosterSlots);

    let startersScore = 0;
    for (const slot of allocation.starters) {
      if (slot.player) {
        startersScore += (slot.player.score || 0);
      }
    }

    let benchScore = 0;
    for (const slot of allocation.bench) {
      if (slot.player) {
        benchScore += (slot.player.score || 0);
      }
    }

    const posScores = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 };
    const isDst = p => ['DST', 'DEF', 'D/ST'].includes((p.pos || '').toUpperCase());

    for (const p of tPlayers) {
      const pos = (p.pos || '').toUpperCase();
      const pScore = p.score || 0;
      if (isDst(p)) posScores.DST += pScore;
      else if (posScores[pos] != null) posScores[pos] += pScore;
    }

    const totalScore = startersScore + (benchScore * 0.45);

    let netAdpSurplus = 0;
    let bestSteal = null;
    let biggestReach = null;

    for (const p of tPlayers) {
      if (p.adp != null) {
        const surplus = p.adpSurplus || (p.adp - p.pickOverall);
        netAdpSurplus += surplus;
        if (!bestSteal || surplus > bestSteal.surplus) {
          bestSteal = { player: p, surplus: surplus };
        }
        if (!biggestReach || surplus < biggestReach.surplus) {
          biggestReach = { player: p, surplus: surplus };
        }
      }
    }

    teamSummaries.push({
      slot: s,
      teamName: tName,
      isMe: (s === mySlot),
      totalScore: Math.round(totalScore * 10) / 10,
      startersScore: Math.round(startersScore * 10) / 10,
      benchScore: Math.round(benchScore * 10) / 10,
      qbScore: Math.round(posScores.QB * 10) / 10,
      rbScore: Math.round(posScores.RB * 10) / 10,
      wrScore: Math.round(posScores.WR * 10) / 10,
      teScore: Math.round(posScores.TE * 10) / 10,
      kScore: Math.round(posScores.K * 10) / 10,
      dstScore: Math.round(posScores.DST * 10) / 10,
      kDstScore: Math.round((posScores.K + posScores.DST) * 10) / 10,
      netAdpSurplus: Math.round(netAdpSurplus * 10) / 10,
      bestSteal: bestSteal,
      biggestReach: biggestReach,
      counts: allocation.counts,
      starters: allocation.starters,
      bench: allocation.bench,
      totalPlayers: tPlayers.length
    });
  }

  // 3. Compute league rankings for total score and position rooms
  const assignRank = (arr, key, rankProp) => {
    arr.slice().sort((a, b) => b[key] - a[key]).forEach((item, index) => {
      item[rankProp] = index + 1;
    });
  };

  assignRank(teamSummaries, 'totalScore', 'rank');
  assignRank(teamSummaries, 'qbScore', 'qbRank');
  assignRank(teamSummaries, 'rbScore', 'rbRank');
  assignRank(teamSummaries, 'wrScore', 'wrRank');
  assignRank(teamSummaries, 'teScore', 'teRank');
  assignRank(teamSummaries, 'kDstScore', 'dstRank');

  const getGrade = (rank, total) => {
    const pct = rank / total;
    if (pct <= 0.12) return 'A+';
    if (pct <= 0.25) return 'A';
    if (pct <= 0.38) return 'A-';
    if (pct <= 0.50) return 'B+';
    if (pct <= 0.65) return 'B';
    if (pct <= 0.78) return 'B-';
    if (pct <= 0.88) return 'C+';
    if (pct <= 0.95) return 'C';
    return 'D';
  };

  for (const t of teamSummaries) {
    t.grade = getGrade(t.rank, teams);
  }

  // 4. Global Superlatives
  let globalSteal = null;
  let globalReach = null;

  for (const p of allDraftedPicks) {
    if (p.adp != null) {
      const surplus = p.adpSurplus || (p.adp - p.pickOverall);
      if (!globalSteal || surplus > globalSteal.surplus) {
        globalSteal = { player: p, surplus: surplus };
      }
      if (!globalReach || surplus < globalReach.surplus) {
        globalReach = { player: p, surplus: surplus };
      }
    }
  }

  const sortedByTotal = teamSummaries.slice().sort((a, b) => a.rank - b.rank);
  const bestQbTeam = teamSummaries.slice().sort((a, b) => a.qbRank - b.qbRank)[0] || null;
  const bestRbTeam = teamSummaries.slice().sort((a, b) => a.rbRank - b.rbRank)[0] || null;
  const bestWrTeam = teamSummaries.slice().sort((a, b) => a.wrRank - b.wrRank)[0] || null;
  const bestTeTeam = teamSummaries.slice().sort((a, b) => a.teRank - b.teRank)[0] || null;

  const myTeamSummary = teamSummaries.find(t => t.isMe) || teamSummaries[0] || null;

  return {
    isComplete: isComplete,
    teamsCount: teams,
    totalPicks: totalPicks,
    draftedPicksCount: log.length,
    teams: sortedByTotal,
    myTeam: myTeamSummary,
    superlatives: {
      champion: sortedByTotal[0] || null,
      bestSteal: globalSteal,
      biggestReach: globalReach,
      bestQb: bestQbTeam,
      bestRb: bestRbTeam,
      bestWr: bestWrTeam,
      bestTe: bestTeTeam
    }
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
    reorderWatchlist: reorderWatchlist,
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
    formatPlayerStats: formatPlayerStats,
    NFL_DEFENSES: NFL_DEFENSES,
    resolveDstCanonical: resolveDstCanonical,
    parseSleeperDraft: parseSleeperDraft,
    resolveRemotePick: resolveRemotePick,
    reconcileDraftLog: reconcileDraftLog,
    generateDraftPicks: generateDraftPicks,
    applyPickTrade: applyPickTrade,
    getPicksForTeam: getPicksForTeam,
    isQueued: isQueued,
    addToQueue: addToQueue,
    removeFromQueue: removeFromQueue,
    reorderQueue: reorderQueue,
    cleanQueue: cleanQueue,
    getAvailableQueue: getAvailableQueue,
    validateKeeperAssignment: validateKeeperAssignment,
    getKeeperPicksMap: getKeeperPicksMap,
    isKeeperPick: isKeeperPick,
    getNextDraftPicks: getNextDraftPicks,
    remapKeepersOnSlotSwap: remapKeepersOnSlotSwap,
    DRAFT_SCHEMA_VERSION: DRAFT_SCHEMA_VERSION,
    serializeDraftState: serializeDraftState,
    deserializeDraftState: deserializeDraftState,
    generateDraftBoardGrid: generateDraftBoardGrid,
    analyzeLiveDraftStrategy: analyzeLiveDraftStrategy,
    generateDraftSummaryAnalysis: generateDraftSummaryAnalysis,
    computeJenksBreaks: computeJenksBreaks,
    assignTiers: assignTiers,
    getTierScarcity: getTierScarcity,
  };
}

if (typeof window !== 'undefined') {
  window.computeJenksBreaks = computeJenksBreaks;
  window.assignTiers = assignTiers;
  window.getTierScarcity = getTierScarcity;
  window.reorderWatchlist = reorderWatchlist;
}

