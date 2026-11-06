import Phaser from "phaser";
import { io, Socket } from "socket.io-client";
import { TrackData, Participant, Obstacle, GameTickState, LeaderboardEntry } from "../types";

export type CameraMode = "CHASE" | "TRACK" | "OVERVIEW";
export type SpotlightAngle = "FRONT" | "REAR";

export class RaceScene extends Phaser.Scene {
  private socket!: Socket;
  private trackData: TrackData | null = null;

  // Layer Architecture: Separates Game World from Static 1920x1080 Arcade HUD
  private worldLayer!: Phaser.GameObjects.Layer;
  private hudLayer!: Phaser.GameObjects.Layer;
  private hudCamera!: Phaser.Cameras.Scene2D.Camera;

  // Camera Control State (Focused on vehicles with dynamic chase drone)
  private cameraMode: CameraMode = "CHASE";
  private camFocusX: number = 380;
  private camFocusY: number = 880;
  private camAngle: number = 0;
  private camCurrentZoom: number = 1.85;

  // Alternating Gift Camera Spotlight State
  private giftSpotlightUserId: string | null = null;
  private giftSpotlightAngle: SpotlightAngle = "REAR";
  private giftSpotlightTimer: number = 0;
  private nextGiftAngleToggle: SpotlightAngle = "FRONT"; // Alternates between FRONT and REAR
  private spotlightRacerName: string = "";
  private prevNitroStates: Map<string, boolean> = new Map();

  // Graphics Pipelines in Game World
  private bgGraphics!: Phaser.GameObjects.Graphics;
  private trackGraphics!: Phaser.GameObjects.Graphics;
  private kerbsGraphics!: Phaser.GameObjects.Graphics;
  private chevronsGraphics!: Phaser.GameObjects.Graphics;
  private centerLineGraphics!: Phaser.GameObjects.Graphics;
  private obstaclesGraphics!: Phaser.GameObjects.Graphics;
  private carGraphics!: Phaser.GameObjects.Graphics;

  // Graphics Pipelines in HUD
  private hudGraphics!: Phaser.GameObjects.Graphics;
  private minimapGraphics!: Phaser.GameObjects.Graphics;

  // UI Text Elements
  private lapHeader!: Phaser.GameObjects.Text;
  private lapValueText!: Phaser.GameObjects.Text;
  private timeHeader!: Phaser.GameObjects.Text;
  private timeValueText!: Phaser.GameObjects.Text;
  private rankBigText!: Phaser.GameObjects.Text;
  private speedValueText!: Phaser.GameObjects.Text;
  private speedUnitText!: Phaser.GameObjects.Text;
  private countdownText!: Phaser.GameObjects.Text;
  private winnerBanner!: Phaser.GameObjects.Container;
  private winnerText!: Phaser.GameObjects.Text;

  // Cinematic Gift Spotlight Banner
  private spotlightBanner!: Phaser.GameObjects.Container;
  private spotlightBannerText!: Phaser.GameObjects.Text;
  private spotlightAngleBadge!: Phaser.GameObjects.Text;

  // Leaderboard Row Containers
  private leaderboardContainer!: Phaser.GameObjects.Container;
  private leaderboardRows: {
    bg: Phaser.GameObjects.Rectangle;
    badgeBg: Phaser.GameObjects.Rectangle;
    badgeText: Phaser.GameObjects.Text;
    nameText: Phaser.GameObjects.Text;
    gapText: Phaser.GameObjects.Text;
  }[] = [];

  // Car Floating Labels: userId -> Text in world layer
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
    // 1. Initialize Display Layers
    this.worldLayer = this.add.layer().setDepth(10);
    this.hudLayer = this.add.layer().setDepth(100);

    // 2. Initialize World Graphics Pipelines
    this.bgGraphics = this.add.graphics();
    this.trackGraphics = this.add.graphics();
    this.kerbsGraphics = this.add.graphics();
    this.chevronsGraphics = this.add.graphics();
    this.centerLineGraphics = this.add.graphics();
    this.obstaclesGraphics = this.add.graphics();
    this.carGraphics = this.add.graphics();

    this.worldLayer.add([
      this.bgGraphics,
      this.trackGraphics,
      this.kerbsGraphics,
      this.chevronsGraphics,
      this.centerLineGraphics,
      this.obstaclesGraphics,
      this.carGraphics,
    ]);

    // 3. Initialize HUD Graphics Pipelines
    this.hudGraphics = this.add.graphics();
    this.minimapGraphics = this.add.graphics();
    this.hudLayer.add([this.hudGraphics, this.minimapGraphics]);

    // 4. Configure Two-Camera System:
    //    - Main Camera: Zooms in on vehicles, follows them with lookahead & banking rotation
    //    - HUD Camera: Pinned at (0,0), unzoomed 1.0x, crystal clear 1920x1080 arcade UI
    this.cameras.main.setZoom(this.camCurrentZoom);
    this.cameras.main.centerOn(this.camFocusX, this.camFocusY);
    this.cameras.main.ignore(this.hudLayer);

    this.hudCamera = this.cameras.add(0, 0, 1920, 1080);
    this.hudCamera.setScroll(0, 0);
    this.hudCamera.setZoom(1.0);
    this.hudCamera.ignore(this.worldLayer);

    // 5. Draw Cyberpunk City Environment Background (Expansive world canvas)
    this.drawCyberpunkBackground();

    // 6. Create Top-Left HUD (LAP & TIME)
    this.createTopLeftHUD();

    // 7. Create Left Leaderboard HUD Cards
    this.createLeaderboardHUD();

    // 8. Create Top-Right HUD (Rank & Speedometer Gauge)
    this.createTopRightHUD();

    // 9. Create Countdown Banner, Winner Celebration, and Gift Spotlight Banner
    this.createAnnouncementOverlays();

