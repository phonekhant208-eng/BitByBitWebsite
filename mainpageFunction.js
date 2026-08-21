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
      window.location.href = "loginpage.html"; // Ensure this matches your login file name
    }
    document.getElementById('logout-btn').addEventListener('click', logout);
    document.getElementById('logout-mobile').addEventListener('click', logout);
  }

  window.addEventListener('load', () => {
    loadDashboard();
    setupUIHandlers();
  });
})();
