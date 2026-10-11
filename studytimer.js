// studytimer.js - Global Active Time Tracker (With Idle Detection)
(function () {
    let activeSeconds = 0;
    let timerInterval = null;
    const SYNC_INTERVAL = 120; // Sync to Supabase every 120 seconds
    
    let lastActivityTime = Date.now();
    const IDLE_TIMEOUT_MS = 120000; // 2 minutes (120 seconds) of inactivity threshold

    // Track user interaction events
    ['mousemove', 'keydown', 'mousedown', 'scroll', 'touchstart'].forEach(event => {
        window.addEventListener(event, () => {
            lastActivityTime = Date.now();
        }, { passive: true });
    });

    // Sync accumulated seconds to Supabase
    async function syncStudyTime() {
        if (activeSeconds <= 0) return;

        if (typeof supabaseClient === 'undefined') {
            console.error('ERROR: supabaseClient is not defined! The timer cannot talk to the database.');
            return;
        }

        const secondsToSync = activeSeconds;
        activeSeconds = 0; // Reset local counter immediately to prevent double-syncing

        try {
            const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
            
            if (authError || !user) {
                console.warn('No user logged in. Timer sync skipped.');
                // Do not re-add seconds to activeSeconds if unauthenticated to prevent loops
                return;
            }

            const { error } = await supabaseClient.rpc('increment_study_time', {
                p_user_id: user.id,
                p_seconds: secondsToSync
            });

            if (error) {
                console.error('Supabase RPC Error:', error.message);
                // Only restore time if it was a temporary network glitch, capped safely
                activeSeconds += Math.min(secondsToSync, 300); 
            }

        } catch (err) {
            console.error('Critical crash while syncing time:', err);
        }
    }

    // Start tracking loop
    function startTimer() {
        if (timerInterval) return;
      
        timerInterval = setInterval(() => {
            const now = Date.now();
            const isIdle = (now - lastActivityTime) > IDLE_TIMEOUT_MS;

            // Only increment if tab is visible AND user is actively interacting
            if (!document.hidden && !isIdle) {
                activeSeconds++;
                
                if (activeSeconds >= SYNC_INTERVAL) {
                    syncStudyTime();
                }
            }
        }, 1000);
    }

    // Sync immediately when user switches tabs or leaves
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            syncStudyTime();
        } else {
            // Reset activity timer when user returns
            lastActivityTime = Date.now();
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