    // 10. Expose Camera Switching Controls to window for Streamer HUD & Keyboard
    (window as any).toggleCameraMode = () => this.toggleCameraMode();
    (window as any).setCameraMode = (m: CameraMode) => this.setCameraMode(m);
    (window as any).getCameraMode = () => this.cameraMode;
    (window as any).triggerGiftSpotlight = (userId: string, nickname: string, angle?: SpotlightAngle) => {
      this.triggerGiftSpotlight(userId, nickname, "NITRO", angle);
    };

    // 11. Socket.IO Connection to Authoritative Game Server
    const serverHost = window.location.hostname || "localhost";
    this.socket = io(`http://${serverHost}:3001`);

    this.socket.on("init_track", (track: TrackData) => {
      this.trackData = track;
      this.drawTrack();
    });

    this.socket.on("game_tick", (tick: GameTickState) => {
      this.handleGameTick(tick);
    });

    // Listen for Action Events (Gifts, Nitro, Boosts from TikTok / Dashboard)
    this.socket.on("action_event", (event: { action: string; userId: string; nickname: string; multiplier?: number }) => {
      if (
        event.action === "NITRO" ||
        event.action === "ACCELERATE" ||
        event.action === "SHIELD" ||
        event.action === "SPAWN_OBSTACLE"
      ) {
        this.triggerGiftSpotlight(event.userId, event.nickname, event.action);
      }
    });

