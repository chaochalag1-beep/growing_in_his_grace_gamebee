
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getDatabase, ref, set, get, update, onValue, runTransaction, remove, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const $ = id => document.getElementById(id);

// SOUNDS
const gameSounds = {
  correct: new Audio("./sounds/correct.mp3"),
  wrong: new Audio("./sounds/wrong.mp3"),
  background: new Audio("./sounds/background.mp3"),
  victory: new Audio("./sounds/victory.mp3")
};

gameSounds.background.loop = true;
gameSounds.background.volume = 0.25;
gameSounds.correct.volume = 0.8;
gameSounds.wrong.volume = 0.8;
gameSounds.victory.volume = 0.9;

let backgroundStarted = false;
let victoryPlayedForRoom = "";

function playGameSound(name) {
  const sound = gameSounds[name];
  if (!sound) return;

  sound.currentTime = 0;
  sound.play().catch(error => {
    console.log("Hindi ma-play ang sound:", name, error);
  });
}

function startBackgroundMusic() {
  if (backgroundStarted) return;
  backgroundStarted = true;

  gameSounds.background.play().catch(error => {
    backgroundStarted = false;
    console.log("Hindi ma-play ang background music:", error);
  });
}

document.addEventListener("click", startBackgroundMusic);

const QUESTIONS = [
 {q:"Ayon sa Lucas 2:52, paano lumago si Jesus?",a:["Sa kayamanan lamang","Sa karunungan, pangangatawan, at biyaya ng Diyos at ng tao","Sa kapangyarihan lamang"],c:1},
 {q:"Ano ang ibig sabihin ng “Trust God”?",a:["Magtiwala sa Diyos","Magtiwala sa sarili lamang","Matakot sa Diyos"],c:0},
 {q:"Bakit mahalagang magtiwala sa Diyos?",a:["Upang maging sikat","Upang makuha ang lahat ng gusto natin","Dahil ang Diyos ang ating gabay at kalakasan"],c:2},
 {q:"Paano tayo lalago sa pananampalataya?",a:["Sa pag-iwas sa Bibliya","Sa pagbabasa ng Bibliya, pananalangin, at pagsunod sa Diyos","Sa hindi pakikinig sa Diyos"],c:1},
 {q:"Ano ang ibig sabihin ng “Grow in God”?",a:["Lumago sa Diyos","Lumago sa kayamanan","Lumago sa katanyagan"],c:0},
 {q:"Ayon sa Marcos 10:14, ano ang sinabi ni Jesus tungkol sa mga bata?",a:["Huwag silang lumapit sa Kanya","Hayaan silang lumapit sa Kanya","Pauwiin silang lahat"],c:1},
 {q:"Bakit mahalagang lumapit tayo kay Jesus?",a:["Upang matuto sa Kanyang mga aral","Upang maging mayaman","Upang maging sikat"],c:0},
 {q:"Ano ang ibig sabihin ng “Be Humble”?",a:["Magmayabang","Magpakumbaba","Magmataas sa kapwa"],c:1},
 {q:"Paano natin maipapakita ang pagpapakumbaba?",a:["Sa pagmamataas","Sa pagsisi sa iba","Sa pakikinig, paggalang, at paghingi ng tawad"],c:2},
 {q:"Ano ang tatlong pangunahing aral ng “Growing in His Grace”?",a:["Trust God, Grow in God, at Be Humble","Be Rich, Be Famous, at Be Powerful","Be First, Be Strong, at Be Popular"],c:0}
];

const BASE_PRIZE = 1000;
const PRIZE_STEP = 100;
const MAX_PLAYERS = 50;
const QUESTION_SECONDS = 4;
const BOARD_SECONDS = 1000;

let app, auth, db, uid, playerName = "", roomCode = "", isHost = false, roomData = null;
let unsubRoom = null, unsubPlayers = null, unsubAnswers = null;
let clockInterval = null, hostAdvanceTimeout = null;
let localDeadline = 0, selected = false, answerLocked = false;
let currentQuestion = -1, localAnswerListener = null;

