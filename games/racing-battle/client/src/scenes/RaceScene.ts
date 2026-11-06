import Phaser from "phaser";
import { io, Socket } from "socket.io-client";
import { TrackData, Participant, Obstacle, GameTickState, LeaderboardEntry } from "../types";

export class RaceScene extends Phaser.Scene {
  private socket!: Socket;
  private trackData: TrackData | null = null;

  // Graphics layers
  private trackGraphics!: Phaser.GameObjects.Graphics;
  private obstaclesGraphics!: Phaser.GameObjects.Graphics;
  private carGraphics!: Phaser.GameObjects.Graphics;
  private uiGraphics!: Phaser.GameObjects.Graphics;

  // Name tags map: userId -> Text
  private carLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  private leaderboardTexts: Phaser.GameObjects.Text[] = [];

  // State
  private participants: Map<string, Participant> = new Map();
  private obstacles: Obstacle[] = [];
  private gameState: string = "IDLE";
  private countdown: number | null = null;
  private totalLaps: number = 3;
  private leaderboard: LeaderboardEntry[] = [];
  private winner: LeaderboardEntry | null = null;

  // UI Text elements
  private countdownText!: Phaser.GameObjects.Text;
  private winnerBanner!: Phaser.GameObjects.Container;
  private winnerText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private leaderboardTitle!: Phaser.GameObjects.Text;

  constructor() {
    super("RaceScene");
  }

