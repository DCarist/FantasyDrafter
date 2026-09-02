// 📦 Reactive State & Data Container for Fantasy Drafter
(function (global) {
  const STORE_KEY = 'kenDraftBoard-v1';

  const DEFAULTS = {
    leagueName: "Ken's Draft Board",
    teams: 12,
    slot: 2,
    rounds: 25,
    mode: '3rr',
    scoring: 'half',
    qbFormat: 'sf',
    leagueType: 'dynasty',
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
      "Team 1", "Ken", "Team 3", "Team 4", "Team 5", "Team 6",
      "Team 7", "Team 8", "Team 9", "Team 10", "Team 11", "Team 12"
    ],
    rosterSlots: Object.assign({}, (typeof DEFAULT_ROSTER_SLOTS !== 'undefined' ? DEFAULT_ROSTER_SLOTS : {
      qb: 1, rb: 2, wr: 2, te: 1, flex: 3, superflex: 1, k: 0, dst: 0, bench: 15
    }))
  };

  let state = load();
  let ui = { posFilter: 'ALL', search: '', sort: 'score', hideTaken: false, hideOutIR: false };
  let viewingRosterSlot = null; // null = follow on-the-clock slot

  function normalizeState(s) {
    s.settings = Object.assign({}, DEFAULTS, s.settings);
    if (!s.settings.leagueName) s.settings.leagueName = "Ken's Draft Board";
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

    const rawKeepers = Array.isArray(s.keepers) ? s.keepers : (Array.isArray(s.settings.keepers) ? s.settings.keepers : []);
    const validKeepers = [];
    for (const k of rawKeepers) {
      if (!k || typeof k !== 'object') continue;
      validKeepers.push({
        id: k.id || ('k_' + Math.random().toString(36).substr(2, 9)),
        slot: Math.max(1, Math.min(tCount, parseInt(k.slot, 10) || 1)),
        round: Math.max(1, Math.min(s.settings.rounds || 50, parseInt(k.round, 10) || 1)),
        playerId: k.playerId != null ? parseInt(k.playerId, 10) : null,
        customName: k.customName ? String(k.customName).trim() : null,
        customPos: k.customPos ? String(k.customPos).trim().toUpperCase() : null,
        customTeam: k.customTeam ? String(k.customTeam).trim().toUpperCase() : null,
        customBye: k.customBye != null ? parseInt(k.customBye, 10) : null
      });
    }
    s.keepers = validKeepers;

    if (!Array.isArray(s.log)) s.log = [];
    if (!Array.isArray(s.watchlist)) s.watchlist = [];
    if (!Array.isArray(s.queue)) s.queue = [];
    if (!s.tradedPicks || typeof s.tradedPicks !== 'object') s.tradedPicks = {};
    return s;
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        return normalizeState(s);
      }
    } catch (e) { /* fallback on error */ }
    return normalizeState({ settings: Object.assign({}, DEFAULTS), keepers: [], log: [], watchlist: [], queue: [], tradedPicks: {} });
  }

  function save() {
    normalizeState(state);
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }

  function getTeamName(slot) {
    const s = state.settings;
    const name = s.teamNames && s.teamNames[slot - 1];
    return (name && name.trim()) ? name.trim() : (slot === s.slot ? 'My Team' : ('Team ' + slot));
  }

  // Raw players dataset reference
  const getPlayersList = () => {
    const raw = (window.DRAFT_DATA && window.DRAFT_DATA.players) ? window.DRAFT_DATA.players : [];
    return raw.map((p, i) => Object.assign({ id: i }, p));
  };

  const PLAYERS = (typeof window !== 'undefined' && window.DRAFT_DATA && window.DRAFT_DATA.players)
    ? window.DRAFT_DATA.players.map((p, i) => Object.assign({ id: i }, p))
    : [];

  const byId = id => {
    if (id == null) return null;
    if (PLAYERS[id]) return PLAYERS[id];
    if (window.DRAFT_DATA && window.DRAFT_DATA.players && window.DRAFT_DATA.players[id]) {
      return Object.assign({ id: id }, window.DRAFT_DATA.players[id]);
    }
    return null;
  };

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
      const posVal = keeper.customPos || p.pos || 'WR';
      const nameVal = keeper.customName || p.name || ('Keeper ' + posVal);
      const teamVal = keeper.customTeam || p.team || '';
      const byeVal = keeper.customBye || p.bye || null;

      state.log.push({
        overall: pick,
        playerId: keeper.playerId != null ? keeper.playerId : null,
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

    const newKeeper = {
      id: candidate.id || ('k_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)),
      slot: parseInt(candidate.slot, 10) || 1,
      round: parseInt(candidate.round, 10) || 1,
      playerId: candidate.playerId != null ? parseInt(candidate.playerId, 10) : null,
      customName: candidate.customName ? String(candidate.customName).trim() : null,
      customPos: candidate.customPos ? String(candidate.customPos).trim().toUpperCase() : null,
      customTeam: candidate.customTeam ? String(candidate.customTeam).trim().toUpperCase() : null,
      customBye: candidate.customBye != null ? parseInt(candidate.customBye, 10) : null
    };

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
    state.log.push({ overall: pick, playerId: id, mine: Boolean(mine) });
    state.watchlist = cleanWatchlist(state.watchlist, [id]);
    if (typeof cleanQueue === 'function') {
      state.queue = cleanQueue(state.queue, [id]);
    }
    autoAdvanceKeepers();
    save();
    if (typeof render === 'function') render();

    const p = byId(id) || {};
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

  function toggleWatch(id, e) {
    if (e) e.stopPropagation();
    state.watchlist = toggleWatchlist(state.watchlist, id);
    save();
    if (typeof renderTabs === 'function') renderTabs();
    if (typeof renderPool === 'function') renderPool();
    if (typeof renderWatchlistPanel === 'function') renderWatchlistPanel();
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
        state.log.push({
          overall: nextPickNum,
          playerId: keeper.playerId != null ? keeper.playerId : null,
          customName: keeper.playerId == null ? (keeper.customName || 'Keeper') : null,
          customPos: keeper.customPos || p.pos || 'WR',
          customTeam: keeper.customTeam || p.team || null,
          customBye: keeper.customBye || p.bye || null,
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

  // Export properties to global scope
  global.STORE_KEY = STORE_KEY;
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
  global.draftUnlistedPlayer = draftUnlistedPlayer;
  global.undo = undo;
  global.jumpTo = jumpTo;
  global.resetDraft = resetDraft;
  global.selectRosterSlot = selectRosterSlot;
})(typeof window !== 'undefined' ? window : globalThis);

