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

    let optionsHtml = '';
    for (const l of leagues) {
      const isSel = l.id === activeId;
      const platBadge = l.platform ? `[${l.platform.toUpperCase()}] ` : '';
      optionsHtml += `<option value="${esc(l.id)}"${isSel ? ' selected' : ''}>${esc(platBadge + l.name)}</option>`;
    }

    const curLeague = leagues.find((l) => l.id === activeId);
    const platName = curLeague?.platform ? curLeague.platform.toUpperCase() : 'FANTASY';

    return `
      <div class="manager-sub-header">
        <div class="sub-header-left">
          <label class="set">
            <span style="font-weight:700; color:var(--text)">🏆 Active League:</span>
            <select id="mgr_league_select" class="league-select" onchange="global.inSeasonManager.selectLeague(this.value)">
              ${optionsHtml || '<option value="">(No Leagues Synced)</option>'}
            </select>
          </label>
          <span class="platform-badge ${platName.toLowerCase()}">${esc(platName)}</span>
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
      const slotClass = String(finalSlot).toLowerCase().replace(/[^a-z0-9]/g, '_');

      return `
        <tr class="roster-player-row player-row-${esc(pos.toLowerCase())}">
          <td class="slot-col"><span class="slot-badge slot-${esc(slotClass)}"><b>${esc(finalSlot)}</b></span></td>
          <td class="name-col">
            <span class="player-name-link" onclick="global.openPlayerNewsModal('${esc(name)}')">${esc(name)}</span>
            ${injuryHtml}
          </td>
          <td class="pos-col"><span class="pos-tag pos-${esc(pos.toLowerCase())}">${esc(pos)}</span></td>
          <td class="team-col">${esc(team)}</td>
          <td class="bye-col">${esc(bye)}</td>
          <td class="rank-col num">${esc(rank)}</td>
          <td class="score-col num"><b>${esc(score)}</b></td>
          <td class="action-col">
            <button type="button" class="small" onclick="global.openPlayerNewsModal('${esc(name)}')">📰 News</button>
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
                <div class="room-player-name" onclick="global.openPlayerNewsModal('${esc(p.name)}')" style="cursor:pointer" title="${esc(p.name)}">
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

    return `
      <div class="manager-sub-header">
        <h2 style="margin:0">🏆 Connected Leagues Dashboard</h2>
        <div style="margin-left:auto; display:flex; gap:8px">
          <button type="button" class="act" onclick="global.inSeasonManager.seedDemoData()">🌱 Seed Demo Leagues</button>
        </div>
      </div>

      <div class="leagues-dashboard-layout">
        <div class="leagues-grid">
          ${cardsHtml || '<div class="empty-state-card">No leagues connected yet. Onboard via Sleeper, ESPN, or Demo Seed below.</div>'}
        </div>

        <div class="panel onboarding-panel">
          <h3>➕ Connect a League</h3>
          <div class="onboarding-tabs">
            <div class="onboarding-section">
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
            <span class="news-player-tag" onclick="global.openPlayerNewsModal('${esc(item.player_name)}')">🏈 ${esc(item.player_name)}</span>
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

    // League Options
    let leagueOptionsHtml = `<option value="all"${wf.leagueId === 'all' ? ' selected' : ''}>🌐 All Connected Leagues</option>`;
    for (const lg of leagues) {
      const isSel = wf.leagueId === lg.id;
      const platBadge = lg.platform ? `[${lg.platform.toUpperCase()}] ` : '';
      leagueOptionsHtml += `<option value="${esc(lg.id)}"${isSel ? ' selected' : ''}>${esc(platBadge + lg.name)}</option>`;
    }

    // Format Pills
    const formatConfigs = [
      { key: 'dyn_sf', label: 'Dynasty SF' },
      { key: 'dyn_1qb', label: 'Dynasty 1QB' },
      { key: 'red_ppr', label: 'Redraft PPR' },
      { key: 'red_half', label: 'Redraft Half' },
    ];
    let formatPillsHtml = '<div class="format-pills">';
    for (const f of formatConfigs) {
      const isAct = wf.format === f.key;
      formatPillsHtml += `<button type="button" class="format-pill-btn ${isAct ? 'active' : ''}" onclick="global.onWaiverFormatFilter('${f.key}')">${f.label}</button>`;
    }
    formatPillsHtml += '</div>';

    // Position Pills
    const posList = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DST'];
    let posPillsHtml = '<div class="pos-pills">';
    for (const pos of posList) {
      const isAct = (wf.pos || 'ALL').toUpperCase() === pos;
      posPillsHtml += `<button type="button" class="pos-pill-btn ${isAct ? 'active' : ''}" onclick="global.onWaiverPosFilter('${pos}')">${pos}</button>`;
    }
    posPillsHtml += '</div>';

    // Table rows
    let rowsHtml = '';
    for (const [idx, item] of waivers.entries()) {
      const p = item.player || {};
      const name = item.name || p.name || '';
      const pos = item.pos || p.pos || '';
      const team = item.team || p.team || '';
      const score = item.score != null ? Math.round(item.score) : '—';
      const rank = item.rank != null ? `#${item.rank}` : '';
      const isPriority = item.is_priority;
      const isWatchlisted = Boolean(item.is_watchlisted);
      const note = item.watchlist_note || '';

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
        noteHtml = `<div class="watchlist-note-chip" onclick="global.openWaiverNoteModal('${esc(name)}')" title="Click to edit note">📝 ${esc(note)}</div>`;
      }

      rowsHtml += `
        <tr class="waiver-row ${isPriority ? 'waiver-priority' : ''}">
          <td style="text-align:center">
            <button type="button" class="watchlist-star-btn ${isWatchlisted ? 'is-active' : ''}" onclick="global.toggleWaiverWatchlist('${esc(name)}')" title="${isWatchlisted ? 'Remove from Watchlist' : 'Add to Watchlist'}">${isWatchlisted ? '★' : '☆'}</button>
          </td>
          <td class="num" style="color:var(--dim)">${idx + 1}</td>
          <td>
            <span class="player-name-link" onclick="global.openPlayerNewsModal('${esc(name)}')"><b>${esc(name)}</b></span>
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
            <button type="button" class="small" onclick="global.openWaiverNoteModal('${esc(name)}')">📝 Note</button>
            <button type="button" class="small" onclick="global.openPlayerNewsModal('${esc(name)}')">News</button>
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
            <div class="meta" style="margin-top:4px">Top free agents across your leagues ranked by rest-of-season format value, injury subs, and team need matching.</div>
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
      else if (v === 'news') await global.inSeasonManager.fetchNews(global.inSeasonState.newsFilter);
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

  global.openPlayerNewsModal = async (playerName) => {
    const modal = document.getElementById('playerModalbox');
    const overlay = document.getElementById('playerOverlay');
    if (!modal || !overlay) return;

    const news = await global.inSeasonManager.fetchNews(null, 50);
    const playerNews = (news || []).filter(
      (n) =>
        n.player_name.toLowerCase().includes(playerName.toLowerCase()) ||
        playerName.toLowerCase().includes(n.player_name.toLowerCase()),
    );

    let itemsHtml = '';
    for (const n of playerNews) {
      itemsHtml += `
        <div class="player-news-item">
          <div class="news-item-time">${esc(new Date(n.timestamp).toLocaleDateString())} · <b>${esc(n.source)}</b></div>
          <div class="news-item-headline"><b>${esc(n.headline)}</b></div>
          <div class="news-item-body">${esc(n.body)}</div>
        </div>
      `;
    }

    modal.innerHTML = `
      <h3>📰 Player Report: ${esc(playerName)}
        <button class="close" onclick="document.getElementById('playerOverlay').style.display='none'">×</button>
      </h3>
      <div style="max-height:60vh; overflow-y:auto; padding:10px 0">
        ${itemsHtml || '<p class="meta">No recent news reports filed for this player.</p>'}
      </div>
    `;
    overlay.style.display = 'flex';
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
                  parsed?.settings?.leagueName?.toLowerCase() === inSeasonLeague.name?.toLowerCase())
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
    await global.inSeasonManager.fetchWaivers({ leagueId });
    renderManagerView();
  };

  global.onWaiverFormatFilter = async (format) => {
    await global.inSeasonManager.fetchWaivers({ format });
    renderManagerView();
  };

  global.onWaiverPosFilter = async (pos) => {
    await global.inSeasonManager.fetchWaivers({ pos });
    renderManagerView();
  };

  global.onWaiverNeedsToggle = async () => {
    const cur = global.inSeasonState.waiverFilters.needsOnly;
    await global.inSeasonManager.fetchWaivers({ needsOnly: !cur });
    renderManagerView();
  };

  global.onWaiverWatchlistToggle = async () => {
    const cur = global.inSeasonState.waiverFilters.watchlistOnly;
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
          <button type="button" class="act" onclick="global.toggleWaiverWatchlist('${esc(playerName)}'); document.getElementById('playerOverlay').style.display='none';">⭐ ${isWatchlisted ? 'Un-Watchlist' : 'Add to Watchlist'}</button>
          <div style="display:flex; gap:8px">
            <button type="button" class="act" onclick="document.getElementById('playerOverlay').style.display='none'">Cancel</button>
            <button type="button" class="act primary" onclick="global.saveWaiverNote('${esc(playerName)}')">Save Note</button>
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
})(typeof window !== 'undefined' ? window : globalThis);
