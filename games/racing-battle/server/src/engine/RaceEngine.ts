import {
  GameState,
  Participant,
  Obstacle,
  LeaderboardEntry,
  GameTickState,
  VehicleType,
} from "../shared/types.js";
import { Track } from "./Track.js";
import { GameDatabase } from "../db/database.js";

const VEHICLE_COLORS = [
  "#f43f5e", // Rose Red
  "#3b82f6", // Electric Blue
  "#10b981", // Neon Green
  "#eab308", // Golden Yellow
  "#a855f7", // Neon Purple
  "#f97316", // Sport Orange
  "#06b6d4", // Cyan
  "#ec4899", // Hot Pink
];

export class RaceEngine {
  public track: Track;
  public db: GameDatabase;
  public state: GameState = "IDLE";
  public totalLaps: number = 3;
  public countdownTimer: number | null = null;
  public tickCount: number = 0;
  public sessionId: string = "";
  public sessionStartTime: string = "";

  public participants: Map<string, Participant> = new Map();
  public obstacles: Obstacle[] = [];
  public finishOrder: LeaderboardEntry[] = [];
  public winner: LeaderboardEntry | null = null;

  private tickInterval: NodeJS.Timeout | null = null;
  private readonly TICK_RATE = 30; // 30 updates per second
  private readonly DT = 1 / 30;

  // Broadcast callback for Socket.IO
  private onTickCallback: ((tickData: GameTickState) => void) | null = null;

  constructor(track: Track, db: GameDatabase) {
    this.track = track;
    this.db = db;
  }

  public setTickCallback(cb: (tickData: GameTickState) => void) {
    this.onTickCallback = cb;
  }

  public startLoop() {
    if (this.tickInterval) return;
    this.tickInterval = setInterval(() => this.tick(), 1000 / this.TICK_RATE);
  }

  public stopLoop() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  public addParticipant(
    userId: string,
    nickname: string,
    avatar: string = "",
    vehicleChoice?: string
  ): Participant {
    const cleanId = (userId || nickname).toLowerCase().trim();
    if (this.participants.has(cleanId)) {
      return this.participants.get(cleanId)!;
    }

    const index = this.participants.size;
    const color = VEHICLE_COLORS[index % VEHICLE_COLORS.length];

    const validVehicles: VehicleType[] = [
      "supercar",
      "formula",
      "kart",
      "muscle",
      "motorcycle",
      "cyber",
    ];
    let vType: VehicleType = "supercar";
    if (vehicleChoice) {
      const vc = vehicleChoice.toLowerCase();
      if (vc.includes("lambo") || vc.includes("ferrari")) vType = "supercar";
      else if (vc.includes("motor") || vc.includes("bike")) vType = "motorcycle";
      else if (vc.includes("f1") || vc.includes("formula")) vType = "formula";
      else if (vc.includes("kart")) vType = "kart";
      else if (vc.includes("cyber")) vType = "cyber";
      else if (validVehicles.includes(vc as VehicleType)) vType = vc as VehicleType;
    } else {
      vType = validVehicles[index % validVehicles.length];
    }

    // Grid position: staggered backwards from start line
    const row = Math.floor(index / 2);
    const col = index % 2 === 0 ? -0.5 : 0.5; // left/right lane
    const startProgress = Math.max(0, 1.0 - (row * 35 + 20) / this.track.totalLength);

    const pt = this.track.getPointAtProgress(startProgress, col);

    const participant: Participant = {
      id: cleanId,
      userId: cleanId,
      nickname: nickname || cleanId,
      avatar: avatar || "",
      vehicleType: vType,
      color: color,
      x: pt.x,
      y: pt.y,
      angle: pt.angle,
      speed: 0,
      baseMaxSpeed: 240 + (index % 3) * 10, // Base speed 240-260 px/sec
      laneOffset: col,
      currentWaypoint: pt.currentWaypoint,
      lap: 1,
      progress: startProgress,
      totalDistance: 0,
      nitroActive: false,
      nitroTimer: 0,
      shieldActive: false,
      shieldTimer: 0,
      spinTimer: 0,
      finished: false,
      finishTime: null,
      finishRank: null,
    };

    this.participants.set(cleanId, participant);
    if (this.state === "IDLE") {
      this.state = "WAITING";
    }

    return participant;
  }

