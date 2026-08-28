// App State & Data Store
const state = {
  currentDate: new Date(),
  bgImage: localStorage.getItem('bg_image') || '',
  todayData: {
    gallery: [],
    reflection: '',
    voiceLink: '',
    mood: '😊',
    energy: 4,
    habits: {}
  },
  weeklyData: [
    { day: 'شنبه', ticks: 4, habits: 3, mood: '😊', energy: 4, image: true },
    { day: 'یکشنبه', ticks: 5, habits: 4, mood: '🌟', energy: 5, image: false },
    { day: 'دوشنبه', ticks: 2, habits: 2, mood: '😐', energy: 3, image: true },
    { day: 'سه‌شنبه', ticks: 6, habits: 5, mood: '😊', energy: 4, image: false },
    { day: 'چهارشنبه', ticks: 3, habits: 3, mood: '😔', energy: 2, image: false },
    { day: 'پنج‌شنبه', ticks: 7, habits: 5, mood: '🌟', energy: 5, image: true },
    { day: 'جمعه', ticks: 5, habits: 4, mood: '😊', energy: 4, image: false }
  ]
};

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  renderDate();
  setupNavigation();
  setupVoiceInput();
  setupPomodoro();
  setupSettings();
  applySavedBackground();
  renderWeeklyView();
  initCharts();
}

// 1. Navigation & Header Fixes
function renderDate() {
  const d = state.currentDate;
  const formattedDate = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  document.getElementById('nav-date-display').textContent = formattedDate;
}

function setupNavigation() {
  const navBtns = document.querySelectorAll('nav button');
  const pages = document.querySelectorAll('.page');

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      navBtns.forEach(b => b.classList.remove('active'));
      pages.forEach(p => p.classList.remove('active'));
      
      btn.classList.add('active');
      document.getElementById(target).classList.add('active');
    });
  });
}

// 2. Today Page: Voice Link Auto Save on Enter (No Checkmark)
function setupVoiceInput() {
  const voiceInput = document.getElementById('voice-link-input');
  if (!voiceInput) return;

  voiceInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      state.todayData.voiceLink = voiceInput.value.trim();
      showToast('لینک با موفقیت ذخیره شد');
      voiceInput.blur();
    }
  });
}

// 3. Weekly Page: Calculate Dominant Mood & Sync Ticks
function renderWeeklyView() {
  const tableBody = document.getElementById('weekly-table-body');
  if (!tableBody) return;

  tableBody.innerHTML = '';
  
  const moodCounts = {};
  
  state.weeklyData.forEach(row => {
    // Count Mood Frequency
    moodCounts[row.mood] = (moodCounts[row.mood] || 0) + 1;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.day}</td>
      <td>${row.ticks}</td>
      <td>${row.habits}</td>
      <td>${row.mood}</td>
      <td>${row.image ? '📸 دارد' : '—'}</td>
    `;
    tableBody.appendChild(tr);
  });

  // Calculate Most Frequent Mood
  let dominantMood = '😊';
  let maxCount = 0;
  for (const [mood, count] of Object.entries(moodCounts)) {
    if (count > maxCount) {
      maxCount = count;
      dominantMood = mood;
    }
  }

  const dominantContainer = document.getElementById('dominant-mood-display');
  if (dominantContainer) {
    dominantContainer.innerHTML = `خلق غالب هفته: <span class="dominant-mood-badge">${dominantMood}</span>`;
  }
}

// 4. Meaningful & Logical Chart Analytics (Chart.js Integration)
function initCharts() {
  const ctxEnergy = document.getElementById('weeklyEnergyChart');
  if (!ctxEnergy) return;

  const days = state.weeklyData.map(d => d.day);
  const energyLevels = state.weeklyData.map(d => d.energy);
  const habitCompletion = state.weeklyData.map(d => d.habits);

  new Chart(ctxEnergy, {
    type: 'line',
    data: {
      labels: days,
      datasets: [
        {
          label: 'سطح انرژی (۱ تا ۵)',
          data: energyLevels,
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
          fill: true,
          tension: 0.3
        },
        {
          label: 'عادت‌های تکمیل‌شده',
          data: habitCompletion,
          borderColor: '#10b981',
          borderDash: [5, 5],
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          callbacks: {
            footer: (items) => 'تحلیل: سطح پایداری عملکرد خوب است'
          }
        }
      },
      scales: {
        y: { beginAtZero: true, max: 6 }
      }
    }
  });
}

// 5. Pomodoro Custom Timer
function setupPomodoro() {
  const startCustomBtn = document.getElementById('start-custom-timer');
  const customInput = document.getElementById('custom-timer-min');
  const timerDisplay = document.getElementById('timer-display');

  if (!startCustomBtn) return;

  startCustomBtn.addEventListener('click', () => {
    const minutes = parseInt(customInput.value);
    if (minutes && minutes > 0) {
      let seconds = minutes * 60;
      updateTimerDisplay(seconds, timerDisplay);
      
      if (window.pomodoroInterval) clearInterval(window.pomodoroInterval);
      
      window.pomodoroInterval = setInterval(() => {
        seconds--;
        updateTimerDisplay(seconds, timerDisplay);
        if (seconds <= 0) {
          clearInterval(window.pomodoroInterval);
          alert('زمان پومودورو سفارشی به پایان رسید!');
        }
      }, 1000);
    }
  });
}

function updateTimerDisplay(totalSeconds, displayEl) {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  displayEl.textContent = `${m}:${s}`;
}

// 6. Settings Background Image Fix
function setupSettings() {
  const bgInput = document.getElementById('bg-file-input');
  if (!bgInput) return;

  bgInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = function(evt) {
        const bgDataUrl = evt.target.result;
        localStorage.setItem('bg_image', bgDataUrl);
        applyBackground(bgDataUrl);
      };
      reader.readAsDataURL(file);
    }
  });
}

function applySavedBackground() {
  const savedBg = localStorage.getItem('bg_image');
  if (savedBg) {
    applyBackground(savedBg);
  }
}

function applyBackground(url) {
  document.body.style.backgroundImage = `url('${url}')`;
  document.body.classList.add('has-custom-bg');
}

function showToast(msg) {
  // Simple toast placeholder
  console.log(msg);
}
