/* =================================================
   COREDECK — timer.js
   Focus Timer + Stopwatch Logic
   Uses setInterval for all timing.

   ── PERSISTENCE INTEGRATION ─────────────────────
   This file now communicates with timer-persistence.js
   via window.TimerPersistence (a global API object).

   Key moments where state is saved:
     startTimer()  → saves {status:'running', endTime, ...}
     pauseTimer()  → saves {status:'paused', remainingSeconds, ...}
     resetTimer()  → clears localStorage entirely
     session end   → clears localStorage (session complete)
     init()        → restores state from localStorage on page load

   The endTime strategy:
     Instead of trusting setInterval's 1-second tick to
     always be exactly 1000ms (it can drift when the tab
     is backgrounded), we save the absolute epoch timestamp
     at which the timer will hit zero. On page load we
     recalculate remaining seconds as (endTime - Date.now()).
     This means the timer is accurate to within 1 second
     even if the user was away for minutes.

   HOW setInterval WORKS (for documentation):
   ────────────────────────────────────────────
   setInterval(callback, delay) calls 'callback' every
   'delay' milliseconds until clearInterval() is called.
   We use delay = 1000 (1 second) to tick the clock.
   The returned value is an ID number we store in
   'intervalId' so we can stop it later with clearInterval.
   ================================================= */


/* ─────────────────────────────────────────────────
   CONSTANTS
   ───────────────────────────────────────────────── */

/* Total duration for one Pomodoro focus session (25 min × 60 sec) */
const FOCUS_TOTAL_SECONDS = 25 * 60;   /* = 1500 */

/* SVG ring circumference: 2 × π × radius = 2 × 3.14159 × 110 ≈ 691 */
const RING_CIRCUMFERENCE = 691;


/* ─────────────────────────────────────────────────
   STATE VARIABLES
   These track what the timer is currently doing.
   ───────────────────────────────────────────────── */

let currentMode    = 'focus';   /* 'focus' or 'stopwatch'              */
let intervalId     = null;      /* holds the setInterval ID             */
let isRunning      = false;     /* true if the clock is ticking         */

/* Focus Timer state */
let secondsLeft    = FOCUS_TOTAL_SECONDS; /* counts DOWN from 1500     */
let sessionsCompleted = 0;                /* how many 25-min blocks done */

/* Stopwatch state */
let stopwatchSeconds = 0;       /* counts UP from 0                     */


/* ─────────────────────────────────────────────────
   DOM REFERENCES
   Cache elements once so we don't query the DOM
   on every single tick (better performance).
   ───────────────────────────────────────────────── */

const timeDisplay  = document.getElementById('timeDisplay');
const ringFill     = document.getElementById('ringFill');
const progressRing = document.getElementById('progressRing');
const sessionLabel = document.getElementById('sessionLabel');
const sessionDots  = document.getElementById('sessionDots');
const dotLabel     = document.getElementById('dotLabel');
const timerDeck    = document.getElementById('timerDeck');

const btnStart     = document.getElementById('btnStart');
const btnPause     = document.getElementById('btnPause');
const btnReset     = document.getElementById('btnReset');
const btnFocus     = document.getElementById('btnFocus');
const btnStopwatch = document.getElementById('btnStopwatch');

/* The four dot elements for session tracking */
const dots = [
  document.getElementById('dot1'),
  document.getElementById('dot2'),
  document.getElementById('dot3'),
  document.getElementById('dot4'),
];


/* ─────────────────────────────────────────────────
   PERSISTENCE HELPER
   ────────────────────────────────────────────────
   A thin wrapper so timer.js never has to null-check
   TimerPersistence directly. If the script loaded out
   of order, these are safe no-ops.
   ───────────────────────────────────────────────── */
function persistSave(data) {
  if (window.TimerPersistence) window.TimerPersistence.save(data);
}
function persistClear() {
  if (window.TimerPersistence) window.TimerPersistence.clear();
}

