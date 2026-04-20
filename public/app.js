document.addEventListener("DOMContentLoaded", () => {
  let audio = null;

  const correctSound = new Audio("correct.mp3");
  const roundEndSound = new Audio("roundEnded.mp3");

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  let guessedPlayers = [];

  // 🌐 WEBSOCKET
  ws = new WebSocket("wss://quiz-songs-server.onrender.com");

  // =========================
  // 🎮 JOIN ROOM ON CONNECT
  // =========================
  ws.onopen = () => {
    console.log("Game WS connected");

    const username = sessionStorage.getItem("skribbleUsername");
    const roomCode = new URLSearchParams(window.location.search).get("room");

    ws.send(
      JSON.stringify({
        type: "rejoinRoom",
        roomCode,
        username,
      }),
    );
  };

  // =========================
  // 🧠 SEND GUESS
  // =========================
  function sendGuess(guess) {
    if (ws.readyState !== WebSocket.OPEN) {
      console.log("WebSocket not ready");
      return;
    }

    ws.send(
      JSON.stringify({
        type: "guess",
        guess: guess,
      }),
    );
  }

  function showResult(song) {
    roundEndSound.volume = 1;

    roundEndSound.play();
    document.getElementById("roundResult").style.display = "block";

    document.getElementById("resultTitle").textContent = "🎵 " + song.title;

    document.getElementById("resultArtist").textContent = "by " + song.artist;

    document.getElementById("resultImage").src = song.cover;
  }

  function hideResult() {
    document.getElementById("roundResult").style.display = "none";
  }

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

  let lastUsers = [];

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

  function extractPlaylistId(url) {
  const match = url.match(/playlist\/(\d+)/);
  return match ? match[1] : null;
}

  const playlistId = extractPlaylistId(inputValue);

  ws.send(JSON.stringify({
    type: "setPlaylist",
    playlistId
  }));

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

    // 🚫 LOCK INPUT
    document.getElementById("guessInput").disabled = true;
    document.getElementById("guessBtn").disabled = true;

    await wait(5000);

    popup.style.display = "none";

    // 🔓 UNLOCK INPUT
    document.getElementById("guessInput").disabled = false;
    document.getElementById("guessBtn").disabled = false;
  }

  document.getElementById("guessBtn").addEventListener("click", () => {
    const guess = document.getElementById("guessInput").value;
    document.getElementById("guessInput").value = "";
    sendGuess(guess);
  });

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
      console.error("PLAY ERROR:", err);
      document.getElementById("status").innerText = "Error: " + err.message;
    }
  }

  // =========================
  // 📩 HANDLE SERVER MESSAGES
  // =========================
  ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);

    console.log("📩 RAW MESSAGE:", data);

    switch (data.type) {
      case "new-round":
        console.log("🔥 NEW ROUND RECEIVED");

        // 🧹 reset guessed players (everyone back to grey)
        guessedPlayers = [];
        updatePlayerList(lastUsers);

        // 🧹 clear chat (optional but recommended like skribbl)
        const chat = document.getElementById("chatBox");
        if (chat) chat.innerHTML = "";

        // 🧹 clear input + status
        document.getElementById("guessInput").value = "";
        document.getElementById("status").innerText = "Get ready...";

        // 🧹 stop any previous audio
        if (audio) {
          audio.pause();
          audio = null;
        }

        // 🔢 update round UI
        document.getElementById("roundDisplay").textContent =
          `Round ${data.round}`;

        // 🎵 start playing new song
        playSong(data.song);

        break;

      case "roomState":
        console.log("🏠 Room update:", data.users);

        // 🏆 UPDATE SCOREBOARD HERE (IMPORTANT)
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

      case "gameStarted":
        console.log("🎮 Game started");
        break;

      case "guessResult":
        roundEndSound.volume = 1;

        roundEndSound.play();
        document.getElementById("status").innerText = data.message;
        console.log("Guess result:", data.status);
        break;

      case "playerGuessed":
        guessedPlayers.push(data.username);

        correctSound.volume = 1;

        correctSound.play();

        updatePlayerList(lastUsers);
        break;

      case "round-end":
        roundEndSound.volume = 1;

        roundEndSound.play();
        showLeaderboard(data.leaderboard, data.song);
        break;

      case "resumeGame":
        console.log("🔁 Resuming game");

        guessedPlayers = [];

        if (data.song) {
          playSong(data.song);
        }

        document.getElementById("roundDisplay").textContent =
          `Round ${data.round}`;

        break;

      case "chat":
        addChatMessage(data);
        break;

      default:
        console.warn("Unknown message type:", data.type);
    }
  };

  ws.onclose = () => {
    console.log("❌ Disconnected from server");
  };

  ws.onerror = (err) => {
    console.error("WebSocket error:", err);
  };
});
