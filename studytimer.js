// studytimer.js - Global Active Time Tracker (DEBUG MODE)
(function () {
    let activeSeconds = 0;
    let timerInterval = null;
    const SYNC_INTERVAL = 30; // Sync to Supabase every 30 seconds

    

    // Sync accumulated seconds to Supabase
    async function syncStudyTime() {
        if (activeSeconds <= 0) return;

        // 1. Check if supabaseClient exists from your mainpageFunction.js
        if (typeof supabaseClient === 'undefined') {
            console.error(' ERROR: supabaseClient is not defined! The timer cannot talk to the database.');
            return;
        }

        const secondsToSync = activeSeconds;
        activeSeconds = 0; // Reset local counter

        try {
            // 2. Get the current logged-in user
            const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
            
            if (authError || !user) {
                console.warn(' No user logged in. Timer paused.');
                activeSeconds += secondsToSync; // Restore time
                return;
            }

            
            
            // 3. Call the RPC function
            const { error } = await supabaseClient.rpc('increment_study_time', {
                p_user_id: user.id,
                p_seconds: secondsToSync
            });

            if (error) {
                console.error('  Supabase RPC Error:', error.message);
                activeSeconds += secondsToSync; // Restore time if failed
            } else {
               
            }

        } catch (err) {
            console.error(' Critical crash while syncing time:', err);
            activeSeconds += secondsToSync;
        }
    }

    // Start tracking
    function startTimer() {
        if (timerInterval) return;
      
        timerInterval = setInterval(() => {
            if (!document.hidden) {
                activeSeconds++;
                // Log every 5 seconds so we don't spam the console too much
                if (activeSeconds % 5 === 0) {
                  
                }
                
                if (activeSeconds >= SYNC_INTERVAL) {
                    syncStudyTime();
                }
            } else {
                
            }
        }, 1000);
    }

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) syncStudyTime();
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