/*
  buildStateSnapshot()
  ────────────────────
  Assembles the object that gets written to localStorage.
  Reads activeSound from the global set by sound.js so that
  both modules stay in sync without tight coupling.
*/
function buildStateSnapshot(status) {
  return {
    status:            status,
    mode:              'focus',
    endTime:           status === 'running'
                         ? Date.now() + secondsLeft * 1000
                         : null,
    remainingSeconds:  secondsLeft,
    totalSeconds:      FOCUS_TOTAL_SECONDS,
    sessionsCompleted: sessionsCompleted,
    activeSound:       window.activeSound || null,
  };
}


/* ─────────────────────────────────────────────────
   UTILITY: formatTime(totalSeconds)
   ────────────────────────────────────────────────
   Converts a raw number of seconds into "MM:SS" format.

   Example: formatTime(90)  →  "01:30"
            formatTime(1500) →  "25:00"

   Math.floor(n / 60) gives whole minutes.
   (n % 60) gives leftover seconds.
   String.padStart(2, '0') adds a leading zero if needed
   so we get "05" instead of "5".
   ───────────────────────────────────────────────── */
function formatTime(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
}


/* ─────────────────────────────────────────────────
   UTILITY: updateRing(secondsLeft)
   ────────────────────────────────────────────────
   Updates the SVG progress ring to show remaining time.

   stroke-dasharray = full circumference (691px)
   stroke-dashoffset = how much of the stroke to hide

   When offset = 0:   full circle is drawn (time remaining = 100%)
   When offset = 691: nothing is drawn    (time remaining = 0%)

   Formula: offset = circumference × (secondsLeft / totalSeconds)
   So as secondsLeft shrinks, offset shrinks, revealing more arc.
   ───────────────────────────────────────────────── */
function updateRing(secsLeft) {
  const fraction = secsLeft / FOCUS_TOTAL_SECONDS;
  const offset   = RING_CIRCUMFERENCE * fraction;
  ringFill.style.strokeDashoffset = offset;
}


/* ─────────────────────────────────────────────────
   UTILITY: updateDots()
   Fills session dots based on sessionsCompleted count.
   ───────────────────────────────────────────────── */
function updateDots() {
  dots.forEach(function(dot, index) {
    if (index < sessionsCompleted) {
      dot.classList.add('filled');     /* colour it Sage Green */
    } else {
      dot.classList.remove('filled');  /* empty (outline only) */
    }
  });
  dotLabel.textContent = sessionsCompleted + ' / 4 sessions';
}


/* ─────────────────────────────────────────────────
   UTILITY: tickPulse()
   Adds a tiny CSS class to the time display for 80ms
   to create a subtle visual 'heartbeat' each tick.
   ───────────────────────────────────────────────── */
function tickPulse() {
  timeDisplay.classList.add('tick');
setTimeout(function () {
  if (!widget) return;

  window.TimerPersistence.patch({ miniHidden: true });

  if (widget.parentNode) {
    widget.parentNode.removeChild(widget);
  }
}, 300);
}

/* ─────────────────────────────────────────────────
   UTILITY: setButtonState(running)
   Enable/disable buttons to match the clock state.
   When running: START is disabled, PAUSE is enabled.
   When paused:  START is enabled,  PAUSE is disabled.
   ───────────────────────────────────────────────── */
function setButtonState(running) {
  btnStart.disabled = running;
  btnPause.disabled = !running;
}


/* ─────────────────────────────────────────────────
   CORE: startTimer()
   Called when the user clicks START.
   ────────────────────────────────────────────────
   1. Guard: if already running, do nothing.
   2. Set isRunning = true, update button states.
   3. Save running state to localStorage (persistence).
   4. Call setInterval with a 1-second delay.
      Inside the callback:
        • If Focus mode: decrement secondsLeft by 1.
          If it hits 0, session is complete.
        • If Stopwatch mode: increment stopwatchSeconds by 1.
        • Update the display.
   ───────────────────────────────────────────────── */
