// ⚡ Fantasy Drafter — ESPN Live Sync Content Script (Manifest V3)
// Automatically monitors ESPN Live & Mock Draft Rooms and relays picks to Fantasy Drafter on http://127.0.0.1:8517

(function () {
  const RELAY_HOSTS = ['http://127.0.0.1:8517', 'http://localhost:8517'];
  const NFL_TEAMS = new Set([
    'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN',
    'DET', 'GB', 'HOU', 'IND', 'JAX', 'JAC', 'KC', 'LV', 'LAC', 'LAR',
    'MIA', 'MIN', 'NE', 'NO', 'NYG', 'NYJ', 'PHI', 'PIT', 'SF', 'SEA',
    'TB', 'TEN', 'WAS', 'WSH'
  ]);
  const TEAM_NORM = {
    'WSH': 'WAS',
    'JAC': 'JAX',
    'OAK': 'LV',
    'SD': 'LAC',
    'STL': 'LAR',
    'LA': 'LAR'
  };
  const POS_LIST = ['QB', 'RB', 'WR', 'TE', 'K', 'DST', 'DEF', 'D/ST'];

  let activeHost = 'http://127.0.0.1:8517';
  let isConnected = false;
  let pill = null;
  let diagModal = null;
  let detectedLeagueTeams = 12;
  let detectedTeamNames = [];
  let detectedMySlot = null;
  const seenPicks = new Set();
  let lastSnapshotCount = 0;
  let totalDetectedPicks = [];

  function isDraftRoom() {
    return window.location.href.includes('/draft') ||
      window.location.href.includes('/mock') ||
      window.location.href.includes('/ffl') ||
      document.querySelector('table, .draft-table, .draft-board, .pick-history, [data-testid*="draft"], .draft-recent-pick, .draft-cell, [class*="draft" i]') !== null;
  }

  function isPlaceholderName(name) {
    if (!name) return true;
    const clean = String(name).trim().toLowerCase();
    if (clean.length < 3) return true;
    if (/^(on\s*the\s*clock|the\s*clock|clock|drafting|picking|auto\s*pick|autopick|time\s*expired|available|empty|open|player|unknown)$/i.test(clean)) {
      return true;
    }
    if (/^[0-9]+(\.[0-9]+)?$/.test(clean)) return true;
    return false;
  }

  function createPill() {
    if (pill) return;
    pill = document.createElement('div');
    pill.id = 'fantasy-drafter-extension-pill';
    pill.innerHTML = '⚡ <b>Fantasy Drafter:</b> Connecting...';
    Object.assign(pill.style, {
      position: 'fixed',
      bottom: '18px',
      right: '18px',
      zIndex: '9999999',
      background: '#10131a',
      color: '#ffb454',
      border: '1.5px solid #ffb454',
      borderRadius: '8px',
      padding: '8px 14px',
      font: '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      boxShadow: '0 8px 24px rgba(0,0,0,0.75)',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      userSelect: 'none'
    });
    pill.title = 'Click to open Fantasy Drafter Sync Diagnostics';
    pill.onclick = (e) => {
      e.stopPropagation();
      toggleDiagModal();
    };
    document.body.appendChild(pill);
  }

  function setPillStatus(status, text) {
    if (!pill) return;
    const countTag = totalDetectedPicks.length > 0 ? ` (${totalDetectedPicks.length} picks)` : '';
    if (status === 'connected') {
      pill.style.color = '#3ddc84';
      pill.style.borderColor = '#3ddc84';
      pill.innerHTML = '⚡ <b>Fantasy Drafter:</b> ' + (text || ('Connected & Synced' + countTag));
    } else if (status === 'pick') {
      pill.style.color = '#58a6ff';
      pill.style.borderColor = '#58a6ff';
      pill.innerHTML = '⚡ <b>Fantasy Drafter:</b> ' + text;
      setTimeout(() => { setPillStatus('connected'); }, 2500);
    } else {
      pill.style.color = '#ffb454';
      pill.style.borderColor = '#ffb454';
      pill.innerHTML = '⚡ <b>Fantasy Drafter:</b> ' + (text || 'Looking for Fantasy Drafter (127.0.0.1:8517)...');
    }
  }

  function toggleDiagModal() {
    if (diagModal) {
      diagModal.remove();
      diagModal = null;
      return;
    }
    diagModal = document.createElement('div');
    diagModal.id = 'fantasy-drafter-diag-modal';
    Object.assign(diagModal.style, {
      position: 'fixed',
      bottom: '65px',
      right: '18px',
      width: '380px',
      maxHeight: '520px',
      background: '#161b22',
      color: '#e6edf3',
      border: '1px solid #30363d',
      borderRadius: '10px',
      padding: '16px',
      zIndex: '10000000',
      boxShadow: '0 12px 32px rgba(0,0,0,0.85)',
      font: '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      overflowY: 'auto'
    });

    const recentPicksHtml = totalDetectedPicks.slice(-7).reverse().map(p =>
      `<div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid #21262d; font-size:12px">
        <span><b>#${p.overall}</b> ${p.name}</span>
        <span style="color:#8b949e">${p.pos || '—'} · ${p.team || 'FA'}</span>
      </div>`
    ).join('') || '<div style="color:#8b949e; font-style:italic; padding:6px 0">No picks detected yet in this session.</div>';

    const mySlotDesc = detectedMySlot
      ? `<span style="color:#3ddc84">Slot #${detectedMySlot} (${detectedTeamNames[detectedMySlot - 1] || 'Your Team'})</span>`
      : '<span style="color:#8b949e">Detecting...</span>';

    diagModal.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px">
        <h3 style="margin:0; font-size:14px; color:#58a6ff; font-weight:700">⚡ ESPN Sync Diagnostics</h3>
        <button id="fd-diag-close" style="background:transparent; border:none; color:#8b949e; cursor:pointer; font-size:16px; line-height:1">✕</button>
      </div>
      <div style="margin-bottom:10px; font-size:12px; line-height:1.6; color:#c9d1d9">
        <div><b>Relay Host:</b> <code>${activeHost}</code></div>
        <div><b>Status:</b> ${isConnected ? '<span style="color:#3ddc84">Connected ✅</span>' : '<span style="color:#ffb454">Connecting... ⏳</span>'}</div>
        <div><b>League Size:</b> <b style="color:#58a6ff">${detectedLeagueTeams} Teams</b></div>
        <div><b>Your Draft Slot:</b> ${mySlotDesc}</div>
        <div><b>Total Synced:</b> <b>${totalDetectedPicks.length}</b> picks</div>
      </div>
      <div style="margin-top:10px">
        <div style="font-weight:600; font-size:12px; color:#8b949e; margin-bottom:6px">Recent Synced Picks:</div>
        ${recentPicksHtml}
      </div>
      <div style="margin-top:14px; display:flex; gap:8px">
        <button id="fd-diag-rescan" style="flex:1; padding:7px 10px; background:#238636; color:#fff; border:none; border-radius:6px; font-weight:600; cursor:pointer">🔄 Force Scan & Re-Sync</button>
      </div>
    `;

    document.body.appendChild(diagModal);

    diagModal.querySelector('#fd-diag-close').onclick = () => {
      diagModal.remove();
      diagModal = null;
    };
    diagModal.querySelector('#fd-diag-rescan').onclick = () => {
      forceResync();
      diagModal.remove();
      diagModal = null;
      toggleDiagModal();
    };
  }

  function parsePlayerText(rawText) {
    if (!rawText) return null;
    let clean = rawText.replace(/[\(\)\,\-\/]/g, ' ').replace(/\s+/g, ' ').trim();

    // Strip common clutter words
    clean = clean.replace(/\b(autopick|drafted|draft|picked|by|round|pick|prk|proj|queue|view|action|status|rost|stats|team|slot|overall)\b/gi, ' ').replace(/\s+/g, ' ').trim();
    const tokens = clean.split(' ');

    let pos = '';
    let team = '';
    let nameParts = [];

    for (const t of tokens) {
      const u = t.toUpperCase();
      if (!pos && POS_LIST.includes(u)) {
        pos = u;
      } else if (!team && NFL_TEAMS.has(u)) {
        team = TEAM_NORM[u] || u;
      } else if (!/^[0-9]+(\.[0-9]+)?$/.test(t)) { // ignore numeric scores/prices
        nameParts.push(t);
      }
    }

    const name = nameParts.join(' ').trim();
    if (!name || isPlaceholderName(name)) return null;
    return { name, pos, team };
  }

  function extractPlayerFromElement(el) {
    if (!el) return null;
    const txt = (el.innerText || '').trim();

    // 1. Look for explicit player anchor link or athlete name class
    const linkEl = el.querySelector('a[href*="/player/"], .player-name, [class*="playerName" i], [class*="athlete" i], .AnchorLink');
    if (linkEl && linkEl.innerText && linkEl.innerText.trim().length >= 3) {
      const linkName = linkEl.innerText.trim();
      if (!isPlaceholderName(linkName)) {
        const parsed = parsePlayerText(linkName);
        if (parsed && parsed.name) {
          // Also look for pos / team tags in sibling elements
          const posEl = el.querySelector('[class*="position" i], [class*="pos" i]');
          const teamEl = el.querySelector('[class*="proTeam" i], [class*="team" i]');
          if (posEl && posEl.innerText && POS_LIST.includes(posEl.innerText.trim().toUpperCase())) {
            parsed.pos = posEl.innerText.trim().toUpperCase();
          }
          if (teamEl && teamEl.innerText) {
            const rawT = teamEl.innerText.trim().toUpperCase();
            if (NFL_TEAMS.has(rawT)) {
              parsed.team = TEAM_NORM[rawT] || rawT;
            }
          }
          return parsed;
        }
      }
    }
    // 2. Fallback to parsing element text
    return parsePlayerText(txt);
  }

  function extractPickNumber(text, teamsCount) {
    if (!text) return null;
    const str = String(text).trim();

    // 1. Check for Round.Pick format like "3.01", "3.1", "1.12", "1.14"
    const roundPickMatch = str.match(/\b([0-9]{1,2})\.([0-9]{1,2})\b/);
    if (roundPickMatch) {
      const r = parseInt(roundPickMatch[1], 10);
      const p = parseInt(roundPickMatch[2], 10);
      const t = teamsCount || detectedLeagueTeams || 12;
      if (r >= 1 && p >= 1 && p <= t) {
        return (r - 1) * t + p;
      }
    }

    // 2. Check for explicit overall like "Pick 37", "#37", "Pk 37", "(Pick 37)", "P50"
    const explicitMatch = str.match(/(?:pick|pk|#|p)\s*([0-9]{1,3})\b/i);
    if (explicitMatch) {
      const num = parseInt(explicitMatch[1], 10);
      if (!isNaN(num) && num > 0 && num <= 600) return num;
    }

    // 3. Standalone integer in a pick column
    const directMatch = str.match(/^([0-9]{1,3})\.?$/);
    if (directMatch) {
      const num = parseInt(directMatch[1], 10);
      if (!isNaN(num) && num > 0 && num <= 600) return num;
    }

    return null;
  }

  function isAvailablePlayerRow(el) {
    if (!el) return false;
    // 1. Has an active Draft / Queue button
    if (el.querySelector('button[aria-label*="Draft" i], button[title*="Draft" i], button.btn-draft, [data-testid*="draft-button"], button[aria-label*="Queue" i], [data-testid*="queue-button"]')) {
      return true;
    }
    // 2. Direct parent table is the available player pool (has PRK / PROJ header)
    const tbl = el.closest('table');
    if (tbl) {
      const thead = tbl.querySelector('thead');
      if (thead && /\b(PRK|PROJ|STATUS|ROST%)\b/i.test(thead.innerText)) {
        return true;
      }
    }
    return false;
  }

  function detectLeagueInfo() {
    // 1. Scan column headers above the Draft Board grid
    let headers = document.querySelectorAll(
      '.draft-board-header .team-header, [class*="DraftBoard"] th, [class*="draftBoard"] [class*="team" i], ' +
      '[class*="teamColumn" i] [class*="name" i], .draft-grid-header th, [data-testid*="team-column"]'
    );

    if (headers.length === 0) {
      const boardTable = document.querySelector('.draft-board table, [class*="DraftBoard"] table');
      if (boardTable) {
        headers = boardTable.querySelectorAll('thead th, tr:first-child th, tr:first-child td');
      }
    }

    const names = [];
    let mySlot = null;

    headers.forEach((h, idx) => {
      const text = (h.innerText || '').trim();
      if (text && !/^(rd|round|pick|#|[0-9]+)$/i.test(text)) {
        names.push(text);
        const style = window.getComputedStyle ? window.getComputedStyle(h) : {};
        const isGreen = (style.backgroundColor && (style.backgroundColor.includes('rgb(0, 1') || style.backgroundColor.includes('rgb(35, 134') || style.backgroundColor.includes('green'))) ||
          h.classList.contains('user-team') || h.classList.contains('my-team') || h.getAttribute('data-is-me') === 'true' ||
          /\b(you|my team)\b/i.test(text) || h.querySelector('[class*="user" i], [class*="myTeam" i], [class*="active" i]');
        if (isGreen && mySlot === null) {
          mySlot = idx + 1;
        }
      }
    });

    if (names.length >= 8 && names.length <= 16) {
      detectedLeagueTeams = names.length;
      detectedTeamNames = names;
      if (mySlot) detectedMySlot = mySlot;
    }

    // 2. Fallback: check max pick in round R.P across board cells
    let maxP = 0;
    document.querySelectorAll('[class*="cell" i], td').forEach(c => {
      const m = (c.innerText || '').match(/\b[0-9]{1,2}\.([0-9]{1,2})\b/);
      if (m) {
        const p = parseInt(m[1], 10);
        if (p > maxP && p <= 16) maxP = p;
      }
    });
    if (maxP >= 8 && maxP <= 16) {
      detectedLeagueTeams = maxP;
    }

    return {
      teams: detectedLeagueTeams,
      teamNames: detectedTeamNames,
      mySlot: detectedMySlot
    };
  }

  async function postRelay(endpoint, payload) {
    for (const host of [activeHost, ...RELAY_HOSTS]) {
      try {
        const res = await fetch(host + endpoint, {
          method: 'POST',
          mode: 'cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload || {})
        });
        if (res.ok) {
          activeHost = host;
          return true;
        }
      } catch (err) { }
    }
    return false;
  }

  function sendPick(pickData) {
    createPill();
    try {
      const img = new Image();
      img.src = activeHost + '/api/sync/pick?d=' + encodeURIComponent(JSON.stringify(pickData)) + '&t=' + Date.now();
    } catch (e) { }

    postRelay('/api/sync/pick', pickData);
    setPillStatus('pick', 'Drafted #' + (pickData.overall || '') + ' ' + pickData.name);
    console.log('⚡ [Fantasy Drafter ESPN Sync] Pick sent:', pickData);
  }

  function sendSnapshot(picksList, leagueInfo) {
    if (!picksList || picksList.length === 0) return;
    const payload = {
      source: 'espn',
      type: 'DRAFT_SNAPSHOT',
      leagueInfo: leagueInfo || {
        teams: detectedLeagueTeams,
        teamNames: detectedTeamNames,
        mySlot: detectedMySlot
      },
      picks: picksList,
      count: picksList.length,
      timestamp: Date.now()
    };

    try {
      const img = new Image();
      img.src = activeHost + '/api/sync/snapshot?d=' + encodeURIComponent(JSON.stringify(payload)) + '&t=' + Date.now();
    } catch (e) { }

    postRelay('/api/sync/snapshot', payload);
  }

  function sendPing() {
    createPill();
    try {
      const img = new Image();
      img.onload = () => {
        if (!isConnected) {
          isConnected = true;
          setPillStatus('connected');
        }
      };
      img.src = activeHost + '/api/sync/ping?t=' + Date.now();
    } catch (e) { }

    postRelay('/api/sync/ping', { source: 'espn', timestamp: Date.now() }).then(ok => {
      if (ok && !isConnected) {
        isConnected = true;
        setPillStatus('connected');
      }
    });
  }

  function scanDraftRoom(force) {
    const leagueInfo = detectLeagueInfo();
    const detectedPicks = new Map(); // Map overall -> pickObject

    // --- Strategy 1: Draft Board Grid Rows & Sequential Left-to-Right Coordinates ---
    const boardRows = document.querySelectorAll(
      '.draft-board tbody tr, [class*="DraftBoard"] tbody tr, [class*="draftBoard"] tr, .draft-grid tr'
    );

    if (boardRows.length > 0) {
      boardRows.forEach((tr, rIdx) => {
        const cells = tr.querySelectorAll('td, [class*="cell" i]');
        if (cells.length >= 8 && cells.length <= 16) {
          detectedLeagueTeams = cells.length;
          cells.forEach((cell, cIdx) => {
            if (isAvailablePlayerRow(cell)) return;
            const parsed = extractPlayerFromElement(cell);
            if (!parsed || !parsed.name || isPlaceholderText(parsed.name)) return;

            const overall = rIdx * detectedLeagueTeams + (cIdx + 1);
            detectedPicks.set(overall, {
              source: 'espn',
              type: 'PICK_MADE',
              overall: overall,
              name: parsed.name,
              pos: parsed.pos || '',
              team: parsed.team || '',
              timestamp: Date.now()
            });
          });
        }
      });
    }

    // --- Strategy 2: Individual Draft Board Grid Cells with Explicit Attributes/Text ---
    const boardCells = document.querySelectorAll(
      '[class*="cell" i], [class*="draftboard" i] td, [class*="grid" i] div, [data-testid*="cell" i], .draft-grid-cell'
    );

    boardCells.forEach(cell => {
      if (isAvailablePlayerRow(cell)) return;
      const parsed = extractPlayerFromElement(cell);
      if (!parsed || !parsed.name || isPlaceholderText(parsed.name)) return;

      const overallAttr = cell.getAttribute('data-overall') || cell.getAttribute('data-pick-number') || cell.getAttribute('data-pick');
      let overall = overallAttr ? parseInt(overallAttr, 10) : null;
      if (!overall || isNaN(overall)) {
        const pickEl = cell.querySelector('.pick-number, [class*="pickNumber" i], [class*="pickLabel" i], [class*="roundPick" i]');
        if (pickEl && pickEl.innerText) {
          overall = extractPickNumber(pickEl.innerText, detectedLeagueTeams);
        } else {
          overall = extractPickNumber(cell.innerText, detectedLeagueTeams);
        }
      }

      if (overall && overall > 0 && !detectedPicks.has(overall)) {
        detectedPicks.set(overall, {
          source: 'espn',
          type: 'PICK_MADE',
          overall: overall,
          name: parsed.name,
          pos: parsed.pos || '',
          team: parsed.team || '',
          timestamp: Date.now()
        });
      }
    });

    // --- Strategy 3: Pick History / Activity Stream / Right Sidebar ---
    const historyRows = document.querySelectorAll(
      'tr.Table__TR, [class*="history" i] tr, [class*="history" i] [class*="row" i], ' +
      '[class*="activity" i] [class*="item" i], [class*="draftcast" i] [class*="item" i], ' +
      '[class*="feed" i] [class*="item" i], [class*="picks" i] [class*="item" i], [data-testid*="draft-history" i], .draft-history-item'
    );

    historyRows.forEach(r => {
      if (isAvailablePlayerRow(r)) return;
      const parsed = extractPlayerFromElement(r);
      if (!parsed || !parsed.name || isPlaceholderText(parsed.name)) return;

      const pickEl = r.querySelector('.pick-number, .col-pick, td:first-child, [class*="pickNumber" i], [class*="pick" i], [data-testid*="pick" i]');
      const pickText = pickEl ? pickEl.innerText : '';
      const overall = extractPickNumber(pickText, detectedLeagueTeams) || extractPickNumber(r.innerText, detectedLeagueTeams);

      if (overall && overall > 0 && !detectedPicks.has(overall)) {
        detectedPicks.set(overall, {
          source: 'espn',
          type: 'PICK_MADE',
          overall: overall,
          name: parsed.name,
          pos: parsed.pos || '',
          team: parsed.team || '',
          timestamp: Date.now()
        });
      }
    });

    // Convert detected picks to an array sorted by overall pick number
    const sortedPicks = Array.from(detectedPicks.values()).sort((a, b) => a.overall - b.overall);
    totalDetectedPicks = sortedPicks;

    // Send individual events for newly seen picks
    sortedPicks.forEach(p => {
      const pickKey = p.overall + '_' + p.name;
      if (!seenPicks.has(pickKey)) {
        seenPicks.add(pickKey);
        sendPick(p);
      }
    });

    // If total picks changed OR force is requested, send full snapshot batch
    if (sortedPicks.length > 0 && (force || sortedPicks.length !== lastSnapshotCount)) {
      lastSnapshotCount = sortedPicks.length;
      sendSnapshot(sortedPicks, leagueInfo);
      setPillStatus('connected');
    }
  }

  function forceResync() {
    seenPicks.clear();
    lastSnapshotCount = 0;
    sendPing();
    scanDraftRoom(true);
    console.log('⚡ [Fantasy Drafter ESPN Sync] Forced re-sync executed:', totalDetectedPicks.length, 'picks dispatched.');
  }

  function checkAndInit() {
    createPill();
    sendPing();
    scanDraftRoom();

    const observer = new MutationObserver(() => scanDraftRoom(false));
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }

    setInterval(() => scanDraftRoom(false), 400);
    setInterval(sendPing, 3500);
    console.log('⚡ [Fantasy Drafter] ESPN Live Sync loaded and active.');
    return true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkAndInit);
  } else {
    checkAndInit();
  }
})();


