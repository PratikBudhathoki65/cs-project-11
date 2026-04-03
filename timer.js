/* =================================================
   COREDECK — timer.js
   Focus Timer + Stopwatch Logic
   Uses setInterval for all timing.

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
  setTimeout(function() {
    timeDisplay.classList.remove('tick');
  }, 80);
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
   3. Call setInterval with a 1-second delay.
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
   Sets the initial state of the display and ring.
   ───────────────────────────────────────────────── */
(function init() {
  timeDisplay.textContent = formatTime(FOCUS_TOTAL_SECONDS); /* "25:00" */
  updateRing(FOCUS_TOTAL_SECONDS);  /* ring starts fully drawn */
  updateDots();                     /* all dots start empty    */
  setButtonState(false);            /* PAUSE starts disabled   */
})();
