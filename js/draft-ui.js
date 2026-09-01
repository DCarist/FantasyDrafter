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
    if (isBoardModalOpen && $('modalbox') && $('modalbox').classList.contains('modal-board')) {
      renderDraftBoardModalView();
    }
  }

  // ---------- Modals ----------
  let isBoardModalOpen = false;
  let returnToBoardOnClose = false;
  let boardHighlightFilter = 'ALL';
  let boardDensity = 'normal';

  function closeModal() {
    isBoardModalOpen = false;
    returnToBoardOnClose = false;
    const overlay = $('overlay');
    if (overlay) overlay.classList.remove('show');
    if ($('modalbox')) $('modalbox').className = 'modal';
  }

  function handleClosePlayerModal() {
    if (returnToBoardOnClose) {
      returnToBoardOnClose = false;
      openDraftBoardModal();
    } else {
      closeModal();
    }
  }

  function openDraftBoardModal() {
    isBoardModalOpen = true;
    returnToBoardOnClose = false;
    renderDraftBoardModalView();
    setTimeout(() => {
      scrollBoardToCurrentPick(false);
    }, 60);
  }

  function closeBoardModal() {
    isBoardModalOpen = false;
    returnToBoardOnClose = false;
    closeModal();
  }

  function setBoardFilter(filter) {
    boardHighlightFilter = filter;
    renderDraftBoardModalView();
  }

  function toggleBoardDensity() {
    boardDensity = (boardDensity === 'normal' ? 'compact' : 'normal');
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

    const modalBox = $('modalbox');
    if (modalBox) {
      modalBox.className = 'modal modal-board';
    }

    // Filter Buttons
    const filters = [
      { id: 'ALL', label: 'ALL' },
      { id: 'QB', label: 'QB', cls: 'filter-qb' },
      { id: 'RB', label: 'RB', cls: 'filter-rb' },
      { id: 'WR', label: 'WR', cls: 'filter-wr' },
      { id: 'TE', label: 'TE', cls: 'filter-te' },
      { id: 'K', label: 'K', cls: 'filter-k' },
      { id: 'DST', label: 'D/ST', cls: 'filter-dst' },
      { id: 'MY_TEAM', label: '⭐ My Team', cls: 'filter-mine' }
    ];

    const filterButtonsHtml = filters.map(f => {
      const active = (boardHighlightFilter === f.id);
      return '<button type="button" class="board-filter-btn' + (active ? ' active ' + (f.cls || '') : '') + '" onclick="setBoardFilter(\'' + f.id + '\')">' + f.label + '</button>';
    }).join('');

    const densityBtnLabel = boardDensity === 'normal' ? '🔍 Compact' : '🔎 Normal';
    const densityClass = boardDensity === 'compact' ? ' board-compact' : '';

    const draftedPicksCount = global.state.log.length;
    const pct = Math.round((draftedPicksCount / totalPicks) * 100) || 0;

    let clockStatusHtml = '';
    if (isComplete) {
      clockStatusHtml = '<span style="color:var(--good); font-weight:700">🏆 Draft Complete</span>';
    } else {
      clockStatusHtml = '<span>On Clock: <b style="color:' + (onClockTeam.isMe ? 'var(--good)' : 'var(--accent)') + '">' + onClockTeam.name + (onClockTeam.isMe ? ' (You)' : '') + '</b> · Pick <b>#' + pick + ' (' + fmtPick(pick, s.teams) + ')</b></span>';
    }

    // Table Header Generation
    let tableHeadHtml = '<thead><tr class="board-header-row"><th class="board-corner-th">Rnd</th>';
    for (let sIdx = 1; sIdx <= s.teams; sIdx++) {
      const isMe = (sIdx === s.slot);
      const isClock = (onClockTeam && sIdx === onClockTeam.slot);
      const tName = getTeamName(sIdx);
      tableHeadHtml += '<th class="board-th' + (isMe ? ' is-me' : '') + (isClock ? ' is-clock' : '') + '">'
        + '<div class="board-th-team" title="' + tName.replace(/"/g, '&quot;') + '">' + (isMe ? '⭐ ' : '') + tName + '</div>'
        + '<div class="board-th-slot">'
        + '<span>Slot ' + sIdx + '</span>'
        + (isMe ? ' <span style="color:var(--good); font-weight:700">(You)</span>' : '')
        + '</div>'
        + '</th>';
    }
    tableHeadHtml += '</tr></thead>';

    // Table Body Rows
    let tableBodyHtml = '<tbody>';
    for (const roundRow of boardData.grid) {
      const arrow = roundRow.isForward ? '➡️' : '⬅️';
      tableBodyHtml += '<tr>';
      tableBodyHtml += '<th class="board-round-th"><div class="board-round-num">R' + roundRow.round + '</div><div class="board-round-arrow" title="' + (roundRow.isForward ? 'Picks go left-to-right' : 'Picks go right-to-left') + '">' + arrow + '</div></th>';

      for (const pickCell of roundRow.picks) {
        const overall = pickCell.overall;
        const isClock = pickCell.isOnClock;
        const isMe = pickCell.isMe;

        // Determine if cell is filtered out
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

    // Modal Template
    $('modalbox').innerHTML =
      '<div class="board-modal-header">'
      + '<h3>📊 ' + (s.leagueName || "Ken's Draft Board") + ' — Draft Board Grid <span class="meta" style="font-size:13px; font-weight:normal">(' + s.teams + ' Teams · ' + s.rounds + ' Rounds · ' + (s.mode === '3rr' ? '3RR' : 'Snake') + ')</span></h3>'
      + '<button class="close" onclick="closeBoardModal()">×</button>'
      + '</div>'
      + '<div class="board-toolbar">'
      + '<div class="board-filters">'
      + '<span class="meta" style="font-size:12px; margin-right:4px">Highlight:</span>'
      + filterButtonsHtml
      + '</div>'
      + '<div class="board-actions">'
      + '<div class="meta" style="font-size:12px; margin-right:8px">' + clockStatusHtml + ' · <span style="color:var(--dim)">' + draftedPicksCount + '/' + totalPicks + ' (' + pct + '%)</span></div>'
      + (!isComplete ? '<button type="button" class="act" onclick="scrollBoardToCurrentPick(true)" style="font-size:11.5px; padding:3px 8px; font-weight:600; color:var(--accent); border-color:var(--accent)">⚡ Jump to On-Clock</button>' : '')
      + '<button type="button" class="act" onclick="toggleBoardDensity()" style="font-size:11.5px; padding:3px 8px">' + densityBtnLabel + '</button>'
      + '<button type="button" class="act primary" onclick="closeBoardModal()" style="font-size:11.5px; padding:3px 10px; font-weight:700">Done</button>'
      + '</div>'
      + '</div>'
      + '<div class="board-container" id="board_container">'
      + '<table class="board-table' + densityClass + '" id="board_table">'
      + tableHeadHtml
      + tableBodyHtml
      + '</table>'
      + '</div>';

    $('overlay').classList.add('show');
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

    const backBoardBtn = returnToBoardOnClose
      ? '<button type="button" class="act" onclick="handleClosePlayerModal()" style="font-size:11.5px; padding:3px 8px; margin-left:auto; margin-right:6px">⬅️ Back to Board</button>'
      : '';

    if ($('modalbox')) $('modalbox').className = 'modal';

    $('modalbox').innerHTML =
      '<h3><span class="pos ' + posClass + '">' + p.pos + '</span>' + p.name
      + (p.rookie ? '<span class="rookietag">R</span>' : '')
      + ' <span class="meta">' + (p.team || '') + '</span>' + status
      + backBoardBtn
      + watchModalBtn
      + '<button class="close" onclick="handleClosePlayerModal()">×</button></h3>'
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

    const backBoardBtn = returnToBoardOnClose
      ? '<button type="button" class="act" onclick="handleClosePlayerModal()" style="font-size:11.5px; padding:3px 8px; margin-left:auto; margin-right:6px">⬅️ Back to Board</button>'
      : '';

    if ($('modalbox')) $('modalbox').className = 'modal';

    $('modalbox').innerHTML =
      '<h3><span class="pos ' + posClass + '">' + p.pos + '</span>' + p.name
      + ' <span class="meta">(Custom / Unlisted Pick)</span>'
      + backBoardBtn
      + '<button class="close" onclick="handleClosePlayerModal()">×</button></h3>'
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
    s.leagueName = ($('setup_league_name').value || "Ken's Draft Board").trim();
    s.teams = Math.max(2, Math.min(32, parseInt($('setup_team_count').value, 10) || 12));
    s.mode = $('setup_mode_select').value;
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
  global.saveKeepersAndBackToSetup = saveKeepersAndBackToSetup;
  global.saveAndCloseKeepersModal = saveAndCloseKeepersModal;
  global.openDraftBoardModal = openDraftBoardModal;
  global.renderDraftBoardModalView = renderDraftBoardModalView;
  global.closeBoardModal = closeBoardModal;
  global.setBoardFilter = setBoardFilter;
  global.toggleBoardDensity = toggleBoardDensity;
  global.scrollBoardToCurrentPick = scrollBoardToCurrentPick;
  global.showPlayerFromBoard = showPlayerFromBoard;
  global.showUnlistedPlayerFromBoard = showUnlistedPlayerFromBoard;
  global.handleClosePlayerModal = handleClosePlayerModal;
})(typeof window !== 'undefined' ? window : globalThis);

