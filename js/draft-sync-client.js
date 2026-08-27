// ⚡ Live Draft Synchronization Client for Fantasy Drafter (Sleeper & ESPN)
(function (global) {
  const SYNC_CHANNEL_NAME = 'fantasy_drafter_sync';

  let syncState = {
    type: 'off', // 'off' | 'sleeper' | 'espn'
    sleeperTimer: null,
    sleeperStatus: 'Disconnected',
    sleeperLastPoll: null,
    sleeperPicksCount: 0,
    espnConnected: false,
    espnLastSeen: null,
    channel: null,
    activeTab: 'sleeper'
  };

  let serverRelaySource = null;
  let serverPollTimer = null;
  let lastSyncTimestamp = 0;

  function reportServerPick(data) {
    const host = window.location.origin.startsWith('http') ? window.location.origin : 'http://127.0.0.1:8517';
    try {
      fetch(host + '/api/sync/pick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        mode: 'cors'
      }).catch(() => { });
    } catch (e) { }
  }

  function reportServerEvent(message, type) {
    const host = window.location.origin.startsWith('http') ? window.location.origin : 'http://127.0.0.1:8517';
    try {
      fetch(host + '/api/sync/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message, type: type || 'info' }),
        mode: 'cors'
      }).catch(() => { });
    } catch (e) { }
  }

  function initBroadcastSync() {
    // 1. Cross-Origin Local HTTP Relay (SSE & Polling)
    initServerSyncRelay();

    // 2. Window postMessage Listener (in case opened via window.opener)
    window.addEventListener('message', function (e) {
      if (e.data && typeof e.data === 'object' && e.data.source === 'espn') {
        handleIncomingSyncEvent(e.data);
      }
    });

    // 3. BroadcastChannel (same-origin fallback)
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        if (syncState.channel) syncState.channel.close();
        syncState.channel = new BroadcastChannel(SYNC_CHANNEL_NAME);
        syncState.channel.onmessage = function (e) {
          if (!e.data) return;
          handleIncomingSyncEvent(e.data);
        };
        syncState.channel.postMessage({ type: 'PING', source: 'drafter' });
      } catch (err) {
        console.warn('BroadcastChannel error:', err);
      }
    }
  }

  function startFallbackPolling() {
    if (!serverPollTimer) {
      serverPollTimer = setInterval(pollServerSync, 3000);
      pollServerSync();
    }
  }

  function stopFallbackPolling() {
    if (serverPollTimer) {
      clearInterval(serverPollTimer);
      serverPollTimer = null;
    }
  }

  function initServerSyncRelay() {
    const host = window.location.origin.startsWith('http') ? window.location.origin : 'http://127.0.0.1:8517';

    // Try Server-Sent Events (SSE) as primary zero-poll real-time channel
    try {
      if (serverRelaySource) {
        serverRelaySource.close();
        serverRelaySource = null;
      }
      serverRelaySource = new EventSource(host + '/api/sync/events');

      serverRelaySource.onopen = function () {
        // SSE connected! Shut down any fallback polling timer
        stopFallbackPolling();
      };

      serverRelaySource.onmessage = function (e) {
        if (!e.data) return;
        stopFallbackPolling();
        try {
          const data = JSON.parse(e.data);
          handleIncomingSyncEvent(data);
        } catch (err) { }
      };

      serverRelaySource.onerror = function () {
        // SSE disconnected or unavailable: activate fallback polling
        startFallbackPolling();
      };
    } catch (e) {
      startFallbackPolling();
    }
  }

  async function pollServerSync() {
    const host = window.location.origin.startsWith('http') ? window.location.origin : 'http://127.0.0.1:8517';
    try {
      const res = await fetch(host + '/api/sync/poll?since=' + lastSyncTimestamp, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (data.serverTime) lastSyncTimestamp = data.serverTime;

      if (data.espnConnected) {
        syncState.espnConnected = true;
        syncState.espnLastSeen = data.lastSeen || Date.now();
        if (syncState.type !== 'sleeper') {
          syncState.type = 'espn';
        }
        updateSyncBadge();
        updateEspnStatusBox();
      } else {
        if (syncState.type === 'espn' && (Date.now() - (syncState.espnLastSeen || 0) > 30000)) {
          syncState.espnConnected = false;
          syncState.type = 'off';
          updateSyncBadge();
          updateEspnStatusBox();
        }
      }

      if (Array.isArray(data.picks)) {
        for (const p of data.picks) {
          handleRemotePickEvent(p);
        }
      }
    } catch (err) {
      // Server might be running on file:// without local backend or offline
    }
  }

  function handleIncomingSyncEvent(data) {
    if (!data) return;
    if (data.type === 'SYNC_CONNECTED' || data.type === 'PONG' || data.type === 'SYNC_STATUS') {
      if (data.espnConnected !== false) {
        syncState.espnConnected = true;
        syncState.espnLastSeen = data.timestamp || data.lastSeen || Date.now();
        if (syncState.type !== 'sleeper') {
          syncState.type = 'espn';
        }
        updateSyncBadge();
        updateEspnStatusBox();
      }
    } else if (data.type === 'PICK_MADE') {
      syncState.espnConnected = true;
      syncState.espnLastSeen = data.timestamp || Date.now();
      if (syncState.type !== 'sleeper') {
        syncState.type = 'espn';
      }
      updateSyncBadge();
      updateEspnStatusBox();
      handleRemotePickEvent(data);
    }
  }

  function handleRemotePickEvent(pickData) {
    const overall = pickData.overall || currentPick();
    const existingIdx = global.state.log.findIndex(e => e.overall === overall);

    const resolved = resolveRemotePick(pickData, global.PLAYERS, { unlistedFallback: global.state.settings.autoUnlistedSync !== false });
    if (!resolved) return;

    const slotInfo = teamForOverall(overall, global.state.settings.teams, global.state.settings.mode, global.state.settings.teamNames, global.state.settings.slot, global.state.tradedPicks);
    const isMine = slotInfo.isMe;

    const entry = {
      overall: overall,
      playerId: resolved.playerId,
      customName: resolved.customName || null,
      customPos: resolved.customPos || null,
      customTeam: resolved.customTeam || null,
      customBye: resolved.customBye || null,
      mine: isMine
    };

    if (existingIdx >= 0) {
      global.state.log[existingIdx] = entry;
    } else {
      global.state.log.push(entry);
    }

    // Guarantee chronological ascending pick order
    global.state.log.sort((a, b) => a.overall - b.overall);

    if (resolved.playerId != null) {
      global.state.watchlist = cleanWatchlist(global.state.watchlist, [resolved.playerId]);
      if (typeof cleanQueue === 'function') {
        global.state.queue = cleanQueue(global.state.queue, [resolved.playerId]);
      }
    }

    global.save();
    if (typeof global.render === 'function') global.render();
  }

  function updateSyncBadge() {
    const badge = document.getElementById('syncbadge');
    if (!badge) return;

    if (syncState.type === 'sleeper' && syncState.sleeperTimer) {
      badge.className = 'sync-badge sleeper';
      badge.innerHTML = '<span class="dot-pulse"></span> Sleeper (#' + global.state.log.length + ')';
    } else if (syncState.type === 'espn' && syncState.espnConnected) {
      badge.className = 'sync-badge espn';
      badge.innerHTML = '<span class="dot-pulse"></span> ESPN Live';
    } else if (syncState.type === 'sleeper') {
      badge.className = 'sync-badge polling';
      badge.innerHTML = 'Sleeper (Paused)';
    } else {
      badge.className = 'sync-badge off';
      badge.innerHTML = 'OFF';
    }
  }

  function extractSleeperDraftId(input) {
    if (!input) return '';
    const str = String(input).trim();
    const urlMatch = str.match(/drafts?(?:\/nfl)?\/([a-zA-Z0-9_-]+)/i);
    if (urlMatch && urlMatch[1]) return urlMatch[1];
    return str;
  }

  async function importSleeperLeague() {
    const draftIdInput = document.getElementById('sync_sleeper_draft_id');
    const userInput = document.getElementById('sync_sleeper_username');
    const rawId = draftIdInput ? draftIdInput.value : global.state.settings.sleeperDraftId;
    const draftId = extractSleeperDraftId(rawId);
    const username = userInput ? userInput.value.trim() : global.state.settings.sleeperUsername;

    if (!draftId) {
      alert('Please enter a Sleeper Draft ID or League URL.');
      return;
    }

    global.state.settings.sleeperDraftId = draftId;
    global.state.settings.sleeperUsername = username;
    global.save();

    const statusEl = document.getElementById('sleeper_import_msg');
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--accent)">⏳ Fetching draft from Sleeper API...</span>';

    try {
      const draftRes = await fetch('https://api.sleeper.app/v1/draft/' + encodeURIComponent(draftId));
      if (!draftRes.ok) throw new Error('Sleeper draft not found (Status ' + draftRes.status + ')');
      const draftData = await draftRes.json();

      let usersData = [];
      if (draftData.league_id) {
        try {
          const usersRes = await fetch('https://api.sleeper.app/v1/league/' + encodeURIComponent(draftData.league_id) + '/users');
          if (usersRes.ok) usersData = await usersRes.json();
        } catch (uErr) { /* users fetch optional */ }
      }

      const parsed = parseSleeperDraft(draftData, usersData, username);
      if (!parsed) throw new Error('Could not parse Sleeper draft configuration');

      global.state.settings.leagueName = parsed.leagueName;
      global.state.settings.teams = parsed.teams;
      global.state.settings.rounds = parsed.rounds;
      global.state.settings.mode = parsed.mode;
      global.state.settings.teamNames = parsed.teamNames;
      global.state.settings.slot = parsed.slot;

      global.save();
      if (typeof global.bindHeaderControls === 'function') global.bindHeaderControls();
      if (typeof global.render === 'function') global.render();

      if (statusEl) {
        statusEl.innerHTML = '<span style="color:var(--good); font-weight:600">✅ Successfully imported '
          + parsed.teams + '-team league: <b>' + parsed.leagueName + '</b> (' + parsed.mode.toUpperCase() + ') · Assigned Slot ' + parsed.slot + '!</span>';
      }
      reportServerEvent('🏈 Sleeper Draft Connected: ' + parsed.leagueName + ' (' + parsed.teams + '-team ' + parsed.mode.toUpperCase() + ') · Assigned Slot ' + parsed.slot, 'success');
    } catch (err) {
      console.error('Sleeper import error:', err);
      if (statusEl) {
        statusEl.innerHTML = '<span style="color:var(--bad)">❌ Failed to import from Sleeper: ' + err.message + '</span>';
      }
    }
  }

  async function pollSleeperPicks() {
    const draftId = global.state.settings.sleeperDraftId || extractSleeperDraftId(document.getElementById('sync_sleeper_draft_id')?.value);
    if (!draftId) return;

    try {
      const res = await fetch('https://api.sleeper.app/v1/draft/' + encodeURIComponent(draftId) + '/picks');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const picks = await res.json();

      if (Array.isArray(picks)) {
        syncState.sleeperPicksCount = picks.length;
        syncState.sleeperLastPoll = new Date().toLocaleTimeString();
        syncState.sleeperStatus = 'Active (' + picks.length + ' picks)';

        const prevLen = global.state.log.length;
        const rec = reconcileDraftLog(global.state.log, picks, global.PLAYERS, global.state.settings);
        if (rec.changed) {
          global.state.log = rec.log;
          const taken = global.takenMap();
          global.state.watchlist = cleanWatchlist(global.state.watchlist, taken);
          if (typeof cleanQueue === 'function') {
            global.state.queue = cleanQueue(global.state.queue, taken);
          }
          global.save();
          if (typeof global.render === 'function') global.render();

          if (rec.added > 0) {
            for (let i = prevLen; i < global.state.log.length; i++) {
              const entry = global.state.log[i];
              const p = entry.playerId != null ? global.PLAYERS[entry.playerId] : null;
              const name = entry.customName || (p ? p.name : 'Unknown');
              const pos = entry.customPos || (p ? p.pos : '');
              const team = entry.customTeam || (p ? p.team : '');
              const who = teamForOverall(entry.overall, global.state.settings.teams, global.state.settings.mode, global.state.settings.teamNames, global.state.settings.slot, global.state.tradedPicks);
              reportServerPick({
                source: 'sleeper',
                overall: entry.overall,
                name: name,
                pos: pos,
                team: team,
                by: who.name + (who.isMe ? ' (You)' : '')
              });
            }
          }
          if (rec.rolledBack > 0) {
            reportServerEvent('↩️ Rolled back ' + rec.rolledBack + ' pick(s) to match Sleeper history (Now at #' + global.state.log.length + ')', 'warn');
          }
        }
      }
      updateSyncBadge();
      updateSleeperStatusBox();
    } catch (err) {
      syncState.sleeperStatus = 'Polling error: ' + err.message;
      updateSleeperStatusBox();
    }
  }

  function toggleSleeperSync() {
    const draftIdInput = document.getElementById('sync_sleeper_draft_id');
    const userInput = document.getElementById('sync_sleeper_username');
    const rawId = draftIdInput ? draftIdInput.value : global.state.settings.sleeperDraftId;
    const draftId = extractSleeperDraftId(rawId);
    const username = userInput ? userInput.value.trim() : global.state.settings.sleeperUsername;

    if (!draftId) {
      alert('Please enter a Sleeper Draft ID or League URL first.');
      return;
    }

    global.state.settings.sleeperDraftId = draftId;
    global.state.settings.sleeperUsername = username;
    global.save();

    if (syncState.sleeperTimer) {
      clearInterval(syncState.sleeperTimer);
      syncState.sleeperTimer = null;
      syncState.type = 'off';
      syncState.sleeperStatus = 'Paused';
      updateSyncBadge();
      updateSleeperStatusBox();
    } else {
      syncState.type = 'sleeper';
      syncState.sleeperStatus = 'Connecting...';
      updateSyncBadge();
      pollSleeperPicks();
      syncState.sleeperTimer = setInterval(pollSleeperPicks, 2000);
      updateSleeperStatusBox();
    }
  }

  function updateSleeperStatusBox() {
    const box = document.getElementById('sleeper_status_box');
    const toggleBtn = document.getElementById('sleeper_toggle_btn');
    if (toggleBtn) {
      if (syncState.sleeperTimer) {
        toggleBtn.textContent = '⏸ Pause Live Polling';
        toggleBtn.className = 'act mine';
      } else {
        toggleBtn.textContent = '▶ Start Live Sync (2s Polling)';
        toggleBtn.className = 'act primary';
      }
    }
    if (box) {
      box.innerHTML = '<div><b>Status:</b> ' + (syncState.sleeperTimer ? '<span style="color:var(--good); font-weight:700">🟢 Active (2s Polling)</span>' : '<span style="color:var(--dim)">⚪ Disconnected / Paused</span>') + '</div>'
        + '<div><b>Picks on Sleeper:</b> ' + syncState.sleeperPicksCount + ' (Local: ' + global.state.log.length + ')</div>'
        + '<div><b>Last Polled:</b> ' + (syncState.sleeperLastPoll || '—') + '</div>';
    }
  }

  function updateEspnStatusBox() {
    const box = document.getElementById('espn_status_box');
    if (box) {
      const isConn = syncState.espnConnected && (Date.now() - (syncState.espnLastSeen || 0) < 30000);
      box.innerHTML = '<div><b>Extension Status:</b> '
        + (isConn ? '<span style="color:var(--good); font-weight:700">🟢 Connected to ESPN Draft Room</span>' : '<span style="color:var(--warn)">⚪ Waiting for ESPN Draft Room tab (Auto-connects when tab is open)</span>')
        + '</div>'
        + '<div><b>Last Message:</b> ' + (syncState.espnLastSeen ? new Date(syncState.espnLastSeen).toLocaleTimeString() : 'None') + '</div>'
        + '<div style="font-size:11px; margin-top:4px; color:var(--dim)">Relay endpoint: <code style="color:var(--accent)">http://127.0.0.1:8517/api/sync/</code></div>';
    }
  }

  function switchSyncTab(tabName) {
    syncState.activeTab = tabName;
    for (const t of ['sleeper', 'espn', 'settings']) {
      const btn = document.getElementById('sync_tab_' + t);
      const sec = document.getElementById('sync_sec_' + t);
      if (btn) btn.className = 'tab' + (t === tabName ? ' on' : '');
      if (sec) sec.style.display = (t === tabName ? 'block' : 'none');
    }
  }

  function copyExtensionPath() {
    const path = 'd:\\Programming\\FantasyDrafter\\extensions\\espn-sync';
    const btn = document.getElementById('copy_ext_btn');
    if (navigator.clipboard) {
      navigator.clipboard.writeText(path).then(() => {
        if (btn) {
          const orig = btn.innerHTML;
          btn.innerHTML = '✅ Copied!';
          btn.style.color = 'var(--good)';
          setTimeout(() => {
            btn.innerHTML = orig;
            btn.style.color = '';
          }, 2000);
        }
      }).catch(() => {
        prompt('Extension folder path:', path);
      });
    } else {
      prompt('Extension folder path:', path);
    }
  }

  async function sendEspnPing() {
    const host = window.location.origin.startsWith('http') ? window.location.origin : 'http://127.0.0.1:8517';
    try {
      await fetch(host + '/api/sync/ping', { method: 'POST', mode: 'cors' });
    } catch (e) { }
    if (syncState.channel) {
      try { syncState.channel.postMessage({ type: 'PING', source: 'drafter' }); } catch (e) { }
    }
    setTimeout(pollServerSync, 200);
  }

  function openSyncModal() {
    const s = global.state.settings;
    const sleeperIdVal = s.sleeperDraftId || '';
    const sleeperUserVal = s.sleeperUsername || '';

    document.getElementById('modalbox').innerHTML =
      '<h3>⚡ Live Draft Synchronization'
      + '<button class="close" onclick="closeModal()">×</button></h3>'
      + '<div style="font-size:12.5px; color:var(--dim); margin:6px 0 14px">Sync your live draft board with an ongoing online draft on Sleeper or ESPN.</div>'
      + '<div class="tabs" style="gap:6px; margin-bottom:14px">'
      + '<button type="button" class="tab' + (syncState.activeTab === 'sleeper' ? ' on' : '') + '" id="sync_tab_sleeper" onclick="switchSyncTab(\'sleeper\')">🏈 Sleeper API</button>'
      + '<button type="button" class="tab' + (syncState.activeTab === 'espn' ? ' on' : '') + '" id="sync_tab_espn" onclick="switchSyncTab(\'espn\')">📺 ESPN Extension Sync</button>'
      + '<button type="button" class="tab' + (syncState.activeTab === 'settings' ? ' on' : '') + '" id="sync_tab_settings" onclick="switchSyncTab(\'settings\')">⚙️ Cues & Options</button>'
      + '</div>'
      // --- Sleeper Tab ---
      + '<div id="sync_sec_sleeper" style="display:' + (syncState.activeTab === 'sleeper' ? 'block' : 'none') + '">'
      + '<div class="setup-grid" style="grid-template-columns: 1fr 1fr; gap:10px">'
      + '<div class="setup-field" style="grid-column: 1 / -1;"><label>Sleeper Draft ID or League URL</label><input type="text" id="sync_sleeper_draft_id" placeholder="e.g. 10492850284 or https://sleeper.com/draft/nfl/1049..." value="' + sleeperIdVal.replace(/"/g, '&quot;') + '"></div>'
      + '<div class="setup-field" style="grid-column: 1 / -1;"><label>Your Sleeper Username (Optional for Auto-Slot Matching)</label><input type="text" id="sync_sleeper_username" placeholder="e.g. Ken" value="' + sleeperUserVal.replace(/"/g, '&quot;') + '"></div>'
      + '</div>'
      + '<div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:12px">'
      + '<button type="button" class="act" onclick="importSleeperLeague()">📥 Import League & Order</button>'
      + '<button type="button" class="act primary" id="sleeper_toggle_btn" onclick="toggleSleeperSync()">' + (syncState.sleeperTimer ? '⏸ Pause Live Polling' : '▶ Start Live Sync (2s Polling)') + '</button>'
      + '</div>'
      + '<div id="sleeper_import_msg" style="margin-top:10px; font-size:12.5px"></div>'
      + '<div class="sync-status-box" id="sleeper_status_box"></div>'
      + '</div>'
      // --- ESPN Tab ---
      + '<div id="sync_sec_espn" style="display:' + (syncState.activeTab === 'espn' ? 'block' : 'none') + '">'
      + '<div style="background:var(--panel2); border:1px solid var(--border); border-radius:8px; padding:14px; margin-bottom:12px">'
      + '<div style="font-size:13.5px; font-weight:700; color:var(--text); margin-bottom:6px">🔌 ESPN Live Sync Extension Setup</div>'
      + '<div style="font-size:12px; color:var(--dim); line-height:1.6">'
      + 'Streams live picks from ESPN automatically with 0 clicks during the draft:'
      + '<ol style="margin:8px 0 10px 18px; padding:0">'
      + '<li>Open <code style="color:var(--accent); background:var(--bg); padding:1px 5px; border-radius:3px">chrome://extensions</code> or <code style="color:var(--accent); background:var(--bg); padding:1px 5px; border-radius:3px">edge://extensions</code> in your browser.</li>'
      + '<li>Toggle on <b>Developer mode</b> in the top-right corner.</li>'
      + '<li>Click <b>Load unpacked</b> and select the extension folder:</li>'
      + '</ol>'
      + '</div>'
      + '<div style="display:flex; align-items:center; gap:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; padding:8px 12px">'
      + '<code id="ext_path_text" style="color:var(--good); font-size:12px; user-select:all; flex:1; overflow:hidden; text-overflow:ellipsis">d:\\Programming\\FantasyDrafter\\extensions\\espn-sync</code>'
      + '<button type="button" class="act" id="copy_ext_btn" onclick="copyExtensionPath()" style="padding:4px 10px; font-size:12px">📋 Copy Path</button>'
      + '</div>'
      + '</div>'
      + '<div class="sync-status-box" id="espn_status_box"></div>'
      + '<div style="margin-top:10px; display:flex; justify-content:space-between; align-items:center">'
      + '<span style="font-size:11.5px; color:var(--dim)">Auto-connects when ESPN draft room is open</span>'
      + '<button type="button" class="act" onclick="sendEspnPing()">🔄 Ping ESPN Tab</button>'
      + '</div>'
      + '</div>'
      // --- Settings Tab ---
      + '<div id="sync_sec_settings" style="display:' + (syncState.activeTab === 'settings' ? 'block' : 'none') + '">'
      + '<div style="display:flex; flex-direction:column; gap:10px; margin-top:8px">'
      + '<label style="display:flex; align-items:center; gap:8px; font-size:13px; cursor:pointer"><input type="checkbox" id="sync_opt_chime"' + (s.audioChime ? ' checked' : '') + '> 🔔 Play auditory chime when our team is on the clock</label>'
      + '<label style="display:flex; align-items:center; gap:8px; font-size:13px; cursor:pointer"><input type="checkbox" id="sync_opt_pulse"' + (s.visualPulse ? ' checked' : '') + '> ✨ Pulsing green visual glow on header clock during our turn</label>'
      + '<label style="display:flex; align-items:center; gap:8px; font-size:13px; cursor:pointer"><input type="checkbox" id="sync_opt_unlisted"' + (s.autoUnlistedSync ? ' checked' : '') + '> 📝 Auto-draft unlisted players if not found in consensus rankings</label>'
      + '<label style="display:flex; align-items:center; gap:8px; font-size:13px; cursor:pointer"><input type="checkbox" id="sync_opt_rollback"' + (s.syncRollback ? ' checked' : '') + '> ↩ Auto-reconcile picks if commissioner rolls back a pick</label>'
      + '</div>'
      + '<div style="margin-top:14px; display:flex; gap:8px">'
      + '<button type="button" class="act" onclick="playPickChime(true)">🔔 Test Audio Chime</button>'
      + '<button type="button" class="act primary" onclick="saveSyncSettings()">Save Options</button>'
      + '</div>'
      + '</div>'
      + '<div class="modal-actions" style="margin-top:18px">'
      + '<button type="button" class="act" onclick="closeModal()">Close</button>'
      + '</div>';

    document.getElementById('overlay').classList.add('show');
    updateSleeperStatusBox();
    updateEspnStatusBox();
    sendEspnPing();
  }

  function saveSyncSettings() {
    global.state.settings.audioChime = document.getElementById('sync_opt_chime') ? document.getElementById('sync_opt_chime').checked : true;
    global.state.settings.visualPulse = document.getElementById('sync_opt_pulse') ? document.getElementById('sync_opt_pulse').checked : true;
    global.state.settings.autoUnlistedSync = document.getElementById('sync_opt_unlisted') ? document.getElementById('sync_opt_unlisted').checked : true;
    global.state.settings.syncRollback = document.getElementById('sync_opt_rollback') ? document.getElementById('sync_opt_rollback').checked : true;
    global.save();
    if (typeof global.closeModal === 'function') global.closeModal();
    if (typeof global.render === 'function') global.render();
  }

  // Export to global scope
  global.syncState = syncState;
  global.reportServerPick = reportServerPick;
  global.reportServerEvent = reportServerEvent;
  global.initBroadcastSync = initBroadcastSync;
  global.initServerSyncRelay = initServerSyncRelay;
  global.startFallbackPolling = startFallbackPolling;
  global.stopFallbackPolling = stopFallbackPolling;
  global.pollServerSync = pollServerSync;
  global.handleIncomingSyncEvent = handleIncomingSyncEvent;
  global.handleRemotePickEvent = handleRemotePickEvent;
  global.updateSyncBadge = updateSyncBadge;
  global.extractSleeperDraftId = extractSleeperDraftId;
  global.importSleeperLeague = importSleeperLeague;
  global.pollSleeperPicks = pollSleeperPicks;
  global.toggleSleeperSync = toggleSleeperSync;
  global.updateSleeperStatusBox = updateSleeperStatusBox;
  global.updateEspnStatusBox = updateEspnStatusBox;
  global.switchSyncTab = switchSyncTab;
  global.copyExtensionPath = copyExtensionPath;
  global.sendEspnPing = sendEspnPing;
  global.openSyncModal = openSyncModal;
  global.saveSyncSettings = saveSyncSettings;
})(typeof window !== 'undefined' ? window : globalThis);

