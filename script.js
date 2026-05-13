const TOTAL_QUESTIONS = 20;
const SECONDS_PER_QUIZ = 20 * 60;
const POINT_PER_QUESTION = 0.5;
const LEADERBOARD_KEY = "grade3_math_rankings_v2";
const PLAYER_NAME_KEY = "grade3_math_player_name";
const AUDIO_TRACKS = {
  home: "nhacnen1.mp3",
  quiz: "nhacnen2.mp3",
  finish: "nhacnenketthuc.mp3",
};
const optionLetters = ["A", "B", "C", "D"];

const difficultyNames = {
  easy: "Dễ",
  medium: "Trung bình",
  hard: "Khó",
};

const state = {
  soundEnabled: false,
  difficulty: null,
  questions: [],
  selectedAnswers: [],
  recentKeys: new Set(),
  rankings: loadRankings(),
  playerName: loadPlayerName(),
  currentScreen: "home",
  backgroundAudio: null,
  finishAudio: null,
  backgroundMode: null,
  startedAt: null,
  remainingSeconds: SECONDS_PER_QUIZ,
  timerId: null,
};

const screens = {
  home: document.querySelector("#home-screen"),
  quiz: document.querySelector("#quiz-screen"),
  result: document.querySelector("#result-screen"),
};

const soundToggle = document.querySelector("#sound-toggle");
const questionList = document.querySelector("#question-list");
const timer = document.querySelector("#timer");
const quizLevel = document.querySelector("#quiz-level");
const loginForm = document.querySelector("#login-form");
const playerNameInput = document.querySelector("#player-name");
const loginStatus = document.querySelector("#login-status");
const leaderboards = document.querySelector("#leaderboards");
const submitQuiz = document.querySelector("#submit-quiz");
const submitReminder = document.querySelector("#submit-reminder");
const backToTop = document.querySelector("#back-to-top");
const retrySame = document.querySelector("#retry-same");
const goHome = document.querySelector("#go-home");
const reviewList = document.querySelector("#review-list");
const celebration = document.querySelector("#celebration");

initializeHome();

document.querySelectorAll("[data-difficulty]").forEach((button) => {
  button.addEventListener("click", () => startQuiz(button.dataset.difficulty));
});

soundToggle.addEventListener("click", () => {
  state.soundEnabled = !state.soundEnabled;
  soundToggle.classList.toggle("active", state.soundEnabled);
  soundToggle.setAttribute("aria-pressed", String(state.soundEnabled));
  soundToggle.querySelector("span:last-child").textContent = state.soundEnabled ? "Tắt âm" : "Bật âm";
  if (state.soundEnabled) {
    switchBackgroundMusic(state.currentScreen);
  } else {
    stopAllAudio();
  }
});

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  savePlayerName();
});

submitQuiz.addEventListener("click", handleManualSubmit);
backToTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
retrySame.addEventListener("click", () => startQuiz(state.difficulty));
goHome.addEventListener("click", () => {
  stopTimer();
  renderLeaderboards();
  showScreen("home");
});

function initializeHome() {
  if (state.playerName) {
    playerNameInput.value = state.playerName;
    loginStatus.textContent = `Đang luyện tập với tên: ${state.playerName}`;
  }
  renderLeaderboards();
}

function savePlayerName() {
  const name = playerNameInput.value.trim().replace(/\s+/g, " ");
  if (!name) {
    loginStatus.textContent = "Anh nhập họ tên trước khi bắt đầu nhé.";
    playerNameInput.focus();
    return false;
  }

  state.playerName = name;
  localStorage.setItem(PLAYER_NAME_KEY, name);
  loginStatus.textContent = `Đã lưu tên: ${name}`;
  return true;
}

function ensurePlayerName() {
  if (state.playerName) {
    return true;
  }

  return savePlayerName();
}

function startQuiz(difficulty) {
  if (!ensurePlayerName()) {
    return;
  }

  stopTimer();
  clearSubmitReminder();
  state.difficulty = difficulty;
  state.questions = generateQuiz(difficulty);
  state.selectedAnswers = Array(TOTAL_QUESTIONS).fill(null);
  state.remainingSeconds = SECONDS_PER_QUIZ;
  state.startedAt = Date.now();

  quizLevel.textContent = `Mức ${difficultyNames[difficulty]}`;
  timer.textContent = formatTime(state.remainingSeconds);
  renderQuestions();
  showScreen("quiz");
  window.scrollTo({ top: 0, behavior: "smooth" });
  state.timerId = window.setInterval(tickTimer, 1000);
}

