"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TikInfinityClient = void 0;
const ws_1 = __importDefault(require("ws"));
class TikInfinityClient {
    engine;
    wsUrl;
    ws = null;
    reconnectTimer = null;
    syncTimer = null;
    pollingStarted = false;
    isConnected = false;
    processedActionIds = new Set();
    lastPolledActionId = 0;
    onActionCallback;
    constructor(engine, wsUrl = "ws://127.0.0.1:8000/ws/adapter") {
        this.engine = engine;
        this.wsUrl = wsUrl;
    }
    connect() {
        if (!this.pollingStarted) {
            this.startRestPolling();
            this.pollingStarted = true;
        }
        if (this.ws) {
            try {
                this.ws.close();
            }
            catch (e) { }
        }
        console.log(`🔌 [TikInfinity Adapter] Menghubungkan ke ${this.wsUrl}...`);
        try {
            this.ws = new ws_1.default(this.wsUrl);
            this.ws.on("open", () => {
                this.isConnected = true;
                console.log("✅ [TikInfinity Adapter] Terhubung ke TikInfinity Game Adapter!");
                this.startStateSync();
            });
            this.ws.on("message", (raw) => {
                try {
                    const msg = JSON.parse(raw.toString());
                    if (msg.type === "action" && msg.data) {
                        this.handleUniversalAction(msg.data);
                    }
                    else if (msg.type === "init") {
                        console.log(`📋 [TikInfinity Adapter] Handshake sukses (Protokol v${msg.protocol})`);
                    }
                }
                catch (err) {
                    console.error("Gagal parse pesan WebSocket:", err);
                }
            });
            this.ws.on("close", () => {
                this.isConnected = false;
                console.log("⚠️ [TikInfinity Adapter] Terputus. Menjadwalkan reconnect dalam 3 detik...");
                this.scheduleReconnect();
            });
            this.ws.on("error", (err) => {
                console.warn(`[TikInfinity Adapter] Error: ${err.message}`);
                this.isConnected = false;
            });
        }
        catch (err) {
            console.warn(`[TikInfinity Adapter] Gagal inisiasi koneksi: ${err.message}`);
            this.scheduleReconnect();
        }
    }
    startRestPolling(pollIntervalMs = 1000) {
        const httpUrl = this.wsUrl.replace(/^ws/, "http").replace(/\/ws\/adapter$/, "/api/adapter/actions");
        console.log(`🔄 [TikInfinity Adapter] Mengaktifkan REST Polling Fallback di ${httpUrl}...`);
        setInterval(async () => {
            try {
                const res = await fetch(`${httpUrl}?since_id=${this.lastPolledActionId}`);
                if (!res.ok)
                    return;
                const data = (await res.json());
                if (data && Array.isArray(data.actions)) {
                    for (const act of data.actions) {
                        this.handleUniversalAction(act);
                    }
                }
            }
            catch (e) {
                // TikInfinity might not be running or restarting
            }
        }, pollIntervalMs);
    }
    scheduleReconnect() {
        if (this.reconnectTimer)
            clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
            this.connect();
        }, 3000);
    }
    handleUniversalAction(payload) {
        if (payload.id) {
            if (this.processedActionIds.has(payload.id))
                return;
            this.processedActionIds.add(payload.id);
            if (this.processedActionIds.size > 500) {
                const arr = Array.from(this.processedActionIds);
                this.processedActionIds = new Set(arr.slice(arr.length - 250));
            }
            if (payload.id > this.lastPolledActionId) {
                this.lastPolledActionId = payload.id;
            }
        }
        const act = payload.action;
        const uid = payload.user_id;
        const nick = payload.nickname;
        const avatar = payload.avatar || "";
        const mult = payload.multiplier || 1;
        const meta = payload.meta || {};
        console.log(`⚡ [Universal Action Recv] ${act} from ${nick} (x${mult})`);
        if (this.onActionCallback) {
            this.onActionCallback(act, uid, nick, mult);
        }
        switch (act) {
            case "JOIN_RACE":
                this.engine.addParticipant(uid, nick, avatar, meta.vehicle_choice);
                break;
            case "ACCELERATE":
                if (!this.engine.participants.has(uid.toLowerCase())) {
                    this.engine.addParticipant(uid, nick, avatar);
                }
                this.engine.applyAccelerate(uid, mult);
                break;
            case "NITRO":
                if (!this.engine.participants.has(uid.toLowerCase())) {
                    this.engine.addParticipant(uid, nick, avatar, "supercar");
                }
                this.engine.applyNitro(uid, mult);
                break;
            case "SHIELD":
                this.engine.applyShield(uid, meta.duration || 5);
                break;
            case "SPAWN_OBSTACLE":
                this.engine.spawnObstacle(uid, "oil");
                break;
            case "TURN_LEFT":
                this.engine.applySteer(uid, "left");
                break;
            case "TURN_RIGHT":
                this.engine.applySteer(uid, "right");
                break;
            case "SLOW_DOWN":
                this.engine.applySlowDown(uid);
                break;
            case "START_RACE":
                this.engine.startRaceCountdown();
                break;
            case "RESET_RACE":
                this.engine.resetRace(meta.clear_racers || false);
                break;
            default:
                console.log(`Aksi universal '${act}' diterima.`);
        }
    }
    startStateSync() {
        if (this.syncTimer)
            clearInterval(this.syncTimer);
        // Periodically sync game state back to TikInfinity every 1 second
        this.syncTimer = setInterval(() => {
            if (this.isConnected && this.ws && this.ws.readyState === ws_1.default.OPEN) {
                const payload = {
                    type: "state_update",
                    data: {
                        state: this.engine.state,
                        active_participants: this.engine.participants.size,
                        leaderboard: this.engine.getLeaderboard().slice(0, 5),
                        winner: this.engine.winner,
                    },
                };
                try {
                    this.ws.send(JSON.stringify(payload));
                }
                catch (e) { }
            }
        }, 1000);
    }
}
exports.TikInfinityClient = TikInfinityClient;