function startTimer() {
  /* Guard: don't start if already running */
  if (isRunning) return;

  isRunning = true;
  setButtonState(true); /* disable START, enable PAUSE */

  /* ── PERSISTENCE: save running state ──────────────
     We write endTime = now + remaining milliseconds.
     This absolute timestamp lets us recover accurately
     even if the tab was backgrounded (setInterval drifts).
  ─────────────────────────────────────────────────── */
  if (currentMode === 'focus') {
    persistSave(buildStateSnapshot('running'));
  } else {
    /* Stopwatch: save startEpoch so we can recover elapsed time cross-page */
    window.TimerPersistence && window.TimerPersistence.patch({
      status:      'running',
      mode:        'stopwatch',
      startEpoch:  Date.now() - stopwatchSeconds * 1000,
      activeSound: window.activeSound || null,
    });
  }

  /* setInterval fires the callback every 1000ms (1 second) */
  intervalId = setInterval(function() {

    /* ── FOCUS TIMER MODE ─────────────────── */
    if (currentMode === 'focus') {

      secondsLeft -= 1; /* count down by one second */

      /* Update the big number display */
      timeDisplay.textContent = formatTime(secondsLeft);

      /* Update the SVG ring arc */
      updateRing(secondsLeft);

      /* Warn the user when 5 minutes or less remain */
      if (secondsLeft <= 300) {
        timeDisplay.classList.add('warn');
      }

      /* Animate a subtle tick pulse on the number */
      tickPulse();

      /* ── SESSION COMPLETE ── */
      if (secondsLeft <= 0) {

        /* Stop the interval immediately */
        clearInterval(intervalId);
        isRunning = false;
        intervalId = null;

        /* Count the completed session (max 4) */
        if (sessionsCompleted < 4) {
          sessionsCompleted += 1;
        }
        updateDots();

        /* Reset button states so user can start again */
        setButtonState(false);
        timeDisplay.classList.remove('warn');

        /* Play a soft browser beep (if supported) */
        playBeep();

        /* ── PERSISTENCE: clear state on session completion ──
           The session is done — nothing to restore.
           A new session will create fresh state when started.
        ─────────────────────────────────────────────────── */
        persistClear();

        /* Optionally auto-reset for next session */
        secondsLeft = FOCUS_TOTAL_SECONDS;
        timeDisplay.textContent = formatTime(secondsLeft);
        updateRing(secondsLeft);

        /* Alert the user (you can replace with a custom modal later) */
        alert('Focus session complete! Take a 5-minute break.');
      }

    /* ── STOPWATCH MODE ───────────────────── */
    } else {

      stopwatchSeconds += 1; /* count up by one second */

      /* Stopwatch can go past 59:59 — handle hours too */
      const hrs  = Math.floor(stopwatchSeconds / 3600);
      const mins = Math.floor((stopwatchSeconds % 3600) / 60);
      const secs = stopwatchSeconds % 60;

      if (hrs > 0) {
        /* Show HH:MM:SS once we exceed one hour */
        timeDisplay.textContent =
          String(hrs).padStart(2, '0') + ':' +
          String(mins).padStart(2, '0') + ':' +
          String(secs).padStart(2, '0');
      } else {
        /* Normal MM:SS display */
        timeDisplay.textContent = formatTime(stopwatchSeconds);
      }

      tickPulse(); /* subtle tick on each second */
    }

  }, 1000); /* repeat every 1000 milliseconds = 1 second */
}


/* ─────────────────────────────────────────────────
   CORE: pauseTimer()
   Called when the user clicks PAUSE.
   ────────────────────────────────────────────────
   clearInterval(intervalId) stops the callback from
   firing. The current seconds value is preserved, so
   clicking START again resumes exactly where it left off.
   ───────────────────────────────────────────────── */
