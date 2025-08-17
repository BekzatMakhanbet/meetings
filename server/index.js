const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const http = require("http");
const socketIo = require("socket.io");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

const OPENVIDU_URL = process.env.OPENVIDU_URL || "https://openvidu:4443";
const OPENVIDU_SECRET = process.env.OPENVIDU_SECRET || "MY_SECRET";
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

// PostgreSQL connection with better configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://postgres:password@localhost:5432/meetings",
  ssl: false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test database connection
async function testConnection() {
  let retries = 10;
  while (retries > 0) {
    try {
      const client = await pool.connect();
      console.log("Database connected successfully");
      client.release();
      return true;
    } catch (err) {
      console.log(`Database connection failed, retrying... (${retries} attempts left)`);
      retries--;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  console.error("Failed to connect to database after multiple attempts");
  return false;
}

// Initialize database tables
async function initDatabase() {
  try {
    const connected = await testConnection();
    if (!connected) {
      throw new Error("Could not connect to database");
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS rooms (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        session_id VARCHAR(255) UNIQUE NOT NULL,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT true
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        room_id INTEGER REFERENCES rooms(id),
        user_id INTEGER REFERENCES users(id),
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS recordings (
        id SERIAL PRIMARY KEY,
        room_id INTEGER REFERENCES rooms(id),
        recording_id VARCHAR(255) NOT NULL,
        file_path VARCHAR(255),
        duration INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(50) DEFAULT 'recording'
      )
    `);

    console.log("Database initialized successfully");
    return true;
  } catch (err) {
    console.error("Database initialization error:", err);
    return false;
  }
}

function ovAuthHeader() {
  const b = Buffer.from(`OPENVIDUAPP:${OPENVIDU_SECRET}`).toString("base64");
  return `Basic ${b}`;
}

async function ensureOk(responseOrPromise) {
  const response = await responseOrPromise;
  if (!response.ok) {
    const text = await response.text().catch(() => "<no text>");
    throw new Error(`OpenVidu error ${response.status} ${response.statusText}: ${text}`);
  }
  return response;
}

// Auth middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.sendStatus(401);
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

// Health check endpoint
app.get("/api/health", async (req, res) => {
  try {
    const client = await pool.connect();
    client.release();
    res.json({ status: "ok", database: "connected" });
  } catch (err) {
    res.status(503).json({ status: "error", database: "disconnected" });
  }
});

// Auth routes
app.post("/api/register", async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email",
      [username, email, hashedPassword]
    );
    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET);
    res.json({ token, user });
  } catch (err) {
    console.error(err);
    if (err.code === '23505') {
      res.status(400).json({ error: "Пользователь с таким email или именем уже существует" });
    } else {
      res.status(500).json({ error: "Ошибка сервера" });
    }
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    const user = result.rows[0];
    
    if (!user || !await bcrypt.compare(password, user.password_hash)) {
      return res.status(401).json({ error: "Неверные данные для входа" });
    }
    
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET);
    res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Get current user info
app.get("/api/me", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query("SELECT id, username, email FROM users WHERE id = $1", [req.user.userId]);
    const user = result.rows[0];
    
    if (!user) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }
    
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Room routes
app.get("/api/rooms", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.*, u.username as created_by_username 
      FROM rooms r 
      JOIN users u ON r.created_by = u.id 
      WHERE r.is_active = true 
      ORDER BY r.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка получения комнат" });
  }
});

app.post("/api/rooms", authenticateToken, async (req, res) => {
  const { name } = req.body;
  const sessionId = `room-${Date.now()}`;
  try {
    const result = await pool.query(
      "INSERT INTO rooms (name, session_id, created_by) VALUES ($1, $2, $3) RETURNING *",
      [name, sessionId, req.user.userId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка создания комнаты" });
  }
});

// Session route with room validation
app.post("/api/session", authenticateToken, async (req, res) => {
  const { sessionId } = req.body;
  try {
    // Check if room exists
    const roomResult = await pool.query("SELECT * FROM rooms WHERE session_id = $1", [sessionId]);
    if (roomResult.rows.length === 0) {
      return res.status(404).json({ error: "Комната не найдена" });
    }

    // Create session (ignore 409)
    await fetch(`${OPENVIDU_URL}/openvidu/api/sessions`, {
      method: "POST",
      headers: {
        Authorization: ovAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ customSessionId: sessionId }),
    }).catch(() => {});

    const tokenResp = await ensureOk(
      fetch(`${OPENVIDU_URL}/openvidu/api/tokens`, {
        method: "POST",
        headers: {
          Authorization: ovAuthHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          session: sessionId,
          data: JSON.stringify({ username: req.user.username })
        }),
      })
    );
    const tokenJson = await tokenResp.json();
    return res.json({ token: tokenJson.token, room: roomResult.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Ошибка сервера", details: String(err.message || err) });
  }
});

// Start recording
app.post("/api/recordings/start", authenticateToken, async (req, res) => {
  const { session } = req.body;
  try {
    const roomResult = await pool.query("SELECT * FROM rooms WHERE session_id = $1", [session]);
    if (roomResult.rows.length === 0) {
      return res.status(404).json({ error: "Комната не найдена" });
    }

    // Check if session exists and has connections
    try {
      const sessionInfo = await fetch(`${OPENVIDU_URL}/openvidu/api/sessions/${session}`, {
        method: "GET",
        headers: { Authorization: ovAuthHeader() },
      });
      
      if (!sessionInfo.ok) {
        return res.status(400).json({ error: "Сессия не активна или не существует" });
      }

      const sessionData = await sessionInfo.json();
      if (!sessionData.connections || sessionData.connections.length === 0) {
        return res.status(400).json({ error: "В сессии нет активных участников" });
      }
    } catch (err) {
      return res.status(400).json({ error: "Не удается проверить состояние сессии" });
    }

    const recordingPayload = { 
      session, 
      outputMode: "COMPOSED",
      hasAudio: true,
      hasVideo: true,
      resolution: "1920x1080",
      frameRate: 25,
      recordingLayout: "BEST_FIT"
    };

    console.log("Starting recording with payload:", recordingPayload);

    const r = await ensureOk(
      fetch(`${OPENVIDU_URL}/openvidu/api/recordings/start`, {
        method: "POST",
        headers: {
          Authorization: ovAuthHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(recordingPayload),
      })
    );
    const json = await r.json();
    
    console.log("Recording started:", json);
    
    // Save recording info to database
    await pool.query(
      "INSERT INTO recordings (room_id, recording_id) VALUES ($1, $2)",
      [roomResult.rows[0].id, json.id]
    );
    
    return res.json(json);
  } catch (err) {
    console.error("Recording start error:", err);
    res.status(500).json({ 
      error: "Не удалось начать запись", 
      details: String(err.message || err),
      suggestion: "Убедитесь, что в комнате есть активные участники"
    });
  }
});

// Stop recording
app.post("/api/recordings/stop", authenticateToken, async (req, res) => {
  const { recordingId } = req.body;
  try {
    console.log("Stopping recording:", recordingId);

    const r = await ensureOk(
      fetch(
        `${OPENVIDU_URL}/openvidu/api/recordings/stop/${recordingId}`,
        {
          method: "POST",
          headers: {
            Authorization: ovAuthHeader(),
            "Content-Type": "application/json",
          },
        }
      )
    );
    const json = await r.json();
    
    console.log("Recording stopped:", json);
    
    // Update recording info in database
    await pool.query(
      "UPDATE recordings SET status = 'completed', duration = $1, file_path = $2 WHERE recording_id = $3",
      [json.duration, json.url, recordingId]
    );
    
    return res.json(json);
  } catch (err) {
    console.error("Recording stop error:", err);
    res.status(500).json({ error: "Не удалось остановить запись", details: String(err.message || err) });
  }
});

// Get recordings list
app.get("/api/recordings", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT rec.*, r.name as room_name 
      FROM recordings rec
      JOIN rooms r ON rec.room_id = r.id
      ORDER BY rec.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка получения записей", details: String(err.message || err) });
  }
});

// Chat messages
app.get("/api/rooms/:sessionId/messages", authenticateToken, async (req, res) => {
  const { sessionId } = req.params;
  try {
    const result = await pool.query(`
      SELECT m.*, u.username 
      FROM messages m
      JOIN rooms r ON m.room_id = r.id
      JOIN users u ON m.user_id = u.id
      WHERE r.session_id = $1
      ORDER BY m.created_at ASC
      LIMIT 100
    `, [sessionId]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка получения сообщений" });
  }
});

// Socket.IO for chat
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-room", (sessionId) => {
    socket.join(sessionId);
    console.log(`User ${socket.id} joined room ${sessionId}`);
  });

  socket.on("send-message", async (data) => {
    const { sessionId, message, token } = data;
    try {
      // Verify token
      const decoded = jwt.verify(token, JWT_SECRET);
      
      // Get room
      const roomResult = await pool.query("SELECT * FROM rooms WHERE session_id = $1", [sessionId]);
      if (roomResult.rows.length === 0) return;

      // Save message
      const messageResult = await pool.query(
        "INSERT INTO messages (room_id, user_id, message) VALUES ($1, $2, $3) RETURNING *",
        [roomResult.rows[0].id, decoded.userId, message]
      );

      const messageData = {
        ...messageResult.rows[0],
        username: decoded.username
      };

      // Broadcast to room
      io.to(sessionId).emit("new-message", messageData);
    } catch (err) {
      console.error("Chat error:", err);
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 5000;

// Start server only after database is ready
async function startServer() {
  const dbReady = await initDatabase();
  if (!dbReady) {
    console.error("Failed to initialize database, exiting...");
    process.exit(1);
  }
  
  server.listen(PORT, () => {
    console.log(`Backend running on ${PORT}`);
  });
}

startServer();
