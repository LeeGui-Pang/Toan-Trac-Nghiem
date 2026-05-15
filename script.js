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
  const selectedValue = button.dataset.option;
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
    } else if (selected === String(question.answer)) {
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
    return makeMediumQuestion(index);
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

function makeMediumQuestion(index) {
  const range = getMediumRange(index);
  const pattern = index % 4;

  if (pattern === 0 || pattern === 1) {
    return makeMediumDirectQuestion(range, index);
  }

  if (pattern === 2) {
    return makeMediumMissingQuestion(range, index);
  }

  return makeMediumWordQuestion(range, index);
}

function getMediumRange(index) {
  if (index < 5) {
    return 100;
  }

  if (index < 10) {
    return 1000;
  }

  if (index < 15) {
    return 10000;
  }

  return 100000;
}

function makeMediumDirectQuestion(range, index) {
  const type = ["add", "subtract", "multiply", "divide"][index % 4];

  if (type === "add") {
    const a = randomInt(Math.max(8, Math.floor(range * 0.18)), Math.floor(range * 0.55));
    const b = randomInt(Math.max(5, Math.floor(range * 0.08)), range - a);
    return buildQuestion(`${a} + ${b} = ?`, a + b);
  }

  if (type === "subtract") {
    const a = randomInt(Math.max(30, Math.floor(range * 0.45)), range);
    const b = randomInt(Math.max(5, Math.floor(range * 0.08)), a - 1);
    return buildQuestion(`${a} - ${b} = ?`, a - b);
  }

  if (type === "multiply") {
    const multiplier = randomInt(2, 9);
    const a = randomInt(Math.max(3, Math.floor(range * 0.08)), Math.floor(range / multiplier));
    return buildQuestion(`${a} x ${multiplier} = ?`, a * multiplier);
  }

  const divisor = randomInt(2, 9);
  const answer = randomInt(Math.max(3, Math.floor(range * 0.06)), Math.floor(range / divisor));
  return buildQuestion(`${answer * divisor} : ${divisor} = ?`, answer);
}

function makeMediumMissingQuestion(range, index) {
  const type = ["missingAdd", "missingSubtract", "missingMultiply", "missingDivide"][Math.floor(index / 4) % 4];

  if (type === "missingAdd") {
    const a = randomInt(Math.max(8, Math.floor(range * 0.15)), Math.floor(range * 0.55));
    const answer = randomInt(Math.max(5, Math.floor(range * 0.08)), range - a);
    return buildQuestion(`${a} + ? = ${a + answer}`, answer);
  }

  if (type === "missingSubtract") {
    const answer = randomInt(Math.max(5, Math.floor(range * 0.08)), Math.floor(range * 0.45));
    const b = randomInt(Math.max(5, Math.floor(range * 0.07)), range - answer);
    return buildQuestion(`? - ${b} = ${answer}`, answer + b);
  }

  if (type === "missingMultiply") {
    const multiplier = randomInt(2, 9);
    const answer = randomInt(Math.max(3, Math.floor(range * 0.05)), Math.floor(range / multiplier));
    return buildQuestion(`? x ${multiplier} = ${answer * multiplier}`, answer);
  }

  const divisor = randomInt(2, 9);
  const answer = randomInt(Math.max(3, Math.floor(range * 0.04)), Math.floor(range / divisor));
  return buildQuestion(`? : ${divisor} = ${answer}`, answer * divisor);
}

function makeMediumWordQuestion(range, index) {
  const type = ["wordAdd", "wordSubtract", "wordMultiply", "wordDivide"][Math.floor(index / 4) % 4];

  if (type === "wordAdd") {
    const first = randomInt(Math.max(8, Math.floor(range * 0.2)), Math.floor(range * 0.58));
    const second = randomInt(Math.max(5, Math.floor(range * 0.1)), range - first);
    return buildQuestion(
      `Một cửa hàng buổi sáng bán ${first} quyển vở, buổi chiều bán ${second} quyển vở. Hỏi cửa hàng bán tất cả bao nhiêu quyển vở?`,
      first + second,
    );
  }

  if (type === "wordSubtract") {
    const total = randomInt(Math.max(30, Math.floor(range * 0.5)), range);
    const sold = randomInt(Math.max(5, Math.floor(range * 0.1)), total - 1);
    return buildQuestion(
      `Một kho có ${total} kg gạo, đã bán ${sold} kg. Hỏi kho còn lại bao nhiêu kg gạo?`,
      total - sold,
    );
  }

  if (type === "wordMultiply") {
    const multiplier = randomInt(2, 9);
    const each = randomInt(Math.max(3, Math.floor(range * 0.06)), Math.floor(range / multiplier));
    return buildQuestion(
      `Một cửa hàng có ${multiplier} thùng, mỗi thùng ${each} quyển sách. Hỏi có tất cả bao nhiêu quyển sách?`,
      each * multiplier,
    );
  }

  const divisor = randomInt(2, 9);
  const each = randomInt(Math.max(3, Math.floor(range * 0.05)), Math.floor(range / divisor));
  return buildQuestion(
    `Có ${each * divisor} cái bánh chia đều cho ${divisor} lớp. Hỏi mỗi lớp nhận được bao nhiêu cái bánh?`,
    each,
  );
}

function makeHardQuestion(index) {
  const type = index % 10 < 3
    ? "word"
    : choose(["largeMultiplySubtract", "largeMultiplyAdd", "subtractThenDivide", "addThenDivide", "largeDivideRemainder"]);

  if (type === "word") {
    return makeHardWordQuestion();
  }

  if (type === "largeMultiplySubtract") {
    const oneDigit = randomInt(2, 9);
    const large = randomInt(1200, Math.floor(98000 / oneDigit));
    const product = large * oneDigit;
    const subtract = randomInt(300, Math.min(25000, product - 100));
    return buildQuestion(`${large} x ${oneDigit} - ${subtract} = ?`, product - subtract);
  }

  if (type === "largeMultiplyAdd") {
    const oneDigit = randomInt(2, 9);
    const large = randomInt(1000, Math.floor(90000 / oneDigit));
    const add = randomInt(500, Math.min(99999 - large * oneDigit, 12000));
    return buildQuestion(`${add} + ${large} x ${oneDigit} = ?`, add + large * oneDigit);
  }

  if (type === "subtractThenDivide") {
    const divisor = randomInt(2, 9);
    const quotient = randomInt(1200, Math.floor(82000 / divisor));
    const total = quotient * divisor;
    const subtract = randomInt(700, Math.min(17000, 99999 - total));
    const start = total + subtract;
    return buildQuestion(`(${start} - ${subtract}) : ${divisor} = ?`, quotient);
  }

  if (type === "addThenDivide") {
    const divisor = randomInt(2, 9);
    const quotient = randomInt(1500, 10000);
    const total = quotient * divisor;
    const first = randomInt(900, total - 500);
    const second = total - first;
    return buildQuestion(`(${first} + ${second}) : ${divisor} = ?`, quotient);
  }

  return makeLargeDivisionQuestion();
}

function makeHardWordQuestion() {
  const type = choose(["booksMultiplyMinus", "warehouseMultiplyAdd", "shareWithRemainder"]);

  if (type === "booksMultiplyMinus") {
    const boxes = randomInt(2, 9);
    const perBox = randomInt(1200, Math.floor(90000 / boxes));
    const giveAway = randomInt(500, Math.min(15000, boxes * perBox - 1000));
    return buildQuestion(
      `Thư viện có ${boxes} thùng sách, mỗi thùng ${perBox} quyển. Sau đó tặng đi ${giveAway} quyển. Thư viện còn bao nhiêu quyển sách?`,
      boxes * perBox - giveAway,
    );
  }

  if (type === "warehouseMultiplyAdd") {
    const bags = randomInt(2, 9);
    const perBag = randomInt(1000, Math.floor(85000 / bags));
    const extra = randomInt(700, Math.min(12000, 99999 - bags * perBag));
    return buildQuestion(
      `Một kho có ${bags} bao gạo, mỗi bao ${perBag} kg. Kho nhập thêm ${extra} kg. Hỏi kho có tất cả bao nhiêu kg gạo?`,
      bags * perBag + extra,
    );
  }

  const divisor = randomInt(2, 9);
  const quotient = randomInt(1200, 11000);
  const remainder = randomInt(1, divisor - 1);
  const afterGift = quotient * divisor + remainder;
  const gift = randomInt(500, Math.min(12000, 99999 - afterGift));
  const total = afterGift + gift;
  return buildQuestion(
    `Có ${total} quyển vở, đã tặng ${gift} quyển. Số vở còn lại chia đều cho ${divisor} lớp. Mỗi lớp nhận được bao nhiêu quyển và còn dư bao nhiêu quyển?`,
    formatRemainderAnswer(quotient, remainder),
  );
}

function makeLargeDivisionQuestion() {
  const divisor = randomInt(2, 9);
  const quotient = randomInt(1200, 11000);
  const remainder = randomInt(1, divisor - 1);
  const dividend = quotient * divisor + remainder;
  const add = randomInt(500, Math.min(12000, 99999 - dividend));
  return buildQuestion(`(${dividend + add} - ${add}) : ${divisor} = ?`, formatRemainderAnswer(quotient, remainder));
}

function buildQuestion(text, answer) {
  return {
    text,
    answer: String(answer),
    options: makeOptions(answer),
    key: normalizeQuestionKey(text),
  };
}

function makeOptions(answer) {
  if (typeof answer === "string" && answer.includes("dư")) {
    return makeRemainderOptions(answer);
  }

  const numericAnswer = Number(answer);
  const options = new Set([String(numericAnswer)]);
  const offsets = shuffle([-12, -10, -8, -6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 8, 10, 12]);

  for (const offset of offsets) {
    if (options.size >= 4) {
      break;
    }

    const candidate = numericAnswer + offset;
    if (candidate >= 0) {
      options.add(String(candidate));
    }
  }

  while (options.size < 4) {
    options.add(String(numericAnswer + randomInt(1, 18)));
  }

  return shuffle(Array.from(options));
}

function makeRemainderOptions(answer) {
  const { quotient, remainder } = parseRemainderAnswer(answer);
  const options = new Set([answer]);
  const variants = shuffle([
    formatRemainderAnswer(quotient + 1, remainder),
    formatRemainderAnswer(Math.max(0, quotient - 1), remainder),
    formatRemainderAnswer(quotient + randomInt(2, 5), remainder),
    formatRemainderAnswer(Math.max(0, quotient - randomInt(2, 5)), remainder),
    formatRemainderAnswer(quotient, Math.max(0, remainder - 1)),
    formatRemainderAnswer(quotient, remainder + 1),
    formatRemainderAnswer(quotient + 1, Math.max(0, remainder - 1)),
    formatRemainderAnswer(Math.max(0, quotient - 1), remainder + 1),
  ]);

  for (const variant of variants) {
    if (options.size >= 4) {
      break;
    }
    options.add(variant);
  }

  while (options.size < 4) {
    options.add(formatRemainderAnswer(quotient + randomInt(1, 9), remainder));
  }

  return shuffle(Array.from(options));
}

function parseRemainderAnswer(answer) {
  const match = String(answer).match(/^(\d+)\s+dư\s+(\d+)$/);
  return {
    quotient: match ? Number(match[1]) : 0,
    remainder: match ? Number(match[2]) : 0,
  };
}

function formatRemainderAnswer(quotient, remainder) {
  return `${quotient} dư ${remainder}`;
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