function showScreen(name) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  $("screen-" + name).classList.add("active");
}

function err(id, msg) {
  $(id).textContent = msg || "";
}

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 1900);
}

function cleanName(v) {
  return v.trim().replace(/\s+/g, " ").slice(0, 24);
}

function newCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function roomRef() {
  return ref(db, `rooms/${roomCode}`);
}

function playersRef() {
  return ref(db, `rooms/${roomCode}/players`);
}

function answersRef(q = currentQuestion) {
  return ref(db, `rooms/${roomCode}/answers/${q}`);
}

function prizeForRank(rank) {
  return Math.max(0, BASE_PRIZE - PRIZE_STEP * rank);
}

function fmt(n) {
  return (n || 0).toLocaleString("en-US");
}

function safeConfig() {
  return firebaseConfig.apiKey &&
    !firebaseConfig.apiKey.startsWith("PASTE_") &&
    firebaseConfig.projectId &&
    !firebaseConfig.projectId.startsWith("PASTE_");
}

async function init() {
  if (!safeConfig()) {
    err("homeError", "Ilagay muna ang Firebase Web config sa firebase-config.js. Sundin ang SETUP.md.");
    return;
  }

  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getDatabase(app);
    const cred = await signInAnonymously(auth);
    uid = cred.user.uid;
  } catch (e) {
    console.error(e);
    err("homeError", "Hindi makakonekta sa Firebase. Tingnan ang config, Anonymous Auth, at internet.");
  }
}

function stopLocalTimers() {
  if (clockInterval) clearInterval(clockInterval);
  clockInterval = null;
  if (hostAdvanceTimeout) clearTimeout(hostAdvanceTimeout);
  hostAdvanceTimeout = null;
}

function detachListeners() {
  if (unsubRoom) unsubRoom();
  if (unsubPlayers) unsubPlayers();
  if (unsubAnswers) unsubAnswers();
  unsubRoom = unsubPlayers = unsubAnswers = null;
}

function leaveLocal() {
  stopLocalTimers();
  detachListeners();

  if (localAnswerListener) localAnswerListener();
  localAnswerListener = null;

  roomCode = "";
  isHost = false;
  roomData = null;
  currentQuestion = -1;
  selected = false;
  answerLocked = false;
  victoryPlayedForRoom = "";
  $("timerCircle").classList.add("hidden");
}

async function createRoom() {
  if (!db) {
    err("homeError", "Hindi pa nakakonekta sa Firebase.");
    return;
  }

  playerName = cleanName($("playerName").value);

  if (!playerName) {
    err("homeError", "Ilagay muna ang pangalan.");
    return;
  }

  const btn = $("createRoomBtn");
  btn.disabled = true;
  err("homeError", "");

  try {
    let code, exists = true;

    for (let i = 0; i < 6 && exists; i++) {
      code = newCode();
      exists = (await get(ref(db, `rooms/${code}`))).exists();
    }

    if (exists) throw new Error("Hindi makagawa ng unique room code. Subukan ulit.");

    roomCode = code;
    isHost = true;

    await set(roomRef(), {
      code,
      hostUid: uid,
      status: "lobby",
      questionIndex: -1,
      createdAt: serverTimestamp(),
      players: {
        [uid]: {
          name: playerName,
          total: 0,
          joinedAt: Date.now()
        }
      },
      answers: {},
      roundResults: {},
      settings: {
        maxPlayers: MAX_PLAYERS,
        questionSeconds: QUESTION_SECONDS
      }
    });

    enterRoom();
  } catch (e) {
    console.error(e);
    err("homeError", "Hindi nagawa ang room. Suriin ang Firebase Database Rules.");
    roomCode = "";
  } finally {
    btn.disabled = false;
  }
}

