// 📦 Reactive State & Data Container for Fantasy Drafter
(function (global) {
  const LEGACY_STORE_KEY = 'kenDraftBoard-v1';
  const LEAGUES_MANIFEST_KEY = 'fantasy_drafter_leagues_manifest';
  const LEAGUE_STORE_PREFIX = 'fantasy_drafter_league_';
  const STORE_KEY = LEAGUES_MANIFEST_KEY;

  const DEFAULTS = {
    leagueName: "Your Draft Board",
    teams: 12,
    slot: 2,
    rounds: 25,
    mode: 'snake',
    scoring: 'half',
    qbFormat: 'sf',
    leagueType: 'redraft',
    teprem: false,
    blend: 60,
    maxKeepers: 2,
    audioChime: true,
    visualPulse: true,
    autoUnlistedSync: true,
    syncRollback: true,
    sleeperDraftId: '',
    sleeperUsername: '',
    teamNames: [
      "Team 1", "You", "Team 3", "Team 4", "Team 5", "Team 6",
      "Team 7", "Team 8", "Team 9", "Team 10", "Team 11", "Team 12"
    ],
    rosterSlots: Object.assign({}, (typeof DEFAULT_ROSTER_SLOTS !== 'undefined' ? DEFAULT_ROSTER_SLOTS : {
      qb: 1, rb: 2, wr: 2, te: 1, flex: 3, superflex: 1, k: 0, dst: 0, bench: 15
    })),
    hideTaken: false,
    hideOutIR: false
  };

  function loadManifest() {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(LEAGUES_MANIFEST_KEY);
        if (raw) {
          const m = JSON.parse(raw);
          if (m && Array.isArray(m.leagues) && m.leagues.length > 0) {
            if (!m.activeLeagueId || !m.leagues.some(l => l.id === m.activeLeagueId)) {
              m.activeLeagueId = m.leagues[0].id;
            }
            return m;
          }
        }
      }
    } catch (e) {}

    // Clean migration from legacy single-league STORE_KEY
    let legacyState = null;
    try {
      if (typeof localStorage !== 'undefined') {
        const legacyRaw = localStorage.getItem(LEGACY_STORE_KEY);
        if (legacyRaw) {
          legacyState = JSON.parse(legacyRaw);
        }
      }
    } catch (e) {}

    const defaultLeagueId = 'league_default';
    const defaultLeagueName = (legacyState && legacyState.settings && legacyState.settings.leagueName)
      ? legacyState.settings.leagueName
      : "Your Draft Board";

    const m = (typeof createDefaultLeagueManifest === 'function')
      ? createDefaultLeagueManifest(defaultLeagueName, defaultLeagueId)
      : {
          version: 1,
          activeLeagueId: defaultLeagueId,
          leagues: [{
            id: defaultLeagueId,
            name: defaultLeagueName,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }]
        };

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LEAGUES_MANIFEST_KEY, JSON.stringify(m));
        if (legacyState) {
          localStorage.setItem(LEAGUE_STORE_PREFIX + defaultLeagueId, JSON.stringify(legacyState));
        }
      }
    } catch (e) {}

    return m;
  }

  function saveManifest() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LEAGUES_MANIFEST_KEY, JSON.stringify(manifest));
      }
    } catch (e) {}
  }

  let manifest = loadManifest();

  // Raw players dataset reference
  const getPlayersList = () => {
    const raw = (typeof window !== 'undefined' && window.DRAFT_DATA && window.DRAFT_DATA.players) ? window.DRAFT_DATA.players : [];
    return raw.map((p, i) => Object.assign({ id: i }, p));
  };

  const PLAYERS = (typeof window !== 'undefined' && window.DRAFT_DATA && window.DRAFT_DATA.players)
    ? window.DRAFT_DATA.players.map((p, i) => Object.assign({ id: i }, p))
    : [];

  const byId = id => {
    if (id == null) return null;
    if (PLAYERS[id]) return PLAYERS[id];
    if (typeof window !== 'undefined' && window.DRAFT_DATA && window.DRAFT_DATA.players && window.DRAFT_DATA.players[id]) {
      return Object.assign({ id: id }, window.DRAFT_DATA.players[id]);
    }
    if (typeof state !== 'undefined' && state && state.playerSnapshots && state.playerSnapshots[id]) {
      const snap = state.playerSnapshots[id];
      return Object.assign({ id: id }, snap);
    }
    return null;
  };

  let state = load();
  let ui = {
    posFilter: 'ALL',
    search: '',
    sort: 'score',
    hideTaken: !!(state && state.settings && state.settings.hideTaken),
    hideOutIR: !!(state && state.settings && state.settings.hideOutIR)
  };
  let viewingRosterSlot = null; // null = follow on-the-clock slot

  function normalizeState(s) {
    s.settings = Object.assign({}, DEFAULTS, s.settings);
    if (!s.settings.leagueName) s.settings.leagueName = "Your Draft Board";
    const tCount = Math.max(2, Math.min(32, parseInt(s.settings.teams, 10) || 12));
    s.settings.teams = tCount;
    if (!s.settings.slot || s.settings.slot < 1 || s.settings.slot > tCount) s.settings.slot = 1;

    if (!['ppr', 'half', 'std'].includes(s.settings.scoring)) s.settings.scoring = 'half';
    if (!['sf', '1qb'].includes(s.settings.qbFormat)) s.settings.qbFormat = 'sf';
    if (!['dynasty', 'redraft'].includes(s.settings.leagueType)) s.settings.leagueType = 'dynasty';

    s.settings.maxKeepers = (s.settings.maxKeepers !== undefined && s.settings.maxKeepers !== null)
      ? Math.max(0, Math.min(10, parseInt(s.settings.maxKeepers, 10) || 0))
      : 2;

    if (s.settings.audioChime === undefined) s.settings.audioChime = true;
    if (s.settings.visualPulse === undefined) s.settings.visualPulse = true;
    if (s.settings.autoUnlistedSync === undefined) s.settings.autoUnlistedSync = true;
    if (s.settings.syncRollback === undefined) s.settings.syncRollback = true;
    if (!s.settings.sleeperDraftId) s.settings.sleeperDraftId = '';
    if (!s.settings.sleeperUsername) s.settings.sleeperUsername = '';
    s.settings.hideTaken = !!s.settings.hideTaken;
    s.settings.hideOutIR = !!s.settings.hideOutIR;

    if (!Array.isArray(s.settings.teamNames)) s.settings.teamNames = [];
    const names = [];
    for (let i = 1; i <= tCount; i++) {
      const existing = s.settings.teamNames[i - 1];
      if (existing && String(existing).trim()) {
        names.push(String(existing).trim());
      } else {
        names.push(i === s.settings.slot ? 'My Team' : ('Team ' + i));
      }
    }
    s.settings.teamNames = names;

    const baseSlots = (typeof DEFAULT_ROSTER_SLOTS !== 'undefined') ? DEFAULT_ROSTER_SLOTS : {
      qb: 1, rb: 2, wr: 2, te: 1, flex: 3, superflex: 1, k: 0, dst: 0, bench: 15
    };
    s.settings.rosterSlots = Object.assign({}, baseSlots, s.settings.rosterSlots);
    for (const k of Object.keys(baseSlots)) {
      s.settings.rosterSlots[k] = Math.max(0, parseInt(s.settings.rosterSlots[k], 10) || 0);
    }
    const startersCount = (s.settings.rosterSlots.qb || 0) + (s.settings.rosterSlots.rb || 0) +
      (s.settings.rosterSlots.wr || 0) + (s.settings.rosterSlots.te || 0) +
      (s.settings.rosterSlots.flex || 0) + (s.settings.rosterSlots.superflex || 0) +
      (s.settings.rosterSlots.k || 0) + (s.settings.rosterSlots.dst || 0);
    const totalRounds = startersCount + (s.settings.rosterSlots.bench || 0);
    if (totalRounds > 0) {
      s.settings.rounds = totalRounds;
    }

    s.playerSnapshots = (s.playerSnapshots && typeof s.playerSnapshots === 'object') ? s.playerSnapshots : {};

    const rawKeepers = Array.isArray(s.keepers) ? s.keepers : (Array.isArray(s.settings.keepers) ? s.settings.keepers : []);
    const validKeepers = [];
    for (const k of rawKeepers) {
      if (!k || typeof k !== 'object') continue;
      const pId = k.playerId != null ? parseInt(k.playerId, 10) : null;
      let pName = k.playerName ? String(k.playerName).trim() : null;
      let pPos = k.playerPos ? String(k.playerPos).trim().toUpperCase() : null;
      let pTeam = k.playerTeam ? String(k.playerTeam).trim().toUpperCase() : null;
      let pBye = k.playerBye != null ? parseInt(k.playerBye, 10) : null;
      if (pId != null && !pName && PLAYERS[pId]) {
        pName = PLAYERS[pId].name || null;
        pPos = PLAYERS[pId].pos || null;
        pTeam = PLAYERS[pId].team || null;
        pBye = PLAYERS[pId].bye != null ? PLAYERS[pId].bye : null;
      }
      validKeepers.push({
        id: k.id || ('k_' + Math.random().toString(36).substr(2, 9)),
        slot: Math.max(1, Math.min(tCount, parseInt(k.slot, 10) || 1)),
        round: Math.max(1, Math.min(s.settings.rounds || 50, parseInt(k.round, 10) || 1)),
        playerId: pId,
        playerName: pName,
        playerPos: pPos,
        playerTeam: pTeam,
        playerBye: pBye,
        customName: k.customName ? String(k.customName).trim() : null,
        customPos: k.customPos ? String(k.customPos).trim().toUpperCase() : null,
        customTeam: k.customTeam ? String(k.customTeam).trim().toUpperCase() : null,
        customBye: k.customBye != null ? parseInt(k.customBye, 10) : null,
        wasDroppedFromPool: !!k.wasDroppedFromPool
      });
      if (pId != null && pName) {
        s.playerSnapshots[pId] = { name: pName, pos: pPos, team: pTeam, bye: pBye };
      }
    }
    s.keepers = validKeepers;

    if (!Array.isArray(s.log)) {
      s.log = [];
    } else {
      for (const entry of s.log) {
        if (!entry || typeof entry !== 'object') continue;
        if (entry.playerId != null && !entry.name && PLAYERS[entry.playerId]) {
          entry.name = PLAYERS[entry.playerId].name;
          entry.pos = PLAYERS[entry.playerId].pos;
          entry.team = PLAYERS[entry.playerId].team;
        }
        if (entry.playerId != null && entry.name) {
          s.playerSnapshots[entry.playerId] = {
            name: entry.name,
            pos: entry.pos,
            team: entry.team,
            bye: entry.bye != null ? entry.bye : (PLAYERS[entry.playerId] ? PLAYERS[entry.playerId].bye : null)
          };
        }
      }
    }

    if (!Array.isArray(s.watchlist)) {
      s.watchlist = [];
    } else {
      for (const wId of s.watchlist) {
        if (wId != null && PLAYERS[wId] && !s.playerSnapshots[wId]) {
          s.playerSnapshots[wId] = {
            name: PLAYERS[wId].name,
            pos: PLAYERS[wId].pos,
            team: PLAYERS[wId].team,
            bye: PLAYERS[wId].bye
          };
        }
      }
    }

    if (!Array.isArray(s.queue)) {
      s.queue = [];
    } else {
      for (const qId of s.queue) {
        if (qId != null && PLAYERS[qId] && !s.playerSnapshots[qId]) {
          s.playerSnapshots[qId] = {
            name: PLAYERS[qId].name,
            pos: PLAYERS[qId].pos,
            team: PLAYERS[qId].team,
            bye: PLAYERS[qId].bye
          };
        }
      }
    }

    if (!s.tradedPicks || typeof s.tradedPicks !== 'object') s.tradedPicks = {};
    return s;
  }

  function applyLoadedState(targetState) {
    for (const k of Object.keys(state)) {
      delete state[k];
    }
    Object.assign(state, targetState);
    normalizeState(state);
    ui.hideTaken = !!(state && state.settings && state.settings.hideTaken);
    ui.hideOutIR = !!(state && state.settings && state.settings.hideOutIR);
    return state;
  }

  function load(leagueId) {
    const targetId = leagueId || (manifest && manifest.activeLeagueId) || 'league_default';
    let s = null;
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(LEAGUE_STORE_PREFIX + targetId);
        if (raw) {
          s = JSON.parse(raw);
        }
      }
    } catch (e) { /* fallback on error */ }
    const norm = normalizeState(s || { settings: Object.assign({}, DEFAULTS), keepers: [], log: [], watchlist: [], queue: [], tradedPicks: {} });
    const reconcileFn = (typeof reconcileStateWithNewPlayerPool === 'function')
      ? reconcileStateWithNewPlayerPool
      : (typeof window !== 'undefined' && typeof window.reconcileStateWithNewPlayerPool === 'function' ? window.reconcileStateWithNewPlayerPool : null);
    if (typeof reconcileFn === 'function' && Array.isArray(PLAYERS) && PLAYERS.length > 0) {
      const res = reconcileFn(norm, PLAYERS);
      if (res && (res.keepersReconciled > 0 || res.keepersDropped > 0 || res.logReconciled > 0 || res.watchlistReconciled > 0 || res.queueReconciled > 0)) {
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(LEAGUE_STORE_PREFIX + targetId, JSON.stringify(norm));
          }
        } catch (e) {}
      }
    }
    return norm;
  }

  function save() {
    normalizeState(state);
    const activeId = (manifest && manifest.activeLeagueId) || 'league_default';
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LEAGUE_STORE_PREFIX + activeId, JSON.stringify(state));
      }
    } catch (e) {}

    if (manifest && Array.isArray(manifest.leagues)) {
      const cur = manifest.leagues.find(l => l.id === activeId);
      if (cur) {
        const curName = state.settings.leagueName || cur.name || "Your Draft Board";
        if (cur.name !== curName || !cur.updatedAt) {
          cur.name = curName;
          cur.updatedAt = new Date().toISOString();
          saveManifest();
        }
      }
    }
  }

  function getTeamName(slot) {
    const s = state.settings;
    const name = s.teamNames && s.teamNames[slot - 1];
    return (name && name.trim()) ? name.trim() : (slot === s.slot ? 'My Team' : ('Team ' + slot));
  }

  function takenMap() {
    const m = new Map();
    // 1. Mark pre-configured keepers as taken from Pick #1
    if (Array.isArray(state.keepers)) {
      for (const k of state.keepers) {
        if (k && k.playerId != null) {
          m.set(k.playerId, (k.slot === state.settings.slot) ? 'me' : 'other');
        }
      }
    }
    // 2. Mark drafted players from log
    for (const entry of state.log) {
      if (entry.playerId != null) {
        const tInfo = teamForOverall(entry.overall, state.settings.teams, state.settings.mode, state.settings.teamNames, state.settings.slot, state.tradedPicks);
        m.set(entry.playerId, (entry.mine || tInfo.isMe) ? 'me' : 'other');
      }
    }
    return m;
  }

  function currentPick() {
    return state.log.length + 1;
  }

  function sendServerPick(data) {
    if (typeof reportServerPick === 'function') {
      reportServerPick(data);
    } else if (typeof window !== 'undefined' && typeof window.reportServerPick === 'function') {
      window.reportServerPick(data);
    }
  }

  function sendServerEvent(msg, type) {
    if (typeof reportServerEvent === 'function') {
      reportServerEvent(msg, type);
    } else if (typeof window !== 'undefined' && typeof window.reportServerEvent === 'function') {
      window.reportServerEvent(msg, type);
    }
  }

  function autoAdvanceKeepers() {
    let advanced = false;
    const totalPicks = state.settings.teams * state.settings.rounds;
    while (currentPick() <= totalPicks) {
      const pick = currentPick();
      const keeper = (typeof isKeeperPick === 'function')
        ? isKeeperPick(pick, state.keepers, state.settings.teams, state.settings.rounds, state.settings.mode, state.tradedPicks)
        : null;
      if (!keeper) break;

      const who = teamForOverall(pick, state.settings.teams, state.settings.mode, state.settings.teamNames, state.settings.slot, state.tradedPicks);
      const p = (keeper.playerId != null) ? (byId(keeper.playerId) || {}) : {};
      const posVal = keeper.customPos || keeper.playerPos || p.pos || 'WR';
      const nameVal = keeper.customName || keeper.playerName || p.name || ('Keeper ' + posVal);
      const teamVal = keeper.customTeam || keeper.playerTeam || p.team || '';
      const byeVal = keeper.customBye != null ? keeper.customBye : (keeper.playerBye != null ? keeper.playerBye : (p.bye || null));

      state.log.push({
        overall: pick,
        playerId: keeper.playerId != null ? keeper.playerId : null,
        name: keeper.playerId != null ? nameVal : null,
        pos: keeper.playerId != null ? posVal : null,
        team: keeper.playerId != null ? teamVal : null,
        customName: keeper.playerId == null ? nameVal : null,
        customPos: posVal,
        customTeam: teamVal || null,
        customBye: byeVal,
        mine: who.isMe,
        isKeeper: true
      });

      if (keeper.playerId != null) {
        state.watchlist = cleanWatchlist(state.watchlist, [keeper.playerId]);
        if (typeof cleanQueue === 'function') {
          state.queue = cleanQueue(state.queue, [keeper.playerId]);
        }
      }

      sendServerPick({
        source: 'keeper',
        overall: pick,
        name: nameVal + ' [Keeper]',
        pos: posVal,
        team: teamVal,
        by: who.name + (who.isMe ? ' (You)' : '')
      });

      advanced = true;
    }
    return advanced;
  }

  function addKeeper(candidate) {
    if (!candidate) return { ok: false, error: 'Empty keeper payload' };
    if (typeof validateKeeperAssignment === 'function') {
      const validation = validateKeeperAssignment(
        candidate,
        state.keepers,
        state.settings.maxKeepers,
        state.settings.teams,
        state.settings.rounds,
        state.settings.mode,
        state.tradedPicks
      );
      if (!validation.valid) {
        return { ok: false, error: validation.error };
      }
    }

    const p = candidate.playerId != null ? byId(candidate.playerId) : null;
    const newKeeper = {
      id: candidate.id || ('k_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)),
      slot: parseInt(candidate.slot, 10) || 1,
      round: parseInt(candidate.round, 10) || 1,
      playerId: candidate.playerId != null ? parseInt(candidate.playerId, 10) : null,
      playerName: candidate.playerName || (p ? p.name : null),
      playerPos: candidate.playerPos || (p ? p.pos : null),
      playerTeam: candidate.playerTeam || (p ? p.team : null),
      playerBye: candidate.playerBye != null ? parseInt(candidate.playerBye, 10) : (p && p.bye != null ? p.bye : null),
      customName: candidate.customName ? String(candidate.customName).trim() : null,
      customPos: candidate.customPos ? String(candidate.customPos).trim().toUpperCase() : null,
      customTeam: candidate.customTeam ? String(candidate.customTeam).trim().toUpperCase() : null,
      customBye: candidate.customBye != null ? parseInt(candidate.customBye, 10) : null,
      wasDroppedFromPool: !!candidate.wasDroppedFromPool
    };

    if (newKeeper.playerId != null && newKeeper.playerName) {
      state.playerSnapshots = state.playerSnapshots || {};
      state.playerSnapshots[newKeeper.playerId] = {
        name: newKeeper.playerName,
        pos: newKeeper.playerPos,
        team: newKeeper.playerTeam,
        bye: newKeeper.playerBye
      };
    }

    const existingIndex = candidate.id ? state.keepers.findIndex(k => k && k.id === candidate.id) : -1;
    if (existingIndex >= 0) {
      state.keepers[existingIndex] = newKeeper;
    } else {
      state.keepers.push(newKeeper);
    }

    if (newKeeper.playerId != null) {
      state.watchlist = cleanWatchlist(state.watchlist, [newKeeper.playerId]);
      if (typeof cleanQueue === 'function') {
        state.queue = cleanQueue(state.queue, [newKeeper.playerId]);
      }
    }

    autoAdvanceKeepers();
    save();
    if (typeof render === 'function') render();
    return { ok: true, keeper: newKeeper };
  }

  function removeKeeper(keeperId) {
    if (!keeperId) return;
    state.keepers = state.keepers.filter(k => k && k.id !== keeperId);
    save();
    if (typeof render === 'function') render();
  }

  function updateMaxKeepers(val) {
    state.settings.maxKeepers = Math.max(0, Math.min(10, parseInt(val, 10) || 0));
    save();
  }

  function draftPlayer(id, mine) {
    const pick = currentPick();
    const p = byId(id) || {};
    state.log.push({
      overall: pick,
      playerId: id,
      name: p.name || null,
      pos: p.pos || null,
      team: p.team || null,
      mine: Boolean(mine)
    });
    if (id != null && p.name) {
      state.playerSnapshots = state.playerSnapshots || {};
      state.playerSnapshots[id] = { name: p.name, pos: p.pos, team: p.team, bye: p.bye };
    }
    state.watchlist = cleanWatchlist(state.watchlist, [id]);
    if (typeof cleanQueue === 'function') {
      state.queue = cleanQueue(state.queue, [id]);
    }
    autoAdvanceKeepers();
    save();
    if (typeof render === 'function') render();

    const who = teamForOverall(pick, state.settings.teams, state.settings.mode, state.settings.teamNames, state.settings.slot, state.tradedPicks);
    sendServerPick({
      source: 'manual',
      overall: pick,
      name: p.name || 'Player #' + id,
      pos: p.pos || '',
      team: p.team || '',
      by: who.name + (who.isMe ? ' (You)' : '')
    });
  }

  function rerenderBoardModalIfOpen() {
    if (typeof document !== 'undefined') {
      const modal = document.getElementById('modalbox');
      if (modal && modal.classList.contains('modal-board')) {
        const fn = (typeof renderDraftBoardModalView === 'function')
          ? renderDraftBoardModalView
          : (typeof global !== 'undefined' && global.renderDraftBoardModalView);
        if (typeof fn === 'function') fn();
      }
    }
  }

  function toggleWatch(id, e) {
    if (e) {
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
      if (typeof e.preventDefault === 'function') e.preventDefault();
    }
    if (id != null) {
      const p = byId(id);
      if (p && p.name) {
        state.playerSnapshots = state.playerSnapshots || {};
        state.playerSnapshots[id] = { name: p.name, pos: p.pos, team: p.team, bye: p.bye };
      }
    }
    state.watchlist = toggleWatchlist(state.watchlist, id);
    save();
    if (typeof renderTabs === 'function') renderTabs();
    if (typeof renderPool === 'function') renderPool();
    if (typeof renderWatchlistPanel === 'function') renderWatchlistPanel();
    rerenderBoardModalIfOpen();
  }

  function moveWatch(id, delta, e) {
    if (e) {
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
      if (typeof e.preventDefault === 'function') e.preventDefault();
    }
    if (!Array.isArray(state.watchlist)) return;
    const fromIdx = state.watchlist.indexOf(id);
    if (fromIdx < 0) return;
    const toIdx = fromIdx + delta;
    if (toIdx < 0 || toIdx >= state.watchlist.length) return;
    const reorderFn = (typeof reorderWatchlist === 'function') ? reorderWatchlist : (typeof window !== 'undefined' ? window.reorderWatchlist : null);
    if (typeof reorderFn === 'function') {
      state.watchlist = reorderFn(state.watchlist, fromIdx, toIdx);
    } else {
      const list = state.watchlist.slice();
      const [item] = list.splice(fromIdx, 1);
      list.splice(toIdx, 0, item);
      state.watchlist = list;
    }
    save();
    if (typeof renderWatchlistPanel === 'function') renderWatchlistPanel();
    if (typeof renderPool === 'function') renderPool();
    rerenderBoardModalIfOpen();
  }

  function reorderWatch(fromPlayerId, toPlayerId) {
    if (!Array.isArray(state.watchlist)) return;
    const fromIdx = state.watchlist.indexOf(fromPlayerId);
    const toIdx = state.watchlist.indexOf(toPlayerId);
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
    const reorderFn = (typeof reorderWatchlist === 'function') ? reorderWatchlist : (typeof window !== 'undefined' ? window.reorderWatchlist : null);
    if (typeof reorderFn === 'function') {
      state.watchlist = reorderFn(state.watchlist, fromIdx, toIdx);
    } else {
      const list = state.watchlist.slice();
      const [item] = list.splice(fromIdx, 1);
      list.splice(toIdx, 0, item);
      state.watchlist = list;
    }
    save();
    if (typeof renderWatchlistPanel === 'function') renderWatchlistPanel();
    if (typeof renderPool === 'function') renderPool();
    rerenderBoardModalIfOpen();
  }

  function draftUnlistedPlayer(pos, name, team, bye) {
    const pick = currentPick();
    const who = teamForOverall(pick, state.settings.teams, state.settings.mode, state.settings.teamNames, state.settings.slot, state.tradedPicks);
    const posVal = (pos || 'WR').toUpperCase();
    const nameVal = (name && name.trim()) ? name.trim() : ('Unlisted ' + (posVal !== 'OTHER' ? posVal : 'Player'));
    state.log.push({
      overall: pick,
      playerId: null,
      customName: nameVal,
      customPos: posVal,
      customTeam: (team && team.trim()) ? team.trim().toUpperCase() : null,
      customBye: (bye && bye >= 1 && bye <= 18) ? bye : null,
      mine: who.isMe
    });
    if (typeof closeModal === 'function') closeModal();
    autoAdvanceKeepers();
    save();
    if (typeof render === 'function') render();

    sendServerPick({
      source: 'manual',
      overall: pick,
      name: nameVal,
      pos: posVal,
      team: (team && team.trim()) ? team.trim().toUpperCase() : '',
      by: who.name + (who.isMe ? ' (You)' : '')
    });
  }

  function undo() {
    if (state.log.length === 0) return;
    const removed = state.log.pop();
    save();
    if (typeof render === 'function') render();
    sendServerEvent('↩️ Undid pick #' + (removed.overall || (state.log.length + 1)) + ' (Now at Pick #' + (state.log.length + 1) + ')', 'info');
  }

  function jumpTo(pick) {
    pick = Math.max(1, Math.floor(pick));
    while (state.log.length > pick - 1) state.log.pop();
    while (state.log.length < pick - 1) {
      const nextPickNum = state.log.length + 1;
      const keeper = (typeof isKeeperPick === 'function')
        ? isKeeperPick(nextPickNum, state.keepers, state.settings.teams, state.settings.rounds, state.settings.mode, state.tradedPicks)
        : null;
      if (keeper) {
        const who = teamForOverall(nextPickNum, state.settings.teams, state.settings.mode, state.settings.teamNames, state.settings.slot, state.tradedPicks);
        const p = (keeper.playerId != null) ? (byId(keeper.playerId) || {}) : {};
        const posVal = keeper.customPos || keeper.playerPos || p.pos || 'WR';
        const nameVal = keeper.customName || keeper.playerName || p.name || ('Keeper ' + posVal);
        const teamVal = keeper.customTeam || keeper.playerTeam || p.team || null;
        const byeVal = keeper.customBye != null ? keeper.customBye : (keeper.playerBye != null ? keeper.playerBye : (p.bye || null));
        state.log.push({
          overall: nextPickNum,
          playerId: keeper.playerId != null ? keeper.playerId : null,
          name: keeper.playerId != null ? nameVal : null,
          pos: keeper.playerId != null ? posVal : null,
          team: keeper.playerId != null ? teamVal : null,
          customName: keeper.playerId == null ? (keeper.customName || 'Keeper') : null,
          customPos: posVal,
          customTeam: teamVal,
          customBye: byeVal,
          mine: who.isMe,
          isKeeper: true
        });
      } else {
        state.log.push({ overall: nextPickNum, playerId: null, customName: 'Skipped pick', customPos: 'OTHER', mine: false });
      }
    }
    autoAdvanceKeepers();
    const taken = takenMap();
    state.watchlist = cleanWatchlist(state.watchlist, taken);
    if (typeof cleanQueue === 'function') {
      state.queue = cleanQueue(state.queue, taken);
    }
    save();
    if (typeof render === 'function') render();
  }

  function resetDraft(wipeKeepers) {
    if (wipeKeepers === true) {
      if (!confirm('Clear all draft picks AND all keeper assignments?')) return;
      state.log = [];
      state.keepers = [];
    } else {
      if (state.keepers && state.keepers.length > 0) {
        const choice = confirm('Clear the draft board back to Pick #1?\n\n• Click OK to reset draft picks (configured Keepers will be preserved)\n• Click Cancel to abort reset');
        if (!choice) return;
      } else {
        if (!confirm('Clear the whole draft (all picks and rosters)?')) return;
      }
      state.log = [];
    }
    autoAdvanceKeepers();
    save();
    if (typeof render === 'function') render();
    sendServerEvent('🔄 Draft board reset to Pick #1', 'info');
    if (typeof reportServerReset === 'function') {
      reportServerReset();
    } else if (typeof window !== 'undefined' && typeof window.reportServerReset === 'function') {
      window.reportServerReset();
    }
  }

  function selectRosterSlot(slot) {
    global.viewingRosterSlot = (slot === 'clock' || slot == null || slot === '') ? null : parseInt(slot, 10);
    if (typeof renderInspectRoster === 'function') renderInspectRoster();
  }

  // --- Multi-League Management APIs ---
  function getLeagueList() {
    if (!manifest || !Array.isArray(manifest.leagues)) return [];
    return manifest.leagues.map(l => {
      let draftCount = 0;
      let teams = 12;
      try {
        if (typeof localStorage !== 'undefined') {
          const raw = localStorage.getItem(LEAGUE_STORE_PREFIX + l.id);
          if (raw) {
            const parsed = JSON.parse(raw);
            draftCount = Array.isArray(parsed.log) ? parsed.log.length : 0;
            teams = parsed.settings?.teams || 12;
          }
        }
      } catch (e) {}
      return {
        id: l.id,
        name: l.name,
        isActive: l.id === manifest.activeLeagueId,
        draftCount: draftCount,
        teams: teams,
        createdAt: l.createdAt,
        updatedAt: l.updatedAt
      };
    });
  }

  function getActiveLeagueId() {
    return (manifest && manifest.activeLeagueId) || 'league_default';
  }

  function switchLeague(leagueId) {
    if (!leagueId) return { ok: false, error: 'Invalid league ID' };
    if (!manifest || !Array.isArray(manifest.leagues)) return { ok: false, error: 'No leagues available' };
    const target = manifest.leagues.find(l => l.id === leagueId);
    if (!target) return { ok: false, error: 'League not found: ' + leagueId };

    // Save active state before switching
    save();

    manifest.activeLeagueId = leagueId;
    saveManifest();

    const loaded = load(leagueId);
    applyLoadedState(loaded);
    autoAdvanceKeepers();
    save();

    if (typeof global.switchSyncContext === 'function') {
      global.switchSyncContext();
    }
    if (typeof global.bindHeaderControls === 'function') {
      global.bindHeaderControls();
    }
    if (typeof document !== 'undefined') {
      const titleEl = document.getElementById('leaguetitle');
      if (titleEl) {
        titleEl.textContent = '🏈 ' + (state.settings.leagueName || "Your Draft Board");
      }
      document.title = (state.settings.leagueName || "Fantasy Draft Board") + ' — Draft Board';
    }
    if (typeof global.render === 'function') {
      global.render();
    }
    sendServerEvent('🔄 Switched to league: ' + (state.settings.leagueName || target.name), 'info');
    return { ok: true, activeId: leagueId, name: state.settings.leagueName || target.name };
  }

  function createNewLeague(leagueName) {
    save();
    const newId = 'league_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const defaultName = 'League ' + (manifest.leagues.length + 1);
    const finalName = (leagueName && String(leagueName).trim()) ? String(leagueName).trim() : defaultName;

    const freshSettings = Object.assign({}, DEFAULTS, { leagueName: finalName, sleeperDraftId: '' });
    const freshState = normalizeState({
      settings: freshSettings,
      keepers: [],
      log: [],
      watchlist: [],
      queue: [],
      tradedPicks: {}
    });

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LEAGUE_STORE_PREFIX + newId, JSON.stringify(freshState));
      }
    } catch (e) {}

    manifest.leagues.push({
      id: newId,
      name: finalName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    manifest.activeLeagueId = newId;
    saveManifest();

    applyLoadedState(freshState);
    save();

    if (typeof global.switchSyncContext === 'function') global.switchSyncContext();
    if (typeof global.bindHeaderControls === 'function') global.bindHeaderControls();
    if (typeof document !== 'undefined') {
      const titleEl = document.getElementById('leaguetitle');
      if (titleEl) titleEl.textContent = '🏈 ' + finalName;
      document.title = finalName + ' — Draft Board';
    }
    if (typeof global.render === 'function') global.render();
    sendServerEvent('➕ Created new league: ' + finalName, 'info');
    return { ok: true, id: newId, name: finalName };
  }

  function duplicateCurrentLeague(newLeagueName) {
    save();
    const newId = 'league_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const defaultName = (state.settings.leagueName || 'League') + ' (Copy)';
    const finalName = (newLeagueName && String(newLeagueName).trim()) ? String(newLeagueName).trim() : defaultName;

    let clonedPayload = null;
    const dupFn = (typeof duplicateLeagueSettings === 'function')
      ? duplicateLeagueSettings
      : (typeof global.duplicateLeagueSettings === 'function' ? global.duplicateLeagueSettings : null);

    if (dupFn) {
      clonedPayload = dupFn(state, finalName, newId);
    } else {
      const clonedSettings = JSON.parse(JSON.stringify(state.settings));
      clonedSettings.leagueName = finalName;
      clonedSettings.sleeperDraftId = '';
      clonedPayload = {
        id: newId,
        name: finalName,
        settings: clonedSettings,
        keepers: [],
        log: [],
        watchlist: Array.isArray(state.watchlist) ? state.watchlist.slice() : [],
        queue: [],
        tradedPicks: {},
        updatedAt: new Date().toISOString()
      };
    }

    const clonedState = normalizeState({
      settings: clonedPayload.settings,
      keepers: clonedPayload.keepers,
      log: clonedPayload.log,
      watchlist: clonedPayload.watchlist,
      queue: clonedPayload.queue,
      tradedPicks: clonedPayload.tradedPicks
    });

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LEAGUE_STORE_PREFIX + newId, JSON.stringify(clonedState));
      }
    } catch (e) {}

    manifest.leagues.push({
      id: newId,
      name: finalName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    manifest.activeLeagueId = newId;
    saveManifest();

    applyLoadedState(clonedState);
    save();

    if (typeof global.switchSyncContext === 'function') global.switchSyncContext();
    if (typeof global.bindHeaderControls === 'function') global.bindHeaderControls();
    if (typeof document !== 'undefined') {
      const titleEl = document.getElementById('leaguetitle');
      if (titleEl) titleEl.textContent = '🏈 ' + finalName;
      document.title = finalName + ' — Draft Board';
    }
    if (typeof global.render === 'function') global.render();
    sendServerEvent('📋 Duplicated league settings to: ' + finalName, 'info');
    return { ok: true, id: newId, name: finalName };
  }

  function deleteLeague(leagueId) {
    if (!manifest || !Array.isArray(manifest.leagues)) return { ok: false, error: 'No leagues found' };
    if (manifest.leagues.length <= 1) {
      return { ok: false, error: 'Cannot delete the only remaining league. At least one league must exist.' };
    }
    const idx = manifest.leagues.findIndex(l => l.id === leagueId);
    if (idx < 0) return { ok: false, error: 'League not found' };

    const deletedName = manifest.leagues[idx].name;
    const isCurrent = (manifest.activeLeagueId === leagueId);
    manifest.leagues.splice(idx, 1);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(LEAGUE_STORE_PREFIX + leagueId);
      }
    } catch (e) {}

    if (isCurrent) {
      const nextLeague = manifest.leagues[0];
      manifest.activeLeagueId = nextLeague.id;
      saveManifest();
      const loaded = load(nextLeague.id);
      applyLoadedState(loaded);
      autoAdvanceKeepers();
      save();

      if (typeof global.switchSyncContext === 'function') global.switchSyncContext();
      if (typeof global.bindHeaderControls === 'function') global.bindHeaderControls();
      if (typeof document !== 'undefined') {
        const titleEl = document.getElementById('leaguetitle');
        if (titleEl) titleEl.textContent = '🏈 ' + (state.settings.leagueName || "Your Draft Board");
        document.title = (state.settings.leagueName || "Fantasy Draft Board") + ' — Draft Board';
      }
      if (typeof global.render === 'function') global.render();
    } else {
      saveManifest();
    }
    sendServerEvent('🗑️ Deleted league: ' + deletedName, 'info');
    return { ok: true };
  }

  function exportLeagueBackup(mode) {
    save();
    let dataToExport = null;
    let filename = '';
    const dateStr = new Date().toISOString().slice(0, 10);

    if (mode === 'all') {
      const leaguesMap = {};
      for (const l of manifest.leagues) {
        try {
          if (typeof localStorage !== 'undefined') {
            const raw = localStorage.getItem(LEAGUE_STORE_PREFIX + l.id);
            if (raw) leaguesMap[l.id] = JSON.parse(raw);
          }
        } catch (e) {}
      }
      const serFn = (typeof serializeLeagueBackup === 'function')
        ? serializeLeagueBackup
        : (typeof global.serializeLeagueBackup === 'function' ? global.serializeLeagueBackup : null);

      if (serFn) {
        dataToExport = serFn(manifest, leaguesMap);
      } else {
        dataToExport = {
          version: 1,
          backupType: 'fantasy_drafter_multi_league_backup',
          exportedAt: new Date().toISOString(),
          manifest: manifest,
          leagues: leaguesMap
        };
      }
      filename = `fantasy-drafter-all-leagues-${dateStr}.json`;
    } else {
      // Export active league
      const safeName = (state.settings.leagueName || 'league').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const serDraftFn = (typeof serializeDraftState === 'function')
        ? serializeDraftState
        : (typeof global.serializeDraftState === 'function' ? global.serializeDraftState : null);

      if (serDraftFn) {
        dataToExport = serDraftFn(state);
      } else {
        dataToExport = {
          version: 2,
          exportedAt: new Date().toISOString(),
          settings: state.settings,
          keepers: state.keepers,
          draftLog: state.log,
          watchlist: state.watchlist,
          queue: state.queue,
          tradedPicks: state.tradedPicks
        };
      }
      filename = `draft-board-${safeName}-${dateStr}.json`;
    }

    if (typeof document !== 'undefined') {
      const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 200);
    }
    return { ok: true, filename: filename, data: dataToExport };
  }

  function importLeagueBackup(input) {
    if (!input) return { ok: false, error: 'Empty import payload' };
    let parsed = null;
    const desFn = (typeof deserializeLeagueBackup === 'function')
      ? deserializeLeagueBackup
      : (typeof global.deserializeLeagueBackup === 'function' ? global.deserializeLeagueBackup : null);

    if (desFn) {
      parsed = desFn(input);
    } else {
      try {
        const obj = (typeof input === 'string') ? JSON.parse(input) : input;
        if (obj && obj.backupType === 'fantasy_drafter_multi_league_backup') {
          parsed = { ok: true, type: 'multi', manifest: obj.manifest, leagues: obj.leagues };
        } else if (obj) {
          parsed = { ok: true, type: 'single', league: { id: 'league_import_' + Date.now(), name: obj.settings?.leagueName || 'Imported League', state: obj } };
        }
      } catch (err) {
        return { ok: false, error: 'Invalid JSON format: ' + err.message };
      }
    }

    if (!parsed || !parsed.ok) {
      return { ok: false, error: parsed?.error || 'Unrecognized backup format' };
    }

    if (parsed.type === 'multi') {
      const incomingManifest = parsed.manifest;
      const incomingLeagues = parsed.leagues;
      if (!incomingManifest || !Array.isArray(incomingManifest.leagues)) {
        return { ok: false, error: 'Invalid manifest in backup file' };
      }

      for (const item of incomingManifest.leagues) {
        const statePayload = incomingLeagues[item.id];
        if (statePayload) {
          try {
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem(LEAGUE_STORE_PREFIX + item.id, JSON.stringify(statePayload));
            }
          } catch (e) {}
        }
        if (!manifest.leagues.some(existing => existing.id === item.id)) {
          manifest.leagues.push(item);
        } else {
          const idx = manifest.leagues.findIndex(existing => existing.id === item.id);
          manifest.leagues[idx] = item;
        }
      }
      if (incomingManifest.activeLeagueId && manifest.leagues.some(l => l.id === incomingManifest.activeLeagueId)) {
        manifest.activeLeagueId = incomingManifest.activeLeagueId;
      }
      saveManifest();
      switchLeague(manifest.activeLeagueId);
      return { ok: true, type: 'multi', count: incomingManifest.leagues.length };
    } else if (parsed.type === 'single') {
      const l = parsed.league;
      const newId = 'league_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      const name = l.name || 'Imported League';
      const normalizedState = normalizeState(l.state || {});
      normalizedState.settings.leagueName = name;

      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(LEAGUE_STORE_PREFIX + newId, JSON.stringify(normalizedState));
        }
      } catch (e) {}

      manifest.leagues.push({
        id: newId,
        name: name,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      manifest.activeLeagueId = newId;
      saveManifest();

      applyLoadedState(normalizedState);
      save();

      if (typeof global.switchSyncContext === 'function') global.switchSyncContext();
      if (typeof global.bindHeaderControls === 'function') global.bindHeaderControls();
      if (typeof document !== 'undefined') {
        const titleEl = document.getElementById('leaguetitle');
        if (titleEl) titleEl.textContent = '🏈 ' + name;
        document.title = name + ' — Draft Board';
      }
      if (typeof global.render === 'function') global.render();
      return { ok: true, type: 'single', id: newId, name: name };
    }

    return { ok: false, error: 'Unknown import format' };
  }

  function reconcileWithPlayerPool(newPlayers) {
    const list = Array.isArray(newPlayers) ? newPlayers : PLAYERS;
    const reconcileFn = (typeof reconcileStateWithNewPlayerPool === 'function')
      ? reconcileStateWithNewPlayerPool
      : (typeof window !== 'undefined' && typeof window.reconcileStateWithNewPlayerPool === 'function' ? window.reconcileStateWithNewPlayerPool : null);
    if (typeof reconcileFn === 'function' && Array.isArray(list) && list.length > 0) {
      const res = reconcileFn(state, list);
      save();
      if (typeof render === 'function') render();
      return res;
    }
    return null;
  }

  // Export properties to global scope
  global.STORE_KEY = STORE_KEY;
  global.LEGACY_STORE_KEY = LEGACY_STORE_KEY;
  global.LEAGUES_MANIFEST_KEY = LEAGUES_MANIFEST_KEY;
  global.LEAGUE_STORE_PREFIX = LEAGUE_STORE_PREFIX;
  global.DEFAULTS = DEFAULTS;
  global.state = state;
  global.ui = ui;
  global.viewingRosterSlot = viewingRosterSlot;
  global.normalizeState = normalizeState;
  global.load = load;
  global.save = save;
  global.getTeamName = getTeamName;
  global.PLAYERS = PLAYERS;
  global.byId = byId;
  global.takenMap = takenMap;
  global.currentPick = currentPick;
  global.autoAdvanceKeepers = autoAdvanceKeepers;
  global.addKeeper = addKeeper;
  global.removeKeeper = removeKeeper;
  global.updateMaxKeepers = updateMaxKeepers;
  global.draftPlayer = draftPlayer;
  global.toggleWatch = toggleWatch;
  global.moveWatch = moveWatch;
  global.reorderWatch = reorderWatch;
  global.draftUnlistedPlayer = draftUnlistedPlayer;
  global.undo = undo;
  global.jumpTo = jumpTo;
  global.resetDraft = resetDraft;
  global.selectRosterSlot = selectRosterSlot;

  // Multi-League management exports
  global.getLeagueList = getLeagueList;
  global.getActiveLeagueId = getActiveLeagueId;
  global.switchLeague = switchLeague;
  global.createNewLeague = createNewLeague;
  global.duplicateCurrentLeague = duplicateCurrentLeague;
  global.deleteLeague = deleteLeague;
  global.exportLeagueBackup = exportLeagueBackup;
  global.importLeagueBackup = importLeagueBackup;
  global.reconcileWithPlayerPool = reconcileWithPlayerPool;
})(typeof window !== 'undefined' ? window : globalThis);

