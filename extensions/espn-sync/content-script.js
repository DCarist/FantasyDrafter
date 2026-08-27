// ⚡ Fantasy Drafter — ESPN Live Sync Content Script (Manifest V3)
// Automatically monitors ESPN Live & Mock Draft Rooms and relays picks to Fantasy Drafter on http://127.0.0.1:8517

(function() {
  function isDraftRoom() {
    return window.location.href.includes('/draft') ||
           document.querySelector('.draft-table, .draft-board, .pick-history, [data-testid*="draft"], .draft-recent-pick, .draft-cell, [class*="draftRoom"]') !== null;
  }

  const RELAY_HOSTS = ['http://127.0.0.1:8517', 'http://localhost:8517'];
  const NFL_TEAMS = new Set(['ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU','IND','JAX','KC','LV','LAC','LAR','MIA','MIN','NE','NO','NYG','NYJ','PHI','PIT','SF','SEA','TB','TEN','WAS']);
  const POS_LIST = ['QB','RB','WR','TE','K','DST','DEF','D/ST'];

  let activeHost = 'http://127.0.0.1:8517';
  let isConnected = false;
  let pill = null;
  let detectedLeagueTeams = 12;

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
      boxShadow: '0 8px 24px rgba(0,0,0,0.7)',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      userSelect: 'none'
    });
    pill.title = 'Click to re-ping Fantasy Drafter (127.0.0.1:8517)';
    pill.onclick = () => {
      sendPing();
      pill.style.transform = 'scale(1.08)';
      setTimeout(() => { pill.style.transform = 'scale(1)'; }, 180);
    };
    document.body.appendChild(pill);
  }

  function setPillStatus(status, text) {
    if (!pill) return;
    if (status === 'connected') {
      pill.style.color = '#3ddc84';
      pill.style.borderColor = '#3ddc84';
      pill.innerHTML = '⚡ <b>Fantasy Drafter:</b> ' + (text || 'Connected & Synced Live');
    } else if (status === 'pick') {
      pill.style.color = '#58a6ff';
      pill.style.borderColor = '#58a6ff';
      pill.innerHTML = '⚡ <b>Fantasy Drafter:</b> ' + (text || 'Pick Synced');
      setTimeout(() => { setPillStatus('connected'); }, 2000);
    } else {
      pill.style.color = '#ffb454';
      pill.style.borderColor = '#ffb454';
      pill.innerHTML = '⚡ <b>Fantasy Drafter:</b> ' + (text || 'Looking for Fantasy Drafter (127.0.0.1:8517)...');
    }
  }

  function parsePlayerText(rawText) {
    if (!rawText) return null;
    let clean = rawText.replace(/[\(\)\,\-\/]/g, ' ').replace(/\s+/g, ' ').trim();
    // Strip common UI clutter words
    clean = clean.replace(/\b(autopick|drafted|draft|picked|by|round|pick|prk|proj|queue|view|action|status|rost|stats)\b/gi, ' ').replace(/\s+/g, ' ').trim();
    const tokens = clean.split(' ');

    let pos = '';
    let team = '';
    let nameParts = [];

    for (const t of tokens) {
      const u = t.toUpperCase();
      if (!pos && POS_LIST.includes(u)) {
        pos = u;
      } else if (!team && NFL_TEAMS.has(u)) {
        team = u;
      } else if (!/^[0-9]+(\.[0-9]+)?$/.test(t)) { // ignore numeric scores/prices
        nameParts.push(t);
      }
    }

    const name = nameParts.join(' ').trim();
    if (!name || name.length < 3) return null;
    return { name, pos, team };
  }

  function extractPickNumber(text, teamsCount) {
    if (!text) return null;
    const str = String(text).trim();

    // 1. Check for Round.Pick format like "3.01", "3.1", "1.12"
    const roundPickMatch = str.match(/\b([0-9]{1,2})\.([0-9]{1,2})\b/);
    if (roundPickMatch) {
      const r = parseInt(roundPickMatch[1], 10);
      const p = parseInt(roundPickMatch[2], 10);
      const t = teamsCount || detectedLeagueTeams || 12;
      if (r >= 1 && p >= 1 && p <= t) {
        return (r - 1) * t + p;
      }
    }

    // 2. Check for explicit overall like "Pick 37", "#37", "Pk 37", "37."
    const explicitMatch = str.match(/(?:pick|pk|#)\s*([0-9]{1,3})\b/i);
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

  function isAvailablePlayersTable(el) {
    if (!el) return false;
    // Check if element or its container is an available players / watchlist table
    const container = el.closest('table, .draft-table, [data-testid], section, div');
    if (!container) return false;

    // Check table headers
    const headerText = (container.querySelector('thead, .table-header, .Table__Header') || {}).innerText || '';
    if (/\b(PRK|PROJ|QUEUE|DRAFT|ACTION|ROST%|OPP|STATUS|STATS)\b/i.test(headerText)) {
      return true;
    }

    // Check if row has an action/draft button
    if (el.querySelector('button, [data-testid*="draft-button"], [data-testid*="queue-button"], .btn-draft')) {
      return true;
    }

    return false;
  }

  function detectLeagueSize() {
    // Try to detect number of teams from draft board grid columns or header
    const teamHeaders = document.querySelectorAll('.draft-board-header .team-header, [data-testid*="team-column"], .draft-grid-header th');
    if (teamHeaders.length >= 8 && teamHeaders.length <= 16) {
      detectedLeagueTeams = teamHeaders.length;
    }
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
      } catch (err) {}
    }
    return false;
  }

  // Multi-transport send: Fetch + Image Beacon
  function sendPick(pickData) {
    createPill();
    // 1. Image beacon
    try {
      const img = new Image();
      img.src = activeHost + '/api/sync/pick?d=' + encodeURIComponent(JSON.stringify(pickData)) + '&t=' + Date.now();
    } catch (e) {}

    // 2. Fetch POST
    postRelay('/api/sync/pick', pickData);

    setPillStatus('pick', 'Drafted #' + (pickData.overall || '') + ' ' + pickData.name);
  }

  function sendSnapshot(picksList) {
    if (!picksList || picksList.length === 0) return;
    const payload = {
      source: 'espn',
      type: 'DRAFT_SNAPSHOT',
      picks: picksList,
      count: picksList.length,
      timestamp: Date.now()
    };

    // 1. Image beacon
    try {
      const img = new Image();
      img.src = activeHost + '/api/sync/snapshot?d=' + encodeURIComponent(JSON.stringify(payload)) + '&t=' + Date.now();
    } catch (e) {}

    // 2. Fetch POST
    postRelay('/api/sync/snapshot', payload);
  }

  function sendPing() {
    createPill();
    // 1. Image Beacon ping
    try {
      const img = new Image();
      img.onload = () => {
        if (!isConnected) {
          isConnected = true;
          setPillStatus('connected');
        }
      };
      img.src = activeHost + '/api/sync/ping?t=' + Date.now();
    } catch (e) {}

    // 2. Fetch ping
    postRelay('/api/sync/ping', { source: 'espn', timestamp: Date.now() }).then(ok => {
      if (ok && !isConnected) {
        isConnected = true;
        setPillStatus('connected');
      }
    });
  }

  const seenPicks = new Set();
  let lastSnapshotCount = 0;

  function scanDraftRoom() {
    detectLeagueSize();
    const detectedPicks = new Map(); // Map overall -> pickObject

    // --- 1. Scan Pick History / Activity Stream Rows ---
    const historyRows = document.querySelectorAll(
      '.draft-history tr, .pick-history tr, [data-testid*="draft-history"] tr, [data-testid="draft-history-row"], ' +
      'div[class*="draftHistory"] [class*="Row"], div[class*="pickHistory"] [class*="Row"], ' +
      'div[class*="recentActivity"] [class*="Item"], .draft-history-item, .activity-item'
    );

    historyRows.forEach(r => {
      if (isAvailablePlayersTable(r)) return;

      const playerEl = r.querySelector('.player-name, .player-column, .AnchorLink, [class*="playerName"], td:nth-child(2), td:nth-child(3)');
      if (!playerEl || !playerEl.innerText) return;

      const parsed = parsePlayerText(playerEl.innerText);
      if (!parsed || !parsed.name) return;

      const pickEl = r.querySelector('.pick-number, .col-pick, td:first-child, [class*="pickNumber"], [data-testid*="pick"]');
      const pickText = pickEl ? pickEl.innerText : '';
      const overall = extractPickNumber(pickText, detectedLeagueTeams) || extractPickNumber(r.innerText, detectedLeagueTeams);

      if (overall && overall > 0) {
        detectedPicks.set(overall, {
          source: 'espn',
          type: 'PICK_MADE',
          overall: overall,
          name: parsed.name,
          pos: parsed.pos,
          team: parsed.team,
          timestamp: Date.now()
        });
      }
    });

    // --- 2. Scan Draft Board Grid Cells ---
    const boardCells = document.querySelectorAll(
      '.draft-board .draft-cell, [data-testid*="draft-board"] [data-testid*="cell"], ' +
      'div[class*="draftBoard"] div[class*="Cell"], div[class*="draft-grid"] div[class*="cell"], ' +
      '.draft-grid-cell, .cell-picked, [data-testid="draft-cell"]'
    );

    boardCells.forEach(cell => {
      const playerEl = cell.querySelector('.player-name, .player, .name, .AnchorLink, [class*="playerName"]');
      if (!playerEl || !playerEl.innerText) return;

      const parsed = parsePlayerText(playerEl.innerText);
      if (!parsed || !parsed.name) return;

      const overallAttr = cell.getAttribute('data-overall') || cell.getAttribute('data-pick-number') || cell.getAttribute('data-pick');
      let overall = overallAttr ? parseInt(overallAttr, 10) : null;
      if (!overall || isNaN(overall)) {
        const pickEl = cell.querySelector('.pick-number, [class*="pickNumber"], [class*="pickLabel"]');
        if (pickEl && pickEl.innerText) {
          overall = extractPickNumber(pickEl.innerText, detectedLeagueTeams);
        }
      }

      if (overall && overall > 0) {
        if (!detectedPicks.has(overall)) {
          detectedPicks.set(overall, {
            source: 'espn',
            type: 'PICK_MADE',
            overall: overall,
            name: parsed.name,
            pos: parsed.pos,
            team: parsed.team,
            timestamp: Date.now()
          });
        }
      }
    });

    // --- 3. Scan ESPN Live Announcement / On-The-Clock Banner ---
    const banner = document.querySelector(
      '.draft-recent-pick, .pick-announcement, [class*="recentPick"], [class*="lastPick"], [class*="pickAnnouncement"]'
    );
    if (banner && banner.innerText) {
      const parsed = parsePlayerText(banner.innerText);
      const overall = extractPickNumber(banner.innerText, detectedLeagueTeams);
      if (parsed && parsed.name && overall && overall > 0) {
        if (!detectedPicks.has(overall)) {
          detectedPicks.set(overall, {
            source: 'espn',
            type: 'PICK_MADE',
            overall: overall,
            name: parsed.name,
            pos: parsed.pos,
            team: parsed.team,
            timestamp: Date.now()
          });
        }
      }
    }

    // Convert detected picks to an array sorted by overall pick number
    const sortedPicks = Array.from(detectedPicks.values()).sort((a, b) => a.overall - b.overall);

    // Send individual events for newly seen picks
    sortedPicks.forEach(p => {
      const pickKey = p.overall + '_' + p.name;
      if (!seenPicks.has(pickKey)) {
        seenPicks.add(pickKey);
        sendPick(p);
      }
    });

    // If total picks grew, send full snapshot batch to guarantee complete alignment
    if (sortedPicks.length > 0 && sortedPicks.length !== lastSnapshotCount) {
      lastSnapshotCount = sortedPicks.length;
      sendSnapshot(sortedPicks);
    }
  }

  function checkAndInit() {
    if (isDraftRoom()) {
      createPill();
      sendPing();
      scanDraftRoom();

      const observer = new MutationObserver(scanDraftRoom);
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });

      // Fast 400ms polling for rapid autopicker bursts in mock drafts
      setInterval(scanDraftRoom, 400);
      setInterval(sendPing, 3500);
      console.log('⚡ [Fantasy Drafter] Extension connected to ESPN draft room.');
      return true;
    }
    return false;
  }

  if (!checkAndInit()) {
    const initTimer = setInterval(() => {
      if (checkAndInit()) clearInterval(initTimer);
    }, 1200);
  }
})();