function tickTimer() {
  state.remainingSeconds -= 1;
  timer.textContent = formatTime(state.remainingSeconds);

  if (state.remainingSeconds <= 0) {
    finishQuiz("timeout");
  }
}

function finishQuiz() {
  stopTimer();
  stopBackgroundMusic();
  const result = calculateResult();
  const record = saveResultRecord(result);
  renderResult(result);
  renderLeaderboards();
  showScreen("result");
  window.scrollTo({ top: 0, behavior: "smooth" });
  return record;
}

function stopTimer() {
  if (state.timerId) {
    window.clearInterval(state.timerId);
    state.timerId = null;
  }
}

function showScreen(name) {
  Object.values(screens).forEach((screen) => screen.classList.remove("active"));
  screens[name].classList.add("active");
  state.currentScreen = name;
  switchBackgroundMusic(name);
}

function renderQuestions() {
  questionList.innerHTML = state.questions
    .map((question, index) => {
      const options = question.options
        .map(
          (option, optionIndex) => `
            <button class="option-button" type="button" data-question="${index}" data-option="${option}">
              <span class="option-letter">${optionLetters[optionIndex]}</span>
              <span>${option}</span>
            </button>
          `,
        )
        .join("");

      return `
        <article class="question-card" data-question-card="${index}">
          <div class="question-title">
            <span class="question-number">Câu ${index + 1}.</span>
            <span>${question.text}</span>
          </div>
          <div class="option-grid">${options}</div>
        </article>
      `;
    })
    .join("");

  questionList.querySelectorAll(".option-button").forEach((button) => {
    button.addEventListener("click", () => selectAnswer(button));
  });
}

function selectAnswer(button) {
  const questionIndex = Number(button.dataset.question);
  const selectedValue = Number(button.dataset.option);
  state.selectedAnswers[questionIndex] = selectedValue;
  clearQuestionWarning(questionIndex);

  questionList
    .querySelectorAll(`[data-question="${questionIndex}"]`)
    .forEach((optionButton) => optionButton.classList.remove("selected"));
  button.classList.add("selected");

  if (findFirstBlankQuestion() === -1) {
    clearSubmitReminder();
  }
}

function handleManualSubmit() {
  const firstBlankIndex = findFirstBlankQuestion();
  if (firstBlankIndex !== -1) {
    highlightIncompleteQuestion(firstBlankIndex);
    return;
  }

  finishQuiz("manual");
}

function findFirstBlankQuestion() {
  return state.selectedAnswers.findIndex((answer) => answer === null);
}

function highlightIncompleteQuestion(index) {
  clearQuestionWarnings();
  submitReminder.textContent = `Con còn câu ${index + 1} chưa làm, hãy hoàn thành trước khi nộp nhé.`;

  const card = questionList.querySelector(`[data-question-card="${index}"]`);
  if (!card) {
    return;
  }

  card.classList.add("incomplete");
  card.scrollIntoView({ behavior: "smooth", block: "center" });
}

function clearQuestionWarning(index) {
  const card = questionList.querySelector(`[data-question-card="${index}"]`);
  if (card) {
    card.classList.remove("incomplete");
  }
}

function clearQuestionWarnings() {
  questionList.querySelectorAll(".question-card.incomplete").forEach((card) => {
    card.classList.remove("incomplete");
  });
}

function clearSubmitReminder() {
  submitReminder.textContent = "";
  clearQuestionWarnings();
}

function calculateResult() {
  let correct = 0;
  let blank = 0;

  state.questions.forEach((question, index) => {
    const selected = state.selectedAnswers[index];
    if (selected === null) {
      blank += 1;
    } else if (selected === question.answer) {
      correct += 1;
    }
  });

  const wrong = TOTAL_QUESTIONS - correct - blank;
  const score = correct * POINT_PER_QUESTION;
  const usedSeconds = Math.max(0, SECONDS_PER_QUIZ - state.remainingSeconds);
  const finishedAt = new Date();

  return { correct, wrong, blank, score, usedSeconds, finishedAt };
}

