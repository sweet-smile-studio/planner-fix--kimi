// ==========================================================================
// Application State
// ==========================================================================
const state = {
  currentDate: new Date(),
  bgImage: localStorage.getItem('app_bg_image') || '',
  todayData: JSON.parse(localStorage.getItem('today_data')) || {
    reflection: '',
    voiceLink: '',
    ticksCount: 0
  },
  weeklyData: JSON.parse(localStorage.getItem('weekly_data')) || [
    { day: 'شنبه', ticks: 4, habits: 3, mood: '😊', energy: 4, hasPhoto: true },
    { day: 'یکشنبه', ticks: 5, habits: 4, mood: '🌟', energy: 5, hasPhoto: false },
    { day: 'دوشنبه', ticks: 2, habits: 2, mood: '😐', energy: 3, hasPhoto: true },
    { day: 'سه‌شنبه', ticks: 6, habits: 5, mood: '😊', energy: 4, hasPhoto: false },
    { day: 'چهارشنبه', ticks: 3, habits: 3, mood: '😔', energy: 2, hasPhoto: false },
    { day: 'پنج‌شنبه', ticks: 7, habits: 5, mood: '🌟', energy: 5, hasPhoto: true },
    { day: 'جمعه', ticks: 5, habits: 4, mood: '😊', energy: 4, hasPhoto: false }
  ]
};

// ==========================================================================
// Initialization
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  initDateDisplay();
  initNavigation();
  initVoiceInputFix();
  initWeeklyTableAndMood();
  initLogicalCharts();
  initCustomPomodoro();
  initSettingsBackground();
});

// 1. Header Date Format (e.g. 2026/8/27)
function initDateDisplay() {
  const d = state.currentDate;
  const dateStr = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  const dateEl = document.getElementById('nav-date-display');
  if (dateEl) dateEl.textContent = dateStr;
}

// Navigation Handler
function initNavigation() {
  const navBtns = document.querySelectorAll('nav button');
  const pages = document.querySelectorAll('.page');

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      navBtns.forEach(b => b.classList.remove('active'));
      pages.forEach(p => p.classList.remove('active'));
      
      btn.classList.add('active');
      const targetPage = document.getElementById(target);
      if (targetPage) targetPage.classList.add('active');
    });
  });
}

// 2. Today View: Save Voice/Link on Enter (No Checkmark)
function initVoiceInputFix() {
  const voiceInput = document.getElementById('voice-link-input');
  if (!voiceInput) return;

  if (state.todayData.voiceLink) {
    voiceInput.value = state.todayData.voiceLink;
  }

  voiceInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      state.todayData.voiceLink = voiceInput.value.trim();
      localStorage.setItem('today_data', JSON.stringify(state.todayData));
      
      // Flash input background to indicate saved status
      voiceInput.style.backgroundColor = '#dcfce7';
      setTimeout(() => { voiceInput.style.backgroundColor = ''; }, 600);
      voiceInput.blur();
    }
  });
}

// 3. Weekly View: Sync Ticks & Calculate Dominant Mood
function initWeeklyTableAndMood() {
  const tableBody = document.getElementById('weekly-table-body');
  if (!tableBody) return;

  // Sync today's ticks into current day row (e.g. Thursday/Friday)
  if (state.todayData.ticksCount > 0) {
    state.weeklyData[state.weeklyData.length - 1].ticks = state.todayData.ticksCount;
  }

  tableBody.innerHTML = '';
  const moodFrequency = {};

  state.weeklyData.forEach(row => {
    // Count mood for dominant mood analysis
    moodFrequency[row.mood] = (moodFrequency[row.mood] || 0) + 1;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.day}</td>
      <td>${row.ticks}</td>
      <td>${row.habits}</td>
      <td>${row.mood}</td>
      <td>${row.hasPhoto ? '📸' : '—'}</td>
    `;
    tableBody.appendChild(tr);
  });

  // Find Dominant Mood
  let dominantMood = '😊';
  let maxCount = 0;
  for (const [mood, count] of Object.entries(moodFrequency)) {
    if (count > maxCount) {
      maxCount = count;
      dominantMood = mood;
    }
  }

  const moodDisplay = document.getElementById('dominant-mood-display');
  if (moodDisplay) {
    moodDisplay.innerHTML = `خلق غالب هفته: <span class="dominant-mood-badge">${dominantMood}</span>`;
  }
}

// 4. Logical & Clear Analytics Charts (Replaces Unclear Charts)
function initLogicalCharts() {
  const ctx = document.getElementById('weeklyChart');
  if (!ctx) return;

  const labels = state.weeklyData.map(d => d.day);
  const energyData = state.weeklyData.map(d => d.energy);
  const habitsData = state.weeklyData.map(d => d.habits);

  new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'سطح انرژی (۱ تا ۵)',
          data: energyData,
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99, 102, 241, 0.15)',
          fill: true,
          tension: 0.3,
          pointRadius: 5
        },
        {
          label: 'عادت‌های انجام‌شده',
          data: habitsData,
          borderColor: '#10b981',
          backgroundColor: 'transparent',
          borderDash: [5, 5],
          tension: 0.1,
          pointRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: { font: { family: 'system-ui' } }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${ctx.raw}`
          }
        }
      },
      scales: {
        y: {
          min: 0,
          max: 6,
          ticks: { stepSize: 1 }
        }
      }
    }
  });
}

// 5. Pomodoro Custom Manual Timer
function initCustomPomodoro() {
  const startCustomBtn = document.getElementById('start-custom-timer');
  const customInput = document.getElementById('custom-timer-min');
  const timerDisplay = document.getElementById('timer-display');

  if (!startCustomBtn || !timerDisplay) return;

  // Preset Buttons Logic
  const presetBtns = document.querySelectorAll('.pomodoro-preset');
  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const mins = parseInt(btn.dataset.time);
      startTimer(mins * 60, timerDisplay);
    });
  });

  // Custom Input Logic
  startCustomBtn.addEventListener('click', () => {
    const mins = parseInt(customInput.value);
    if (mins && mins > 0) {
      startTimer(mins * 60, timerDisplay);
    } else {
      alert('لطفاً یک زمان معتبر به دقیقه وارد کنید.');
    }
  });
}

function startTimer(totalSeconds, displayEl) {
  if (window.pomodoroInterval) clearInterval(window.pomodoroInterval);

  let secondsLeft = totalSeconds;
  updateTimerUI(secondsLeft, displayEl);

  window.pomodoroInterval = setInterval(() => {
    secondsLeft--;
    updateTimerUI(secondsLeft, displayEl);

    if (secondsLeft <= 0) {
      clearInterval(window.pomodoroInterval);
      alert('زمان تایمر به پایان رسید!');
    }
  }, 1000);
}

function updateTimerUI(seconds, displayEl) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  displayEl.textContent = `${m}:${s}`;
}

// 6. Settings Background Fix
function initSettingsBackground() {
  const bgInput = document.getElementById('bg-file-input');
  
  // Apply existing saved background
  if (state.bgImage) {
    applyBg(state.bgImage);
  }

  if (bgInput) {
    bgInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          const base64Img = evt.target.result;
          localStorage.setItem('app_bg_image', base64Img);
          state.bgImage = base64Img;
          applyBg(base64Img);
        };
        reader.readAsDataURL(file);
      }
    });
  }
}

function applyBg(imgUrl) {
  document.body.style.backgroundImage = `url('${imgUrl}')`;
  document.body.classList.add('has-custom-bg');
}