async function joinRoom() {
  if (!db) {
    err("homeError", "Hindi pa nakakonekta sa Firebase.");
    return;
  }

  playerName = cleanName($("playerName").value);
  roomCode = $("roomCodeInput").value.trim().toUpperCase();

  if (!playerName) {
    err("homeError", "Ilagay muna ang pangalan.");
    return;
  }

  if (!/^[A-Z0-9]{6}$/.test(roomCode)) {
    err("homeError", "Ilagay ang 6-character room code.");
    return;
  }

  const btn = $("joinRoomBtn");
  btn.disabled = true;
  err("homeError", "");

  try {
    const snap = await get(roomRef());

    if (!snap.exists()) throw new Error("Walang room na may ganitong code.");

    const room = snap.val();

    if (room.status === "finished") throw new Error("Tapos na ang larong ito.");

    const ps = room.players || {};

    if (!ps[uid] && Object.keys(ps).length >= MAX_PLAYERS) {
      throw new Error("Puno na ang room (50 players).");
    }

    isHost = room.hostUid === uid;

    await update(ref(db, `rooms/${roomCode}/players/${uid}`), {
      name: playerName,
      joinedAt: Date.now(),
      total: ps[uid]?.total || 0
    });

    enterRoom();
  } catch (e) {
    console.error(e);
    err("homeError", e.message || "Hindi makasali. Suriin ang room code at connection.");
    roomCode = "";
  } finally {
    btn.disabled = false;
  }
}

function enterRoom() {
  showScreen("lobby");
  $("roomCodeDisplay").textContent = roomCode;
  $("startGameBtn").classList.toggle("hidden", !isHost);
  $("lobbyMessage").textContent = isHost
    ? "Ikaw ang host. Kapag handa na ang lahat, simulan ang laro."
    : "Hintayin ang host na simulan ang laro.";

  err("lobbyError", "");
  detachListeners();

  unsubRoom = onValue(roomRef(), snap => {
    if (!snap.exists()) {
      toast("Isinara ang room.");
      leaveLocal();
      showScreen("home");
      return;
    }

    roomData = snap.val();
    syncRoomUI();
  });

  unsubPlayers = onValue(playersRef(), snap => renderPlayers(snap.val() || {}));
}

function syncRoomUI() {
  if (!roomData) return;

  if (roomData.status === "playing" && $("screen-lobby").classList.contains("active")) {
    showScreen("game");
  }

  if (roomData.status === "playing" && roomData.phase === "leaderboard") {
    const result = (roomData.roundResults || {})[roomData.questionIndex];
    if (result) showRoundBoardFromResult(roomData.questionIndex, result);
  } else if (roomData.status === "playing") {
    renderQuestion(roomData.questionIndex, roomData.questionStartedAt);
  }

  if (roomData.status === "finished") showFinal(roomData.players || {});
}

function renderPlayers(players) {
  const entries = Object.entries(players || {});
  $("playerCount").textContent = entries.length;

  $("playerList").innerHTML = entries
    .sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0))
    .map(([id, p]) =>
      `<span class="player-chip">${escapeHtml(p.name || "Player")}${id === roomData?.hostUid ? " 👑" : ""}</span>`
    ).join("");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

$("copyCodeBtn").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(roomCode);
    toast("Nakopya ang room code!");
  } catch {
    toast("Room code: " + roomCode);
  }
});

$("leaveRoomBtn").addEventListener("click", () => {
  leaveLocal();
  showScreen("home");
});

$("createRoomBtn").addEventListener("click", createRoom);
$("joinRoomBtn").addEventListener("click", joinRoom);

$("startGameBtn").addEventListener("click", async () => {
  if (!isHost || !roomCode) return;

  try {
    await update(roomRef(), {
      status: "playing",
      phase: "question",
      questionIndex: 0,
      questionStartedAt: Date.now(),
      answers: {},
      roundResults: {}
    });
  } catch (e) {
    console.error(e);
    err("lobbyError", "Hindi masimulan. Suriin ang database rules.");
  }
});