  create() {
    this.trackGraphics = this.add.graphics();
    this.obstaclesGraphics = this.add.graphics();
    this.carGraphics = this.add.graphics();
    this.uiGraphics = this.add.graphics();

    // Create Countdown UI Text
    this.countdownText = this.add.text(960, 480, "", {
      fontFamily: "Impact, 'Segoe UI Black', sans-serif",
      fontSize: "130px",
      color: "#fef08a",
      stroke: "#0f172a",
      strokeThickness: 16,
    }).setOrigin(0.5).setVisible(false).setDepth(200);

    // Create Winner Celebration Banner
    this.winnerBanner = this.add.container(960, 520).setDepth(300).setVisible(false);
    const bannerBg = this.add.rectangle(0, 0, 720, 220, 0x0f172a, 0.95);
    bannerBg.setStrokeStyle(4, 0xf59e0b);
    this.winnerText = this.add.text(0, 0, "", {
      fontFamily: "'Segoe UI Black', sans-serif",
      fontSize: "42px",
      color: "#fef08a",
      align: "center",
      stroke: "#000000",
      strokeThickness: 6,
    }).setOrigin(0.5);
    this.winnerBanner.add([bannerBg, this.winnerText]);

    // Leaderboard title text
    this.leaderboardTitle = this.add.text(38, 32, "🏁 LEADERBOARD", {
      fontFamily: "'Segoe UI', sans-serif",
      fontSize: "16px",
      fontStyle: "bold",
      color: "#38bdf8",
    }).setDepth(160);

    // Leaderboard row text objects (up to 6)
    for (let i = 0; i < 6; i++) {
      const row = this.add.text(38, 70 + i * 36, "", {
        fontFamily: "'Segoe UI', sans-serif",
        fontSize: "15px",
        fontStyle: "bold",
        color: "#f8fafc",
      }).setDepth(160);
      this.leaderboardTexts.push(row);
    }

    // Status bar (bottom center)
    this.statusText = this.add.text(960, 1040, "STATUS: MENUNGGU PEMBALAP", {
      fontFamily: "'Segoe UI', sans-serif",
      fontSize: "18px",
      fontStyle: "bold",
      color: "#94a3b8",
    }).setOrigin(0.5).setDepth(150);

    // Connect to Node.js Game Server
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
      console.log("Connected to RizLive Racing Server!");
    });
  }

  private drawTrack() {
    if (!this.trackData) return;
    const g = this.trackGraphics;
    g.clear();

    const pts = this.trackData.waypoints;
    const n = pts.length;
    const roadWidth = this.trackData.roadWidth;

    // 1. Draw outer asphalt track (gray thick ribbon)
    g.lineStyle(roadWidth + 24, 0x1e293b, 1.0);
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < n; i++) {
      g.lineTo(pts[i].x, pts[i].y);
    }
    g.closePath();
    g.strokePath();

    // 2. Asphalt roadway
    g.lineStyle(roadWidth, 0x334155, 1.0);
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < n; i++) {
      g.lineTo(pts[i].x, pts[i].y);
    }
    g.closePath();
    g.strokePath();

    // 3. Inner neon borders
    g.lineStyle(4, 0x06b6d4, 0.8);
    g.strokePath();

    // 4. White dashed centerline
    g.lineStyle(4, 0xffffff, 0.5);
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < n; i++) {
      g.lineTo(pts[i].x, pts[i].y);
    }
    g.closePath();
    g.strokePath();

    // 5. Start / Finish Line (Checkerboard strip)
    const p0 = pts[0];
    const p1 = pts[1];
    const angle = Math.atan2(p1.y - p0.y, p1.x - p0.x);
    const nx = -Math.sin(angle);
    const ny = Math.cos(angle);

    const halfW = roadWidth * 0.45;
    g.lineStyle(16, 0xf8fafc, 1.0);
    g.beginPath();
    g.moveTo(p0.x - nx * halfW, p0.y - ny * halfW);
    g.lineTo(p0.x + nx * halfW, p0.y + ny * halfW);
    g.strokePath();

    // Black checker overlay
    g.lineStyle(8, 0x0f172a, 1.0);
    g.beginPath();
    g.moveTo(p0.x - nx * halfW, p0.y - ny * halfW);
    g.lineTo(p0.x + nx * halfW, p0.y + ny * halfW);
    g.strokePath();
  }

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

    // Handle Countdown Banner
    if (this.gameState === "COUNTDOWN" && this.countdown !== null) {
      this.countdownText.setText(this.countdown > 0 ? `${this.countdown}` : "🏁 GOOO! 🏁");
      this.countdownText.setVisible(true);
      this.countdownText.setScale(1.2);
      this.tweens.add({
        targets: this.countdownText,
        scale: 1.0,
        duration: 180,
        ease: "Back.easeOut",
      });
    } else if (this.gameState === "RACING") {
      if (this.countdownText.visible) {
        this.countdownText.setText("🏁 GOOO! 🏁");
        this.tweens.add({
          targets: this.countdownText,
          alpha: 0,
          duration: 800,
          onComplete: () => {
            this.countdownText.setVisible(false);
            this.countdownText.setAlpha(1);
          },
        });
      }
    } else {
      this.countdownText.setVisible(false);
    }

    // Handle Winner Celebration
    if (this.gameState === "FINISHED" || this.winner) {
      if (this.winner) {
        this.winnerText.setText(`🏆 JUARA 1 🏆\n${this.winner.nickname}\nSelamat! 🏁`);
        this.winnerBanner.setVisible(true);
      }
    } else {
      this.winnerBanner.setVisible(false);
    }

    // Status text update
    let stateLabel = "MENUNGGU PEMBALAP";
    if (this.gameState === "COUNTDOWN") stateLabel = "HITUNG MUNDUR...";
    else if (this.gameState === "RACING") stateLabel = `BALAPAN SEDANG BERLANGSUNG (LAP 1/${this.totalLaps})`;
    else if (this.gameState === "FINISHED") stateLabel = "BALAPAN SELESAI!";
    this.statusText.setText(`STATUS: ${stateLabel} | TOTAL PEMBALAP: ${this.participants.size}`);
  }

  update(time: number, delta: number) {
    this.renderObstacles();
    this.renderCars();
    this.renderLeaderboard();
  }

  private renderObstacles() {
    const g = this.obstaclesGraphics;
    g.clear();

    for (const obs of this.obstacles) {
      g.fillStyle(0x0f172a, 0.85);
      g.fillEllipse(obs.x, obs.y, 42, 28);
      g.fillStyle(0x38bdf8, 0.6);
      g.fillEllipse(obs.x + 4, obs.y - 3, 20, 12);
      g.lineStyle(2, 0xf59e0b, 0.7);
      g.strokeEllipse(obs.x, obs.y, 44, 30);
    }
  }

  private renderCars() {
    const g = this.carGraphics;
    g.clear();

    const activeUserIds = new Set<string>();

    for (const p of this.participants.values()) {
      activeUserIds.add(p.userId);
      const hexColor = parseInt(p.color.replace("#", "0x"), 16) || 0x3b82f6;

      const cos = Math.cos(p.angle);
      const sin = Math.sin(p.angle);

      const tf = (rx: number, ry: number) => {
        return {
          x: p.x + (rx * cos - ry * sin),
          y: p.y + (rx * sin + ry * cos),
        };
      };

      // 1. Shadow under car
      g.fillStyle(0x000000, 0.4);
      const sh = tf(2, 4);
      g.fillEllipse(sh.x, sh.y, 38, 20);

      // 2. Wheels
      g.fillStyle(0x0f172a, 1.0);
      const wFL = tf(12, -13);
      const wFR = tf(12, 13);
      const wRL = tf(-12, -13);
      const wRR = tf(-12, 13);
      g.fillRoundedRect(wFL.x - 5, wFL.y - 3, 10, 6, 2);
      g.fillRoundedRect(wFR.x - 5, wFR.y - 3, 10, 6, 2);
      g.fillRoundedRect(wRL.x - 5, wRL.y - 3, 10, 6, 2);
      g.fillRoundedRect(wRR.x - 5, wRR.y - 3, 10, 6, 2);

      // 3. Car Body Shape
      g.fillStyle(hexColor, 1.0);
      const pFront = tf(20, 0);
      const pFrontL = tf(14, -10);
      const pRearL = tf(-18, -11);
      const pRear = tf(-18, 0);
      const pRearR = tf(-18, 11);
      const pFrontR = tf(14, 10);

      g.beginPath();
      g.moveTo(pFront.x, pFront.y);
      g.lineTo(pFrontL.x, pFrontL.y);
      g.lineTo(pRearL.x, pRearL.y);
      g.lineTo(pRear.x, pRear.y);
      g.lineTo(pRearR.x, pRearR.y);
      g.lineTo(pFrontR.x, pFrontR.y);
      g.closePath();
      g.fillPath();

      g.lineStyle(2, 0xffffff, 0.8);
      g.strokePath();

      // 4. Cockpit Glass
      g.fillStyle(0x0f172a, 0.85);
      const gF = tf(4, 0);
      g.fillEllipse(gF.x, gF.y, 14, 10);

      // 5. Headlights
      g.fillStyle(0xfef08a, 0.9);
      const hlL = tf(18, -6);
      const hlR = tf(18, 6);
      g.fillCircle(hlL.x, hlL.y, 2.5);
      g.fillCircle(hlR.x, hlR.y, 2.5);

      // 6. Rear Spoiler
      g.lineStyle(3, 0x1e293b, 1.0);
      const spL = tf(-17, -12);
      const spR = tf(-17, 12);
      g.beginPath();
      g.moveTo(spL.x, spL.y);
      g.lineTo(spR.x, spR.y);
      g.strokePath();

      // 7. Nitro Jet Flame effect
      if (p.nitroActive) {
        g.fillStyle(0x38bdf8, 0.9);
        const nCore = tf(-26, 0);
        g.fillTriangle(nCore.x, nCore.y, pRearL.x, pRearL.y, pRearR.x, pRearR.y);

        g.fillStyle(0xf97316, 0.8);
        const nTip = tf(-34, 0);
        g.fillTriangle(nTip.x, nTip.y, nCore.x, nCore.y - 4, nCore.x, nCore.y + 4);
      }

      // 8. Shield Glow Bubble
      if (p.shieldActive) {
        g.lineStyle(3, 0x38bdf8, 0.8);
        g.fillStyle(0x0284c7, 0.2);
        g.fillCircle(p.x, p.y, 34);
        g.strokeCircle(p.x, p.y, 34);
      }

      // 9. Floating Nickname Badge
      let label = this.carLabels.get(p.userId);
      if (!label) {
        label = this.add.text(p.x, p.y - 32, p.nickname, {
          fontFamily: "'Segoe UI', sans-serif",
          fontSize: "12px",
          fontStyle: "bold",
          color: "#ffffff",
          backgroundColor: "#0f172ae0",
          padding: { x: 6, y: 3 },
        }).setOrigin(0.5).setDepth(100);
        this.carLabels.set(p.userId, label);
      }
      label.setPosition(p.x, p.y - 32);
      label.setText(`🏎️ ${p.nickname} (L${p.lap})`);
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

  private renderLeaderboard() {
    const g = this.uiGraphics;
    g.clear();

    const topList = this.leaderboard.slice(0, 5);
    const boxX = 24;
    const boxY = 24;
    const boxW = 300;
    const boxH = Math.max(80, 50 + topList.length * 36);

    // Box Background
    g.fillStyle(0x0f172a, 0.88);
    g.fillRoundedRect(boxX, boxY, boxW, boxH, 10);
    g.lineStyle(2, 0x334155, 0.9);
    g.strokeRoundedRect(boxX, boxY, boxW, boxH, 10);

    // Header Strip
    g.fillStyle(0x1e293b, 1.0);
    g.fillRoundedRect(boxX, boxY, boxW, 36, 6);

    // Update Text rows
    const medals = ["🥇", "🥈", "🥉", "4th", "5th"];
    for (let i = 0; i < this.leaderboardTexts.length; i++) {
      const txt = this.leaderboardTexts[i];
      if (i < topList.length) {
        const item = topList[i];
        const medal = medals[i] || `${i + 1}th`;
        const lapStatus = item.finished ? "FINISH 🏁" : `Lap ${item.lap}/${this.totalLaps}`;
        txt.setText(`${medal} ${item.nickname} • ${lapStatus}`);
        txt.setVisible(true);
      } else {
        txt.setVisible(false);
      }
    }
  }
}
