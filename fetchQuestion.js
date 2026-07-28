const SUPABASE_URL = "https://qyzsymedekmekgosykik.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF5enN5bWVkZWttZWtnb3N5a2lrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzNTM3MTksImV4cCI6MjA5OTkyOTcxOX0.H7cgkvW2gCIX2DiNePoU8hImQI8k6Fo2NK148uC5pPU";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TEST_LIMIT = 40;
const MARKS_PER_QUESTION = 5; 
const TIME_LIMIT_SECONDS = 115 * 60; // 1 hour 55 minutes
const STORAGE_KEY = 'ged_active_test_session';

let questions = [];
let userAnswers = []; 
let questionStatuses = []; // Will hold "correct", "incorrect", or "unanswered"
let currentIndex = 0;
let timeLeft = TIME_LIMIT_SECONDS;
let targetEndTime = 0;
let timerInterval;

// DOM Elements
const quizView = document.getElementById('quiz-view');
const reviewView = document.getElementById('review-view');
const optionsContainer = document.getElementById('options-container');

// ==========================================
// SESSION PERSISTENCE HELPERS
// ==========================================
function saveTestSession() {
  const sessionData = {
    isCompleted: false,
    questions,
    userAnswers,
    currentIndex,
    targetEndTime
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionData));
}

function clearTestSession() {
  localStorage.removeItem(STORAGE_KEY);
}

