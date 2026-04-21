document.addEventListener("DOMContentLoaded", () => {
  let audio = null;

  const correctSound = new Audio("correct.mp3");
  const roundEndSound = new Audio("roundEnded.mp3");

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  let guessedPlayers = [];
  let lastUsers = [];

  // ✅ ONLY DECLARE ONCE
  let roundTimer = null;
  let timeLeft = 30;

  const guessInput = document.getElementById("guessInput");
  const guessButton = document.getElementById("guessBtn");

  const ws = new WebSocket("wss://quiz-songs-server.onrender.com");

  // =========================
  // 🎯 SEND GUESS
  // =========================
  function sendGuess() {
    const value = guessInput.value.trim();
    if (!value) return;

    if (ws.readyState !== WebSocket.OPEN) {
      console.log("WebSocket not ready");
      return;
    }

    ws.send(JSON.stringify({
      type: "guess",
      guess: value
    }));

    guessInput.value = "";
    guessInput.focus();
  }

  guessInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendGuess();
    }
  });

  guessButton.addEventListener("click", sendGuess);

  // =========================
  // 🎮 JOIN ROOM
  // =========================
  ws.onopen = () => {
    const username = sessionStorage.getItem("skribbleUsername");
    const roomCode = new URLSearchParams(window.location.search).get("room");

    ws.send(JSON.stringify({
      type: "rejoinRoom",
      roomCode,
      username
    }));
  };

  // =========================
  // ⏱ TIMER
  // =========================
  function startTimer(duration = 30) {
    const timerEl = document.getElementById("timer");
    const bar = document.getElementById("timerBar");

    clearInterval(roundTimer);

    timeLeft = duration;
    timerEl.textContent = timeLeft;

    if (bar) {
      bar.style.width = "100%";
      bar.style.background = "#4caf50"; // reset color
    }

    timerEl.style.color = "white";

    roundTimer = setInterval(() => {
      timeLeft--;
      timerEl.textContent = timeLeft;

      if (bar) {
        const percent = (timeLeft / duration) * 100;
        bar.style.width = percent + "%";
      }

      if (timeLeft <= 5) {
        timerEl.style.color = "red";
        if (bar) bar.style.background = "red";
      }

      if (timeLeft <= 0) {
        clearInterval(roundTimer);
      }
    }, 1000);
  }

  function stopTimer() {
    clearInterval(roundTimer);

    const timerEl = document.getElementById("timer");
    const bar = document.getElementById("timerBar");

    if (timerEl) timerEl.textContent = "0";
    if (bar) bar.style.width = "0%";
  }

  // =========================
  // 🎵 PLAY SONG
  // =========================
  async function playSong(song) {
    try {
      if (!song) return;

      document.getElementById("status").innerText = "Loading...";

      if (audio) {
        audio.pause();
        audio = null;
      }

      audio = new Audio(song.preview);
      audio.volume = 0.3;

      await wait(3000);
      await audio.play();

      document.getElementById("status").innerText = "Now Playing";
    } catch (err) {
      console.error(err);
    }
  }

  // =========================
  // 💬 CHAT
  // =========================
  function addChatMessage(data) {
    const chat = document.getElementById("chatBox");

    const div = document.createElement("div");
    div.className = "chat-msg";

    if (data.system) {
      div.classList.add("chat-system");
      div.textContent = data.message;
    } else {
      div.textContent = `${data.username}: ${data.message}`;
    }

    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  }

  // =========================
  // 👥 PLAYER LIST
  // =========================
  function updatePlayerList(users) {
    lastUsers = users;

    const container = document.getElementById("playerList");
    container.innerHTML = "";

    users.forEach((user) => {
      const div = document.createElement("div");
      div.className = "player";

      if (guessedPlayers.includes(user.username)) {
        div.classList.add("guessed");
      }

      div.innerHTML = `
        <span>${user.username}</span>
        <span>${user.score}</span>
      `;

      container.appendChild(div);
    });
  }

  // =========================
  // 🏆 LEADERBOARD
  // =========================
  async function showLeaderboard(leaderboard, song) {
    const popup = document.getElementById("leaderboardPopup");
    const content = document.getElementById("leaderboardContent");

    content.innerHTML = `
      <h2>🎵 ${song.title}</h2>
      <p>${song.artist}</p>
      <img src="${song.cover}" style="width:150px;border-radius:10px"/>
      <h3>Leaderboard</h3>
    `;

    leaderboard
      .sort((a, b) => b.score - a.score)
      .forEach((user) => {
        const div = document.createElement("div");
        div.textContent = `${user.username} - ${user.score}`;
        content.appendChild(div);
      });

    popup.style.display = "flex";

    guessInput.disabled = true;
    guessButton.disabled = true;

    await wait(5000);

    popup.style.display = "none";

    guessInput.disabled = false;
    guessButton.disabled = false;
    guessInput.focus();
  }

  // =========================
  // 📩 HANDLE MESSAGES
  // =========================
  ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);

    switch (data.type) {
      case "new-round":
        guessedPlayers = [];
        updatePlayerList(lastUsers);

        startTimer(data.duration || 30);

        document.getElementById("chatBox").innerHTML = "";
        guessInput.value = "";
        document.getElementById("status").innerText = "Get ready...";

        if (audio) {
          audio.pause();
          audio = null;
        }

        document.getElementById("roundDisplay").textContent =
          `Round ${data.round}`;

        guessInput.focus();
        playSong(data.song);
        break;

      case "roomState":
        const list = document.getElementById("scoreDisplay");
        if (list) {
          list.innerHTML = "";
          data.users.forEach((user) => {
            const li = document.createElement("li");
            li.textContent = `${user.username} - ${user.score} pts`;
            list.appendChild(li);
          });
        }

        updatePlayerList(data.users);
        break;

      case "playerGuessed":
        guessedPlayers.push(data.username);
        correctSound.play();
        updatePlayerList(lastUsers);
        break;

      case "round-end":
        roundEndSound.play();
        stopTimer();
        showLeaderboard(data.leaderboard, data.song);
        break;

      case "resumeGame":
        guessedPlayers = [];
        if (data.song) playSong(data.song);

        document.getElementById("roundDisplay").textContent =
          `Round ${data.round}`;
        break;

      case "chat":
        addChatMessage(data);
        break;
    }
  };

  ws.onclose = () => {
    console.log("Disconnected");
  };

  ws.onerror = (err) => {
    console.error("WebSocket error:", err);
  };
});
