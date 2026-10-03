// 1. Initialize Supabase Client
const SUPABASE_URL = "https://mibyte.site";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF5enN5bWVkZWttZWtnb3N5a2lrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzNTM3MTksImV4cCI6MjA5OTkyOTcxOX0.H7cgkvW2gCIX2DiNePoU8hImQI8k6Fo2NK148uC5pPU";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 2. DOM Element Selectors
const dropdown = document.getElementById('passage-select');
const preloadedView = document.getElementById('preloaded-view');
const customView = document.getElementById('custom-view');
const analyzeBtn = document.getElementById('analyze-btn');
const essayInput = document.getElementById('essay-input');
const resultsView = document.getElementById('results-view');
const timerDisplay = document.getElementById('test-timer');

// Cache object storing fetched passages
const passageCache = {};

// --- Timer & Test State ---
let testActive = false;
let timerInterval = null;
let timeRemaining = 2700; // 45 minutes in seconds
let isOvertime = false;

// Modal System 
const modalOverlay = document.getElementById('custom-modal');
const modalTitle = document.getElementById('modal-title');
const modalText = document.getElementById('modal-text');
const modalButtons = document.getElementById('modal-buttons');

function showModal(title, text, buttons) {
    modalTitle.textContent = title;
    modalText.textContent = text;
    modalButtons.innerHTML = ''; // Clear old buttons

    buttons.forEach(btnInfo => {
        const btn = document.createElement('button');
        btn.textContent = btnInfo.text;
        btn.className = btnInfo.class;
        btn.onclick = () => {
            btnInfo.onClick();
        };
        modalButtons.appendChild(btn);
    });

    modalOverlay.classList.remove('hidden');
}

function closeModal() {
    modalOverlay.classList.add('hidden');
}

// 3. Populate Dropdown dynamically from Supabase
async function initPassageDropdown() {
    const { data, error } = await supabaseClient
        .from('RLA_ER_Source_Text')
        .select('title, slug, passage_a_title, passage_a_text, passage_b_title, passage_b_text');

    if (error) {
        console.error('Error loading passage list:', error);
        return;
    }

    data.forEach(item => {
        passageCache[item.slug] = item;
        const option = document.createElement('option');
        option.value = item.slug;
        option.textContent = item.title || `Passage: ${item.slug}`;
        dropdown.appendChild(option);
    });
}

// 4. Check for Source Texts (Requires BOTH Passage A and B to be filled for Custom mode)
function getHasSourceTexts() {
    if (dropdown.value !== 'custom') return true;
    const textareas = customView.querySelectorAll('textarea');
    if (textareas.length < 2) return false;

    const textA = textareas[0]?.value.trim() || '';
    const textB = textareas[1]?.value.trim() || '';

    return textA.length > 0 && textB.length > 0;
}

// 5. Update Button Label based on Word Count and Mode
function updateButtonText() {
    if (testActive) return; // Don't change text while test is running

    const text = essayInput.value.trim();
    const wordCount = text === "" ? 0 : text.split(/\s+/).length;

    if (wordCount >= 100) {
        analyzeBtn.innerText = 'Analyze My Extended Response';
    } else {
        analyzeBtn.innerText = 'Start Test';
    }
}

