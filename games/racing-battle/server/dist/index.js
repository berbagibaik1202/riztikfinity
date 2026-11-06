"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_http_1 = __importDefault(require("node:http"));
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const socket_io_1 = require("socket.io");
const Track_js_1 = require("./engine/Track.js");
const RaceEngine_js_1 = require("./engine/RaceEngine.js");
const database_js_1 = require("./db/database.js");
const TikInfinityClient_js_1 = require("./adapter/TikInfinityClient.js");
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Serve static compiled Phaser Web Client if available
const CLIENT_DIST = node_path_1.default.resolve(__dirname, "../../client/dist");
if (node_fs_1.default.existsSync(CLIENT_DIST)) {
    app.use(express_1.default.static(CLIENT_DIST));
}
const server = node_http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    },
});
// Initialize Engine, Database, Track, and Adapter
const track = new Track_js_1.Track();
const db = new database_js_1.GameDatabase();
const engine = new RaceEngine_js_1.RaceEngine(track, db);
const tikInfinity = new TikInfinityClient_js_1.TikInfinityClient(engine, process.env.TIKTOK_ADAPTER_WS || "ws://127.0.0.1:8000/ws/adapter");
// Broadcast 30 FPS ticks to all connected Phaser clients / OBS overlays
engine.setTickCallback((tickData) => {
    io.emit("game_tick", tickData);
});
// Socket.IO connection handling
io.on("connection", (socket) => {
    console.log(`🎮 [Client Connected] Socket ID: ${socket.id}`);
    // Send initial static track data and current state
    socket.emit("init_track", track.getTrackData());
    socket.emit("game_state", {
        state: engine.state,
        totalLaps: engine.totalLaps,
        participants: Array.from(engine.participants.values()),
        leaderboard: engine.getLeaderboard(),
    });
    socket.on("disconnect", () => {
        console.log(`🔌 [Client Disconnected] Socket ID: ${socket.id}`);
    });
});
// ==========================================
// CREATOR DASHBOARD REST APIS
// ==========================================
// Get current game status & track
app.get("/api/game/state", (req, res) => {
    res.json({
        state: engine.state,
        totalLaps: engine.totalLaps,
        countdown: engine.countdownTimer,
        activeRacers: engine.participants.size,
        leaderboard: engine.getLeaderboard(),
        winner: engine.winner,
        track: track.getTrackData(),
    });
});
// Control race (Start, Pause, Reset, Clear)
app.post("/api/game/control", (req, res) => {
    const { action, totalLaps } = req.body;
    if (totalLaps && typeof totalLaps === "number" && totalLaps > 0) {
        engine.totalLaps = totalLaps;
    }
    if (action === "start") {
        engine.startRaceCountdown();
    }
    else if (action === "reset") {
        engine.resetRace(false);
    }
    else if (action === "clear") {
        engine.resetRace(true);
    }
    else if (action === "pause") {
        engine.state = engine.state === "PAUSED" ? "RACING" : "PAUSED";
    }
    res.json({ status: "ok", state: engine.state });
});
// Action endpoint: handles both /api/game/action and /api/game/simulate
const handleAction = (req, res) => {
    const { action, userId, nickname, vehicle, vehicleType, multiplier, duration } = req.body;
    const name = nickname || `Bot_${Math.floor(Math.random() * 899 + 100)}`;
    const uid = (userId || name).toLowerCase();
    const vType = vehicleType || vehicle;
    switch (action) {
        case "JOIN_RACE":
            engine.addParticipant(uid, name, "", vType);
            break;
        case "ACCELERATE":
            if (!engine.participants.has(uid))
                engine.addParticipant(uid, name, "", vType);
            engine.applyAccelerate(uid, multiplier || 1);
            break;
        case "NITRO":
            if (!engine.participants.has(uid))
                engine.addParticipant(uid, name, "", "supercar");
            engine.applyNitro(uid, multiplier || 8);
            break;
        case "SHIELD":
            engine.applyShield(uid, duration || 5);
            break;
        case "SPAWN_OBSTACLE":
            engine.spawnObstacle(uid, "oil");
            break;
        case "TURN_LEFT":
            engine.applySteer(uid, "left");
            break;
        case "TURN_RIGHT":
            engine.applySteer(uid, "right");
            break;
        case "SLOW_DOWN":
            engine.applySlowDown(uid);
            break;
        case "START_RACE":
            engine.startRaceCountdown();
            break;
        case "RESET_RACE":
            engine.resetRace(false);
            break;
        default:
            return res.status(400).json({ error: "Unknown action" });
    }
    res.json({ success: true, status: "ok", action, racer: name });
};
app.post("/api/game/action", handleAction);
app.post("/api/game/simulate", handleAction);
// Race history from SQLite
app.get("/api/game/history", (req, res) => {
    const sessions = db.getRecentSessions(15);
    res.json(sessions);
});
// Top racers leaderboard from SQLite
app.get("/api/game/top", (req, res) => {
    const top = db.getTopRacers(15);
    res.json(top);
});
// Fallback to client index.html for OBS and browser
app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/socket.io")) {
        return next();
    }
    const indexPath = node_path_1.default.join(CLIENT_DIST, "index.html");
    if (node_fs_1.default.existsSync(indexPath)) {
        return res.sendFile(indexPath);
    }
    res.send("RizLive Racing Server running. Build client with 'npm run build' in client folder.");
});
// Start loop and connect adapter
engine.startLoop();
tikInfinity.connect();
server.listen(PORT, () => {
    console.log(`\n=================================================`);
    console.log(`🏁 RIZLIVE RACING BATTLE — SERVER V1.0`);
    console.log(`🚀 Authoritative Game Server running on http://localhost:${PORT}`);
    console.log(`🎮 Socket.IO Realtime Engine active (30 FPS ticks)`);
    console.log(`💾 SQLite Persistent Database loaded`);
    console.log(`=================================================\n`);
});
