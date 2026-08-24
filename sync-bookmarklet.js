// ⚡ Fantasy Drafter — 1-Click ESPN Draft Room Sync Bookmarklet
// Injects a real-time DOM observer into ESPN's Draft Room and streams picks to Fantasy Drafter on http://127.0.0.1:8517

(function() {
  if (window.__fantasyDrafterActive) {
    alert('⚡ Fantasy Drafter Sync is already active in this draft room!');
    return;
  }

  const RELAY_HOSTS = ['http://127.0.0.1:8517', 'http://localhost:8517'];
  const CHANNEL_NAME = 'fantasy_drafter_sync';
  const NFL_TEAMS = new Set(['ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU','IND','JAX','KC','LV','LAC','LAR','MIA','MIN','NE','NO','NYG','NYJ','PHI','PIT','SF','SEA','TB','TEN','WAS']);
  const POS_LIST = ['QB','RB','WR','TE','K','DST','DEF','D/ST'];

  let activeHost = 'http://127.0.0.1:8517';
  let isConnected = false;

  // Floating status indicator in ESPN draft room
  const pill = document.createElement('div');
  pill.id = 'fantasy-drafter-pill';
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
  pill.title = 'Click to test sync ping';
  document.body.appendChild(pill);

  function setPillStatus(status, text) {
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
      pill.innerHTML = '⚡ <b>Fantasy Drafter:</b> ' + (text || 'Connecting...');
    }
  }

  function parsePlayerText(rawText) {
    if (!rawText) return null;
    const clean = rawText.replace(/[\(\)\,\-\/]/g, ' ').replace(/\s+/g, ' ').trim();
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
      } else {
        nameParts.push(t);
      }
    }

    const name = nameParts.join(' ').trim();
    return { name: name || rawText.trim(), pos, team };
  }

  // Cross-Origin HTTP Transport
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

  // Multi-transport broadcast: Image Beacon + HTTP Relay + BroadcastChannel + window.opener
  let channel = null;
  try { channel = new BroadcastChannel(CHANNEL_NAME); } catch (e) {}

  function sendPick(pickData) {
    // 1. Image Beacon (bypasses CORS/CSP/mixed-content)
    try {
      const img = new Image();
      img.src = activeHost + '/api/sync/pick?d=' + encodeURIComponent(JSON.stringify(pickData)) + '&t=' + Date.now();
    } catch (e) {}

    // 2. Fetch POST
    postRelay('/api/sync/pick', pickData);

    // 3. Fallbacks
    if (channel) { try { channel.postMessage(pickData); } catch (e) {} }
    if (window.opener) { try { window.opener.postMessage(pickData, '*'); } catch (e) {} }

    setPillStatus('pick', 'Drafted #' + (pickData.overall || '') + ' ' + pickData.name);
  }

  function sendPing() {
    let responded = false;
    // 1. Image Beacon ping
    try {
      const img = new Image();
      img.onload = () => {
        if (!isConnected) {
          isConnected = true;
          setPillStatus('connected');
        }
        responded = true;
      };
      img.src = activeHost + '/api/sync/ping?t=' + Date.now();
    } catch (e) {}

    // 2. Fetch ping with PNA
    postRelay('/api/sync/ping', { source: 'espn', timestamp: Date.now() }).then(ok => {
      if (ok && !isConnected) {
        isConnected = true;
        setPillStatus('connected');
        responded = true;
      }
    });

    setTimeout(() => {
      if (!responded && !isConnected) {
        setPillStatus('disconnected', 'Looking for server on 127.0.0.1:8517...');
      }
    }, 2500);
  }

  pill.onclick = () => {
    sendPing();
    pill.style.transform = 'scale(1.08)';
    setTimeout(() => { pill.style.transform = 'scale(1)'; }, 180);
  };

  const seenPicks = new Set();

  function scanDraftRoom() {
    // 1. Scan Pick History / Draft Tables
    const rows = document.querySelectorAll('.draft-table tbody tr, .pick-history tr, [data-testid="draft-history-row"], .draft-history-item, tr.Table__TR');
    rows.forEach((r, i) => {
      const c = r.querySelector('.player-name, .player-column, .AnchorLink, td:nth-child(2), td:nth-child(3)');
      if (c && c.innerText) {
        const fullText = (c.innerText || '').trim();
        const parsed = parsePlayerText(fullText);
        if (parsed && parsed.name) {
          // Attempt to extract overall or round.pick
          let overall = i + 1;
          const pickCol = r.querySelector('td:first-child, .pick-number, .col-pick, [data-testid="pick-number"]');
          if (pickCol && pickCol.innerText) {
            const pNum = parseInt(pickCol.innerText.replace(/[^0-9]/g, ''), 10);
            if (!isNaN(pNum) && pNum > 0) overall = pNum;
          }

          const pickKey = parsed.name + '_' + overall;
          if (!seenPicks.has(pickKey)) {
            seenPicks.add(pickKey);
            sendPick({
              source: 'espn',
              type: 'PICK_MADE',
              name: parsed.name,
              pos: parsed.pos,
              team: parsed.team,
              overall: overall,
              timestamp: Date.now()
            });
          }
        }
      }
    });

    // 2. Scan Draft Board Cells
    const cells = document.querySelectorAll('.draft-cell, [data-testid="draft-cell"], .draft-grid-cell, .cell-picked');
    cells.forEach(cell => {
      const pEl = cell.querySelector('.player-name, .player, .name, .AnchorLink');
      if (pEl && pEl.innerText) {
        const parsed = parsePlayerText(pEl.innerText.trim());
        if (parsed && parsed.name) {
          const overallAttr = cell.getAttribute('data-overall') || cell.getAttribute('data-pick-number');
          let overall = overallAttr ? parseInt(overallAttr, 10) : null;
          const pickKey = 'cell_' + parsed.name + '_' + (overall || '');
          if (!seenPicks.has(pickKey)) {
            seenPicks.add(pickKey);
            sendPick({
              source: 'espn',
              type: 'PICK_MADE',
              name: parsed.name,
              pos: parsed.pos,
              team: parsed.team,
              overall: overall,
              timestamp: Date.now()
            });
          }
        }
      }
    });

    // 3. Scan ESPN Live Announcement Banner
    const banner = document.querySelector('.draft-recent-pick, .pick-announcement, .on-the-clock-player');
    if (banner && banner.innerText) {
      const bText = banner.innerText.trim();
      const parsed = parsePlayerText(bText);
      if (parsed && parsed.name && !seenPicks.has('banner_' + parsed.name)) {
        seenPicks.add('banner_' + parsed.name);
        sendPick({
          source: 'espn',
          type: 'PICK_MADE',
          name: parsed.name,
          pos: parsed.pos,
          team: parsed.team,
          timestamp: Date.now()
        });
      }
    }
  }

  // Mount MutationObserver
  const observer = new MutationObserver(scanDraftRoom);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  window.__fantasyDrafterActive = observer;

  // Poll fallback & heartbeat
  const scanTimer = setInterval(scanDraftRoom, 800);
  const pingTimer = setInterval(sendPing, 4000);
  window.__fantasyDrafterTimers = [scanTimer, pingTimer];

  sendPing();
  scanDraftRoom();
  console.log('⚡ [Fantasy Drafter] ESPN Draft Room observer initialized.');
})();