function renderResult(result) {
  const band = getScoreBand(result.score);
  document.querySelector("#result-title").textContent = band.title;
  document.querySelector("#result-message").textContent = band.message;
  document.querySelector("#reward-badge").textContent = band.badge;
  document.querySelector("#player-result").textContent = state.playerName || "-";
  document.querySelector("#score-text").textContent = `${formatScore(result.score)}/10`;
  document.querySelector("#correct-count").textContent = result.correct;
  document.querySelector("#wrong-count").textContent = result.wrong;
  document.querySelector("#blank-count").textContent = result.blank;
  document.querySelector("#time-used").textContent = formatTime(result.usedSeconds);
  document.querySelector("#finish-time").textContent = formatDateTime(result.finishedAt);

  reviewList.innerHTML = state.questions
    .map((question, index) => {
      const selected = state.selectedAnswers[index];
      const status = selected === null ? "blank" : selected === question.answer ? "correct" : "wrong";
      const selectedText = selected === null ? "Chưa chọn" : selected;

      return `
        <article class="review-item ${status}">
          <div class="review-question">Câu ${index + 1}. ${question.text}</div>
          <div class="review-answer">
            <span>Con chọn: <strong>${selectedText}</strong></span>
            <span>Đáp án đúng: <strong>${question.answer}</strong></span>
          </div>
        </article>
      `;
    })
    .join("");

  runCelebration(band.type);
  playTone(band.type);
}

function saveResultRecord(result) {
  const record = {
    name: state.playerName || "Chưa nhập tên",
    difficulty: state.difficulty,
    score: result.score,
    correct: result.correct,
    wrong: result.wrong,
    blank: result.blank,
    usedSeconds: result.usedSeconds,
    finishedAt: result.finishedAt.toISOString(),
  };

  state.rankings[state.difficulty].push(record);
  state.rankings[state.difficulty] = sortRecords(state.rankings[state.difficulty]).slice(0, 10);
  localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(state.rankings));
  return record;
}

function renderLeaderboards() {
  leaderboards.innerHTML = Object.entries(difficultyNames)
    .map(([difficulty, label]) => {
      const records = sortRecords(state.rankings[difficulty] || []).slice(0, 10);
      const rows = records.length
        ? records
            .map(
              (record, index) => `
                <tr>
                  <td><span class="leaderboard-rank">${index + 1}</span></td>
                  <td>
                    <span class="leaderboard-name">${escapeHtml(record.name)}</span>
                    <span class="leaderboard-meta">${formatStoredDate(record.finishedAt)}</span>
                  </td>
                  <td class="leaderboard-score">${formatScore(record.score)}</td>
                  <td>${formatTime(record.usedSeconds)}</td>
                </tr>
              `,
            )
            .join("")
        : `<p class="empty-board">Chưa có kết quả nào. Hãy làm bài để lập kỷ lục đầu tiên nhé.</p>`;

      return `
        <article class="leaderboard-card">
          <h3>${label}</h3>
          ${
            records.length
              ? `<div class="leaderboard-table-wrap">
                  <table class="leaderboard-table">
                    <thead>
                      <tr>
                        <th>Thứ hạng</th>
                        <th>Tên</th>
                        <th>Số điểm</th>
                        <th>Thời gian hoàn thành</th>
                      </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                  </table>
                </div>`
              : rows
          }
        </article>
      `;
    })
    .join("");
}

function sortRecords(records) {
  return [...records].sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    if (a.usedSeconds !== b.usedSeconds) {
      return a.usedSeconds - b.usedSeconds;
    }

    return new Date(b.finishedAt) - new Date(a.finishedAt);
  });
}

function loadRankings() {
  const empty = { easy: [], medium: [], hard: [] };
  try {
    const saved = JSON.parse(localStorage.getItem(LEADERBOARD_KEY));
    return {
      easy: Array.isArray(saved?.easy) ? saved.easy : [],
      medium: Array.isArray(saved?.medium) ? saved.medium : [],
      hard: Array.isArray(saved?.hard) ? saved.hard : [],
    };
  } catch {
    return empty;
  }
}

function loadPlayerName() {
  return localStorage.getItem(PLAYER_NAME_KEY) || "";
}

function getScoreBand(score) {
  if (score >= 8) {
    return {
      type: "high",
      badge: "★",
      title: "Con làm rất tốt!",
      message: "Con làm rất tốt! Giỏi quá!",
    };
  }

  if (score >= 5.5) {
    return {
      type: "medium",
      badge: "✓",
      title: "Khá tốt rồi!",
      message: "Khá tốt rồi, cố thêm chút nữa nhé!",
    };
  }

  return {
    type: "low",
    badge: "↗",
    title: "Mình luyện thêm nhé!",
    message: "Em còn kém quá, hãy cố lên nhé!",
  };
}

