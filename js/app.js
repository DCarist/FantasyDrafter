// 🚀 Application Entry Point & Event Wiring for Fantasy Drafter
(function (global) {
  function bindHeaderControls() {
    const s = global.state.settings;
    if ($('rounds')) $('rounds').value = s.rounds;
    if ($('mode')) $('mode').value = s.mode;
    if ($('hdrleaguetype')) $('hdrleaguetype').value = s.leagueType || 'dynasty';
    if ($('hdrscoring')) $('hdrscoring').value = s.scoring;
    if ($('hdrqb')) $('hdrqb').value = s.qbFormat;
    if ($('teprem')) $('teprem').checked = s.teprem;
    if ($('blend')) $('blend').value = s.blend;
    if ($('blendval')) $('blendval').textContent = s.blend + '%';
  }

  function bindSettings() {
    bindHeaderControls();
    const on = (id, ev, fn) => {
      const el = $(id);
      if (el) el.addEventListener(ev, fn);
    };

    on('hdrslot', 'change', () => {
      global.state.settings.slot = +$('hdrslot').value || 1;
      save();
      render();
    });

    on('hdrleaguetype', 'change', () => {
      const newType = $('hdrleaguetype').value;
      global.state.settings.leagueType = newType;
      if (newType === 'redraft') {
        global.state.settings.blend = 0;
      } else if (newType === 'dynasty') {
        if (global.state.settings.blend === 0) global.state.settings.blend = 60;
      }
      if ($('blend')) $('blend').value = global.state.settings.blend;
      if ($('blendval')) $('blendval').textContent = global.state.settings.blend + '%';
      save();
      render();
    });

    on('hdrscoring', 'change', () => {
      global.state.settings.scoring = $('hdrscoring').value;
      save();
      render();
    });

    on('hdrqb', 'change', () => {
      global.state.settings.qbFormat = $('hdrqb').value;
      save();
      render();
    });

    on('rounds', 'change', () => {
      global.state.settings.rounds = Math.max(1, +$('rounds').value || 25);
      const rs = global.state.settings.rosterSlots || DEFAULT_ROSTER_SLOTS;
      const starters = (rs.qb || 0) + (rs.rb || 0) + (rs.wr || 0) + (rs.te || 0) +
        (rs.flex || 0) + (rs.superflex || 0) + (rs.k || 0) + (rs.dst || 0);
      global.state.settings.rosterSlots.bench = Math.max(0, global.state.settings.rounds - starters);
      save();
      render();
    });

    on('mode', 'change', () => {
      global.state.settings.mode = $('mode').value;
      save();
      render();
    });

    on('teprem', 'change', () => {
      global.state.settings.teprem = $('teprem').checked;
      save();
      render();
    });

    on('blend', 'input', () => {
      global.state.settings.blend = +$('blend').value;
      if ($('blendval')) $('blendval').textContent = global.state.settings.blend + '%';
      save();
      renderPool();
    });

    on('search', 'input', () => {
      global.ui.search = $('search').value;
      renderPool();
    });

    on('sortsel', 'change', () => {
      global.ui.sort = $('sortsel').value;
      renderPool();
    });

    on('hidetaken', 'change', () => {
      global.ui.hideTaken = $('hidetaken').checked;
      renderPool();
    });

    on('undobtn', 'click', undo);
    on('resetbtn', 'click', resetDraft);
    on('boardbtn', 'click', () => openDraftBoardModal());
    on('unknownbtn', 'click', openUnlistedPickModal);
    on('jumpbtn', 'click', () => {
      const v = +$('jumppick').value;
      if (v) jumpTo(v);
    });
    on('setupbtn', 'click', openLeagueSetup);
    on('rosterTeamSelect', 'change', () => {
      selectRosterSlot($('rosterTeamSelect').value);
    });
    on('overlay', 'click', e => {
      if (e.target.id === 'overlay') closeModal();
    });
    on('playerOverlay', 'click', e => {
      if (e.target.id === 'playerOverlay') {
        if (typeof closePlayerModal === 'function') closePlayerModal();
        else closeModal();
      }
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        const playerOverlay = $('playerOverlay');
        if (playerOverlay && playerOverlay.classList.contains('show')) {
          if (typeof closePlayerModal === 'function') closePlayerModal();
          else closeModal();
        } else {
          closeModal();
        }
      }
      // Quick search focus on "/" if not in input
      if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
        const searchInput = $('search');
        if (searchInput) searchInput.focus();
      }
      // Quick undo on Ctrl+Z or Cmd+Z
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
        undo();
      }
      // Toggle Draft Board modal on 'b' or 'B' if not inside an input/textarea
      if ((e.key === 'b' || e.key === 'B') && !e.ctrlKey && !e.metaKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        const modalBox = $('modalbox');
        const overlay = $('overlay');
        if (overlay && overlay.classList.contains('show') && modalBox && modalBox.classList.contains('modal-board')) {
          closeModal();
        } else {
          openDraftBoardModal();
        }
      }
    });
  }

  function initApp() {
    bindSettings();
    if (typeof initBroadcastSync === 'function') initBroadcastSync();
    if (typeof renderTabs === 'function') renderTabs();
    if (typeof render === 'function') render();
  }

  global.bindHeaderControls = bindHeaderControls;
  global.bindSettings = bindSettings;
  global.initApp = initApp;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initApp);
    } else {
      initApp();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);

