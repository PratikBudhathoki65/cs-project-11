/* =================================================
   COREDECK — miniplayer.js
   Floating timer widget for non-timer pages.
   Supports both Focus and Stopwatch modes with
   inline Pause/Resume and Reset controls.
   ================================================= */

(function () {
  'use strict';

  // Don't show the miniplayer if we are already on the timer page
  if (document.body.classList.contains('timer-page')) return;

  // ── 1. Inject HTML ─────────────────────────────
  const miniHtml = `
    <div id="miniplayer" class="miniplayer-hidden">
      <div class="miniplayer-content">
        <div class="miniplayer-info">
          <div class="miniplayer-title" id="mini-label">Focusing...</div>
          <div class="miniplayer-sound"  id="mini-sound"></div>
        </div>
        <div class="miniplayer-timer" id="mini-time">00:00</div>
      </div>

      <div class="miniplayer-controls">
        <button class="mini-ctrl-btn" id="mini-btn-toggle" data-label="Pause" title="Pause" aria-label="Pause or Resume">
          <svg class="mini-icon mini-icon-pause" viewBox="0 0 20 20" fill="currentColor">
            <rect x="4" y="3" width="4" height="14" rx="1"/>
            <rect x="12" y="3" width="4" height="14" rx="1"/>
          </svg>
          <svg class="mini-icon mini-icon-play" viewBox="0 0 20 20" fill="currentColor" style="display:none">
            <path d="M5 3.5l12 6.5-12 6.5V3.5z"/>
          </svg>
        </button>

        <button class="mini-ctrl-btn mini-ctrl-reset" id="mini-btn-reset" title="Reset" aria-label="Reset timer">
          <svg class="mini-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <path d="M4 10a6 6 0 1 0 1.5-3.9"/>
            <path d="M4 4v4h4"/>
          </svg>
        </button>
      </div>

      <div class="miniplayer-progress-bar" id="mini-progress"></div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', miniHtml);

  // ── 2. Inject styles ───────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .miniplayer-controls {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      margin-top: 0.5rem;
      padding-top: 0.5rem;
      border-top: 1px solid rgba(255,255,255,0.07);
    }
    .mini-ctrl-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 7px;
      width: 32px;
      height: 28px;
      cursor: pointer;
      transition: background 0.2s, border-color 0.2s, color 0.2s;
      color: #9a9fa8;
      padding: 0;
      flex-shrink: 0;
    }
    .mini-ctrl-btn:hover {
      background: rgba(141,170,145,0.12);
      border-color: rgba(141,170,145,0.3);
      color: #8daa91;
    }
    .mini-ctrl-reset:hover {
      background: rgba(255,80,80,0.08);
      border-color: rgba(255,80,80,0.22);
      color: #ff6b6b;
    }
    .mini-icon { width: 13px; height: 13px; }
    #mini-btn-toggle {
      flex: 1;
      gap: 0.3rem;
      font-size: 0.65rem;
      font-family: 'DM Sans', sans-serif;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #8daa91;
      border-color: rgba(141,170,145,0.2);
      background: rgba(141,170,145,0.06);
    }
    #mini-btn-toggle:hover { background: rgba(141,170,145,0.14); }
    #mini-btn-toggle::after {
      content: attr(data-label);
      margin-left: 3px;
    }
  `;
  document.head.appendChild(style);

  // ── 3. Element refs ────────────────────────────
  const container  = document.getElementById('miniplayer');
  const timeEl     = document.getElementById('mini-time');
  const labelEl    = document.getElementById('mini-label');
  const soundEl    = document.getElementById('mini-sound');
  const progressEl = document.getElementById('mini-progress');
  const toggleBtn  = document.getElementById('mini-btn-toggle');
  const resetBtn   = document.getElementById('mini-btn-reset');
  const iconPause  = toggleBtn.querySelector('.mini-icon-pause');
  const iconPlay   = toggleBtn.querySelector('.mini-icon-play');

  // ── 4. Helpers ─────────────────────────────────
  function pad(n) { return String(n).padStart(2, '0'); }

  function fmt(totalSeconds) {
    const hrs  = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    if (hrs > 0) return pad(hrs) + ':' + pad(mins) + ':' + pad(secs);
    return pad(mins) + ':' + pad(secs);
  }

  function setRunningIcon(running) {
    iconPause.style.display = running ? '' : 'none';
    iconPlay.style.display  = running ? 'none' : '';
    toggleBtn.dataset.label = running ? 'Pause' : 'Resume';
    toggleBtn.title         = running ? 'Pause' : 'Resume';
  }

  function showSound(state) {
    soundEl.textContent = state.activeSound
      ? '• ' + state.activeSound.toUpperCase()
      : '';
  }

  // ── 5. Main update ─────────────────────────────
  function update() {
    const state = window.TimerPersistence ? window.TimerPersistence.load() : null;

    if (!state || !state.status || state.status === 'idle') {
      container.className = 'miniplayer-hidden';
      return;
    }

    const isRunning   = state.status === 'running';
    const isPaused    = state.status === 'paused';
    const isStopwatch = state.mode === 'stopwatch';

    // ── Stopwatch ─────────────────────────────────
    if (isStopwatch) {
      let elapsed = 0;
      if (isRunning && state.startEpoch) {
        elapsed = Math.floor((Date.now() - state.startEpoch) / 1000);
      } else if (isPaused) {
        elapsed = state.stopwatchSeconds || 0;
      } else {
        container.className = 'miniplayer-hidden';
        return;
      }
      container.className   = 'miniplayer-visible';
      labelEl.textContent   = 'Stopwatch';
      timeEl.textContent    = fmt(elapsed);
      progressEl.style.width = '0%';
      setRunningIcon(isRunning);
      showSound(state);
      return;
    }

    // ── Focus Timer ───────────────────────────────
    if (isRunning && state.endTime) {
      const remainingMs = state.endTime - Date.now();
      if (remainingMs <= 0) {
        container.className = 'miniplayer-hidden';
        return;
      }
      const secs      = Math.floor(remainingMs / 1000);
      const totalSecs = state.totalSeconds || 1500;

      container.className   = 'miniplayer-visible';
      labelEl.textContent   = 'Focus Session';
      timeEl.textContent    = fmt(secs);
      progressEl.style.width = Math.max(0, (secs / totalSecs) * 100) + '%';
      setRunningIcon(true);
      showSound(state);

    } else if (isPaused && typeof state.remainingSeconds === 'number') {
      container.className   = 'miniplayer-visible';
      labelEl.textContent   = 'Paused';
      timeEl.textContent    = fmt(state.remainingSeconds);
      progressEl.style.width = ((state.remainingSeconds / 1500) * 100) + '%';
      setRunningIcon(false);
      showSound(state);

    } else {
      container.className = 'miniplayer-hidden';
    }
  }

  // ── 6. Button: Pause / Resume ──────────────────
  toggleBtn.addEventListener('click', function () {
    const state = window.TimerPersistence ? window.TimerPersistence.load() : null;
    if (!state) return;

    if (state.status === 'running') {
      // → Pause
      if (state.mode === 'stopwatch') {
        const elapsed = Math.floor((Date.now() - state.startEpoch) / 1000);
        window.TimerPersistence.patch({ status: 'paused', stopwatchSeconds: elapsed });
      } else {
        const remaining = Math.max(0, Math.round((state.endTime - Date.now()) / 1000));
        window.TimerPersistence.patch({ status: 'paused', remainingSeconds: remaining, endTime: null });
      }
    } else if (state.status === 'paused') {
      // → Resume
      if (state.mode === 'stopwatch') {
        window.TimerPersistence.patch({
          status:     'running',
          startEpoch: Date.now() - (state.stopwatchSeconds || 0) * 1000,
        });
      } else {
        window.TimerPersistence.patch({
          status:  'running',
          endTime: Date.now() + (state.remainingSeconds || 0) * 1000,
        });
      }
    }
    update();
  });

  // ── 7. Button: Reset ───────────────────────────
  resetBtn.addEventListener('click', function () {
    if (window.TimerPersistence) window.TimerPersistence.clear();
    container.className = 'miniplayer-hidden';
  });

  // ── 8. Tick ────────────────────────────────────
  setInterval(update, 1000);
  update();
})();