function pauseTimer() {
  if (!isRunning) return; /* do nothing if already paused */

  clearInterval(intervalId); /* stop the setInterval callback */
  intervalId = null;
  isRunning = false;

  setButtonState(false); /* enable START, disable PAUSE */

  /* ── PERSISTENCE: save paused snapshot ────────────
     We write remainingSeconds instead of endTime here.
     When paused, Date.now() keeps advancing but the timer
     doesn't, so an endTime would become wrong.
  ─────────────────────────────────────────────────── */
  if (currentMode === 'focus') {
    persistSave(buildStateSnapshot('paused'));
  } else {
    window.TimerPersistence && window.TimerPersistence.patch({
      status:           'paused',
      mode:             'stopwatch',
      stopwatchSeconds: stopwatchSeconds,
      activeSound:      window.activeSound || null,
    });
  }
}


/* ─────────────────────────────────────────────────
   CORE: resetTimer()
   Called when the user clicks RESET.
   ────────────────────────────────────────────────
   Stops any running interval and returns all state
   variables back to their starting values.
   ───────────────────────────────────────────────── */
function resetTimer() {
  /* Stop the clock if it's currently running */
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }

  isRunning = false;
  setButtonState(false);

  if (currentMode === 'focus') {
    /* Reset focus timer to 25:00 */
    secondsLeft = FOCUS_TOTAL_SECONDS;
    timeDisplay.textContent = formatTime(secondsLeft);
    timeDisplay.classList.remove('warn');
    updateRing(secondsLeft);

    /* Reset session dots on full reset */
    sessionsCompleted = 0;
    updateDots();

  } else {
    /* Reset stopwatch to 00:00 */
    stopwatchSeconds = 0;
    timeDisplay.textContent = '00:00';
  }

  /* ── PERSISTENCE: wipe stored state ───────────────
     The user explicitly reset — nothing to restore.
     The mini-player on other pages will disappear within
     one tick (updateWidget sees 'idle' and self-removes).
  ─────────────────────────────────────────────────── */
  persistClear();
}


/* ─────────────────────────────────────────────────
   CORE: switchMode(mode)
   Called by the mode switcher buttons (onclick).
   ────────────────────────────────────────────────
   Switches between 'focus' and 'stopwatch' without
   reloading the page:
   1. Stop any running timer (safety).
   2. Update the active tab styling.
   3. Update currentMode variable.
   4. Toggle the CSS class that shows/hides the SVG ring.
   5. Reset the display to the correct starting state.
   ───────────────────────────────────────────────── */
function switchMode(mode) {
  /* Don't do anything if we're already in this mode */
  if (currentMode === mode) return;

  /* Stop any running clock before switching */
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  isRunning = false;
  setButtonState(false);

  /* ── PERSISTENCE: switching mode clears focus state ── */
  persistClear();

  /* Update the mode variable */
  currentMode = mode;

  /* ── Update tab button active states ── */
  if (mode === 'focus') {
    btnFocus.classList.add('active-mode');
    btnFocus.setAttribute('aria-selected', 'true');
    btnStopwatch.classList.remove('active-mode');
    btnStopwatch.setAttribute('aria-selected', 'false');
  } else {
    btnStopwatch.classList.add('active-mode');
    btnStopwatch.setAttribute('aria-selected', 'true');
    btnFocus.classList.remove('active-mode');
    btnFocus.setAttribute('aria-selected', 'false');
  }

  /* ── Toggle CSS class on deck for ring/dots visibility ── */
  if (mode === 'stopwatch') {
    timerDeck.classList.add('stopwatch-mode');
    sessionLabel.textContent = 'STOPWATCH';
    stopwatchSeconds = 0;
    timeDisplay.textContent = '00:00';
  } else {
    timerDeck.classList.remove('stopwatch-mode');
    sessionLabel.textContent = 'FOCUS SESSION';
    secondsLeft = FOCUS_TOTAL_SECONDS;
    timeDisplay.textContent = formatTime(secondsLeft);
    timeDisplay.classList.remove('warn');
    updateRing(secondsLeft);
    updateDots();
  }
}


