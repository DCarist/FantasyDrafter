// 🎨 UI Component Renderers and Interactive Modals for Fantasy Drafter
(function (global) {
  const $ = id => document.getElementById(id);
  let lastOnClockPickNotified = null;
  let unlistedSelectedPos = 'WR';
  let setupDraftNames = [];
  let setupMySlot = 1;

  function renderHeader() {
    const s = global.state.settings;
    const titleEl = $('leaguetitle');
    if (titleEl) titleEl.textContent = '🏈 ' + (s.leagueName || "Ken's Draft Board");
    document.title = (s.leagueName || "Ken's Draft Board") + ' — Superflex Dynasty';
    if ($('hdrteams')) $('hdrteams').textContent = s.teams;

    // Header slot dropdown
    if ($('hdrslot')) {
      let slotOpts = '';
      for (let i = 1; i <= s.teams; i++) {
        const isMe = (i === s.slot);
        slotOpts += '<option value="' + i + '"' + (isMe ? ' selected' : '') + '>Slot ' + i + ': ' + getTeamName(i) + (isMe ? ' (You)' : '') + '</option>';
      }
      $('hdrslot').innerHTML = slotOpts;
    }

    const pick = currentPick();
    const totalPicks = s.teams * s.rounds;
    const clock = $('clock');
    if (!clock) return;

    if (pick > totalPicks) {
      clock.textContent = 'Draft complete';
      clock.className = 'clock';
      lastOnClockPickNotified = null;
    } else {
      const who = teamForOverall(pick, s.teams, s.mode, s.teamNames, s.slot, global.state.tradedPicks);
      const isMe = who.isMe;
      clock.textContent = 'Pick ' + fmtPick(pick, s.teams) + ' (#' + pick + ') — ' + who.name + (isMe ? ' (YOU ARE ON THE CLOCK)' : ' (Slot ' + who.slot + ')');

      // Auditory and visual cues for user's turn
      if (isMe) {
        clock.className = 'clock mine' + (s.visualPulse ? ' pulse-anim' : '');
        if (lastOnClockPickNotified !== pick) {
          lastOnClockPickNotified = pick;
          if (typeof playPickChime === 'function') playPickChime();
        }
      } else {
        lastOnClockPickNotified = null;
        const myPicks = picksForSlot(s.slot, s.teams, s.rounds, s.mode, global.state.tradedPicks).filter(p => p >= pick);
        if (myPicks.length && myPicks[0] - pick <= 3) {
          clock.className = 'clock soon';
        } else {
          clock.className = 'clock';
        }
      }

      const myPicks = picksForSlot(s.slot, s.teams, s.rounds, s.mode, global.state.tradedPicks).filter(p => p >= pick);
      if ($('nextpicks')) {
        $('nextpicks').innerHTML = myPicks.length
          ? 'Your next picks: ' + myPicks.slice(0, 5).map((p, i) => i === 0 ? '<b>#' + p + ' (in ' + (p - pick) + ')</b>' : '#' + p).join(', ')
          : 'No picks left';
      }
      if ($('unknownbtn')) $('unknownbtn').textContent = 'Unlisted pick for ' + who.name + ' ➜';
    }
    if (typeof updateSyncBadge === 'function') updateSyncBadge();
  }

  function scored() {
    const s = global.state.settings;
    const blend = s.blend / 100;
    return global.PLAYERS.map(p => {
      const dynRank = getDynastyRank(p, s.qbFormat);
      const redRank = getRedraftRank(p, s.qbFormat, s.scoring);
      const prospectRank = getProspectRank(p, s.qbFormat, s.scoring);
      const score = computeFormatScore(p, {
        blend: blend,
        qbFormat: s.qbFormat,
        scoring: s.scoring,
        tePremium: s.teprem,
        depth: 250
      });
      return Object.assign({
        activeDyn: dynRank,
        activeRed: redRank,
        prospectRank: prospectRank,
        score: score
      }, p);
    });
  }

  function renderPool() {
    const s = global.state.settings;
    const taken = takenMap();
    const pickOf = new Map();
    for (const e of global.state.log) if (e.playerId != null) pickOf.set(e.playerId, e);
    const q = normalizeName(global.ui.search || '');
    let rows = scored();
    if (global.ui.hideTaken) rows = rows.filter(p => !taken.has(p.id));
    if (global.ui.posFilter === 'WATCHLIST') rows = rows.filter(p => isWatched(global.state.watchlist, p.id));
    else if (global.ui.posFilter === 'ROOKIE') rows = rows.filter(p => p.rookie);
    else if (global.ui.posFilter === 'DST') rows = rows.filter(p => ['DST', 'DEF', 'D/ST'].includes((p.pos || '').toUpperCase()));
    else if (global.ui.posFilter !== 'ALL') rows = rows.filter(p => (p.pos || '').toUpperCase() === global.ui.posFilter);

    if (q) {
      const qDst = resolveDstCanonical(q);
      rows = rows.filter(p => {
        if (qDst && p.pos === 'DST' && p.team === qDst.team) return true;
        if (normalizeName(p.name).includes(q)) return true;
        if (p.team && normalizeName(p.team) === q) return true;
        return false;
      });
    }

    // Dynamic table headers
    if ($('th_dyn')) $('th_dyn').textContent = (s.qbFormat === '1qb') ? 'Dyn 1QB' : 'Dyn SF';
    if ($('th_red')) {
      const scTag = s.scoring === 'ppr' ? 'PPR' : (s.scoring === 'std' ? 'STD' : 'Half');
      $('th_red').textContent = 'Red (' + (s.qbFormat === '1qb' ? scTag : 'SF ' + scTag) + ')';
    }

    const key = {
      score: p => -(p.score ?? -1),
      dyn: p => p.activeDyn ?? 9999,
      red: p => p.activeRed ?? 9999,
      rookie: p => (p.rookie ? (p.prospectRank ?? p.activeDyn ?? 999) : 9999),
      adp: p => p.adp ?? 9999
    }[global.ui.sort] || (p => -(p.score ?? -1));

    rows.sort((a, b) => key(a) - key(b));

    const pick = currentPick();
    const onClock = teamForOverall(pick, s.teams, s.mode, s.teamNames, s.slot, global.state.tradedPicks);
    const isOurPick = onClock.isMe;
    const myRoster = getMyRosterPlayers(global.state.log, byId, s.slot, s.teams, s.mode);
    const showTiers = global.ui.sort === 'score' && !q && global.ui.posFilter !== 'ROOKIE' && global.ui.posFilter !== 'WATCHLIST';
    let html = '', prevScore = null, tier = 1;

    rows.slice(0, 250).forEach((p, idx) => {
      const isTaken = taken.has(p.id);
      let tierRow = '';
      if (showTiers && prevScore != null && p.score != null && prevScore - p.score > 4) {
        tier++;
        tierRow = ' tierbreak';
      }
      if (p.score != null) prevScore = p.score;
      const posClass = ['QB', 'RB', 'WR', 'TE'].includes(p.pos) ? p.pos : (['DST', 'DEF', 'D/ST'].includes(p.pos) ? 'DST' : (p.pos === 'K' ? 'K' : 'other'));
      const value = !isTaken && p.adp && p.adp - pick >= 8 ? ' <span class="valuetag">▼' + Math.round(p.adp - pick) + ' vs ADP</span>' : '';
      const rookieRankStr = p.rookieRank ? ' #' + p.rookieRank : '';
      const rookie = p.rookie ? '<span class="rookietag" title="Rookie Draft Rank' + rookieRankStr + '">R' + rookieRankStr + '</span>' : '';
      const age = p.age ? ' <span class="meta">' + p.age + 'y</span>' : '';
      const watched = isWatched(global.state.watchlist, p.id);
      const starBtn = !isTaken
        ? '<button type="button" class="watchbtn' + (watched ? ' active' : '') + '" title="' + (watched ? 'Remove from Watchlist' : 'Add to Watchlist') + '" onclick="toggleWatch(' + p.id + ', event)">' + (watched ? '★' : '☆') + '</button>'
        : '';

      let actionCell = '';
      if (isTaken) {
        const pickEntry = pickOf.get(p.id);
        const tInfo = teamForOverall(pickEntry.overall, s.teams, s.mode, s.teamNames, s.slot, global.state.tradedPicks);
        const isMine = taken.get(p.id) === 'me' || tInfo.isMe;
        actionCell = '<td><span class="picktag' + (isMine ? ' mine' : '') + '">'
          + (isMine ? '✅ ' : '') + tInfo.name + ' · '
          + fmtPick(pickEntry.overall, s.teams) + ' (#' + pickEntry.overall + ')</span></td>';
      } else {
        if (isOurPick) {
          actionCell = '<td style="white-space:nowrap"><button class="act mine" title="Draft ' + p.name.replace(/"/g, '&quot;') + ' for our team" onclick="draftPlayer(' + p.id + ',true)">Select our Player</button></td>';
        } else {
          actionCell = '<td style="white-space:nowrap"><button class="act" title="Record pick for ' + onClock.name.replace(/"/g, '&quot;') + '" onclick="draftPlayer(' + p.id + ',false)">Pick Player</button></td>';
        }
      }

      let byeCell = '<td class="meta">' + (p.bye || '—') + '</td>';
      if (p.bye) {
        const byeClash = getByeClashStatus(p, myRoster);
        if (byeClash.type === 'same-pos') {
          const names = byeClash.samePos.map(x => x.name).join(', ');
          const tip = 'Same-position bye clash with ' + names + ' (' + p.pos + ', Week ' + p.bye + ')';
          byeCell = '<td><span class="byetag bye-same-pos" title="' + tip.replace(/"/g, '&quot;') + '">⚠️ ' + p.bye + '</span></td>';
        } else if (byeClash.type === 'other-pos') {
          const names = byeClash.otherPos.map(x => x.name + ' (' + x.pos + ')').join(', ');
          const tip = 'Bye week coincides with ' + names + ' (Week ' + p.bye + ')';
          byeCell = '<td><span class="byetag bye-other-pos" title="' + tip.replace(/"/g, '&quot;') + '">' + p.bye + '</span></td>';
        }
      }

      html += '<tr class="' + tierRow + (isTaken ? ' takenrow' : '') + '">'
        + '<td class="rk">' + (idx + 1) + (tierRow ? ' <span class="tierlabel">T' + tier + '</span>' : '') + '</td>'
        + '<td class="clickname" onclick="showPlayer(' + p.id + ')">' + starBtn + '<span class="pname">' + p.name + '</span>' + rookie + age + value + '</td>'
        + '<td><span class="pos ' + posClass + '">' + p.pos + '</span></td>'
        + '<td class="meta">' + (p.team || '—') + '</td>'
        + byeCell
        + '<td class="num rk">' + (p.activeDyn ?? '—') + '</td>'
        + '<td class="num rk">' + (p.activeRed ?? '—') + '</td>'
        + '<td class="num rk">' + (p.adp ? p.adp.toFixed(0) : '—') + '</td>'
        + '<td class="num score">' + (p.score != null ? p.score.toFixed(1) : '—') + '</td>'
        + actionCell
        + '</tr>';
    });

    let emptyMsg = global.PLAYERS.length ? 'No players match.' : 'Player data not loaded yet.';
    if (global.ui.posFilter === 'WATCHLIST' && global.PLAYERS.length) {
      emptyMsg = 'Your watchlist is empty. Click the ☆ star on any player to add them to your watchlist.';
    }
    if ($('pool')) $('pool').innerHTML = html || '<tr><td colspan="10" class="empty">' + emptyMsg + '</td></tr>';
  }

  function renderRosterSection(resolvedPicks, rosterSlots, teamsCount) {
    const playersWithEntry = resolvedPicks.map(x => Object.assign({ entry: x.entry }, x.player));
    const allocation = assignRosterSlots(playersWithEntry, rosterSlots);

    const byBye = {};
    for (const { player } of resolvedPicks) {
      if (player.bye) {
        (byBye[player.bye] = byBye[player.bye] || []).push(player.name);
      }
    }

    const formatSlot = (item, isStarter) => formatRosterSlotHtml(item, isStarter, teamsCount, byBye);

    const filledStartersCount = allocation.starters.filter(s => s.player !== null).length;
    let html = '<div class="roster-sec-title"><span>Starters</span><span>' + filledStartersCount + ' / ' + allocation.totalStarters + '</span></div>';
    html += allocation.starters.map(s => formatSlot(s, true)).join('');

    html += '<div class="roster-sec-title" style="margin-top:10px"><span>Bench</span><span>' + allocation.bench.length + ' / ' + allocation.totalBench + '</span></div>';
    if (allocation.bench.length > 0) {
      html += allocation.bench.map(b => formatSlot(b, false)).join('');
    } else {
      html += '<div class="meta" style="font-size:11.5px; padding:3px 0">No bench players yet.</div>';
    }

    // Positional requirements & needs calculation
    const reqs = {
      QB: (rosterSlots.qb || 0) + (rosterSlots.superflex ? 1 : 0),
      RB: (rosterSlots.rb || 0) + (rosterSlots.flex ? 1 : 0),
      WR: (rosterSlots.wr || 0) + (rosterSlots.flex ? 1 : 0),
      TE: (rosterSlots.te || 0) + (rosterSlots.flex ? 1 : 0),
      K: (rosterSlots.k || 0),
      DST: (rosterSlots.dst || 0)
    };

    const needsList = [];
    for (const pos of ['QB', 'RB', 'WR', 'TE', 'K', 'DST']) {
      const target = reqs[pos];
      if (target > 0 || (allocation.counts[pos] && allocation.counts[pos] > 0)) {
        const c = allocation.counts[pos] || 0;
        const cls = c >= target ? 'ok' : (resolvedPicks.length >= 6 && c === 0 ? 'short' : '');
        needsList.push('<span class="need ' + cls + '">' + (pos === 'DST' ? 'D/ST' : pos) + ' ' + c + '/' + target + '+</span>');
      }
    }

    const clashWeeks = Object.keys(byBye).filter(w => byBye[w].length >= 2);
    const byeWarnHtml = clashWeeks.length
      ? '<div class="warnbox" style="margin-top:10px">Bye overlap — week ' + clashWeeks.map(w => w + ': ' + byBye[w].join(', ')).join(' · week ') + '</div>'
      : '';

    return {
      rosterHtml: html,
      needsHtml: needsList.join('') + '<span class="need">Lineup: ' + formatLineupSummary(rosterSlots) + '</span>',
      byeWarnHtml: byeWarnHtml
    };
  }

  function renderMyRoster() {
    const s = global.state.settings;
    const targetSlot = s.slot;
    const myTeamName = getTeamName(targetSlot);
    const myPicks = global.state.log.filter(e => {
      const tInfo = teamForOverall(e.overall, s.teams, s.mode, s.teamNames, s.slot, global.state.tradedPicks);
      return tInfo.slot === targetSlot;
    });

    if ($('myrosterheader')) {
      $('myrosterheader').innerHTML = '⭐ ' + myTeamName + ' <span class="meta" style="font-size:12px; margin-left:auto; font-weight:normal">Slot ' + targetSlot + ' · ' + myPicks.length + ' picks</span>';
    }

    const resolvedPicks = myPicks.map(e => ({
      entry: e,
      player: resolvePickPlayer(e, byId)
    }));

    const res = renderRosterSection(resolvedPicks, s.rosterSlots, s.teams);
    if ($('myroster')) $('myroster').innerHTML = res.rosterHtml;
    if ($('myneeds')) $('myneeds').innerHTML = res.needsHtml;
    if ($('mybyewarn')) $('mybyewarn').innerHTML = res.byeWarnHtml;
  }

  function renderInspectRoster() {
    const s = global.state.settings;
    const pick = currentPick();
    const onClockTeam = teamForOverall(pick, s.teams, s.mode, s.teamNames, s.slot, global.state.tradedPicks);
    const targetSlot = (global.viewingRosterSlot != null) ? global.viewingRosterSlot : onClockTeam.slot;
    const isFollowingClock = (global.viewingRosterSlot == null || global.viewingRosterSlot === onClockTeam.slot);

    // Populate Dropdown
    if ($('rosterTeamSelect')) {
      let selectHtml = '<option value="clock"' + (global.viewingRosterSlot == null ? ' selected' : '') + '>⚡ [Auto: On The Clock — ' + onClockTeam.name + ' (Slot ' + onClockTeam.slot + ')]</option>';
      for (let i = 1; i <= s.teams; i++) {
        const isClock = (i === onClockTeam.slot);
        const isMe = (i === s.slot);
        const isSelected = (global.viewingRosterSlot === i);
        const count = global.state.log.filter(e => {
          const tInfo = teamForOverall(e.overall, s.teams, s.mode, s.teamNames, s.slot, global.state.tradedPicks);
          return tInfo.slot === i;
        }).length;
        selectHtml += '<option value="' + i + '"' + (isSelected ? ' selected' : '') + '>'
          + (isClock ? '🕒 ' : (isMe ? '⭐ ' : '')) + getTeamName(i) + ' (Slot ' + i + ' · ' + count + ' picks)' + (isMe ? ' [You]' : '')
          + '</option>';
      }
      $('rosterTeamSelect').innerHTML = selectHtml;
    }
    if ($('onclockquickbtn')) {
      $('onclockquickbtn').style.display = (global.viewingRosterSlot != null && global.viewingRosterSlot !== onClockTeam.slot) ? 'inline-block' : 'none';
    }

    // Label
    if ($('clockteamlabel')) {
      if (isFollowingClock) {
        $('clockteamlabel').innerHTML = '🕒 <b style="color:var(--accent)">On The Clock:</b> <span style="color:var(--text); font-weight:600">' + onClockTeam.name + '</span>' + (onClockTeam.isMe ? ' <span style="color:var(--good); font-weight:700">(Your Turn!)</span>' : ' (Slot ' + onClockTeam.slot + ')');
      } else {
        $('clockteamlabel').innerHTML = '👥 <b style="color:var(--dim)">Inspecting:</b> <span style="color:var(--text); font-weight:600">' + getTeamName(targetSlot) + '</span> (Slot ' + targetSlot + ') · <a href="javascript:void(0)" onclick="selectRosterSlot(null)" style="color:var(--accent); text-decoration:underline">Back to On-Clock</a>';
      }
    }

    // Filter all picks belonging to target slot
    const teamPicks = global.state.log.filter(e => {
      const tInfo = teamForOverall(e.overall, s.teams, s.mode, s.teamNames, s.slot, global.state.tradedPicks);
      return tInfo.slot === targetSlot;
    });
    const resolvedPicks = teamPicks.map(e => ({
      entry: e,
      player: resolvePickPlayer(e, byId)
    }));

    const res = renderRosterSection(resolvedPicks, s.rosterSlots, s.teams);
    if ($('roster')) $('roster').innerHTML = res.rosterHtml;
    if ($('needs')) $('needs').innerHTML = res.needsHtml;
    if ($('byewarn')) $('byewarn').innerHTML = res.byeWarnHtml;
  }

  function renderLog() {
    const s = global.state.settings;
    if (!$('log')) return;
    $('log').innerHTML = global.state.log.slice().reverse().map(e => {
      const p = resolvePickPlayer(e, byId);
      const posTeam = (p.pos || (p.team && p.team !== '—'))
        ? ' <span class="meta">(' + p.pos + (p.team && p.team !== '—' ? ' · ' + p.team : '') + ')</span>'
        : '';
      const tInfo = teamForOverall(e.overall, s.teams, s.mode, s.teamNames, s.slot, global.state.tradedPicks);
      const isMe = e.mine || tInfo.isMe;
      const unlistedBadge = p.isUnlisted ? ' <span class="meta" style="font-size:10px">(unlisted)</span>' : '';
      return '<div class="logitem' + (isMe ? ' mine' : '') + '">'
        + '<span class="meta">#' + e.overall + ' (' + fmtPick(e.overall, s.teams) + ')</span> '
        + '<b style="color:' + (isMe ? 'var(--good)' : 'var(--text)') + '">' + tInfo.name + (isMe ? ' (You)' : '') + '</b>: '
        + p.name + posTeam + unlistedBadge + (isMe ? ' ✅' : '') + '</div>';
    }).join('') || '<div class="meta">Draft hasn\'t started.</div>';
  }

  function renderTabs() {
    const taken = takenMap();
    const watchCount = (global.state.watchlist || []).filter(id => !taken.has(id)).length;
    const tabs = [
      { id: 'ALL', label: 'ALL' },
      { id: 'QB', label: 'QB' },
      { id: 'RB', label: 'RB' },
      { id: 'WR', label: 'WR' },
      { id: 'TE', label: 'TE' },
      { id: 'K', label: 'K' },
      { id: 'DST', label: 'D/ST' },
      { id: 'ROOKIE', label: 'Rookies' },
      { id: 'WATCHLIST', label: '⭐ Watchlist' + (watchCount ? ' (' + watchCount + ')' : '') },
    ];
    if ($('postabs')) {
      $('postabs').innerHTML = tabs.map(t =>
        '<span class="tab' + (global.ui.posFilter === t.id ? ' on' : '') + '" onclick="setFilter(\'' + t.id + '\')">' + t.label + '</span>').join('');
    }
  }

  function setFilter(t) {
    global.ui.posFilter = t;
    renderTabs();
    renderPool();
  }

  function renderWatchlistPanel() {
    if (!$('leftwatchlist')) return;
    const taken = takenMap();
    const allScored = scored();
    const scoredWatched = allScored
      .filter(p => isWatched(global.state.watchlist, p.id) && !taken.has(p.id))
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

    if ($('mywatchlistcount')) {
      $('mywatchlistcount').textContent = scoredWatched.length ? scoredWatched.length + ' players' : 'Empty';
    }

    const myRoster = getMyRosterPlayers(global.state.log, byId, global.state.settings.slot, global.state.settings.teams, global.state.settings.mode);
    const order = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];

    $('leftwatchlist').innerHTML = scoredWatched.map(p => {
      const posClass = order.includes(p.pos) ? p.pos : 'other';
      const byeClash = getByeClashStatus(p, myRoster);
      let byeHtml = p.bye ? '<span class="bye">bye ' + p.bye + '</span>' : '<span class="bye">—</span>';
      if (p.bye && byeClash.type === 'same-pos') {
        const names = byeClash.samePos.map(x => x.name).join(', ');
        byeHtml = '<span class="bye clash" title="Same-position bye clash with ' + names + '">⚠️ ' + p.bye + '</span>';
      } else if (p.bye && byeClash.type === 'other-pos') {
        const names = byeClash.otherPos.map(x => x.name + ' (' + x.pos + ')').join(', ');
        byeHtml = '<span class="bye" style="color:var(--warn); font-weight:600" title="Bye coincides with ' + names + '">' + p.bye + '</span>';
      }

      const teamBadge = (p.team && p.team !== '—') ? ' <span class="meta" style="font-size:11.5px; font-weight:600">' + p.team + '</span>' : '';
      const rookieRankStr = p.rookieRank ? ' #' + p.rookieRank : '';
      const rookieBadge = p.rookie ? '<span class="rookietag">R' + rookieRankStr + '</span>' : '';

      return '<div class="rosteritem" style="padding:4px 0">'
        + '<button type="button" class="watchbtn active" title="Remove from Watchlist" onclick="toggleWatch(' + p.id + ', event)" style="font-size:13px">★</button>'
        + '<span class="pos ' + posClass + '">' + p.pos + '</span>'
        + '<span class="pname" onclick="showPlayer(' + p.id + ')" style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">' + p.name + rookieBadge + '</span>'
        + teamBadge
        + byeHtml
        + '</div>';
    }).join('') || '<div class="meta" style="padding:10px 0">No players on watchlist.<br>Click the ☆ on any player to track them.</div>';
  }

  function renderBanner() {
    const d = window.DRAFT_DATA || { players: [] };
    const s = global.state.settings;
    const qbStr = s.qbFormat === '1qb' ? '1-QB' : 'Superflex';
    const scStr = s.scoring === 'ppr' ? 'PPR' : (s.scoring === 'std' ? 'Standard' : 'Half-PPR');
    if ($('databanner')) {
      $('databanner').innerHTML = d.players && d.players.length ? '' :
        '<div class="warnbox">⏳ Rankings are still being fetched — the board works, but the player list is empty until the data lands.</div>';
    }
    if ($('sources')) {
      $('sources').textContent = d.players && d.players.length
        ? d.players.length + ' players · data gathered ' + (d.generated || '') + ' · Mode: ' + qbStr + ' (' + scStr + ') · Blended rankings synced'
        : '';
    }
  }

  function render() {
    renderHeader();
    renderTabs();
    renderPool();
    renderMyRoster();
    renderWatchlistPanel();
    renderInspectRoster();
    renderLog();
    renderBanner();
  }

  // ---------- Modals ----------
  function closeModal() {
    const overlay = $('overlay');
    if (overlay) overlay.classList.remove('show');
  }

  function showPlayer(id) {
    const p = byId(id);
    if (!p) return;
    const s = global.state.settings;
    const activeDyn = getDynastyRank(p, s.qbFormat);
    const activeRed = getRedraftRank(p, s.qbFormat, s.scoring);
    const activeScore = computeFormatScore(p, {
      blend: s.blend / 100,
      qbFormat: s.qbFormat,
      scoring: s.scoring,
      tePremium: s.teprem,
      depth: 250
    });

    const taken = takenMap();
    const posClass = ['QB', 'RB', 'WR', 'TE'].includes(p.pos) ? p.pos : (['DST', 'DEF', 'D/ST'].includes(p.pos) ? 'DST' : (p.pos === 'K' ? 'K' : 'other'));

    let status = '';
    if (taken.has(id)) {
      const pickEntry = global.state.log.find(e => e.playerId === id);
      if (pickEntry) {
        const tInfo = teamForOverall(pickEntry.overall, s.teams, s.mode, s.teamNames, s.slot, global.state.tradedPicks);
        const isMine = taken.get(id) === 'me' || tInfo.isMe;
        status = isMine
          ? '<span class="picktag mine">✅ On your team (Pick #' + pickEntry.overall + ', ' + fmtPick(pickEntry.overall, s.teams) + ')</span>'
          : '<span class="picktag">Drafted by ' + tInfo.name + ' (Pick #' + pickEntry.overall + ', ' + fmtPick(pickEntry.overall, s.teams) + ')</span>';
      } else {
        status = '<span class="picktag">Taken</span>';
      }
    }

    const stats = [
      ['Active Mode (' + (s.qbFormat === '1qb' ? '1QB' : 'SF') + ' ' + s.scoring.toUpperCase() + ')', activeScore != null ? activeScore.toFixed(1) + ' pts' : null],
      ['Dynasty ' + (s.qbFormat === '1qb' ? '1QB' : 'SF'), activeDyn],
      ['Redraft (' + s.scoring.toUpperCase() + ')', activeRed],
      ['Dyn SF', p.dynSF], ['Dyn 1QB', p.dyn1QB],
      ['1QB PPR', p.red_1qb_ppr], ['1QB Half', p.red_1qb_half], ['1QB Std', p.red_1qb_std],
      ['SF PPR', p.red_sf_ppr], ['SF Half', p.red_sf_half], ['SF Std', p.red_sf_std],
      ['Rookie Draft Rank', p.rookieRank ? '#' + p.rookieRank : (p.rookie ? 'Rookie' : null)],
      ['ADP', p.adp ? p.adp.toFixed(0) : null], ['Age', p.age ? p.age + 'y' : null], ['Bye', p.bye ? 'Wk ' + p.bye : null],
      ['ESPN', p.espn_ppr || p.espn_std], ['Yahoo', p.yahoo], ['Boris Chen', p.boris_half || p.boris_ppr || p.boris_std]
    ].filter(x => x[1] != null)
      .map(x => '<span class="stat">' + x[0] + '<b>' + x[1] + '</b></span>').join('');

    const snapDate = window.DRAFT_DATA.extrasGenerated || window.DRAFT_DATA.generated || '';
    const blurb = p.blurb
      ? '<div class="blurb">' + p.blurb + '</div><div class="blurbnote">News snapshot from ' + snapDate + ' — use the links below for anything newer.</div>'
      : '<div class="blurbnote">No baked-in news for this player — use the live links below.</div>';
    const sched = (window.DRAFT_DATA.schedules || {})[p.team];
    const schedHtml = sched
      ? '<h4>2026 Schedule</h4><div class="schedgrid">' + sched.map((opp, i) =>
        '<span class="g' + (opp === 'BYE' ? ' bye' : '') + '"><b>' + (i + 1) + '</b>' + opp + '</span>').join('') + '</div>'
      : (p.team && p.team !== 'FA' ? '<div class="blurbnote">Schedule data still loading — check back shortly.</div>' : '');
    const q = encodeURIComponent(p.name + (p.team && p.team !== 'FA' ? ' ' + p.team : '') + ' fantasy');
    const links = '<div class="links">'
      + '<a target="_blank" href="https://news.google.com/search?q=' + q + '">🔎 Google News</a>'
      + '<a target="_blank" href="https://www.espn.com/search/_/q/' + encodeURIComponent(p.name) + '">ESPN</a>'
      + '<a target="_blank" href="https://www.google.com/search?q=' + encodeURIComponent(p.name) + '+site%3Afantasypros.com">FantasyPros</a>'
      + '</div>';

    const myRoster = getMyRosterPlayers(global.state.log, byId, s.slot, s.teams, s.mode);
    const byeClash = getByeClashStatus(p, myRoster);
    let byeAlert = '';
    if (byeClash.type === 'same-pos') {
      const names = byeClash.samePos.map(x => x.name).join(', ');
      byeAlert = '<div class="warnbox" style="margin-top:10px; background:#3d2026; border-color:var(--bad); color:var(--bad)">⚠️ <b>Same-Position Bye Clash:</b> Shares Week ' + p.bye + ' bye with your ' + p.pos + ' (' + names + ')</div>';
    } else if (byeClash.type === 'other-pos') {
      const names = byeClash.otherPos.map(x => x.name + ' (' + x.pos + ')').join(', ');
      byeAlert = '<div style="margin-top:10px; padding:8px 10px; background:#33261a; border:1px solid var(--warn); color:var(--warn); border-radius:8px; font-size:12.5px">⚡ <b>Roster Bye Overlap:</b> Shares Week ' + p.bye + ' bye with ' + names + '</div>';
    }

    const watched = isWatched(global.state.watchlist, p.id);
    const watchModalBtn = !taken.has(id)
      ? '<button type="button" class="act' + (watched ? ' primary' : '') + '" onclick="toggleWatch(' + p.id + '); showPlayer(' + p.id + ');" style="margin-left:auto; font-size:12px">' + (watched ? '★ In Watchlist' : '☆ Add to Watchlist') + '</button>'
      : '';

    $('modalbox').innerHTML =
      '<h3><span class="pos ' + posClass + '">' + p.pos + '</span>' + p.name
      + (p.rookie ? '<span class="rookietag">R</span>' : '')
      + ' <span class="meta">' + (p.team || '') + '</span>' + status
      + watchModalBtn
      + '<button class="close" onclick="closeModal()">×</button></h3>'
      + '<div class="statrow">' + stats + '</div>'
      + byeAlert + blurb + schedHtml + links;
    $('overlay').classList.add('show');
  }

  function showUnlistedPlayer(overall) {
    const entry = global.state.log.find(e => e.overall === overall);
    if (!entry) return;
    const p = resolvePickPlayer(entry, byId);
    const tInfo = teamForOverall(entry.overall, global.state.settings.teams, global.state.settings.mode, global.state.settings.teamNames, global.state.settings.slot, global.state.tradedPicks);
    const isMine = entry.mine || tInfo.isMe;
    const posClass = ['QB', 'RB', 'WR', 'TE'].includes(p.pos) ? p.pos : (['DST', 'DEF', 'D/ST'].includes(p.pos) ? 'DST' : (p.pos === 'K' ? 'K' : 'other'));

    const q = encodeURIComponent(p.name + ' fantasy');
    const links = '<div class="links">'
      + '<a target="_blank" href="https://news.google.com/search?q=' + q + '">🔎 Google News</a>'
      + '<a target="_blank" href="https://www.espn.com/search/_/q/' + encodeURIComponent(p.name) + '">ESPN</a>'
      + '</div>';

    $('modalbox').innerHTML =
      '<h3><span class="pos ' + posClass + '">' + p.pos + '</span>' + p.name
      + ' <span class="meta">(Custom / Unlisted Pick)</span>'
      + '<button class="close" onclick="closeModal()">×</button></h3>'
      + '<div class="statrow">'
      + '<span class="stat">Drafted By<b>' + tInfo.name + (isMine ? ' (You)' : '') + '</b></span>'
      + '<span class="stat">Pick<b>#' + entry.overall + ' (' + fmtPick(entry.overall, global.state.settings.teams) + ')</b></span>'
      + ((p.team && p.team !== '—') ? '<span class="stat">NFL Team<b>' + p.team + '</b></span>' : '')
      + (p.bye ? '<span class="stat">Bye Week<b>Week ' + p.bye + '</b></span>' : '')
      + '</div>'
      + '<div class="blurbnote">This selection was recorded as an unlisted pick and is tracked on this team\'s roster and positional counts.</div>'
      + links;
    $('overlay').classList.add('show');
  }

  function openUnlistedPickModal() {
    const pick = currentPick();
    const totalPicks = global.state.settings.teams * global.state.settings.rounds;
    if (pick > totalPicks) {
      alert('The draft is already complete!');
      return;
    }
    const who = teamForOverall(pick, global.state.settings.teams, global.state.settings.mode, global.state.settings.teamNames, global.state.settings.slot, global.state.tradedPicks);
    unlistedSelectedPos = 'WR';

    const positions = ['QB', 'RB', 'WR', 'TE', 'K', 'DST', 'OTHER'];
    const posButtons = positions.map(pos =>
      '<button type="button" class="tab' + (pos === unlistedSelectedPos ? ' on' : '') + '" id="unlisted_pos_' + pos + '" onclick="selectUnlistedPos(\'' + pos + '\')">' + pos + '</button>'
    ).join('');

    $('modalbox').innerHTML =
      '<h3>📝 Record Unlisted Pick'
      + '<button class="close" onclick="closeModal()">×</button></h3>'
      + '<div style="margin: 10px 0; font-size: 13px; color: var(--dim)">'
      + 'Drafting for: <b style="color: ' + (who.isMe ? 'var(--good)' : 'var(--text)') + '; font-size: 14px">' + who.name + (who.isMe ? ' (Your Team)' : '') + '</b> '
      + '· Pick <b>#' + pick + ' (' + fmtPick(pick, global.state.settings.teams) + ')</b>'
      + '</div>'
      + '<div style="margin-top: 12px">'
      + '<label style="display:block; font-size:12px; color:var(--dim); margin-bottom:6px">Select Position <b style="color:var(--warn)">*</b></label>'
      + '<div class="tabs" style="flex-wrap:wrap; gap:6px" id="unlisted_pos_tabs">' + posButtons + '</div>'
      + '</div>'
      + '<div class="setup-grid" style="margin-top:14px">'
      + '<div class="setup-field" style="grid-column: 1 / -1;"><label>Player Name (Optional)</label><input type="text" id="unlisted_name_input" placeholder="e.g. Ray-Ray McCloud (Leave blank for Unlisted ' + unlistedSelectedPos + ')"></div>'
      + '<div class="setup-field"><label>NFL Team (Optional)</label><input type="text" id="unlisted_team_input" placeholder="e.g. KC, PHI, FA" maxlength="6"></div>'
      + '<div class="setup-field"><label>NFL Bye Week (Optional)</label><input type="number" id="unlisted_bye_input" min="1" max="18" placeholder="e.g. 9"></div>'
      + '</div>'
      + '<div class="modal-actions" style="margin-top:18px">'
      + '<button type="button" class="act" onclick="closeModal()">Cancel</button>'
      + '<button type="button" class="act primary" onclick="submitUnlistedPick()">Confirm & Draft Player</button>'
      + '</div>';

    $('overlay').classList.add('show');
    setTimeout(() => {
      const input = $('unlisted_name_input');
      if (input) {
        input.focus();
        input.addEventListener('keydown', e => {
          if (e.key === 'Enter') submitUnlistedPick();
        });
      }
    }, 60);
  }

  function selectUnlistedPos(pos) {
    unlistedSelectedPos = pos;
    const positions = ['QB', 'RB', 'WR', 'TE', 'K', 'DST', 'OTHER'];
    for (const p of positions) {
      const btn = $('unlisted_pos_' + p);
      if (btn) btn.className = 'tab' + (p === pos ? ' on' : '');
    }
    const input = $('unlisted_name_input');
    if (input && !input.value.trim()) {
      input.placeholder = 'e.g. Ray-Ray McCloud (Leave blank for Unlisted ' + pos + ')';
    }
  }

  function submitUnlistedPick() {
    const nameInput = $('unlisted_name_input');
    const teamInput = $('unlisted_team_input');
    const byeInput = $('unlisted_bye_input');
    const name = nameInput ? nameInput.value.trim() : '';
    const team = teamInput ? teamInput.value.trim().toUpperCase() : '';
    const bye = (byeInput && byeInput.value) ? parseInt(byeInput.value, 10) : null;
    draftUnlistedPlayer(unlistedSelectedPos, name, team, bye);
  }

  function openLeagueSetup() {
    const s = global.state.settings;
    setupDraftNames = s.teamNames.slice();
    setupMySlot = s.slot;
    const rs = Object.assign({}, (typeof DEFAULT_ROSTER_SLOTS !== 'undefined' ? DEFAULT_ROSTER_SLOTS : {}), s.rosterSlots);

    function renderSetupTable(teamsCount) {
      let rows = '';
      for (let i = 1; i <= teamsCount; i++) {
        const name = setupDraftNames[i - 1] || ('Team ' + i);
        const isMe = (i === setupMySlot);
        rows += '<tr class="' + (isMe ? 'is-me' : '') + '" id="setup_row_' + i + '">'
          + '<td class="slot-label"><span class="slot-badge">Slot ' + i + '</span></td>'
          + '<td><input type="text" class="team-input" id="team_input_' + i + '" data-slot="' + i + '" value="' + name.replace(/"/g, '&quot;') + '" placeholder="Team ' + i + ' name"></td>'
          + '<td class="radio-cell"><label><input type="radio" name="setup_my_slot" value="' + i + '"' + (isMe ? ' checked' : '') + ' onchange="changeSetupMySlot(' + i + ')"> <span>My Team</span></label></td>'
          + '<td><div class="order-btns">'
          + '<button type="button" class="btn-move" title="Move Up" onclick="moveSetupTeam(' + i + ', -1)"' + (i === 1 ? ' disabled' : '') + '>▲</button>'
          + '<button type="button" class="btn-move" title="Move Down" onclick="moveSetupTeam(' + i + ', 1)"' + (i === teamsCount ? ' disabled' : '') + '>▼</button>'
          + '</div></td>'
          + '</tr>';
      }
      return rows;
    }

    let espnSyncBtn = '';
    if (global.syncState && global.syncState.espnLeagueInfo && global.syncState.espnLeagueInfo.teams) {
      const info = global.syncState.espnLeagueInfo;
      espnSyncBtn = '<button type="button" class="act" onclick="applyEspnLeagueSetup(); openLeagueSetup();" style="font-size:11.5px; padding:3px 9px; color:var(--accent)">📥 Sync Teams & Slot from ESPN (' + info.teams + ' Teams' + (info.mySlot ? ' · Slot #' + info.mySlot : '') + ')</button>';
    }

    $('modalbox').innerHTML =
      '<h3>⚙️ League Setup & Draft Positions'
      + '<button class="close" onclick="closeModal()">×</button></h3>'
      + '<div class="setup-grid">'
      + '<div class="setup-field" style="grid-column: 1 / -1;"><label>League / Board Name</label><input type="text" id="setup_league_name" value="' + (s.leagueName || "Ken's Draft Board").replace(/"/g, '&quot;') + '"></div>'
      + '<div class="setup-field"><label>Total Teams</label><input type="number" id="setup_team_count" min="2" max="32" value="' + s.teams + '"></div>'
      + '<div class="setup-field"><label>Total Draft Rounds</label><input type="number" id="setup_rounds_count" min="1" max="50" value="' + s.rounds + '"></div>'
      + '<div class="setup-field"><label>Draft Order</label><select id="setup_mode_select"><option value="3rr"' + (s.mode === '3rr' ? ' selected' : '') + '>3rd-Round Reversal (3RR)</option><option value="snake"' + (s.mode === 'snake' ? ' selected' : '') + '>Normal Snake</option></select></div>'
      + '<div class="setup-field"><label>Scoring Format</label><select id="setup_scoring_select"><option value="half"' + (s.scoring === 'half' ? ' selected' : '') + '>Half-PPR (0.5)</option><option value="ppr"' + (s.scoring === 'ppr' ? ' selected' : '') + '>Full PPR (1.0)</option><option value="std"' + (s.scoring === 'std' ? ' selected' : '') + '>Standard (0 PPR)</option></select></div>'
      + '<div class="setup-field"><label>QB Format</label><select id="setup_qb_select"><option value="sf"' + (s.qbFormat === 'sf' ? ' selected' : '') + '>Superflex (2QB/SF)</option><option value="1qb"' + (s.qbFormat === '1qb' ? ' selected' : '') + '>1 QB (Single QB)</option></select></div>'
      + '</div>'
      + '<h4 style="margin-top:14px">📋 Roster Positions & Starting Lineup</h4>'
      + '<div class="setup-grid" style="grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px;">'
      + '<div class="setup-field"><label>QB Starters</label><input type="number" id="setup_roster_qb" min="0" max="6" value="' + (rs.qb ?? 1) + '"></div>'
      + '<div class="setup-field"><label>RB Starters</label><input type="number" id="setup_roster_rb" min="0" max="8" value="' + (rs.rb ?? 2) + '"></div>'
      + '<div class="setup-field"><label>WR Starters</label><input type="number" id="setup_roster_wr" min="0" max="8" value="' + (rs.wr ?? 2) + '"></div>'
      + '<div class="setup-field"><label>TE Starters</label><input type="number" id="setup_roster_te" min="0" max="6" value="' + (rs.te ?? 1) + '"></div>'
      + '<div class="setup-field"><label>Flex (RB/WR/TE)</label><input type="number" id="setup_roster_flex" min="0" max="8" value="' + (rs.flex ?? 3) + '"></div>'
      + '<div class="setup-field"><label>Superflex (QB/RB/WR/TE)</label><input type="number" id="setup_roster_superflex" min="0" max="6" value="' + (rs.superflex ?? 1) + '"></div>'
      + '<div class="setup-field"><label>Kicker (K)</label><input type="number" id="setup_roster_k" min="0" max="4" value="' + (rs.k ?? 0) + '"></div>'
      + '<div class="setup-field"><label>Defense (D/ST)</label><input type="number" id="setup_roster_dst" min="0" max="4" value="' + (rs.dst ?? 0) + '"></div>'
      + '<div class="setup-field"><label>Bench Depth</label><input type="number" id="setup_roster_bench" min="0" max="40" value="' + (rs.bench ?? 15) + '"></div>'
      + '</div>'
      + '<div id="setup_roster_summary" style="margin: 8px 0; padding: 7px 10px; background: var(--panel2); border: 1px solid var(--border); border-radius: 6px; font-size: 12px; color: var(--dim)"></div>'
      + '<div style="display:flex; justify-content:space-between; align-items:center; margin-top:14px; margin-bottom:6px; flex-wrap:wrap; gap:6px">'
      + '<h4 style="margin:0">Draft Order & Team Names</h4>'
      + espnSyncBtn
      + '</div>'
      + '<div class="meta" style="margin-bottom:6px">Assign team names to each draft slot, designate your team, or use the ▲▼ buttons to reorder positions.</div>'
      + '<div class="setup-teams-wrap"><table class="team-table"><tbody id="setup_teams_body">'
      + renderSetupTable(s.teams)
      + '</tbody></table></div>'
      + '<div style="margin-top:10px; padding:8px 10px; background:#141923; border:1px solid var(--border); border-radius:6px; font-size:12px; color:var(--dim)">'
      + '📊 <b style="color:var(--text)">Rankings Status:</b> ' + (window.DRAFT_DATA.players ? window.DRAFT_DATA.players.length : 0) + ' active NFL players loaded (Snapshot date: <b style="color:var(--accent)">' + (window.DRAFT_DATA.generated || 'live') + '</b>).<br>'
      + 'To refresh with latest consensus rankings before drafting, run <code style="color:var(--text); background:var(--panel2); padding:1px 4px; border-radius:3px">python update-rankings.py</code>.'
      + '</div>'
      + '<div class="modal-actions">'
      + '<button type="button" class="act" onclick="resetSetupDefaults()">Reset Default Names</button>'
      + '<div style="display:flex; gap:8px">'
      + '<button type="button" class="act" onclick="closeModal()">Cancel</button>'
      + '<button type="button" class="act primary" onclick="saveLeagueSetup()">Save Changes</button>'
      + '</div></div>';

    $('overlay').classList.add('show');

    function updateRosterMath(fromRounds) {
      const qb = Math.max(0, parseInt($('setup_roster_qb').value, 10) || 0);
      const rb = Math.max(0, parseInt($('setup_roster_rb').value, 10) || 0);
      const wr = Math.max(0, parseInt($('setup_roster_wr').value, 10) || 0);
      const te = Math.max(0, parseInt($('setup_roster_te').value, 10) || 0);
      const flex = Math.max(0, parseInt($('setup_roster_flex').value, 10) || 0);
      const sf = Math.max(0, parseInt($('setup_roster_superflex').value, 10) || 0);
      const k = Math.max(0, parseInt($('setup_roster_k').value, 10) || 0);
      const dst = Math.max(0, parseInt($('setup_roster_dst').value, 10) || 0);
      const starters = qb + rb + wr + te + flex + sf + k + dst;

      if (fromRounds) {
        const rounds = Math.max(1, parseInt($('setup_rounds_count').value, 10) || 1);
        const bench = Math.max(0, rounds - starters);
        $('setup_roster_bench').value = bench;
      } else {
        const bench = Math.max(0, parseInt($('setup_roster_bench').value, 10) || 0);
        $('setup_rounds_count').value = starters + bench;
      }

      const currentBench = Math.max(0, parseInt($('setup_roster_bench').value, 10) || 0);
      const totalRounds = starters + currentBench;
      $('setup_roster_summary').innerHTML = '📋 <b style="color:var(--text)">Lineup:</b> ' + formatLineupSummary({ qb, rb, wr, te, flex, superflex: sf, k, dst, bench: currentBench }) + ' · <b style="color:var(--good)">' + starters + ' Starters</b> + <b style="color:var(--warn)">' + currentBench + ' Bench</b> = <b style="color:var(--accent)">' + totalRounds + ' Draft Rounds</b>';
    }

    updateRosterMath(false);

    const rosterInputIds = [
      'setup_roster_qb', 'setup_roster_rb', 'setup_roster_wr', 'setup_roster_te',
      'setup_roster_flex', 'setup_roster_superflex', 'setup_roster_k', 'setup_roster_dst',
      'setup_roster_bench'
    ];
    for (const id of rosterInputIds) {
      $(id).addEventListener('input', () => updateRosterMath(false));
    }
    $('setup_rounds_count').addEventListener('input', () => updateRosterMath(true));

    $('setup_team_count').addEventListener('input', () => {
      syncSetupInputsFromDom();
      const newCount = Math.max(2, Math.min(32, parseInt($('setup_team_count').value, 10) || 12));
      while (setupDraftNames.length < newCount) setupDraftNames.push('Team ' + (setupDraftNames.length + 1));
      if (setupMySlot > newCount) setupMySlot = 1;
      $('setup_teams_body').innerHTML = renderSetupTable(newCount);
    });
  }

  function syncSetupInputsFromDom() {
    const count = Math.max(2, Math.min(32, parseInt($('setup_team_count').value, 10) || 12));
    for (let i = 1; i <= count; i++) {
      const input = $('team_input_' + i);
      if (input) {
        setupDraftNames[i - 1] = input.value.trim() || ('Team ' + i);
      }
    }
  }

  function changeSetupMySlot(slot) {
    syncSetupInputsFromDom();
    setupMySlot = slot;
    const count = Math.max(2, Math.min(32, parseInt($('setup_team_count').value, 10) || 12));
    for (let i = 1; i <= count; i++) {
      const row = $('setup_row_' + i);
      if (row) row.className = (i === slot) ? 'is-me' : '';
    }
  }

  function moveSetupTeam(slot, delta) {
    syncSetupInputsFromDom();
    const count = Math.max(2, Math.min(32, parseInt($('setup_team_count').value, 10) || 12));
    const targetSlot = slot + delta;
    if (targetSlot < 1 || targetSlot > count) return;

    // Swap names
    const tempName = setupDraftNames[slot - 1];
    setupDraftNames[slot - 1] = setupDraftNames[targetSlot - 1];
    setupDraftNames[targetSlot - 1] = tempName;

    // Update mySlot if one of the swapped was my slot
    if (setupMySlot === slot) setupMySlot = targetSlot;
    else if (setupMySlot === targetSlot) setupMySlot = slot;

    // Re-render table
    const countVal = Math.max(2, Math.min(32, parseInt($('setup_team_count').value, 10) || 12));
    $('setup_teams_body').innerHTML = (function () {
      let rows = '';
      for (let i = 1; i <= countVal; i++) {
        const name = setupDraftNames[i - 1] || ('Team ' + i);
        const isMe = (i === setupMySlot);
        rows += '<tr class="' + (isMe ? 'is-me' : '') + '" id="setup_row_' + i + '">'
          + '<td class="slot-label"><span class="slot-badge">Slot ' + i + '</span></td>'
          + '<td><input type="text" class="team-input" id="team_input_' + i + '" data-slot="' + i + '" value="' + name.replace(/"/g, '&quot;') + '" placeholder="Team ' + i + ' name"></td>'
          + '<td class="radio-cell"><label><input type="radio" name="setup_my_slot" value="' + i + '"' + (isMe ? ' checked' : '') + ' onchange="changeSetupMySlot(' + i + ')"> <span>My Team</span></label></td>'
          + '<td><div class="order-btns">'
          + '<button type="button" class="btn-move" title="Move Up" onclick="moveSetupTeam(' + i + ', -1)"' + (i === 1 ? ' disabled' : '') + '>▲</button>'
          + '<button type="button" class="btn-move" title="Move Down" onclick="moveSetupTeam(' + i + ', 1)"' + (i === countVal ? ' disabled' : '') + '>▼</button>'
          + '</div></td>'
          + '</tr>';
      }
      return rows;
    })();
  }

  function resetSetupDefaults() {
    const count = Math.max(2, Math.min(32, parseInt($('setup_team_count').value, 10) || 12));
    setupDraftNames = [];
    for (let i = 1; i <= count; i++) {
      setupDraftNames.push(i === setupMySlot ? 'Ken' : ('Team ' + i));
    }
    for (let i = 1; i <= count; i++) {
      const inp = $('team_input_' + i);
      if (inp) inp.value = setupDraftNames[i - 1];
    }
  }

  function saveLeagueSetup() {
    syncSetupInputsFromDom();
    const s = global.state.settings;
    s.leagueName = ($('setup_league_name').value || "Ken's Draft Board").trim();
    s.teams = Math.max(2, Math.min(32, parseInt($('setup_team_count').value, 10) || 12));
    s.mode = $('setup_mode_select').value;
    s.scoring = $('setup_scoring_select').value;
    s.qbFormat = $('setup_qb_select').value;
    s.slot = setupMySlot;
    s.teamNames = setupDraftNames.slice(0, s.teams);
    while (s.teamNames.length < s.teams) s.teamNames.push('Team ' + (s.teamNames.length + 1));

    s.rosterSlots = {
      qb: Math.max(0, parseInt($('setup_roster_qb').value, 10) || 0),
      rb: Math.max(0, parseInt($('setup_roster_rb').value, 10) || 0),
      wr: Math.max(0, parseInt($('setup_roster_wr').value, 10) || 0),
      te: Math.max(0, parseInt($('setup_roster_te').value, 10) || 0),
      flex: Math.max(0, parseInt($('setup_roster_flex').value, 10) || 0),
      superflex: Math.max(0, parseInt($('setup_roster_superflex').value, 10) || 0),
      k: Math.max(0, parseInt($('setup_roster_k').value, 10) || 0),
      dst: Math.max(0, parseInt($('setup_roster_dst').value, 10) || 0),
      bench: Math.max(0, parseInt($('setup_roster_bench').value, 10) || 0)
    };

    const starters = s.rosterSlots.qb + s.rosterSlots.rb + s.rosterSlots.wr + s.rosterSlots.te +
      s.rosterSlots.flex + s.rosterSlots.superflex + s.rosterSlots.k + s.rosterSlots.dst;
    s.rounds = Math.max(1, starters + s.rosterSlots.bench);

    global.save();
    closeModal();
    if (typeof global.bindHeaderControls === 'function') global.bindHeaderControls();
    render();
  }

  // Export to global scope
  global.$ = $;
  global.renderHeader = renderHeader;
  global.scored = scored;
  global.renderPool = renderPool;
  global.renderRosterSection = renderRosterSection;
  global.renderMyRoster = renderMyRoster;
  global.renderInspectRoster = renderInspectRoster;
  global.renderLog = renderLog;
  global.renderTabs = renderTabs;
  global.setFilter = setFilter;
  global.renderWatchlistPanel = renderWatchlistPanel;
  global.renderBanner = renderBanner;
  global.render = render;
  global.closeModal = closeModal;
  global.showPlayer = showPlayer;
  global.showUnlistedPlayer = showUnlistedPlayer;
  global.openUnlistedPickModal = openUnlistedPickModal;
  global.selectUnlistedPos = selectUnlistedPos;
  global.submitUnlistedPick = submitUnlistedPick;
  global.openLeagueSetup = openLeagueSetup;
  global.syncSetupInputsFromDom = syncSetupInputsFromDom;
  global.changeSetupMySlot = changeSetupMySlot;
  global.moveSetupTeam = moveSetupTeam;
  global.resetSetupDefaults = resetSetupDefaults;
  global.saveLeagueSetup = saveLeagueSetup;
})(typeof window !== 'undefined' ? window : globalThis);

