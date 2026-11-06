import Phaser from "phaser";
import { io, Socket } from "socket.io-client";
import { TrackData, Participant, Obstacle, GameTickState, LeaderboardEntry } from "../types";

export class RaceScene extends Phaser.Scene {
  private socket!: Socket;
  private trackData: TrackData | null = null;

  // Graphics Layers
  private bgGraphics!: Phaser.GameObjects.Graphics;
  private trackGraphics!: Phaser.GameObjects.Graphics;
  private kerbsGraphics!: Phaser.GameObjects.Graphics;
  private chevronsGraphics!: Phaser.GameObjects.Graphics;
  private centerLineGraphics!: Phaser.GameObjects.Graphics;
  private obstaclesGraphics!: Phaser.GameObjects.Graphics;
  private carGraphics!: Phaser.GameObjects.Graphics;
  private hudGraphics!: Phaser.GameObjects.Graphics;
  private minimapGraphics!: Phaser.GameObjects.Graphics;

  // UI Text Elements
  private lapValueText!: Phaser.GameObjects.Text;
  private timeValueText!: Phaser.GameObjects.Text;
  private rankBigText!: Phaser.GameObjects.Text;
  private speedValueText!: Phaser.GameObjects.Text;
  private speedUnitText!: Phaser.GameObjects.Text;
  private countdownText!: Phaser.GameObjects.Text;
  private winnerBanner!: Phaser.GameObjects.Container;
  private winnerText!: Phaser.GameObjects.Text;

  // Leaderboard Row Containers
  private leaderboardContainer!: Phaser.GameObjects.Container;
  private leaderboardRows: {
    bg: Phaser.GameObjects.Rectangle;
    badgeBg: Phaser.GameObjects.Rectangle;
    badgeText: Phaser.GameObjects.Text;
    nameText: Phaser.GameObjects.Text;
    gapText: Phaser.GameObjects.Text;
  }[] = [];

  // Car Floating Labels: userId -> Text
  private carLabels: Map<string, Phaser.GameObjects.Text> = new Map();

  // State
  private participants: Map<string, Participant> = new Map();
  private obstacles: Obstacle[] = [];
  private gameState: string = "IDLE";
  private countdown: number | null = null;
  private totalLaps: number = 3;
  private leaderboard: LeaderboardEntry[] = [];
  private winner: LeaderboardEntry | null = null;

  // Animation / Time counters
  private raceElapsedTime: number = 0;
  private animTimer: number = 0;
  private radarPingRadius: number = 4;

  constructor() {
    super("RaceScene");
  }

  create() {
    // 1. Initialize layered graphics pipelines
    this.bgGraphics = this.add.graphics().setDepth(0);
    this.trackGraphics = this.add.graphics().setDepth(10);
    this.kerbsGraphics = this.add.graphics().setDepth(12);
    this.chevronsGraphics = this.add.graphics().setDepth(14);
    this.centerLineGraphics = this.add.graphics().setDepth(16);
    this.obstaclesGraphics = this.add.graphics().setDepth(20);
    this.carGraphics = this.add.graphics().setDepth(30);
    this.hudGraphics = this.add.graphics().setDepth(100);
    this.minimapGraphics = this.add.graphics().setDepth(110);

    // 2. Draw static Cyberpunk City Environment Background
    this.drawCyberpunkBackground();

    // 3. Create Top-Left HUD (LAP & TIME)
    this.createTopLeftHUD();

    // 4. Create Left Leaderboard HUD Cards
    this.createLeaderboardHUD();

    // 5. Create Top-Right HUD (Rank & Speedometer Gauge)
    this.createTopRightHUD();

    // 6. Create Countdown Banner & Winner Celebration
    this.createAnnouncementOverlays();

    // 7. Socket.IO Connection to Authoritative Game Server
    const serverHost = window.location.hostname || "localhost";
    this.socket = io(`http://${serverHost}:3001`);

    this.socket.on("init_track", (track: TrackData) => {
      this.trackData = track;
      this.drawTrack();
    });

    this.socket.on("game_tick", (tick: GameTickState) => {
      this.handleGameTick(tick);
    });

    this.socket.on("connect", () => {
      console.log("🎮 [Phaser Client] Connected to RizLive Authoritative Server!");
    });
  }

  // =========================================================================
  // ENVIRONMENT & TRACK RENDERING
  // =========================================================================