    this.socket.on("connect", () => {
      console.log("🎮 [Phaser Client] Connected to Authoritative Server with Alternating Gift Camera!");
    });
  }

  public toggleCameraMode(): CameraMode {
    if (this.cameraMode === "CHASE") {
      this.cameraMode = "TRACK";
    } else if (this.cameraMode === "TRACK") {
      this.cameraMode = "OVERVIEW";
    } else {
      this.cameraMode = "CHASE";
    }
    return this.cameraMode;
  }

  public setCameraMode(mode: CameraMode) {
    this.cameraMode = mode;
  }

  /**
   * Triggers the Alternating Front/Rear Camera Spotlight on a gifting racer
   */
  public triggerGiftSpotlight(
    userId: string,
    nickname: string,
    giftType: string = "NITRO",
    forcedAngle?: SpotlightAngle
  ) {
    const uid = userId.toLowerCase();
    this.giftSpotlightUserId = uid;
    this.spotlightRacerName = nickname;

    // Alternate angle: FRONT -> REAR -> FRONT -> REAR...
    if (forcedAngle) {
      this.giftSpotlightAngle = forcedAngle;
    } else {
      this.giftSpotlightAngle = this.nextGiftAngleToggle;
      this.nextGiftAngleToggle = this.nextGiftAngleToggle === "FRONT" ? "REAR" : "FRONT";
    }

    this.giftSpotlightTimer = 4.5; // 4.5 seconds showcase

    // Update Spotlight Top Banner
    const isFront = this.giftSpotlightAngle === "FRONT";
    const spotBg = this.spotlightBanner.getByName("spotBg") as Phaser.GameObjects.Rectangle;
    if (spotBg) {
      spotBg.setStrokeStyle(2.5, isFront ? 0xfacc15 : 0x00f0ff, 1);
    }
    this.spotlightBannerText.setText(`🎬 GIFT SPOTLIGHT: ${nickname.toUpperCase()}`);
    this.spotlightAngleBadge.setText(isFront ? "🎥 KAMERA DEPAN" : "🏎️ KAMERA BELAKANG");
    this.spotlightAngleBadge.setBackgroundColor(isFront ? "#facc15" : "#00f0ff");
    this.spotlightAngleBadge.setColor(isFront ? "#000000" : "#050b1a");
    this.spotlightBanner.setVisible(true);
    this.spotlightBanner.setAlpha(1);

    // Trigger toast in HTML HUD if available
    if ((window as any).showActionToast) {
      const icon = isFront ? "🎥" : "🏎️";
      const angleLabel = isFront ? "KAMERA DEPAN" : "KAMERA BELAKANG";
      (window as any).showActionToast(
        icon,
        `GIFT! ${nickname} [${angleLabel}]`,
        isFront ? "#facc15" : "#00f0ff"
      );
    }
  }

  // =========================================================================
  // ENVIRONMENT & TRACK RENDERING
  // =========================================================================

  private drawCyberpunkBackground() {
    const g = this.bgGraphics;
    g.clear();

    const bgX = -2500;
    const bgY = -2000;
    const bgW = 7000;
    const bgH = 5500;

    // Deep space night sky with soft indigo-purple ambient haze
    g.fillStyle(0x060814, 1.0);
    g.fillRect(bgX, bgY, bgW, bgH);

    // Expansive Synthwave Perspective Grid Lines across entire track world
    g.lineStyle(1.5, 0x00f0ff, 0.08);
    for (let x = bgX; x <= bgX + bgW; x += 120) {
      g.lineBetween(x, bgY, x, bgY + bgH);
    }
    for (let y = bgY; y <= bgY + bgH; y += 100) {
      g.lineBetween(bgX, y, bgX + bgW, y);
    }

    // Secondary Magenta Grid accents
    g.lineStyle(2, 0xff007f, 0.05);
    for (let x = bgX; x <= bgX + bgW; x += 360) {
      g.lineBetween(x, bgY, x, bgY + bgH);
    }

    // Distant Neon City Skyline Silhouettes with Glowing Windows surrounding track
    const skylineGroups = [
      { startX: -200, count: 20, baseY: 160, maxH: 260, stepX: 130 },
      { startX: -100, count: 18, baseY: 1040, maxH: 240, stepX: 140 },
      { startX: -600, count: 6, baseY: 550, maxH: 320, stepX: 120 },
      { startX: 1840, count: 8, baseY: 600, maxH: 300, stepX: 130 },
    ];

    for (const group of skylineGroups) {
      for (let i = 0; i < group.count; i++) {
        const bx = group.startX + i * group.stepX;
        const bw = 80 + (i % 3) * 25;
        const bh = 140 + ((i * 37) % (group.maxH - 120));
        const by = group.baseY - bh;

        g.fillStyle(0x0b1022, 0.85);
        g.fillRect(bx, by, bw, bh);
        g.lineStyle(1.5, 0x1e293b, 0.9);
        g.strokeRect(bx, by, bw, bh);

        // Micro LED Windows
        for (let wy = by + 20; wy < by + bh - 20; wy += 28) {
          for (let wx = bx + 12; wx < bx + bw - 12; wx += 22) {
            if (((i * 7 + wx + wy) % 5) < 3) {
              const winColor = (i + wx) % 2 === 0 ? 0x00f0ff : 0xfacc15;
              g.fillStyle(winColor, 0.45);
              g.fillRect(wx, wy, 7, 12);
            }
          }
        }
      }
    }

    // Trackside Stadium Floodlight Towers with Soft Amber Beams
    const floodlights = [
      { x: 300, y: 760, angle: -0.6 },
      { x: 1320, y: 760, angle: -0.9 },
      { x: 1620, y: 440, angle: 2.8 },
      { x: 980, y: 160, angle: 1.2 },
      { x: 450, y: 220, angle: 1.1 },
    ];

    for (const fl of floodlights) {
      g.lineStyle(4, 0x334155, 1.0);
      g.lineBetween(fl.x, fl.y, fl.x, fl.y - 45);

      g.fillStyle(0xfacc15, 1.0);
      g.fillCircle(fl.x, fl.y - 45, 6);

      g.fillStyle(0xfef08a, 0.08);
      const tipX = fl.x;
      const tipY = fl.y - 45;
      const bDist = 260;
      const c1X = tipX + Math.cos(fl.angle - 0.35) * bDist;
      const c1Y = tipY + Math.sin(fl.angle - 0.35) * bDist;
      const c2X = tipX + Math.cos(fl.angle + 0.35) * bDist;
      const c2Y = tipY + Math.sin(fl.angle + 0.35) * bDist;
      g.fillTriangle(tipX, tipY, c1X, c1Y, c2X, c2Y);
    }

    // Trackside Neon Palm Trees with Cyan & Magenta glowing fronds
    const palmPositions = [
      { x: 260, y: 940 },
      { x: 540, y: 960 },
      { x: 880, y: 950 },
      { x: 1260, y: 960 },
      { x: 1680, y: 920 },
      { x: 1820, y: 720 },
      { x: 1840, y: 480 },
      { x: 1720, y: 240 },
      { x: 1420, y: 170 },
      { x: 1120, y: 170 },
      { x: 780, y: 160 },
      { x: 480, y: 180 },
      { x: 180, y: 220 },
      { x: 90, y: 440 },
      { x: 110, y: 680 },
      { x: 500, y: 720 },
      { x: 740, y: 730 },
      { x: 1040, y: 720 },
      { x: 1420, y: 640 },
      { x: 1340, y: 440 },
      { x: 760, y: 420 },
      { x: 420, y: 460 },
    ];

    for (const p of palmPositions) {
      this.drawNeonPalmTree(g, p.x, p.y);
    }
  }

  private drawNeonPalmTree(g: Phaser.GameObjects.Graphics, x: number, y: number) {
    g.lineStyle(4, 0x1e1b4b, 0.85);
    const trunkCurve = new Phaser.Curves.QuadraticBezier(
      new Phaser.Math.Vector2(x, y + 42),
      new Phaser.Math.Vector2(x + 6, y + 18),
      new Phaser.Math.Vector2(x, y)
    );
    g.strokePoints(trunkCurve.getPoints(8));

    const fronds = [
      { dx: -38, dy: -26, c: 0x00f0ff },
      { dx: 38, dy: -26, c: 0xff007f },
      { dx: -48, dy: 6, c: 0x00f0ff },
      { dx: 48, dy: 6, c: 0xff007f },
      { dx: 0, dy: -42, c: 0x38bdf8 },
    ];

    for (const f of fronds) {
      g.lineStyle(3, f.c, 0.8);
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
    const roadWidth = this.trackData.roadWidth || 140;

    // 1. OUTER BARRIER NEON GLOW (Cyan outer, Magenta inner)
    g.lineStyle(roadWidth + 48, 0x0f172a, 0.95);
    this.strokeClosedCurve(g, pts);

    g.lineStyle(roadWidth + 34, 0xff007f, 0.4);
    this.strokeClosedCurve(g, pts);
    g.lineStyle(roadWidth + 24, 0x00f0ff, 0.5);
    this.strokeClosedCurve(g, pts);

    // 2. TARMAC ASPHALT (Dark Carbon Texture)
    g.lineStyle(roadWidth + 12, 0x111625, 1.0);
    this.strokeClosedCurve(g, pts);

    g.lineStyle(roadWidth, 0x182032, 1.0);
    this.strokeClosedCurve(g, pts);

    g.lineStyle(roadWidth - 28, 0x1e293b, 0.65);
    this.strokeClosedCurve(g, pts);

    // 3. SEGMENTED RUMBLE KERBS
    this.drawRumbleKerbs(kg, pts, roadWidth);

    // 4. NEON TURNING CHEVRON ARROWS (>>>) on corner apexes
    this.drawCornerChevrons(cg, pts);

    // 5. CENTER DOTTED GLOW RACELINE
    this.drawCenterNeonDashes(lg, pts);

    // 6. START / FINISH LINE CHECKERBOARD & OVERHEAD LASER ARCH
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
        kg.lineStyle(7, kerbColor, 0.95);
        kg.beginPath();
        kg.moveTo(x1 + nx * halfW, y1 + ny * halfW);
        kg.lineTo(x2 + nx * halfW, y2 + ny * halfW);
        kg.strokePath();

        // Right Kerb
        kg.lineStyle(7, isRed ? 0xf8fafc : 0xef4444, 0.95);
        kg.beginPath();
        kg.moveTo(x1 - nx * halfW, y1 - ny * halfW);
        kg.lineTo(x2 - nx * halfW, y2 - ny * halfW);
        kg.strokePath();
      }
    }
  }

  private drawCornerChevrons(cg: Phaser.GameObjects.Graphics, pts: { x: number; y: number }[]) {
    const cornerIndices = [3, 4, 7, 8, 10, 11];

    for (const idx of cornerIndices) {
      if (idx >= pts.length) continue;
      const p = pts[idx];
      const pNext = pts[(idx + 1) % pts.length];
      const heading = Math.atan2(pNext.y - p.y, pNext.x - p.x);
      const nx = -Math.sin(heading);
      const ny = Math.cos(heading);

      const wallDist = 88;
      const cx = p.x + nx * wallDist;
      const cy = p.y + ny * wallDist;

      cg.fillStyle(0x0f172a, 0.92);
      cg.fillRoundedRect(cx - 36, cy - 14, 72, 28, 4);
      cg.lineStyle(1.5, 0xfacc15, 0.9);
      cg.strokeRoundedRect(cx - 36, cy - 14, 72, 28, 4);

      cg.lineStyle(3, 0xfacc15, 1.0);
      const chevronOffsets = [-16, 0, 16];
      for (const off of chevronOffsets) {
        const hx = cx + off * Math.cos(heading);
        const hy = cy + off * Math.sin(heading);
        const dx = Math.cos(heading) * 6;
        const dy = Math.sin(heading) * 6;
        const perpX = -Math.sin(heading) * 8;
        const perpY = Math.cos(heading) * 8;

        cg.beginPath();
        cg.moveTo(hx - dx + perpX, hy - dy + perpY);
        cg.lineTo(hx + dx, hy + dy);
        cg.lineTo(hx - dx - perpX, hy - dy - perpY);
        cg.strokePath();
      }
    }
  }

  private drawCenterNeonDashes(lg: Phaser.GameObjects.Graphics, pts: { x: number; y: number }[]) {
    const n = pts.length;
    lg.lineStyle(3.5, 0x00f0ff, 0.9);

    for (let i = 0; i < n; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % n];
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const segments = Math.floor(dist / 32);

      for (let s = 0; s < segments; s++) {
        if (s % 2 === 0) {
          const t1 = s / segments;
          const t2 = (s + 0.55) / segments;
          const x1 = p1.x + (p2.x - p1.x) * t1;
          const y1 = p1.y + (p2.y - p1.y) * t1;
          const x2 = p1.x + (p2.x - p1.x) * t2;
          const y2 = p1.y + (p2.y - p1.y) * t2;

          lg.beginPath();
          lg.moveTo(x1, y1);
          lg.lineTo(x2, y2);
          lg.strokePath();
        }
      }
    }
  }

  private drawStartFinishLine(g: Phaser.GameObjects.Graphics, pts: { x: number; y: number }[], roadWidth: number) {
    const p0 = pts[0];
    const p1 = pts[1];
    const angle = Math.atan2(p1.y - p0.y, p1.x - p0.x);
    const nx = -Math.sin(angle);
    const ny = Math.cos(angle);
    const halfW = roadWidth * 0.5;

    g.lineStyle(16, 0xffffff, 1.0);
    g.beginPath();
    g.moveTo(p0.x - nx * halfW, p0.y - ny * halfW);
    g.lineTo(p0.x + nx * halfW, p0.y + ny * halfW);
    g.strokePath();

    g.lineStyle(10, 0x090d16, 1.0);
    g.beginPath();
    g.moveTo(p0.x - nx * halfW, p0.y - ny * halfW);
    g.lineTo(p0.x + nx * halfW, p0.y + ny * halfW);
    g.strokePath();

    g.lineStyle(4, 0x00f0ff, 0.95);
    g.beginPath();
    g.moveTo(p0.x - nx * (halfW + 18), p0.y - ny * (halfW + 18));
    g.lineTo(p0.x + nx * (halfW + 18), p0.y + ny * (halfW + 18));
    g.strokePath();
  }

  // =========================================================================
  // HUD CREATION (EXACT MATCH TO REFERENCE IMAGE, ATTACHED TO HUD LAYER)
  // =========================================================================

  private createTopLeftHUD() {
    this.lapHeader = this.add.text(42, 28, "LAP", {
      fontFamily: "'Orbitron', 'Rajdhani', sans-serif",
      fontSize: "16px",
      fontStyle: "italic",
      color: "#94a3b8",
    });

    this.lapValueText = this.add.text(40, 48, "1/3", {
      fontFamily: "'Orbitron', 'Segoe UI Black', sans-serif",
      fontSize: "48px",
      fontStyle: "italic",
      color: "#ffffff",
      stroke: "#00f0ff",
      strokeThickness: 3,
    });

    this.timeHeader = this.add.text(42, 114, "TIME", {
      fontFamily: "'Orbitron', 'Rajdhani', sans-serif",
      fontSize: "14px",
      fontStyle: "italic",
      color: "#94a3b8",
    });

    this.timeValueText = this.add.text(40, 134, "00:00.00", {
      fontFamily: "'Orbitron', 'Courier New', monospace",
      fontSize: "28px",
      fontStyle: "bold",
      color: "#ffffff",
    });

    this.hudLayer.add([this.lapHeader, this.lapValueText, this.timeHeader, this.timeValueText]);
  }

  private createLeaderboardHUD() {
    this.leaderboardContainer = this.add.container(40, 190);

    for (let i = 0; i < 6; i++) {
      const y = i * 44;

      const bg = this.add.rectangle(0, y, 260, 38, 0x0a1024, 0.85);
      bg.setOrigin(0, 0);
      bg.setStrokeStyle(1.5, 0x1e293b, 0.9);

      const badgeBg = this.add.rectangle(6, y + 5, 26, 28, 0x1e293b, 1.0);
      badgeBg.setOrigin(0, 0);

      const badgeText = this.add.text(19, y + 19, `${i + 1}`, {
        fontFamily: "'Orbitron', sans-serif",
        fontSize: "15px",
        fontStyle: "bold",
        color: "#ffffff",
      }).setOrigin(0.5);

      const nameText = this.add.text(42, y + 19, "", {
        fontFamily: "'Rajdhani', 'Segoe UI', sans-serif",
        fontSize: "16px",
        fontStyle: "bold",
        color: "#ffffff",
      }).setOrigin(0, 0.5);

      const gapText = this.add.text(250, y + 19, "", {
        fontFamily: "'Orbitron', monospace",
        fontSize: "14px",
        fontStyle: "bold",
        color: "#94a3b8",
      }).setOrigin(1, 0.5);

      this.leaderboardContainer.add([bg, badgeBg, badgeText, nameText, gapText]);
      this.leaderboardRows.push({ bg, badgeBg, badgeText, nameText, gapText });
    }

    this.hudLayer.add(this.leaderboardContainer);
  }

  private createTopRightHUD() {
    this.rankBigText = this.add.text(1740, 48, "1ST", {
      fontFamily: "'Orbitron', 'Impact', sans-serif",
      fontSize: "64px",
      fontStyle: "italic",
      color: "#ffffff",
      stroke: "#1e293b",
      strokeThickness: 8,
    }).setOrigin(1, 0);

    this.speedValueText = this.add.text(1880, 52, "0", {
      fontFamily: "'Orbitron', sans-serif",
      fontSize: "50px",
      fontStyle: "bold",
      color: "#ffffff",
    }).setOrigin(1, 0);

    this.speedUnitText = this.add.text(1880, 32, "KM/H", {
      fontFamily: "'Orbitron', sans-serif",
      fontSize: "16px",
      fontStyle: "italic",
      color: "#38bdf8",
    }).setOrigin(1, 0);

    this.hudLayer.add([this.rankBigText, this.speedValueText, this.speedUnitText]);
  }

  private createAnnouncementOverlays() {
    // 1. Countdown Display
    this.countdownText = this.add.text(960, 480, "", {
      fontFamily: "'Orbitron', 'Impact', sans-serif",
      fontSize: "140px",
      fontStyle: "italic",
      color: "#facc15",
      stroke: "#070a14",
      strokeThickness: 18,
    }).setOrigin(0.5).setVisible(false);

    // 2. Winner Banner Modal
    this.winnerBanner = this.add.container(960, 500).setVisible(false);

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

    // 3. Cinematic Gift Spotlight Top Banner (Alternating Front / Rear)
    this.spotlightBanner = this.add.container(960, 72).setVisible(false);

    const spotBg = this.add.rectangle(0, 0, 560, 48, 0x070c1e, 0.92);
    spotBg.setName("spotBg");
    spotBg.setStrokeStyle(2.5, 0xfacc15, 1.0);

    this.spotlightBannerText = this.add.text(-40, 0, "🎬 GIFT SPOTLIGHT: PEMBALAP", {
      fontFamily: "'Orbitron', 'Rajdhani', sans-serif",
      fontSize: "17px",
      fontStyle: "bold",
      color: "#ffffff",
    }).setOrigin(0.5);

    this.spotlightAngleBadge = this.add.text(190, 0, "🎥 KAMERA DEPAN", {
      fontFamily: "'Orbitron', sans-serif",
      fontSize: "12px",
      fontStyle: "bold",
      color: "#000000",
      backgroundColor: "#facc15",
      padding: { x: 8, y: 4 },
    }).setOrigin(0.5);

    this.spotlightBanner.add([spotBg, this.spotlightBannerText, this.spotlightAngleBadge]);

    this.hudLayer.add([this.countdownText, this.winnerBanner, this.spotlightBanner]);
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

    // Update participants map & detect newly activated nitro/gifts as fallback
    for (const p of tick.participants) {
      this.participants.set(p.userId, p);

      const wasNitro = this.prevNitroStates.get(p.userId) || false;
      if (p.nitroActive && !wasNitro) {
        // Participant just received a gift or activated nitro!
        this.triggerGiftSpotlight(p.userId, p.nickname, "NITRO");
      }
      this.prevNitroStates.set(p.userId, p.nitroActive);
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

    // 1. Dynamic Camera Follow & Alternating Gift Spotlight
    this.updateCamera(delta);

    // 2. Render Dynamic World Objects & Vehicles
    this.renderObstacles();
    this.renderCars();

    // 3. Render Static Screen HUD & Minimap
    this.renderHUD(delta);
    this.renderMinimap();
  }

  // =========================================================================
  // DYNAMIC CAMERA CONTROLLER (ALTERNATING FRONT/REAR GIFT SPOTLIGHT)
  // =========================================================================

  private updateCamera(delta: number) {
    const cam = this.cameras.main;
    const dt = Math.min(delta * 0.001, 0.1);

    // Update gift spotlight timer
    if (this.giftSpotlightTimer > 0) {
      this.giftSpotlightTimer -= dt;
      if (this.giftSpotlightTimer <= 0) {
        this.giftSpotlightUserId = null;
        this.tweens.add({
          targets: this.spotlightBanner,
          alpha: 0,
          duration: 400,
          onComplete: () => {
            this.spotlightBanner.setVisible(false);
          },
        });
      }
    }

    // Identify target focus racer (Gift spotlight racer, or 1st place leader)
    let focusParticipant: Participant | null = null;
    let isGiftSpotlight = false;

    if (this.giftSpotlightUserId && this.participants.has(this.giftSpotlightUserId)) {
      focusParticipant = this.participants.get(this.giftSpotlightUserId)!;
      isGiftSpotlight = true;
    } else if (this.leaderboard.length > 0) {
      focusParticipant = this.participants.get(this.leaderboard[0].userId) || null;
    } else if (this.participants.size > 0) {
      focusParticipant = this.participants.values().next().value || null;
    }

    if (this.cameraMode === "OVERVIEW" && !isGiftSpotlight) {
      // Zoom out to see entire circuit overview
      this.camCurrentZoom += (1.0 - this.camCurrentZoom) * (dt * 3.5);
      this.camFocusX += (960 - this.camFocusX) * (dt * 3.5);
      this.camFocusY += (540 - this.camFocusY) * (dt * 3.5);
      this.camAngle += (0 - this.camAngle) * (dt * 4.0);

      cam.setZoom(this.camCurrentZoom);
      cam.centerOn(this.camFocusX, this.camFocusY);
      cam.setRotation(this.camAngle);
      return;
    }

    // Vehicle Focused Modes: "CHASE" or "TRACK" (or Active Gift Spotlight)
    if (focusParticipant) {
      const p = focusParticipant;
      const targetSpeed = p.speed || 240;

      if (isGiftSpotlight) {
        // ===================================================================
        // GIFT SPOTLIGHT: ALTERNATING FRONT / REAR CINEMATIC CAMERA
        // ===================================================================
        const isFront = this.giftSpotlightAngle === "FRONT";

        if (isFront) {
          // 🎥 KAMERA DEPAN (FRONT CINEMATIC HEAD-ON VIEW):
          // Kamera berada di depan mobil, menghadap ke belakang ke arah moncong mobil!
          // Mobil melaju ke arah bawah/penonton dengan strip balap ganda & lampu depan menyala.
          const lookaheadDist = -115;
          const lookX = p.x + Math.cos(p.angle) * lookaheadDist;
          const lookY = p.y + Math.sin(p.angle) * lookaheadDist;

          const posLerp = Math.min(1.0, dt * 8.5);
          this.camFocusX += (lookX - this.camFocusX) * posLerp;
          this.camFocusY += (lookY - this.camFocusY) * posLerp;

          // Rotasi 180° berlawanan dengan rear chase sehingga mobil mengarah ke kamera
          const desiredCamRot = -(p.angle + Math.PI / 2);
          let diff = desiredCamRot - this.camAngle;
          while (diff < -Math.PI) diff += Math.PI * 2;
          while (diff > Math.PI) diff -= Math.PI * 2;
          this.camAngle += diff * Math.min(1.0, dt * 6.0);

          // Close-up cinematic zoom
          this.camCurrentZoom += (2.1 - this.camCurrentZoom) * (dt * 4.0);
        } else {
          // 🏎️ KAMERA BELAKANG (REAR CHASE VIEW):
          // Kamera berada di belakang mobil menghadap ke depan.
          // Semburan api ganda nitro & knalpot terlihat melesat ke atas lintasan.
          const lookaheadDist = 145 + (targetSpeed > 300 ? 45 : 0);
          const lookX = p.x + Math.cos(p.angle) * lookaheadDist;
          const lookY = p.y + Math.sin(p.angle) * lookaheadDist;

          const posLerp = Math.min(1.0, dt * 8.0);
          this.camFocusX += (lookX - this.camFocusX) * posLerp;
          this.camFocusY += (lookY - this.camFocusY) * posLerp;

          const desiredCamRot = -(p.angle - Math.PI / 2);
          let diff = desiredCamRot - this.camAngle;
          while (diff < -Math.PI) diff += Math.PI * 2;
          while (diff > Math.PI) diff -= Math.PI * 2;
          this.camAngle += diff * Math.min(1.0, dt * 5.0);

          this.camCurrentZoom += (1.85 - this.camCurrentZoom) * (dt * 4.0);
        }

        cam.setZoom(this.camCurrentZoom);
        cam.centerOn(this.camFocusX, this.camFocusY);
        cam.setRotation(this.camAngle);
        return;
      }

      // Standard Leader Follow (When no active gift spotlight)
      const targetZoom = p.nitroActive ? 1.70 : this.cameraMode === "CHASE" ? 1.85 : 1.78;
      this.camCurrentZoom += (targetZoom - this.camCurrentZoom) * (dt * 3.0);

      if (this.cameraMode === "CHASE") {
        const lookaheadDist = 135 + (targetSpeed > 300 ? 55 : 0);
        const lookX = p.x + Math.cos(p.angle) * lookaheadDist;
        const lookY = p.y + Math.sin(p.angle) * lookaheadDist;

        const posLerp = Math.min(1.0, dt * 7.0);
        this.camFocusX += (lookX - this.camFocusX) * posLerp;
        this.camFocusY += (lookY - this.camFocusY) * posLerp;

        const desiredCamRot = -(p.angle - Math.PI / 2);
        let diff = desiredCamRot - this.camAngle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        this.camAngle += diff * Math.min(1.0, dt * 4.5);

        cam.setZoom(this.camCurrentZoom);
        cam.centerOn(this.camFocusX, this.camFocusY);
        cam.setRotation(this.camAngle);
      } else {
        const lookaheadDist = 80;
        const lookX = p.x + Math.cos(p.angle) * lookaheadDist;
        const lookY = p.y + Math.sin(p.angle) * lookaheadDist;

        const posLerp = Math.min(1.0, dt * 6.5);
        this.camFocusX += (lookX - this.camFocusX) * posLerp;
        this.camFocusY += (lookY - this.camFocusY) * posLerp;

        this.camAngle += (0 - this.camAngle) * (dt * 5.0);

        cam.setZoom(this.camCurrentZoom);
        cam.centerOn(this.camFocusX, this.camFocusY);
        cam.setRotation(this.camAngle);
      }
    } else {
      // Idle / waiting before race: smooth slow drone drift near starting grid (380, 880)
      const idleTargetX = 420 + Math.sin(this.animTimer * 0.4) * 60;
      const idleTargetY = 880 + Math.cos(this.animTimer * 0.4) * 30;
      this.camFocusX += (idleTargetX - this.camFocusX) * (dt * 2.5);
      this.camFocusY += (idleTargetY - this.camFocusY) * (dt * 2.5);
      this.camAngle += (0 - this.camAngle) * (dt * 3.0);
      this.camCurrentZoom += (1.75 - this.camCurrentZoom) * (dt * 2.5);

      cam.setZoom(this.camCurrentZoom);
      cam.centerOn(this.camFocusX, this.camFocusY);
      cam.setRotation(this.camAngle);
    }
  }

  // =========================================================================
  // CAR GRAPHICS RENDERING (WITH RACING STRIPES, UNDERGLOW, HEADLIGHTS, NITRO, VIP AURA)
  // =========================================================================

  private renderCars() {
    const g = this.carGraphics;
    g.clear();

    const activeUserIds = new Set<string>();

    for (const p of this.participants.values()) {
      activeUserIds.add(p.userId);
      const isSpotlightCar = p.userId.toLowerCase() === this.giftSpotlightUserId;
      const hexColor = parseInt(p.color.replace("#", "0x"), 16) || 0x3b82f6;

      const cos = Math.cos(p.angle);
      const sin = Math.sin(p.angle);

      // Local to World coordinate transform helper (Scaled 1.35x for prominent supercars)
      const tf = (rx: number, ry: number) => {
        return {
          x: p.x + (rx * cos - ry * sin),
          y: p.y + (rx * sin + ry * cos),
        };
      };

      // 0. SPECIAL GIFT SPOTLIGHT AURA (Pulsing energy rings for givers)
      if (isSpotlightCar) {
        const isFront = this.giftSpotlightAngle === "FRONT";
        const ringColor = isFront ? 0xfacc15 : 0x00f0ff;
        const ringRadius = 56 + Math.sin(this.animTimer * 10) * 8;

        g.lineStyle(3.5, ringColor, 0.95);
        g.strokeCircle(p.x, p.y, ringRadius);
        g.lineStyle(1.8, 0xffffff, 0.85);
        g.strokeCircle(p.x, p.y, ringRadius + 6);

        // 4 Glowing Diamond Starbursts along ring
        for (let a = 0; a < 4; a++) {
          const ang = this.animTimer * 3 + a * (Math.PI / 2);
          const sx = p.x + Math.cos(ang) * ringRadius;
          const sy = p.y + Math.sin(ang) * ringRadius;
          g.fillStyle(0xffffff, 1.0);
          g.fillCircle(sx, sy, 3.5);
        }
      }

      // 1. NEON UNDERGLOW (Soft radial pool beneath car on asphalt)
      const underglowRadius = isSpotlightCar ? 90 : 74;
      g.fillStyle(isSpotlightCar ? 0xfacc15 : hexColor, isSpotlightCar ? 0.65 : 0.5);
      g.fillEllipse(p.x, p.y, underglowRadius, 44);

      // 2. HEADLIGHT PROJECTION BEAMS (Illuminating track forward)
      g.fillStyle(0xfef08a, 0.22);
      const hlBaseL = tf(28, -10);
      const hlBaseR = tf(28, 10);
      const hlTipL = tf(130, -38);
      const hlTipR = tf(130, 38);
      g.fillTriangle(hlBaseL.x, hlBaseL.y, hlTipL.x, hlTipL.y, hlTipR.x, hlTipR.y);

      // 3. CAR SHADOW & 4 WIDE ALLOY WHEELS
      g.fillStyle(0x000000, 0.7);
      g.fillEllipse(p.x + 2, p.y + 4, 60, 32);

      // Wheels
      g.fillStyle(0x090d16, 1.0);
      const wFL = tf(18, -18);
      const wFR = tf(18, 18);
      const wRL = tf(-18, -18);
      const wRR = tf(-18, 18);
      g.fillRoundedRect(wFL.x - 7, wFL.y - 5, 14, 10, 3);
      g.fillRoundedRect(wFR.x - 7, wFR.y - 5, 14, 10, 3);
      g.fillRoundedRect(wRL.x - 7, wRL.y - 5, 14, 10, 3);
      g.fillRoundedRect(wRR.x - 7, wRR.y - 5, 14, 10, 3);

      // 4. AERODYNAMIC SUPERCAR BODY
      g.fillStyle(hexColor, 1.0);
      const pNose = tf(34, 0);
      const pFwdL = tf(24, -15);
      const pMidL = tf(2, -18);
      const pRearL = tf(-28, -17);
      const pTail = tf(-28, 0);
      const pRearR = tf(-28, 17);
      const pMidR = tf(2, 18);
      const pFwdR = tf(24, 15);

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

      // Sleek High-Gloss Chassis Outline
      g.lineStyle(2.2, isSpotlightCar ? 0xfacc15 : 0xffffff, 0.95);
      g.strokePath();

      // Front Aerodynamic Splitter
      g.lineStyle(2, 0x090d16, 1.0);
      const spL = tf(32, -14);
      const spR = tf(32, 14);
      g.lineBetween(spL.x, spL.y, spR.x, spR.y);

      // 5. DUAL WHITE RACING STRIPES (Exact match to reference image)
      g.lineStyle(3.2, 0xffffff, 1.0);
      const s1Front = tf(32, -4);
      const s1Rear = tf(-26, -4);
      const s2Front = tf(32, 4);
      const s2Rear = tf(-26, 4);
      g.lineBetween(s1Front.x, s1Front.y, s1Rear.x, s1Rear.y);
      g.lineBetween(s2Front.x, s2Front.y, s2Rear.x, s2Rear.y);

      // 6. COCKPIT TINTED GLASS WITH CYAN SPECULAR REFLECTION
      g.fillStyle(0x0a1024, 0.92);
      const glassCenter = tf(5, 0);
      g.fillEllipse(glassCenter.x, glassCenter.y, 24, 16);
      g.lineStyle(1.5, 0x38bdf8, 0.7);
      g.strokeEllipse(glassCenter.x, glassCenter.y, 24, 16);

      // 7. BRIGHT RED REAR LED TAILLIGHTS & CARBON SPOILER
      g.fillStyle(0x090d16, 1.0);
      const sp1 = tf(-29, -18);
      const sp2 = tf(-29, 18);
      g.fillRoundedRect(sp1.x - 2, sp1.y - 2, 6, 36, 2);

      g.fillStyle(0xef4444, 1.0);
      const tlL = tf(-28, -13);
      const tlR = tf(-28, 13);
      g.fillCircle(tlL.x, tlL.y, 3.5);
      g.fillCircle(tlR.x, tlR.y, 3.5);

      // 8. TWIN NITRO JET FLAMES (When nitroActive)
      if (p.nitroActive) {
        // Dual intense cyan plasma jets
        g.fillStyle(0x00f0ff, 0.98);
        const jetCoreL = tf(-44, -9);
        const jetCoreR = tf(-44, 9);
        g.fillTriangle(tlL.x, tlL.y, tlL.x, tlL.y - 4, jetCoreL.x, jetCoreL.y);
        g.fillTriangle(tlR.x, tlR.y, tlR.x, tlR.y + 4, jetCoreR.x, jetCoreR.y);

        // Dual fire orange outer tips
        g.fillStyle(0xf97316, 0.9);
        const jetTipL = tf(-58, -9);
        const jetTipR = tf(-58, 9);
        g.fillTriangle(jetCoreL.x, jetCoreL.y - 3, jetCoreL.x, jetCoreL.y + 3, jetTipL.x, jetTipL.y);
        g.fillTriangle(jetCoreR.x, jetCoreR.y - 3, jetCoreR.x, jetCoreR.y + 3, jetTipR.x, jetTipR.y);
      }

      // 9. SHIELD BUBBLE
      if (p.shieldActive) {
        g.lineStyle(3, 0x00f0ff, 0.9);
        g.fillStyle(0x0284c7, 0.28);
        g.fillCircle(p.x, p.y, 48);
        g.strokeCircle(p.x, p.y, 48);
      }

      // 10. FLOATING NICKNAME BADGE (Always kept horizontal & crisp)
      let label = this.carLabels.get(p.userId);
      if (!label) {
        label = this.add.text(p.x, p.y - 46, "", {
          fontFamily: "'Rajdhani', 'Segoe UI', sans-serif",
          fontSize: "12px",
          fontStyle: "bold",
          color: "#ffffff",
          backgroundColor: "#070b18fa",
          padding: { x: 7, y: 3 },
        }).setOrigin(0.5);
        this.worldLayer.add(label);
        this.carLabels.set(p.userId, label);
      }
      label.setPosition(p.x, p.y - 46);
      label.setRotation(-this.camAngle); // Keeps label horizontal on screen

      if (isSpotlightCar) {
        label.setText(`👑 ${p.nickname.toUpperCase()} (GIFT)`);
        label.setBackgroundColor("#eab308");
        label.setColor("#000000");
      } else {
        label.setText(`🏎️ ${p.nickname}`);
        label.setBackgroundColor("#070b18fa");
        label.setColor("#ffffff");
      }
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

  private renderObstacles() {
    const g = this.obstaclesGraphics;
    g.clear();

    for (const obs of this.obstacles) {
      g.fillStyle(0x070b19, 0.88);
      g.fillEllipse(obs.x, obs.y, 52, 34);
      g.fillStyle(0x00f0ff, 0.55);
      g.fillEllipse(obs.x + 3, obs.y - 2, 26, 14);
      g.lineStyle(2, 0xf59e0b, 0.85);
      g.strokeEllipse(obs.x, obs.y, 54, 36);
    }
  }

  // =========================================================================
  // HUD RENDERING (MATCHING EXACT REFERENCE IMAGE ON DEDICATED HUD CAMERA)
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

          const progressDiff = topList[0].lap - item.lap + (topList[0].progress - item.progress);
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
      const participantObj = this.participants.get(leadRacer.userId);
      const isNitro = participantObj ? participantObj.nitroActive : false;
      const baseSpd = participantObj ? participantObj.speed : 240;
      const kmh = Math.round(baseSpd * 0.58 + (isNitro ? 120 : 60));

      this.speedValueText.setText(`${kmh}`);
      this.rankBigText.setText("1ST");

      const gaugeX = 1680;
      const gaugeY = 120;
      const gaugeW = 200;
      const gaugeH = 12;

      g.fillStyle(0x0a1024, 0.85);
      g.fillRoundedRect(gaugeX, gaugeY, gaugeW, gaugeH, 4);
      g.lineStyle(1.5, 0x1e293b, 0.8);
      g.strokeRoundedRect(gaugeX, gaugeY, gaugeW, gaugeH, 4);

      g.fillStyle(0x00f0ff, 0.95);
      g.fillRoundedRect(gaugeX, gaugeY, gaugeW * 0.65, gaugeH, 4);

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

    g.fillStyle(0x070c1d, 0.88);
    g.fillRoundedRect(mapX, mapY, mapW, mapH, 14);
    g.lineStyle(1.5, 0x00f0ff, 0.35);
    g.strokeRoundedRect(mapX, mapY, mapW, mapH, 14);

    const pts = this.trackData.waypoints;
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
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

    g.fillStyle(0xffffff, 1.0);
    g.fillCircle(startM.x, startM.y, 4.5);
    g.lineStyle(1.5, 0x000000, 1.0);
    g.strokeCircle(startM.x, startM.y, 4.5);

    let isLeader = true;
    for (const item of this.leaderboard) {
      const p = this.participants.get(item.userId);
      if (!p) continue;
      const mp = toMap(p.x, p.y);
      const hexColor = parseInt(item.color.replace("#", "0x"), 16) || 0x38bdf8;

      if (isLeader) {
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
