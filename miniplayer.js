/* =================================================
   COREDECK — miniplayer.js
   Injects the floating timer UI on non-timer pages
   ================================================= */

(function() {
  'use strict';

  // Don't show the miniplayer if we are already on the timer page
  if (document.body.classList.contains('timer-page')) return;

  // 1. Inject HTML
  const miniHtml = `
    <div id="miniplayer" class="miniplayer-hidden">
      <div class="miniplayer-content">
        <div class="miniplayer-info">
          <div class="miniplayer-title" id="mini-label">Focusing...</div>
          <div class="miniplayer-sound" id="mini-sound"></div>
        </div>
        <div class="miniplayer-timer" id="mini-time">00:00</div>
      </div>
      <div class="miniplayer-progress-bar" id="mini-progress"></div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', miniHtml);

  const el = (id) => document.getElementById(id);
  const container = el('miniplayer');
  const timeEl = el('mini-time');
  const labelEl = el('mini-label');
  const soundEl = el('mini-sound');
  const progressEl = el('mini-progress');

  function update() {
    const state = window.TimerPersistence ? window.TimerPersistence.load() : null;

    // If no timer is running, hide the miniplayer
    if (!state || state.status !== 'running' || !state.endTime) {
      container.className = 'miniplayer-hidden';
      return;
    }

    // Calculate time remaining
    const now = Date.now();
    const remainingMs = state.endTime - now;

    if (remainingMs <= 0) {
      container.className = 'miniplayer-hidden';
      return;
    }

    // Show miniplayer
    container.className = 'miniplayer-visible';

    // Update Time Text
    const totalSeconds = state.remainingSeconds || 1500; // Fallback to 25m
    const currentSeconds = Math.floor(remainingMs / 1000);
    const mins = Math.floor(currentSeconds / 60);
    const secs = currentSeconds % 60;
    timeEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    // Update Sound Label (Requirement: Audio Sync Awareness)
    if (state.activeSound) {
      soundEl.textContent = `• ${state.activeSound.toUpperCase()}`;
    } else {
      soundEl.textContent = '';
    }

    // Update Progress Bar
    const percent = (currentSeconds / totalSeconds) * 100;
    progressEl.style.width = `${percent}%`;
  }

  // Run update every second
  setInterval(update, 1000);
  update();
})();