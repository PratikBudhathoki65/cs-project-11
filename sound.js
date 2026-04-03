/* =================================================
   COREDECK — sound.js
   Ambient Sound Controller

   HOW IT WORKS (overview for documentation):
   ──────────────────────────────────────────────
   HTML gives us three <audio> elements (hidden).
   Each has an id like "audio-rain".
   JavaScript grabs them, and when a button is clicked:
     1. Pause every audio element.
     2. If the clicked sound was NOT already playing,
        start it. (This gives us a toggle: click again
        to stop the sound that's playing.)
     3. Update the active CSS class so the pulsing
        animation shows on the correct button.
   The volume slider updates all tracks at once by
   setting their .volume property (0.0 to 1.0).
   ================================================= */


/* ─────────────────────────────────────────────────
   SOUND MAP
   ──────────────────────────────────────────────────
   An object that maps a short key ('rain', 'forest',
   'lofi') to its <audio> DOM element and its button
   DOM element. Centralised here so we never hard-code
   IDs in multiple places — one source of truth.
   ───────────────────────────────────────────────── */
const sounds = {
  rain:   {
    audio: document.getElementById('audio-rain'),
    btn:   document.getElementById('snd-rain'),
  },
  forest: {
    audio: document.getElementById('audio-forest'),
    btn:   document.getElementById('snd-forest'),
  },
  lofi:   {
    audio: document.getElementById('audio-lofi'),
    btn:   document.getElementById('snd-lofi'),
  },
};


/* ─────────────────────────────────────────────────
   STATE VARIABLE
   Tracks which key is currently playing, or null.
   ───────────────────────────────────────────────── */
let activeSound = null;   /* e.g. 'rain', 'forest', 'lofi', or null */


/* ─────────────────────────────────────────────────
   toggleSound(key)
   ──────────────────────────────────────────────────
   Called by onclick on each sound button.
   'key' is the string 'rain', 'forest', or 'lofi'.

   Logic:
     A) If the clicked sound IS the one playing →
        stop it (user clicked to turn it off).
     B) If a DIFFERENT sound is playing →
        stop the old one, start the new one.
     C) If NOTHING is playing →
        start the clicked sound.
   ───────────────────────────────────────────────── */
function toggleSound(key) {

  /* ── Case A: clicking the currently active sound → stop it ── */
  if (activeSound === key) {
    stopAllSounds();
    return;
  }

  /* ── Cases B + C: stop everything, then start the new sound ── */
  stopAllSounds();   /* pause any currently playing audio          */
  startSound(key);   /* play the newly selected audio              */
}


/* ─────────────────────────────────────────────────
   startSound(key)
   ──────────────────────────────────────────────────
   Plays the audio for 'key' and marks its button active.

   audio.play() returns a Promise. We catch any errors
   because browsers may block autoplay if the user
   hasn't interacted with the page yet — though since
   this is triggered by a button click, it should
   always be allowed.
   ───────────────────────────────────────────────── */
function startSound(key) {
  const track = sounds[key];

  /* Set volume from the slider before playing */
  const vol = parseFloat(document.getElementById('volSlider').value);
  track.audio.volume = vol;

  /* .play() is asynchronous — it returns a Promise */
  const playPromise = track.audio.play();

  if (playPromise !== undefined) {
    playPromise
      .then(function() {
        /* Playback started successfully */
        activeSound = key;
        setActiveButton(key);
      })
      .catch(function(error) {
        /* Autoplay was blocked or stream failed to load */
        console.warn('CoreDeck sound: could not play "' + key + '":', error);
        activeSound = null;
      });
  }
}


/* ─────────────────────────────────────────────────
   stopAllSounds()
   ──────────────────────────────────────────────────
   Pauses every audio element and resets their position
   to the start (except streams, where currentTime
   cannot be set). Removes the active class from all
   buttons and clears the activeSound state variable.
   ───────────────────────────────────────────────── */
function stopAllSounds() {

  /* Loop through every entry in our sounds map */
  Object.keys(sounds).forEach(function(key) {
    const audio = sounds[key].audio;

    /* Pause the audio element */
    audio.pause();

    /*
      Reset playback position to the beginning.
      For local MP3 files this rewinds the track.
      For a live stream (Lofi), setting currentTime
      may throw — we use try/catch to handle that safely.
    */
    try {
      audio.currentTime = 0;
    } catch (e) {
      /* Stream — ignore, it will resume from live position */
    }
  });

  /* Clear the active state */
  activeSound = null;
  clearActiveButtons();
}


/* ─────────────────────────────────────────────────
   setActiveButton(key)
   ──────────────────────────────────────────────────
   Adds the 'active' CSS class to the button for 'key'
   and updates its aria-pressed attribute to 'true' for
   screen reader accessibility.
   The 'active' class triggers the pulsing animation
   defined in timer.css (@keyframes sound-pulse).
   ───────────────────────────────────────────────── */
function setActiveButton(key) {
  /* First clear all buttons, then activate just the one */
  clearActiveButtons();

  sounds[key].btn.classList.add('active');
  sounds[key].btn.setAttribute('aria-pressed', 'true');
}


/* ─────────────────────────────────────────────────
   clearActiveButtons()
   ──────────────────────────────────────────────────
   Removes 'active' class and resets aria-pressed
   on every sound button.
   ───────────────────────────────────────────────── */
function clearActiveButtons() {
  Object.keys(sounds).forEach(function(key) {
    sounds[key].btn.classList.remove('active');
    sounds[key].btn.setAttribute('aria-pressed', 'false');
  });
}


/* ─────────────────────────────────────────────────
   setVolume(value)
   ──────────────────────────────────────────────────
   Called by the volume slider's oninput event.
   'value' is a string from "0" to "1" (the slider range).

   We parse it to a float and apply it to ALL audio
   elements so the volume stays consistent if you
   switch sounds while the slider is mid-way.

   We also update the CSS custom property --fill on
   the slider itself. This drives the green/grey split
   background that visually fills the track left-to-right,
   making it look like a proper designed slider rather
   than the plain browser default.
   ───────────────────────────────────────────────── */
function setVolume(value) {
  const vol = parseFloat(value);   /* convert "0.6" → 0.6 */

  /* Apply to every audio element */
  Object.keys(sounds).forEach(function(key) {
    sounds[key].audio.volume = vol;
  });

  /*
    Update the --fill CSS variable on the slider element.
    The slider background gradient uses this variable:
      background: linear-gradient(to right,
        var(--accent) 0%, var(--accent) var(--fill),
        grey var(--fill), grey 100%
      )
    So moving the thumb to 75% sets --fill to "75%"
    and the green portion grows to match.
  */
  const slider = document.getElementById('volSlider');
  const percent = (vol * 100).toFixed(1) + '%';
  slider.style.setProperty('--fill', percent);
}


/* ─────────────────────────────────────────────────
   INIT — run immediately when script loads
   ──────────────────────────────────────────────────
   Sets the initial volume on all audio elements to
   match the slider's default value (0.6 = 60%).
   This matters because if a user quickly drags the
   slider before clicking a sound, the volume should
   already be correct when playback starts.
   ───────────────────────────────────────────────── */
(function initSoundDeck() {
  const defaultVol = 0.6;

  Object.keys(sounds).forEach(function(key) {
    sounds[key].audio.volume = defaultVol;
  });

  /* Sync the visual fill on the slider to match 60% */
  const slider = document.getElementById('volSlider');
  if (slider) {
    slider.style.setProperty('--fill', '60%');
  }
})();