  private drawCyberpunkBackground() {
    const g = this.bgGraphics;
    g.clear();

    // Deep space night sky with soft indigo-purple ambient haze
    g.fillGradientStyle(0x060814, 0x060814, 0x110b29, 0x0a1026, 1);
    g.fillRect(0, 0, 1920, 1080);

    // Distant Neon City Skyline Silhouettes with Glowing Windows
    const buildings = [
      { x: 120, w: 90, h: 220 },
      { x: 230, w: 140, h: 320 },
      { x: 390, w: 80, h: 180 },
      { x: 490, w: 160, h: 280 },
      { x: 670, w: 110, h: 240 },
      { x: 1180, w: 130, h: 310 },
      { x: 1330, w: 95, h: 260 },
      { x: 1445, w: 170, h: 340 },
      { x: 1640, w: 110, h: 230 },
      { x: 1770, w: 120, h: 290 },
    ];

    for (const b of buildings) {
      g.fillStyle(0x0b1022, 0.7);
      g.fillRect(b.x, 1080 - b.h, b.w, b.h);
      g.lineStyle(1.5, 0x1e293b, 0.8);
      g.strokeRect(b.x, 1080 - b.h, b.w, b.h);

      // Micro LED Windows
      for (let wy = 1080 - b.h + 20; wy < 1050; wy += 28) {
        for (let wx = b.x + 15; wx < b.x + b.w - 15; wx += 24) {
          if (Math.random() > 0.45) {
            const winColor = Math.random() > 0.6 ? 0x00f0ff : 0xfacc15;
            g.fillStyle(winColor, 0.4);
            g.fillRect(wx, wy, 8, 14);
          }
        }
      }
    }

    // Distant Cyberpunk Grid Lines (top corners & horizon)
    g.lineStyle(1, 0x38bdf8, 0.12);
    for (let x = 0; x <= 1920; x += 120) {
      g.lineBetween(x, 0, x, 1080);
    }
    for (let y = 0; y <= 1080; y += 90) {
      g.lineBetween(0, y, 1920, y);
    }

    // Neon Palm Trees on trackside verges
    const palmPositions = [
      { x: 180, y: 440 },
      { x: 340, y: 220 },
      { x: 680, y: 160 },
      { x: 1040, y: 240 },
      { x: 1380, y: 180 },
      { x: 1760, y: 440 },
      { x: 1620, y: 880 },
      { x: 980, y: 960 },
      { x: 540, y: 960 },
    ];

    for (const p of palmPositions) {
      this.drawNeonPalmTree(g, p.x, p.y);
    }
  }

  private drawNeonPalmTree(g: Phaser.GameObjects.Graphics, x: number, y: number) {
    // Trunk
    g.lineStyle(4, 0x1e1b4b, 0.8);
    const trunkCurve = new Phaser.Curves.QuadraticBezier(
      new Phaser.Math.Vector2(x, y + 40),
      new Phaser.Math.Vector2(x + 5, y + 15),
      new Phaser.Math.Vector2(x, y)
    );
    g.strokePoints(trunkCurve.getPoints(8));

    // Glowing Neon Fronds (Cyan & Magenta)
    const fronds = [
      { dx: -35, dy: -25, c: 0x00f0ff },
      { dx: 35, dy: -25, c: 0xff007f },
      { dx: -45, dy: 5, c: 0x00f0ff },
      { dx: 45, dy: 5, c: 0xff007f },
      { dx: 0, dy: -38, c: 0x38bdf8 },
    ];

    for (const f of fronds) {
      g.lineStyle(3, f.c, 0.7);
      const frondCurve = new Phaser.Curves.QuadraticBezier(
        new Phaser.Math.Vector2(x, y),
        new Phaser.Math.Vector2(x + f.dx * 0.5, y + f.dy - 12),
        new Phaser.Math.Vector2(x + f.dx, y + f.dy)
      );
      g.strokePoints(frondCurve.getPoints(8));
    }
  }

  private drawTrack() {
    if (!this.trackData) return;
    const g = this.trackGraphics;
    const kg = this.kerbsGraphics;
    const cg = this.chevronsGraphics;
    const lg = this.centerLineGraphics;

    g.clear();
    kg.clear();
    cg.clear();
    lg.clear();

    const pts = this.trackData.waypoints;
    const n = pts.length;
    const roadWidth = this.trackData.roadWidth || 140;

    // 1. OUTER BARRIER NEON GLOW (Cyan outer, Magenta inner)
    g.lineStyle(roadWidth + 48, 0x0f172a, 0.95);
    this.strokeClosedCurve(g, pts);

    // Neon Aura Tubing (Magenta & Cyan rim)
    g.lineStyle(roadWidth + 34, 0xff007f, 0.35);
    this.strokeClosedCurve(g, pts);
    g.lineStyle(roadWidth + 24, 0x00f0ff, 0.45);
    this.strokeClosedCurve(g, pts);

    // 2. TARMAC ASPHALT (Dark Carbon Texture)
    g.lineStyle(roadWidth + 12, 0x111625, 1.0);
    this.strokeClosedCurve(g, pts);

    g.lineStyle(roadWidth, 0x182032, 1.0);
    this.strokeClosedCurve(g, pts);

    // Subtle inner glossy tarmac highlight
    g.lineStyle(roadWidth - 28, 0x1e293b, 0.65);
    this.strokeClosedCurve(g, pts);

    // 3. SEGMENTED RUMBLE KERBS (Alternating Red & White racing curbs)
    this.drawRumbleKerbs(kg, pts, roadWidth);

    // 4. NEON TURNING CHEVRON ARROWS (>>>) on corner apexes
    this.drawCornerChevrons(cg, pts);

    // 5. CENTER DOTTED GLOW RACELINE
    this.drawCenterNeonDashes(lg, pts);

    // 6. START / FINISH LINE CHECKERBOARD
    this.drawStartFinishLine(g, pts, roadWidth);
  }

