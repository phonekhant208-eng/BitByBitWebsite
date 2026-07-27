const SUPABASE_URL = "https://qyzsymedekmekgosykik.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF5enN5bWVkZWttZWtnb3N5a2lrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzNTM3MTksImV4cCI6MjA5OTkyOTcxOX0.H7cgkvW2gCIX2DiNePoU8hImQI8k6Fo2NK148uC5pPU";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TEST_LIMIT = 40;
const MARKS_PER_QUESTION = 5; 
const TIME_LIMIT_SECONDS = 115 * 60; // 1 hour 55 minutes

let questions = [];
let userAnswers = []; 
let questionStatuses = []; // Will hold "correct", "incorrect", or "unanswered"
let currentIndex = 0;
let timeLeft = TIME_LIMIT_SECONDS;
let timerInterval;

// DOM Elements
const quizView = document.getElementById('quiz-view');
const reviewView = document.getElementById('review-view');
const optionsContainer = document.getElementById('options-container');

// Timer display
function startTimer() {
  timerInterval = setInterval(() => {
    timeLeft--;
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

// Helpers
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

// 1. Init Quiz (With Category Ratios & No Repeats)
async function initQuiz() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) {
    document.getElementById('question-text').textContent = 'Please log in.';
    return;
  }

  // Fetch already answered question IDs for this user
  const { data: progressData } = await supabaseClient
    .from('user_progress')
    .select('question_id')
    .eq('user_id', user.id);

  const seenIds = progressData ? progressData.map(row => row.question_id) : [];

  // Fetch fresh questions excluding seen IDs
  let query = supabaseClient.from('questions').select('*');
  if (seenIds.length > 0) {
    query = query.not('id', 'in', `(${seenIds.join(',')})`);
  }

  const { data: availableQuestions, error } = await query;

  if (error || !availableQuestions || availableQuestions.length === 0) {
    document.getElementById('question-text').textContent = 'No new questions available! You have completed all database questions.';
    return;
  }

  // Group available questions by category
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

  // Shuffle inside categories
  for (let key in categorized) {
    categorized[key] = shuffleArray(categorized[key]);
  }

  // Target quotas for 40 questions
  const targets = {
    'equations': 12, // 30%
    'graphs': 4,    // 10%
    'basic': 12,    // 30%
    'geometry': 12    // 30%
  };

  let finalSelection = [];

  for (let cat in targets) {
    const needed = targets[cat];
    const selectedForCat = categorized[cat].splice(0, needed);
    finalSelection.push(...selectedForCat);
  }

  // Fallback: Fill remaining slots from any category if short
  if (finalSelection.length < TEST_LIMIT) {
    let leftoverQuestions = [];
    for (let key in categorized) {
      leftoverQuestions.push(...categorized[key]);
    }
    leftoverQuestions = shuffleArray(leftoverQuestions);
    const missingCount = TEST_LIMIT - finalSelection.length;
    finalSelection.push(...leftoverQuestions.slice(0, missingCount));
  }

  // Final scramble so categories mix together
  questions = shuffleArray(finalSelection);
  userAnswers = new Array(questions.length).fill(null);
  
  currentIndex = 0;
  startTimer();
  renderCurrentQuestion();
}

// 2. Render Quiz Question
function renderCurrentQuestion() {
  const current = questions[currentIndex];
  document.getElementById('question-text').textContent = current.question;
  
  // Handle Question Image
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
  
  // Rebuild options dynamically
  optionsContainer.innerHTML = '';
  letters.forEach((letter, idx) => {
    if (!optionsList[idx]) return;
    
    const isChecked = userAnswers[currentIndex] && userAnswers[currentIndex].letter === letter;
    
    const optionDiv = document.createElement('div');
    optionDiv.className = 'option';
    optionDiv.innerHTML = `
      <input type="radio" name="quiz-option" value="${letter}" ${isChecked ? 'checked' : ''} style="pointer-events: none;">
      <span class="option-text">${optionsList[idx]}</span>
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
        userAnswers[currentIndex] = { letter: letter, index: idx, text: optionsList[idx] };
      }
    });

    optionsContainer.appendChild(optionDiv);
  });

  // Progress UI
  const total = questions.length;
  const currentNum = currentIndex + 1;
  const percentage = Math.round((currentNum / total) * 100);

  document.getElementById('progress-text').textContent = `Question ${currentNum} of ${total}`;
  document.getElementById('progress-fill').style.width = `${percentage}%`;

  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  prevBtn.disabled = currentIndex === 0;
  nextBtn.textContent = currentIndex === total - 1 ? 'Finish Test' : 'Next Question';

  // Trigger MathJax rendering for dynamically injected question and options
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
      if(!confirm(`⚠️ You have ${missing.length} unanswered question(s)!\nUnanswered: ${missing.join(', ')}\n\nAre you sure you want to submit?`)) {
        currentIndex = missing[0] - 1;
        renderCurrentQuestion();
        return;
      }
    }
  }

  clearInterval(timerInterval); // Stop clock
  
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

  // Save progress to  table
  await saveTestProgress();

  const totalScore = correctCount * MARKS_PER_QUESTION;
  document.getElementById('score-text').textContent = `Score: ${totalScore} / 200 (${correctCount} out of ${questions.length} correct)`;

  // Switch Views
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
  document.getElementById('review-question-text').textContent = q.question;

  // Handle Review Question Image
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

    const div = document.createElement('div');
    div.className = 'option';
    
    const isThisOptionCorrect = checkIsCorrect({text: optionsList[idx], letter: letter, index: idx}, q.correct_answer);
    const didUserPickThis = userAns && userAns.letter === letter;

    if (isThisOptionCorrect) {
      div.classList.add('correct-ans');
      div.innerHTML = `✅ <strong>${letter}:</strong> &nbsp; ${optionsList[idx]} <span style="margin-left:auto; color:#10b981; font-weight:bold;">(Correct Answer)</span>`;
    } else if (didUserPickThis) {
      div.classList.add('wrong-ans');
      div.innerHTML = `❌ <strong>${letter}:</strong> &nbsp; ${optionsList[idx]} <span style="margin-left:auto; color:#ef4444; font-weight:bold;">(Your Answer)</span>`;
    } else {
      div.innerHTML = `<strong>${letter}:</strong> &nbsp; ${optionsList[idx]}`;
    }

    container.appendChild(div);
  });

  // Display Explanation
  const expBox = document.getElementById('explanation-text');
  if (q.explanation && q.explanation.trim() !== '') {
    expBox.textContent = q.explanation;
  } else {
    expBox.textContent = "No explanation provided for this question.";
  }

  // Handle Explanation Image (fb_image)
  const expImg = document.getElementById('explanation-image');
  if (q.fb_image && q.fb_image.trim() !== '') {
    expImg.src = q.fb_image;
    expImg.style.display = 'block';
  } else {
    expImg.src = '';
    expImg.style.display = 'none';
  }

  // Smooth scroll to the detail area
  detailArea.scrollIntoView({ behavior: 'smooth' });

  // Trigger MathJax rendering for review view content
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
    renderCurrentQuestion();
  } else {
    submitTest();
  }
});

document.getElementById('prev-btn').addEventListener('click', () => {
  if (currentIndex > 0) {
    currentIndex--;
    renderCurrentQuestion();
  }
});

initQuiz();