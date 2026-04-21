const express = require("express");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const PORT = 3000;
const INACTIVE_USER_TIMEOUT = 10 * 1000;
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PUBLIC_DIR = path.join(__dirname, "public");

async function startGame(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  // 🚨 prevent multiple loops
  if (room.gameRunning) return;
  room.gameRunning = true;

  room.round = 1;

  // 🧠 reset tracking
  room.playedSongs = new Set();

  while (room.round <= 10) {
    try {
      let song = null;

      // =========================
      // 🎵 PLAYLIST MODE (PRIORITY)
      // =========================
      if (room.usePlaylist && room.playlistTracks?.length) {
        const available = room.playlistTracks.filter((t) => {
          const key = `${t.title}-${t.artist}`;
          return !room.playedSongs.has(key);
        });

        if (available.length > 0) {
          song = available[Math.floor(Math.random() * available.length)];
          room.playedSongs.add(`${song.title}-${song.artist}`);
        } else {
          // fallback if all used
          song =
            room.playlistTracks[
              Math.floor(Math.random() * room.playlistTracks.length)
            ];
        }
      }

      // =========================
      // 🎯 API MODE (album / artist / random)
      // =========================
      if (!song) {
        let chosen = "random";

        const list = room.selectedAlbums || [];

        if (!list.includes("random") && list.length > 0) {
          chosen = list[Math.floor(Math.random() * list.length)];
        }

        let url = `https://quiz-songs-server.onrender.com/api/random-song`;

        if (chosen !== "random") {
          if (chosen.startsWith("artist:")) {
            const artistId = chosen.replace("artist:", "");
            url += `?artist=${artistId}`;
          } else if (chosen.startsWith("album:")) {
            const albumId = chosen.replace("album:", "");
            url += `?album=${albumId}`;
          } else {
            url += `?album=${chosen}`;
          }
        }

        let attempts = 0;

        while (attempts < 10) {
          const response = await fetch(url);
          const candidate = await response.json();

          const key = `${candidate.title}-${candidate.artist}`;

          if (!room.playedSongs.has(key)) {
            song = candidate;
            room.playedSongs.add(key);
            break;
          }

          attempts++;
        }

        // fallback if all repeated
        if (!song) {
          const response = await fetch(url);
          song = await response.json();
        }
      }

      // =========================
      // 🎮 START ROUND
      // =========================
      room.currentSong = song;
      room.roundActive = true;
      room.correctOrder = [];

      console.log(`Room ${roomCode} - Round ${room.round}`);
      console.log("🎵", song.title, "by", song.artist);

      room.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
              type: "new-round",
              round: room.round,
              song: song,
              duration: 30
          }));
        }
      });

      // ⏱ round duration
    await new Promise((resolve) => {
      const start = Date.now();
    
      const interval = setInterval(() => {
        const elapsed = Date.now() - start;
    
        const totalPlayers = room.users.size;
        const guessed = room.correctOrder.length;
    
        // ✅ everyone guessed → skip early
        if (guessed >= totalPlayers && totalPlayers > 0) {
          clearInterval(interval);
          resolve();
        }
    
        // ⏱ normal timeout (30s)
        if (elapsed >= 30000) {
          clearInterval(interval);
          resolve();
        }
      }, 200);
    });

      // =========================
      // 🛑 END ROUND
      // =========================
      room.roundActive = false;

      const totalPlayers = room.users.size || 1;
      const maxPoints = 400;

      room.correctOrder.forEach((username, index) => {
        const points = Math.max(
          0,
          Math.floor(maxPoints * (1 - index / totalPlayers))
        );

        room.scores[username] = (room.scores[username] || 0) + points;
      });

      // 🏆 leaderboard
      const leaderboard = [...room.users.keys()].map((username) => ({
        username,
        score: room.scores?.[username] ?? 0,
      }));

      console.log("📤 sending leaderboard", leaderboard);

      room.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(
            JSON.stringify({
              type: "round-end",
              leaderboard,
              song: room.currentSong,
            })
          );
        }
      });

      // reset for next round
      room.correctOrder = [];

      // ⏳ show leaderboard
      await new Promise((r) => setTimeout(r, 5000));

      room.round++;
    } catch (err) {
      console.error("Round loop error:", err);
      break;
    }
  }

  console.log(`🏁 Game finished in room ${roomCode}`);

  const finalLeaderboard = [...room.users.keys()].map((username) => ({
    username,
    score: room.scores?.[username] ?? 0,
  }));
  
  // 📤 send game over to all clients
  room.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: "game-over",
        leaderboard: finalLeaderboard
      }));
    }
  });
  
  // reset state so lobby works again
  room.gameRunning = false;
  room.gameState = false;
  room.round = 0;
  room.correctOrder = [];
}

