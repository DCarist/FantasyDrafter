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

      const currentKeeper = (typeof isKeeperPick === 'function')
        ? isKeeperPick(pick, global.state.keepers, s.teams, s.rounds, s.mode, global.state.tradedPicks)
        : null;

      const nextData = (typeof getNextDraftPicks === 'function')
        ? getNextDraftPicks(s.slot, pick, s.teams, s.rounds, s.mode, global.state.tradedPicks, global.state.keepers)
        : {
          upcoming: picksForSlot(s.slot, s.teams, s.rounds, s.mode, global.state.tradedPicks).filter(p => p >= pick),
          draftPicks: [],
          nextDraftPick: null,
          distanceToNextDraftPick: null,
          isSoon: false
        };

      // Auditory and visual cues for user's turn
      if (currentKeeper) {
        const kp = (currentKeeper.playerId != null) ? (byId(currentKeeper.playerId) || {}) : {};
        const kName = currentKeeper.customName || kp.name || ('Player #' + currentKeeper.playerId);
        clock.textContent = 'Pick ' + fmtPick(pick, s.teams) + ' (#' + pick + ') — ' + who.name + ' (🔒 Keeper: ' + kName + ')';
        clock.className = 'clock';
        lastOnClockPickNotified = null;
      } else if (isMe) {
        clock.textContent = 'Pick ' + fmtPick(pick, s.teams) + ' (#' + pick + ') — ' + who.name + ' (YOU ARE ON THE CLOCK)';
        clock.className = 'clock mine' + (s.visualPulse ? ' pulse-anim' : '');
        if (lastOnClockPickNotified !== pick) {
          lastOnClockPickNotified = pick;
          if (typeof playPickChime === 'function') playPickChime();
        }
      } else {
        lastOnClockPickNotified = null;
        clock.textContent = 'Pick ' + fmtPick(pick, s.teams) + ' (#' + pick + ') — ' + who.name + ' (Slot ' + who.slot + ')';
        if (nextData.isSoon) {
          clock.className = 'clock soon';
        } else {
          clock.className = 'clock';
        }
      }

      if ($('nextpicks')) {
        if (!nextData.upcoming || nextData.upcoming.length === 0) {
          $('nextpicks').innerHTML = 'No picks left';
        } else {
          const items = nextData.upcoming.slice(0, 5).map(p => {
            const k = (typeof isKeeperPick === 'function')
              ? isKeeperPick(p, global.state.keepers, s.teams, s.rounds, s.mode, global.state.tradedPicks)
              : null;
            if (k) {
              const kp = (k.playerId != null) ? (byId(k.playerId) || {}) : {};
              const kName = k.customName || kp.name || 'Keeper';
              return '<span title="Keeper: ' + kName.replace(/"/g, '&quot;') + '">#' + p + ' <span class="meta" style="color:var(--warn); font-size:11.5px">(🔒 Keeper)</span></span>';
            }
            if (p === nextData.nextDraftPick) {
              return '<b>#' + p + ' (in ' + (p - pick) + ')</b>';
            }
            return '#' + p;
          });
          $('nextpicks').innerHTML = 'Your next picks: ' + items.join(', ');
        }
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
    if (global.ui.hideOutIR) rows = rows.filter(p => !(p.injury && (p.injury.code === 'O' || p.injury.code === 'IR')));
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

      let injTag = '';
      if (p.injury && p.injury.code) {
        const c = p.injury.code;
        const tip = (p.injury.status || 'Injured')
          + (p.injury.type ? ': ' + p.injury.type : '')
          + (p.injury.detail ? ' (' + p.injury.detail + ')' : '')
          + (p.injury.returnDate ? ' - Est. Return: ' + p.injury.returnDate : '');
        injTag = ' <span class="injtag inj-' + c.toLowerCase() + '" title="' + tip.replace(/"/g, '&quot;') + '">' + c + '</span>';
      }

      let actionCell = '';
      if (isTaken) {
        const pickEntry = pickOf.get(p.id);
        const keeperObj = Array.isArray(global.state.keepers) ? global.state.keepers.find(k => k && k.playerId === p.id) : null;
        if (keeperObj) {
          const isMine = keeperObj.slot === s.slot;
          const kTeamName = getTeamName(keeperObj.slot);
          actionCell = '<td><span class="picktag keeper-tag' + (isMine ? ' mine' : '') + '">'
            + '🔒 Keeper · ' + kTeamName + ' (Rd ' + keeperObj.round + ')</span></td>';
        } else if (pickEntry) {
          const tInfo = teamForOverall(pickEntry.overall, s.teams, s.mode, s.teamNames, s.slot, global.state.tradedPicks);
          const isMine = taken.get(p.id) === 'me' || tInfo.isMe;
          const isKp = pickEntry.isKeeper;
          actionCell = '<td><span class="picktag' + (isKp ? ' keeper-tag' : '') + (isMine ? ' mine' : '') + '">'
            + (isKp ? '🔒 ' : '') + (isMine ? '✅ ' : '') + tInfo.name + ' · '
            + fmtPick(pickEntry.overall, s.teams) + ' (#' + pickEntry.overall + ')</span></td>';
        } else {
          actionCell = '<td><span class="picktag">Taken</span></td>';
        }
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
        + '<td class="clickname" onclick="showPlayer(' + p.id + ')">' + starBtn + '<span class="pname">' + p.name + '</span>' + injTag + rookie + age + value + '</td>'
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

  function getRosterPicksForSlot(targetSlot) {
    const s = global.state.settings;
    const teamPicks = global.state.log.filter(e => {
      const tInfo = teamForOverall(e.overall, s.teams, s.mode, s.teamNames, s.slot, global.state.tradedPicks);
      return tInfo.slot === targetSlot;
    });

    const resolved = teamPicks.map(e => ({
      entry: e,
      player: resolvePickPlayer(e, byId)
    }));

    const keeperPicksMap = (typeof getKeeperPicksMap === 'function')
      ? getKeeperPicksMap(global.state.keepers, s.teams, s.rounds, s.mode, global.state.tradedPicks)
      : {};

    const loggedOveralls = new Set(teamPicks.map(e => e.overall));
    const loggedPlayerIds = new Set(teamPicks.map(e => e.playerId).filter(id => id != null));
    const loggedNames = new Set(teamPicks.map(e => e.customName ? normalizeName(e.customName) : '').filter(Boolean));

    for (const [overallStr, k] of Object.entries(keeperPicksMap)) {
      if (!k || k.slot !== targetSlot) continue;
      const overall = parseInt(overallStr, 10);
      if (loggedOveralls.has(overall)) continue;
      if (k.playerId != null && loggedPlayerIds.has(k.playerId)) continue;
      if (k.customName && loggedNames.has(normalizeName(k.customName))) continue;

      const p = (k.playerId != null) ? (byId(k.playerId) || {}) : {};
      resolved.push({
        entry: {
          overall: overall,
          mine: targetSlot === s.slot,
          isKeeper: true,
          isPendingKeeper: true
        },
        player: {
          id: k.playerId != null ? k.playerId : null,
          name: k.customName || p.name || ('Keeper #' + (k.playerId || overall)),
          pos: k.customPos || p.pos || 'WR',
          team: k.customTeam || p.team || '',
          bye: k.customBye != null ? k.customBye : (p.bye || null),
          isKeeper: true,
          isUnlisted: Boolean(k.customName)
        }
      });
    }

    resolved.sort((a, b) => (a.entry.overall || 0) - (b.entry.overall || 0));
    return {
      resolved: resolved,
      draftedCount: teamPicks.length,
      keeperCount: (global.state.keepers || []).filter(k => k && k.slot === targetSlot).length
    };
  }

  function renderMyRoster() {
    const s = global.state.settings;
    const targetSlot = s.slot;
    const myTeamName = getTeamName(targetSlot);
    const { resolved: resolvedPicks, draftedCount, keeperCount } = getRosterPicksForSlot(targetSlot);

    if ($('myrosterheader')) {
      const kText = keeperCount > 0 ? (' · ' + keeperCount + ' kept') : '';
      $('myrosterheader').innerHTML = '⭐ ' + myTeamName + ' <span class="meta" style="font-size:12px; margin-left:auto; font-weight:normal">Slot ' + targetSlot + ' · ' + draftedCount + ' drafted' + kText + '</span>';
    }

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
        const { draftedCount, keeperCount } = getRosterPicksForSlot(i);
        const kStr = keeperCount > 0 ? (' · ' + keeperCount + ' kept') : '';
        selectHtml += '<option value="' + i + '"' + (isSelected ? ' selected' : '') + '>'
          + (isClock ? '🕒 ' : (isMe ? '⭐ ' : '')) + getTeamName(i) + ' (Slot ' + i + ' · ' + draftedCount + ' picks' + kStr + ')' + (isMe ? ' [You]' : '')
          + '</option>';
      }
      $('rosterTeamSelect').innerHTML = selectHtml;
    }
    if ($('onclockquickbtn')) {
      $('onclockquickbtn').style.display = (global.viewingRosterSlot != null && global.viewingRosterSlot !== onClockTeam.slot) ? 'inline-block' : 'none';
    }

    const { resolved: resolvedPicks, draftedCount, keeperCount } = getRosterPicksForSlot(targetSlot);
    const kLabel = keeperCount > 0 ? (' <span class="meta" style="font-size:11px">(' + keeperCount + ' kept)</span>') : '';

    // Label
    if ($('clockteamlabel')) {
      if (isFollowingClock) {
        $('clockteamlabel').innerHTML = '🕒 <b style="color:var(--accent)">On The Clock:</b> <span style="color:var(--text); font-weight:600">' + onClockTeam.name + '</span>' + (onClockTeam.isMe ? ' <span style="color:var(--good); font-weight:700">(Your Turn!)</span>' : ' (Slot ' + onClockTeam.slot + ')') + kLabel;
      } else {
        $('clockteamlabel').innerHTML = '👥 <b style="color:var(--dim)">Inspecting:</b> <span style="color:var(--text); font-weight:600">' + getTeamName(targetSlot) + '</span> (Slot ' + targetSlot + ' · ' + draftedCount + ' picks' + (keeperCount > 0 ? ' · ' + keeperCount + ' kept' : '') + ') · <a href="javascript:void(0)" onclick="selectRosterSlot(null)" style="color:var(--accent); text-decoration:underline">Back to On-Clock</a>';
      }
    }

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
      const isKeeper = e.isKeeper || p.isKeeper;
      const keeperBadge = isKeeper ? ' <span class="keeper-badge" title="Keeper Selection" style="background:#3a2818; color:var(--warn); border:1px solid var(--warn); padding:1px 4px; border-radius:3px; font-size:10px; font-weight:600">🔒 Keeper</span>' : '';
      return '<div class="logitem' + (isMe ? ' mine' : '') + '">'
        + '<span class="meta">#' + e.overall + ' (' + fmtPick(e.overall, s.teams) + ')</span> '
        + '<b style="color:' + (isMe ? 'var(--good)' : 'var(--text)') + '">' + tInfo.name + (isMe ? ' (You)' : '') + '</b>: '
        + p.name + posTeam + unlistedBadge + keeperBadge + (isMe ? ' ✅' : '') + '</div>';
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

    const s = global.state.settings;
    const pick = currentPick();
    const totalPicks = s.teams * s.rounds;
    const isComplete = pick > totalPicks;
    if (isComplete && !wasDraftComplete) {
      wasDraftComplete = true;
      openDraftBoardModal('summary');
    } else if (!isComplete) {
      wasDraftComplete = false;
    }

    if (isBoardModalOpen && $('modalbox') && $('modalbox').classList.contains('modal-board')) {
      renderDraftBoardModalView();
    }
  }

  // ---------- Modals ----------
  let isBoardModalOpen = false;
  let returnToBoardOnClose = false;
  let boardHighlightFilter = 'ALL';
  let boardDensity = 'normal';
  let boardActiveTab = 'grid';
  let summarySortKey = 'rank';
  let summarySortAsc = true;
  let expandedTeamSlot = null;
  let wasDraftComplete = false;

  function closeModal() {
    isBoardModalOpen = false;
    returnToBoardOnClose = false;
    const overlay = $('overlay');
    if (overlay) overlay.classList.remove('show');
    const playerOverlay = $('playerOverlay');
    if (playerOverlay) playerOverlay.classList.remove('show');
    if ($('modalbox')) $('modalbox').className = 'modal';
  }

  function closePlayerModal() {
    returnToBoardOnClose = false;
    const playerOverlay = $('playerOverlay');
    if (playerOverlay) {
      playerOverlay.classList.remove('show');
    } else {
      closeModal();
    }
  }

  function handleClosePlayerModal() {
    closePlayerModal();
  }

  function openDraftBoardModal(initialTab) {
    isBoardModalOpen = true;
    returnToBoardOnClose = false;
    const s = global.state.settings;
    const pick = currentPick();
    const totalPicks = s.teams * s.rounds;
    const isComplete = pick > totalPicks;

    if (typeof initialTab === 'string' && ['grid', 'strategy', 'summary'].includes(initialTab)) {
      boardActiveTab = initialTab;
    } else if (isComplete) {
      boardActiveTab = 'summary';
    } else {
      boardActiveTab = 'grid';
    }

    renderDraftBoardModalView();
    if (boardActiveTab === 'grid') {
      setTimeout(() => {
        scrollBoardToCurrentPick(false);
      }, 60);
    }
  }

  function closeBoardModal() {
    isBoardModalOpen = false;
    returnToBoardOnClose = false;
    closeModal();
  }

  function setBoardActiveTab(tab) {
    if (typeof tab === 'string' && ['grid', 'strategy', 'summary'].includes(tab)) {
      boardActiveTab = tab;
    } else {
      boardActiveTab = 'grid';
    }
    renderDraftBoardModalView();
    if (boardActiveTab === 'grid') {
      setTimeout(() => {
        scrollBoardToCurrentPick(false);
      }, 60);
    }
  }

  function setBoardFilter(filter) {
    boardHighlightFilter = filter;
    renderDraftBoardModalView();
  }

  function toggleBoardDensity() {
    boardDensity = (boardDensity === 'normal' ? 'compact' : 'normal');
    renderDraftBoardModalView();
  }

  function setSummarySort(key) {
    if (summarySortKey === key) {
      summarySortAsc = !summarySortAsc;
    } else {
      summarySortKey = key;
      summarySortAsc = (key === 'rank' || key === 'slot');
    }
    renderDraftBoardModalView();
  }

  function toggleTeamRosterDrawer(slot) {
    expandedTeamSlot = (expandedTeamSlot === slot ? null : slot);
    renderDraftBoardModalView();
  }

  function scrollBoardToCurrentPick(smooth = true) {
    const container = $('board_container');
    const clockCell = document.querySelector('.board-cell.on-clock');
    if (container && clockCell) {
      const targetLeft = clockCell.offsetLeft - (container.clientWidth / 2) + (clockCell.clientWidth / 2);
      const targetTop = clockCell.offsetTop - (container.clientHeight / 2) + (clockCell.clientHeight / 2);
      container.scrollTo({
        left: Math.max(0, targetLeft),
        top: Math.max(0, targetTop),
        behavior: smooth ? 'smooth' : 'auto'
      });
    }
  }

  function showPlayerFromBoard(id) {
    returnToBoardOnClose = true;
    showPlayer(id);
  }

  function showUnlistedPlayerFromBoard(overall) {
    returnToBoardOnClose = true;
    showUnlistedPlayer(overall);
  }

  function renderDraftBoardModalView() {
    const s = global.state.settings;
    const pick = currentPick();
    const totalPicks = s.teams * s.rounds;
    const isComplete = pick > totalPicks;
    const onClockTeam = !isComplete ? teamForOverall(pick, s.teams, s.mode, s.teamNames, s.slot, global.state.tradedPicks) : null;
    const draftedPicksCount = Math.min(totalPicks, global.state.log.length);
    const pct = Math.round((draftedPicksCount / totalPicks) * 100);

    const modalBox = $('modalbox');
    if (modalBox) {
      modalBox.className = 'modal modal-board';
    }

    const overlay = $('overlay');
    if (overlay) overlay.classList.add('show');

    // 1. Tab Switcher
    const tabGridActive = (boardActiveTab === 'grid') ? ' active' : '';
    const tabStratActive = (boardActiveTab === 'strategy') ? ' active' : '';
    const tabSumActive = (boardActiveTab === 'summary') ? ' active' : '';

    const tabsHtml = '<div class="board-tabs">'
      + '<button type="button" class="board-tab-btn' + tabGridActive + '" onclick="setBoardActiveTab(\'grid\')">📊 Board Grid</button>'
      + '<button type="button" class="board-tab-btn' + tabStratActive + '" onclick="setBoardActiveTab(\'strategy\')">🎯 Live Strategy & Needs</button>'
      + '<button type="button" class="board-tab-btn' + tabSumActive + '" onclick="setBoardActiveTab(\'summary\')">🏆 League Value & Grades</button>'
      + '</div>';

    let clockStatusHtml = '';
    if (isComplete) {
      clockStatusHtml = '<span style="color:var(--good); font-weight:700">🏆 Draft Complete</span>';
    } else if (onClockTeam) {
      clockStatusHtml = 'On Clock: <strong style="color:var(--accent)">' + onClockTeam.name + '</strong> (Pick #' + pick + ')';
    }

    // 2. Toolbar Actions depending on active tab
    let toolbarActionsHtml = '';
    if (boardActiveTab === 'grid') {
      const filters = [
        { id: 'ALL', label: 'ALL' },
        { id: 'QB', label: 'QB', cls: 'filter-qb' },
        { id: 'RB', label: 'RB', cls: 'filter-rb' },
        { id: 'WR', label: 'WR', cls: 'filter-wr' },
        { id: 'TE', label: 'TE', cls: 'filter-te' },
        { id: 'K', label: 'K', cls: 'filter-k' },
        { id: 'DST', label: 'D/ST', cls: 'filter-dst' },
        { id: 'MY_TEAM', label: '⭐ My Team', cls: 'filter-my-team' }
      ];

      const filterButtonsHtml = filters.map(f => {
        const activeClass = (boardHighlightFilter === f.id) ? ' active' : '';
        const customClass = f.cls ? (' ' + f.cls) : '';
        return '<button type="button" class="board-filter-btn' + customClass + activeClass + '" onclick="setBoardFilter(\'' + f.id + '\')">' + f.label + '</button>';
      }).join('');

      const densityBtnLabel = (boardDensity === 'normal') ? '🗜️ Compact' : '👁️ Normal';

      toolbarActionsHtml = '<div class="board-filters">'
        + '<span class="meta" style="font-size:12px; margin-right:4px">Highlight:</span>'
        + filterButtonsHtml
        + '</div>'
        + '<div class="board-actions">'
        + (!isComplete ? '<button type="button" class="act" onclick="scrollBoardToCurrentPick(true)" style="font-size:11.5px; padding:3px 8px; font-weight:600; color:var(--accent); border-color:var(--accent)">⚡ Jump to On-Clock</button>' : '')
        + '<button type="button" class="act" onclick="toggleBoardDensity()" style="font-size:11.5px; padding:3px 8px">' + densityBtnLabel + '</button>'
        + '<button type="button" class="act primary" onclick="closeBoardModal()" style="font-size:11.5px; padding:3px 10px; font-weight:700">Done</button>'
        + '</div>';
    } else if (boardActiveTab === 'strategy') {
      toolbarActionsHtml = '<div class="board-actions">'
        + (!isComplete ? '<button type="button" class="act" onclick="setBoardActiveTab(\'grid\'); setTimeout(() => scrollBoardToCurrentPick(true), 60)" style="font-size:11.5px; padding:3px 8px; font-weight:600; color:var(--accent); border-color:var(--accent)">⚡ Jump to Grid On-Clock</button>' : '')
        + '<button type="button" class="act primary" onclick="closeBoardModal()" style="font-size:11.5px; padding:3px 10px; font-weight:700">Done</button>'
        + '</div>';
    } else {
      toolbarActionsHtml = '<div class="board-actions">'
        + '<button type="button" class="act primary" onclick="closeBoardModal()" style="font-size:11.5px; padding:3px 10px; font-weight:700">Done</button>'
        + '</div>';
    }

    // 3. Render Main View Content
    let mainViewHtml = '';
    if (boardActiveTab === 'grid') {
      const boardData = (typeof generateDraftBoardGrid === 'function')
        ? generateDraftBoardGrid({
          teams: s.teams,
          rounds: s.rounds,
          mode: s.mode,
          log: global.state.log,
          keepers: global.state.keepers,
          tradedPicks: global.state.tradedPicks,
          teamNames: s.teamNames,
          mySlot: s.slot,
          currentPickNum: pick,
          playersLookup: byId
        })
        : null;

      if (!boardData) return;

      const densityClass = (boardDensity === 'compact') ? ' board-compact' : '';

      let tableHeadHtml = '<thead><tr>';
      tableHeadHtml += '<th class="board-corner-th">RND</th>';
      for (let slot = 1; slot <= s.teams; slot++) {
        const isMe = (slot === s.slot);
        const name = (Array.isArray(s.teamNames) ? s.teamNames[slot - 1] : null) || (isMe ? 'My Team' : ('Team ' + slot));
        const isClock = (onClockTeam && onClockTeam.slot === slot);
        const thClasses = [
          'board-th',
          isMe ? 'is-me' : '',
          isClock ? 'is-clock' : ''
        ].filter(Boolean).join(' ');

        tableHeadHtml += '<th class="' + thClasses + '">'
          + '<div class="board-th-team" title="' + name + '">' + (isMe ? '⭐ ' : '') + name + '</div>'
          + '<div class="board-th-slot">SLOT ' + slot + (isMe ? ' <span style="font-size:9px; color:var(--good)">(YOU)</span>' : '') + '</div>'
          + '</th>';
      }
      tableHeadHtml += '</tr></thead>';

      let tableBodyHtml = '<tbody>';
      for (let rIdx = 0; rIdx < boardData.grid.length; rIdx++) {
        const row = boardData.grid[rIdx];
        const rNum = row.round;
        const arrow = row.isForward ? '➡️' : '⬅️';

        tableBodyHtml += '<tr>';
        tableBodyHtml += '<th class="board-round-th">'
          + '<div class="board-round-num">R' + rNum + '</div>'
          + '<div class="board-round-arrow" title="' + (row.isForward ? 'Forward (1 to N)' : 'Reverse (N to 1)') + '">' + arrow + '</div>'
          + '</th>';

        for (let cIdx = 0; cIdx < row.picks.length; cIdx++) {
          const pickCell = row.picks[cIdx];
          const overall = pickCell.overall;
          const isClock = pickCell.isOnClock;
          const isMe = pickCell.isMe;

          let isDimmed = false;
          if (boardHighlightFilter === 'MY_TEAM') {
            isDimmed = !isMe;
          } else if (boardHighlightFilter !== 'ALL') {
            if (pickCell.player) {
              const pPos = (pickCell.player.pos || '').toUpperCase();
              if (boardHighlightFilter === 'DST') {
                isDimmed = !['DST', 'DEF', 'D/ST'].includes(pPos);
              } else {
                isDimmed = (pPos !== boardHighlightFilter);
              }
            } else {
              isDimmed = true;
            }
          }

          const cellClasses = [
            'board-cell',
            isClock ? 'on-clock' : '',
            isMe ? 'is-me' : '',
            isDimmed ? 'board-dimmed' : ''
          ].filter(Boolean).join(' ');

          const isCompact = (boardDensity === 'compact');

          if (pickCell.isDrafted && pickCell.player) {
            const p = pickCell.player;
            const posUpper = (p.pos || '').toUpperCase();
            const posClass = ['QB', 'RB', 'WR', 'TE', 'K'].includes(posUpper)
              ? posUpper.toLowerCase()
              : (['DST', 'DEF', 'D/ST'].includes(posUpper) ? 'dst' : 'other');

            const clickFn = (p.id != null)
              ? ('showPlayerFromBoard(' + p.id + ')')
              : ('showUnlistedPlayerFromBoard(' + overall + ')');

            const isKeeper = pickCell.isKeeper;
            const isTraded = pickCell.isTraded;
            const unlistedBadge = p.isUnlisted ? ' <span style="font-size:10px; font-weight:normal; opacity:0.8">(custom)</span>' : '';
            const keeperBadge = isKeeper ? '<span class="keeper-tag-chip" title="Keeper Selection">🔒</span>' : '';
            const tradedChip = isTraded ? '<span class="traded-tag" title="Originally ' + pickCell.originalTeamName + '">via ' + pickCell.originalTeamName + '</span>' : '';
            const teamByeStr = (p.team && p.team !== '—' ? p.team : '') + (p.bye ? (p.team && p.team !== '—' ? ' · ' : '') + 'Wk ' + p.bye : '');

            if (isCompact) {
              let topEndHtml = '';
              if (isKeeper) {
                topEndHtml = '<span class="board-card-compact-meta">' + keeperBadge + ' ' + (teamByeStr || '—') + '</span>'
                  + '<span class="board-card-pos">' + (p.pos || '—') + '</span>';
              } else {
                topEndHtml = (tradedChip ? tradedChip + ' ' : '')
                  + '<span class="board-card-compact-meta">' + (teamByeStr || (p.pos || '—')) + '</span>';
              }

              tableBodyHtml += '<td class="' + cellClasses + '" data-overall="' + overall + '">'
                + '<div class="board-card ' + posClass + '" onclick="' + clickFn + '">'
                + '<div class="board-card-top">'
                + '<span class="board-card-pick">#' + overall + ' (' + fmtPick(overall, s.teams) + ')</span>'
                + '<div class="board-card-top-end">' + topEndHtml + '</div>'
                + '</div>'
                + '<div class="board-card-name" title="' + (p.name || '').replace(/"/g, '&quot;') + '">' + (p.name || 'Unlisted') + unlistedBadge + '</div>'
                + '</div>'
                + '</td>';
            } else {
              tableBodyHtml += '<td class="' + cellClasses + '" data-overall="' + overall + '">'
                + '<div class="board-card ' + posClass + '" onclick="' + clickFn + '">'
                + '<div class="board-card-top">'
                + '<span class="board-card-pick">#' + overall + ' (' + fmtPick(overall, s.teams) + ')</span>'
                + '<span class="board-card-pos">' + (p.pos || '—') + '</span>'
                + '</div>'
                + '<div class="board-card-name" title="' + (p.name || '').replace(/"/g, '&quot;') + '">' + (p.name || 'Unlisted') + unlistedBadge + '</div>'
                + '<div class="board-card-bottom">'
                + '<span class="board-card-team">' + (teamByeStr || '—') + '</span>'
                + '<div style="display:flex; align-items:center; gap:3px">' + keeperBadge + tradedChip + '</div>'
                + '</div>'
                + '</div>'
                + '</td>';
            }
          } else if (pickCell.isPendingKeeper && pickCell.player) {
            const p = pickCell.player;
            const posUpper = (p.pos || '').toUpperCase();
            const posClass = ['QB', 'RB', 'WR', 'TE', 'K'].includes(posUpper)
              ? posUpper.toLowerCase()
              : (['DST', 'DEF', 'D/ST'].includes(posUpper) ? 'dst' : 'other');

            const teamByeStr = (p.team && p.team !== '—' ? p.team : '') + (p.bye ? (p.team && p.team !== '—' ? ' · ' : '') + 'Wk ' + p.bye : '');

            if (isCompact) {
              tableBodyHtml += '<td class="' + cellClasses + '" data-overall="' + overall + '">'
                + '<div class="board-card pending-keeper ' + posClass + '" title="Keeper Assignment (Round ' + pickCell.round + ')">'
                + '<div class="board-card-top">'
                + '<span class="board-card-pick">#' + overall + ' (' + fmtPick(overall, s.teams) + ')</span>'
                + '<div class="board-card-top-end">'
                + '<span class="board-card-compact-meta">' + (teamByeStr || '—') + '</span>'
                + '</div>'
                + '</div>'
                + '<div class="board-card-name" title="' + (p.name || '').replace(/"/g, '&quot;') + '"><span class="keeper-tag-chip" style="margin-right:3px">🔒</span>' + p.name + '</div>'
                + '</div>'
                + '</td>';
            } else {
              tableBodyHtml += '<td class="' + cellClasses + '" data-overall="' + overall + '">'
                + '<div class="board-card pending-keeper ' + posClass + '" title="Keeper Assignment (Round ' + pickCell.round + ')">'
                + '<div class="board-card-top">'
                + '<span class="board-card-pick">#' + overall + ' (' + fmtPick(overall, s.teams) + ')</span>'
                + '<span class="board-card-team" style="font-size:10.5px">' + (teamByeStr || '—') + '</span>'
                + '</div>'
                + '<div class="board-card-name" title="' + (p.name || '').replace(/"/g, '&quot;') + '"><span class="keeper-tag-chip" style="margin-right:3px">🔒</span>' + p.name + '</div>'
                + '<div class="board-card-bottom">'
                + '<span class="meta" style="font-size:10px; color:var(--warn)">Keeper Assignment</span>'
                + '</div>'
                + '</div>'
                + '</td>';
            }
          } else {
            // Empty upcoming cell
            const onClockBadge = isClock ? '<span class="on-clock-badge">⚡ ON CLOCK</span>' : '';
            const tradedChip = pickCell.isTraded ? '<span class="traded-tag">via ' + pickCell.originalTeamName + '</span>' : '';

            tableBodyHtml += '<td class="' + cellClasses + '" data-overall="' + overall + '">'
              + '<div class="board-empty">'
              + '<div style="display:flex; justify-content:space-between; align-items:center">'
              + '<span class="board-empty-pick">' + fmtPick(overall, s.teams) + ' <span style="font-size:10px; font-weight:normal">(#' + overall + ')</span></span>'
              + onClockBadge
              + '</div>'
              + '<div style="display:flex; justify-content:space-between; align-items:flex-end">'
              + '<span class="board-empty-sub">Slot ' + pickCell.effectiveSlot + '</span>'
              + tradedChip
              + '</div>'
              + '</div>'
              + '</td>';
          }
        }
        tableBodyHtml += '</tr>';
      }
      tableBodyHtml += '</tbody>';

      mainViewHtml = '<div class="board-container" id="board_container">'
        + '<table class="board-table' + densityClass + '" id="board_table">'
        + tableHeadHtml
        + tableBodyHtml
        + '</table>'
        + '</div>';
    } else if (boardActiveTab === 'strategy') {
      const taken = (typeof takenMap === 'function') ? takenMap() : (typeof global.takenMap === 'function' ? global.takenMap() : new Map());
      const allScored = (typeof scored === 'function') ? scored() : (Array.isArray(global.PLAYERS) ? global.PLAYERS : []);
      const availablePlayers = allScored.filter(p => p && p.id != null && !taken.has(p.id));

      const strat = (typeof analyzeLiveDraftStrategy === 'function')
        ? analyzeLiveDraftStrategy({
          teams: s.teams,
          rounds: s.rounds,
          mode: s.mode,
          log: global.state.log,
          keepers: global.state.keepers,
          tradedPicks: global.state.tradedPicks,
          teamNames: s.teamNames,
          mySlot: s.slot,
          currentPickNum: pick,
          playersLookup: byId,
          rosterSlots: s.rosterSlots,
          scoringSettings: { blend: s.blend / 100, qbFormat: s.qbFormat, scoring: s.scoring, tePremium: s.teprem },
          availablePlayers: availablePlayers,
          watchlist: global.state.watchlist || []
        })
        : null;

      if (!strat) return;

      // Banner
      let bannerHtml = '';
      if (strat.isOnClock) {
        bannerHtml = '<div class="strategy-banner on-clock">'
          + '<div>'
          + '<h4 style="margin:0; font-size:16px; color:var(--good); display:flex; align-items:center; gap:6px">⚡ YOU ARE ON THE CLOCK! (Pick #' + pick + ')</h4>'
          + '<div style="font-size:12px; color:#cbd5e1; margin-top:2px">It is your turn to pick. Check your top recommended targets below or view the player pool.</div>'
          + '</div>'
          + '<button type="button" class="act primary" onclick="closeBoardModal()" style="font-weight:700">Make Pick ➔</button>'
          + '</div>';
      } else if (strat.isComplete) {
        bannerHtml = '<div class="strategy-banner">'
          + '<div>'
          + '<h4 style="margin:0; font-size:15px; color:var(--good)">🏆 Draft Complete</h4>'
          + '<div style="font-size:12px; color:#cbd5e1">All ' + totalPicks + ' picks have been drafted. Switch to the League Value & Grades tab to view full team rankings and superlatives.</div>'
          + '</div>'
          + '<button type="button" class="act primary" onclick="setBoardActiveTab(\'summary\')" style="font-weight:700">View Final Rankings ➔</button>'
          + '</div>';
      } else {
        bannerHtml = '<div class="strategy-banner">'
          + '<div>'
          + '<h4 style="margin:0; font-size:15px; color:var(--text)">⏳ ' + strat.picksUntilUserTurn + ' Pick' + (strat.picksUntilUserTurn === 1 ? '' : 's') + ' Until Your Turn</h4>'
          + '<div style="font-size:12px; color:var(--dim); margin-top:2px">Your next turn is <strong style="color:var(--accent)">Pick #' + strat.nextUserPick + ' (' + fmtPick(strat.nextUserPick, s.teams) + ')</strong> · Currently on clock: <strong style="color:var(--text)">' + (onClockTeam ? onClockTeam.name : 'Pick #' + pick) + '</strong></div>'
          + '</div>'
          + '</div>';
      }

      // Opponent Threats
      let threatsHtml = '';
      if (strat.opponentThreats.length > 0) {
        const cardsHtml = strat.opponentThreats.map(t => {
          const needsHtml = t.urgentNeeds.map(n => {
            const posUpper = (n.pos || '').toUpperCase();
            const posBadgeClass = (posUpper === 'DST' || posUpper === 'DEF' || posUpper === 'D/ST') ? 'DST' : posUpper;
            return '<span class="pos ' + posBadgeClass + '" style="font-size:9.5px; font-weight:800; padding:1px 5px; border-radius:3px">' + n.pos + '</span>';
          }).join('') || '<span style="font-size:10px; color:var(--dim)">Depth / Bench</span>';

          return '<div class="threat-card">'
            + '<div class="threat-card-top">'
            + '<span style="font-weight:800; color:var(--accent)">' + t.pickFmt + ' <span style="font-size:9.5px; font-weight:normal; color:var(--dim)">(#' + t.overall + ')</span></span>'
            + '<span style="font-size:10px; color:var(--dim)">Slot ' + t.slot + '</span>'
            + '</div>'
            + '<div class="threat-card-team">' + t.teamName + '</div>'
            + '<div style="font-size:10px; color:var(--dim); margin-top:2px">Target Needs:</div>'
            + '<div class="threat-needs-list">' + needsHtml + '</div>'
            + '</div>';
        }).join('');

        const dangersHtml = strat.runDangers.map(d => {
          return '<span class="threat-danger-badge">🚨 ' + d.message + '</span>';
        }).join('');

        threatsHtml = '<div class="threat-timeline-wrapper">'
          + '<div class="strategy-section-title">🛡️ Opponents Drafting Before Your Turn (' + strat.opponentThreats.length + ' Picks Ahead)</div>'
          + '<div class="threat-timeline">' + cardsHtml + '</div>'
          + (dangersHtml ? '<div class="run-dangers-bar">' + dangersHtml + '</div>' : '')
          + '</div>';
      }

      // User Needs Grid
      const needsCardsHtml = strat.userNeeds.map(n => {
        let statusCls = 'need-status-pill ' + n.urgency.toLowerCase();
        let barPct = Math.min(100, Math.round((n.filled / Math.max(1, n.baseReq)) * 100));
        let barColor = (n.urgency === 'CRITICAL') ? 'var(--qb)' : (n.urgency === 'NEEDED' ? 'var(--warn)' : 'var(--good)');

        return '<div class="need-card">'
          + '<div class="need-card-header">'
          + '<span class="pos ' + (n.pos === 'DST' ? 'DST' : n.pos) + '" style="font-size:10px">' + n.pos + '</span>'
          + '<span class="' + statusCls + '">' + n.label + '</span>'
          + '</div>'
          + '<div style="font-size:13px; font-weight:800; color:var(--text)">' + n.filled + ' / ' + n.baseReq + ' <span style="font-size:11px; font-weight:normal; color:var(--dim)">starters</span></div>'
          + '<div style="background:rgba(255,255,255,0.08); height:4px; border-radius:2px; overflow:hidden"><div style="background:' + barColor + '; width:' + barPct + '%; height:100%"></div></div>'
          + '</div>';
      }).join('');

      // Positional Targets: Top 5 BPA per Position
      let targetsHtml = '';
      if (strat.targetsByPosition) {
        const posOrder = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
        const posTitles = {
          QB: 'Quarterbacks',
          RB: 'Running Backs',
          WR: 'Wide Receivers',
          TE: 'Tight Ends',
          K: 'Kickers',
          DST: 'Defenses'
        };

        const currentRound = Math.ceil(pick / s.teams);
        const isLateRounds = (currentRound >= s.rounds - 2);
        const visiblePositions = posOrder.filter(pos => {
          if (pos === 'K' || pos === 'DST') {
            return isLateRounds || (strat.userNeeds.some(n => n.pos === pos && (n.urgency === 'CRITICAL' || n.urgency === 'NEEDED')));
          }
          return true;
        });

        const posColumnsHtml = visiblePositions.map(pos => {
          const pList = strat.targetsByPosition[pos] || [];
          const needInfo = strat.userNeeds.find(n => n.pos === pos) || { urgency: 'FILLED', label: 'Filled' };
          const isCritical = (needInfo.urgency === 'CRITICAL' || needInfo.urgency === 'NEEDED');
          const posClass = (pos === 'DST') ? 'DST' : pos;
          const colClass = isCritical ? 'pos-target-col urgent' : 'pos-target-col';

          let rowsHtml = '';
          if (pList.length === 0) {
            rowsHtml = '<div style="font-size:11px; color:var(--dim); padding:10px 0; text-align:center">No available players</div>';
          } else {
            rowsHtml = pList.map((p, idx) => {
              const isW = Boolean(p.isWatched || (global.state.watchlist && global.state.watchlist.includes(p.id)));
              const starIcon = isW ? '★' : '☆';
              const starClass = isW ? 'target-star-btn active' : 'target-star-btn';
              const starTitle = isW ? 'In Watchlist (Click to remove)' : 'Add to Watchlist';

              let byeHtml = '';
              if (p.bye) {
                const bClash = p.byeClash || { type: 'none' };
                if (bClash.type === 'same-pos') {
                  const names = (bClash.samePos || []).map(x => x.name).join(', ');
                  const tip = 'Same-position bye clash with ' + (names || 'roster') + ' (Week ' + p.bye + ')';
                  byeHtml = '<span class="target-bye-pill clash" title="' + tip.replace(/"/g, '&quot;') + '">⚠️ Wk ' + p.bye + '</span>';
                } else if (bClash.type === 'other-pos') {
                  const names = (bClash.otherPos || []).map(x => x.name).join(', ');
                  const tip = 'Bye coincides with ' + (names || 'roster') + ' (Week ' + p.bye + ')';
                  byeHtml = '<span class="target-bye-pill overlap" title="' + tip.replace(/"/g, '&quot;') + '">⚡ Wk ' + p.bye + '</span>';
                } else {
                  byeHtml = '<span class="target-bye-pill normal">Wk ' + p.bye + '</span>';
                }
              } else {
                byeHtml = '<span class="target-bye-pill normal">—</span>';
              }

              const surplusTag = (p.valSurplus > 0)
                ? ('<span style="color:var(--good); font-size:10px; font-weight:700">+' + p.valSurplus + ' vs ADP</span>')
                : (p.adp ? ('<span style="color:var(--dim); font-size:10px">ADP ' + p.adp + '</span>') : '');

              const rookieTag = p.rookie ? '<span class="rookietag" style="font-size:8.5px; padding:0 3px">R</span>' : '';

              return '<div class="target-row" onclick="showPlayer(' + p.id + ')">'
                + '<div style="display:flex; align-items:center; gap:6px; min-width:0">'
                + '<button type="button" class="' + starClass + '" title="' + starTitle + '" onclick="event.stopPropagation(); toggleWatch(' + p.id + '); renderDraftBoardModalView();">' + starIcon + '</button>'
                + '<span class="target-rank-num">#' + (idx + 1) + '</span>'
                + '<div style="min-width:0; overflow:hidden; text-overflow:ellipsis">'
                + '<div style="font-size:11.5px; font-weight:700; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:flex; align-items:center; gap:4px">'
                + '<span>' + p.name + '</span>'
                + rookieTag
                + '</div>'
                + '<div style="font-size:10px; color:var(--dim); display:flex; align-items:center; gap:4px; margin-top:1px">'
                + '<span>' + (p.team || '—') + '</span>'
                + '<span>·</span>'
                + byeHtml
                + '</div>'
                + '</div>'
                + '</div>'
                + '<div style="text-align:right; flex-shrink:0">'
                + '<div style="font-size:12px; font-weight:800; color:var(--accent)">' + p.score + ' <span style="font-size:9.5px; font-weight:normal; color:var(--dim)">pts</span></div>'
                + '<div>' + surplusTag + '</div>'
                + '</div>'
                + '</div>';
            }).join('');
          }

          let statusPillCls = 'need-status-pill ' + needInfo.urgency.toLowerCase();

          return '<div class="' + colClass + '">'
            + '<div class="pos-target-header">'
            + '<div style="display:flex; align-items:center; gap:5px">'
            + '<span class="pos ' + posClass + '" style="font-size:10px; padding:1px 5px">' + pos + '</span>'
            + '<span style="font-size:12px; font-weight:700; color:var(--text)">' + posTitles[pos] + '</span>'
            + '</div>'
            + '<span class="' + statusPillCls + '">' + needInfo.label + '</span>'
            + '</div>'
            + '<div class="pos-target-list">' + rowsHtml + '</div>'
            + '</div>';
        }).join('');

        targetsHtml = '<div>'
          + '<div class="strategy-section-title">🎯 Best Available Players by Position (Top 5 per Position)</div>'
          + '<div class="pos-targets-grid">' + posColumnsHtml + '</div>'
          + '</div>';
      }

      mainViewHtml = '<div class="strategy-container">'
        + bannerHtml
        + threatsHtml
        + '<div>'
        + '<div class="strategy-section-title">📋 Your Team Starter Needs & Roster Health</div>'
        + '<div class="needs-grid">' + needsCardsHtml + '</div>'
        + '</div>'
        + targetsHtml
        + '</div>';
    } else {
      // Summary View
      const summary = (typeof generateDraftSummaryAnalysis === 'function')
        ? generateDraftSummaryAnalysis({
          teams: s.teams,
          rounds: s.rounds,
          mode: s.mode,
          log: global.state.log,
          keepers: global.state.keepers,
          tradedPicks: global.state.tradedPicks,
          teamNames: s.teamNames,
          mySlot: s.slot,
          playersLookup: byId,
          rosterSlots: s.rosterSlots,
          scoringSettings: { blend: s.blend / 100, qbFormat: s.qbFormat, scoring: s.scoring, tePremium: s.teprem }
        })
        : null;

      if (!summary) return;

      const myT = summary.myTeam;
      const myGradeLetter = (myT && myT.grade) ? myT.grade.charAt(0).toLowerCase() : 'b';

      const myReportHtml = myT
        ? '<div class="summary-report-card">'
        + '<div class="summary-stat-box">'
        + '<div class="summary-stat-label">Your Grade</div>'
        + '<div class="summary-stat-val"><span class="grade-badge ' + myGradeLetter + '">' + myT.grade + '</span></div>'
        + '</div>'
        + '<div class="summary-stat-box">'
        + '<div class="summary-stat-label">League Rank</div>'
        + '<div class="summary-stat-val">#' + myT.rank + ' <span style="font-size:12px; font-weight:normal; color:var(--dim)">of ' + s.teams + '</span></div>'
        + '</div>'
        + '<div class="summary-stat-box">'
        + '<div class="summary-stat-label">Total Value Score</div>'
        + '<div class="summary-stat-val" style="color:var(--accent)">' + myT.totalScore + ' <span style="font-size:11px; font-weight:normal; color:var(--dim)">pts</span></div>'
        + '</div>'
        + '<div class="summary-stat-box">'
        + '<div class="summary-stat-label">Starters Value</div>'
        + '<div class="summary-stat-val">' + myT.startersScore + ' <span style="font-size:11px; font-weight:normal; color:var(--dim)">pts</span></div>'
        + '</div>'
        + '<div class="summary-stat-box">'
        + '<div class="summary-stat-label">Value vs ADP</div>'
        + '<div class="summary-stat-val" style="color:' + (myT.netAdpSurplus >= 0 ? 'var(--good)' : 'var(--warn)') + '">' + (myT.netAdpSurplus >= 0 ? '+' : '') + myT.netAdpSurplus + '</div>'
        + '</div>'
        + '<div class="summary-stat-box">'
        + '<div class="summary-stat-label">Best Value Pick</div>'
        + '<div class="summary-stat-val" style="font-size:12px; font-weight:700">' + (myT.bestSteal ? (myT.bestSteal.player.name + ' (+' + Math.round(myT.bestSteal.surplus) + ')') : '—') + '</div>'
        + '</div>'
        + '</div>'
        : '';

      // Superlatives
      const sup = summary.superlatives;
      const superlativesHtml = '<div class="superlatives-grid">'
        + '<div class="superlative-card"><div class="superlative-title">👑 Top Rated Team</div><div class="superlative-winner">' + (sup.champion ? sup.champion.teamName : '—') + '</div><div class="superlative-detail">' + (sup.champion ? sup.champion.totalScore + ' total points (' + sup.champion.grade + ')' : '') + '</div></div>'
        + '<div class="superlative-card"><div class="superlative-title">💎 Steal of the Draft</div><div class="superlative-winner">' + (sup.bestSteal ? sup.bestSteal.player.name : '—') + '</div><div class="superlative-detail">' + (sup.bestSteal ? '+' + Math.round(sup.bestSteal.surplus) + ' picks past ADP (' + (sup.bestSteal.player.effectiveTeamName || '') + ')' : '') + '</div></div>'
        + '<div class="superlative-card"><div class="superlative-title">🚨 Biggest Reach</div><div class="superlative-winner">' + (sup.biggestReach ? sup.biggestReach.player.name : '—') + '</div><div class="superlative-detail">' + (sup.biggestReach ? Math.round(sup.biggestReach.surplus) + ' picks ahead of ADP (' + (sup.biggestReach.player.effectiveTeamName || '') + ')' : '') + '</div></div>'
        + '<div class="superlative-card"><div class="superlative-title">🥇 Best QB Room</div><div class="superlative-winner">' + (sup.bestQb ? sup.bestQb.teamName : '—') + '</div><div class="superlative-detail">' + (sup.bestQb ? sup.bestQb.qbScore + ' QB points' : '') + '</div></div>'
        + '<div class="superlative-card"><div class="superlative-title">🥇 Best RB Room</div><div class="superlative-winner">' + (sup.bestRb ? sup.bestRb.teamName : '—') + '</div><div class="superlative-detail">' + (sup.bestRb ? sup.bestRb.rbScore + ' RB points' : '') + '</div></div>'
        + '<div class="superlative-card"><div class="superlative-title">🥇 Best WR Room</div><div class="superlative-winner">' + (sup.bestWr ? sup.bestWr.teamName : '—') + '</div><div class="superlative-detail">' + (sup.bestWr ? sup.bestWr.wrScore + ' WR points' : '') + '</div></div>'
        + '<div class="superlative-card"><div class="superlative-title">🥇 Best TE Room</div><div class="superlative-winner">' + (sup.bestTe ? sup.bestTe.teamName : '—') + '</div><div class="superlative-detail">' + (sup.bestTe ? sup.bestTe.teScore + ' TE points' : '') + '</div></div>'
        + '</div>';

      // Power Rankings Table
      const sortedTeams = summary.teams.slice().sort((a, b) => {
        let valA = a[summarySortKey];
        let valB = b[summarySortKey];
        if (summarySortKey === 'rank') {
          return summarySortAsc ? (a.rank - b.rank) : (b.rank - a.rank);
        }
        return summarySortAsc ? (valA - valB) : (valB - valA);
      });

      const sortIndicator = key => (summarySortKey === key ? (summarySortAsc ? ' ▲' : ' ▼') : '');

      const tableRowsHtml = sortedTeams.map(t => {
        const gLetter = t.grade ? t.grade.charAt(0).toLowerCase() : 'b';
        const isExpanded = (expandedTeamSlot === t.slot);

        let drawerHtml = '';
        if (isExpanded) {
          const startersListHtml = t.starters.map(st => {
            const p = st.player;
            if (!p) return '<div style="font-size:11px; color:var(--dim)">' + st.label + ': <span style="font-style:italic">Open</span></div>';
            return '<div style="font-size:11px; display:flex; align-items:center; justify-content:space-between">'
              + '<span><strong style="color:var(--accent)">[' + st.label + ']</strong> ' + p.name + '</span>'
              + '<span style="color:var(--dim)">' + Math.round(p.score || 0) + ' pts</span>'
              + '</div>';
          }).join('');

          const benchListHtml = t.bench.map(bn => {
            const p = bn.player;
            if (!p) return '';
            return '<div style="font-size:11px; display:flex; align-items:center; justify-content:space-between">'
              + '<span><span class="pos ' + (p.pos === 'DST' ? 'DST' : p.pos) + '" style="font-size:9px">' + p.pos + '</span> ' + p.name + '</span>'
              + '<span style="color:var(--dim)">' + Math.round(p.score || 0) + ' pts</span>'
              + '</div>';
          }).join('');

          drawerHtml = '<tr><td colspan="10" style="padding:0">'
            + '<div class="team-roster-drawer">'
            + '<div><strong style="font-size:11px; color:var(--text); text-transform:uppercase">Starters (' + t.startersScore + ' pts)</strong><div style="display:flex; flex-direction:column; gap:3px; margin-top:4px">' + startersListHtml + '</div></div>'
            + '<div><strong style="font-size:11px; color:var(--text); text-transform:uppercase">Bench (' + t.benchScore + ' pts)</strong><div style="display:flex; flex-direction:column; gap:3px; margin-top:4px">' + (benchListHtml || '<span style="font-size:11px; color:var(--dim)">No bench players</span>') + '</div></div>'
            + '</div>'
            + '</td></tr>';
        }

        return '<tr class="' + (t.isMe ? 'is-me' : '') + '" onclick="toggleTeamRosterDrawer(' + t.slot + ')" style="cursor:pointer" title="Click to view full roster">'
          + '<td class="summary-rank-cell">#' + t.rank + '</td>'
          + '<td><strong style="color:var(--text)">' + (t.isMe ? '⭐ ' : '') + t.teamName + '</strong> <span style="font-size:10px; color:var(--dim)">Slot ' + t.slot + '</span></td>'
          + '<td><span class="grade-badge ' + gLetter + '">' + t.grade + '</span></td>'
          + '<td style="font-weight:800; color:var(--accent)">' + t.totalScore + '</td>'
          + '<td style="color:var(--dim)">' + t.startersScore + ' / ' + t.benchScore + '</td>'
          + '<td><div class="summary-pos-cell"><span>' + t.qbScore + '</span><span class="pos-rank-pill' + (t.qbRank === 1 ? ' top' : '') + '">#' + t.qbRank + '</span></div></td>'
          + '<td><div class="summary-pos-cell"><span>' + t.rbScore + '</span><span class="pos-rank-pill' + (t.rbRank === 1 ? ' top' : '') + '">#' + t.rbRank + '</span></div></td>'
          + '<td><div class="summary-pos-cell"><span>' + t.wrScore + '</span><span class="pos-rank-pill' + (t.wrRank === 1 ? ' top' : '') + '">#' + t.wrRank + '</span></div></td>'
          + '<td><div class="summary-pos-cell"><span>' + t.teScore + '</span><span class="pos-rank-pill' + (t.teRank === 1 ? ' top' : '') + '">#' + t.teRank + '</span></div></td>'
          + '<td style="color:' + (t.netAdpSurplus >= 0 ? 'var(--good)' : 'var(--warn)') + '">' + (t.netAdpSurplus >= 0 ? '+' : '') + t.netAdpSurplus + '</td>'
          + '</tr>'
          + drawerHtml;
      }).join('');

      mainViewHtml = '<div class="summary-container">'
        + myReportHtml
        + '<div>'
        + '<div class="strategy-section-title">🏆 Draft Superlatives & Unit Awards</div>'
        + superlativesHtml
        + '</div>'
        + '<div>'
        + '<div class="strategy-section-title">📊 Team Power Rankings & Positional Value Table (Click Team to View Roster)</div>'
        + '<div class="summary-table-wrapper">'
        + '<table class="summary-table">'
        + '<thead>'
        + '<tr>'
        + '<th onclick="setSummarySort(\'rank\')">Rank' + sortIndicator('rank') + '</th>'
        + '<th onclick="setSummarySort(\'slot\')">Team' + sortIndicator('slot') + '</th>'
        + '<th>Grade</th>'
        + '<th onclick="setSummarySort(\'totalScore\')">Total Score' + sortIndicator('totalScore') + '</th>'
        + '<th onclick="setSummarySort(\'startersScore\')">Starters / Bench' + sortIndicator('startersScore') + '</th>'
        + '<th onclick="setSummarySort(\'qbScore\')">QB Value' + sortIndicator('qbScore') + '</th>'
        + '<th onclick="setSummarySort(\'rbScore\')">RB Value' + sortIndicator('rbScore') + '</th>'
        + '<th onclick="setSummarySort(\'wrScore\')">WR Value' + sortIndicator('wrScore') + '</th>'
        + '<th onclick="setSummarySort(\'teScore\')">TE Value' + sortIndicator('teScore') + '</th>'
        + '<th onclick="setSummarySort(\'netAdpSurplus\')">ADP Value' + sortIndicator('netAdpSurplus') + '</th>'
        + '</tr>'
        + '</thead>'
        + '<tbody>'
        + tableRowsHtml
        + '</tbody>'
        + '</table>'
        + '</div>'
        + '</div>'
        + '</div>';
    }

    // 4. Modal Template Shell
    $('modalbox').innerHTML =
      '<div class="board-modal-header">'
      + '<h3>📊 ' + (s.leagueName || "Ken's Draft Board") + ' <span class="meta" style="font-size:13px; font-weight:normal">(' + s.teams + ' Teams · ' + s.rounds + ' Rounds · ' + (s.mode === '3rr' ? '3RR' : 'Snake') + ')</span></h3>'
      + '<button class="close" onclick="closeBoardModal()">×</button>'
      + '</div>'
      + '<div class="board-toolbar">'
      + tabsHtml
      + toolbarActionsHtml
      + '</div>'
      + mainViewHtml;

    $('overlay').classList.add('show');
  }

  let injuryAccordionExpanded = false;

  function toggleInjuryAccordion() {
    injuryAccordionExpanded = !injuryAccordionExpanded;
    const body = $('inj_accordion_body');
    const arrow = $('inj_accordion_arrow');
    if (body) body.classList.toggle('show', injuryAccordionExpanded);
    if (arrow) arrow.textContent = injuryAccordionExpanded ? '▲' : '▼';
  }
  global.toggleInjuryAccordion = toggleInjuryAccordion;

  function renderInjurySection(p) {
    const refreshDate = (window.DRAFT_DATA && (window.DRAFT_DATA.injuriesUpdated || window.DRAFT_DATA.generated)) || 'latest update';
    if (!p.injury || !p.injury.code) {
      return '<div class="injury-accordion inactive">'
        + '<div class="injury-header-inactive">'
        + '<span class="injury-inactive-icon">🩺</span>'
        + '<span class="injury-inactive-text">No injury reported as of ' + refreshDate + '</span>'
        + '</div>'
        + '</div>';
    }

    const inj = p.injury;
    const c = (inj.code || 'Q').toLowerCase();
    const returnText = inj.returnDate ? '<span class="inj-returndate">Est. Return: <b>' + inj.returnDate + '</b></span>' : '';
    const partText = inj.type ? (inj.type + (inj.detail ? ' (' + inj.detail + ')' : '')) : (inj.detail || 'Undisclosed');
    const comments = inj.longComment || inj.shortComment || 'No additional notes reported.';

    return '<div class="injury-accordion active inj-theme-' + c + '">'
      + '<div class="injury-header" onclick="toggleInjuryAccordion()">'
      + '<div class="injury-header-left">'
      + '<span class="injtag inj-' + c + '">' + inj.code + '</span>'
      + '<span class="inj-title"><b>' + inj.status + ':</b> ' + partText + '</span>'
      + returnText
      + '</div>'
      + '<span id="inj_accordion_arrow" class="dc-arrow">' + (injuryAccordionExpanded ? '▲' : '▼') + '</span>'
      + '</div>'
      + '<div id="inj_accordion_body" class="injury-body' + (injuryAccordionExpanded ? ' show' : '') + '">'
      + '<div class="injury-comment">' + comments + '</div>'
      + '<div class="injury-footer">Report Date: ' + (inj.date ? inj.date.split('T')[0] : refreshDate) + ' · Source: ESPN NFL Injury Report</div>'
      + '</div>'
      + '</div>';
  }

  let depthChartExpanded = false;

  function toggleDepthChart() {
    depthChartExpanded = !depthChartExpanded;
    const body = $('dc_accordion_body');
    const arrow = $('dc_accordion_arrow');
    if (body) body.classList.toggle('show', depthChartExpanded);
    if (arrow) arrow.textContent = depthChartExpanded ? '▲' : '▼';
  }
  global.toggleDepthChart = toggleDepthChart;

  function renderDepthChart(p, taken) {
    if (!p.team || p.team === 'FA') {
      return '<div class="dc-accordion">'
        + '<div class="dc-header" onclick="toggleDepthChart()">'
        + '<h4>📊 Depth Chart (Free Agent)</h4>'
        + '<span id="dc_accordion_arrow" class="dc-arrow">' + (depthChartExpanded ? '▲' : '▼') + '</span>'
        + '</div>'
        + '<div id="dc_accordion_body" class="dc-body' + (depthChartExpanded ? ' show' : '') + '">'
        + '<div class="meta" style="font-size:12px">No NFL depth chart available for Free Agents.</div>'
        + '</div></div>';
    }

    const teamDc = (window.DRAFT_DATA && window.DRAFT_DATA.depthCharts) ? window.DRAFT_DATA.depthCharts[p.team] : null;
    if (!teamDc) {
      return '<div class="dc-accordion">'
        + '<div class="dc-header" onclick="toggleDepthChart()">'
        + '<h4>📊 Depth Chart (' + p.team + ' Offense)</h4>'
        + '<span id="dc_accordion_arrow" class="dc-arrow">' + (depthChartExpanded ? '▲' : '▼') + '</span>'
        + '</div>'
        + '<div id="dc_accordion_body" class="dc-body' + (depthChartExpanded ? ' show' : '') + '">'
        + '<div class="meta" style="font-size:12px">Depth chart data not available for ' + p.team + '.</div>'
        + '</div></div>';
    }

    const normName = (name) => String(name || '').toLowerCase().replace(/[.'’,-]/g, '').replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '').replace(/\s+/g, ' ').trim();

    const renderAthletePill = (ath) => {
      const pid = ath.playerId;
      const isCurrent = (pid != null && pid === p.id) || (normName(ath.name) === normName(p.name));
      const isTaken = (pid != null && taken.has(pid));
      const clickable = (pid != null);

      let classes = 'dc-player';
      if (clickable) classes += ' clickable';
      if (isCurrent) classes += ' active-player';
      if (isTaken) classes += ' taken';
      else if (pid != null) classes += ' available';

      let tag = '';
      if (isCurrent) {
        tag = '<span class="dc-tag active">ACTIVE</span>';
      } else if (isTaken) {
        tag = '<span class="dc-tag taken">TAKEN</span>';
      } else if (pid != null) {
        tag = '<span class="dc-tag ava">AVAIL</span>';
      }

      const inj = ath.injury || (pid != null && byId(pid) ? byId(pid).injury : null);
      let injTag = '';
      if (inj && inj.code) {
        const c = inj.code;
        const tip = (inj.status || 'Injured')
          + (inj.type ? ': ' + inj.type : '')
          + (inj.detail ? ' (' + inj.detail + ')' : '')
          + (inj.returnDate ? ' - Est. Return: ' + inj.returnDate : '');
        injTag = '<span class="dc-inj inj-' + c.toLowerCase() + '" title="' + tip.replace(/"/g, '&quot;') + '">' + c + '</span>';
      }

      const clickAttr = clickable ? ' onclick="showPlayer(' + pid + ')" title="Click to view ' + ath.name.replace(/"/g, '&quot;') + '"' : '';
      return '<div class="' + classes + '"' + clickAttr + '>'
        + '<span class="dc-rank">' + ath.rank + '</span>'
        + '<span class="dc-name">' + ath.name + '</span>'
        + injTag
        + tag
        + '</div>';
    };

    const renderRow = (label, badgeClass, athletes) => {
      if (!athletes || !athletes.length) return '';
      return '<div class="dc-pos-row">'
        + '<span class="dc-pos-badge ' + badgeClass + '">' + label + '</span>'
        + '<div class="dc-athletes-list">' + athletes.map(renderAthletePill).join('') + '</div>'
        + '</div>';
    };

    let rowsHtml = '';
    rowsHtml += renderRow('QB', 'qb', teamDc.qb);
    rowsHtml += renderRow('RB', 'rb', teamDc.rb);
    if (teamDc.wr) {
      if (teamDc.wr.wr1 && teamDc.wr.wr1.length) rowsHtml += renderRow('WR1', 'wr', teamDc.wr.wr1);
      if (teamDc.wr.wr2 && teamDc.wr.wr2.length) rowsHtml += renderRow('WR2', 'wr', teamDc.wr.wr2);
      if (teamDc.wr.wr3 && teamDc.wr.wr3.length) rowsHtml += renderRow('WR3', 'wr', teamDc.wr.wr3);
    }
    rowsHtml += renderRow('TE', 'te', teamDc.te);
    rowsHtml += renderRow('K', 'k', teamDc.pk);

    return '<div class="dc-accordion">'
      + '<div class="dc-header" onclick="toggleDepthChart()">'
      + '<h4>📊 Depth Chart (' + p.team + ' Offense)</h4>'
      + '<span id="dc_accordion_arrow" class="dc-arrow">' + (depthChartExpanded ? '▲' : '▼') + '</span>'
      + '</div>'
      + '<div id="dc_accordion_body" class="dc-body' + (depthChartExpanded ? ' show' : '') + '">'
      + rowsHtml
      + '</div></div>';
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
      const keeperObj = Array.isArray(global.state.keepers) ? global.state.keepers.find(k => k && k.playerId === id) : null;
      if (keeperObj) {
        const isMine = keeperObj.slot === s.slot;
        const kTeamName = getTeamName(keeperObj.slot);
        status = '<span class="picktag keeper-tag' + (isMine ? ' mine' : '') + '">🔒 Keeper · ' + kTeamName + ' (Round ' + keeperObj.round + ')</span>';
      } else if (pickEntry) {
        const tInfo = teamForOverall(pickEntry.overall, s.teams, s.mode, s.teamNames, s.slot, global.state.tradedPicks);
        const isMine = taken.get(id) === 'me' || tInfo.isMe;
        const isKp = pickEntry.isKeeper;
        status = isMine
          ? '<span class="picktag' + (isKp ? ' keeper-tag' : '') + ' mine">' + (isKp ? '🔒 ' : '✅ ') + 'On your team ' + (isKp ? '(Keeper - ' : '(') + 'Pick #' + pickEntry.overall + ', ' + fmtPick(pickEntry.overall, s.teams) + ')</span>'
          : '<span class="picktag' + (isKp ? ' keeper-tag' : '') + '">' + (isKp ? '🔒 Keeper · ' : '') + 'Drafted by ' + tInfo.name + ' (Pick #' + pickEntry.overall + ', ' + fmtPick(pickEntry.overall, s.teams) + ')</span>';
      } else {
        status = '<span class="picktag">Taken</span>';
      }
    }

    const rawStats = (typeof formatPlayerStats === 'function')
      ? formatPlayerStats(p, s, activeScore)
      : [];

    const stats = rawStats
      .map(x => '<span class="stat">' + x[0] + '<b>' + x[1] + '</b></span>').join('');

    const snapDate = window.DRAFT_DATA.extrasGenerated || window.DRAFT_DATA.generated || '';
    const blurb = p.blurb
      ? '<div class="blurb">' + p.blurb + '</div><div class="blurbnote">News snapshot from ' + snapDate + ' — use the links below for anything newer.</div>'
      : '<div class="blurbnote">No baked-in news for this player — use the live links below.</div>';
    const depthChartHtml = renderDepthChart(p, taken);
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

    let headerInjBadge = '';
    if (p.injury && p.injury.code) {
      const c = p.injury.code.toLowerCase();
      headerInjBadge = ' <span class="injtag-lg inj-' + c + '">' + p.injury.code + (p.injury.type ? ' · ' + p.injury.type : '') + '</span>';
    }
    const injuryHtml = renderInjurySection(p);

    const pBox = $('playerModalbox') || $('modalbox');
    const pOverlay = $('playerOverlay') || $('overlay');

    if (pBox) {
      pBox.className = 'modal player-modal';
      pBox.innerHTML =
        '<h3><span class="pos ' + posClass + '">' + p.pos + '</span>' + p.name
        + (p.rookie ? '<span class="rookietag">R</span>' : '')
        + ' <span class="meta">' + (p.team || '') + '</span>'
        + headerInjBadge
        + status
        + watchModalBtn
        + '<button class="close" onclick="closePlayerModal()">×</button></h3>'
        + '<div class="statrow">' + stats + '</div>'
        + byeAlert + injuryHtml + blurb + depthChartHtml + schedHtml + links;
    }

    if (pOverlay) pOverlay.classList.add('show');
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

    const pBox = $('playerModalbox') || $('modalbox');
    const pOverlay = $('playerOverlay') || $('overlay');

    if (pBox) {
      pBox.className = 'modal player-modal';
      pBox.innerHTML =
        '<h3><span class="pos ' + posClass + '">' + p.pos + '</span>' + p.name
        + ' <span class="meta">(Custom / Unlisted Pick)</span>'
        + '<button class="close" onclick="closePlayerModal()">×</button></h3>'
        + '<div class="statrow">'
        + '<span class="stat">Drafted By<b>' + tInfo.name + (isMine ? ' (You)' : '') + '</b></span>'
        + '<span class="stat">Pick<b>#' + entry.overall + ' (' + fmtPick(entry.overall, global.state.settings.teams) + ')</b></span>'
        + ((p.team && p.team !== '—') ? '<span class="stat">NFL Team<b>' + p.team + '</b></span>' : '')
        + (p.bye ? '<span class="stat">Bye Week<b>Week ' + p.bye + '</b></span>' : '')
        + '</div>'
        + '<div class="blurbnote">This selection was recorded as an unlisted pick and is tracked on this team\'s roster and positional counts.</div>'
        + links;
    }

    if (pOverlay) pOverlay.classList.add('show');
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

    const keeperCount = (global.state.keepers || []).length;
    const maxKeepersVal = (s.maxKeepers !== undefined && s.maxKeepers !== null) ? s.maxKeepers : 2;

    $('modalbox').innerHTML =
      '<h3>⚙️ League Setup & Draft Positions'
      + '<button class="close" onclick="closeModal()">×</button></h3>'
      + '<div class="setup-grid">'
      + '<div class="setup-field" style="grid-column: 1 / -1;"><label>League / Board Name</label><input type="text" id="setup_league_name" value="' + (s.leagueName || "Ken's Draft Board").replace(/"/g, '&quot;') + '"></div>'
      + '<div class="setup-field"><label>Total Teams</label><input type="number" id="setup_team_count" min="2" max="32" value="' + s.teams + '"></div>'
      + '<div class="setup-field"><label>Total Draft Rounds</label><input type="number" id="setup_rounds_count" min="1" max="50" value="' + s.rounds + '"></div>'
      + '<div class="setup-field"><label>Draft Order</label><select id="setup_mode_select"><option value="3rr"' + (s.mode === '3rr' ? ' selected' : '') + '>3rd-Round Reversal (3RR)</option><option value="snake"' + (s.mode === 'snake' ? ' selected' : '') + '>Normal Snake</option></select></div>'
      + '<div class="setup-field"><label>League Type</label><select id="setup_leaguetype_select"><option value="dynasty"' + (s.leagueType === 'dynasty' ? ' selected' : '') + '>Dynasty</option><option value="redraft"' + (s.leagueType === 'redraft' ? ' selected' : '') + '>Redraft</option></select></div>'
      + '<div class="setup-field"><label>Scoring Format</label><select id="setup_scoring_select"><option value="half"' + (s.scoring === 'half' ? ' selected' : '') + '>Half-PPR (0.5)</option><option value="ppr"' + (s.scoring === 'ppr' ? ' selected' : '') + '>Full PPR (1.0)</option><option value="std"' + (s.scoring === 'std' ? ' selected' : '') + '>Standard (0 PPR)</option></select></div>'
      + '<div class="setup-field"><label>QB Format</label><select id="setup_qb_select"><option value="sf"' + (s.qbFormat === 'sf' ? ' selected' : '') + '>Superflex (2QB/SF)</option><option value="1qb"' + (s.qbFormat === '1qb' ? ' selected' : '') + '>1 QB (Single QB)</option></select></div>'
      + '<div class="setup-field"><label>Max Keepers per Team</label><input type="number" id="setup_max_keepers" min="0" max="10" value="' + maxKeepersVal + '"></div>'
      + '</div>'
      + '<div style="display:flex; justify-content:space-between; align-items:center; margin-top:14px; margin-bottom:6px; padding:10px 12px; background:var(--panel2); border:1px solid var(--border); border-radius:8px; flex-wrap:wrap; gap:10px">'
      + '<div>'
      + '<div style="font-weight:700; color:var(--text); font-size:13.5px">🔒 Keepers & Pre-Drafted Players</div>'
      + '<div class="meta" style="font-size:12px; margin-top:2px">Configure retained players assigned to each team and round. (Currently: <b style="color:var(--accent)">' + keeperCount + ' keeper' + (keeperCount === 1 ? '' : 's') + '</b> assigned)</div>'
      + '</div>'
      + '<button type="button" class="act primary" onclick="openKeepersModal()" style="font-weight:700; white-space:nowrap; padding:5px 14px">⭐ Manage Keepers (' + keeperCount + ')</button>'
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
      + '<div style="margin-top:10px; padding:10px; background:#141923; border:1px solid var(--border); border-radius:6px; font-size:12px; color:var(--dim)">'
      + '<div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px">'
      + '<div>📊 <b style="color:var(--text)">Rankings & Injury Status:</b> ' + (window.DRAFT_DATA.players ? window.DRAFT_DATA.players.length : 0) + ' players loaded (Data date: <b style="color:var(--accent)">' + (window.DRAFT_DATA.generated || 'live') + '</b>).</div>'
      + '<button type="button" class="act primary" id="refresh_data_btn" onclick="triggerDataRefresh(this)" style="font-size:12px; padding:4px 10px">🔄 Refresh Data Now</button>'
      + '</div>'
      + '<div id="refresh_data_status" style="margin-top:6px; font-size:11.5px; color:var(--dim)">Run latest consensus rankings, 32-team depth charts, and injury reports refresh on-demand.</div>'
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

    // Remap keepers to travel with the moved team
    if (Array.isArray(global.state.keepers) && global.state.keepers.length > 0) {
      if (typeof remapKeepersOnSlotSwap === 'function') {
        global.state.keepers = remapKeepersOnSlotSwap(global.state.keepers, slot, targetSlot);
      } else {
        for (const k of global.state.keepers) {
          if (k.slot === slot) k.slot = targetSlot;
          else if (k.slot === targetSlot) k.slot = slot;
        }
      }
      global.save();
    }

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
    const prevLeagueType = s.leagueType;
    s.leagueName = ($('setup_league_name').value || "Ken's Draft Board").trim();
    s.teams = Math.max(2, Math.min(32, parseInt($('setup_team_count').value, 10) || 12));
    s.mode = $('setup_mode_select').value;
    if ($('setup_leaguetype_select')) {
      s.leagueType = $('setup_leaguetype_select').value;
      if (s.leagueType !== prevLeagueType) {
        if (s.leagueType === 'redraft') {
          s.blend = 0;
        } else if (s.leagueType === 'dynasty' && s.blend === 0) {
          s.blend = 60;
        }
      }
    }
    s.scoring = $('setup_scoring_select').value;
    s.qbFormat = $('setup_qb_select').value;
    s.slot = setupMySlot;
    s.teamNames = setupDraftNames.slice(0, s.teams);
    while (s.teamNames.length < s.teams) s.teamNames.push('Team ' + (s.teamNames.length + 1));

    if ($('setup_max_keepers')) {
      s.maxKeepers = Math.max(0, Math.min(10, parseInt($('setup_max_keepers').value, 10) || 0));
    }

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

  async function triggerDataRefresh(btn) {
    const statusEl = $('refresh_data_status');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Refreshing...';
    }
    if (statusEl) {
      statusEl.style.color = 'var(--accent)';
      statusEl.textContent = '⏳ Fetching latest consensus rankings, 32-team depth charts, and NFL injury reports (~10-15s)...';
    }

    try {
      const res = await fetch('/api/data/refresh', { method: 'POST' });
      const cType = res.headers.get('content-type') || '';
      let data = {};
      if (cType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(text || ('Server returned status ' + res.status));
      }
      if (res.ok && data.ok) {
        if (statusEl) {
          statusEl.style.color = 'var(--good)';
          statusEl.textContent = '✅ ' + (data.message || 'Data updated successfully!') + ' Reloading app...';
        }
        if (btn) btn.textContent = '✅ Done!';
        setTimeout(() => {
          window.location.reload();
        }, 1200);
      } else {
        throw new Error(data.message || 'Server returned status ' + res.status);
      }
    } catch (err) {
      if (statusEl) {
        statusEl.style.color = 'var(--warn)';
        statusEl.textContent = '⚠️ Live server refresh failed (' + err.message + '). Alternatively run "python scripts/update_rankings.py" in terminal.';
      }
      if (btn) {
        btn.disabled = false;
        btn.textContent = '🔄 Retry Refresh';
      }
    }
  }
  global.triggerDataRefresh = triggerDataRefresh;

  // ---------- Keepers Management Modal ----------
  let editingKeeperId = null;
  let selectedKeeperPlayer = null;
  let keeperIsCustom = false;
  let keeperCustomPos = 'WR';

  function buildKeeperRoundOptions(slot, teams, rounds, mode, tradedPicks, keepers, editingId) {
    let options = '';
    const tCount = Math.max(2, Math.min(32, parseInt(teams, 10) || 12));
    const rCount = Math.max(1, Math.min(50, parseInt(rounds, 10) || 20));
    const allPicks = (typeof picksForSlot === 'function')
      ? picksForSlot(slot, tCount, rCount, mode || 'snake', tradedPicks || {})
      : [];

    for (let r = 1; r <= rCount; r++) {
      const owned = allPicks.filter(o => Math.ceil(o / tCount) === r).sort((a, b) => a - b);
      const assigned = (keepers || []).filter(k => k && k.slot === slot && k.round === r && k.id !== editingId).length;
      if (owned.length === 0) {
        options += '<option value="' + r + '" disabled>Round ' + r + ' (0 picks owned - traded away)</option>';
      } else if (owned.length === 1) {
        const fullTag = (assigned >= 1) ? ' [Full]' : '';
        options += '<option value="' + r + '"' + (assigned >= 1 ? ' disabled' : '') + '>Round ' + r + ' (Pick #' + owned[0] + ', ' + fmtPick(owned[0], tCount) + ')' + fullTag + '</option>';
      } else {
        const fullTag = (assigned >= owned.length) ? ' [Full]' : '';
        options += '<option value="' + r + '"' + (assigned >= owned.length ? ' disabled' : '') + '>Round ' + r + ' (' + owned.length + ' picks owned)' + fullTag + '</option>';
      }
    }
    return options;
  }

  function openKeepersModal() {
    if ($('setup_team_count')) {
      syncSetupInputsFromDom();
      const s = global.state.settings;
      s.teams = Math.max(2, Math.min(32, parseInt($('setup_team_count').value, 10) || 12));
      s.slot = setupMySlot;
      s.teamNames = setupDraftNames.slice(0, s.teams);
      if ($('setup_max_keepers')) {
        s.maxKeepers = Math.max(0, Math.min(10, parseInt($('setup_max_keepers').value, 10) || 0));
      }
      global.save();
    }
    editingKeeperId = null;
    selectedKeeperPlayer = null;
    keeperIsCustom = false;
    keeperCustomPos = 'WR';
    renderKeepersModalView();
  }

  function startEditKeeper(keeperId) {
    const k = (global.state.keepers || []).find(item => item && item.id === keeperId);
    if (!k) return;
    editingKeeperId = keeperId;
    if (k.playerId != null) {
      keeperIsCustom = false;
      selectedKeeperPlayer = byId(k.playerId) || { id: k.playerId, name: 'Player #' + k.playerId, pos: 'WR', team: '' };
    } else {
      keeperIsCustom = true;
      keeperCustomPos = k.customPos || 'WR';
      selectedKeeperPlayer = null;
    }
    renderKeepersModalView(k.slot);
  }

  function cancelEditKeeper() {
    editingKeeperId = null;
    selectedKeeperPlayer = null;
    keeperIsCustom = false;
    keeperCustomPos = 'WR';
    renderKeepersModalView();
  }

  function renderKeepersModalView(explicitSlot) {
    const s = global.state.settings;
    const keepers = global.state.keepers || [];
    const maxK = (s.maxKeepers !== undefined && s.maxKeepers !== null) ? s.maxKeepers : 2;

    const editingKeeper = editingKeeperId ? keepers.find(item => item && item.id === editingKeeperId) : null;
    if (editingKeeperId && !editingKeeper) {
      editingKeeperId = null;
    }

    let initialSlot = 1;
    if (explicitSlot) {
      initialSlot = explicitSlot;
    } else if (editingKeeper) {
      initialSlot = editingKeeper.slot;
    } else if ($('keeper_team_select')) {
      initialSlot = parseInt($('keeper_team_select').value, 10) || (s.slot || 1);
    } else {
      initialSlot = s.slot || 1;
    }

    let teamOptions = '';
    for (let i = 1; i <= s.teams; i++) {
      const tName = getTeamName(i);
      const tKeepers = keepers.filter(k => k && k.slot === i && k.id !== editingKeeperId).length;
      const isMe = (i === s.slot);
      const isSelected = (i === initialSlot);
      teamOptions += '<option value="' + i + '"' + (isSelected ? ' selected' : '') + '>'
        + (isMe ? '⭐ ' : '') + tName + ' (Slot ' + i + ' · ' + tKeepers + '/' + maxK + ' keepers)' + (isMe ? ' [You]' : '')
        + '</option>';
    }

    const roundOptions = buildKeeperRoundOptions(initialSlot, s.teams, s.rounds, s.mode, global.state.tradedPicks, keepers, editingKeeperId);

    const keeperPicksMap = (typeof getKeeperPicksMap === 'function')
      ? getKeeperPicksMap(keepers, s.teams, s.rounds, s.mode, global.state.tradedPicks)
      : {};

    const pickForKeeperId = {};
    for (const [overall, kObj] of Object.entries(keeperPicksMap)) {
      if (kObj && kObj.id) {
        pickForKeeperId[kObj.id] = parseInt(overall, 10);
      }
    }

    let rowsHtml = '';
    if (keepers.length === 0) {
      rowsHtml = '<tr><td colspan="6" style="text-align:center; padding:16px; color:var(--dim); font-style:italic">No keepers configured yet. Use the form above to add keeper players.</td></tr>';
    } else {
      const sorted = keepers.slice().sort((a, b) => (a.slot - b.slot) || (a.round - b.round));
      for (const k of sorted) {
        const p = (k.playerId != null) ? (byId(k.playerId) || {}) : {};
        const name = k.customName || p.name || ('Player #' + k.playerId);
        const pos = k.customPos || p.pos || '—';
        const team = k.customTeam || p.team || '—';
        const posClass = ['QB', 'RB', 'WR', 'TE'].includes(pos) ? pos : (['DST', 'DEF', 'D/ST'].includes(pos) ? 'DST' : (pos === 'K' ? 'K' : 'other'));
        const isMe = (k.slot === s.slot);
        const isEditing = (k.id === editingKeeperId);
        const overall = pickForKeeperId[k.id];
        const pickStr = overall ? ('#' + overall + ' (' + fmtPick(overall, s.teams) + ')') : ('Rd ' + k.round);

        rowsHtml += '<tr class="' + (isMe ? 'is-me ' : '') + (isEditing ? 'is-editing' : '') + '">'
          + '<td><b style="color:' + (isMe ? 'var(--good)' : 'var(--text)') + '">' + getTeamName(k.slot) + '</b> <span class="meta">(Slot ' + k.slot + ')</span></td>'
          + '<td><b>Round ' + k.round + '</b></td>'
          + '<td><span class="meta">' + pickStr + '</span></td>'
          + '<td><span class="pos ' + posClass + '" style="margin-right:4px">' + pos + '</span> <b>' + name + '</b>' + (k.customName ? ' <span class="meta">(custom)</span>' : '') + '</td>'
          + '<td><span class="meta">' + team + '</span></td>'
          + '<td style="text-align:right"><div style="display:inline-flex; gap:6px; justify-content:flex-end">'
          + '<button type="button" class="small" style="color:var(--accent); font-weight:600; cursor:pointer" onclick="startEditKeeper(\'' + k.id + '\')">✏️ Edit</button>'
          + '<button type="button" class="small" style="color:var(--bad); font-weight:600; cursor:pointer" onclick="handleRemoveKeeper(\'' + k.id + '\')">🗑️ Remove</button>'
          + '</div></td>'
          + '</tr>';
      }
    }

    const customPosButtons = ['QB', 'RB', 'WR', 'TE', 'K', 'DST', 'OTHER'].map(pos =>
      '<button type="button" class="tab' + (pos === keeperCustomPos ? ' on' : '') + '" onclick="selectKeeperCustomPos(\'' + pos + '\')">' + pos + '</button>'
    ).join('');

    let selectedPillHtml = '';
    if (selectedKeeperPlayer) {
      const p = selectedKeeperPlayer;
      const posClass = ['QB', 'RB', 'WR', 'TE'].includes(p.pos) ? p.pos : (['DST', 'DEF', 'D/ST'].includes(p.pos) ? 'DST' : (p.pos === 'K' ? 'K' : 'other'));
      selectedPillHtml = '<div style="display:inline-flex; align-items:center; gap:6px; background:var(--panel2); border:1px solid var(--good); padding:4px 8px; border-radius:6px; font-size:12px; margin-top:6px">'
        + '<span class="pos ' + posClass + '">' + p.pos + '</span>'
        + '<b>' + p.name + '</b>'
        + '<span class="meta">' + (p.team || '') + '</span>'
        + '<button type="button" class="close" style="font-size:16px; margin-left:4px" onclick="clearKeeperSearch()">×</button>'
        + '</div>';
    }

    const modalBox = $('modalbox');
    if (modalBox) {
      modalBox.className = 'modal modal-wide keepers-modal-box';
    }

    let formHeaderHtml = '<h4 style="margin:0 0 10px 0; color:var(--accent); font-size:13px; text-transform:none">➕ Add New Keeper</h4>';
    let formActionBtnHtml = '<button type="button" class="act primary" onclick="submitKeeperForm()" style="font-weight:700">Add Keeper</button>';
    if (editingKeeper) {
      const editingName = editingKeeper.customName || (byId(editingKeeper.playerId) ? byId(editingKeeper.playerId).name : ('Player #' + editingKeeper.playerId));
      formHeaderHtml = '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px">'
        + '<h4 style="margin:0; color:var(--accent); font-size:13px; text-transform:none">✏️ Edit Keeper: <span style="color:var(--text)">' + editingName + '</span> (' + getTeamName(editingKeeper.slot) + ')</h4>'
        + '<button type="button" class="small" style="color:var(--dim); font-size:11.5px; cursor:pointer" onclick="cancelEditKeeper()">Cancel Edit</button>'
        + '</div>';
      formActionBtnHtml = '<div style="display:inline-flex; gap:8px">'
        + '<button type="button" class="act" onclick="cancelEditKeeper()">Cancel</button>'
        + '<button type="button" class="act primary" onclick="submitKeeperForm()" style="font-weight:700">💾 Update Keeper</button>'
        + '</div>';
    }

    const customNameVal = (editingKeeper && editingKeeper.customName) ? editingKeeper.customName : '';
    const customTeamVal = (editingKeeper && editingKeeper.customTeam) ? editingKeeper.customTeam : '';
    const customByeVal = (editingKeeper && editingKeeper.customBye != null) ? editingKeeper.customBye : '';
    const searchVal = (!keeperIsCustom && selectedKeeperPlayer) ? selectedKeeperPlayer.name : '';

    $('modalbox').innerHTML =
      '<h3>🔒 Keepers Management'
      + '<button class="close" onclick="saveAndCloseKeepersModal()">×</button></h3>'
      + '<div style="display:flex; justify-content:space-between; align-items:center; margin:10px 0; padding:8px 12px; background:var(--panel2); border:1px solid var(--border); border-radius:8px; flex-wrap:wrap; gap:10px">'
      + '<div><b style="color:var(--text)">Total Keepers Configured:</b> <span style="color:var(--accent); font-weight:700">' + keepers.length + '</span></div>'
      + '<div style="display:flex; align-items:center; gap:6px"><label style="font-size:12.5px; color:var(--dim)">Max Keepers per Team:</label> <input type="number" id="keeper_modal_max" min="0" max="10" style="width:54px; background:var(--bg); color:var(--text); border:1px solid var(--border); border-radius:4px; padding:2px 6px" value="' + maxK + '" onchange="handleKeeperMaxChange(this.value)"></div>'
      + '</div>'
      + '<div style="background:#141923; border:1px solid var(--border); border-radius:8px; padding:12px; margin-top:12px">'
      + formHeaderHtml
      + '<div class="setup-grid" style="grid-template-columns: 1fr 1fr; gap:10px">'
      + '<div class="setup-field"><label>Team</label><select id="keeper_team_select" onchange="handleKeeperTeamChange()">' + teamOptions + '</select></div>'
      + '<div class="setup-field"><label>Draft Round Cost</label><select id="keeper_round_select">' + roundOptions + '</select></div>'
      + '</div>'
      + '<div style="margin-top:10px">'
      + '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px">'
      + '<label style="font-size:12px; color:var(--dim)">Player Selection <b style="color:var(--warn)">*</b></label>'
      + '<label style="font-size:12px; color:var(--dim); cursor:pointer"><input type="checkbox" id="keeper_custom_check" onchange="toggleKeeperCustom(this.checked)"' + (keeperIsCustom ? ' checked' : '') + '> Unlisted / Custom Player</label>'
      + '</div>'
      + '<div id="keeper_pool_search_wrap" style="' + (keeperIsCustom ? 'display:none;' : 'display:block;') + '" class="keeper-search-container">'
      + '<input type="text" id="keeper_search_input" placeholder="Search NFL player by name, team, position..." autocomplete="off" value="' + searchVal.replace(/"/g, '&quot;') + '" oninput="handleKeeperSearchInput(this.value)">'
      + '<div id="keeper_autocomplete" class="keeper-autocomplete-list" style="display:none"></div>'
      + '<div id="keeper_selected_pill">' + selectedPillHtml + '</div>'
      + '</div>'
      + '<div id="keeper_custom_wrap" style="' + (keeperIsCustom ? 'display:block;' : 'display:none;') + '">'
      + '<div class="tabs" style="flex-wrap:wrap; gap:4px; margin-bottom:8px" id="keeper_custom_pos_tabs">' + customPosButtons + '</div>'
      + '<div class="setup-grid" style="grid-template-columns: 2fr 1fr 1fr; gap:8px">'
      + '<div class="setup-field"><label>Player Name</label><input type="text" id="keeper_custom_name" placeholder="e.g. Travis Hunter" value="' + customNameVal.replace(/"/g, '&quot;') + '"></div>'
      + '<div class="setup-field"><label>NFL Team</label><input type="text" id="keeper_custom_team" placeholder="e.g. JAX" maxlength="4" value="' + customTeamVal.replace(/"/g, '&quot;') + '"></div>'
      + '<div class="setup-field"><label>Bye Week</label><input type="number" id="keeper_custom_bye" min="1" max="18" placeholder="e.g. 9" value="' + customByeVal + '"></div>'
      + '</div>'
      + '</div>'
      + '</div>'
      + '<div id="keeper_error_box" style="display:none; margin-top:10px; color:var(--bad); font-size:12px; background:rgba(255,100,112,0.12); padding:6px 10px; border-radius:6px; border:1px solid rgba(255,100,112,0.4)"></div>'
      + '<div style="margin-top:12px; display:flex; justify-content:flex-end">'
      + formActionBtnHtml
      + '</div>'
      + '</div>'
      + '<h4 style="margin:16px 0 6px 0">📋 Current Keepers (' + keepers.length + ')</h4>'
      + '<div style="max-height:220px; overflow-y:auto; border:1px solid var(--border); border-radius:6px">'
      + '<table class="keeper-table"><thead><tr><th>Team</th><th>Round</th><th>Pick</th><th>Player</th><th>Team</th><th style="text-align:right">Action</th></tr></thead>'
      + '<tbody id="keepers_table_body">' + rowsHtml + '</tbody></table>'
      + '</div>'
      + '<div class="modal-actions">'
      + '<button type="button" class="act" onclick="saveKeepersAndBackToSetup()">⬅️ Back to League Setup</button>'
      + '<button type="button" class="act primary" onclick="saveAndCloseKeepersModal()">Save & Close</button>'
      + '</div>';

    if (editingKeeper && editingKeeper.round && $('keeper_round_select')) {
      $('keeper_round_select').value = editingKeeper.round;
    }

    $('overlay').classList.add('show');
  }

  function handleKeeperTeamChange() {
    const slot = parseInt($('keeper_team_select').value, 10) || 1;
    const s = global.state.settings;
    const keepers = global.state.keepers || [];
    $('keeper_round_select').innerHTML = buildKeeperRoundOptions(slot, s.teams, s.rounds, s.mode, global.state.tradedPicks, keepers, editingKeeperId);
  }

  function toggleKeeperCustom(checked) {
    keeperIsCustom = Boolean(checked);
    if ($('keeper_pool_search_wrap')) $('keeper_pool_search_wrap').style.display = keeperIsCustom ? 'none' : 'block';
    if ($('keeper_custom_wrap')) $('keeper_custom_wrap').style.display = keeperIsCustom ? 'block' : 'none';
  }

  function selectKeeperCustomPos(pos) {
    keeperCustomPos = pos;
    const buttons = ['QB', 'RB', 'WR', 'TE', 'K', 'DST', 'OTHER'].map(p =>
      '<button type="button" class="tab' + (p === keeperCustomPos ? ' on' : '') + '" onclick="selectKeeperCustomPos(\'' + p + '\')">' + p + '</button>'
    ).join('');
    if ($('keeper_custom_pos_tabs')) $('keeper_custom_pos_tabs').innerHTML = buttons;
  }

  function handleKeeperSearchInput(val) {
    const q = normalizeName(val || '');
    const box = $('keeper_autocomplete');
    if (!box) return;
    if (!q || q.length < 1) {
      box.style.display = 'none';
      box.innerHTML = '';
      return;
    }

    const takenIds = new Set((global.state.keepers || []).filter(k => k && k.id !== editingKeeperId).map(k => k.playerId).filter(id => id != null));
    const players = (global.PLAYERS || []).filter(p => {
      if (takenIds.has(p.id)) return false;
      if (normalizeName(p.name).includes(q)) return true;
      if (p.team && normalizeName(p.team) === q) return true;
      return false;
    });

    if (players.length === 0) {
      box.innerHTML = '<div style="padding:8px 10px; font-size:12px; color:var(--dim); font-style:italic">No matching players in pool</div>';
      box.style.display = 'block';
      return;
    }

    let itemsHtml = '';
    players.slice(0, 6).forEach(p => {
      const posClass = ['QB', 'RB', 'WR', 'TE'].includes(p.pos) ? p.pos : (['DST', 'DEF', 'D/ST'].includes(p.pos) ? 'DST' : (p.pos === 'K' ? 'K' : 'other'));
      itemsHtml += '<div class="keeper-autocomplete-item" onclick="selectKeeperSearchPlayer(' + p.id + ')">'
        + '<span class="pos ' + posClass + '">' + p.pos + '</span>'
        + '<b>' + p.name + '</b>'
        + '<span class="meta">' + (p.team || '') + '</span>'
        + (p.bye ? '<span class="meta">· Wk ' + p.bye + '</span>' : '')
        + '</div>';
    });

    box.innerHTML = itemsHtml;
    box.style.display = 'block';
  }

  function selectKeeperSearchPlayer(playerId) {
    const p = byId(playerId);
    if (!p) return;
    selectedKeeperPlayer = p;
    if ($('keeper_search_input')) $('keeper_search_input').value = p.name;
    if ($('keeper_autocomplete')) $('keeper_autocomplete').style.display = 'none';
    const posClass = ['QB', 'RB', 'WR', 'TE'].includes(p.pos) ? p.pos : (['DST', 'DEF', 'D/ST'].includes(p.pos) ? 'DST' : (p.pos === 'K' ? 'K' : 'other'));
    if ($('keeper_selected_pill')) {
      $('keeper_selected_pill').innerHTML = '<div style="display:inline-flex; align-items:center; gap:6px; background:var(--panel2); border:1px solid var(--good); padding:4px 8px; border-radius:6px; font-size:12px; margin-top:6px">'
        + '<span class="pos ' + posClass + '">' + p.pos + '</span>'
        + '<b>' + p.name + '</b>'
        + '<span class="meta">' + (p.team || '') + '</span>'
        + '<button type="button" class="close" style="font-size:16px; margin-left:4px" onclick="clearKeeperSearch()">×</button>'
        + '</div>';
      $('keeper_selected_pill').style.display = 'block';
    }
  }

  function clearKeeperSearch() {
    selectedKeeperPlayer = null;
    if ($('keeper_search_input')) $('keeper_search_input').value = '';
    if ($('keeper_selected_pill')) {
      $('keeper_selected_pill').innerHTML = '';
      $('keeper_selected_pill').style.display = 'none';
    }
  }

  function submitKeeperForm() {
    const slot = parseInt($('keeper_team_select').value, 10);
    const round = parseInt($('keeper_round_select').value, 10);
    const errBox = $('keeper_error_box');
    if (errBox) errBox.style.display = 'none';

    let candidate = null;
    if (keeperIsCustom) {
      const name = ($('keeper_custom_name').value || '').trim();
      if (!name) {
        if (errBox) {
          errBox.textContent = 'Please enter a name for the custom keeper player';
          errBox.style.display = 'block';
        }
        return;
      }
      const team = ($('keeper_custom_team').value || '').trim().toUpperCase();
      const bye = ($('keeper_custom_bye').value) ? parseInt($('keeper_custom_bye').value, 10) : null;
      candidate = {
        id: editingKeeperId || undefined,
        slot: slot,
        round: round,
        playerId: null,
        customName: name,
        customPos: keeperCustomPos,
        customTeam: team || null,
        customBye: bye
      };
    } else {
      if (!selectedKeeperPlayer) {
        if (errBox) {
          errBox.textContent = 'Please search and select a player from the pool, or check Unlisted / Custom Player';
          errBox.style.display = 'block';
        }
        return;
      }
      candidate = {
        id: editingKeeperId || undefined,
        slot: slot,
        round: round,
        playerId: selectedKeeperPlayer.id
      };
    }

    const res = global.addKeeper(candidate);
    if (!res.ok) {
      if (errBox) {
        errBox.textContent = res.error || 'Failed to add keeper';
        errBox.style.display = 'block';
      }
      return;
    }

    editingKeeperId = null;
    selectedKeeperPlayer = null;
    keeperIsCustom = false;
    renderKeepersModalView();
  }

  function handleRemoveKeeper(id) {
    if (editingKeeperId === id) {
      editingKeeperId = null;
      selectedKeeperPlayer = null;
      keeperIsCustom = false;
    }
    global.removeKeeper(id);
    renderKeepersModalView();
  }

  function handleKeeperMaxChange(val) {
    global.updateMaxKeepers(val);
    renderKeepersModalView();
  }

  function saveKeepersAndBackToSetup() {
    editingKeeperId = null;
    selectedKeeperPlayer = null;
    keeperIsCustom = false;
    if ($('keeper_modal_max')) {
      global.updateMaxKeepers($('keeper_modal_max').value);
    }
    global.save();
    openLeagueSetup();
  }

  function saveAndCloseKeepersModal() {
    editingKeeperId = null;
    selectedKeeperPlayer = null;
    keeperIsCustom = false;
    if ($('keeper_modal_max')) {
      global.updateMaxKeepers($('keeper_modal_max').value);
    }
    global.save();
    closeModal();
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
  global.closePlayerModal = closePlayerModal;
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
  global.getRosterPicksForSlot = getRosterPicksForSlot;
  global.openKeepersModal = openKeepersModal;
  global.renderKeepersModalView = renderKeepersModalView;
  global.startEditKeeper = startEditKeeper;
  global.cancelEditKeeper = cancelEditKeeper;
  global.handleKeeperTeamChange = handleKeeperTeamChange;
  global.toggleKeeperCustom = toggleKeeperCustom;
  global.selectKeeperCustomPos = selectKeeperCustomPos;
  global.handleKeeperSearchInput = handleKeeperSearchInput;
  global.selectKeeperSearchPlayer = selectKeeperSearchPlayer;
  global.clearKeeperSearch = clearKeeperSearch;
  global.submitKeeperForm = submitKeeperForm;
  global.handleRemoveKeeper = handleRemoveKeeper;
  global.handleKeeperMaxChange = handleKeeperMaxChange;
  global.openDraftBoardModal = openDraftBoardModal;
  global.renderDraftBoardModalView = renderDraftBoardModalView;
  global.closeBoardModal = closeBoardModal;
  global.setBoardActiveTab = setBoardActiveTab;
  global.setBoardFilter = setBoardFilter;
  global.toggleBoardDensity = toggleBoardDensity;
  global.setSummarySort = setSummarySort;
  global.toggleTeamRosterDrawer = toggleTeamRosterDrawer;
  global.scrollBoardToCurrentPick = scrollBoardToCurrentPick;
  global.showPlayerFromBoard = showPlayerFromBoard;
  global.showUnlistedPlayerFromBoard = showUnlistedPlayerFromBoard;
  global.handleClosePlayerModal = handleClosePlayerModal;
})(typeof window !== 'undefined' ? window : globalThis);

