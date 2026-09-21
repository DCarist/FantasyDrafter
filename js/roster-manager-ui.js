// 🎨 In-Season Roster Management UI Component & View Renderers
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

      return `
        <tr class="roster-player-row pos-${esc(pos.toLowerCase())}">
          <td class="slot-col"><b>${esc(slotName || pos)}</b></td>
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
        p.lineupSlot || (idx === 0 ? 'QB' : idx <= 2 ? 'RB' : idx <= 4 ? 'WR' : 'FLEX');
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
              <p>Enter your Sleeper username to automatically discover and import your leagues:</p>
              <div class="input-action-row">
                <input type="text" id="sleeper_import_username" placeholder="Sleeper Username (e.g. your_name)">
                <button type="button" class="act primary" onclick="global.discoverSleeperLeagues()">Discover Leagues</button>
              </div>
              <div id="sleeper_discovered_container"></div>
            </div>

            <div class="onboarding-section" style="margin-top:16px; border-top:1px solid var(--border); padding-top:16px">
              <h4>🏈 ESPN Fantasy Sync</h4>
              <p>Enter your ESPN League ID (and cookies for private leagues):</p>
              <div class="input-action-row">
                <input type="text" id="espn_import_league_id" placeholder="ESPN League ID">
                <button type="button" class="act" onclick="global.syncEspnLeague()">Sync ESPN</button>
              </div>
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

    let rowsHtml = '';
    for (const [idx, item] of waivers.entries()) {
      const p = item.player || {};
      const name = item.name || p.name || '';
      const pos = item.pos || p.pos || '';
      const team = item.team || p.team || '';
      const score = item.score != null ? Math.round(item.score) : '—';
      const rank = item.rank != null ? `#${item.rank}` : '';
      const isPriority = item.is_priority;

      // Available leagues badges
      let availHtml = '';
      for (const lg of item.available_in || []) {
        availHtml += `<span class="avail-badge" title="Free Agent in ${esc(lg.league_name)}">${esc(lg.league_name)}</span>`;
      }

      // Need matches
      let needHtml = '';
      for (const need of item.need_matches || []) {
        needHtml += `<span class="need-match-badge" title="${esc(need.reason)}">🔥 ${esc(need.reason)} (${esc(need.league_name)})</span>`;
      }

      rowsHtml += `
        <tr class="waiver-row ${isPriority ? 'waiver-priority' : ''}">
          <td class="num" style="color:var(--dim)">${idx + 1}</td>
          <td>
            <span class="player-name-link" onclick="global.openPlayerNewsModal('${esc(name)}')">${esc(name)}</span>
            ${getInjuryBadge(p.injury)}
            ${needHtml ? `<div style="margin-top:3px">${needHtml}</div>` : ''}
          </td>
          <td style="text-align:center"><span class="pos-tag pos-${esc(pos.toLowerCase())}">${esc(pos)}</span></td>
          <td style="text-align:center">${esc(team)}</td>
          <td class="num">${esc(rank)}</td>
          <td class="num"><b>${esc(score)}</b></td>
          <td class="avail-col">${availHtml || '<span class="meta">All Rostered</span>'}</td>
          <td>
            <button type="button" class="small" onclick="global.openPlayerNewsModal('${esc(name)}')">Details</button>
          </td>
        </tr>
      `;
    }

    return `
      ${renderSubHeader()}
      <div class="waivers-container">
        <div class="waivers-header-bar">
          <div>
            <h2 style="margin:0">⚡ Cross-League Waiver Wire & Market Radar</h2>
            <div class="meta" style="margin-top:4px">Top free agents across your leagues ranked by rest-of-season consensus value and team need matching.</div>
          </div>
        </div>

        <div class="panel waivers-table-panel">
          <table class="waiver-table">
            <thead>
              <tr>
                <th style="width:40px">#</th>
                <th>Player & Team Need Match</th>
                <th style="width:50px; text-align:center">Pos</th>
                <th style="width:55px; text-align:center">Team</th>
                <th class="num" style="width:60px">Cons Rank</th>
                <th class="num" style="width:60px">Score</th>
                <th>Available In Leagues</th>
                <th style="width:70px"></th>
              </tr>
            </thead>
            <tbody>${rowsHtml || '<tr><td colspan="8">No waiver candidates currently loaded.</td></tr>'}</tbody>
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
    if (v === 'team') await global.inSeasonManager.fetchTeamView();
    else if (v === 'leagues') await global.inSeasonManager.fetchLeagues();
    else if (v === 'news') await global.inSeasonManager.fetchNews(global.inSeasonState.newsFilter);
    else if (v === 'waivers') await global.inSeasonManager.fetchWaivers();
    else if (v === 'rankings') await global.inSeasonManager.fetchPowerRankings();
    renderManagerView();
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
              <button type="button" class="act primary small" onclick="global.importDiscoveredSleeperLeague('${esc(lg.remote_id)}', '${esc(username)}')">Import</button>
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

  global.importDiscoveredSleeperLeague = async (remoteId, username) => {
    const res = await fetch('/api/manager/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: 'sleeper', remote_league_id: remoteId, username: username }),
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
  };

  global.syncEspnLeague = async () => {
    const input = document.getElementById('espn_import_league_id');
    const lid = input ? input.value.trim() : '';
    if (!lid) return alert('Please enter an ESPN League ID');
    const defSeason =
      typeof global.getDefaultSeason === 'function'
        ? global.getDefaultSeason()
        : new Date().getMonth() === 0
          ? String(new Date().getFullYear() - 1)
          : String(new Date().getFullYear());
    // Save league stub and seed
    await fetch('/api/manager/leagues/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: `espn_${lid}`,
        platform: 'espn',
        name: `ESPN League ${lid}`,
        season: defSeason,
      }),
    });
    await global.inSeasonManager.fetchLeagues();
    global.inSeasonManager.selectLeague(`espn_${lid}`);
    global.inSeasonManager.setView('team');
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

  global.renderManagerView = renderManagerView;
})(typeof window !== 'undefined' ? window : globalThis);
