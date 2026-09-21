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
    powerRankings: null,
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

  async function fetchWaivers(limit = 50) {
    inSeasonState.loading = true;
    const res = await apiRequest(`/api/manager/waivers?limit=${limit}`);
    inSeasonState.loading = false;
    if (res?.ok && Array.isArray(res.waivers)) {
      inSeasonState.waivers = res.waivers;
      saveLocalCache();
    }
    return inSeasonState.waivers;
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

  // Export to global scope
  global.inSeasonState = inSeasonState;
  global.inSeasonManager = {
    setView,
    selectLeague,
    fetchLeagues,
    fetchTeamView,
    fetchNews,
    fetchWaivers,
    fetchPowerRankings,
    seedDemoData,
    saveLocalCache,
  };
})(typeof window !== 'undefined' ? window : globalThis);
