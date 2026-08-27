// 🔔 Web Audio API Synthesizer for Fantasy Drafter Turn Chimes
(function (global) {
  let audioCtx = null;

  function getAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => { });
    }
    return audioCtx;
  }

  function playPickChime(force) {
    if (!force && global.state && global.state.settings && !global.state.settings.audioChime) {
      return;
    }
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      // Ascending major triad chime (F5 -> A5 -> C6)
      const notes = [
        { freq: 698.46, start: 0, dur: 0.14 },
        { freq: 880.00, start: 0.11, dur: 0.16 },
        { freq: 1046.50, start: 0.22, dur: 0.38 }
      ];
      notes.forEach(n => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(n.freq, now + n.start);

        gain.gain.setValueAtTime(0, now + n.start);
        gain.gain.linearRampToValueAtTime(0.22, now + n.start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + n.start + n.dur);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + n.start);
        osc.stop(now + n.start + n.dur);
      });
    } catch (e) {
      console.warn('Audio chime error:', e);
    }
  }

  // Auto-unlock audio context on first user gesture
  if (typeof document !== 'undefined') {
    document.addEventListener('click', () => { getAudioContext(); }, { once: true });
    document.addEventListener('keydown', () => { getAudioContext(); }, { once: true });
  }

  global.getAudioContext = getAudioContext;
  global.playPickChime = playPickChime;
})(typeof window !== 'undefined' ? window : globalThis);