  public startRaceCountdown() {
    if (this.state === "RACING" || this.state === "COUNTDOWN") return;
    this.state = "COUNTDOWN";
    this.countdownTimer = 3;
    this.finishOrder = [];
    this.winner = null;
    this.sessionId = `race_${Date.now()}`;
    this.sessionStartTime = new Date().toISOString();

    // Reset participant positions to starting grid
    let idx = 0;
    for (const p of this.participants.values()) {
      const row = Math.floor(idx / 2);
      const col = idx % 2 === 0 ? -0.5 : 0.5;
      const startProg = Math.max(0, 1.0 - (row * 35 + 20) / this.track.totalLength);
      const pt = this.track.getPointAtProgress(startProg, col);

      p.x = pt.x;
      p.y = pt.y;
      p.angle = pt.angle;
      p.speed = 0;
      p.laneOffset = col;
      p.lap = 1;
      p.progress = startProg;
      p.totalDistance = 0;
      p.nitroActive = false;
      p.nitroTimer = 0;
      p.shieldActive = false;
      p.shieldTimer = 0;
      p.spinTimer = 0;
      p.finished = false;
      p.finishTime = null;
      p.finishRank = null;
      idx++;
    }

    this.obstacles = [];
  }

  public resetRace(clearRacers: boolean = false) {
    this.state = "IDLE";
    this.countdownTimer = null;
    this.finishOrder = [];
    this.winner = null;
    this.obstacles = [];

    if (clearRacers) {
      this.participants.clear();
    } else {
      let idx = 0;
      for (const p of this.participants.values()) {
        const row = Math.floor(idx / 2);
        const col = idx % 2 === 0 ? -0.5 : 0.5;
        const startProg = Math.max(0, 1.0 - (row * 35 + 20) / this.track.totalLength);
        const pt = this.track.getPointAtProgress(startProg, col);

        p.x = pt.x;
        p.y = pt.y;
        p.angle = pt.angle;
        p.speed = 0;
        p.laneOffset = col;
        p.lap = 1;
        p.progress = startProg;
        p.totalDistance = 0;
        p.nitroActive = false;
        p.nitroTimer = 0;
        p.shieldActive = false;
        p.shieldTimer = 0;
        p.spinTimer = 0;
        p.finished = false;
        p.finishTime = null;
        p.finishRank = null;
        idx++;
      }
    }
  }

  public applyAccelerate(userId: string, multiplier: number = 1) {
    const p = this.participants.get(userId.toLowerCase());
    if (!p || p.finished) return;
    // Temporary boost
    p.speed = Math.min(p.speed + 40 * multiplier, p.baseMaxSpeed * 1.5);
  }

  public applyNitro(userId: string, multiplier: number = 8) {
    const p = this.participants.get(userId.toLowerCase());
    if (!p || p.finished) return;
    p.nitroActive = true;
    p.nitroTimer = 3.5; // 3.5 seconds of super nitro speed
    p.speed = Math.max(p.speed, p.baseMaxSpeed * 1.7);
  }

  public applyShield(userId: string, duration: number = 5) {
    const p = this.participants.get(userId.toLowerCase());
    if (!p || p.finished) return;
    p.shieldActive = true;
    p.shieldTimer = duration;
  }