/* ─────────────────────────────────────────────────
   UTILITY: playBeep()
   ────────────────────────────────────────────────
   Uses the Web Audio API to synthesise a short,
   soft two-tone chime when a session ends.
   No audio file needed — the browser generates it.

   AudioContext creates an audio environment.
   OscillatorNode generates the actual tone wave.
   GainNode controls volume (so it fades out softly).
   ───────────────────────────────────────────────── */
function playBeep() {
  /* Web Audio API may not be supported in very old browsers */
  try {
    /* Create a temporary audio context */
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    /* Helper: play a single tone */
    function tone(freq, startTime, duration) {
      const osc  = ctx.createOscillator(); /* generates the sine wave */
      const gain = ctx.createGain();       /* controls the volume     */

      osc.connect(gain);
      gain.connect(ctx.destination);       /* connect to speakers     */

      osc.type      = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      /* Fade out smoothly so there's no harsh click at the end */
      gain.gain.setValueAtTime(0.18, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      osc.start(startTime);
      osc.stop(startTime + duration);
    }

    /* Play a gentle two-note chime: C5 then E5 */
    tone(523, ctx.currentTime,        0.5);  /* C5 */
    tone(659, ctx.currentTime + 0.55, 0.5);  /* E5 */

  } catch (e) {
    /* If Web Audio isn't supported, silently skip the beep */
    console.log('Audio not supported:', e);
  }
}


/* ─────────────────────────────────────────────────
   INIT — run on page load
   ──────────────────────────────────────────────────
   Extended from the original to restore timer state
   from localStorage when the user returns to this page.

   RESTORATION FLOW:
   1. Load state from localStorage via TimerPersistence.
   2. If no state (or 'idle'), set default display and exit.
   3. If 'running':
        a. Compute remaining seconds from saved endTime.
        b. If time has already expired (user was away too long),
           log the completed session and show a notification.
        c. Otherwise restore secondsLeft + sessionsCompleted
           and auto-start the countdown.
   4. If 'paused':
        Restore secondsLeft + sessionsCompleted,
        leave the timer stopped (user must re-click Start).
   5. Restore the active sound button highlight (visual only —
      audio cannot auto-play across navigation).
   ───────────────────────────────────────────────── */
(function init() {

  /* ── Try to restore from localStorage ── */
  const stored = window.TimerPersistence ? window.TimerPersistence.load() : null;

  if (!stored || stored.status === 'idle' || !stored.status) {
    /* No active session — initialise defaults */
    timeDisplay.textContent = formatTime(FOCUS_TOTAL_SECONDS);
    updateRing(FOCUS_TOTAL_SECONDS);
    updateDots();
    setButtonState(false);
    return;
  }

  /* ── Restore session-count dots ── */
  if (typeof stored.sessionsCompleted === 'number') {
    sessionsCompleted = stored.sessionsCompleted;
  }

  /* ── RUNNING state: calculate true remaining time ── */
  if (stored.status === 'running' && stored.endTime) {
    const msLeft   = stored.endTime - Date.now();
    const secsLeft = Math.max(0, Math.round(msLeft / 1000));

    if (secsLeft <= 0) {
      /*
        Timer expired while the user was on another page.
        Count the session and show a friendly notification.
        We use a short setTimeout so the page renders first.
      */
      if (sessionsCompleted < 4) sessionsCompleted += 1;

      secondsLeft = FOCUS_TOTAL_SECONDS;
      timeDisplay.textContent = formatTime(secondsLeft);
      updateRing(secondsLeft);
      updateDots();
      setButtonState(false);
      persistClear();

      setTimeout(function() {
        playBeep();
        alert('Your focus session completed while you were away! Take a 5-minute break.');
      }, 400);

    } else {
      /*
        Timer is still running. Restore state and auto-start
        so the user sees a live countdown immediately.
      */
      secondsLeft = secsLeft;
      timeDisplay.textContent = formatTime(secondsLeft);
      updateRing(secondsLeft);
      updateDots();

      /* Apply warning colour if ≤5 min remain */
      if (secondsLeft <= 300) {
        timeDisplay.classList.add('warn');
      }

      setButtonState(false); /* start button enabled before calling startTimer */
      startTimer();           /* auto-resume the countdown */
    }

  /* ── PAUSED state: restore display, leave clock stopped ── */
  } else if (stored.status === 'paused') {
    secondsLeft = stored.remainingSeconds || FOCUS_TOTAL_SECONDS;
    timeDisplay.textContent = formatTime(secondsLeft);
    updateRing(secondsLeft);
    updateDots();

    if (secondsLeft <= 300) {
      timeDisplay.classList.add('warn');
    }

    setButtonState(false); /* user must manually click Start to resume */
  }

  /* ── Restore sound button highlight ──────────────────
     We cannot auto-play audio (browser blocks it without
     a fresh user gesture). Instead, we visually pre-select
     the button for the previously active sound so the user
     can re-enable it with a single click.

     This runs after a short delay to ensure sound.js has
     finished initialising its 'sounds' map.
  ─────────────────────────────────────────────────── */
  if (stored.activeSound) {
    setTimeout(function() {
      const soundBtns = {
        rain:   document.getElementById('snd-rain'),
        forest: document.getElementById('snd-forest'),
        lofi:   document.getElementById('snd-lofi'),
      };

      const targetBtn = soundBtns[stored.activeSound];
      if (targetBtn) {
        /* Add a 'resume-hint' class for a subtle visual cue.
           The button is not set to 'active' (that requires audio playing),
           just visually highlighted so the user knows to click it. */
        targetBtn.classList.add('sound-resume-hint');
        targetBtn.title = 'Click to resume ' + stored.activeSound + ' sounds';
      }
    }, 200);
  }

})();


/* ─────────────────────────────────────────────────
   SOUND RESUME HINT STYLES
   ──────────────────────────────────────────────────
   Injects a subtle CSS rule for the .sound-resume-hint
   class added by init() above. Keeps this self-contained
   without modifying timer.css.
   ───────────────────────────────────────────────── */
(function injectResumeHintStyle() {
  const style = document.createElement('style');
  style.textContent = [
    '/* Subtle hint that a sound was playing before navigation */',
    '.sound-btn.sound-resume-hint {',
    '  border-color: rgba(143, 166, 122, 0.35);',
    '  color: rgba(143, 166, 122, 0.65);',
    '  background: rgba(143, 166, 122, 0.04);',
    '}',
    '.sound-btn.sound-resume-hint::after {',
    '  content: "↩";',
    '  position: absolute;',
    '  top: 4px;',
    '  right: 5px;',
    '  font-size: 0.55rem;',
    '  color: rgba(143,166,122,0.6);',
    '}',
    '/* Remove hint once the button becomes properly active */',
    '.sound-btn.active { position: relative; }',
    '.sound-btn.active.sound-resume-hint::after { display: none; }',
  ].join('\n');
  document.head.appendChild(style);
})();
/* ─────────────────────────────────────────────────
   INIT — RESTORATION LOGIC (FIXED)
   ───────────────────────────────────────────────── */
(function init() {
  // 1. Small delay to ensure TimerPersistence is fully loaded in the DOM
  setTimeout(() => {
    const stored = window.TimerPersistence ? window.TimerPersistence.load() : null;

    console.log("Restoring Timer State:", stored); // Debugging line

    // If no state exists or it's explicitly idle, set defaults and stop
    if (!stored || !stored.status || stored.status === 'idle') {
      secondsLeft = FOCUS_TOTAL_SECONDS;
      timeDisplay.textContent = formatTime(secondsLeft);
      updateRing(secondsLeft);
      updateDots();
      setButtonState(false);
      return;
    }

    // ── STOPWATCH MODE RESTORATION ──
    if (stored.mode === 'stopwatch') {
      switchMode('stopwatch');

      if (stored.status === 'running' && stored.startEpoch) {
        stopwatchSeconds = Math.floor((Date.now() - stored.startEpoch) / 1000);
        timeDisplay.textContent = formatStopwatch(stopwatchSeconds);
        setButtonState(true);
        startTimer();
      } else if (stored.status === 'paused') {
        stopwatchSeconds = stored.stopwatchSeconds || 0;
        timeDisplay.textContent = formatStopwatch(stopwatchSeconds);
        setButtonState(false);
      }
      return;
    }

    // Restore completed sessions (focus mode)
    if (typeof stored.sessionsCompleted === 'number') {
      sessionsCompleted = stored.sessionsCompleted;
    }

    // CASE 1: FOCUS TIMER WAS RUNNING
    if (stored.status === 'running' && stored.endTime) {
      const now = Date.now();
      const msLeft = stored.endTime - now;
      const secsLeft = Math.max(0, Math.round(msLeft / 1000));

      if (secsLeft <= 0) {
        if (sessionsCompleted < 4) sessionsCompleted += 1;
        secondsLeft = FOCUS_TOTAL_SECONDS;
        updateDots();
        persistClear();
        timeDisplay.textContent = formatTime(secondsLeft);
        updateRing(secondsLeft);
        setButtonState(false);
        alert('Your focus session completed while you were away!');
      } else {
        secondsLeft = secsLeft;
        timeDisplay.textContent = formatTime(secondsLeft);
        updateRing(secondsLeft);
        updateDots();
        if (secondsLeft <= 300) timeDisplay.classList.add('warn');
        setButtonState(true);
        startTimer();
      }
    }
    // CASE 2: FOCUS TIMER WAS PAUSED
    else if (stored.status === 'paused') {
      secondsLeft = stored.remainingSeconds || FOCUS_TOTAL_SECONDS;
      timeDisplay.textContent = formatTime(secondsLeft);
      updateRing(secondsLeft);
      updateDots();
      if (secondsLeft <= 300) timeDisplay.classList.add('warn');
      setButtonState(false);
    }
  }, 50);
})();


/* ─────────────────────────────────────────────────
   UTILITY: formatStopwatch(totalSeconds)
   Like formatTime but handles HH:MM:SS for hours.
   ───────────────────────────────────────────────── */
function formatStopwatch(totalSeconds) {
  const hrs  = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hrs > 0) {
    return String(hrs).padStart(2, '0') + ':' +
           String(mins).padStart(2, '0') + ':' +
           String(secs).padStart(2, '0');
  }
  return String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
}


/* ─────────────────────────────────────────────────
   MINIPLAYER CONTROLS (called from miniplayer.js)
   These are global so miniplayer.js can call them
   even when on a different page via localStorage patch.
   ───────────────────────────────────────────────── */
window.miniPause = function() {
  const state = window.TimerPersistence ? window.TimerPersistence.load() : null;
  if (!state || state.status !== 'running') return;

  if (state.mode === 'stopwatch') {
    const elapsed = Math.floor((Date.now() - state.startEpoch) / 1000);
    window.TimerPersistence.patch({ status: 'paused', stopwatchSeconds: elapsed });
  } else {
    // Focus: save remaining seconds
    const remaining = Math.max(0, Math.round((state.endTime - Date.now()) / 1000));
    window.TimerPersistence.patch({ status: 'paused', remainingSeconds: remaining, endTime: null });
  }
};

window.miniResume = function() {
  const state = window.TimerPersistence ? window.TimerPersistence.load() : null;
  if (!state || state.status !== 'paused') return;

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
};

window.miniReset = function() {
  if (window.TimerPersistence) window.TimerPersistence.clear();
};