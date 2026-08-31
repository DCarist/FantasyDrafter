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

  function isPlaceholderName(name) {
    if (!name) return true;
    const clean = String(name).trim().toLowerCase();
    if (clean.length < 3) return true;
    if (/^(on\s*the\s*clock|the\s*clock|clock|drafting|picking|auto\s*pick|autopick|auto|make|make\s*pick|time\s*expired|available|empty|open|player|unknown|skipped|none)$/i.test(clean)) {
      return true;
    }
    if (/^[0-9]+(\.[0-9]+)?$/.test(clean)) return true;
    if (/^auto\b/i.test(clean)) return true;
    if (/^pick\s*[0-9]+/i.test(clean)) return true;

    // Reject known fantasy team names
    if (detectedTeamNames && detectedTeamNames.length > 0) {
      for (const t of detectedTeamNames) {
        if (t) {
          const tClean = t.trim().toLowerCase();
          if (clean === tClean || clean.includes(tClean)) return true;
        }
      }
    }
    return false;
  }

  function isExcludedContainer(el) {
    if (!el) return false;
    if (el.closest('.pickTrain, [class*="pickTrain" i], .pick-train__content, .picklist, [data-testid="current-pick"], [data-testid="clock"], .on-the-clock, .pick-queue, [class*="pick-queue" i], .roster-module, [class*="roster" i], [class*="autoPick" i]')) {
      return true;
    }
    if (el.classList && (el.classList.contains('upcomingPick') || el.classList.contains('onTheClockPick') || el.classList.contains('on-the-clock'))) {
      return true;
    }
    return false;
  }

  function isAvailablePlayerRow(el) {
    if (!el) return false;
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
    // 1. Scan modern ESPN draft board header cells (.draft-board-grid-header-cell)
    const boardHeaderCells = document.querySelectorAll('.draft-board-grid-header-cell, [class*="draft-board-grid-header-cell" i]');
    if (boardHeaderCells.length >= 8 && boardHeaderCells.length <= 16) {
      const names = [];
      let mySlot = null;
      boardHeaderCells.forEach((h, idx) => {
        const text = (h.innerText || '').trim();
        if (text) {
          names.push(text);
          if (h.classList.contains('myTeam') || h.classList.contains('onTheClock') || h.querySelector('.myTeam, [class*="myTeam" i]')) {
            mySlot = idx + 1;
          }
        }
      });
      if (names.length >= 8 && names.length <= 16) {
        detectedLeagueTeams = names.length;
        detectedTeamNames = names;
        if (mySlot) detectedMySlot = mySlot;
        return { teams: detectedLeagueTeams, teamNames: detectedTeamNames, mySlot: detectedMySlot };
      }
    }

    // 2. Scan generic column headers above the Draft Board grid
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

    // 3. Fallback: check max pick in round R.P across board cells
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

  function scanDraftRoom(force) {
    const leagueInfo = detectLeagueInfo();
    const detectedPicks = new Map();

    // =========================================================================
    // Strategy 1 (PRIMARY): Modern ESPN Draft Board Cells (.draft-board-grid-pick-cell.completedPick)
    // Matches the exact DOM structure in ESPN Live Draft rooms
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
      if (!name || isPlaceholderName(name)) return;

      const teamEl = cell.querySelector('.playerProTeam, [class*="playerProTeam" i]');
      const posEl = cell.querySelector('.positionPill, [class*="positionPill" i]');
      const rpEl = cell.querySelector('.roundPick, [class*="roundPick" i]');

      const pos = posEl ? posEl.innerText.trim().toUpperCase() : '';
      let team = teamEl ? teamEl.innerText.trim().toUpperCase() : '';
      if (TEAM_NORM[team]) team = TEAM_NORM[team];

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
        if (!parsed || !parsed.name || isPlaceholderName(parsed.name)) return;

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
