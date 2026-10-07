(function() {
  const SUPABASE_URL = "https://api.mibyte.site";
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

  const statsCache = {}; // Caches stats per subject for the active session
// Central Config for All GED Subjects
const SUBJECT_CONFIG = {
  'math': {
    questionsTable: 'questions',
    progressTable: 'user_progress',
    timeText: '90 minutes',
    subjectName: 'Mathematical Reasoning',
    structureText: [
      'This test is administered in one continuous part.',
      'You have access to an on-screen formula sheet and digital calculator throughout the test.',
      'There are no scheduled breaks.'
    ]
  },
  'social-studies': {
    questionsTable: 'social_questions',
    progressTable: 'social_user_progress',
    timeText: '70 minutes',
    subjectName: 'Social Studies',
    structureText: [
      'This test is administered in one continuous part.',
      'You are permitted to use an on-screen calculator or an approved handheld calculator.',
      'There are no scheduled breaks.'
    ]
  },
  'science': {
    questionsTable: 'science_questions',
    progressTable: 'science_user_progress',
    timeText: '90 minutes',
    subjectName: 'Science',
    structureText: [
      'This test is administered in one continuous part.',
      'You have access to an on-screen calculator and a digital Calculator Reference Sheet throughout the entire test.',
      'There are no scheduled breaks.'
    ]
  },
  'rla': {
    questionsTable: 'rla_questions',
    progressTable: 'rla_user_progress',
    timeText: '120 minutes',
    subjectName: 'Reasoning Through Language Arts',
    structureText: [
      'This test includes reading comprehension and language skills assessment.',
      'An Extended Response (essay) section is included.',
      'There is a short break between major sections.'
    ]
  }
};

  // Load Dashboard Stats
async function loadDashboard(subject = 'math', forceRefresh = false) {
  if (!dbClient) return;

  const config = SUBJECT_CONFIG[subject] || SUBJECT_CONFIG['math'];

  // 1. DYNAMICALLY UPDATE UI LABELS & TEXT
  const timeDisplay = document.getElementById('stat-time-limit');
  const titleEl = document.querySelector('.instructions-title');
  const rulesList = document.querySelector('.test-rules');

  if (timeDisplay) timeDisplay.textContent = config.timeText;
  if (titleEl && config.subjectName) titleEl.textContent = `Welcome to the GED® ${config.subjectName} Test.`;
  if (rulesList && config.structureText) {
    rulesList.innerHTML = config.structureText.map(item => `<li>${item}</li>`).join('');
  }

  // 2. CHECK CACHE FIRST
  if (!forceRefresh && statsCache[subject]) {
    renderDashboardUI(statsCache[subject]);
    return; // Stop here, no DB call needed!
  }

  // 3. FETCH FROM SUPABASE IF NOT CACHED
  let dbTotal = 0;
  let statsData = {
    dbTotal: 0,
    totalAttempted: 0,
    correctCount: 0,
    correctPct: 0,
    incorrectPct: 0,
    progPct: 0,
    avgScore: 0
  };

  try {
    // Get total questions count
    const { count, error: qError } = await dbClient
      .from(config.questionsTable)
      .select('*', { count: 'exact', head: true });

    if (!qError) dbTotal = count || 0;
    statsData.dbTotal = dbTotal;

    // Get user progress
    const { data: { session } } = await dbClient.auth.getSession();
    if (session) {
      const { data: progress } = await dbClient
        .from(config.progressTable)
        .select('status')
        .eq('user_id', session.user.id);

      const filteredProgress = progress || [];
      if (filteredProgress.length > 0) {
        statsData.totalAttempted = filteredProgress.length;
        statsData.correctCount = filteredProgress.filter(r => r.status === 'correct').length;
        statsData.correctPct = Math.round((statsData.correctCount / statsData.totalAttempted) * 100);
        statsData.incorrectPct = 100 - statsData.correctPct;
        statsData.progPct = dbTotal > 0 ? Math.min((statsData.totalAttempted / dbTotal) * 100, 100) : 0;
        statsData.avgScore = Math.round((statsData.correctCount / statsData.totalAttempted) * 200);
      }
    }

    // Save result to cache
    statsCache[subject] = statsData;

    // Render UI
    renderDashboardUI(statsData);

  } catch (err) {
    console.error('Error loading dashboard stats:', err);
  }
}

// Separate UI renderer function
function renderDashboardUI(data) {
  document.getElementById('stat-total-q').textContent = data.dbTotal;
  document.getElementById('acc-green').style.width = data.correctPct + '%';
  document.getElementById('acc-red').style.width = data.incorrectPct + '%';
  document.getElementById('pct-correct').textContent = data.correctPct + '%';
  document.getElementById('pct-incorrect').textContent = data.incorrectPct + '%';
  document.getElementById('prog-fill').style.width = data.progPct + '%';
  document.getElementById('prog-label').textContent = `${data.totalAttempted} / ${data.dbTotal} Questions Answered`;
  document.getElementById('stat-avg-score').textContent = `${data.avgScore}`;
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
    // Ensure default test URL is set on load
    if (startButton && !startButton.href.includes('subject=')) {
      startButton.href = 'testpage.html?subject=math';
    }

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

    // FREE MODE: unlock UI logic kept frozen.
    
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

      window.location.href = startButton.href;
    }

    startButton.addEventListener('click', startMathTest);
    
    if (closeUnlockModal) {
        closeUnlockModal.addEventListener('click', () => {
            if (unlockModal) unlockModal.hidden = true;
        });
    }

    if (telegramPurchaseLink) {
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
    }

    if (unlockModal) {
        unlockModal.addEventListener('click', (event) => {
          if (event.target === unlockModal) unlockModal.hidden = true;
        });
    }

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && unlockModal && !unlockModal.hidden) unlockModal.hidden = true;
    });
  }

  window.addEventListener('load', () => {
    loadDashboard('math'); // Default load
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
        
        // NEW: Update the Start Button's link dynamically
        const startButton = document.getElementById('start-btn');
        if(startButton) {
          startButton.href = `testpage.html?subject=${selectedSubject}`;
        }

        // NEW: Reload the stats for the newly selected subject
        loadDashboard(selectedSubject); 
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