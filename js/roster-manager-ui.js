// 🎨 In-Season Roster Management UI Component & View Renderers
if (typeof window !== 'undefined' && !window.global) {
  window.global = window;
}
((global) => {
  function esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escJs(str) {
    if (str == null) return '';
    return String(str)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '&quot;')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r');
  }

  function getInjuryBadge(injury) {
    if (!injury?.status) return '';
    const st = String(injury.status).toUpperCase();
    let cls = 'injury-badge-q';
    if (st === 'OUT' || st === 'IR' || st === 'PUP') cls = 'injury-badge-out';
    else if (st === 'DOUBTFUL') cls = 'injury-badge-d';
    return `<span class="injury-badge ${cls}" title="${esc(injury.detail || st)}">${esc(st)}</span>`;
  }

  function renderSubHeader() {
    const s = global.inSeasonState;
    const leagues = s.leagues || [];
    const activeId = s.activeLeagueId;

    const dynastyLeagues = leagues.filter((l) => l.is_dynasty);
    const redraftLeagues = leagues.filter((l) => !l.is_dynasty);

    let optionsHtml = '';
    if (dynastyLeagues.length > 0) {
      optionsHtml += '<optgroup label="👑 Dynasty Leagues">';
      for (const l of dynastyLeagues) {
        const isSel = l.id === activeId;
        const platBadge = l.platform ? `[${l.platform.toUpperCase()}] ` : '';
        optionsHtml += `<option value="${esc(l.id)}"${isSel ? ' selected' : ''}>${esc(platBadge + l.name)}</option>`;
      }
      optionsHtml += '</optgroup>';
    }
    if (redraftLeagues.length > 0) {
      optionsHtml += '<optgroup label="🔄 Redraft Leagues">';
      for (const l of redraftLeagues) {
        const isSel = l.id === activeId;
        const platBadge = l.platform ? `[${l.platform.toUpperCase()}] ` : '';
        optionsHtml += `<option value="${esc(l.id)}"${isSel ? ' selected' : ''}>${esc(platBadge + l.name)}</option>`;
      }
      optionsHtml += '</optgroup>';
    }
    if (leagues.length === 0) {
      optionsHtml = '<option value="">(No Leagues Synced)</option>';
    }

    const curLeague = leagues.find((l) => l.id === activeId);
    const platName = curLeague?.platform ? curLeague.platform.toUpperCase() : 'FANTASY';
    const typeBadge = curLeague?.is_dynasty ? 'DYNASTY' : 'REDRAFT';

    return `
      <div class="manager-sub-header">
        <div class="sub-header-left">
          <label class="set">
            <span style="font-weight:700; color:var(--text)">🏆 Active League:</span>
            <select id="mgr_league_select" class="league-select" onchange="global.inSeasonManager.selectLeague(this.value)">
              ${optionsHtml}
            </select>
          </label>
          <span class="platform-badge ${platName.toLowerCase()}">${esc(platName)}</span>
          <span class="platform-badge ${typeBadge.toLowerCase()}">${typeBadge}</span>
          <button type="button" class="act small league-setup-subhdr-btn" onclick="global.openLeagueSetupForManager(global.inSeasonState.activeLeagueId)" title="Open League Setup & Draft Rules for Active League">⚙️ League Setup</button>
          ${
            curLeague?.last_refreshed
              ? `<span class="meta" style="font-size:12px; color:var(--dim)">Updated ${esc(
                  new Date(curLeague.last_refreshed).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                )}</span>`
              : ''
          }
        </div>
        <div class="sub-header-right">
          <button type="button" class="act" onclick="global.inSeasonManager.seedDemoData()" title="Generate realistic sample leagues with authentic rosters and news">🌱 Seed Demo Leagues</button>
          <button type="button" class="act primary" onclick="global.refreshActiveManagerView()" title="Sync and refresh active view">🔄 Sync Now</button>
        </div>
      </div>
    `;
  }

  function renderTeamView() {
    const s = global.inSeasonState;
    const data = s.rosterData;
    if (!data) {
      return `
        ${renderSubHeader()}
        <div class="empty-state-panel">
          <h3>No Roster Data Available</h3>
          <p>Connect a Sleeper or ESPN league, or click <b>Seed Demo Leagues</b> to populate realistic teams.</p>
          <button type="button" class="act primary" onclick="global.inSeasonManager.seedDemoData()">🌱 Seed Demo Leagues</button>
        </div>
      `;
    }

    // Start/Sit Alerts
    let adviceHtml = '';
    if (Array.isArray(data.start_sit_advice) && data.start_sit_advice.length > 0) {
      adviceHtml = '<div class="advice-card-group">';
      for (const adv of data.start_sit_advice) {
        const isHigh = adv.severity === 'high';
        adviceHtml += `
          <div class="advice-card ${isHigh ? 'alert-high' : 'alert-tip'}">
            <span class="advice-icon">${isHigh ? '🚨' : '💡'}</span>
            <div class="advice-content">
              <b>${isHigh ? 'Lineup Hazard' : 'Matchup Recommendation'}:</b> ${esc(adv.message)}
            </div>
          </div>
        `;
      }
      adviceHtml += '</div>';
    }

    // Drop candidates
    let dropHtml = '';
    if (Array.isArray(data.drop_candidates) && data.drop_candidates.length > 0) {
      dropHtml = '<div class="drop-candidates-bar"><span>✂️ <b>Waiver Drop Candidates:</b></span>';
      for (const cand of data.drop_candidates) {
        dropHtml += `<span class="drop-chip" title="${esc(cand.reason)}">${esc(cand.pos)} ${esc(cand.name)} <small>(${esc(cand.team || 'FA')})</small></span>`;
      }
      dropHtml += '</div>';
    }

    function renderPlayerRow(p, slotName = '') {
      if (!p) return '';
      const name = p.name || 'Empty';
      const pos = p.pos || '';
      const team = p.team || '';
      const bye = p.bye != null ? `Bye ${p.bye}` : '';
      const injuryHtml = getInjuryBadge(p.injury);
      const score = p.score != null ? Math.round(p.score) : '—';
      const rank = p.rank != null ? `#${p.rank}` : '';

      const finalSlot = slotName || p.slot || p.lineupSlot || pos || 'FLEX';
      const slotClass = String(finalSlot)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_');

      return `
        <tr class="roster-player-row player-row-${esc(pos.toLowerCase())}">
          <td class="slot-col"><span class="slot-badge slot-${esc(slotClass)}"><b>${esc(finalSlot)}</b></span></td>
          <td class="name-col">
            <span class="player-name-link" onclick="global.openPlayerModal('${escJs(name)}')">${esc(name)}</span>
            ${injuryHtml}
          </td>
          <td class="pos-col"><span class="pos-tag pos-${esc(pos.toLowerCase())}">${esc(pos)}</span></td>
          <td class="team-col">${esc(team)}</td>
          <td class="bye-col">${esc(bye)}</td>
          <td class="rank-col num">${esc(rank)}</td>
          <td class="score-col num"><b>${esc(score)}</b></td>
          <td class="action-col">
            <button type="button" class="small" onclick="global.openPlayerModal('${escJs(name)}')">📋 Dossier</button>
          </td>
        </tr>
      `;
    }

    let startersRows = '';
    for (const [idx, p] of (data.starters || []).entries()) {
      const slotLabel =
        p.slot || p.lineupSlot || (idx === 0 ? 'QB' : idx <= 2 ? 'RB' : idx <= 4 ? 'WR' : 'FLEX');
      startersRows += renderPlayerRow(p, slotLabel);
    }

    let benchRows = '';
    for (const p of data.bench || []) {
      benchRows += renderPlayerRow(p, 'BENCH');
    }

    let taxiRows = '';
    for (const p of data.taxi || []) {
      taxiRows += renderPlayerRow(p, 'TAXI');
    }

    let irRows = '';
    for (const p of data.ir || []) {
      irRows += renderPlayerRow(p, 'IR');
    }

    // Positional Rooms & Depth Hierarchy
    let roomsHtml = '';
    const posRooms = data.position_rooms || {};
    const roomPositions = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
    const hasAnyRooms = roomPositions.some(
      (pos) => Array.isArray(posRooms[pos]) && posRooms[pos].length > 0,
    );

    if (hasAnyRooms) {
      let roomCardsHtml = '';
      for (const pos of roomPositions) {
        const pList = posRooms[pos] || [];
        if (pList.length === 0) continue;
        let playersHtml = '';
        for (const p of pList) {
          const injuryHtml = getInjuryBadge(p.injury);
          const score = p.score != null ? Math.round(p.score) : '—';
          const rankStr = p.rank != null ? `#${p.rank}` : '';
          const isStarter = Boolean(p.is_starter);
          playersHtml += `
            <div class="room-player-item ${isStarter ? 'room-starter' : 'room-bench'}">
              <span class="depth-num">#${p.room_depth || 1}</span>
              <div class="room-player-info">
                <div class="room-player-name" onclick="global.openPlayerModal('${escJs(p.name)}')" style="cursor:pointer" title="${esc(p.name)}">
                  <b>${esc(p.name)}</b> ${injuryHtml}
                </div>
                <div class="meta" style="font-size:11px">
                  ${esc(p.team || 'FA')} ${p.bye != null ? `· Bye ${p.bye}` : ''} ${rankStr ? `· ${rankStr}` : ''} · Score <b>${score}</b>
                </div>
              </div>
              <span class="room-role-badge ${isStarter ? 'role-starter' : 'role-bench'}">${isStarter ? 'STARTER' : 'BENCH'}</span>
            </div>
          `;
        }
        roomCardsHtml += `
          <div class="room-card room-pos-${pos.toLowerCase()}">
            <div class="room-card-header">
              <span class="pos-tag pos-${pos.toLowerCase()}"><b>${pos}</b></span>
              <span class="room-count meta">${pList.length} Players</span>
            </div>
            <div class="room-players-list">
              ${playersHtml}
            </div>
          </div>
        `;
      }

      roomsHtml = `
        <div class="team-rooms-section">
          <div class="section-title" style="margin-bottom:10px">
            <h3 style="margin:0">🏟️ Positional Depth Charts & Room Hierarchy</h3>
            <span class="meta" style="font-size:12px">Ranked positional room hierarchy evaluating starters and depth coverage</span>
          </div>
          <div class="team-rooms-grid">
            ${roomCardsHtml}
          </div>
        </div>
      `;
    }

    return `
      ${renderSubHeader()}
      <div class="team-view-container">
        <div class="team-summary-banner">
          <div class="team-banner-main">
            <h2 class="team-banner-title">🛡️ ${esc(data.team_name)}</h2>
            <div class="team-banner-meta">
              <span>Owner: <b>${esc(data.owner_name || 'You')}</b></span>
              <span>Record: <b class="record-badge">${esc(data.wins || 0)}-${esc(data.losses || 0)}</b></span>
              <span>Points For: <b>${esc(data.points || 0)}</b></span>
            </div>
          </div>
          ${dropHtml}
        </div>

        ${adviceHtml}

        <div class="roster-grid">
          <div class="panel roster-card">
            <div class="panel-header">
              <h3>⭐ Active Starting Lineup</h3>
              <span class="meta">${(data.starters || []).length} Starters</span>
            </div>
            <table class="roster-table">
              <thead>
                <tr>
                  <th style="width:60px">Slot</th>
                  <th>Player</th>
                  <th style="width:50px">Pos</th>
                  <th style="width:50px">Team</th>
                  <th style="width:60px">Bye</th>
                  <th class="num" style="width:55px">Rank</th>
                  <th class="num" style="width:55px">Score</th>
                  <th style="width:65px"></th>
                </tr>
              </thead>
              <tbody>${startersRows || '<tr><td colspan="8">No starters listed</td></tr>'}</tbody>
            </table>
          </div>

          <div class="panel roster-card">
            <div class="panel-header">
              <h3>📦 Bench & Reserves</h3>
              <span class="meta">${(data.bench || []).length} Bench</span>
            </div>
            <table class="roster-table">
              <thead>
                <tr>
                  <th style="width:60px">Slot</th>
                  <th>Player</th>
                  <th style="width:50px">Pos</th>
                  <th style="width:50px">Team</th>
                  <th style="width:60px">Bye</th>
                  <th class="num" style="width:55px">Rank</th>
                  <th class="num" style="width:55px">Score</th>
                  <th style="width:65px"></th>
                </tr>
              </thead>
              <tbody>
                ${benchRows || '<tr><td colspan="8">No bench players</td></tr>'}
                ${taxiRows}
                ${irRows}
              </tbody>
            </table>
          </div>
        </div>

        ${roomsHtml}
      </div>
    `;
  }

  function renderLeaguesView() {
    const s = global.inSeasonState;
    const leagues = s.leagues || [];

    let cardsHtml = '';
    for (const lg of leagues) {
      const isSel = lg.id === s.activeLeagueId;
      const plat = (lg.platform || 'manual').toUpperCase();
      cardsHtml += `
        <div class="league-card ${isSel ? 'active-league-card' : ''}">
          <div class="league-card-header">
            <span class="platform-badge ${plat.toLowerCase()}">${esc(plat)}</span>
            <span class="platform-badge ${lg.is_dynasty ? 'dynasty' : 'redraft'}">${lg.is_dynasty ? '👑 DYNASTY' : '🔄 REDRAFT'}</span>
            <span class="league-season-badge">${esc(lg.season || '2026')}</span>
          </div>
          <h3 class="league-card-name">${esc(lg.name)}</h3>
          <div class="league-card-stats">
            <div class="stat-box">
              <span class="stat-num">${esc(lg.team_count || 12)}</span>
              <span class="stat-label">Teams</span>
            </div>
            <div class="stat-box">
              <span class="stat-num">${esc(lg.latest_snapshot_date ? 'Synced' : 'Fresh')}</span>
              <span class="stat-label">Status</span>
            </div>
          </div>
          <div class="league-card-actions">
            <button type="button" class="act primary" onclick="global.inSeasonManager.selectLeague('${esc(lg.id)}'); global.inSeasonManager.setView('team');">
              ${isSel ? '⭐ View Roster' : 'Select League'}
            </button>
            <button type="button" class="act" onclick="global.syncManagerLeague('${esc(lg.id)}', this)" title="Sync latest rosters from platform">
              🔄 Sync
            </button>
            <button type="button" class="act league-setup-btn" onclick="global.openLeagueSetupForManager('${esc(lg.id)}')" title="Configure rules, roster slots, and draft settings">
              ⚙️ League Setup
            </button>
            <button type="button" class="small btn-delete" onclick="global.deleteManagerLeague('${esc(lg.id)}')">🗑️</button>
          </div>
        </div>
      `;
    }

    const unsynced =
      typeof global.inSeasonManager?.getUnsyncedDraftLeagues === 'function'
        ? global.inSeasonManager.getUnsyncedDraftLeagues()
        : [];

    let draftManifest = null;
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem('fantasy_drafter_leagues_manifest');
        if (raw) draftManifest = JSON.parse(raw);
      }
    } catch (_e) {}
    const allDraftLeagues =
      draftManifest && Array.isArray(draftManifest.leagues) ? draftManifest.leagues : [];

    let draftBannerHtml = '';
    if (unsynced.length > 0) {
      draftBannerHtml = `
        <div class="draft-import-banner" style="margin-bottom:16px; padding:14px 18px; background:linear-gradient(135deg, rgba(56,189,248,0.12), rgba(99,102,241,0.10)); border:1px solid rgba(56,189,248,0.3); border-radius:10px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
          <div>
            <div style="font-weight:700; font-size:14.5px; color:var(--text); display:flex; align-items:center; gap:8px">
              <span>📥</span>
              <span><b>${unsynced.length} Draft Window League${unsynced.length === 1 ? '' : 's'} Detected</b></span>
            </div>
            <div style="font-size:12px; color:var(--dim); margin-top:3px">
              Found leagues configured in your Draft Window ready to pull into In-Season Manager. Pull them over to track active rosters, waiver targets, and power rankings.
            </div>
          </div>
          <div style="display:flex; gap:8px">
            <button type="button" class="act primary" onclick="global.pullAllDraftLeagues(this)" style="font-weight:700; padding:6px 16px;">
              📥 Pull All ${unsynced.length} Leagues into Manager
            </button>
          </div>
        </div>
      `;
    }

    let draftRowsHtml = '';
    if (allDraftLeagues.length === 0) {
      draftRowsHtml = '<p class="meta">No draft window leagues found in browser storage.</p>';
    } else {
      draftRowsHtml = '<div class="discovered-leagues-list">';
      for (const dl of allDraftLeagues) {
        const isUnsynced = unsynced.some((u) => u.id === dl.id);
        draftRowsHtml += `
          <div class="discovered-league-row" style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid var(--border)">
            <div>
              <b>${esc(dl.name || 'Draft League')}</b>
              <div class="meta" style="font-size:11.5px; color:var(--dim)">ID: ${esc(dl.id)}</div>
            </div>
            <div>
              ${
                isUnsynced
                  ? `<button type="button" class="act primary small" onclick="global.pullSingleDraftLeague('${esc(dl.id)}', this)">📥 Pull into In-Season</button>`
                  : `<button type="button" class="act small" onclick="global.syncDraftBoardRoster('${esc(dl.id)}', this)" title="Re-sync roster snapshot from draft board">🔄 Re-sync Roster</button>`
              }
            </div>
          </div>
        `;
      }
      draftRowsHtml += '</div>';
    }

    return `
      <div class="manager-sub-header">
        <h2 style="margin:0">🏆 Connected Leagues Dashboard</h2>
        <div style="margin-left:auto; display:flex; gap:8px">
          ${
            unsynced.length > 0
              ? `<button type="button" class="act primary" onclick="global.pullAllDraftLeagues(this)">📥 Pull Draft Leagues (${unsynced.length})</button>`
              : ''
          }
          <button type="button" class="act" onclick="global.inSeasonManager.seedDemoData()">🌱 Seed Demo Leagues</button>
        </div>
      </div>

      ${draftBannerHtml}

      <div class="leagues-dashboard-layout">
        <div class="leagues-grid">
          ${cardsHtml || '<div class="empty-state-card">No leagues connected yet. Onboard via Draft Window, Sleeper, ESPN, or Demo Seed below.</div>'}
        </div>

        <div class="panel onboarding-panel">
          <h3>➕ Connect a League</h3>
          <div class="onboarding-tabs">
            <div class="onboarding-section">
              <h4>📋 Pull from Draft Window</h4>
              <p>Import and sync leagues already configured on your Fantasy Drafter draft board:</p>
              ${draftRowsHtml}
            </div>

            <div class="onboarding-section" style="margin-top:16px; border-top:1px solid var(--border); padding-top:16px">
              <h4>⚡ Sleeper Auto-Sync</h4>
              <p>Enter your Sleeper username to automatically discover and import your leagues, or enter a League ID / URL:</p>
              <div class="input-action-row">
                <input type="text" id="sleeper_import_username" placeholder="Sleeper Username (e.g. your_name)">
                <button type="button" class="act primary" onclick="global.discoverSleeperLeagues()">Discover Leagues</button>
              </div>
              <div class="input-action-row" style="margin-top:8px">
                <input type="text" id="sleeper_import_league_id" placeholder="Or paste Sleeper League ID / URL">
                <button type="button" class="act" onclick="global.syncDirectSleeperLeague(this)">⚡ Sync League</button>
              </div>
              <div id="sleeper_discovered_container"></div>
            </div>

            <div class="onboarding-section" style="margin-top:16px; border-top:1px solid var(--border); padding-top:16px">
              <h4>🏈 ESPN Fantasy Sync</h4>
              <p>Enter your ESPN League ID (and cookies for private leagues):</p>
              <div class="input-action-row">
                <input type="text" id="espn_import_league_id" placeholder="ESPN League ID or URL">
                <button type="button" class="act primary" onclick="global.syncEspnLeague(this)">⚡ Sync ESPN</button>
              </div>
              <details style="margin-top:8px">
                <summary style="font-size:12px; cursor:pointer; color:var(--dim)">🔒 Private League Cookies (SWID & espn_s2)</summary>
                <div style="margin-top:8px; display:flex; flex-direction:column; gap:6px">
                  <input type="text" id="espn_import_swid" placeholder="SWID (e.g. {12345678-ABCD-...})">
                  <input type="text" id="espn_import_s2" placeholder="espn_s2 cookie string">
                  <div class="meta" style="font-size:11px">See <a href="espn_cookies.md" target="_blank" style="color:var(--pri)">espn_cookies.md</a> for quick cookie retrieval steps.</div>
                </div>
              </details>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderNewsView() {
    const s = global.inSeasonState;
    const news = s.news || [];
    const filter = s.newsFilter || 'all';

    const filterTabsHtml = `
      <div class="news-filter-tabs">
        <button type="button" class="tab-btn ${filter === 'all' ? 'active' : ''}" onclick="global.setNewsFilter('all')">All News (${news.length})</button>
        <button type="button" class="tab-btn ${filter === 'breaking' ? 'active' : ''}" onclick="global.setNewsFilter('breaking')">🚨 Breaking</button>
        <button type="button" class="tab-btn ${filter === 'injury' ? 'active' : ''}" onclick="global.setNewsFilter('injury')">🚑 Injuries</button>
        <button type="button" class="tab-btn ${filter === 'outlook' ? 'active' : ''}" onclick="global.setNewsFilter('outlook')">📊 Matchup Outlook</button>
      </div>
    `;

    let newsCardsHtml = '';
    for (const item of news) {
      const impact = (item.impact || 'info').toLowerCase();
      let badgeCls = 'impact-info';
      if (impact === 'breaking') badgeCls = 'impact-breaking';
      else if (impact === 'injury') badgeCls = 'impact-injury';

      newsCardsHtml += `
        <div class="news-card">
          <div class="news-card-header">
            <span class="news-player-tag" onclick="global.openPlayerModal('${escJs(item.player_name)}')">🏈 ${esc(item.player_name)}</span>
            <span class="impact-badge ${badgeCls}">${esc(impact.toUpperCase())}</span>
            <span class="news-time">${esc(new Date(item.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }))}</span>
          </div>
          <h4 class="news-headline">${esc(item.headline)}</h4>
          <p class="news-body">${esc(item.body)}</p>
          <div class="news-source">Source: <b>${esc(item.source || 'Rotowire')}</b></div>
        </div>
      `;
    }

    return `
      ${renderSubHeader()}
      <div class="news-container">
        <div class="news-header-bar">
          <h2>📰 Player News Aggregator</h2>
          ${filterTabsHtml}
        </div>
        <div class="news-feed-list">
          ${newsCardsHtml || '<div class="empty-state-panel">No news updates matching this filter. Click "Sync Now" to refresh.</div>'}
        </div>
      </div>
    `;
  }

  function renderWaiversView() {
    const s = global.inSeasonState;
    const waivers = s.waivers || [];
    const wf = s.waiverFilters || {
      leagueId: 'all',
      format: 'dyn_sf',
      pos: 'ALL',
      needsOnly: false,
      watchlistOnly: false,
      search: '',
    };
    const leagues = s.leagues || [];
    const watchlist = s.watchlist || {};

    const isDynastyFormat = (wf.format || 'dyn_sf').startsWith('dyn');
    const relevantLeagues = leagues.filter((lg) =>
      isDynastyFormat ? Boolean(lg.is_dynasty) : !lg.is_dynasty,
    );
    const allLabel = isDynastyFormat
      ? '👑 All Connected Dynasty Leagues'
      : '🔄 All Connected Redraft Leagues';

    // Ensure selected league matches format
    if (wf.leagueId !== 'all' && !relevantLeagues.some((l) => l.id === wf.leagueId)) {
      wf.leagueId = 'all';
    }

    // League Options
    let leagueOptionsHtml = `<option value="all"${wf.leagueId === 'all' ? ' selected' : ''}>${allLabel}</option>`;
    for (const lg of relevantLeagues) {
      const isSel = wf.leagueId === lg.id;
      const platBadge = lg.platform ? `[${lg.platform.toUpperCase()}] ` : '';
      leagueOptionsHtml += `<option value="${esc(lg.id)}"${isSel ? ' selected' : ''}>${esc(platBadge + lg.name)}</option>`;
    }

    // Format Pills grouped by Dynasty vs Redraft
    const dynastyFormats = [
      { key: 'dyn_sf', label: 'Dynasty SF' },
      { key: 'dyn_1qb', label: 'Dynasty 1QB' },
    ];
    const redraftFormats = [
      { key: 'red_ppr', label: 'Redraft PPR' },
      { key: 'red_half', label: 'Redraft Half' },
      { key: 'red_std', label: 'Redraft Standard' },
    ];

    let formatPillsHtml =
      '<div class="format-pill-groups" style="display:flex; gap:8px; align-items:center">';
    formatPillsHtml +=
      '<div class="format-pill-group" style="display:flex; background:rgba(255,215,0,0.06); padding:2px 4px; border-radius:6px; border:1px solid rgba(255,215,0,0.2); gap:4px; align-items:center">';
    formatPillsHtml +=
      '<span style="font-size:10px; font-weight:700; color:#ffd700; margin:0 2px">👑 DYNASTY:</span>';
    for (const f of dynastyFormats) {
      const isAct = wf.format === f.key;
      formatPillsHtml += `<button type="button" class="format-pill-btn ${isAct ? 'active' : ''}" onclick="global.onWaiverFormatFilter('${f.key}')">${f.label}</button>`;
    }
    formatPillsHtml += '</div>';

    formatPillsHtml +=
      '<div class="format-pill-group" style="display:flex; background:rgba(56,189,248,0.06); padding:2px 4px; border-radius:6px; border:1px solid rgba(56,189,248,0.2); gap:4px; align-items:center">';
    formatPillsHtml +=
      '<span style="font-size:10px; font-weight:700; color:#38bdf8; margin:0 2px">🔄 REDRAFT:</span>';
    for (const f of redraftFormats) {
      const isAct = wf.format === f.key;
      formatPillsHtml += `<button type="button" class="format-pill-btn ${isAct ? 'active' : ''}" onclick="global.onWaiverFormatFilter('${f.key}')">${f.label}</button>`;
    }
    formatPillsHtml += '</div></div>';

    // Position Pills
    const posList = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DST'];
    let posPillsHtml = '<div class="pos-pills">';
    for (const pos of posList) {
      const isAct = (wf.pos || 'ALL').toUpperCase() === pos;
      posPillsHtml += `<button type="button" class="pos-pill-btn ${isAct ? 'active' : ''}" onclick="global.onWaiverPosFilter('${pos}')">${pos}</button>`;
    }
    posPillsHtml += '</div>';

    function normalizePlayerName(name) {
      let str = String(name || '')
        .toLowerCase()
        .trim();
      for (const ch of ['.', "'", '’', '-', ',', '/', '`']) {
        str = str.replaceAll(ch, '');
      }
      for (const suffix of [' jr', ' sr', ' ii', ' iii', ' iv', ' v']) {
        if (str.endsWith(suffix)) {
          str = str.slice(0, -suffix.length).trim();
        }
      }
      return str.split(/\s+/).join(' ');
    }

    // Filter displayed waivers if needsOnly or watchlistOnly is active
    let displayedWaivers = waivers;
    if (wf.needsOnly) {
      displayedWaivers = displayedWaivers.filter(
        (item) => item.need_matches && item.need_matches.length > 0,
      );
    }
    if (wf.watchlistOnly) {
      displayedWaivers = displayedWaivers.filter((item) => {
        const pNorm = normalizePlayerName(item.name || item.player?.name);
        return (
          Boolean(item.is_watchlisted) ||
          watchlist[pNorm] !== undefined ||
          watchlist[pNorm.replace(/\s+/g, '')] !== undefined
        );
      });
    }

    // Table rows
    let rowsHtml = '';
    for (const [idx, item] of displayedWaivers.entries()) {
      const p = item.player || {};
      const name = item.name || p.name || '';
      const pos = item.pos || p.pos || '';
      const team = item.team || p.team || '';
      const score = item.score != null ? Math.round(item.score) : '—';
      const rank = item.rank != null ? `#${item.rank}` : '';
      const normName = normalizePlayerName(name);
      const isPriority = item.is_priority;
      const isWatchlisted = Boolean(
        item.is_watchlisted ||
          (watchlist &&
            (watchlist[normName] !== undefined ||
              watchlist[normName.replace(/\s+/g, '')] !== undefined)),
      );
      const note = item.watchlist_note || watchlist[normName] || '';

      // Available leagues badges with deep-links
      let availHtml = '';
      for (const lg of item.available_in || []) {
        if (lg.claim_url) {
          availHtml += `<a href="${esc(lg.claim_url)}" target="_blank" rel="noopener noreferrer" class="waiver-claim-chip platform-${esc(lg.platform || 'manual')}" title="Make claim in ${esc(lg.league_name)}">${esc(lg.league_name)} ↗</a>`;
        } else {
          availHtml += `<span class="waiver-avail-chip">${esc(lg.league_name)}</span>`;
        }
      }

      // Need match badges
      let needHtml = '';
      for (const need of item.need_matches || []) {
        const type = need.type || 'UPGRADE';
        let badgeCls = 'badge-upgrade';
        if (type === 'INJURY_SUB') badgeCls = 'badge-injury';
        else if (type === 'BYE_FILLER') badgeCls = 'badge-bye';
        else if (type === 'HANDCUFF') badgeCls = 'badge-handcuff';
        else if (type === 'EMPTY_SLOT') badgeCls = 'badge-empty';

        needHtml += `<span class="need-badge ${badgeCls}" title="${esc(need.tag || need.reason)}">${esc(need.icon || '🔥')} ${esc(need.tag || need.reason)} <small>(${esc(need.league_name)})</small></span>`;
      }

      // Note chip
      let noteHtml = '';
      if (note) {
        noteHtml = `<div class="watchlist-note-chip" onclick="global.openWaiverNoteModal('${escJs(name)}')" title="Click to edit note">📝 ${esc(note)}</div>`;
      }

      rowsHtml += `
        <tr class="waiver-row ${isPriority ? 'waiver-priority' : ''}">
          <td style="text-align:center">
            <button type="button" class="watchlist-star-btn ${isWatchlisted ? 'is-active' : ''}" onclick="global.toggleWaiverWatchlist('${escJs(name)}')" title="${isWatchlisted ? 'Remove from Watchlist' : 'Add to Watchlist'}">${isWatchlisted ? '★' : '☆'}</button>
          </td>
          <td class="num" style="color:var(--dim)">${idx + 1}</td>
          <td>
            <span class="player-name-link" onclick="global.openPlayerModal('${escJs(name)}')"><b>${esc(name)}</b></span>
            ${getInjuryBadge(p.injury)}
            ${noteHtml}
            ${needHtml ? `<div class="need-badges-wrap" style="margin-top:4px">${needHtml}</div>` : ''}
          </td>
          <td style="text-align:center"><span class="pos-tag pos-${esc(pos.toLowerCase())}">${esc(pos)}</span></td>
          <td style="text-align:center">
            <b>${esc(team || 'FA')}</b>
            ${item.bye != null ? `<div class="meta" style="font-size:10.5px">W${item.bye}</div>` : ''}
          </td>
          <td class="num">${esc(rank)}</td>
          <td class="num"><b style="font-size:14px">${esc(score)}</b></td>
          <td class="avail-col">${availHtml || '<span class="meta">All Rostered</span>'}</td>
          <td style="text-align:right">
            <button type="button" class="small" onclick="global.openWaiverNoteModal('${escJs(name)}')">📝 Note</button>
            <button type="button" class="small" onclick="global.openPlayerModal('${escJs(name)}')">📋 Dossier</button>
          </td>
        </tr>
      `;
    }

    const watchlistCount = Object.keys(watchlist).length;

    return `
      ${renderSubHeader()}
      <div class="waivers-container">
        <div class="waivers-header-bar">
          <div>
            <h2 style="margin:0">⚡ Cross-League Waiver Wire & Market Radar</h2>
            <div class="meta" style="margin-top:4px">${
              isDynastyFormat
                ? '👑 Showing free agents across connected Dynasty leagues (Redraft leagues excluded)'
                : '🔄 Showing free agents across connected Redraft leagues (Dynasty leagues excluded)'
            }</div>
          </div>
        </div>

        <div class="waivers-controls-bar">
          <div class="waivers-control-group">
            <label style="font-size:12px; font-weight:700; color:var(--text)">League:</label>
            <select id="waiver_league_filter" class="league-select" onchange="global.onWaiverLeagueFilter(this.value)">
              ${leagueOptionsHtml}
            </select>
          </div>

          <div class="waivers-control-group">
            <label style="font-size:12px; font-weight:700; color:var(--text)">Format:</label>
            ${formatPillsHtml}
          </div>

          <div class="waivers-control-group">
            <label style="font-size:12px; font-weight:700; color:var(--text)">Pos:</label>
            ${posPillsHtml}
          </div>

          <div class="waivers-control-group" style="gap:8px">
            <button type="button" class="waiver-toggle-btn ${wf.needsOnly ? 'active' : ''}" onclick="global.onWaiverNeedsToggle()" title="Show only players matching team needs">🔥 Needs Only</button>
            <button type="button" class="waiver-toggle-btn ${wf.watchlistOnly ? 'active' : ''}" onclick="global.onWaiverWatchlistToggle()" title="Show only watchlisted players">⭐ Watchlist (${watchlistCount})</button>
          </div>

          <div class="waivers-control-group" style="margin-left:auto">
            <input type="text" id="waiver_search_input" class="waiver-search-input" placeholder="Search free agents..." value="${esc(wf.search || '')}" oninput="global.onWaiverSearchInput(this.value)" />
          </div>
        </div>

        <div class="panel waivers-table-panel">
          <table class="waiver-table">
            <thead>
              <tr>
                <th style="width:36px; text-align:center">⭐</th>
                <th style="width:36px">#</th>
                <th>Player & Team Need Match</th>
                <th style="width:50px; text-align:center">Pos</th>
                <th style="width:55px; text-align:center">Team</th>
                <th class="num" style="width:65px">Format Rank</th>
                <th class="num" style="width:55px">Score</th>
                <th>Available In Leagues (Claim Links)</th>
                <th style="width:115px; text-align:right"></th>
              </tr>
            </thead>
            <tbody>${rowsHtml || '<tr><td colspan="9" style="text-align:center; padding:30px; color:var(--dim)">No waiver candidates match the current filters.</td></tr>'}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderPowerRankingsView() {
    const s = global.inSeasonState;
    const pr = s.powerRankings;
    if (!pr || !Array.isArray(pr.teams)) {
      return `
        ${renderSubHeader()}
        <div class="empty-state-panel">
          <h3>No Power Rankings Available</h3>
          <p>Connect a league with active rosters or seed demo data to evaluate league strength.</p>
          <button type="button" class="act primary" onclick="global.inSeasonManager.seedDemoData()">🌱 Seed Demo Leagues</button>
        </div>
      `;
    }

    let rowsHtml = '';
    for (const t of pr.teams) {
      const isMe = t.is_my_team;
      const tierColor = t.tier_color || 'accent';

      function renderRoomBadge(pos) {
        const room = t.room_grades?.[pos] || { grade: 'C', percentile: 50 };
        const grade = room.grade;
        let cls = 'grade-c';
        if (grade === 'A') cls = 'grade-a';
        else if (grade === 'B') cls = 'grade-b';
        else if (grade === 'D') cls = 'grade-d';
        return `<span class="room-pill ${cls}" title="${pos} Percentile: ${room.percentile}%">${pos}: ${grade}</span>`;
      }

      rowsHtml += `
        <tr class="pr-row ${isMe ? 'is-my-team-row' : ''}">
          <td class="num"><b>#${t.power_rank}</b></td>
          <td>
            <b>${esc(t.team_name)}</b> ${isMe ? '<span class="you-badge">YOU</span>' : ''}
            <div class="meta" style="font-size:11px">${esc(t.owner_name)}</div>
          </td>
          <td><span class="tier-badge tier-${tierColor}">${esc(t.tier)}</span></td>
          <td style="text-align:center"><b class="record-badge">${t.wins}-${t.losses}</b></td>
          <td class="num">${t.starter_score}</td>
          <td class="num">${t.depth_score}</td>
          <td class="num"><b style="font-size:15px; color:var(--text)">${t.composite_score}</b></td>
          <td class="rooms-col">
            <div class="room-pills-row">
              ${renderRoomBadge('QB')}
              ${renderRoomBadge('RB')}
              ${renderRoomBadge('WR')}
              ${renderRoomBadge('TE')}
            </div>
          </td>
        </tr>
      `;
    }

    // Trade Matchmaker panel
    let tradeMatchesHtml = '';
    if (Array.isArray(pr.trade_matches) && pr.trade_matches.length > 0) {
      tradeMatchesHtml = '<div class="trade-matchmaker-grid">';
      for (const m of pr.trade_matches) {
        tradeMatchesHtml += `
          <div class="trade-match-card">
            <div class="trade-match-header">
              <span class="trade-target-name">🤝 Trade Partner: <b>${esc(m.target_team_name)}</b></span>
              <span class="meta">${esc(m.target_owner)}</span>
            </div>
            <div class="trade-swap-row">
              <span class="give-tag">You Give: <b>${esc(m.my_give_pos)} Depth</b></span>
              <span class="swap-arrow">⇄</span>
              <span class="receive-tag">You Receive: <b>${esc(m.my_receive_pos)} Starter</b></span>
            </div>
            <p class="trade-rationale">${esc(m.rationale)}</p>
          </div>
        `;
      }
      tradeMatchesHtml += '</div>';
    } else {
      tradeMatchesHtml =
        '<div class="empty-state-card">Roster strengths are evenly distributed across current teams.</div>';
    }

    return `
      ${renderSubHeader()}
      <div class="pr-container">
        <div class="pr-header-bar">
          <div>
            <h2 style="margin:0">📈 League Power Rankings & Positional Heatmap</h2>
            <div class="meta" style="margin-top:4px">Evaluates starters, depth stability, and positional room percentiles across all ${pr.total_teams} teams.</div>
          </div>
        </div>

        <div class="panel pr-table-panel">
          <table class="pr-table">
            <thead>
              <tr>
                <th style="width:45px">Rank</th>
                <th>Team & Owner</th>
                <th style="width:110px">Tier</th>
                <th style="width:75px; text-align:center">Record</th>
                <th class="num" style="width:80px">Starters</th>
                <th class="num" style="width:75px">Depth</th>
                <th class="num" style="width:85px">Power</th>
                <th>Positional Grades (vs League Average)</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>

        <div class="trade-matchmaker-section" style="margin-top:20px">
          <h3>🤝 Automated Trade Matchmaker</h3>
          <p class="meta">Identifies win-win trade partners whose surplus matches your team's positional needs.</p>
          ${tradeMatchesHtml}
        </div>
      </div>
    `;
  }

  function renderManagerView() {
    const container = document.getElementById('manager_views_container');
    if (!container) return;

    const v = global.inSeasonState.currentView;
    if (v === 'team') {
      container.innerHTML = renderTeamView();
    } else if (v === 'leagues') {
      container.innerHTML = renderLeaguesView();
    } else if (v === 'news') {
      container.innerHTML = renderNewsView();
    } else if (v === 'waivers') {
      container.innerHTML = renderWaiversView();
    } else if (v === 'rankings') {
      container.innerHTML = renderPowerRankingsView();
    }
  }

  // Event handlers
  global.refreshActiveManagerView = async () => {
    const v = global.inSeasonState.currentView;
    const syncBtn = document.querySelector('.manager-sub-header .act.primary');
    const origText = syncBtn ? syncBtn.textContent : '';
    if (syncBtn) {
      syncBtn.disabled = true;
      syncBtn.textContent = '🔄 Syncing...';
    }

    try {
      if (global.inSeasonState.activeLeagueId) {
        const syncRes = await global.inSeasonManager.syncLeague(
          global.inSeasonState.activeLeagueId,
        );
        if (syncRes && !syncRes.ok && syncRes.error) {
          console.warn('[InSeasonManager] Active league sync warning:', syncRes.error);
        }
      }

      if (v === 'team') await global.inSeasonManager.fetchTeamView();
      else if (v === 'leagues') await global.inSeasonManager.fetchLeagues();
      else if (v === 'news')
        await global.inSeasonManager.fetchNews(global.inSeasonState.newsFilter);
      else if (v === 'waivers') await global.inSeasonManager.fetchWaivers();
      else if (v === 'rankings') await global.inSeasonManager.fetchPowerRankings();
    } finally {
      if (syncBtn) {
        syncBtn.disabled = false;
        syncBtn.textContent = origText;
      }
      renderManagerView();
    }
  };

  global.syncManagerLeague = async (leagueId, btn) => {
    if (!leagueId) return;
    const origText = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = '🔄 Syncing...';
    }
    try {
      const res = await global.inSeasonManager.syncLeague(leagueId);
      if (res?.ok) {
        await global.inSeasonManager.fetchLeagues();
        renderManagerView();
      } else {
        alert(`Sync failed: ${res?.error || 'Unable to sync league'}`);
      }
    } catch (err) {
      alert(`Sync error: ${err.message}`);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = origText;
      }
    }
  };

  global.setNewsFilter = async (filter) => {
    global.inSeasonState.newsFilter = filter;
    await global.inSeasonManager.fetchNews(filter);
    renderManagerView();
  };

  // ============================================================================
  // UNIFIED PLAYER DETAILS DOSSIER MODAL
  // ============================================================================

  function renderDossierOverviewTab(d) {
    const p = d.player;
    const m = d.next_matchup;
    const s = d.season_summary || {};

    let matchupHtml = '';
    if (m) {
      const oppStr = `${m.home_away === 'home' ? 'vs' : '@'} ${m.opponent}`;
      const defTierCls = `diff-${m.defensive_rank?.tier || 'neutral'}`;
      const oddsStr = [
        m.spread ? `Spread: <b>${esc(m.spread)}</b>` : null,
        m.over_under ? `O/U: <b>${esc(m.over_under)}</b>` : null,
      ]
        .filter(Boolean)
        .join(' · ');

      matchupHtml = `
        <div class="dossier-card matchup-card">
          <div class="card-header">
            <span class="card-title">🏈 Next Matchup: Week ${m.week} ${oppStr}</span>
            <span class="difficulty-tag ${defTierCls}">${esc(m.defensive_rank?.label || 'Matchup')}</span>
          </div>
          <div class="matchup-body-grid">
            <div class="matchup-stat">
              <span class="lbl">Date & Time</span>
              <b>${esc(m.game_date ? new Date(m.game_date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : m.status || 'Upcoming')} · ${esc(m.status || '')}</b>
            </div>
            <div class="matchup-stat">
              <span class="lbl">Venue & Surface</span>
              <b>${esc(m.venue || 'NFL Stadium')} (${esc(m.surface || 'Grass')})</b>
            </div>
            <div class="matchup-stat">
              <span class="lbl">Broadcast</span>
              <b>${esc(m.network || 'National / Local')}</b>
            </div>
            <div class="matchup-stat">
              <span class="lbl">Defensive Points Allowed</span>
              <b>${m.defensive_rank?.points_allowed_avg || 0.0} PPG to ${esc(p.pos)}</b>
            </div>
          </div>
          ${oddsStr ? `<div class="matchup-odds-bar">🎲 ${oddsStr}</div>` : ''}
        </div>
      `;
    } else {
      matchupHtml = `
        <div class="dossier-card" style="padding:16px; text-align:center">
          <span class="meta">No upcoming matchup scheduled or team on bye.</span>
        </div>
      `;
    }

    let keyStatsHtml = '';
    const posUpper = (p.pos || '').toUpperCase();
    if (posUpper === 'QB') {
      const compPct =
        s.pass_att_total > 0 ? Math.round((s.pass_cmp_total / s.pass_att_total) * 100) : 0;
      keyStatsHtml = `
        <div class="kpi-card"><span class="kpi-lbl">Passing Yards</span><span class="kpi-val">${s.pass_yd_total || 0}</span><span class="kpi-sub">${s.pass_td_total || 0} TDs · ${Math.round((s.pass_yd_total || 0) / Math.max(1, s.games_played || 1))} YPG</span></div>
        <div class="kpi-card"><span class="kpi-lbl">Completions</span><span class="kpi-val">${s.pass_cmp_total || 0}/${s.pass_att_total || 0}</span><span class="kpi-sub">${compPct}% Comp Pct</span></div>
        <div class="kpi-card"><span class="kpi-lbl">Rushing</span><span class="kpi-val">${s.rush_yd_total || 0} yds</span><span class="kpi-sub">${s.rush_att_total || 0} att · ${s.rush_td_total || 0} TDs</span></div>
        <div class="kpi-card"><span class="kpi-lbl">Fantasy Output</span><span class="kpi-val">${s.pts_ppr_avg || 0.0}</span><span class="kpi-sub">PPR PPG (${s.pts_ppr_total || 0.0} total)</span></div>
      `;
    } else if (posUpper === 'RB') {
      keyStatsHtml = `
        <div class="kpi-card"><span class="kpi-lbl">Rushing Yards</span><span class="kpi-val">${s.rush_yd_total || 0}</span><span class="kpi-sub">${s.rush_att_total || 0} carries · ${s.rush_td_total || 0} TDs</span></div>
        <div class="kpi-card"><span class="kpi-lbl">Receiving</span><span class="kpi-val">${s.rec_total || 0} rec</span><span class="kpi-sub">${s.rec_tgt_total || 0} tgts · ${s.rec_yd_total || 0} yds</span></div>
        <div class="kpi-card"><span class="kpi-lbl">Snap Share</span><span class="kpi-val">${s.avg_snap_pct || 0.0}%</span><span class="kpi-sub">${s.total_snaps || 0} total snaps</span></div>
        <div class="kpi-card"><span class="kpi-lbl">Fantasy Output</span><span class="kpi-val">${s.pts_ppr_avg || 0.0}</span><span class="kpi-sub">PPR PPG (${s.pts_ppr_total || 0.0} total)</span></div>
      `;
    } else {
      const catchPct = s.rec_tgt_total > 0 ? Math.round((s.rec_total / s.rec_tgt_total) * 100) : 0;
      keyStatsHtml = `
        <div class="kpi-card"><span class="kpi-lbl">Targets & Rec</span><span class="kpi-val">${s.rec_total || 0}/${s.rec_tgt_total || 0}</span><span class="kpi-sub">${catchPct}% Catch Rate</span></div>
        <div class="kpi-card"><span class="kpi-lbl">Receiving Yards</span><span class="kpi-val">${s.rec_yd_total || 0}</span><span class="kpi-sub">${s.rec_td_total || 0} TDs · ${Math.round((s.rec_yd_total || 0) / Math.max(1, s.games_played || 1))} YPG</span></div>
        <div class="kpi-card"><span class="kpi-lbl">Air Yards & YAC</span><span class="kpi-val">${s.rec_air_yd_total || 0}</span><span class="kpi-sub">${s.rec_yac_total || 0} YAC</span></div>
        <div class="kpi-card"><span class="kpi-lbl">Fantasy Output</span><span class="kpi-val">${s.pts_ppr_avg || 0.0}</span><span class="kpi-sub">PPR PPG (${s.pts_ppr_total || 0.0} total)</span></div>
      `;
    }

    const rostered = d.portfolio?.rostered || [];
    const waivers = d.portfolio?.waivers || [];
    const portfolioSummary = `
      <div class="dossier-card">
        <div class="card-header"><span class="card-title">🌐 Portfolio Quick Status</span></div>
        <div style="display:flex; gap:16px; flex-wrap:wrap; font-size:13px">
          <div>🏆 Rostered in: <b>${rostered.length} league${rostered.length === 1 ? '' : 's'}</b> ${rostered.map((r) => `<span class="portfolio-pill owned">${esc(r.league_name)} (${esc(r.slot)})</span>`).join(' ')}</div>
          <div>⚡ Available on Waivers: <b>${waivers.length} league${waivers.length === 1 ? '' : 's'}</b> ${waivers
            .slice(0, 3)
            .map((w) => `<span class="portfolio-pill avail">${esc(w.league_name)}</span>`)
            .join(
              ' ',
            )}${waivers.length > 3 ? `<span class="meta">+${waivers.length - 3} more</span>` : ''}</div>
        </div>
      </div>
    `;

    return `
      ${matchupHtml}
      <div class="dossier-kpi-grid">
        ${keyStatsHtml}
      </div>
      ${
        d.depth_chart?.handcuff_note
          ? `
        <div class="dossier-card handcuff-box">
          <b>💡 Role & Depth Chart Analysis:</b> ${esc(d.depth_chart.handcuff_note)}
        </div>
      `
          : ''
      }
      ${portfolioSummary}
    `;
  }

  function renderDossierLogsTab(d) {
    const p = d.player;
    const logs = d.game_logs || [];
    const s = d.season_summary || {};
    const posUpper = (p.pos || '').toUpperCase();

    if (logs.length === 0) {
      return '<p class="meta" style="padding:20px; text-align:center">No 2026 game logs recorded yet for this player.</p>';
    }

    let tableHeader = '';
    if (posUpper === 'QB') {
      tableHeader = `
        <tr>
          <th>Wk</th>
          <th>Opp</th>
          <th>Result</th>
          <th class="num">Snaps</th>
          <th class="num">Snap %</th>
          <th class="num">Cmp/Att</th>
          <th class="num">Pass Yds</th>
          <th class="num">Pass TD</th>
          <th class="num">INT</th>
          <th class="num">Rating</th>
          <th class="num">Rush Yds</th>
          <th class="num">Rush TD</th>
          <th class="num">PPR Pts</th>
          <th class="num">Rank</th>
        </tr>
      `;
    } else if (posUpper === 'RB') {
      tableHeader = `
        <tr>
          <th>Wk</th>
          <th>Opp</th>
          <th>Result</th>
          <th class="num">Snaps</th>
          <th class="num">Snap %</th>
          <th class="num">Carries</th>
          <th class="num">Rush Yds</th>
          <th class="num">Rush TD</th>
          <th class="num">Targets</th>
          <th class="num">Rec</th>
          <th class="num">Rec Yds</th>
          <th class="num">Rec TD</th>
          <th class="num">PPR Pts</th>
          <th class="num">Rank</th>
        </tr>
      `;
    } else {
      tableHeader = `
        <tr>
          <th>Wk</th>
          <th>Opp</th>
          <th>Result</th>
          <th class="num">Snaps</th>
          <th class="num">Snap %</th>
          <th class="num">Tgts</th>
          <th class="num">Rec</th>
          <th class="num">Rec Yds</th>
          <th class="num">TD</th>
          <th class="num">Air Yds</th>
          <th class="num">YAC</th>
          <th class="num">PPR Pts</th>
          <th class="num">Rank</th>
        </tr>
      `;
    }

    let rowsHtml = '';
    for (const g of logs) {
      const oppStr = `${g.home_away === 'home' ? 'vs' : '@'} ${g.opp || '—'}`;
      const stats = g.stats || {};
      const pRankStr = g.pos_rank != null ? `#${g.pos_rank}` : '—';

      if (posUpper === 'QB') {
        rowsHtml += `
          <tr>
            <td><b>W${g.week}</b></td>
            <td>${esc(oppStr)}</td>
            <td><span class="game-res-${(g.game_result || '')[0] || 't'}">${esc(g.game_result || '—')}</span></td>
            <td class="num">${g.snaps}</td>
            <td class="num"><b>${g.snap_pct}%</b></td>
            <td class="num">${stats.pass_cmp || 0}/${stats.pass_att || 0}</td>
            <td class="num"><b>${stats.pass_yd || 0}</b></td>
            <td class="num">${stats.pass_td || 0}</td>
            <td class="num">${stats.pass_int || 0}</td>
            <td class="num">${stats.pass_rtg != null ? Math.round(stats.pass_rtg) : '—'}</td>
            <td class="num">${stats.rush_yd || 0}</td>
            <td class="num">${stats.rush_td || 0}</td>
            <td class="num"><b style="color:var(--good)">${g.fantasy_pts_ppr}</b></td>
            <td class="num">${esc(pRankStr)}</td>
          </tr>
        `;
      } else if (posUpper === 'RB') {
        rowsHtml += `
          <tr>
            <td><b>W${g.week}</b></td>
            <td>${esc(oppStr)}</td>
            <td><span class="game-res-${(g.game_result || '')[0] || 't'}">${esc(g.game_result || '—')}</span></td>
            <td class="num">${g.snaps}</td>
            <td class="num"><b>${g.snap_pct}%</b></td>
            <td class="num"><b>${stats.rush_att || 0}</b></td>
            <td class="num">${stats.rush_yd || 0}</td>
            <td class="num">${stats.rush_td || 0}</td>
            <td class="num">${stats.rec_tgt || 0}</td>
            <td class="num">${stats.rec || 0}</td>
            <td class="num">${stats.rec_yd || 0}</td>
            <td class="num">${stats.rec_td || 0}</td>
            <td class="num"><b style="color:var(--good)">${g.fantasy_pts_ppr}</b></td>
            <td class="num">${esc(pRankStr)}</td>
          </tr>
        `;
      } else {
        rowsHtml += `
          <tr>
            <td><b>W${g.week}</b></td>
            <td>${esc(oppStr)}</td>
            <td><span class="game-res-${(g.game_result || '')[0] || 't'}">${esc(g.game_result || '—')}</span></td>
            <td class="num">${g.snaps}</td>
            <td class="num"><b>${g.snap_pct}%</b></td>
            <td class="num"><b>${stats.rec_tgt || 0}</b></td>
            <td class="num">${stats.rec || 0}</td>
            <td class="num"><b>${stats.rec_yd || 0}</b></td>
            <td class="num">${stats.rec_td || 0}</td>
            <td class="num">${stats.rec_air_yd || 0}</td>
            <td class="num">${stats.rec_yar || 0}</td>
            <td class="num"><b style="color:var(--good)">${g.fantasy_pts_ppr}</b></td>
            <td class="num">${esc(pRankStr)}</td>
          </tr>
        `;
      }
    }

    let footerHtml = '';
    if (posUpper === 'QB') {
      footerHtml = `
        <tr class="table-totals-row">
          <td colspan="3"><b>Season Totals (${s.games_played || logs.length} Gms)</b></td>
          <td class="num"><b>${s.total_snaps || 0}</b></td>
          <td class="num"><b>${s.avg_snap_pct || 0}% avg</b></td>
          <td class="num"><b>${s.pass_cmp_total || 0}/${s.pass_att_total || 0}</b></td>
          <td class="num"><b>${s.pass_yd_total || 0}</b></td>
          <td class="num"><b>${s.pass_td_total || 0}</b></td>
          <td class="num">—</td>
          <td class="num">—</td>
          <td class="num"><b>${s.rush_yd_total || 0}</b></td>
          <td class="num"><b>${s.rush_td_total || 0}</b></td>
          <td class="num"><b style="color:var(--good)">${s.pts_ppr_total || 0}</b></td>
          <td class="num">—</td>
        </tr>
      `;
    } else if (posUpper === 'RB') {
      footerHtml = `
        <tr class="table-totals-row">
          <td colspan="3"><b>Season Totals (${s.games_played || logs.length} Gms)</b></td>
          <td class="num"><b>${s.total_snaps || 0}</b></td>
          <td class="num"><b>${s.avg_snap_pct || 0}% avg</b></td>
          <td class="num"><b>${s.rush_att_total || 0}</b></td>
          <td class="num"><b>${s.rush_yd_total || 0}</b></td>
          <td class="num"><b>${s.rush_td_total || 0}</b></td>
          <td class="num"><b>${s.rec_tgt_total || 0}</b></td>
          <td class="num"><b>${s.rec_total || 0}</b></td>
          <td class="num"><b>${s.rec_yd_total || 0}</b></td>
          <td class="num"><b>${s.rec_td_total || 0}</b></td>
          <td class="num"><b style="color:var(--good)">${s.pts_ppr_total || 0}</b></td>
          <td class="num">—</td>
        </tr>
      `;
    } else {
      footerHtml = `
        <tr class="table-totals-row">
          <td colspan="3"><b>Season Totals (${s.games_played || logs.length} Gms)</b></td>
          <td class="num"><b>${s.total_snaps || 0}</b></td>
          <td class="num"><b>${s.avg_snap_pct || 0}% avg</b></td>
          <td class="num"><b>${s.rec_tgt_total || 0}</b></td>
          <td class="num"><b>${s.rec_total || 0}</b></td>
          <td class="num"><b>${s.rec_yd_total || 0}</b></td>
          <td class="num"><b>${s.rec_td_total || 0}</b></td>
          <td class="num"><b>${s.rec_air_yd_total || 0}</b></td>
          <td class="num"><b>${s.rec_yac_total || 0}</b></td>
          <td class="num"><b style="color:var(--good)">${s.pts_ppr_total || 0}</b></td>
          <td class="num">—</td>
        </tr>
      `;
    }

    return `
      <div class="dossier-table-wrap">
        <table class="dossier-table">
          <thead>${tableHeader}</thead>
          <tbody>${rowsHtml}</tbody>
          <tfoot>${footerHtml}</tfoot>
        </table>
      </div>
    `;
  }

  function renderDossierDepthTab(d) {
    const depth = d.depth_chart || {};
    const players = depth.players || [];
    const team = depth.team || 'FA';
    const pos = depth.pos || 'FLEX';

    let listHtml = '';
    for (const pl of players) {
      const isMe = pl.rank === depth.my_rank && pl.name === d.player.name;
      const injHtml = pl.injury ? getInjuryBadge({ status: pl.injury }) : '';
      listHtml += `
        <div class="depth-player-card ${isMe ? 'is-target-player' : ''}">
          <span class="depth-badge ${pl.rank === 1 ? 'rank-1' : ''}">#${pl.rank}</span>
          <div class="depth-info">
            <div class="depth-name-row">
              <span class="player-name-link" onclick="global.openPlayerModal('${escJs(pl.name)}')"><b>${esc(pl.name)}</b></span>
              ${injHtml}
              ${isMe ? '<span class="target-tag">Current Player</span>' : ''}
            </div>
            <div class="depth-meta">
              ${esc(pl.role || 'Depth')} · ${pl.snaps || 0} snaps (${pl.snap_pct || 0}% share)
            </div>
          </div>
          <button type="button" class="small" onclick="global.openPlayerModal('${escJs(pl.name)}')">View</button>
        </div>
      `;
    }

    return `
      <div class="dossier-card">
        <div class="card-header">
          <span class="card-title">🏈 ${esc(team)} Official ${esc(pos)} Depth Chart</span>
        </div>
        <div class="depth-players-list">
          ${listHtml || '<p class="meta">No depth chart information available for this team room.</p>'}
        </div>
      </div>
      ${
        depth.handcuff_note
          ? `
        <div class="dossier-card handcuff-box" style="margin-top:14px">
          <b>💡 Handcuff & Contingency Note:</b> ${esc(depth.handcuff_note)}
        </div>
      `
          : ''
      }
    `;
  }

  function renderDossierScheduleTab(d) {
    const sched = d.schedule || [];
    if (sched.length === 0) {
      return '<p class="meta" style="padding:20px; text-align:center">No 18-week schedule data loaded.</p>';
    }

    let cardsHtml = '';
    for (const g of sched) {
      const isBye = g.opponent === 'BYE';
      const isFinal = Boolean(g.is_final);
      const oppStr = isBye ? 'BYE WEEK' : `${g.home_away === 'home' ? 'vs' : '@'} ${g.opponent}`;

      let statusLine = '';
      if (isBye) {
        statusLine = '<span class="status-bye">Open Week</span>';
      } else if (isFinal) {
        const resChar = (g.result || '')[0];
        statusLine = `<span class="game-res-${resChar || 't'}"><b>${esc(g.result || 'Final')}</b></span>`;
      } else {
        statusLine = `<span class="status-upcoming">${esc(g.status || 'Upcoming')}</span>`;
      }

      cardsHtml += `
        <div class="schedule-grid-item ${isBye ? 'sched-bye' : ''} ${isFinal ? 'sched-final' : ''}">
          <div class="sched-wk">W${g.week}</div>
          <div class="sched-opp">${esc(oppStr)}</div>
          <div class="sched-status">${statusLine}</div>
          ${g.spread ? `<div class="sched-odds">${esc(g.spread)}</div>` : ''}
        </div>
      `;
    }

    return `
      <div class="dossier-card">
        <div class="card-header"><span class="card-title">🗓️ 2026 Regular Season Schedule (18 Weeks)</span></div>
        <div class="schedule-grid">
          ${cardsHtml}
        </div>
      </div>
    `;
  }

  function renderDossierPortfolioTab(d) {
    const port = d.portfolio || {};
    const rostered = port.rostered || [];
    const waivers = port.waivers || [];
    const opponents = port.opponent_owned || [];

    let rosteredHtml = '';
    if (rostered.length > 0) {
      rosteredHtml = `
        <table class="dossier-table" style="margin-top:8px">
          <thead><tr><th>League</th><th>Platform</th><th>Format</th><th>Slot</th><th>Record</th></tr></thead>
          <tbody>
            ${rostered
              .map(
                (r) => `
              <tr>
                <td><b>${esc(r.league_name)}</b></td>
                <td><span class="platform-badge ${esc(r.platform)}">${esc(r.platform.toUpperCase())}</span></td>
                <td><span class="format-badge">${esc(r.format)}</span></td>
                <td><span class="slot-badge">${esc(r.slot)}</span></td>
                <td class="num">${esc(r.record)}</td>
              </tr>
            `,
              )
              .join('')}
          </tbody>
        </table>
      `;
    } else {
      rosteredHtml =
        '<p class="meta" style="padding:10px 0">Not currently rostered on any of your fantasy squads.</p>';
    }

    let waiversHtml = '';
    if (waivers.length > 0) {
      waiversHtml = `
        <table class="dossier-table" style="margin-top:8px">
          <thead><tr><th>League</th><th>Platform</th><th>Format</th><th>Status</th></tr></thead>
          <tbody>
            ${waivers
              .map(
                (w) => `
              <tr>
                <td><b>${esc(w.league_name)}</b></td>
                <td><span class="platform-badge ${esc(w.platform)}">${esc(w.platform.toUpperCase())}</span></td>
                <td><span class="format-badge">${esc(w.format)}</span></td>
                <td><span class="portfolio-pill avail">⚡ Free Agent</span></td>
              </tr>
            `,
              )
              .join('')}
          </tbody>
        </table>
      `;
    } else {
      waiversHtml =
        '<p class="meta" style="padding:10px 0">Not available on waivers in any leagues (all rostered).</p>';
    }

    let opponentHtml = '';
    if (opponents.length > 0) {
      opponentHtml = `
        <table class="dossier-table" style="margin-top:8px">
          <thead><tr><th>League</th><th>Platform</th><th>Format</th><th>Manager / Owner</th><th>Team</th></tr></thead>
          <tbody>
            ${opponents
              .map(
                (o) => `
              <tr>
                <td><b>${esc(o.league_name)}</b></td>
                <td><span class="platform-badge ${esc(o.platform)}">${esc(o.platform.toUpperCase())}</span></td>
                <td><span class="format-badge">${esc(o.format)}</span></td>
                <td><b>${esc(o.owner || 'Opponent')}</b></td>
                <td>${esc(o.team_name || '—')}</td>
              </tr>
            `,
              )
              .join('')}
          </tbody>
        </table>
      `;
    } else {
      opponentHtml =
        '<p class="meta" style="padding:10px 0">No opponents roster this player across your synced leagues.</p>';
    }

    return `
      <div class="dossier-card">
        <div class="card-header"><span class="card-title">🏆 Rostered on My Teams (${rostered.length})</span></div>
        ${rosteredHtml}
      </div>

      <div class="dossier-card" style="margin-top:14px">
        <div class="card-header"><span class="card-title">⚡ Available on Free Agency & Waivers (${waivers.length})</span></div>
        ${waiversHtml}
      </div>

      <div class="dossier-card" style="margin-top:14px">
        <div class="card-header"><span class="card-title">🛡️ Opponent Rostered (${opponents.length})</span></div>
        ${opponentHtml}
      </div>
    `;
  }

  function renderDossierNewsTab(d) {
    const news = d.news || [];
    const links = d.links || {};

    let newsHtml = '';
    if (news.length > 0) {
      for (const n of news) {
        newsHtml += `
          <div class="player-news-item">
            <div class="news-item-time">${esc(new Date(n.timestamp).toLocaleDateString())} · <b>${esc(n.source)}</b></div>
            <div class="news-item-headline"><b>${esc(n.headline)}</b></div>
            <div class="news-item-body">${esc(n.body)}</div>
          </div>
        `;
      }
    } else {
      newsHtml =
        '<p class="meta" style="padding:12px 0">No recent news reports filed for this player in the local database.</p>';
    }

    return `
      <div class="dossier-card">
        <div class="card-header"><span class="card-title">🔗 External Profiles & Research Links</span></div>
        <div class="links" style="margin-top:8px; display:flex; gap:10px; flex-wrap:wrap">
          <a target="_blank" href="${esc(links.espn)}">🏈 ESPN Player Profile</a>
          <a target="_blank" href="${esc(links.sleeper)}">⚡ Sleeper Profile</a>
          <a target="_blank" href="${esc(links.fantasypros)}">📊 FantasyPros Profile</a>
          <a target="_blank" href="${esc(links.pfr)}">📖 Pro-Football-Reference</a>
          <a target="_blank" href="${esc(links.news)}">🔎 Google News Search</a>
        </div>
      </div>

      <div class="dossier-card" style="margin-top:14px">
        <div class="card-header"><span class="card-title">📰 Verified News Reports (${news.length})</span></div>
        <div style="max-height:50vh; overflow-y:auto; padding:10px 0">
          ${newsHtml}
        </div>
      </div>
    `;
  }

  function renderPlayerDossierModal() {
    const modal = document.getElementById('playerModalbox');
    const overlay = document.getElementById('playerOverlay');
    if (!modal || !overlay) return;

    const d = global.inSeasonState.activePlayerDetails;
    if (!d?.player) return;

    const p = d.player;
    const activeTab = global.inSeasonState.activePlayerModalTab || 'overview';

    const normName = normalizePlayerName(p.name);
    const isWatchlisted = Boolean(
      p.is_watchlisted || global.inSeasonState.watchlist[normName] !== undefined,
    );

    const posClass = ['qb', 'rb', 'wr', 'te', 'dst', 'k'].includes(p.pos.toLowerCase())
      ? p.pos.toLowerCase()
      : 'flex';

    let headerInj = '';
    if (p.injury) {
      const injText =
        typeof p.injury === 'object' ? p.injury.status || p.injury.code : String(p.injury);
      if (injText) {
        headerInj = `<span class="injury-badge injury-badge-${injText.toLowerCase()}">${esc(injText)}</span>`;
      }
    }

    const rankBadges = [];
    if (p.ranks?.dynSF)
      rankBadges.push(`<span class="dossier-pill">Dyn SF <b>#${p.ranks.dynSF}</b></span>`);
    if (p.ranks?.dyn1QB)
      rankBadges.push(`<span class="dossier-pill">Dyn 1QB <b>#${p.ranks.dyn1QB}</b></span>`);
    if (p.ranks?.red_ppr)
      rankBadges.push(`<span class="dossier-pill">Redraft PPR <b>#${p.ranks.red_ppr}</b></span>`);
    if (p.ranks?.red_half)
      rankBadges.push(`<span class="dossier-pill">Half PPR <b>#${p.ranks.red_half}</b></span>`);
    if (p.ranks?.red_std)
      rankBadges.push(`<span class="dossier-pill">Standard <b>#${p.ranks.red_std}</b></span>`);
    if (p.ranks?.boris)
      rankBadges.push(`<span class="dossier-pill">Boris <b>${p.ranks.boris}</b></span>`);

    const subInfo = [
      p.team && p.team !== 'FA' ? `<b>${esc(p.team)}</b>` : 'Free Agent',
      p.bye ? `Bye Wk ${p.bye}` : null,
      p.age ? `${p.age} yrs old` : null,
      p.exp != null ? (p.exp === 0 ? 'Rookie' : `${p.exp} yrs exp`) : p.rookie ? 'Rookie' : null,
      p.college ? esc(p.college) : null,
    ]
      .filter(Boolean)
      .join(' · ');

    const headshotHtml = p.headshot_url
      ? `<img src="${esc(p.headshot_url)}" class="dossier-avatar" onerror="this.style.display='none'; if (this.nextElementSibling) this.nextElementSibling.style.display='flex';" alt="${esc(p.name)}" /><div class="dossier-avatar-placeholder" style="display:none">${esc(p.pos)}</div>`
      : `<div class="dossier-avatar-placeholder">${esc(p.pos)}</div>`;

    const logsCount = d.game_logs?.length || 0;
    const rosteredCount = d.portfolio?.rostered?.length || 0;
    const newsCount = d.news?.length || 0;

    const tabNavHtml = `
      <div class="dossier-nav-tabs">
        <button type="button" class="dossier-tab-btn ${activeTab === 'overview' ? 'active' : ''}" onclick="global.setPlayerModalTab('overview')">
          📊 Overview & Matchup
        </button>
        <button type="button" class="dossier-tab-btn ${activeTab === 'logs' ? 'active' : ''}" onclick="global.setPlayerModalTab('logs')">
          📈 2026 Game Logs (${logsCount})
        </button>
        <button type="button" class="dossier-tab-btn ${activeTab === 'depth' ? 'active' : ''}" onclick="global.setPlayerModalTab('depth')">
          📋 Depth Chart & Room
        </button>
        <button type="button" class="dossier-tab-btn ${activeTab === 'schedule' ? 'active' : ''}" onclick="global.setPlayerModalTab('schedule')">
          🗓️ Full Schedule
        </button>
        <button type="button" class="dossier-tab-btn ${activeTab === 'portfolio' ? 'active' : ''}" onclick="global.setPlayerModalTab('portfolio')">
          🌐 My Leagues (${rosteredCount} owned)
        </button>
        <button type="button" class="dossier-tab-btn ${activeTab === 'news' ? 'active' : ''}" onclick="global.setPlayerModalTab('news')">
          📰 News & Links (${newsCount})
        </button>
      </div>
    `;

    let contentHtml = '';
    if (activeTab === 'overview') {
      contentHtml = renderDossierOverviewTab(d);
    } else if (activeTab === 'logs') {
      contentHtml = renderDossierLogsTab(d);
    } else if (activeTab === 'depth') {
      contentHtml = renderDossierDepthTab(d);
    } else if (activeTab === 'schedule') {
      contentHtml = renderDossierScheduleTab(d);
    } else if (activeTab === 'portfolio') {
      contentHtml = renderDossierPortfolioTab(d);
    } else if (activeTab === 'news') {
      contentHtml = renderDossierNewsTab(d);
    }

    modal.className = 'modal player-dossier-modal';
    modal.innerHTML = `
      <div class="dossier-header">
        <div class="dossier-header-main">
          ${headshotHtml}
          <div class="dossier-title-col">
            <div class="dossier-name-row">
              <span class="pos-tag pos-${posClass}">${esc(p.pos)}</span>
              <span class="dossier-player-name">${esc(p.name)}</span>
              ${headerInj}
            </div>
            <div class="dossier-meta-row">${subInfo}</div>
            <div class="dossier-ranks-row">${rankBadges.join('')}</div>
          </div>
        </div>
        <div class="dossier-actions-col">
          <button type="button" class="act small ${isWatchlisted ? 'primary' : ''}" onclick="global.toggleDossierWatchlist('${escJs(p.name)}')" title="Toggle Watchlist">
            ${isWatchlisted ? '★ Watchlisted' : '☆ Add to Watchlist'}
          </button>
          <button type="button" class="act small" onclick="global.openWaiverNoteModal('${escJs(p.name)}')" title="Edit Scouting Note">
            📝 Notes
          </button>
          <button class="close dossier-close-btn" onclick="global.closePlayerModal()">×</button>
        </div>
      </div>
      ${tabNavHtml}
      <div class="dossier-body">
        ${contentHtml}
      </div>
    `;
  }

  global.openPlayerModal = async (playerName, initialTab = 'overview') => {
    const modal = document.getElementById('playerModalbox');
    const overlay = document.getElementById('playerOverlay');
    if (!modal || !overlay) return;

    modal.className = 'modal player-dossier-modal';
    modal.innerHTML = `
      <div class="dossier-loading">
        <div class="dossier-spinner"></div>
        <div>Loading intelligence dossier for <b>${esc(playerName)}</b>...</div>
      </div>
    `;
    overlay.style.display = 'flex';
    overlay.classList.add('show');

    const details = await global.inSeasonManager.fetchPlayerDetails(playerName);
    if (!details?.player) {
      modal.innerHTML = `
        <div class="dossier-header">
          <h3>🏈 ${esc(playerName)}</h3>
          <button class="close" onclick="global.closePlayerModal()">×</button>
        </div>
        <div style="padding:20px">
          <p class="meta">No extended dossier data found for this player.</p>
          <div class="links" style="margin-top:10px">
            <a target="_blank" href="https://news.google.com/search?q=${encodeURIComponent(playerName)}+fantasy">🔎 Google News</a>
            <a target="_blank" href="https://www.espn.com/search/_/q/${encodeURIComponent(playerName)}">ESPN</a>
          </div>
        </div>
      `;
      return;
    }

    global.inSeasonState.activePlayerDetails = details;
    global.inSeasonState.activePlayerModalTab = initialTab || 'overview';
    renderPlayerDossierModal();
  };

  global.closePlayerModal = () => {
    const overlay = document.getElementById('playerOverlay');
    if (overlay) {
      overlay.style.display = 'none';
      overlay.classList.remove('show');
    }
  };

  global.setPlayerModalTab = (tabKey) => {
    global.inSeasonState.activePlayerModalTab = tabKey;
    renderPlayerDossierModal();
  };

  global.toggleDossierWatchlist = async (playerName) => {
    await global.toggleWatchlist(playerName);
    const normKey = normalizePlayerName(playerName);
    const isNow = Boolean(global.inSeasonState.watchlist[normKey] !== undefined);
    if (global.inSeasonState.activePlayerDetails?.player) {
      global.inSeasonState.activePlayerDetails.player.is_watchlisted = isNow;
    }
    renderPlayerDossierModal();
  };

  global.openPlayerNewsModal = (playerName) => {
    return global.openPlayerModal(playerName, 'news');
  };

  global.deleteManagerLeague = async (leagueId) => {
    if (!confirm('Are you sure you want to remove this league and its cached rosters?')) return;
    const res = await fetch('/api/manager/leagues/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: leagueId }),
    });
    if (res.ok) {
      await global.inSeasonManager.fetchLeagues();
      if (global.inSeasonState.activeLeagueId === leagueId) {
        global.inSeasonState.activeLeagueId = global.inSeasonState.leagues[0]?.id || null;
      }
      renderManagerView();
    }
  };

  global.discoverSleeperLeagues = async () => {
    const input = document.getElementById('sleeper_import_username');
    const container = document.getElementById('sleeper_discovered_container');
    if (!input || !container) return;
    const username = input.value.trim();
    if (!username) return alert('Please enter a Sleeper username');

    container.innerHTML = '<p class="meta">Searching Sleeper...</p>';
    try {
      const res = await fetch('/api/manager/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discover: true, username: username }),
      });
      const data = await res.json();
      if (data.ok && Array.isArray(data.leagues)) {
        if (data.leagues.length === 0) {
          container.innerHTML = '<p class="meta">No active NFL leagues found for this user.</p>';
          return;
        }
        let listHtml = '<div class="discovered-leagues-list">';
        for (const lg of data.leagues) {
          listHtml += `
            <div class="discovered-league-row">
              <div>
                <b>${esc(lg.name)}</b>
                <div class="meta">${esc(lg.teams)} Teams · ${esc(lg.season)}</div>
              </div>
              <button type="button" class="act primary small" onclick="global.importDiscoveredSleeperLeague('${esc(lg.remote_id)}', '${esc(username)}', this)">Import</button>
            </div>
          `;
        }
        listHtml += '</div>';
        container.innerHTML = listHtml;
      } else {
        container.innerHTML = `<p class="meta" style="color:var(--bad)">Error: ${esc(data.error || 'User not found')}</p>`;
      }
    } catch (err) {
      container.innerHTML = `<p class="meta" style="color:var(--bad)">Network error: ${esc(err.message)}</p>`;
    }
  };

  global.importDiscoveredSleeperLeague = async (remoteId, username, btn) => {
    const origText = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Importing...';
    }
    try {
      const res = await fetch('/api/manager/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: 'sleeper',
          remote_league_id: remoteId,
          username: username,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        alert(`Imported ${data.name}!`);
        await global.inSeasonManager.fetchLeagues();
        global.inSeasonManager.selectLeague(data.league_id);
        global.inSeasonManager.setView('team');
      } else {
        alert(`Import failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      alert(`Import error: ${err.message}`);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = origText;
      }
    }
  };

  global.syncDirectSleeperLeague = async (btn) => {
    const input = document.getElementById('sleeper_import_league_id');
    const rawVal = input ? input.value.trim() : '';
    if (!rawVal) return alert('Please enter a Sleeper League ID or URL');

    const origText = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⚡ Syncing...';
    }
    try {
      const res = await fetch('/api/manager/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'sleeper', remote_league_id: rawVal }),
      });
      const data = await res.json();
      if (data?.ok) {
        alert(`Synced ${data.name || 'Sleeper League'}!`);
        await global.inSeasonManager.fetchLeagues();
        global.inSeasonManager.selectLeague(data.league_id);
        global.inSeasonManager.setView('team');
      } else {
        alert(`Sync failed: ${data?.error || 'Unknown error'}`);
      }
    } catch (err) {
      alert(`Sync error: ${err.message}`);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = origText;
      }
    }
  };

  global.syncEspnLeague = async (btn) => {
    const input = document.getElementById('espn_import_league_id');
    const lid = input ? input.value.trim() : '';
    if (!lid) return alert('Please enter an ESPN League ID or URL');

    const swidInput = document.getElementById('espn_import_swid');
    const s2Input = document.getElementById('espn_import_s2');
    const swid = swidInput ? swidInput.value.trim() : '';
    const espnS2 = s2Input ? s2Input.value.trim() : '';

    const defSeason =
      typeof global.getDefaultSeason === 'function'
        ? global.getDefaultSeason()
        : new Date().getMonth() === 0
          ? String(new Date().getFullYear() - 1)
          : String(new Date().getFullYear());

    const origText = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⚡ Syncing...';
    }

    try {
      const res = await fetch('/api/manager/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: 'espn',
          remote_league_id: lid,
          season: defSeason,
          espn_swid: swid,
          espn_s2: espnS2,
        }),
      });
      const data = await res.json();
      if (data?.ok) {
        alert(`Synced ${data.name || 'ESPN League'}!`);
        await global.inSeasonManager.fetchLeagues();
        await global.inSeasonManager.selectLeague(data.league_id);
        await global.inSeasonManager.setView('team');
      } else {
        alert(`Sync failed: ${data?.error || 'Unknown error'}`);
      }
    } catch (err) {
      alert(`Sync error: ${err.message}`);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = origText;
      }
    }
  };

  global.pullAllDraftLeagues = async (btn) => {
    const origText = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Pulling Leagues...';
    }
    try {
      if (typeof global.inSeasonManager?.pullDraftLeagues === 'function') {
        const res = await global.inSeasonManager.pullDraftLeagues();
        if (res?.ok) {
          alert(`✅ Successfully pulled ${res.count || 'all'} leagues into In-Season Manager!`);
          await global.inSeasonManager.fetchLeagues();
          renderManagerView();
        } else {
          alert(`Failed to pull leagues: ${res?.error || 'Unknown error'}`);
        }
      }
    } catch (err) {
      alert(`Pull error: ${err.message}`);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = origText;
      }
    }
  };

  global.pullSingleDraftLeague = async (leagueId, btn) => {
    const origText = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Pulling...';
    }
    try {
      if (typeof global.inSeasonManager?.pullDraftLeagues === 'function') {
        const res = await global.inSeasonManager.pullDraftLeagues([leagueId]);
        if (res?.ok) {
          alert('✅ League successfully pulled into In-Season Manager!');
          await global.inSeasonManager.fetchLeagues();
          renderManagerView();
        } else {
          alert(`Failed to pull league: ${res?.error || 'Unknown error'}`);
        }
      }
    } catch (err) {
      alert(`Pull error: ${err.message}`);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = origText;
      }
    }
  };

  global.syncDraftBoardRoster = async (leagueId, btn) => {
    const origText = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Syncing...';
    }
    try {
      let st = null;
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(`fantasy_drafter_league_${leagueId}`);
        if (raw) st = JSON.parse(raw);
      }
      if (leagueId === global.state?.activeLeagueId || (!st && global.state)) {
        st = global.state;
      }
      const res = await fetch('/api/manager/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          league_id: leagueId,
          platform: 'manual',
          draft_state: st || {},
        }),
      });
      const data = await res.json();
      if (data?.ok) {
        alert('✅ Roster snapshot re-synced from Draft Board!');
        await global.inSeasonManager.fetchLeagues();
        if (global.inSeasonState?.activeLeagueId === leagueId) {
          await global.inSeasonManager.fetchTeamView(leagueId);
        }
        renderManagerView();
      } else {
        alert(`Sync failed: ${data?.error || 'Unknown error'}`);
      }
    } catch (err) {
      alert(`Sync error: ${err.message}`);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = origText;
      }
    }
  };

  global.openLeagueSetupForManager = (inSeasonLeagueId) => {
    const targetId = inSeasonLeagueId || global.inSeasonState?.activeLeagueId;
    const inSeasonLeague = (global.inSeasonState?.leagues || []).find((l) => l.id === targetId);

    // Look for matching draft league in manifest
    const draftLeagues = typeof global.getLeagueList === 'function' ? global.getLeagueList() : [];
    let matchingDraftId = null;

    if (targetId) {
      // 1. Direct ID match
      if (draftLeagues.some((l) => l.id === targetId)) {
        matchingDraftId = targetId;
      }
      // 2. Check stored settings for inSeasonLeagueId or platformLeagueId match
      if (!matchingDraftId && typeof localStorage !== 'undefined') {
        for (const dl of draftLeagues) {
          try {
            const raw = localStorage.getItem(`fantasy_drafter_league_${dl.id}`);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (
                parsed?.settings?.inSeasonLeagueId === targetId ||
                parsed?.settings?.platformLeagueId === targetId ||
                (inSeasonLeague &&
                  parsed?.settings?.leagueName?.toLowerCase() ===
                    inSeasonLeague.name?.toLowerCase())
              ) {
                matchingDraftId = dl.id;
                break;
              }
            }
          } catch (_e) {}
        }
      }
    }

    if (matchingDraftId) {
      if (typeof global.switchLeague === 'function') {
        global.switchLeague(matchingDraftId);
      }
    } else if (inSeasonLeague) {
      // Create and link draft league from in-season league
      if (typeof global.createNewLeague === 'function') {
        const res = global.createNewLeague(inSeasonLeague.name);
        if (res?.ok && global.state?.settings) {
          global.state.settings.platform = inSeasonLeague.platform || 'manual';
          const defSeason =
            typeof global.getDefaultSeason === 'function'
              ? global.getDefaultSeason()
              : new Date().getMonth() === 0
                ? String(new Date().getFullYear() - 1)
                : String(new Date().getFullYear());
          global.state.settings.season = inSeasonLeague.season || defSeason;
          global.state.settings.inSeasonLeagueId = inSeasonLeague.id;
          global.state.settings.inSeasonConnected = true;
          if (inSeasonLeague.team_count) {
            global.state.settings.teams = Math.max(
              2,
              Math.min(32, parseInt(inSeasonLeague.team_count, 10) || 12),
            );
          }
          if (inSeasonLeague.my_team_id) {
            global.state.settings.platformUserId = inSeasonLeague.my_team_id;
          }
          if (typeof global.save === 'function') {
            global.save();
          }
        }
      }
    }

    if (typeof global.openLeagueSetup === 'function') {
      global.openLeagueSetup();
    }
  };

  let waiverSearchTimeout = null;
  global.onWaiverSearchInput = (val) => {
    global.inSeasonState.waiverFilters.search = val;
    clearTimeout(waiverSearchTimeout);
    waiverSearchTimeout = setTimeout(async () => {
      await global.inSeasonManager.fetchWaivers();
      renderManagerView();
      const inp = document.getElementById('waiver_search_input');
      if (inp) {
        inp.focus();
        inp.selectionStart = inp.selectionEnd = inp.value.length;
      }
    }, 250);
  };

  global.onWaiverLeagueFilter = async (leagueId) => {
    const s = global.inSeasonState;
    if (leagueId && leagueId !== 'all') {
      const targetLg = (s.leagues || []).find((l) => l.id === leagueId);
      if (targetLg) {
        if (targetLg.format_key) {
          s.waiverFilters.format = targetLg.format_key;
        } else {
          const isDyn = Boolean(targetLg.is_dynasty);
          const curFormatIsDyn = (s.waiverFilters.format || 'dyn_sf').startsWith('dyn');
          if (isDyn && !curFormatIsDyn) {
            s.waiverFilters.format = 'dyn_sf';
          } else if (!isDyn && curFormatIsDyn) {
            s.waiverFilters.format = 'red_ppr';
          }
        }
      }
    }
    await global.inSeasonManager.fetchWaivers({ leagueId });
    renderManagerView();
  };

  global.onWaiverFormatFilter = async (format) => {
    const s = global.inSeasonState;
    const newFormatIsDyn = format.startsWith('dyn');
    if (s.waiverFilters.leagueId && s.waiverFilters.leagueId !== 'all') {
      const targetLg = (s.leagues || []).find((l) => l.id === s.waiverFilters.leagueId);
      if (targetLg) {
        const lgIsDyn = Boolean(targetLg.is_dynasty);
        if (lgIsDyn !== newFormatIsDyn) {
          s.waiverFilters.leagueId = 'all';
        }
      }
    }
    await global.inSeasonManager.fetchWaivers({ format, leagueId: s.waiverFilters.leagueId });
    renderManagerView();
  };

  global.onWaiverPosFilter = async (pos) => {
    await global.inSeasonManager.fetchWaivers({ pos });
    renderManagerView();
  };

  global.onWaiverNeedsToggle = async () => {
    const cur = global.inSeasonState.waiverFilters.needsOnly;
    global.inSeasonState.waiverFilters.needsOnly = !cur;
    renderManagerView();
    await global.inSeasonManager.fetchWaivers({ needsOnly: !cur });
    renderManagerView();
  };

  global.onWaiverWatchlistToggle = async () => {
    const cur = global.inSeasonState.waiverFilters.watchlistOnly;
    global.inSeasonState.waiverFilters.watchlistOnly = !cur;
    renderManagerView();
    await global.inSeasonManager.fetchWaivers({ watchlistOnly: !cur });
    renderManagerView();
  };

  global.toggleWaiverWatchlist = async (playerName) => {
    await global.inSeasonManager.toggleWatchlist(playerName);
    renderManagerView();
  };

  global.openWaiverNoteModal = (playerName) => {
    const modal = document.getElementById('playerModalbox');
    const overlay = document.getElementById('playerOverlay');
    if (!modal || !overlay) return;

    const norm = playerName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const currentNote = global.inSeasonState.watchlist?.[norm] || '';
    const isWatchlisted = Boolean(global.inSeasonState.watchlist?.[norm] !== undefined);

    modal.innerHTML = `
      <h3>📝 Waiver Note: ${esc(playerName)}
        <button class="close" onclick="document.getElementById('playerOverlay').style.display='none'">×</button>
      </h3>
      <div style="padding:14px 0">
        <p class="meta" style="margin-top:0">Save private notes or waiver bidding targets for this player across your leagues.</p>
        <textarea id="waiver_note_textarea" class="waiver-note-input" rows="4" style="width:100%; box-sizing:border-box; background:rgba(0,0,0,0.3); border:1px solid var(--border); border-radius:6px; color:var(--text); padding:10px; font-size:13px; resize:vertical" placeholder="e.g. Must-add if lead back is ruled out; bid $15 FAAB">${esc(currentNote)}</textarea>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:14px">
          <button type="button" class="act" onclick="global.toggleWaiverWatchlist('${escJs(playerName)}'); document.getElementById('playerOverlay').style.display='none';">⭐ ${isWatchlisted ? 'Un-Watchlist' : 'Add to Watchlist'}</button>
          <div style="display:flex; gap:8px">
            <button type="button" class="act" onclick="document.getElementById('playerOverlay').style.display='none'">Cancel</button>
            <button type="button" class="act primary" onclick="global.saveWaiverNote('${escJs(playerName)}')">Save Note</button>
          </div>
        </div>
      </div>
    `;
    overlay.style.display = 'flex';
    const ta = document.getElementById('waiver_note_textarea');
    if (ta) ta.focus();
  };

  global.saveWaiverNote = async (playerName) => {
    const ta = document.getElementById('waiver_note_textarea');
    const note = ta ? ta.value.trim() : '';
    await global.inSeasonManager.saveWatchlistNote(playerName, note);
    const overlay = document.getElementById('playerOverlay');
    if (overlay) overlay.style.display = 'none';
    renderManagerView();
  };

  global.renderManagerView = renderManagerView;
  global.renderLeaguesView = renderLeaguesView;
})(typeof window !== 'undefined' ? window : globalThis);