  private strokeClosedCurve(g: Phaser.GameObjects.Graphics, pts: { x: number; y: number }[]) {
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      g.lineTo(pts[i].x, pts[i].y);
    }
    g.closePath();
    g.strokePath();
  }

  private drawRumbleKerbs(kg: Phaser.GameObjects.Graphics, pts: { x: number; y: number }[], roadWidth: number) {
    const n = pts.length;
    const halfW = roadWidth * 0.5 + 4;

    for (let i = 0; i < n; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % n];
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      const nx = -Math.sin(angle);
      const ny = Math.cos(angle);

      const segments = Math.floor(dist / 22);
      for (let s = 0; s < segments; s++) {
        const t1 = s / segments;
        const t2 = (s + 0.9) / segments;
        const x1 = p1.x + (p2.x - p1.x) * t1;
        const y1 = p1.y + (p2.y - p1.y) * t1;
        const x2 = p1.x + (p2.x - p1.x) * t2;
        const y2 = p1.y + (p2.y - p1.y) * t2;

        const isRed = s % 2 === 0;
        const kerbColor = isRed ? 0xef4444 : 0xf8fafc;

        // Left Kerb
        kg.lineStyle(6, kerbColor, 0.95);
        kg.beginPath();
        kg.moveTo(x1 + nx * halfW, y1 + ny * halfW);
        kg.lineTo(x2 + nx * halfW, y2 + ny * halfW);
        kg.strokePath();

        // Right Kerb
        kg.lineStyle(6, isRed ? 0xf8fafc : 0xef4444, 0.95);
        kg.beginPath();
        kg.moveTo(x1 - nx * halfW, y1 - ny * halfW);
        kg.lineTo(x2 - nx * halfW, y2 - ny * halfW);
        kg.strokePath();
      }
    }
  }

  private drawCornerChevrons(cg: Phaser.GameObjects.Graphics, pts: { x: number; y: number }[]) {
    // Corner apex indices: 3, 4, 7, 8, 10, 11
    const cornerIndices = [3, 4, 7, 8, 10, 11];
    const n = pts.length;

    for (const idx of cornerIndices) {
      if (idx >= n) continue;
      const prev = pts[(idx - 1 + n) % n];
      const curr = pts[idx];
      const next = pts[(idx + 1) % n];

      const inAngle = Math.atan2(curr.y - prev.y, curr.x - prev.x);
      const outAngle = Math.atan2(next.y - curr.y, next.x - curr.x);
      const midAngle = (inAngle + outAngle) / 2;

      // Draw 3 yellow glowing chevron arrows (>>>)
      cg.lineStyle(3.5, 0xfacc15, 0.95);
      const r = 90;
      const ox = curr.x - Math.cos(midAngle) * r;
      const oy = curr.y - Math.sin(midAngle) * r;

      for (let c = -1; c <= 1; c++) {
        const offsetDist = c * 16;
        const cx = ox + Math.cos(midAngle) * offsetDist;
        const cy = oy + Math.sin(midAngle) * offsetDist;

        cg.beginPath();
        cg.moveTo(cx - 10 * Math.cos(outAngle - 0.7), cy - 10 * Math.sin(outAngle - 0.7));
        cg.lineTo(cx, cy);
        cg.lineTo(cx - 10 * Math.cos(outAngle + 0.7), cy - 10 * Math.sin(outAngle + 0.7));
        cg.strokePath();
      }
    }
  }

  private drawCenterNeonDashes(lg: Phaser.GameObjects.Graphics, pts: { x: number; y: number }[]) {
    const n = pts.length;
    lg.lineStyle(3, 0x00f0ff, 0.85);

    for (let i = 0; i < n; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % n];
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const dashes = Math.floor(dist / 34);

      for (let d = 0; d < dashes; d++) {
        const tStart = (d * 34 + 6) / dist;
        const tEnd = (d * 34 + 22) / dist;
        if (tEnd > 1) break;

        lg.beginPath();
        lg.moveTo(p1.x + (p2.x - p1.x) * tStart, p1.y + (p2.y - p1.y) * tStart);
        lg.lineTo(p1.x + (p2.x - p1.x) * tEnd, p1.y + (p2.y - p1.y) * tEnd);
        lg.strokePath();
      }
    }
  }

  private drawStartFinishLine(g: Phaser.GameObjects.Graphics, pts: { x: number; y: number }[], roadWidth: number) {
    const p0 = pts[0];
    const p1 = pts[1];
    const angle = Math.atan2(p1.y - p0.y, p1.x - p0.x);
    const nx = -Math.sin(angle);
    const ny = Math.cos(angle);
    const halfW = roadWidth * 0.48;

    // White base bar
    g.lineStyle(20, 0xf8fafc, 1.0);
    g.beginPath();
    g.moveTo(p0.x - nx * halfW, p0.y - ny * halfW);
    g.lineTo(p0.x + nx * halfW, p0.y + ny * halfW);
    g.strokePath();

    // Black checkers overlay
    g.lineStyle(10, 0x090d16, 1.0);
    g.beginPath();
    g.moveTo(p0.x - nx * halfW, p0.y - ny * halfW);
    g.lineTo(p0.x + nx * halfW, p0.y + ny * halfW);
    g.strokePath();

    // Start Arch Neon Laser Beam (Cyan)
    g.lineStyle(4, 0x00f0ff, 0.9);
    g.beginPath();
    g.moveTo(p0.x - nx * (halfW + 18), p0.y - ny * (halfW + 18));
    g.lineTo(p0.x + nx * (halfW + 18), p0.y + ny * (halfW + 18));
    g.strokePath();
  }

  // =========================================================================
  // HUD CREATION (EXACT MATCH TO REFERENCE IMAGE)
  // =========================================================================

  private createTopLeftHUD() {
    // 1. LAP Header & Value
    this.add.text(42, 28, "LAP", {
      fontFamily: "'Orbitron', 'Rajdhani', sans-serif",
      fontSize: "16px",
      fontStyle: "italic",
      color: "#94a3b8",
    }).setDepth(150);

    this.lapValueText = this.add.text(40, 48, "1/3", {
      fontFamily: "'Orbitron', 'Segoe UI Black', sans-serif",
      fontSize: "48px",
      fontStyle: "italic",
      color: "#ffffff",
      stroke: "#00f0ff",
      strokeThickness: 3,
    }).setDepth(150);

    // 2. TIME Header & Value
    this.add.text(42, 114, "TIME", {
      fontFamily: "'Orbitron', 'Rajdhani', sans-serif",
      fontSize: "14px",
      fontStyle: "italic",
      color: "#94a3b8",
    }).setDepth(150);

    this.timeValueText = this.add.text(40, 134, "00:00.00", {
      fontFamily: "'Orbitron', 'Courier New', monospace",
      fontSize: "28px",
      fontStyle: "bold",
      color: "#ffffff",
    }).setDepth(150);
  }

  private createLeaderboardHUD() {
    this.leaderboardContainer = this.add.container(40, 190).setDepth(150);

    // Up to 6 racer cards as seen in the reference image
    for (let i = 0; i < 6; i++) {
      const y = i * 44;

      // Card Background (frosted dark glassmorphism)
      const bg = this.add.rectangle(0, y, 260, 38, 0x0a1024, 0.85);
      bg.setOrigin(0, 0);
      bg.setStrokeStyle(1.5, 0x1e293b, 0.9);

      // Rank Badge Box
      const badgeBg = this.add.rectangle(6, y + 5, 26, 28, 0x1e293b, 1.0);
      badgeBg.setOrigin(0, 0);

      // Rank Number Text
      const badgeText = this.add.text(19, y + 19, `${i + 1}`, {
        fontFamily: "'Orbitron', sans-serif",
        fontSize: "15px",
        fontStyle: "bold",
        color: "#ffffff",
      }).setOrigin(0.5);

      // Nickname
      const nameText = this.add.text(42, y + 19, "", {
        fontFamily: "'Rajdhani', 'Segoe UI', sans-serif",
        fontSize: "16px",
        fontStyle: "bold",
        color: "#ffffff",
      }).setOrigin(0, 0.5);

      // Gap Time / Status
      const gapText = this.add.text(250, y + 19, "", {
        fontFamily: "'Orbitron', monospace",
        fontSize: "14px",
        fontStyle: "bold",
        color: "#94a3b8",
      }).setOrigin(1, 0.5);

      this.leaderboardContainer.add([bg, badgeBg, badgeText, nameText, gapText]);
      this.leaderboardRows.push({ bg, badgeBg, badgeText, nameText, gapText });
    }
  }

  private createTopRightHUD() {
    // 1. Giant Metallic Rank Display (e.g. 2ND)
    this.rankBigText = this.add.text(1740, 48, "1ST", {
      fontFamily: "'Orbitron', 'Impact', sans-serif",
      fontSize: "64px",
      fontStyle: "italic",
      color: "#ffffff",
      stroke: "#1e293b",
      strokeThickness: 8,
    }).setOrigin(1, 0).setDepth(150);

    // 2. Speedometer Numbers (e.g. 268 KM/H)
    this.speedValueText = this.add.text(1880, 52, "0", {
      fontFamily: "'Orbitron', sans-serif",
      fontSize: "50px",
      fontStyle: "bold",
      color: "#ffffff",
    }).setOrigin(1, 0).setDepth(150);

    this.speedUnitText = this.add.text(1880, 32, "KM/H", {
      fontFamily: "'Orbitron', sans-serif",
      fontSize: "16px",
      fontStyle: "italic",
      color: "#38bdf8",
    }).setOrigin(1, 0).setDepth(150);
  }

  private createAnnouncementOverlays() {
    // Countdown Display
    this.countdownText = this.add.text(960, 480, "", {
      fontFamily: "'Orbitron', 'Impact', sans-serif",
      fontSize: "140px",
      fontStyle: "italic",
      color: "#facc15",
      stroke: "#070a14",
      strokeThickness: 18,
    }).setOrigin(0.5).setVisible(false).setDepth(250);

    // Winner Banner Modal
    this.winnerBanner = this.add.container(960, 500).setDepth(300).setVisible(false);

    const bannerBg = this.add.rectangle(0, 0, 780, 240, 0x090e1f, 0.95);
    bannerBg.setStrokeStyle(3, 0xfacc15, 1);

    this.winnerText = this.add.text(0, 0, "", {
      fontFamily: "'Orbitron', 'Segoe UI Black', sans-serif",
      fontSize: "42px",
      fontStyle: "italic",
      color: "#facc15",
      align: "center",
      stroke: "#000000",
      strokeThickness: 8,
    }).setOrigin(0.5);

    this.winnerBanner.add([bannerBg, this.winnerText]);
  }

  // =========================================================================
  // GAME TICK & LOGIC
  // =========================================================================

  private handleGameTick(tick: GameTickState) {
    this.gameState = tick.state;
    this.countdown = tick.countdown;
    this.totalLaps = tick.totalLaps;
    this.leaderboard = tick.leaderboard;
    this.obstacles = tick.obstacles;
    this.winner = tick.winner;

    this.participants.clear();
    for (const p of tick.participants) {
      this.participants.set(p.userId, p);
    }

    // Countdown Banner Handling
    if (this.gameState === "COUNTDOWN" && this.countdown !== null) {
      this.countdownText.setText(this.countdown > 0 ? `${this.countdown}` : "🏁 GOOO! 🏁");
      this.countdownText.setColor(this.countdown === 1 ? "#10b981" : this.countdown === 2 ? "#f59e0b" : "#ef4444");
      this.countdownText.setVisible(true);
      this.countdownText.setScale(1.25);
      this.tweens.add({
        targets: this.countdownText,
        scale: 1.0,
        duration: 160,
        ease: "Back.easeOut",
      });
    } else if (this.gameState === "RACING") {
      if (this.countdownText.visible) {
        this.countdownText.setText("🏁 GOOO! 🏁");
        this.countdownText.setColor("#facc15");
        this.tweens.add({
          targets: this.countdownText,
          alpha: 0,
          duration: 900,
          onComplete: () => {
            this.countdownText.setVisible(false);
            this.countdownText.setAlpha(1);
          },
        });
      }
    } else {
      this.countdownText.setVisible(false);
    }

    // Winner Banner Handling
    if (this.gameState === "FINISHED" || this.winner) {
      if (this.winner) {
        this.winnerText.setText(`🏆 JUARA 1 🏆\n${this.winner.nickname.toUpperCase()}\nSELAMAT JUARA BALAP! 🏁`);
        this.winnerBanner.setVisible(true);
      }
    } else {
      this.winnerBanner.setVisible(false);
    }
  }

  // =========================================================================
  // FRAME UPDATE LOOP (30-60 FPS)
  // =========================================================================

  update(time: number, delta: number) {
    this.animTimer += delta * 0.001;

    // Track race stopwatch time
    if (this.gameState === "RACING") {
      this.raceElapsedTime += delta * 0.001;
    } else if (this.gameState === "IDLE" || this.gameState === "WAITING") {
      this.raceElapsedTime = 0;
    }

    // Render Dynamic Graphics
    this.renderObstacles();
    this.renderCars();
    this.renderHUD(delta);
    this.renderMinimap();
  }

  // =========================================================================
  // CAR GRAPHICS RENDERING (WITH RACING STRIPES, UNDERGLOW, HEADLIGHTS, NITRO)
  // =========================================================================

  private renderCars() {
    const g = this.carGraphics;
    g.clear();

    const activeUserIds = new Set<string>();

    for (const p of this.participants.values()) {
      activeUserIds.add(p.userId);
      const hexColor = parseInt(p.color.replace("#", "0x"), 16) || 0x3b82f6;

      const cos = Math.cos(p.angle);
      const sin = Math.sin(p.angle);

      // Local to World coordinate transform helper
      const tf = (rx: number, ry: number) => {
        return {
          x: p.x + (rx * cos - ry * sin),
          y: p.y + (rx * sin + ry * cos),
        };
      };

      // 1. NEON UNDERGLOW (Soft radial pool beneath car on asphalt)
      g.fillStyle(hexColor, 0.45);
      g.fillEllipse(p.x, p.y, 56, 32);

      // 2. HEADLIGHT PROJECTION BEAMS (Illuminating track forward)
      g.fillStyle(0xfef08a, 0.18);
      const hlBaseL = tf(22, -8);
      const hlBaseR = tf(22, 8);
      const hlTipL = tf(95, -28);
      const hlTipR = tf(95, 28);
      g.fillTriangle(hlBaseL.x, hlBaseL.y, hlTipL.x, hlTipL.y, hlTipR.x, hlTipR.y);

      // 3. CAR SHADOW & WHEELS
      g.fillStyle(0x000000, 0.65);
      g.fillEllipse(p.x + 2, p.y + 4, 46, 24);

      // 4 Wheels
      g.fillStyle(0x090d16, 1.0);
      const wFL = tf(14, -15);
      const wFR = tf(14, 15);
      const wRL = tf(-14, -15);
      const wRR = tf(-14, 15);
      g.fillRoundedRect(wFL.x - 6, wFL.y - 4, 12, 8, 2);
      g.fillRoundedRect(wFR.x - 6, wFR.y - 4, 12, 8, 2);
      g.fillRoundedRect(wRL.x - 6, wRL.y - 4, 12, 8, 2);
      g.fillRoundedRect(wRR.x - 6, wRR.y - 4, 12, 8, 2);

      // 4. AERODYNAMIC SUPERCAR BODY
      g.fillStyle(hexColor, 1.0);
      const pNose = tf(26, 0);
      const pFwdL = tf(18, -12);
      const pMidL = tf(2, -14);
      const pRearL = tf(-22, -13);
      const pTail = tf(-22, 0);
      const pRearR = tf(-22, 13);
      const pMidR = tf(2, 14);
      const pFwdR = tf(18, 12);

      g.beginPath();
      g.moveTo(pNose.x, pNose.y);
      g.lineTo(pFwdL.x, pFwdL.y);
      g.lineTo(pMidL.x, pMidL.y);
      g.lineTo(pRearL.x, pRearL.y);
      g.lineTo(pTail.x, pTail.y);
      g.lineTo(pRearR.x, pRearR.y);
      g.lineTo(pMidR.x, pMidR.y);
      g.lineTo(pFwdR.x, pFwdR.y);
      g.closePath();
      g.fillPath();

      // Sleek White Chassis Outline
      g.lineStyle(2, 0xffffff, 0.85);
      g.strokePath();

      // 5. DUAL WHITE RACING STRIPES (Exact match to uploaded reference image)
      g.lineStyle(2.5, 0xffffff, 0.95);
      const s1Front = tf(24, -3);
      const s1Rear = tf(-20, -3);
      const s2Front = tf(24, 3);
      const s2Rear = tf(-20, 3);
      g.lineBetween(s1Front.x, s1Front.y, s1Rear.x, s1Rear.y);
      g.lineBetween(s2Front.x, s2Front.y, s2Rear.x, s2Rear.y);

      // 6. COCKPIT TINTED GLASS WITH SPECULAR HIGHLIGHT
      g.fillStyle(0x0a1024, 0.9);
      const glassCenter = tf(4, 0);
      g.fillEllipse(glassCenter.x, glassCenter.y, 18, 12);

      // 7. BRIGHT RED REAR LED TAILLIGHTS
      g.fillStyle(0xef4444, 1.0);
      const tlL = tf(-22, -10);
      const tlR = tf(-22, 10);
      g.fillCircle(tlL.x, tlL.y, 2.5);
      g.fillCircle(tlR.x, tlR.y, 2.5);

      // 8. TWIN NITRO JET FLAMES (When nitroActive)
      if (p.nitroActive) {
        // Dual blue core jets
        g.fillStyle(0x00f0ff, 0.95);
        const jetCoreL = tf(-34, -7);
        const jetCoreR = tf(-34, 7);
        g.fillTriangle(tlL.x, tlL.y, tlL.x, tlL.y - 3, jetCoreL.x, jetCoreL.y);
        g.fillTriangle(tlR.x, tlR.y, tlR.x, tlR.y + 3, jetCoreR.x, jetCoreR.y);

        // Dual fire orange outer tips
        g.fillStyle(0xf97316, 0.85);
        const jetTipL = tf(-44, -7);
        const jetTipR = tf(-44, 7);
        g.fillTriangle(jetCoreL.x, jetCoreL.y - 2, jetCoreL.x, jetCoreL.y + 2, jetTipL.x, jetTipL.y);
        g.fillTriangle(jetCoreR.x, jetCoreR.y - 2, jetCoreR.x, jetCoreR.y + 2, jetTipR.x, jetTipR.y);
      }

      // 9. SHIELD BUBBLE
      if (p.shieldActive) {
        g.lineStyle(3, 0x00f0ff, 0.85);
        g.fillStyle(0x0284c7, 0.25);
        g.fillCircle(p.x, p.y, 38);
        g.strokeCircle(p.x, p.y, 38);
      }

      // 10. FLOATING NICKNAME BADGE (Hovering above the car)
      let label = this.carLabels.get(p.userId);
      if (!label) {
        label = this.add.text(p.x, p.y - 36, "", {
          fontFamily: "'Rajdhani', 'Segoe UI', sans-serif",
          fontSize: "13px",
          fontStyle: "bold",
          color: "#ffffff",
          backgroundColor: "#070b18f0",
          padding: { x: 8, y: 3 },
        }).setOrigin(0.5).setDepth(200);
        this.carLabels.set(p.userId, label);
      }
      label.setPosition(p.x, p.y - 36);
      label.setText(`🏎️ ${p.nickname}`);
      label.setVisible(true);
    }

    // Clean removed racers labels
    for (const [uid, lbl] of this.carLabels.entries()) {
      if (!activeUserIds.has(uid)) {
        lbl.destroy();
        this.carLabels.delete(uid);
      }
    }
  }

  // =========================================================================
  // OBSTACLES RENDERING
  // =========================================================================

  private renderObstacles() {
    const g = this.obstaclesGraphics;
    g.clear();

    for (const obs of this.obstacles) {
      // Iridescent oil slick
      g.fillStyle(0x070b19, 0.85);
      g.fillEllipse(obs.x, obs.y, 44, 28);
      g.fillStyle(0x00f0ff, 0.5);
      g.fillEllipse(obs.x + 3, obs.y - 2, 22, 12);
      g.lineStyle(2, 0xf59e0b, 0.8);
      g.strokeEllipse(obs.x, obs.y, 46, 30);
    }
  }

  // =========================================================================
  // HUD RENDERING (MATCHING EXACT REFERENCE IMAGE)
  // =========================================================================

  private renderHUD(delta: number) {
    const g = this.hudGraphics;
    g.clear();

    // 1. Update LAP counter (from leading racer)
    const topList = this.leaderboard.slice(0, 6);
    const leadRacer = topList.length > 0 ? topList[0] : null;
    const currentLap = leadRacer ? Math.min(this.totalLaps, leadRacer.lap) : 1;
    this.lapValueText.setText(`${currentLap}/${this.totalLaps}`);

    // 2. Update TIME stopwatch (mm:ss.SS)
    const mins = Math.floor(this.raceElapsedTime / 60);
    const secs = Math.floor(this.raceElapsedTime % 60);
    const centi = Math.floor((this.raceElapsedTime * 100) % 100);
    const timeFormatted = `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${centi.toString().padStart(2, "0")}`;
    this.timeValueText.setText(timeFormatted);

    // 3. Update LEADERBOARD Glass Cards
    const palette = [
      { border: 0xfacc15, bg: 0xeab308, text: "#000000" }, // 1st Gold
      { border: 0x00f0ff, bg: 0x0284c7, text: "#ffffff" }, // 2nd Cyan
      { border: 0xa855f7, bg: 0x7e22ce, text: "#ffffff" }, // 3rd Purple
      { border: 0x22c55e, bg: 0x15803d, text: "#ffffff" }, // 4th Green
      { border: 0xf97316, bg: 0xc2410c, text: "#ffffff" }, // 5th Orange
      { border: 0xec4899, bg: 0xbe185d, text: "#ffffff" }, // 6th Pink
    ];

    for (let i = 0; i < this.leaderboardRows.length; i++) {
      const row = this.leaderboardRows[i];
      if (i < topList.length) {
        const item = topList[i];
        const theme = palette[i % palette.length];

        row.badgeText.setText(`${i + 1}`);
        row.badgeBg.setFillStyle(theme.bg, 1.0);
        row.nameText.setText(`🏎️ ${item.nickname.toUpperCase()}`);

        if (i === 0) {
          // Highlight card for 1st Place (FLASH style)
          row.bg.setFillStyle(0xfacc15, 0.92);
          row.bg.setStrokeStyle(2, 0xffffff, 1.0);
          row.nameText.setColor("#000000");
          row.gapText.setColor("#1e293b");
          row.gapText.setText(item.finished ? "FINISH" : "LEADER");
        } else {
          row.bg.setFillStyle(0x0a1024, 0.85);
          row.bg.setStrokeStyle(1.5, theme.border, 0.8);
          row.nameText.setColor("#ffffff");
          row.gapText.setColor("#94a3b8");

          // Calculate dynamic gap: e.g. -0.71, -1.35
          const progressDiff = (topList[0].lap - item.lap) + (topList[0].progress - item.progress);
          const gapSec = Math.max(0.2, progressDiff * 14.5).toFixed(2);
          row.gapText.setText(item.finished ? "FINISH" : `-${gapSec}`);
        }

        row.bg.setVisible(true);
        row.badgeBg.setVisible(true);
        row.badgeText.setVisible(true);
        row.nameText.setVisible(true);
        row.gapText.setVisible(true);
      } else {
        row.bg.setVisible(false);
        row.badgeBg.setVisible(false);
        row.badgeText.setVisible(false);
        row.nameText.setVisible(false);
        row.gapText.setVisible(false);
      }
    }

    // 4. Update TOP-RIGHT Speedometer & Rank
    if (leadRacer) {
      // Calculate realistic speed in KM/H (e.g. 210 to 330)
      const participantObj = this.participants.get(leadRacer.userId);
      const isNitro = participantObj ? participantObj.nitroActive : false;
      const baseSpd = participantObj ? participantObj.speed : 240;
      const kmh = Math.round(baseSpd * 0.58 + (isNitro ? 120 : 60));

      this.speedValueText.setText(`${kmh}`);
      this.rankBigText.setText("1ST");

      // Draw Dual-Gradient Nitro Boost Gauge Bar
      const gaugeX = 1680;
      const gaugeY = 120;
      const gaugeW = 200;
      const gaugeH = 12;

      // Dark gauge track
      g.fillStyle(0x0a1024, 0.85);
      g.fillRoundedRect(gaugeX, gaugeY, gaugeW, gaugeH, 4);
      g.lineStyle(1.5, 0x1e293b, 0.8);
      g.strokeRoundedRect(gaugeX, gaugeY, gaugeW, gaugeH, 4);

      // Cyan Segment (Left)
      g.fillStyle(0x00f0ff, 0.95);
      g.fillRoundedRect(gaugeX, gaugeY, gaugeW * 0.65, gaugeH, 4);

      // Orange Segment (Right)
      g.fillStyle(0xf97316, 0.95);
      g.fillRoundedRect(gaugeX + gaugeW * 0.65, gaugeY, gaugeW * 0.35, gaugeH, 4);

      if (isNitro) {
        g.lineStyle(3, 0xfacc15, 0.9);
        g.strokeRoundedRect(gaugeX - 2, gaugeY - 2, gaugeW + 4, gaugeH + 4, 6);
      }
    } else {
      this.speedValueText.setText("0");
      this.rankBigText.setText("1ST");
    }
  }

  // =========================================================================
  // MINIMAP CIRCUIT RADAR (BOTTOM-RIGHT EXACT MATCH)
  // =========================================================================

  private renderMinimap() {
    if (!this.trackData) return;
    const g = this.minimapGraphics;
    g.clear();

    const mapX = 1660;
    const mapY = 880;
    const mapW = 220;
    const mapH = 170;

    // Glassmorphism card frame
    g.fillStyle(0x070c1d, 0.88);
    g.fillRoundedRect(mapX, mapY, mapW, mapH, 14);
    g.lineStyle(1.5, 0x00f0ff, 0.35);
    g.strokeRoundedRect(mapX, mapY, mapW, mapH, 14);

    // Compute bounds of circuit to fit inside minimap
    const pts = this.trackData.waypoints;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    const scaleX = (mapW - 36) / (maxX - minX);
    const scaleY = (mapH - 36) / (maxY - minY);
    const scale = Math.min(scaleX, scaleY);

    const toMap = (wx: number, wy: number) => {
      return {
        x: mapX + 18 + (wx - minX) * scale,
        y: mapY + 18 + (wy - minY) * scale,
      };
    };

    // Draw Minimap Circuit Outline
    g.lineStyle(4, 0x38bdf8, 0.85);
    g.beginPath();
    const startM = toMap(pts[0].x, pts[0].y);
    g.moveTo(startM.x, startM.y);
    for (let i = 1; i < pts.length; i++) {
      const m = toMap(pts[i].x, pts[i].y);
      g.lineTo(m.x, m.y);
    }
    g.closePath();
    g.strokePath();

    // Checkered Flag icon at Start/Finish on Minimap
    g.fillStyle(0xffffff, 1.0);
    g.fillCircle(startM.x, startM.y, 4.5);
    g.lineStyle(1.5, 0x000000, 1.0);
    g.strokeCircle(startM.x, startM.y, 4.5);

    // Draw Real-time Racer Blips on Minimap
    let isLeader = true;
    for (const item of this.leaderboard) {
      const p = this.participants.get(item.userId);
      if (!p) continue;
      const mp = toMap(p.x, p.y);
      const hexColor = parseInt(item.color.replace("#", "0x"), 16) || 0x38bdf8;

      if (isLeader) {
        // Pulsing radar halo around leader
        this.radarPingRadius = 4 + (Math.sin(this.animTimer * 6) + 1) * 3;
        g.lineStyle(1.5, 0xfacc15, 0.8);
        g.strokeCircle(mp.x, mp.y, this.radarPingRadius);

        g.fillStyle(0xfacc15, 1.0);
        g.fillCircle(mp.x, mp.y, 5);
        isLeader = false;
      } else {
        g.fillStyle(hexColor, 1.0);
        g.fillCircle(mp.x, mp.y, 4);
      }
    }
  }
}
