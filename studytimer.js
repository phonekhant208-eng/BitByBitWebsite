// studyTimer.js - Global Active Time Tracker
(function () {
    let activeSeconds = 0;
    let timerInterval = null;
    const SYNC_INTERVAL = 30; // Sync to Supabase every 30 seconds

    // Helper to get initialized Supabase client
    function getSupabase() {
        return window.supabaseClient || (window.supabase && window.supabase.createClient ? window.supabase : null);
    }

    // Sync accumulated seconds to Supabase
    async function syncStudyTime() {
        if (activeSeconds <= 0) return;

        const client = getSupabase();
        if (!client) return;

        const secondsToSync = activeSeconds;
        activeSeconds = 0; // Reset local counter prior to async call

        try {
            const { data: { user } } = await client.auth.getUser();
            if (user) {
                await client.rpc('increment_study_time', {
                    p_user_id: user.id,
                    p_seconds: secondsToSync
                });
            } else {
                // If user is not logged in, restore count
                activeSeconds += secondsToSync;
            }
        } catch (err) {
            console.error('Failed to sync study time:', err);
            // Restore count if request failed
            activeSeconds += secondsToSync;
        }
    }

    // Start tracking
    function startTimer() {
        if (timerInterval) return;
        timerInterval = setInterval(() => {
            // Only count time if tab is actively focused/visible
            if (!document.hidden) {
                activeSeconds++;
                if (activeSeconds >= SYNC_INTERVAL) {
                    syncStudyTime();
                }
            }
        }, 1000);
    }

    // Pause tracking when tab is hidden or user leaves
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            syncStudyTime(); // Save current time before pausing
        }
    });

    // Save remaining seconds when leaving the page
    window.addEventListener('pagehide', () => {
        syncStudyTime();
    });

    // Initialize timer on load
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        startTimer();
    } else {
        document.addEventListener('DOMContentLoaded', startTimer);
    }
})();