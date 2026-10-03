(function() {
  const SUPABASE_URL = "https://mibyte.site";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF5enN5bWVkZWttZWtnb3N5a2lrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzNTM3MTksImV4cCI6MjA5OTkyOTcxOX0.H7cgkvW2gCIX2DiNePoU8hImQI8k6Fo2NK148uC5pPU";

  let dbClient;

  try {
    if (window.supabase) {
      dbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
  } catch (err) {
    console.error("Initialization error:", err);
  }

  
  // AUTHENTICATION GUARD
  // This keeps direct URL access protected, while the paid access gate remains frozen.
  async function checkAuth() {
    if (!dbClient) return;

    const { data: { user } } = await dbClient.auth.getUser();
    if (!user) {
      window.location.href = '/register.html';
      return;
    }
  }

  // Run the check immediately
  checkAuth();
  // ==========================================

  async function loadDashboard() {
    if (!dbClient) return;

    let dbTotal = 0;

    // A. Fetch Questions Count
    try {
      const { count, error: qError } = await dbClient
        .from('questions')
        .select('*', { count: 'exact', head: true });

      if (qError) {
        document.getElementById('stat-total-q').textContent = "ERR";
      } else {
        dbTotal = count || 0;
        document.getElementById('stat-total-q').textContent = dbTotal;
      }
    } catch (err) {
      console.error(err);
    }

    // B. Fetch User Stats
    try {
      const { data: { session } } = await dbClient.auth.getSession();

      if (!session) {
        document.getElementById('prog-label').textContent = `0 / ${dbTotal} Questions Answered`;
        return;
      }

      const { data: progress, error: pError } = await dbClient
        .from('user_progress')
        .select('status')
        .eq('user_id', session.user.id);

      if (pError) {
        document.getElementById('prog-label').textContent = `Stats Blocked`;
        return;
      }

      if (progress && progress.length > 0) {
        const totalAttempted = progress.length;
        const correctCount = progress.filter(r => r.status === 'correct').length;
        const correctPct = Math.round((correctCount / totalAttempted) * 100);
        const incorrectPct = 100 - correctPct;

        document.getElementById('acc-green').style.width = correctPct + '%';
        document.getElementById('acc-red').style.width = incorrectPct + '%';
        document.getElementById('pct-correct').textContent = correctPct + '%';
        document.getElementById('pct-incorrect').textContent = incorrectPct + '%';

        const progPct = dbTotal > 0 ? Math.min((totalAttempted / dbTotal) * 100, 100) : 0;
        document.getElementById('prog-fill').style.width = progPct + '%';
        document.getElementById('prog-label').textContent = `${totalAttempted} / ${dbTotal} Questions Answered`;

        // Average score = (Total Correct Marks / Total Answered Questions) * 200 scaled
        const avgScore = Math.round((correctCount / totalAttempted) * 200);
        document.getElementById('stat-avg-score').textContent = `${avgScore}`;
      } else {
        document.getElementById('prog-label').textContent = `0 / ${dbTotal} Questions Answered`;
      }

    } catch (err) {
      console.error(err);
    }
  }

  function setupUIHandlers() {
    const themeBtn = document.getElementById('theme-btn');
    if (localStorage.getItem('theme') === 'dark') {
      document.body.setAttribute('data-theme', 'dark');
      themeBtn.textContent = '☀️';
    }
    themeBtn.addEventListener('click', () => {
      const isDark = document.body.getAttribute('data-theme') === 'dark';
      document.body.setAttribute('data-theme', isDark ? '' : 'dark');
      themeBtn.textContent = isDark ? '🌙' : '☀️';
      localStorage.setItem('theme', isDark ? 'light' : 'dark');
    });

    document.getElementById('hamburger').addEventListener('click', () => {
      document.getElementById('mobile-menu').classList.toggle('open');
    });

    async function logout(e) {
      e.preventDefault();
      if(dbClient) await dbClient.auth.signOut();
      window.location.href = "loginpage.html"; 
    }
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('logout-mobile').addEventListener('click', logout);

    const startButton = document.getElementById('start-btn'); 
    const unlockModal = document.getElementById('unlock-modal');
    const closeUnlockModal = document.getElementById('unlock-modal-close');
    const telegramPurchaseLink = document.getElementById('telegram-purchase-link');

    const redeemSubmitBtn = document.getElementById('redeem-math-code');
    const redeemInput = document.getElementById('math-activation-code');
    const redeemErrorMsg = document.getElementById('redeem-error-msg');
    
    // Elements for switching views
    const defaultContent = document.getElementById('unlock-default-content');
    const successContent = document.getElementById('unlock-success-content');
    const successOkBtn = document.getElementById('unlock-success-ok');

    // FREE MODE: keep the old unlock UI logic in comments so it can be re-enabled later.
    // The code below is frozen to prevent paid gating for regular users.
    //
    // redeemInput.addEventListener('input', () => {
    //   redeemErrorMsg.style.display = 'none';
    // });
    //
    // redeemSubmitBtn.addEventListener('click', async (e) => {
    //   e.preventDefault();
    //   const code = redeemInput.value.trim();
    //   redeemErrorMsg.style.display = 'none';
    //   if (!code) {
    //     redeemErrorMsg.textContent = "Invalid code please enter the code provided from telegram bot";
    //     redeemErrorMsg.style.display = 'block';
    //     return;
    //   }
    //   const originalText = redeemSubmitBtn.textContent;
    //   redeemSubmitBtn.textContent = "Verifying..."; 
    //   redeemSubmitBtn.disabled = true;
    //   const { data, error } = await dbClient.rpc('redeem_access_code', { entered_code: code });
    //   redeemSubmitBtn.textContent = originalText;
    //   redeemSubmitBtn.disabled = false;
    //   if (error) {
    //     console.error("RPC Error:", error);
    //     redeemErrorMsg.textContent = "Network error verifying code.";
    //     redeemErrorMsg.style.display = 'block';
    //     return;
    //   }
    //   if (data.success) {
    //     defaultContent.style.display = 'none';
    //     successContent.style.display = 'block';
    //     document.getElementById('unlock-modal-close').style.display = 'none';
    //   } else {
    //     redeemErrorMsg.textContent = data.message; 
    //     redeemErrorMsg.style.display = 'block';
    //   }
    // });
    //
    // successOkBtn.addEventListener('click', () => {
    //   setUnlockModalOpen(false);
    // });
    //
    // function setUnlockModalOpen(isOpen) {
    //   unlockModal.hidden = !isOpen;
    //   if (isOpen) {
    //     closeUnlockModal.focus();
    //   } else {
    //     startButton.focus();
    //   }
    // }

   async function startMathTest(event) {
  event.preventDefault();

  if (!dbClient) {
    console.error('Supabase client is unavailable.');
    return;
  }

  // 1. Check Authentication
  const { data: { user }, error: userError } = await dbClient.auth.getUser();
  if (userError || !user) {
    window.location.href = 'loginpage.html';
    return;
  }

  // FREE MODE: paying checks are frozen so unpaid users can still enter the test.
  // Original paid-access gate kept below for reference and to be re-enabled later.
  // const { data: access, error: accessError } = await dbClient
  //   .from('user_access')
  //   .select('math_unlocked')
  //   .eq('user_id', user.id)
  //   .maybeSingle();
  //
  // if (accessError) {
  //   console.error('Unable to check Math access:', accessError);
  //   setUnlockModalOpen(true);
  //   return;
  // }
  //
  // if (access?.math_unlocked === true) {
  //   window.location.href = startButton.href;
  //   return;
  // }
  //
  // const { count: totalAttempted, error: progressError } = await dbClient
  //   .from('user_progress')
  //   .select('*', { count: 'exact', head: true })
  //   .eq('user_id', user.id);
  //
  // if (progressError) {
  //   console.error('Unable to verify user progress count:', progressError);
  //   setUnlockModalOpen(true);
  //   return;
  // }
  //
  // const answeredCount = totalAttempted || 0;
  // if (answeredCount < 80) {
  //   window.location.href = startButton.href;
  //   return;
  // }
  //
  // setUnlockModalOpen(true);

  window.location.href = startButton.href;
}

    startButton.addEventListener('click', startMathTest);
    closeUnlockModal.addEventListener('click', () => setUnlockModalOpen(false));
    telegramPurchaseLink.addEventListener('click', (event) => {
      event.preventDefault();

      let appOpened = false;
      const cancelFallback = () => {
        appOpened = true;
      };
      window.addEventListener('blur', cancelFallback, { once: true });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) cancelFallback();
      }, { once: true });

      window.location.href = 'tg://resolve?domain=AuxiliusBot';
      window.setTimeout(() => {
        if (!appOpened) window.location.href = 'https://t.me/AuxiliusBot';
      }, 1200);
    });
    unlockModal.addEventListener('click', (event) => {
      if (event.target === unlockModal) setUnlockModalOpen(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !unlockModal.hidden) setUnlockModalOpen(false);
    });
  }

  window.addEventListener('load', () => {
    loadDashboard();
    setupUIHandlers();
  });