const rooms = {};
let nextClientId = 1;

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.get("/room/:code", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "room.html"));
});

app.get("/api/random-song", async (req, res) => {
  const artistId = req.query.artist;

  if (artistId) {
    const response = await fetch(
      `https://api.deezer.com/artist/${artistId}/top?limit=50`,
    );

    const data = await response.json();

    const tracks = (data.data || []).filter((t) => t.preview);

    if (!tracks.length) {
      return res.status(404).json({ error: "No artist tracks found" });
    }

    const track = tracks[Math.floor(Math.random() * tracks.length)];

    return res.json({
      title: track.title,
      artist: track.artist?.name || "Unknown",
      preview: track.preview,
      cover: track.album?.cover_big || track.album?.cover || "",
    });
  }

  try {
    let albumId = req.query.album;

    if (!albumId || albumId === "random") {
      const chartRes = await fetch("https://api.deezer.com/chart/0/tracks");
      const chartData = await chartRes.json();

      if (!chartData.data?.length) {
        return res.status(500).json({ error: "No chart tracks found" });
      }

      const track =
        chartData.data[Math.floor(Math.random() * chartData.data.length)];

      return res.json({
        title: track.title,
        artist: track.artist?.name || "Unknown",
        preview: track.preview,
        cover: track.album?.cover_big || track.album?.cover || "",
      });
    }

    // 🎧 ALBUM MODE (your original logic)
    const response = await fetch(
      `https://api.deezer.com/album/${albumId}/tracks`,
    );

    const data = await response.json();

    if (!data.data) {
      return res.status(500).json({ error: "Invalid Deezer response" });
    }

    const tracks = data.data.filter((t) => t.preview && t.artist && t.title);

    if (!tracks.length) {
      return res.status(404).json({ error: "No playable tracks found" });
    }

    const track = tracks[Math.floor(Math.random() * tracks.length)];

    return res.json({
      title: track.title,
      artist: track.artist.name,
      preview: track.preview,
      cover: track.album?.cover_big || track.album?.cover || "",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/search-artists", async (req, res) => {
  try {
    const q = req.query.q;

    const response = await fetch(
      `https://api.deezer.com/search/artist?q=${encodeURIComponent(q)}`,
    );

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Artist search failed" });
  }
});

app.get("/api/search-albums", async (req, res) => {
  try {
    const q = req.query.q;

    const response = await fetch(
      `https://api.deezer.com/search/album?q=${encodeURIComponent(q)}`,
    );

    const data = await response.json();

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Search failed" });
  }
});

app.get("/api/popular-albums", async (req, res) => {
  try {
    const response = await fetch("https://api.deezer.com/chart/0/albums");
    const data = await response.json();

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load popular albums" });
  }
});

wss.on("connection", (ws) => {
  ws.id = `ws_${nextClientId++}`;
  ws.roomCode = null;
  ws.username = null;

  console.log(`Client ${ws.id} connected.`);

  ws.on("message", async (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case "createRoom": {
          const { username } = data;
          if (!username) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Username is required to create a room.",
              }),
            );
            return;
          }

          const roomCode = generateRandomCode(6);

          if (rooms[roomCode]) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Room code collision, please try again.",
              }),
            );
            return;
          }

          ws.roomCode = roomCode;
          ws.username = username;

          rooms[roomCode] = {
            hostUsername: username,
            users: new Map(),
            clients: new Set(),
            gameState: false,
            round: 0,
            currentSongId: 0,

            scores: {},
            guesses: {},
            selectedAlbums: ["random"],

            usedSongs: new Set(),
            gameRunning: false,
          };

          rooms[roomCode].users.set(username, {
            wsId: ws.id,
            lastSeen: Date.now(),
          });

          rooms[roomCode].clients.add(ws);

          ws.send(JSON.stringify({ type: "roomCreated", roomCode, username }));

          broadcastRoomState(roomCode);
          break;
        }

        case "joinRoom":
        case "rejoinRoom": {
          const { roomCode, username } = data;

          if (!username || !roomCode) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Username and room code are required.",
              }),
            );
            return;
          }

          if (!rooms[roomCode]) {
            ws.send(
              JSON.stringify({ type: "error", message: "Room not found." }),
            );
            return;
          }

          ws.roomCode = roomCode;
          ws.username = username;

          const room = rooms[roomCode];

          if (room.scores[username] === undefined) {
            room.scores[username] = 0;
          }

          if (room.users.has(username)) {
            room.users.set(username, {
              wsId: ws.id,
              lastSeen: Date.now(),
              score: room.users.get(username)?.score || 0,
            });
          } else {
            room.users.set(username, {
              wsId: ws.id,
              lastSeen: Date.now(),
              score: room.users.get(username)?.score || 0,
            });

            if (room.users.size === 1) {
              room.hostUsername = username;
            }
          }

          room.clients.add(ws);

          ws.send(JSON.stringify({ type: "roomJoined", roomCode, username }));

          broadcastRoomState(roomCode);

          if (room.gameState && room.currentSong) {
            ws.send(
              JSON.stringify({
                type: "resumeGame",
                round: room.round,
                song: room.currentSong,
              }),
            );
          }
          break;
        }

        case "leaveRoom": {
          leaveRoom(ws, ws.roomCode, ws.username);
          break;
        }

        case "startGame": {
          const { roomCode, albums } = data;
          const room = rooms[roomCode];

          if (!room) {
            ws.send(
              JSON.stringify({ type: "error", message: "Room not found." }),
            );
            return;
          }

          if (ws.username !== room.hostUsername) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Only the host can start the game.",
              }),
            );
            return;
          }

          room.selectedAlbums = albums && albums.length ? albums : ["random"];

          room.gameState = true;
          room.round = 1;
          room.roundActive = true;
          room.guesses = {};
          room.scores = room.scores || {};

          room.usedSongs = new Set();

          if (!room.gameRunning) {
            startGame(roomCode);
          }

          room.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(
                JSON.stringify({
                  type: "gameStarted",
                  round: room.round,
                }),
              );
            }
          });

          break;
        }

          case "setPlaylist": {
    const room = rooms[ws.roomCode];
    if (!room) return;
  
    const { playlistId } = data;
  
    try {
      const response = await fetch(`https://api.deezer.com/playlist/${playlistId}`);
      const json = await response.json();
  
      if (!json.tracks || !json.tracks.data.length) {
        ws.send(JSON.stringify({
          type: "error",
          message: "Playlist is empty or invalid"
        }));
        return;
      }
  
      room.playlistTracks = json.tracks.data
        .filter(t => t.preview)
        .map(t => ({
          title: t.title,
          artist: t.artist?.name || "Unknown",
          preview: t.preview,
          cover: t.album?.cover_big || t.album?.cover || ""
        }));
  
      room.usePlaylist = true;
  
      ws.send(JSON.stringify({
        type: "playlistLoaded",
        count: room.playlistTracks.length
      }));
  
      console.log(`Playlist loaded: ${room.playlistTracks.length} tracks`);
  
    } catch (err) {
      console.error(err);
      ws.send(JSON.stringify({
        type: "error",
        message: "Failed to load playlist"
      }));
    }
  
    break;
  }

        case "guess": {
          const room = rooms[ws.roomCode];
          if (!room || !room.roundActive) return;

          const song = room.currentSong;
          if (!song) return;

          if (!room.correctOrder) room.correctOrder = [];

          // already guessed correctly
          if (room.correctOrder.includes(ws.username)) return;

          const normalize = (str) =>
            str
              .toLowerCase()
              .replace(/\(.*?\)/g, "")
              .replace(/[^a-z0-9א-ת0-9 ]/gi, "")
              .trim();

          const guess = normalize(data.guess);
          const title = normalize(song.title);

          // ✅ CORRECT GUESS
          if (guess === title) {
            room.correctOrder.push(ws.username);

            room.clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(
                  JSON.stringify({
                    type: "playerGuessed",
                    username: ws.username,
                  }),
                );

                client.send(
                  JSON.stringify({
                    type: "chat",
                    system: true,
                    message: `${ws.username} guessed the song!`,
                  }),
                );
              }
            });

            return;
          }

          // ❌ WRONG GUESS ONLY
          room.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(
                JSON.stringify({
                  type: "chat",
                  username: ws.username,
                  message: data.guess,
                }),
              );
            }
          });

          break;
        }

        case "setAlbums": {
          const room = rooms[ws.roomCode];
          if (!room) return;

          room.selectedAlbums = data.albums;
          console.log("Selected albums:", room.selectedAlbums);
          break;
        }

        default:
          console.warn(`Unknown message type: ${data.type}`);
      }
    } catch (e) {
      console.error("Failed to parse message or handle event:", e);
      ws.send(
        JSON.stringify({ type: "error", message: "Invalid message format." }),
      );
    }
  });

  ws.on("close", () => {
    if (ws.roomCode && ws.username) {
      const room = rooms[ws.roomCode];

      if (room && room.users.has(ws.username)) {
        room.users.set(ws.username, {
          wsId: null,
          lastSeen: Date.now(),
        });

        room.clients.delete(ws);

        broadcastRoomState(ws.roomCode);
      }
    }
  });

  ws.on("error", (error) => {
    console.error(`WebSocket error for client ${ws.id}:`, error);
  });
});