// Timer display
function startTimer(endTime) {
  targetEndTime = endTime;
  if (timerInterval) clearInterval(timerInterval);

  timerInterval = setInterval(() => {
    const now = Date.now();
    timeLeft = Math.max(0, Math.floor((targetEndTime - now) / 1000));

    const h = Math.floor(timeLeft / 3600);
    const m = Math.floor((timeLeft % 3600) / 60);
    const s = timeLeft % 60;
    
    document.getElementById('timer-text').textContent = 
      `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      submitTest(true); // Auto-submit when time is up
    }
  }, 1000);
}

// ==========================================
// HELPERS & DECODER
// ==========================================
function decodeEntities(str) {
  if (!str) return '';
  const txt = document.createElement('textarea');
  txt.innerHTML = str;
  return txt.value;
}

function showCustomConfirm(missingQuestions) {
  return new Promise((resolve) => {
    const modal = document.getElementById('custom-modal');
    const listEl = document.getElementById('modal-missing-list');
    const countEl = document.getElementById('modal-missing-count');
    const confirmBtn = document.getElementById('modal-confirm-btn');
    const cancelBtn = document.getElementById('modal-cancel-btn');
    
    countEl.textContent = missingQuestions.length;
    listEl.textContent = missingQuestions.join(', ');
    
    modal.style.display = 'flex';
    
    const cleanup = () => {
      modal.style.display = 'none';
      confirmBtn.onclick = null;
      cancelBtn.onclick = null;
    };
    
    confirmBtn.onclick = () => { cleanup(); resolve(true); };
    cancelBtn.onclick = () => { cleanup(); resolve(false); };
  });
}

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function getOptionsArray(rawOptions) {
  if (Array.isArray(rawOptions)) return rawOptions;
  if (typeof rawOptions === 'string') {
    try { return JSON.parse(rawOptions); } catch (e) { return []; }
  }
  return [];
}

// Check Correctness Logic
function checkIsCorrect(userAns, correctVal) {
  if (!userAns) return false;
  const strCorrect = String(correctVal).trim().toUpperCase();
  return (
    userAns.text.trim().toUpperCase() === strCorrect ||
    userAns.letter.toUpperCase() === strCorrect ||
    String(userAns.index) === strCorrect
  );
}

// 1. Init Quiz (With Resume Logic, Category Ratios & No Repeats)
async function initQuiz() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) {
    document.getElementById('question-text').textContent = 'Please log in.';
    window.location.href = '/register.html';
    return;
  }

  // A. Check for active session in localStorage
  const savedSession = localStorage.getItem(STORAGE_KEY);
  if (savedSession) {
    try {
      const parsed = JSON.parse(savedSession);

      // If user refreshed while viewing completed test results
      if (parsed.isCompleted) {
        questions = parsed.questions || [];
        userAnswers = parsed.userAnswers || [];
        questionStatuses = parsed.questionStatuses || [];

        const correctCount = questionStatuses.filter(s => s === 'correct').length;
        document.getElementById('score-text').textContent = `Score: ${parsed.totalScore} / 200 (${correctCount} out of ${questions.length} correct)`;

        quizView.style.display = 'none';
        reviewView.style.display = 'block';
        renderReviewGrid();
        return;
      }

      const remainingMs = parsed.targetEndTime - Date.now();

      // If time hasn't run out and questions exist, restore session
      if (remainingMs > 0 && parsed.questions && parsed.questions.length > 0) {
        questions = parsed.questions;
        userAnswers = parsed.userAnswers || new Array(questions.length).fill(null);
        currentIndex = parsed.currentIndex || 0;

        startTimer(parsed.targetEndTime);
        renderCurrentQuestion();
        return; // Successfully restored active session
      } else {
        clearTestSession(); // Expired session
      }
    } catch (e) {
      console.error("Failed to restore session:", e);
      clearTestSession();
    }
  }

  // B. Generate New Test if no valid saved session
  const { data: progressData } = await supabaseClient
    .from('user_progress')
    .select('question_id')
    .eq('user_id', user.id);

  const seenIds = progressData ? progressData.map(row => row.question_id) : [];

  let query = supabaseClient.from('questions').select('*');
  if (seenIds.length > 0) {
    query = query.not('id', 'in', `(${seenIds.join(',')})`);
  }

  const { data: availableQuestions, error } = await query;

  if (error || !availableQuestions || availableQuestions.length === 0) {
    document.getElementById('question-text').textContent = 'No new questions available! You have completed all database questions.';
    return;
  }

  const categorized = {
    'equations': [],
    'graphs': [],
    'basic': [],
    'geometry': [],
    'other': []
  };

  availableQuestions.forEach(q => {
    const cat = (q.category || '').toLowerCase().trim();
    if (categorized[cat]) {
      categorized[cat].push(q);
    } else {
      categorized['other'].push(q);
    }
  });

  for (let key in categorized) {
    categorized[key] = shuffleArray(categorized[key]);
  }

  const targets = {
    'equations': 12,
    'graphs': 4,
    'basic': 12,
    'geometry': 12
  };

  let finalSelection = [];

  for (let cat in targets) {
    const needed = targets[cat];
    const selectedForCat = categorized[cat].splice(0, needed);
    finalSelection.push(...selectedForCat);
  }

  if (finalSelection.length < TEST_LIMIT) {
    let leftoverQuestions = [];
    for (let key in categorized) {
      leftoverQuestions.push(...categorized[key]);
    }
    leftoverQuestions = shuffleArray(leftoverQuestions);
    const missingCount = TEST_LIMIT - finalSelection.length;
    finalSelection.push(...leftoverQuestions.slice(0, missingCount));
  }

  questions = shuffleArray(finalSelection);
  userAnswers = new Array(questions.length).fill(null);
  currentIndex = 0;
  
  const endTime = Date.now() + (TIME_LIMIT_SECONDS * 1000);
  startTimer(endTime);
  saveTestSession();
  renderCurrentQuestion();
}

// 2. Render Quiz Question
function renderCurrentQuestion() {
  const current = questions[currentIndex];
  document.getElementById('question-text').textContent = decodeEntities(current.question);
  
  const qImg = document.getElementById('question-image');
  if (current.image_url && current.image_url.trim() !== '') {
    qImg.src = current.image_url;
    qImg.style.display = 'block';
  } else {
    qImg.src = '';
    qImg.style.display = 'none';
  }
  
  const optionsList = getOptionsArray(current.options);
  const letters = ['A', 'B', 'C', 'D'];
  
  optionsContainer.innerHTML = '';
  letters.forEach((letter, idx) => {
    if (!optionsList[idx]) return;
    
    const decodedOptionText = decodeEntities(optionsList[idx]);
    const isChecked = userAnswers[currentIndex] && userAnswers[currentIndex].letter === letter;
    
    const optionDiv = document.createElement('div');
    optionDiv.className = 'option';
    optionDiv.innerHTML = `
      <input type="radio" name="quiz-option" value="${letter}" ${isChecked ? 'checked' : ''} style="pointer-events: none;">
      <span class="option-text">${decodedOptionText}</span>
    `;

    optionDiv.addEventListener('click', () => {
      const input = optionDiv.querySelector('input');
      const saved = userAnswers[currentIndex];
      
      if (saved && saved.letter === letter) {
        input.checked = false;
        userAnswers[currentIndex] = null;
      } else {
        document.querySelectorAll('input[name="quiz-option"]').forEach(r => r.checked = false);
        input.checked = true;
        userAnswers[currentIndex] = { letter: letter, index: idx, text: decodedOptionText };
      }
      
      saveTestSession();
    });

    optionsContainer.appendChild(optionDiv);
  });

  const total = questions.length;
  const currentNum = currentIndex + 1;
  const percentage = Math.round((currentNum / total) * 100);

  document.getElementById('progress-text').textContent = `Question ${currentNum} of ${total}`;
  document.getElementById('progress-fill').style.width = `${percentage}%`;

  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  prevBtn.disabled = currentIndex === 0;
  
  // FIX: Shows "Finish Test" ONLY on the last question
  nextBtn.textContent = currentIndex === total - 1 ? 'Finish Test' : 'Next Question';

  if (window.MathJax) {
    MathJax.typeset();
  }
}

// Save Progress to database
async function saveTestProgress() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;

  const progressRows = questions.map((q, idx) => ({
    user_id: user.id,
    question_id: q.id,
    status: questionStatuses[idx],
    updated_at: new Date().toISOString()
  }));

  const { error } = await supabaseClient
    .from('user_progress')
    .upsert(progressRows, { onConflict: 'user_id, question_id' });

  if (error) console.error("Error saving progress:", error);
}

// 3. Submit Test
async function submitTest(forceSubmit = false) {
  if (!forceSubmit) {
    const missing = userAnswers.map((ans, idx) => ans ? null : idx + 1).filter(v => v !== null);
    if (missing.length > 0) {
      const userConfirmed = await showCustomConfirm(missing);
      if (!userConfirmed) {
        currentIndex = missing[0] - 1;
        saveTestSession();
        renderCurrentQuestion();
        return;
      }
    }
  }

  clearInterval(timerInterval);
  
  let correctCount = 0;
  questionStatuses = [];

  questions.forEach((q, idx) => {
    const ans = userAnswers[idx];
    if (!ans) {
      questionStatuses.push('unanswered');
    } else if (checkIsCorrect(ans, q.correct_answer)) {
      correctCount++;
      questionStatuses.push('correct');
    } else {
      questionStatuses.push('incorrect');
    }
  });

  await saveTestProgress();

  const totalScore = correctCount * MARKS_PER_QUESTION;
  
  // FIX: Save completed session so refresh stays on review screen
  const completedSession = {
    isCompleted: true,
    questions,
    userAnswers,
    questionStatuses,
    totalScore
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(completedSession));

  document.getElementById('score-text').textContent = `Score: ${totalScore} / 200 (${correctCount} out of ${questions.length} correct)`;

  quizView.style.display = 'none';
  reviewView.style.display = 'block';
  
  renderReviewGrid();
}

// 4. Render the Review Grid
function renderReviewGrid() {
  const gridContainer = document.getElementById('review-grid');
  gridContainer.innerHTML = '';

  questionStatuses.forEach((status, idx) => {
    const btn = document.createElement('button');
    btn.className = `grid-btn bg-${status}`;
    btn.textContent = idx + 1;
    
    btn.addEventListener('click', () => {
      renderReviewQuestion(idx);
    });
    
    gridContainer.appendChild(btn);
  });
}

// 5. Render a specific question in Review Mode
function renderReviewQuestion(index) {
  const detailArea = document.getElementById('review-detail-area');
  detailArea.style.display = 'block';
  
  const q = questions[index];
  const userAns = userAnswers[index];
  
  document.getElementById('review-q-num').textContent = `Reviewing Question ${index + 1}`;
  document.getElementById('review-question-text').textContent = decodeEntities(q.question);

  const revQImg = document.getElementById('review-question-image');
  if (q.image_url && q.image_url.trim() !== '') {
    revQImg.src = q.image_url;
    revQImg.style.display = 'block';
  } else {
    revQImg.src = '';
    revQImg.style.display = 'none';
  }

  const optionsList = getOptionsArray(q.options);
  const container = document.getElementById('review-options-container');
  container.innerHTML = '';

  const letters = ['A', 'B', 'C', 'D'];
  
  letters.forEach((letter, idx) => {
    if (!optionsList[idx]) return;

    const decodedOptionText = decodeEntities(optionsList[idx]);
    const div = document.createElement('div');
    div.className = 'option';
    
    const isThisOptionCorrect = checkIsCorrect({text: decodedOptionText, letter: letter, index: idx}, q.correct_answer);
    const didUserPickThis = userAns && userAns.letter === letter;

    if (isThisOptionCorrect) {
      div.classList.add('correct-ans');
      div.innerHTML = `✅ <strong>${letter}:</strong> &nbsp; ${decodedOptionText} <span style="margin-left:auto; color:#10b981; font-weight:bold;">(Correct Answer)</span>`;
    } else if (didUserPickThis) {
      div.classList.add('wrong-ans');
      div.innerHTML = `❌ <strong>${letter}:</strong> &nbsp; ${decodedOptionText} <span style="margin-left:auto; color:#ef4444; font-weight:bold;">(Your Answer)</span>`;
    } else {
      div.innerHTML = `<strong>${letter}:</strong> &nbsp; ${decodedOptionText}`;
    }

    container.appendChild(div);
  });

  const expBox = document.getElementById('explanation-text');
  if (q.explanation && q.explanation.trim() !== '') {
    expBox.textContent = decodeEntities(q.explanation);
  } else {
    expBox.textContent = "No explanation provided for this question.";
  }

  const expImg = document.getElementById('explanation-image');
  if (q.fb_image && q.fb_image.trim() !== '') {
    expImg.src = q.fb_image;
    expImg.style.display = 'block';
  } else {
    expImg.src = '';
    expImg.style.display = 'none';
  }

  detailArea.scrollIntoView({ behavior: 'smooth' });

  if (window.MathJax) {
    MathJax.typeset();
  }
}

document.getElementById('back-to-grid-btn').addEventListener('click', () => {
  document.getElementById('review-view').scrollIntoView({ behavior: 'smooth' });
});

// Quiz Nav Buttons
document.getElementById('next-btn').addEventListener('click', () => {
  if (currentIndex < questions.length - 1) {
    currentIndex++;
    saveTestSession();
    renderCurrentQuestion();
  } else {
    submitTest();
  }
});

document.getElementById('prev-btn').addEventListener('click', () => {
  if (currentIndex > 0) {
    currentIndex--;
    saveTestSession();
    renderCurrentQuestion();
  }
});

// Explicit "Finish Test" button
document.getElementById('finish-test-btn').addEventListener('click', () => {
  submitTest();
});

// Navigation from Review View
document.getElementById('dashboard-btn').addEventListener('click', () => {
  clearTestSession();
  window.location.href = 'mainpage.html'; 
});

document.getElementById('start-new-test-btn').addEventListener('click', () => {
  clearTestSession();
  window.location.reload();
});

initQuiz();