  public spawnObstacle(placerUserId: string, type: "oil" | "rock" | "rocket" = "oil") {
    const placer = this.participants.get(placerUserId.toLowerCase());
    if (!placer) return;

    // Drop obstacle 50-80px ahead or at placer's location
    const obsProgress = (placer.progress + 60 / this.track.totalLength) % 1.0;
    const pt = this.track.getPointAtProgress(obsProgress, placer.laneOffset);

    this.obstacles.push({
      id: `obs_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      x: pt.x,
      y: pt.y,
      waypointIndex: pt.currentWaypoint,
      laneOffset: placer.laneOffset,
      type: type,
      placedBy: placer.nickname,
      duration: 12, // stays on track for 12 seconds
    });
  }

  public applySteer(userId: string, direction: "left" | "right") {
    const p = this.participants.get(userId.toLowerCase());
    if (!p || p.finished) return;
    const delta = direction === "left" ? -0.4 : 0.4;
    p.laneOffset = Math.max(-0.9, Math.min(0.9, p.laneOffset + delta));
  }

  public applySlowDown(userId: string) {
    const p = this.participants.get(userId.toLowerCase());
    if (!p || p.finished) return;
    p.speed = Math.max(40, p.speed * 0.5);
  }

  private tick() {
    this.tickCount++;

    // Countdown handling
    if (this.state === "COUNTDOWN" && this.countdownTimer !== null) {
      this.countdownTimer -= this.DT;
      if (this.countdownTimer <= 0) {
        this.countdownTimer = null;
        this.state = "RACING";
      }
    }

    // Racing Physics
    if (this.state === "RACING") {
      this.updatePhysics();
    }

    // Leaderboard update
    const leaderboard = this.getLeaderboard();

    // Broadcast tick payload
    if (this.onTickCallback) {
      this.onTickCallback({
        tick: this.tickCount,
        timestamp: Date.now(),
        state: this.state,
        totalLaps: this.totalLaps,
        countdown: this.countdownTimer !== null ? Math.ceil(this.countdownTimer) : null,
        participants: Array.from(this.participants.values()),
        obstacles: this.obstacles,
        leaderboard: leaderboard,
        winner: this.winner,
      });
    }
  }

  private updatePhysics() {
    // 1. Update Obstacles timers
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      this.obstacles[i].duration -= this.DT;
      if (this.obstacles[i].duration <= 0) {
        this.obstacles.splice(i, 1);
      }
    }

    // 2. Update each participant
    for (const p of this.participants.values()) {
      if (p.finished) continue;

      // Handle Nitro timer
      if (p.nitroActive) {
        p.nitroTimer -= this.DT;
        if (p.nitroTimer <= 0) {
          p.nitroActive = false;
        }
      }

      // Handle Shield timer
      if (p.shieldActive) {
        p.shieldTimer -= this.DT;
        if (p.shieldTimer <= 0) {
          p.shieldActive = false;
        }
      }

      // Handle Spin timer from hitting obstacle
      if (p.spinTimer > 0) {
        p.spinTimer -= this.DT;
        p.angle += Math.PI * 4 * this.DT; // spin animation
        p.speed = Math.max(0, p.speed - 300 * this.DT);
        continue;
      }

      // Acceleration towards target speed
      const targetMax = p.nitroActive ? p.baseMaxSpeed * 1.75 : p.baseMaxSpeed;
      if (p.speed < targetMax) {
        p.speed += 120 * this.DT; // acceleration
      } else if (p.speed > targetMax) {
        p.speed -= 80 * this.DT;
      }

      // Move along track progress
      const distTraveled = p.speed * this.DT;
      p.totalDistance += distTraveled;
      const progressDelta = distTraveled / this.track.totalLength;
      const prevProgress = p.progress;
      p.progress += progressDelta;

      // Check Lap Crossing
      if (p.progress >= 1.0) {
        p.progress -= 1.0;
        p.lap += 1;

        if (p.lap > this.totalLaps) {
          p.finished = true;
          p.finishTime = Date.now();
          p.finishRank = this.finishOrder.length + 1;

          const finishEntry: LeaderboardEntry = {
            rank: p.finishRank,
            userId: p.userId,
            nickname: p.nickname,
            avatar: p.avatar,
            vehicleType: p.vehicleType,
            color: p.color,
            lap: this.totalLaps,
            progress: 1.0,
            finished: true,
            finishTime: p.finishTime,
          };
          this.finishOrder.push(finishEntry);

          if (!this.winner) {
            this.winner = finishEntry;
            this.handleFirstWinner(p);
          }
        }
      }

      // Collision check with obstacles
      if (!p.shieldActive) {
        for (let i = this.obstacles.length - 1; i >= 0; i--) {
          const obs = this.obstacles[i];
          const distToObs = Math.hypot(p.x - obs.x, p.y - obs.y);
          if (distToObs < 35) {
            // Hit obstacle!
            p.spinTimer = 1.6; // spin out for 1.6s
            this.obstacles.splice(i, 1);
            break;
          }
        }
      }

      // Compute exact position and orientation from track
      const pt = this.track.getPointAtProgress(p.progress, p.laneOffset);
      p.x = pt.x;
      p.y = pt.y;
      p.angle = pt.angle;
      p.currentWaypoint = pt.currentWaypoint;
    }
  }

  private handleFirstWinner(winner: Participant) {
    // Record to database
    this.db.updateParticipantStats(winner.userId, winner.nickname, winner.avatar, true);

    for (const p of this.participants.values()) {
      if (p.userId !== winner.userId) {
        this.db.updateParticipantStats(p.userId, p.nickname, p.avatar, false);
      }
    }

    // Auto finish after 8 seconds
    setTimeout(() => {
      if (this.state === "RACING") {
        this.state = "FINISHED";
        this.db.recordSession({
          sessionId: this.sessionId,
          startTime: this.sessionStartTime,
          endTime: new Date().toISOString(),
          totalLaps: this.totalLaps,
          winnerUserId: winner.userId,
          winnerNickname: winner.nickname,
          winnerVehicle: winner.vehicleType,
          totalParticipants: this.participants.size,
          summaryJson: JSON.stringify(this.getLeaderboard()),
        });
      }
    }, 8000);
  }

  public getLeaderboard(): LeaderboardEntry[] {
    const list = Array.from(this.participants.values());
    list.sort((a, b) => {
      // 1. Finisher priority
      if (a.finished && !b.finished) return -1;
      if (!a.finished && b.finished) return 1;
      if (a.finished && b.finished) {
        return (a.finishRank || 999) - (b.finishRank || 999);
      }
      // 2. Lap count
      if (a.lap !== b.lap) return b.lap - a.lap;
      // 3. Progress on track
      return b.progress - a.progress;
    });

    return list.map((p, idx) => ({
      rank: p.finishRank || idx + 1,
      userId: p.userId,
      nickname: p.nickname,
      avatar: p.avatar,
      vehicleType: p.vehicleType,
      color: p.color,
      lap: Math.min(p.lap, this.totalLaps),
      progress: p.progress,
      finished: p.finished,
      finishTime: p.finishTime,
    }));
  }
}