function generateRandomCode(length) {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";

  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }

  return result;
}

function broadcastRoomState(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  cleanupInactiveUsers(roomCode);

  if (!room.hostUsername || !room.users.has(room.hostUsername)) {
    if (room.users.size > 0) {
      room.hostUsername = room.users.keys().next().value;
    } else {
      room.hostUsername = null;
    }
  }

  const usersArray = Array.from(room.users.keys()).map((username) => ({
    username,
    isHost: username === room.hostUsername,
    score: room.scores[username] || 0,
  }));

  const message = JSON.stringify({
    type: "roomState",
    roomCode,
    users: usersArray,
    hostUsername: room.hostUsername,
  });

  room.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });

  if (room.users.size === 0) {
    delete rooms[roomCode];
  }
}

function leaveRoom(ws, roomCode, username) {
  const room = rooms[roomCode];
  if (!room) return;

  room.clients.delete(ws);

  if (room.users.has(username)) {
    room.users.set(username, { wsId: null, lastSeen: Date.now() });
  }

  broadcastRoomState(roomCode);
}

setInterval(() => {
  for (const roomCode in rooms) {
    cleanupInactiveUsers(roomCode);

    if (rooms[roomCode] && rooms[roomCode].users.size === 0) {
      delete rooms[roomCode];
    }
  }
}, INACTIVE_USER_TIMEOUT / 2);

function cleanupInactiveUsers(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  const now = Date.now();
  let changed = false;

  for (const [username, userData] of room.users.entries()) {
    if (
      userData.wsId === null &&
      now - userData.lastSeen > INACTIVE_USER_TIMEOUT
    ) {
      room.users.delete(username);
      changed = true;
    }
  }

  if (changed) {
    broadcastRoomState(roomCode);
  }
}

server.listen(PORT, () => {
  console.log(`Express HTTP server running on http://localhost:${PORT}`);
  console.log(`WebSocket server running on ws://localhost:${PORT}`);
});