// Sidebar Expand/Collapse
const sidebar = document.getElementById('app-sidebar');
const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');

if(sidebarToggleBtn) {
  sidebarToggleBtn.addEventListener('click', () => {
    sidebar.classList.toggle('expanded');
  });
}

// Subject Switching Logic

const themeColors = {
  math: '#177894',        // GED Math Blue
  science: '#D2361C',     // Science light red
  rla: '#6F5375',         // RLA Purple
  'social-studies': '#3B7B49' // Social Studies light green
};

// Clean display names for headers
const subjectNames = {
  math: 'Math',
  science: 'Science',
  rla: 'RLA ER Analyzer',
  'social-studies': 'Social Studies'
};

const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
const standardView = document.getElementById('standard-view');
const rlaView = document.getElementById('rla-view');

// Both header targets
const activeHeader = document.getElementById('active-subject-header'); // Top navbar
const subjectTitle = document.getElementById('subject-title-display');  // Main card title

navItems.forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    
    // 1. Move the Active Pill
    navItems.forEach(nav => nav.classList.remove('active'));
    item.classList.add('active');

    const selectedSubject = item.getAttribute('data-subject');
    const displayName = subjectNames[selectedSubject] || selectedSubject;

    // 2. Dynamically update CSS Theme Color
    if (themeColors[selectedSubject]) {
      document.documentElement.style.setProperty('--theme-color', themeColors[selectedSubject]);
    }

    // 3. Update Top Navbar Header
    if (activeHeader) {
      activeHeader.textContent = displayName;
    }

    // 4. Cross-Fade Views & Update Banner Title
    if (selectedSubject === 'rla') {
      switchView(standardView, rlaView);
    } else {
      switchView(rlaView, standardView);
      if (subjectTitle) {
        subjectTitle.innerText = displayName;
      }
      
      // TODO: Call your Supabase fetch function here to update Math/Science stats!
    }
  });
});

function switchView(hideContainer, showContainer) {
  if (!hideContainer || !showContainer || hideContainer.classList.contains('hidden')) return; 

  hideContainer.classList.remove('active-view');
  
  setTimeout(() => {
    hideContainer.classList.add('hidden');
    showContainer.classList.remove('hidden');
    
    requestAnimationFrame(() => {
      showContainer.classList.add('active-view');
    });
  }, 250); 
}


})();