// 6. Timer Logic
function updateTimerUI(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    timerDisplay.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function startTestTimer() {
    testActive = true;
    timeRemaining = 2700;
    isOvertime = false;
    timerDisplay.classList.remove('hidden', 'overtime');
    analyzeBtn.innerText = 'Submit & Finish';
    
    updateTimerUI(timeRemaining);
    
    timerInterval = setInterval(() => {
        if (!isOvertime) {
            timeRemaining--;
            if (timeRemaining <= 0) {
                clearInterval(timerInterval);
                triggerTimeUpModal();
            } else {
                updateTimerUI(timeRemaining);
            }
        } else {
            timeRemaining++; // Counting up in overtime
            updateTimerUI(timeRemaining);
        }
    }, 1000);
}

function triggerTimeUpModal() {
    showModal(
        "Time is Up!", 
        "Your 45 minutes have expired. Submit now, or continue writing to see how much extra time you need?", 
        [
            { text: "Submit Now", class: "btn-primary", onClick: () => { closeModal(); analyzeEssay(); } },
            { text: "Continue Writing", class: "btn-secondary", onClick: () => { 
                closeModal(); 
                isOvertime = true; 
                timeRemaining = 0; 
                timerDisplay.classList.add('overtime');
                timerInterval = setInterval(() => {
                    timeRemaining++;
                    updateTimerUI(timeRemaining);
                }, 1000);
            }}
        ]
    );
}

// 7. Handle Main Action Button Click
function handleMainAction() {
    if (testActive) {
        analyzeEssay(); // If test is running, clicking submits it
        return;
    }

    const text = essayInput.value.trim();
    const wordCount = text === "" ? 0 : text.split(/\s+/).length;
    const hasSource = getHasSourceTexts();
    const isCustom = dropdown.value === 'custom';

    if (wordCount >= 100) {
        // QUICK ANALYZE MODE
        if (isCustom && !hasSource) {
            showModal("Missing Source Texts", "To get accurate feedback and rubric suggestions, you must provide text for BOTH Passage A and Passage B.", [
                { text: "Cancel", class: "btn-secondary", onClick: closeModal },
                { text: "Yes, Analyze Anyway", class: "btn-primary", onClick: () => { closeModal(); analyzeEssay(); } }
            ]);
        } else {
            analyzeEssay();
        }
    } else {
        // START TEST MODE
        if (isCustom && !hasSource) {
            showModal("Missing Practice Text", "You must enter text for BOTH Passage A and Passage B before starting the 45-minute practice test.", [
                { text: "Okay", class: "btn-primary", onClick: closeModal }
            ]);
        } else {
            startTestTimer();
        }
    }
}

// 8. Render Selected Passage with GED-style Tabs
function renderPreloadedPassage(data) {
    preloadedView.innerHTML = `
        <div class="passage-tabs">
            <button type="button" class="tab-btn active" data-target="passage-a-box">
                Passage A
            </button>
            <button type="button" class="tab-btn" data-target="passage-b-box">
                Passage B
            </button>
        </div>
        <div id="passage-a-box" class="passage-box">
            <p>${data.passage_a_text}</p>
        </div>
        <div id="passage-b-box" class="passage-box hidden">
            <p>${data.passage_b_text}</p>
        </div>
    `;

    // Tab switching listener
    const tabs = preloadedView.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const targetId = tab.getAttribute('data-target');
            if (targetId === 'passage-a-box') {
                document.getElementById('passage-a-box').classList.remove('hidden');
                document.getElementById('passage-b-box').classList.add('hidden');
            } else {
                document.getElementById('passage-a-box').classList.add('hidden');
                document.getElementById('passage-b-box').classList.remove('hidden');
            }
        });
    });
}

// 9. Listen for Dropdown Changes
dropdown.addEventListener('change', (e) => {
    const selectedSlug = e.target.value;

    if (selectedSlug === 'custom') {
        preloadedView.classList.add('hidden');
        customView.classList.remove('hidden');
    } else {
        customView.classList.add('hidden');
        preloadedView.classList.remove('hidden');

        if (passageCache[selectedSlug]) {
            renderPreloadedPassage(passageCache[selectedSlug]);
        }
    }

    updateButtonText(); 
});

// 10. Toolbar Commands (Cut, Copy, Paste, Undo, Redo)
document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        const cmd = btn.getAttribute('data-cmd');
        essayInput.focus();
        
        if (cmd === 'paste') {
            try {
                const text = await navigator.clipboard.readText();
                document.execCommand('insertText', false, text);
            } catch (err) {
                showModal("Paste Blocked", "Your browser blocked clipboard access. Please use Ctrl+V or Right-Click -> Paste.", [{ text: "Got it", class: "btn-primary", onClick: closeModal }]);
            }
        } else {
            document.execCommand(cmd);
        }
    });
});

