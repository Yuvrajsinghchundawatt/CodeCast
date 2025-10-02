// server/index.js
const express = require("express");
const app = express();
const http = require("http");
const { Server } = require("socket.io");
const ACTIONS = require("./Actions");
const cors = require("cors");
const axios = require("axios");
const server = http.createServer(app);
require("dotenv").config();

const languageConfig = {
  python3: { versionIndex: "3" },
  java: { versionIndex: "3" },
  cpp: { versionIndex: "4" },
  nodejs: { versionIndex: "3" },
  c: { versionIndex: "4" },
  ruby: { versionIndex: "3" },
  go: { versionIndex: "3" },
  scala: { versionIndex: "3" },
  bash: { versionIndex: "3" },
  sql: { versionIndex: "3" },
  pascal: { versionIndex: "2" },
  csharp: { versionIndex: "3" },
  php: { versionIndex: "3" },
  swift: { versionIndex: "3" },
  rust: { versionIndex: "3" },
  r: { versionIndex: "3" },
};

// Enable CORS
app.use(cors());

// Parse JSON bodies
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

const userSocketMap = {};

const getAllConnectedClients = (roomId) => {
  return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map(
    (socketId) => {
      return {
        socketId,
        username: userSocketMap[socketId],
      };
    }
  );
};

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  // JOIN
  socket.on(ACTIONS.JOIN, ({ roomId, username }) => {
    try {
      userSocketMap[socket.id] = username;
      socket.join(roomId);
      const clients = getAllConnectedClients(roomId);

      console.log(`User "${username}" (${socket.id}) joined room: ${roomId}`);
      // notify all clients in room about current clients (including the new one)
      clients.forEach(({ socketId }) => {
        io.to(socketId).emit(ACTIONS.JOINED, {
          clients,
          username,
          socketId: socket.id,
        });
      });
    } catch (err) {
      console.error("Error in JOIN handler:", err);
    }
  });

  // CODE_CHANGE (broadcast to others in the room)
  socket.on(ACTIONS.CODE_CHANGE, ({ roomId, code }) => {
    console.log(`server: received CODE_CHANGE from ${socket.id} for room ${roomId}`);
    socket.in(roomId).emit(ACTIONS.CODE_CHANGE, { code });
  });

  // SYNC_CODE (send code to specific socket)
  socket.on(ACTIONS.SYNC_CODE, ({ socketId, code }) => {
    console.log(`server: SYNC_CODE -> sending code to ${socketId}`);
    io.to(socketId).emit(ACTIONS.CODE_CHANGE, { code });
  });

  // disconnecting: notify other members in room
  socket.on("disconnecting", () => {
    const rooms = [...socket.rooms];
    rooms.forEach((roomId) => {
      console.log(`Socket ${socket.id} leaving room ${roomId}`);
      socket.in(roomId).emit(ACTIONS.DISCONNECTED, {
        socketId: socket.id,
        username: userSocketMap[socket.id],
      });
    });

    // cleanup map entry
    delete userSocketMap[socket.id];
    // no need to call socket.leave() explicitly here
  });

  socket.on("disconnect", (reason) => {
    console.log(`Socket disconnected: ${socket.id} (reason: ${reason})`);
  });
});

app.post("/compile", async (req, res) => {
  const { code, language } = req.body;

  if (!language || !languageConfig[language]) {
    return res.status(400).json({ error: "Unsupported or missing language" });
  }

  try {
    const response = await axios.post("https://api.jdoodle.com/v1/execute", {
      script: code,
      language: language,
      versionIndex: languageConfig[language].versionIndex,
      clientId: process.env.jDoodle_clientId,
      clientSecret: process.env.jDoodle_clientSecret, // <-- fixed typo
    });

    return res.json(response.data);
  } catch (error) {
    console.error("Compile error:", error?.response?.data || error.message || error);
    return res.status(500).json({ error: "Failed to compile code" });
  }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