function runCelebration(type) {
  celebration.innerHTML = "";
  const count = type === "high" ? 46 : type === "medium" ? 22 : 12;
  const colors = type === "low"
    ? ["#2864c9", "#d58b00", "#159947"]
    : ["#159947", "#2864c9", "#d58b00", "#d64563"];

  for (let i = 0; i < count; i += 1) {
    const piece = document.createElement("span");
    piece.className = type === "high" ? "confetti-piece" : "sparkle-piece";
    piece.style.left = `${randomInt(4, 96)}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = `${randomInt(0, 420)}ms`;
    celebration.appendChild(piece);
  }

  window.setTimeout(() => {
    celebration.innerHTML = "";
  }, 1800);
}

function switchBackgroundMusic(screenName) {
  if (!state.soundEnabled) {
    stopBackgroundMusic();
    return;
  }

  if (screenName === "home" || screenName === "quiz") {
    startBackgroundMusic(screenName);
    return;
  }

  stopBackgroundMusic();
}

function startBackgroundMusic(mode) {
  if (state.backgroundMode === mode && state.backgroundAudio && !state.backgroundAudio.paused) {
    return;
  }

  stopFinishMusic();
  stopBackgroundMusic();

  const src = AUDIO_TRACKS[mode];
  if (!src) {
    return;
  }

  const audio = new Audio(src);
  audio.loop = true;
  audio.volume = mode === "home" ? 0.42 : 0.26;

  state.backgroundMode = mode;
  state.backgroundAudio = audio;
  audio.play().catch(() => {
    state.backgroundMode = null;
    state.backgroundAudio = null;
  });
}

function stopBackgroundMusic() {
  if (state.backgroundAudio) {
    state.backgroundAudio.pause();
    state.backgroundAudio.currentTime = 0;
    state.backgroundAudio = null;
  }

  state.backgroundMode = null;
}

function stopAllAudio() {
  stopBackgroundMusic();
  stopFinishMusic();
}

function stopFinishMusic() {
  if (state.finishAudio) {
    state.finishAudio.pause();
    state.finishAudio.currentTime = 0;
    state.finishAudio = null;
  }
}

function playTone(type) {
  playFinishMusic(type);
}

function playFinishMusic(type) {
  if (!state.soundEnabled) {
    return;
  }

  if (state.finishAudio) {
    state.finishAudio.pause();
    state.finishAudio.currentTime = 0;
  }

  const audio = new Audio(AUDIO_TRACKS.finish);
  audio.loop = false;
  audio.volume = type === "high" ? 0.75 : type === "medium" ? 0.62 : 0.5;
  state.finishAudio = audio;
  audio.play().catch(() => {
    state.finishAudio = null;
  });
}

function generateQuiz(difficulty) {
  const questions = [];
  const keysInQuiz = new Set();
  let attempts = 0;

  while (questions.length < TOTAL_QUESTIONS && attempts < 600) {
    attempts += 1;
    const question = makeQuestion(difficulty, questions.length);
    const isFresh = !keysInQuiz.has(question.key) && !state.recentKeys.has(question.key);

    if (isFresh || attempts > 350) {
      questions.push(question);
      keysInQuiz.add(question.key);
      state.recentKeys.add(question.key);
    }
  }

  while (questions.length < TOTAL_QUESTIONS) {
    const question = makeQuestion(difficulty, questions.length);
    questions.push(question);
    state.recentKeys.add(question.key);
  }

  trimRecentKeys();
  return questions;
}

function trimRecentKeys() {
  const maxSize = 180;
  if (state.recentKeys.size <= maxSize) {
    return;
  }

  const keep = Array.from(state.recentKeys).slice(-maxSize);
  state.recentKeys = new Set(keep);
}

function makeQuestion(difficulty, index) {
  if (difficulty === "easy") {
    return makeEasyQuestion();
  }

  if (difficulty === "medium") {
    return makeMediumQuestion();
  }

  return makeHardQuestion(index);
}

function makeEasyQuestion() {
  const type = choose(["add", "subtract", "multiply", "divide"]);

  if (type === "add") {
    const a = randomInt(8, 49);
    const b = randomInt(4, 39);
    return buildQuestion(`${a} + ${b} = ?`, a + b);
  }

  if (type === "subtract") {
    const a = randomInt(25, 90);
    const b = randomInt(5, Math.min(45, a - 1));
    return buildQuestion(`${a} - ${b} = ?`, a - b);
  }

  if (type === "multiply") {
    const a = randomInt(2, 9);
    const b = randomInt(2, 9);
    return buildQuestion(`${a} x ${b} = ?`, a * b);
  }

  const divisor = randomInt(2, 9);
  const answer = randomInt(2, 9);
  return buildQuestion(`${divisor * answer} : ${divisor} = ?`, answer);
}

function makeMediumQuestion() {
  const type = choose(["add", "subtract", "multiply", "divide", "missingMultiply", "missingAdd"]);

  if (type === "add") {
    const a = randomInt(80, 430);
    const b = randomInt(40, 360);
    return buildQuestion(`${a} + ${b} = ?`, a + b);
  }

  if (type === "subtract") {
    const a = randomInt(180, 760);
    const b = randomInt(50, a - 20);
    return buildQuestion(`${a} - ${b} = ?`, a - b);
  }

  if (type === "multiply") {
    const a = randomInt(4, 9);
    const b = randomInt(5, 9);
    return buildQuestion(`${a} x ${b} = ?`, a * b);
  }

  if (type === "divide") {
    const divisor = randomInt(2, 9);
    const answer = randomInt(5, 12);
    return buildQuestion(`${divisor * answer} : ${divisor} = ?`, answer);
  }

  if (type === "missingMultiply") {
    const hidden = randomInt(2, 9);
    const known = randomInt(2, 9);
    return buildQuestion(`? x ${known} = ${hidden * known}`, hidden);
  }

  const a = randomInt(60, 240);
  const answer = randomInt(20, 160);
  return buildQuestion(`${a} + ? = ${a + answer}`, answer);
}

function makeHardQuestion(index) {
  const type = index % 3 === 0
    ? "word"
    : choose(["expressionAddThenDivide", "expressionMultiplySubtract", "expressionAddMultiply", "word"]);

  if (type === "expressionAddThenDivide") {
    const divisor = randomInt(2, 9);
    const answer = randomInt(8, 15);
    const total = divisor * answer;
    const a = randomInt(6, total - 5);
    const b = total - a;
    return buildQuestion(`(${a} + ${b}) : ${divisor} = ?`, answer);
  }

  if (type === "expressionMultiplySubtract") {
    const a = randomInt(3, 9);
    const b = randomInt(3, 9);
    const subtract = randomInt(5, Math.min(30, a * b - 1));
    return buildQuestion(`${a} x ${b} - ${subtract} = ?`, a * b - subtract);
  }

  if (type === "expressionAddMultiply") {
    const a = randomInt(12, 45);
    const b = randomInt(2, 9);
    const c = randomInt(3, 9);
    return buildQuestion(`${a} + ${b} x ${c} = ?`, a + b * c);
  }

  return makeHardWordQuestion();
}

function makeHardWordQuestion() {
  const type = choose(["boxesMinus", "pagesAdd", "groupsDivide"]);

  if (type === "boxesMinus") {
    const boxes = randomInt(3, 9);
    const perBox = randomInt(3, 9);
    const giveAway = randomInt(4, boxes * perBox - 3);
    return buildQuestion(
      `Lan có ${boxes} hộp, mỗi hộp ${perBox} viên bi. Lan cho bạn ${giveAway} viên. Lan còn bao nhiêu viên bi?`,
      boxes * perBox - giveAway,
    );
  }

  if (type === "pagesAdd") {
    const days = randomInt(3, 8);
    const perDay = randomInt(4, 9);
    const extra = randomInt(6, 28);
    return buildQuestion(
      `Minh đọc ${days} ngày, mỗi ngày ${perDay} trang. Sau đó Minh đọc thêm ${extra} trang. Minh đã đọc tất cả bao nhiêu trang?`,
      days * perDay + extra,
    );
  }

  const groups = randomInt(3, 9);
  const each = randomInt(3, 9);
  const extra = randomInt(2, 9);
  return buildQuestion(
    `Có ${groups * each + extra} cái kẹo, đã chia đều cho ${groups} bạn mỗi bạn ${each} cái. Còn lại bao nhiêu cái kẹo?`,
    extra,
  );
}

function buildQuestion(text, answer) {
  return {
    text,
    answer,
    options: makeOptions(answer),
    key: normalizeQuestionKey(text),
  };
}

function makeOptions(answer) {
  const options = new Set([answer]);
  const offsets = shuffle([-12, -10, -8, -6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 8, 10, 12]);

  for (const offset of offsets) {
    if (options.size >= 4) {
      break;
    }

    const candidate = answer + offset;
    if (candidate >= 0) {
      options.add(candidate);
    }
  }

  while (options.size < 4) {
    options.add(answer + randomInt(1, 18));
  }

  return shuffle(Array.from(options));
}

function normalizeQuestionKey(text) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function formatTime(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatStoredDate(value) {
  return formatDateTime(new Date(value));
}

function formatScore(score) {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function choose(items) {
  return items[randomInt(0, items.length - 1)];
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