// 11. Send Essay to Serverless Endpoint (/api/analyze)
async function analyzeEssay() {
    const essayText = essayInput.value.trim();
    if (!essayText) {
        showModal("Empty Essay", "Please enter your essay before grading.", [{ text: "Okay", class: "btn-primary", onClick: closeModal }]);
        return;
    }

    // Stop timer if running
    if (timerInterval) {
        clearInterval(timerInterval);
        timerDisplay.classList.add('hidden');
        testActive = false;
    }

    const selectedMode = dropdown.value;
    let passageA = "";
    let passageB = "";

    if (selectedMode === 'custom') {
        const textareas = customView.querySelectorAll('textarea');
        passageA = textareas[0]?.value || "";
        passageB = textareas[1]?.value || "";
    } else if (passageCache[selectedMode]) {
        passageA = passageCache[selectedMode].passage_a_text;
        passageB = passageCache[selectedMode].passage_b_text;
    }

    // Set Loading UI State
    analyzeBtn.disabled = true;
    analyzeBtn.innerText = " Grading with Official GED Rubric...";

    try {
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mode: selectedMode,
                passageA: passageA,
                passageB: passageB,
                essayText: essayText
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to analyze essay');
        }

        renderResults(data);
    } catch (err) {
        console.error(err);
        showModal("Analysis Error", err.message, [{ text: "Okay", class: "btn-primary", onClick: closeModal }]);
    } finally {
        analyzeBtn.disabled = false;
        updateButtonText();
    }
}

// 12. Render Scorecard inside Full-Width Panel
function renderResults(data) {
    resultsView.innerHTML = `
        <h2 style="color: var(--rla-theme); margin-bottom: 1rem;"> Score Summary</h2>
        <div style="font-size: 1.4rem; font-weight: 800; margin-bottom: 1.5rem; background: #f0ebf2; padding: 1rem; border-radius: 8px; text-align: center;">
            Total Cumulative Score: ${data.totalWeighted} / 12 Points (Raw: ${data.totalRaw}/6)
        </div>

        <h3 style="margin-bottom: 0.5rem;">Detailed Trait Breakdown</h3>
        <ul style="margin: 0.5rem 0 1.5rem 0; padding-left: 1.2rem; line-height: 1.5;">
            <li><strong>Trait 1 (Argument & Evidence):</strong> Raw ${data.trait1?.raw}/2 | Weighted ${data.trait1?.weighted}/4<br><span style="color: #555; font-size: 0.92rem;">${data.trait1?.analysis || ''}</span></li>
            <li style="margin-top: 0.8rem;"><strong>Trait 2 (Organization & Structure):</strong> Raw ${data.trait2?.raw}/2 | Weighted ${data.trait2?.weighted}/4<br><span style="color: #555; font-size: 0.92rem;">${data.trait2?.analysis || ''}</span></li>
            <li style="margin-top: 0.8rem;"><strong>Trait 3 (Language & Conventions):</strong> Raw ${data.trait3?.raw}/2 | Weighted ${data.trait3?.weighted}/4<br><span style="color: #555; font-size: 0.92rem;">${data.trait3?.analysis || ''}</span></li>
        </ul>

        <h3 style="margin-top: 1.5rem;">Bulleted Improvement Plan</h3>
        <ul style="padding-left: 1.2rem; color: #c62828; line-height: 1.4;">
            ${(data.improvementPlan || []).map(tip => `<li style="margin-bottom: 0.4rem;">${tip}</li>`).join('')}
        </ul>
        
        <button id="reset-btn" class="btn-primary" style="margin-top: 2rem; background-color: #718096; width: 100%;"> Edit Essay & Try Again</button>
    `;

    resultsView.classList.remove('hidden');
    resultsView.scrollIntoView({ behavior: 'smooth' });

    document.getElementById('reset-btn').addEventListener('click', () => {
        resultsView.classList.add('hidden');
    });
}

// 13. Event Listeners
analyzeBtn.addEventListener('click', handleMainAction);
essayInput.addEventListener('input', updateButtonText);

// Stop reloading in an active test
window.addEventListener('beforeunload', (e) => {
    if (testActive) {
        e.preventDefault();
        e.returnValue = ''; 
    }
});

initPassageDropdown();