function renderQuestion(index, startedAt) {
  if (index < 0 || index >= QUESTIONS.length) return;

  const changed = index !== currentQuestion;
  currentQuestion = index;

  if (changed) {
    selected = false;
    answerLocked = false;
    showScreen("game");
    $("answerFeedback").textContent = "";
    $("questionCounter").textContent = `TANONG ${index + 1} / ${QUESTIONS.length}`;
    $("progressBar").style.width = `${((index + 1) / QUESTIONS.length) * 100}%`;
    $("roomBadge").textContent = "ROOM " + roomCode;

    const q = QUESTIONS[index];

    $("questionText").textContent = q.q;
    $("answerOptions").innerHTML = q.a.map((a, i) =>
      `<button class="answer-btn" data-index="${i}"><span class="answer-letter">${"ABC"[i]}</span><span>${escapeHtml(a)}</span></button>`
    ).join("");

    $("answerOptions").querySelectorAll("button").forEach(b => {
      b.addEventListener("click", () => submitAnswer(Number(b.dataset.index)));
    });

    if (localAnswerListener) localAnswerListener();

    localAnswerListener = onValue(answersRef(index), s => {
      const ans = s.val() || {};
      $("answeredCount").textContent = Object.keys(ans).length + " sumagot";

      if (ans[uid]) {
        selected = true;
        answerLocked = true;
        markAnswer(ans[uid].choice, QUESTIONS[index].c);
      }
    });
  }

  $("timerCircle").classList.remove("hidden");
  startClock(startedAt || Date.now(), index);
}

function startClock(startedAt, index) {
  stopLocalTimers();
  localDeadline = startedAt + QUESTION_SECONDS * 1000;

  const tick = () => {
    if (index !== currentQuestion) return;

    const remain = Math.max(0, Math.ceil((localDeadline - Date.now()) / 1000));
    $("timerCircle").textContent = remain;
    $("timerCircle").classList.toggle("urgent", remain <= 1);

    if (Date.now() >= localDeadline) {
      clearInterval(clockInterval);
      clockInterval = null;
      lockOptions();

      $("answerFeedback").textContent = selected
        ? "Sagot naitala!"
        : "Tapos na ang oras!";

      if (isHost) scheduleAdvance(index);
    }
  };

  tick();
  clockInterval = setInterval(tick, 100);
}

function lockOptions() {
  document.querySelectorAll(".answer-btn").forEach(b => b.disabled = true);
}

function markAnswer(choice, correct) {
  document.querySelectorAll(".answer-btn").forEach((b, i) => {
    b.disabled = true;
    if (i === correct) b.classList.add("correct");
    else if (i === choice) b.classList.add("wrong");
  });

  $("answerFeedback").textContent = choice === correct
    ? "Tamang sagot!"
    : "Naitala ang sagot.";
}

async function submitAnswer(choice) {
  if (selected || answerLocked || !roomCode || currentQuestion < 0) return;

  if (Date.now() >= localDeadline) {
    $("answerFeedback").textContent = "Tapos na ang oras!";
    lockOptions();
    return;
  }

  selected = true;
  answerLocked = true;
  lockOptions();

  document.querySelectorAll(".answer-btn")[choice]?.classList.add("selected");

  const correct = choice === QUESTIONS[currentQuestion].c;

  try {
    const answerRef = ref(db, `rooms/${roomCode}/answers/${currentQuestion}/${uid}`);

    const result = await runTransaction(answerRef, current =>
      current === null
        ? { choice, correct, answeredAt: Date.now(), playerName }
        : current
    );

    if (result.committed) {
      playGameSound(correct ? "correct" : "wrong");
      markAnswer(choice, QUESTIONS[currentQuestion].c);
      $("answerFeedback").textContent = correct
        ? "Tamang sagot!"
        : "Naitala ang sagot.";
    }
  } catch (e) {
    console.error(e);
    $("answerFeedback").textContent = "Hindi naitala ang sagot. Suriin ang internet.";
  }
}

function scheduleAdvance(index) {
  if (hostAdvanceTimeout) return;

  const delay = Math.max(0, localDeadline - Date.now()) + 100;

  hostAdvanceTimeout = setTimeout(() => closeQuestion(index), delay);
}

