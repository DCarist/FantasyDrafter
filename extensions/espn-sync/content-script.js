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

  function isPlaceholderName(name, teamNames = []) {
    if (!name) return true;
    const clean = String(name).trim().toLowerCase();
    if (clean.length < 3) return true;
    if (/^(on\s*the\s*clock|the\s*clock|clock|drafting|picking|auto\s*pick|autopick|auto|make|make\s*pick|time\s*expired|available|empty|open|player|unknown|skipped|none)$/i.test(clean)) {
      return true;
    }
    if (/^[0-9]+(\.[0-9]+)?$/.test(clean)) return true;
    if (/^auto\b/i.test(clean)) return true;
    if (/^pick\s*[0-9]+/i.test(clean)) return true;
    if (/^team\s*[0-9]+$/i.test(clean)) return true;

    // Reject exact matches against league team names (e.g. "Dynamic Team Alpha", "Bravo Squad")
    const allTeams = [...(teamNames || []), ...(detectedTeamNames || [])];
    for (const t of allTeams) {
      if (t && typeof t === 'string') {
        const tClean = t.trim().toLowerCase();
        if (tClean && clean === tClean) {
          return true;
        }
      }
    }
    return false;
  }

  function isExcludedContainer(el) {
    if (!el) return false;
    if (el.closest && el.closest('.pickTrain, .picklist, .pick-queue, .roster-limits, .roster-module, [data-testid="clock"], [data-testid="current-pick"], .upcomingPick, .onTheClockPick, .makePickButton, .toastAlertWrapper')) {
      return true;
    }
    if (el.classList && (
      el.classList.contains('upcomingPick') ||
      el.classList.contains('onTheClockPick') ||
      el.classList.contains('on-the-clock') ||
      el.classList.contains('pickTrain') ||
      el.classList.contains('picklist') ||
      el.classList.contains('makePickButton')
    )) {
      return true;
    }
    return false;
  }

  function createPill() {
    if (pill && document.body.contains(pill)) return;
    if (pill) pill.remove();
    pill = document.createElement('div');
    pill.id = 'fantasy-drafter-extension-pill';
    pill.innerHTML = '⚡ <b>Fantasy Drafter:</b> Connecting...';
    Object.assign(pill.style, {
      position: 'fixed',
      top: '18px',
      left: '18px',
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
    if (!pill) createPill();
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
      top: '60px',
      left: '18px',
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
    if (isPlaceholderName(rawText, detectedTeamNames)) return null;
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
      } else if (!/^[0-9]+(\.[0-9]+)?$/.test(t)) {
        nameParts.push(t);
      }
    }

    const name = nameParts.join(' ').trim();
    if (!name || isPlaceholderName(name, detectedTeamNames)) return null;
    return { name, pos, team };
  }

  function extractPlayerFromElement(el) {
    if (!el || isExcludedContainer(el)) return null;
    const txt = (el.innerText || '').trim();

    // 1. Look for explicit player anchor link or athlete name class
    const linkEl = el.querySelector('a[href*="/player/"], .player-name, [class*="playerName" i], [class*="athlete" i], .AnchorLink');
    if (linkEl && linkEl.innerText && linkEl.innerText.trim().length >= 3) {
      const linkName = linkEl.innerText.trim();
      if (!isPlaceholderName(linkName, detectedTeamNames)) {
        const parsed = parsePlayerText(linkName);
        if (parsed && parsed.name) {
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
    return parsePlayerText(txt);
  }

  function extractPickNumber(text, teamsCount) {
    if (!text) return null;
    const str = String(text).trim();

    // 1. Check for Round.Pick format like "1.1", "1.14", "3.01", "10.14"
    const roundPickMatch = str.match(/\b([0-9]{1,2})\.([0-9]{1,2})\b/);
    if (roundPickMatch) {
      const r = parseInt(roundPickMatch[1], 10);
      const p = parseInt(roundPickMatch[2], 10);
      const t = teamsCount || detectedLeagueTeams || 12;
      if (r >= 1 && p >= 1 && p <= t) {
        return (r - 1) * t + p;
      }
    }

    // 2. Check for explicit overall like "Pick 37", "#37", "Pk 37", "P50"
    const explicitMatch = str.match(/(?:pick|pk|#|p)\s*([0-9]{1,3})\b/i);
    if (explicitMatch) {
      const num = parseInt(explicitMatch[1], 10);
      if (!isNaN(num) && num > 0 && num <= 600) return num;
    }

    // 3. Standalone integer
    const directMatch = str.match(/^([0-9]{1,3})\.?$/);
    if (directMatch) {
      const num = parseInt(directMatch[1], 10);
      if (!isNaN(num) && num > 0 && num <= 600) return num;
    }

    return null;
  }

  function isAvailablePlayerRow(el) {
    if (!el) return false;
    if (isExcludedContainer(el)) return true;
    if (el.querySelector('button[aria-label*="Draft" i], button[title*="Draft" i], button.btn-draft, [data-testid*="draft-button"], button[aria-label*="Queue" i], [data-testid*="queue-button"]')) {
      return true;
    }
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
    let names = [];
    let mySlot = null;
    let myTeamName = '';

    // 0. Extract user's draft slot and team name from right sidebar ("Your draft" / "Your first pick: Round 1, Pick X")
    const bodyText = document.body ? document.body.innerText : '';
    const yourFirstPickMatch = bodyText.match(/Your\s*first\s*pick\s*:\s*Round\s*1\s*,\s*Pick\s*(\d+)/i)
      || bodyText.match(/first\s*pick\s*:\s*(?:Round\s*1\s*,\s*)?(?:Pick\s*|#)(\d+)/i);
    if (yourFirstPickMatch) {
      const slotNum = parseInt(yourFirstPickMatch[1], 10);
      if (slotNum >= 1 && slotNum <= 16) {
        mySlot = slotNum;
      }
    }

    // Look for user's team name in the "Your draft" panel / user header
    const userHeaderEl = document.querySelector('[class*="userTeam" i], [class*="myTeam" i], [class*="yourDraft" i], .draft-column:last-child');
    if (userHeaderEl) {
      const userText = userHeaderEl.innerText || '';
      const userLines = userText.split('\n').map(l => l.trim()).filter(l => l && !/^(your draft|players|pick history|roster|2026 projected|projected|all|rank|player|empty|pos|round|pick|autopick)/i.test(l));
      if (userLines.length > 0 && userLines[0].length >= 2) {
        myTeamName = userLines[0];
      }
    }

    // 1. Scan modern ESPN draft board header cells (.draft-board-grid-header-cell) (When on "Board" tab)
    const boardHeaderCells = document.querySelectorAll('.draft-board-grid-header-cell, [class*="draft-board-grid-header-cell" i]');
    if (boardHeaderCells.length >= 8 && boardHeaderCells.length <= 16) {
      const bNames = [];
      boardHeaderCells.forEach((h, idx) => {
        const text = (h.innerText || '').trim();
        if (text) {
          bNames.push(text);
          if (h.classList.contains('myTeam') || h.classList.contains('onTheClock') || h.querySelector('.myTeam, [class*="myTeam" i]')) {
            if (mySlot === null) mySlot = idx + 1;
          }
        }
      });
      if (bNames.length >= 8 && bNames.length <= 16) {
        names = bNames;
      }
    }

    // 2. Scan Top Pick Train for Round 1 items (Pick 1 .. Pick N) (Available on ALL tabs!)
    if (names.length === 0) {
      const pickTrainItems = document.querySelectorAll('.pickTrain > div, .pickTrain .upcomingPick, [class*="pickTrain" i] [class*="Pick" i], [class*="pickTrain" i] > div, [class*="pickTrain" i] > button');
      const round1Map = new Map();
      pickTrainItems.forEach(item => {
        const txt = (item.innerText || '').trim();
        if (!txt) return;
        const pickM = txt.match(/(?:pick|pk|#)\s*([0-9]{1,2})\b/i) || txt.match(/\b1\.([0-9]{1,2})\b/);
        if (pickM) {
          const pNum = parseInt(pickM[1], 10);
          if (pNum >= 1 && pNum <= 16) {
            let tName = txt.replace(/(?:pick|pk|#)\s*[0-9]{1,2}\b/gi, '')
              .replace(/\b1\.[0-9]{1,2}\b/g, '')
              .replace(/\b(on the clock|the clock|auto pick|autopick|auto|drafting|upcoming|clock)\b/gi, '')
              .replace(/^[0-9]+:[0-9]+/g, '')
              .trim();
            if (tName && tName.length >= 2) {
              round1Map.set(pNum, tName);
              if (item.classList.contains('myTeam') || item.classList.contains('user-team') || item.querySelector('.myTeam, [class*="myTeam" i]')) {
                if (mySlot === null) mySlot = pNum;
              }
            }
          }
        }
      });

      if (round1Map.size >= 8) {
        const sortedSlots = Array.from(round1Map.keys()).sort((a, b) => a - b);
        const maxSlot = Math.max(...sortedSlots);
        if (maxSlot >= 8 && maxSlot <= 16) {
          const ptNames = [];
          for (let i = 1; i <= maxSlot; i++) {
            ptNames.push(round1Map.get(i) || ('Team ' + i));
          }
          names = ptNames;
        }
      }
    }

    // 3. Scan generic column headers above the Draft Board grid
    if (names.length === 0) {
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

      const gNames = [];
      headers.forEach((h, idx) => {
        const text = (h.innerText || '').trim();
        if (text && !/^(rd|round|pick|#|[0-9]+)$/i.test(text)) {
          gNames.push(text);
          const style = window.getComputedStyle ? window.getComputedStyle(h) : {};
          const isGreen = (style.backgroundColor && (style.backgroundColor.includes('rgb(0, 1') || style.backgroundColor.includes('rgb(35, 134') || style.backgroundColor.includes('green'))) ||
            h.classList.contains('user-team') || h.classList.contains('my-team') || h.getAttribute('data-is-me') === 'true' ||
            /\b(you|my team)\b/i.test(text) || h.querySelector('[class*="user" i], [class*="myTeam" i], [class*="active" i]');
          if (isGreen && mySlot === null) {
            mySlot = idx + 1;
          }
        }
      });

      if (gNames.length >= 8 && gNames.length <= 16) {
        names = gNames;
      }
    }

    // 4. Try page __NEXT_DATA__ JSON script tag
    if (names.length === 0) {
      try {
        const nextScript = document.getElementById('__NEXT_DATA__');
        if (nextScript && nextScript.textContent) {
          const nextJson = JSON.parse(nextScript.textContent);
          const props = nextJson.props && nextJson.props.pageProps;
          if (props) {
            const league = props.league || props.draftDetail;
            if (league && Array.isArray(league.teams) && league.teams.length >= 8) {
              names = league.teams.map((t, idx) => t.name || (t.location ? (t.location + ' ' + (t.nickname || '')).trim() : ('Team ' + (idx + 1))));
            }
          }
        }
      } catch (e) { }
    }

    // If we have detected team names, try matching user's team name if slot was not found yet
    if (names.length > 0) {
      detectedLeagueTeams = names.length;
      detectedTeamNames = names;
      if (mySlot === null && myTeamName) {
        const cleanUserTeam = myTeamName.trim().toLowerCase();
        const foundIdx = names.findIndex(n => {
          const cleanN = n.trim().toLowerCase();
          return cleanN === cleanUserTeam || cleanN.includes(cleanUserTeam) || cleanUserTeam.includes(cleanN);
        });
        if (foundIdx >= 0) {
          mySlot = foundIdx + 1;
        }
      }
    }

    // Fallback: check max pick in round R.P across board cells
    if (names.length === 0) {
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
    }

    // Fallback for mySlot from URL teamId query parameter
    if (mySlot === null) {
      try {
        const params = new URLSearchParams(window.location.search);
        const tId = parseInt(params.get('teamId') || params.get('slot'), 10);
        if (tId && tId >= 1 && tId <= detectedLeagueTeams) {
          mySlot = tId;
        }
      } catch (e) { }
    }

    if (mySlot !== null) {
      detectedMySlot = mySlot;
    }

    return {
      teams: detectedLeagueTeams,
      teamNames: detectedTeamNames,
      mySlot: detectedMySlot
    };
  }

  // Relay helper that uses chrome.runtime.sendMessage to background service worker (bypasses loopback PNA block)
  function postRelay(endpoint, payload) {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        try {
          chrome.runtime.sendMessage({
            type: 'RELAY_REQUEST',
            method: 'POST',
            endpoint: endpoint,
            payload: payload
          }, (response) => {
            if (chrome.runtime.lastError) {
              directFetch(endpoint, payload).then(resolve);
            } else if (response && response.success) {
              if (response.host) activeHost = response.host;
              resolve(true);
            } else {
              directFetch(endpoint, payload).then(resolve);
            }
          });
          return;
        } catch (e) {
          directFetch(endpoint, payload).then(resolve);
          return;
        }
      }
      directFetch(endpoint, payload).then(resolve);
    });
  }

  async function directFetch(endpoint, payload) {
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

    postRelay('/api/sync/snapshot', payload);
  }

  function sendPing() {
    createPill();
    postRelay('/api/sync/ping', { source: 'espn', timestamp: Date.now() }).then(ok => {
      if (ok && !isConnected) {
        isConnected = true;
        setPillStatus('connected');
      }
    });
  }

  function scanDraftRoom(force) {
    const leagueInfo = detectLeagueInfo();
    const detectedPicks = new Map();

    // =========================================================================
    // Strategy 1 (PRIMARY): Modern ESPN Draft Board Cells (.draft-board-grid-pick-cell.completedPick)
    // Matches the exact DOM structure on the "Board" tab in ESPN Live Draft rooms
    // =========================================================================
    const completedCells = document.querySelectorAll(
      '.draft-board-grid-pick-cell.completedPick, [class*="completedPick" i]'
    );

    completedCells.forEach(cell => {
      if (isExcludedContainer(cell)) return;

      const firstEl = cell.querySelector('.playerFirstName, [class*="FirstName" i]');
      const lastEl = cell.querySelector('.playerLastName, [class*="LastName" i]');
      let name = '';
      if (firstEl && lastEl) {
        name = (firstEl.innerText.trim() + ' ' + lastEl.innerText.trim()).trim();
      } else {
        const mid = cell.querySelector('.pickCellMiddle, [class*="pickCellMiddle" i]');
        name = mid ? mid.innerText.trim() : '';
      }
      if (!name) return;

      const teamEl = cell.querySelector('.playerProTeam, [class*="playerProTeam" i]');
      const posEl = cell.querySelector('.positionPill, [class*="positionPill" i]');
      const rpEl = cell.querySelector('.roundPick, [class*="roundPick" i]');

      const pos = posEl ? posEl.innerText.trim().toUpperCase() : '';
      let team = teamEl ? teamEl.innerText.trim().toUpperCase() : '';
      if (TEAM_NORM[team]) team = TEAM_NORM[team];

      if (!pos && !team && isPlaceholderName(name, detectedTeamNames)) return;

      const rpText = rpEl ? rpEl.innerText.trim() : '';
      let overall = extractPickNumber(rpText, detectedLeagueTeams) || extractPickNumber(cell.innerText, detectedLeagueTeams);

      // Fallback: grid-area: row / col
      if (!overall && cell.style && cell.style.gridArea) {
        const gridM = cell.style.gridArea.match(/(\d+)\s*\/\s*(\d+)/);
        if (gridM) {
          const round = parseInt(gridM[1], 10);
          const col = parseInt(gridM[2], 10);
          const teams = detectedLeagueTeams || 12;
          if (round % 2 === 1) {
            overall = (round - 1) * teams + col;
          } else {
            overall = (round - 1) * teams + (teams - col + 1);
          }
        }
      }

      if (overall && overall > 0 && !detectedPicks.has(overall)) {
        detectedPicks.set(overall, {
          source: 'espn',
          type: 'PICK_MADE',
          overall: overall,
          name: name,
          pos: pos,
          team: team,
          timestamp: Date.now()
        });
      }
    });

    // =========================================================================
    // Strategy 2 (FALLBACK): Pick History Table (when on "Pick History" tab)
    // Only scanned if modern board grid completedCells is empty!
    // =========================================================================
    if (completedCells.length === 0) {
      const historyRows = document.querySelectorAll(
        '.pick-history-table tbody tr, [class*="pick-history" i] tbody tr, .k-table tbody tr, [class*="pick-history" i] [class*="bodyRow" i]'
      );

      historyRows.forEach(r => {
        if (isAvailablePlayerRow(r) || isExcludedContainer(r)) return;
        const parsed = extractPlayerFromElement(r);
        if (!parsed || !parsed.name || isPlaceholderName(parsed.name, detectedTeamNames)) return;

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
    }

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
