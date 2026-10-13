// studytimer.js - Global Active Time Tracker with 2-Hour Background Grace Period
(function () {
    let activeSeconds = 0;
    let timerInterval = null;
    const SYNC_INTERVAL = 120; // Sync to Supabase every 120 seconds
    const MAX_BACKGROUND_SECONDS = 7200; // 2 hours hard stop (2 * 60 * 60)

    let lastActiveTimestamp = Date.now();
    let isTracking = true;

    // Sync accumulated seconds to Supabase
    async function syncStudyTime() {
        if (activeSeconds <= 0) return;

        if (typeof supabaseClient === 'undefined') {
            console.error('ERROR: supabaseClient is not defined! The timer cannot talk to the database.');
            return;
        }

        const secondsToSync = activeSeconds;
        activeSeconds = 0; // Reset local counter

        try {
            const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
            
            if (authError || !user) {
                console.warn('No user logged in. Timer paused.');
                activeSeconds += secondsToSync; // Restore time
                return;
            }

            const { error } = await supabaseClient.rpc('increment_study_time', {
                p_user_id: user.id,
                p_seconds: secondsToSync
            });

            if (error) {
                console.error('Supabase RPC Error:', error.message);
                activeSeconds += secondsToSync; // Restore time if failed
            }
        } catch (err) {
            console.error('Critical crash while syncing time:', err);
            activeSeconds += secondsToSync;
        }
    }

    // Main tick handler using timestamps to prevent browser background throttling
    function handleTick() {
        if (!isTracking) return;

        const now = Date.now();
        const elapsedSeconds = Math.floor((now - lastActiveTimestamp) / 1000);
        lastActiveTimestamp = now;

        if (document.hidden) {
            // User is away (minimized or switched tab)
            if (activeSeconds >= MAX_BACKGROUND_SECONDS) {
                // Hit the 2-hour limit -> Stop tracking
                isTracking = false;
                syncStudyTime();
                console.log('Study timer stopped: Exceeded 2 hours of background inactivity.');
                return;
            }
        }

        // Add elapsed time (works whether tab is active or in background up to 2 hours)
        activeSeconds += elapsedSeconds;

        // Sync every 120 seconds
        if (activeSeconds >= SYNC_INTERVAL) {
            syncStudyTime();
        }
    }

    // Start tracking loop
    function startTimer() {
        if (timerInterval) return;

        lastActiveTimestamp = Date.now();
        isTracking = true;

        // Tick every second, but calculate real time via timestamps
        timerInterval = setInterval(handleTick, 1000);
    }

    // Handle tab visibility changes
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            // User came back! Reset timestamp so background counting resets/resumes cleanly
            lastActiveTimestamp = Date.now();
            if (!isTracking) {
                isTracking = true; // Resume if it was stopped by the 2-hour cap
            }
        } else {
            // Switched away: Sync immediately to save current progress, but keep tracking
            syncStudyTime();
            lastActiveTimestamp = Date.now();
        }
    });

    window.addEventListener('pagehide', () => {
        syncStudyTime();
    });

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        startTimer();
    } else {
        document.addEventListener('DOMContentLoaded', startTimer);
    }
})();