async function closeQuestion(index) {
  hostAdvanceTimeout = null;

  if (!isHost || !roomCode || currentQuestion !== index) return;

  try {
    const snap = await get(ref(db, `rooms/${roomCode}/answers/${index}`));
    const answers = snap.val() || {};

    const correct = Object.entries(answers)
      .filter(([id, a]) => a.correct)
      .sort((a, b) => (a[1].answeredAt || 0) - (b[1].answeredAt || 0));

    const prizeMap = {};
    correct.forEach(([id, a], rank) => {
      prizeMap[id] = prizeForRank(rank);
    });

    const psnap = await get(playersRef());
    const players = psnap.val() || {};
    const updates = {};

    for (const [id, p] of Object.entries(players)) {
      if (prizeMap[id]) {
        updates[`players/${id}/total`] = (p.total || 0) + prizeMap[id];
      }
    }

    updates[`roundResults/${index}`] = {
      correct: correct.map(([id, a], rank) => ({
        uid: id,
        name: a.playerName || players[id]?.name || "Player",
        prize: prizeForRank(rank),
        answeredAt: a.answeredAt || 0
      })),
      closedAt: Date.now()
    };

    updates.phase = "leaderboard";
    await update(roomRef(), updates);

    await new Promise(resolve => setTimeout(resolve, BOARD_SECONDS));

    if (index + 1 < QUESTIONS.length) {
      await update(roomRef(), {
        phase: "question",
        questionIndex: index + 1,
        questionStartedAt: Date.now()
      });
    } else {
      await update(roomRef(), {
        status: "finished",
        phase: "finished",
        finishedAt: Date.now()
      });
    }
  } catch (e) {
    console.error(e);
    err("lobbyError", "May problema sa pagtatapos ng tanong. I-refresh at tingnan ang Firebase rules.");
  }
}

function showRoundBoardFromResult(index, result) {
  const top = (result.correct || []).slice(0, 3);

  $("leaderboardQuestion").textContent = `Tanong ${index + 1} ng ${QUESTIONS.length}`;

  $("topThree").innerHTML = top.length
    ? top.map((p, i) =>
      `<div class="rank-row"><div class="rank-number">${["🥇", "🥈", "🥉"][i]}</div><div><div class="rank-name">${escapeHtml(p.name || "Player")}</div><div class="rank-sub">Tamang sagot · #${i + 1} sa bilis</div></div><div class="rank-prize">₱${fmt(p.prize)}</div></div>`
    ).join("")
    : `<p class="muted">Walang tamang sagot sa tanong na ito.</p>`;

  showScreen("leaderboard");
}

function showFinal(players) {
  stopLocalTimers();
  $("timerCircle").classList.add("hidden");

  if (localAnswerListener) localAnswerListener();
  localAnswerListener = null;

  if (victoryPlayedForRoom !== roomCode) {
    victoryPlayedForRoom = roomCode;
    playGameSound("victory");
  }

  const ranking = Object.entries(players).sort((a, b) =>
    (b[1].total || 0) - (a[1].total || 0) ||
    ((a[1].joinedAt || 0) - (b[1].joinedAt || 0))
  );

  $("finalRanking").innerHTML = ranking.map(([id, p], i) =>
    `<div class="rank-row"><div class="rank-number">${i < 3 ? ["🥇", "🥈", "🥉"][i] : `#${i + 1}`}</div><div><div class="rank-name">${escapeHtml(p.name || "Player")}${id === uid ? " (Ikaw)" : ""}</div><div class="rank-sub">Kabuuang premyo</div></div><div class="rank-prize">₱${fmt(p.total || 0)}</div></div>`
  ).join("");

  showScreen("results");
}

$("backHomeBtn").addEventListener("click", () => {
  leaveLocal();
  showScreen("home");
});

window.addEventListener("beforeunload", () => {
  stopLocalTimers();
  detachListeners();
});

init();
