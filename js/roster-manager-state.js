// 🏈 Reactive State & Cache Manager for In-Season Roster Management
if (typeof window !== 'undefined' && !window.global) {
  window.global = window;
}
((global) => {
  const CACHE_KEY = 'fantasy_drafter_in_season_latest_cache';

  const inSeasonState = {
    currentView: 'draft', // 'draft' | 'team' | 'leagues' | 'news' | 'waivers' | 'rankings'
    activeLeagueId: null,
    activeTeamId: null,
    leagues: [],
    rosterData: null,
    news: [],
    newsFilter: 'all', // 'all' | 'breaking' | 'injury' | 'outlook'
    waivers: [],
    waiverFilters: {
      leagueId: 'all',
      format: 'dyn_sf',
      pos: 'ALL',
      needsOnly: false,
      watchlistOnly: false,
      search: '',
    },
    watchlist: {},
    powerRankings: null,
    playerDetailsCache: {},
    activePlayerDetails: null,
    activePlayerModalTab: 'overview',
    isServerOnline: true,
    lastSyncTimestamp: null,
    loading: false,
  };

  function loadLocalCache() {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) {
          const cached = JSON.parse(raw);
          if (cached && typeof cached === 'object') {
            inSeasonState.activeLeagueId = cached.activeLeagueId || null;
            inSeasonState.leagues = Array.isArray(cached.leagues) ? cached.leagues : [];
            inSeasonState.rosterData = cached.rosterData || null;
            inSeasonState.news = Array.isArray(cached.news) ? cached.news : [];
            inSeasonState.waivers = Array.isArray(cached.waivers) ? cached.waivers : [];
            inSeasonState.waiverFilters = {
              leagueId: cached.waiverFilters?.leagueId || 'all',
              format: cached.waiverFilters?.format || 'dyn_sf',
              pos: cached.waiverFilters?.pos || 'ALL',
              needsOnly: Boolean(cached.waiverFilters?.needsOnly),
              watchlistOnly: Boolean(cached.waiverFilters?.watchlistOnly),
              search: cached.waiverFilters?.search || '',
            };
            inSeasonState.watchlist =
              cached.watchlist && typeof cached.watchlist === 'object' ? cached.watchlist : {};
            inSeasonState.powerRankings = cached.powerRankings || null;
            inSeasonState.lastSyncTimestamp = cached.lastSyncTimestamp || null;
          }
        }
      }
    } catch (_e) {
      /* fallback on error */
    }
  }

  function saveLocalCache() {
    try {
      if (typeof localStorage !== 'undefined') {
        const payload = {
          activeLeagueId: inSeasonState.activeLeagueId,
          leagues: inSeasonState.leagues,
          rosterData: inSeasonState.rosterData,
          news: inSeasonState.news,
          waivers: inSeasonState.waivers,
          waiverFilters: inSeasonState.waiverFilters,
          watchlist: inSeasonState.watchlist,
          powerRankings: inSeasonState.powerRankings,
          lastSyncTimestamp: inSeasonState.lastSyncTimestamp,
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
      }
    } catch (_e) {
      /* ignore quota errors */
    }
  }

  // Load latest offline snapshot on boot
  loadLocalCache();

  async function apiRequest(endpoint, method = 'GET', body = null) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body && method !== 'GET') {
      opts.body = JSON.stringify(body);
    }
    try {
      const res = await fetch(endpoint, opts);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      inSeasonState.isServerOnline = true;
      updateServerStatusBadge(true);
      return await res.json();
    } catch (err) {
      inSeasonState.isServerOnline = false;
      updateServerStatusBadge(false);
      console.warn(`[InSeasonManager] API request failed (${endpoint}):`, err);
      return null;
    }
  }

  function updateServerStatusBadge(isOnline) {
    if (typeof document !== 'undefined') {
      const badge = document.getElementById('in_season_status_badge');
      if (badge) {
        if (isOnline) {
          badge.className = 'sync-badge on';
          badge.textContent = 'ONLINE';
          badge.title = 'In-Season Manager Server Connected';
        } else {
          badge.className = 'sync-badge off';
          badge.textContent = 'OFFLINE (CACHE)';
          badge.title = 'Server offline. Viewing latest cached snapshot.';
        }
      }
    }
  }

  async function fetchLeagues() {
    inSeasonState.loading = true;
    const res = await apiRequest('/api/manager/leagues');
    inSeasonState.loading = false;
    if (res?.ok && Array.isArray(res.leagues)) {
      inSeasonState.leagues = res.leagues;
      if (!inSeasonState.activeLeagueId && res.leagues.length > 0) {
        inSeasonState.activeLeagueId = res.leagues[0].id;
      }
      inSeasonState.lastSyncTimestamp = new Date().toISOString();
      saveLocalCache();
    }
    return inSeasonState.leagues;
  }

  async function selectLeague(leagueId) {
    inSeasonState.activeLeagueId = leagueId;
    saveLocalCache();
    if (inSeasonState.currentView === 'team') {
      await fetchTeamView(leagueId);
    } else if (inSeasonState.currentView === 'rankings') {
      await fetchPowerRankings(leagueId);
    }
    if (typeof global.renderManagerView === 'function') {
      global.renderManagerView();
    }
  }

  async function fetchTeamView(leagueId = inSeasonState.activeLeagueId, teamId = null) {
    if (!leagueId) return null;
    inSeasonState.loading = true;
    const url = `/api/manager/roster?league_id=${encodeURIComponent(leagueId)}${teamId ? `&team_id=${encodeURIComponent(teamId)}` : ''}`;
    const res = await apiRequest(url);
    inSeasonState.loading = false;
    if (res?.ok && res.data) {
      inSeasonState.rosterData = res.data;
      inSeasonState.activeTeamId = res.data.team_id || null;
      saveLocalCache();
    }
    return inSeasonState.rosterData;
  }

  async function fetchNews(impact = null, limit = 50) {
    inSeasonState.loading = true;
    let url = `/api/manager/news?limit=${limit}`;
    if (impact && impact !== 'all') {
      url += `&impact=${encodeURIComponent(impact)}`;
    }
    const res = await apiRequest(url);
    inSeasonState.loading = false;
    if (res?.ok && Array.isArray(res.news)) {
      inSeasonState.news = res.news;
      saveLocalCache();
    }
    return inSeasonState.news;
  }

  async function fetchWaivers(filters = {}) {
    inSeasonState.loading = true;
    if (filters && typeof filters === 'object') {
      inSeasonState.waiverFilters = { ...inSeasonState.waiverFilters, ...filters };
    }
    const wf = inSeasonState.waiverFilters;
    const params = new URLSearchParams();
    params.set('limit', '100');
    if (wf.leagueId && wf.leagueId !== 'all') {
      params.set('league_id', wf.leagueId);
    }
    if (wf.format) {
      params.set('format', wf.format);
    }
    if (wf.pos && wf.pos !== 'ALL') {
      params.set('pos', wf.pos);
    }
    if (wf.needsOnly) {
      params.set('needs_only', 'true');
    }
    if (wf.watchlistOnly) {
      params.set('watchlist_only', 'true');
    }
    if (wf.search?.trim()) {
      params.set('search', wf.search.trim());
    }

    const res = await apiRequest(`/api/manager/waivers?${params.toString()}`);
    inSeasonState.loading = false;
    if (res?.ok && Array.isArray(res.waivers)) {
      inSeasonState.waivers = res.waivers;
      saveLocalCache();
    }
    return inSeasonState.waivers;
  }

  async function fetchWatchlist() {
    const res = await apiRequest('/api/manager/watchlist');
    if (res?.ok && res.watchlist && typeof res.watchlist === 'object') {
      inSeasonState.watchlist = res.watchlist;
      saveLocalCache();
    }
    return inSeasonState.watchlist;
  }

  function normalizePlayerName(name) {
    let s = String(name || '').toLowerCase().trim();
    for (const ch of ['.', "'", '’', '-', ',', '/', '`']) {
      s = s.replaceAll(ch, '');
    }
    for (const suffix of [' jr', ' sr', ' ii', ' iii', ' iv', ' v']) {
      if (s.endsWith(suffix)) {
        s = s.slice(0, -suffix.length).trim();
      }
    }
    return s.split(/\s+/).join(' ');
  }

  async function toggleWatchlist(playerName, note = '') {
    if (!playerName) return { ok: false };
    const normKey = normalizePlayerName(playerName);
    const wasWatchlisted = inSeasonState.watchlist?.[normKey] !== undefined;
    const willBeWatchlisted = !wasWatchlisted;

    // 1. Optimistic instant UI update
    if (!inSeasonState.watchlist) {
      inSeasonState.watchlist = {};
    }
    if (willBeWatchlisted) {
      inSeasonState.watchlist[normKey] = note || '';
    } else {
      delete inSeasonState.watchlist[normKey];
    }
    for (const w of inSeasonState.waivers) {
      const pNorm = normalizePlayerName(w.name || w.player?.name);
      if (pNorm === normKey || (w.name && w.name.toLowerCase() === playerName.toLowerCase())) {
        w.is_watchlisted = willBeWatchlisted;
        w.watchlist_note = willBeWatchlisted ? w.watchlist_note || note || '' : '';
      }
    }
    saveLocalCache();
    if (typeof global.renderManagerView === 'function') {
      global.renderManagerView();
    }

    // 2. Persist to server
    const res = await apiRequest('/api/manager/watchlist/toggle', 'POST', {
      player_name: playerName,
      note,
    });
    if (res?.ok) {
      const serverNorm = normalizePlayerName(res.player_name || playerName);
      const finalWatchlisted =
        res.is_watchlisted !== undefined ? Boolean(res.is_watchlisted) : willBeWatchlisted;
      if (finalWatchlisted) {
        inSeasonState.watchlist[serverNorm] = res.note || note || '';
      } else {
        delete inSeasonState.watchlist[serverNorm];
      }
      for (const w of inSeasonState.waivers) {
        const pNorm = normalizePlayerName(w.name || w.player?.name);
        if (
          pNorm === serverNorm ||
          pNorm === normKey ||
          (w.name && w.name.toLowerCase() === playerName.toLowerCase())
        ) {
          w.is_watchlisted = finalWatchlisted;
          w.watchlist_note = finalWatchlisted ? res.note || note || '' : '';
        }
      }
      saveLocalCache();
      if (typeof global.renderManagerView === 'function') {
        global.renderManagerView();
      }
    }
    return res;
  }

  async function saveWatchlistNote(playerName, note = '') {
    if (!playerName) return { ok: false };
    const normKey = normalizePlayerName(playerName);
    if (!inSeasonState.watchlist) {
      inSeasonState.watchlist = {};
    }
    inSeasonState.watchlist[normKey] = note || '';
    for (const w of inSeasonState.waivers) {
      const pNorm = normalizePlayerName(w.name || w.player?.name);
      if (pNorm === normKey || (w.name && w.name.toLowerCase() === playerName.toLowerCase())) {
        w.watchlist_note = note || '';
      }
    }
    saveLocalCache();
    if (typeof global.renderManagerView === 'function') {
      global.renderManagerView();
    }

    const res = await apiRequest('/api/manager/watchlist/note', 'POST', {
      player_name: playerName,
      note,
    });
    if (res?.ok) {
      const serverNorm = normalizePlayerName(res.player_name || playerName);
      inSeasonState.watchlist[serverNorm] = res.note || note || '';
      for (const w of inSeasonState.waivers) {
        const pNorm = normalizePlayerName(w.name || w.player?.name);
        if (
          pNorm === serverNorm ||
          pNorm === normKey ||
          (w.name && w.name.toLowerCase() === playerName.toLowerCase())
        ) {
          w.watchlist_note = res.note || note || '';
        }
      }
      saveLocalCache();
    }
    return res;
  }

  async function fetchPowerRankings(leagueId = inSeasonState.activeLeagueId) {
    if (!leagueId) return null;
    inSeasonState.loading = true;
    const res = await apiRequest(
      `/api/manager/power-rankings?league_id=${encodeURIComponent(leagueId)}`,
    );
    inSeasonState.loading = false;
    if (res?.ok && res.rankings) {
      inSeasonState.powerRankings = res.rankings;
      saveLocalCache();
    }
    return inSeasonState.powerRankings;
  }

  async function syncLeague(leagueId = inSeasonState.activeLeagueId) {
    const targetId = leagueId || inSeasonState.activeLeagueId;
    if (!targetId) {
      return { ok: false, error: 'No league selected to sync' };
    }
    inSeasonState.loading = true;
    try {
      const res = await apiRequest('/api/manager/sync', 'POST', { league_id: targetId });
      inSeasonState.loading = false;
      if (res?.ok) {
        inSeasonState.lastSyncTimestamp = new Date().toISOString();
        await fetchLeagues();
        if (inSeasonState.activeLeagueId === targetId) {
          await fetchTeamView(targetId);
        }
        await fetchWaivers();
        await fetchPowerRankings(targetId);
        saveLocalCache();
        return res;
      }
      return res || { ok: false, error: 'Sync request failed' };
    } catch (err) {
      inSeasonState.loading = false;
      return { ok: false, error: err.message };
    }
  }

  async function seedDemoData() {
    inSeasonState.loading = true;
    const res = await apiRequest('/api/manager/seed-demo', 'POST', {});
    inSeasonState.loading = false;
    if (res?.ok) {
      await fetchLeagues();
      if (inSeasonState.leagues.length > 0) {
        inSeasonState.activeLeagueId = inSeasonState.leagues[0].id;
      }
      await fetchTeamView();
      await fetchNews();
      await fetchWaivers();
      await fetchPowerRankings();
      if (typeof global.renderManagerView === 'function') {
        global.renderManagerView();
      }
    }
    return res;
  }

  async function setView(viewName) {
    inSeasonState.currentView = viewName;
    if (typeof document !== 'undefined') {
      // Update top tabs
      const tabs = document.querySelectorAll('.nav-tab');
      for (const tab of tabs) {
        if (tab.dataset.view === viewName) {
          tab.classList.add('active');
        } else {
          tab.classList.remove('active');
        }
      }

      // Hide or show views
      const draftMain = document.getElementById('main_draft_view');
      const draftHeaderRows = document.querySelectorAll('.draft-only-row');
      const managerContainer = document.getElementById('manager_views_container');

      if (viewName === 'draft') {
        if (draftMain) draftMain.style.display = '';
        for (const row of draftHeaderRows) row.style.display = '';
        if (managerContainer) managerContainer.style.display = 'none';
        if (typeof global.render === 'function') global.render();
      } else {
        if (draftMain) draftMain.style.display = 'none';
        for (const row of draftHeaderRows) row.style.display = 'none';
        if (managerContainer) managerContainer.style.display = 'block';

        // Load data corresponding to the view
        if (viewName === 'team') {
          await fetchTeamView();
        } else if (viewName === 'leagues') {
          await fetchLeagues();
        } else if (viewName === 'news') {
          await fetchNews(inSeasonState.newsFilter);
        } else if (viewName === 'waivers') {
          await fetchWatchlist();
          await fetchWaivers();
        } else if (viewName === 'rankings') {
          await fetchPowerRankings();
        }

        if (typeof global.renderManagerView === 'function') {
          global.renderManagerView();
        }
      }
    }
  }

  async function fetchPlayerDetails(playerName, leagueId = null) {
    if (!playerName) return null;
    const normKey = normalizePlayerName(playerName);
    if (inSeasonState.playerDetailsCache[normKey]) {
      inSeasonState.activePlayerDetails = inSeasonState.playerDetailsCache[normKey];
      return inSeasonState.activePlayerDetails;
    }
    try {
      const res = await apiRequest('/api/manager/player/details', 'POST', {
        name: playerName,
        league_id: leagueId || inSeasonState.activeLeagueId || null,
      });
      if (res?.ok && res.details) {
        inSeasonState.playerDetailsCache[normKey] = res.details;
        inSeasonState.activePlayerDetails = res.details;
        return res.details;
      }
    } catch (err) {
      console.error('Failed to fetch player details for', playerName, err);
    }
    return null;
  }

  // Export to global scope
  global.inSeasonState = inSeasonState;
  global.normalizePlayerName = normalizePlayerName;
  global.inSeasonManager = {
    setView,
    selectLeague,
    syncLeague,
    fetchLeagues,
    fetchTeamView,
    fetchNews,
    fetchWaivers,
    fetchWatchlist,
    toggleWatchlist,
    saveWatchlistNote,
    fetchPowerRankings,
    fetchPlayerDetails,
    normalizePlayerName,
    seedDemoData,
    saveLocalCache,
  };
})(typeof window !== 'undefined' ? window : globalThis);
