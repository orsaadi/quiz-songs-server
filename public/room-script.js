document.addEventListener("DOMContentLoaded", () => {
  const displayRoomCode = document.getElementById("display-room-code");
  const displayUsername = document.getElementById("display-username");
  const displayHostUsername = document.getElementById("display-host-username");
  const userListElement = document.getElementById("user-list");
  const leaveRoomBtn = document.getElementById("leave-room-btn");
  const startGameBtn = document.getElementById("start-game-btn");
  const searchInput = document.getElementById("albumSearch");

  let selectedSources = ["random"];
  let randomMode = true;

  const randomCard = document.getElementById("random-card");

  randomCard.onclick = () => {
    const isAlreadyRandomOnly =
      selectedSources.length === 1 && selectedSources[0] === "random";

    if (isAlreadyRandomOnly) {
      // choose several random albums instead of full random
      selectedSources = [];
      randomCard.classList.remove("selected");

      const cards = [...document.querySelectorAll(".album-card[data-id]")];

      // pick 3 random visible albums
      const shuffled = cards.sort(() => Math.random() - 0.5).slice(0, 3);

      shuffled.forEach((card) => {
        selectedSources.push(card.dataset.id);
        card.classList.add("selected");
      });
    } else {
      // back to full random
      selectedSources = ["random"];

      document.querySelectorAll(".album-card").forEach((card) => {
        card.classList.remove("selected");
      });

      randomCard.classList.add("selected");
    }

    console.log(selectedSources);
  };

  const pathSegments = window.location.pathname.split("/");
  const roomCode = pathSegments[pathSegments.length - 1];

  const username = sessionStorage.getItem("skribbleUsername") || "Guest";

  // document.getElementById("randomAlbum").classList.add("selected");

  if (!username || username === "Guest") {
    alert("Please enter a username on the home page first!");
    window.location.href = "/";
    return; // Stop execution
  }

  if (displayRoomCode) {
    displayRoomCode.textContent = roomCode;
  }
  if (displayUsername) {
    displayUsername.textContent = username;
  }

  // WebSocket connection
  ws = new WebSocket("wss://quiz-songs-server.onrender.com");

  ws.onopen = () => {
    console.log("Connected to WebSocket server from room page.");
    // Send a rejoin message to get the current room state
    ws.send(JSON.stringify({ type: "rejoinRoom", roomCode, username }));
  };

  function createAlbumCard(album) {
    const div = document.createElement("div");
    div.className = "album-card";
    div.dataset.id = album.id;

    div.innerHTML = `
    <img src="${album.cover_medium}" />
    <p>${album.title}</p>
  `;

    div.onclick = () => {
      const id = "album:" + album.id;

      // remove random if selecting real album
      selectedSources = selectedSources.filter((a) => a !== "random");

      if (selectedSources.includes(id)) {
        selectedSources = selectedSources.filter((a) => a !== id);
        div.classList.remove("selected");
      } else {
        selectedSources.push(id);
        div.classList.add("selected");
      }

      // if nothing selected, go back to random
      if (selectedSources.length === 0) {
        selectedSources = ["random"];
        document.getElementById("random-card").classList.add("selected");
      }

      console.log(selectedSources);
    };

    // restore selection when rerendering
    if (selectedSources.includes(String(album.id))) {
      div.classList.add("selected");
    }

    return div;
  }

  const playlistInput = document.getElementById("playlistInput");
const loadPlaylistBtn = document.getElementById("loadPlaylistBtn");
const playlistStatus = document.getElementById("playlistStatus");

// 🎯 extract playlist ID from URL
function extractPlaylistId(url) {
  const match = url.match(/playlist\/(\d+)/);
  return match ? match[1] : null;
}

loadPlaylistBtn.addEventListener("click", () => {
  const url = playlistInput.value.trim();

  if (!url) {
    playlistStatus.textContent = "❌ Please paste a playlist link";
    return;
  }

  const playlistId = extractPlaylistId(url);

  if (!playlistId) {
    playlistStatus.textContent = "❌ Invalid Deezer playlist link";
    return;
  }

  // 📡 send to server
  ws.send(JSON.stringify({
    type: "setPlaylist",
    playlistId
  }));

  playlistStatus.textContent = "⏳ Loading playlist...";
});

  async function searchAll(query) {
    const grid = document.getElementById("albumGrid");
    grid.innerHTML = "";

    // 🎵 ALBUMS
    const albumRes = await fetch(`/api/search-albums?q=${query}`);
    const albumData = await albumRes.json();

    albumData.data.slice(0, 5).forEach((album) => {
      grid.appendChild(createAlbumCard(album));
    });

    // 🎤 ARTISTS
    const artistRes = await fetch(`/api/search-artists?q=${query}`);
    const artistData = await artistRes.json();

    artistData.data.slice(0, 5).forEach((artist) => {
      grid.appendChild(createArtistCard(artist));
    });
  }

  function createArtistCard(artist) {
    const div = document.createElement("div");
    div.className = "album-card";
    div.dataset.id = "artist:" + artist.id;

    div.innerHTML = `
    <img src="${artist.picture_medium}" />
    <p>${artist.name}</p>
  `;

    div.onclick = () => {
      const id = "artist:" + artist.id;

      selectedSources = selectedSources.filter((a) => a !== "random");

      if (selectedSources.includes(id)) {
        selectedSources = selectedSources.filter((a) => a !== id);
        div.classList.remove("selected");
      } else {
        selectedSources.push(id);
        div.classList.add("selected");
      }

      if (selectedSources.length === 0) {
        selectedSources = ["random"];
        document.getElementById("random-card").classList.add("selected");
      }

      console.log(selectedSources);
    };

    return div;
  }

  async function loadPopularAlbums() {
    const res = await fetch("/api/popular-albums");
    const data = await res.json();

    const grid = document.getElementById("albumGrid");
    grid.innerHTML = "";

    data.data.slice(0, 10).forEach((album) => {
      grid.appendChild(createAlbumCard(album));
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const value = e.target.value.trim();

      if (value.length < 2) {
        loadPopularAlbums();
      } else {
        searchAll(value);
      }
    });
  }

  // document.querySelector('[data-id="random"]').onclick = () => {
  //   selectedAlbum = "random";

  //   document
  //     .querySelectorAll(".album-card")
  //     .forEach((c) => (c.style.border = "1px solid #ddd"));
  // };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log("Message from server (room page):", data);

    switch (data.type) {
      case "roomState":
        renderUserList(data.users, data.hostUsername);
        // Show start button only for host
        const albumSelector = document.getElementById("album-selector");

        if (startGameBtn) {
          if (username === data.hostUsername) {
            startGameBtn.style.display = "inline-block";
            if (albumSelector) albumSelector.style.display = "block"; // 👈 SHOW
          } else {
            startGameBtn.style.display = "none";
            if (albumSelector) albumSelector.style.display = "none"; // 👈 HIDE
          }
        }
        break;
      case "gameStarted":
        // Redirect all users to game.html with room code
        window.location.href = `/game.html?room=${roomCode}`;
        break;
      case "error":
        console.error("Server error:", data.message);
        alert(`Error: ${data.message}. Redirecting to home.`);
        window.location.href = "/";
        break;
      default:
        console.warn("Unknown message type on room page:", data.type);
    }
  };

  ws.onclose = () => {
    console.log("Disconnected from WebSocket server (room page).");
    // Optionally, alert user or redirect if connection is critical
  };

  ws.onerror = (error) => {
    console.error("WebSocket error (room page):", error);
  };

  const renderUserList = (users, hostUsername) => {
    userListElement.innerHTML = ""; // Clear existing list
    loadPopularAlbums();

    if (users.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No other users in this room (yet!)";
      li.style.backgroundColor = "transparent";
      li.style.color = "inherit";
      li.style.boxShadow = "none";
      li.style.padding = "0";
      li.style.borderRadius = "0";
      userListElement.appendChild(li);
    } else {
      users.forEach((user) => {
        const li = document.createElement("li");
        li.textContent = user.username;
        if (user.username === hostUsername) {
          li.classList.add("host-user"); // Add a class for host styling if needed
          li.textContent += " (Host)"; // Indicate host in text
        }
        userListElement.appendChild(li);
      });
    }
    displayHostUsername.textContent = hostUsername || "N/A"; // Display host username
  };

  leaveRoomBtn.addEventListener("click", () => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "leaveRoom" })); // No need to send roomCode, server knows
    }
    sessionStorage.removeItem("skribbleUsername"); // Clear username from session storage
    window.location.href = "/"; // Redirect back to the main page
  });

  if (startGameBtn) {
    startGameBtn.addEventListener("click", () => {
      if (ws.readyState === WebSocket.OPEN) {
        const cleanedAlbums = selectedSources.includes("random")
          ? ["random"]
          : selectedSources;

        ws.send(
          JSON.stringify({
            type: "startGame",
            roomCode,
            albums: selectedSources,
          }),
        );
      }
    });
  }

  // Handle browser tab/window close or navigation away
  window.addEventListener("beforeunload", () => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "leaveRoom" }));
      // ws.close() is often not needed here as browser handles it,
      // but explicitly calling can help ensure message is sent before closing.
      // However, due to async nature, it's not guaranteed.
      // The server's on('close') handler is the most reliable for cleanup.
    }
  });
});
