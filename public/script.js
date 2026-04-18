document.addEventListener("DOMContentLoaded", () => {
  const createUsernameInput = document.getElementById("create-username");
  const createRoomBtn = document.getElementById("create-room-btn");
  const createRoomCodeDisplay = document.getElementById(
    "create-room-code-display",
  );

  const joinUsernameInput = document.getElementById("join-username");
  const roomCodeInput = document.getElementById("room-code-input");
  const joinRoomBtn = document.getElementById("join-room-btn");

  const messageDisplay = document.getElementById("message-display");

  // WebSocket connection
  const ws = new WebSocket(`ws://${window.location.host}`);

  ws.onopen = () => {
    console.log("Connected to WebSocket server.");
    showMessage("Connected to server.", "info");
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log("Message from server:", data);

    switch (data.type) {
      case "roomCreated":
        hideMessages();
        createRoomCodeDisplay.innerHTML = `Your Room Code: <span class="text-primary">${data.roomCode}</span>`;
        showMessage(`Room created! Redirecting to room ${data.roomCode}...`);
        sessionStorage.setItem("skribbleUsername", data.username);
        window.location.href = `/room/${data.roomCode}`;
        break;
      case "roomJoined":
        hideMessages();
        showMessage(`Joined room: ${data.roomCode}. Redirecting...`);
        sessionStorage.setItem("skribbleUsername", data.username);
        window.location.href = `/room/${data.roomCode}`;
        break;
      case "error":
        showMessage(`Error: ${data.message}`, "error");
        break;
      default:
        console.warn("Unknown message type:", data.type);
    }
  };

  ws.onclose = () => {
    console.log("Disconnected from WebSocket server.");
    showMessage("Disconnected from server. Please refresh.", "error");
  };

  ws.onerror = (error) => {
    console.error("WebSocket error:", error);
    showMessage("WebSocket error. Check console.", "error");
  };

  const showMessage = (msg, type = "info") => {
    messageDisplay.textContent = msg;
    messageDisplay.style.display = "block";
    messageDisplay.className = "message-box"; // Reset classes
    if (type === "error") {
      messageDisplay.style.backgroundColor = "#fee2e2"; /* red-100 */
      messageDisplay.style.color = "#991b1b"; /* red-800 */
      if (
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
      ) {
        messageDisplay.style.backgroundColor = "#7f1d1d"; /* red-900 */
        messageDisplay.style.color = "#fecaca"; /* red-200 */
      }
    } else {
      messageDisplay.style.backgroundColor = "#dbeafe"; /* blue-100 */
      messageDisplay.style.color = "#1e40af"; /* blue-800 */
      if (
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
      ) {
        messageDisplay.style.backgroundColor = "#1e3a8a"; /* blue-900 */
        messageDisplay.style.color = "#bfdbfe"; /* blue-200 */
      }
    }
  };

  const hideMessages = () => {
    messageDisplay.style.display = "none";
  };

  createRoomBtn.addEventListener("click", () => {
    const username = createUsernameInput.value.trim();
    if (!username) {
      showMessage("Please enter a username to create a room.", "error");
      return;
    }
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "createRoom", username }));
    } else {
      showMessage("Not connected to server. Please wait or refresh.", "error");
    }
  });

  joinRoomBtn.addEventListener("click", () => {
    const username = joinUsernameInput.value.trim();
    const roomCodeToJoin = roomCodeInput.value.trim().toUpperCase();

    if (!username) {
      showMessage("Please enter a username to join a room.", "error");
      return;
    }
    if (!roomCodeToJoin || roomCodeToJoin.length !== 6) {
      showMessage("Please enter a valid 6-character room code.", "error");
      return;
    }

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "joinRoom",
          roomCode: roomCodeToJoin,
          username,
        }),
      );
    } else {
      showMessage("Not connected to server. Please wait or refresh.", "error");
    }
  });

  // Sync username input fields
  createUsernameInput.addEventListener("input", (e) => {
    joinUsernameInput.value = e.target.value;
  });
  joinUsernameInput.addEventListener("input", (e) => {
    createUsernameInput.value = e.target.value;
  });
});
