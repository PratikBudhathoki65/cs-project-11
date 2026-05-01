/* =================================================
   COREDECK — timer-persistence.js
   The Single Source of Truth for Global State
   ================================================= */

window.TimerPersistence = (function() {
  const STORAGE_KEY = 'coredeck_global_state';

  return {
    /**
     * Saves a full state object to localStorage.
     * @param {Object} newState - The object to save.
     */
    save: function(newState) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
    },

    /**
     * Loads the current state from localStorage.
     * @returns {Object|null}
     */
    load: function() {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : null;
    },

    /**
     * Merges new data into the existing state without overwriting everything.
     * Essential for syncing Audio and Timer separately.
     * @param {Object} patch - The partial object to merge.
     */
    patch: function(patch) {
      const current = this.load() || {};
      const updated = { ...current, ...patch };
      this.save(updated);
    },

    /**
     * Wipes all global state (used on Reset).
     */
    clear: function() {
      localStorage.removeItem(STORAGE_KEY);
    }
  };
})();