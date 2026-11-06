import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";

export class GameDatabase {
  private db: DatabaseSync;

  constructor(dbPath?: string) {
    const dataDir = path.resolve(__dirname, "../../data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const finalPath = dbPath || path.join(dataDir, "racing_battle.sqlite");
    this.db = new DatabaseSync(finalPath);
    this.initTables();
  }

  private initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS race_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT UNIQUE,
        start_time TEXT,
        end_time TEXT,
        total_laps INTEGER,
        winner_user_id TEXT,
        winner_nickname TEXT,
        winner_vehicle TEXT,
        total_participants INTEGER,
        summary_json TEXT
      );

      CREATE TABLE IF NOT EXISTS participant_stats (
        user_id TEXT PRIMARY KEY,
        nickname TEXT,
        avatar TEXT,
        total_races INTEGER DEFAULT 0,
        total_wins INTEGER DEFAULT 0,
        best_lap_time REAL,
        last_played TEXT
      );

      CREATE TABLE IF NOT EXISTS event_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        user_id TEXT,
        action TEXT,
        details TEXT,
        timestamp TEXT
      );
    `);
  }

  public recordSession(session: {
    sessionId: string;
    startTime: string;
    endTime: string;
    totalLaps: number;
    winnerUserId: string | null;
    winnerNickname: string | null;
    winnerVehicle: string | null;
    totalParticipants: number;
    summaryJson: string;
  }) {
    const stmt = this.db.prepare(`
      INSERT INTO race_sessions (
        session_id, start_time, end_time, total_laps,
        winner_user_id, winner_nickname, winner_vehicle,
        total_participants, summary_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      session.sessionId,
      session.startTime,
      session.endTime,
      session.totalLaps,
      session.winnerUserId,
      session.winnerNickname,
      session.winnerVehicle,
      session.totalParticipants,
      session.summaryJson
    );
  }

  public updateParticipantStats(
    userId: string,
    nickname: string,
    avatar: string,
    isWinner: boolean
  ) {
    const checkStmt = this.db.prepare(
      `SELECT user_id, total_races, total_wins FROM participant_stats WHERE user_id = ?`
    );
    const existing: any = checkStmt.get(userId);

    const now = new Date().toISOString();
    if (existing) {
      const stmt = this.db.prepare(`
        UPDATE participant_stats
        SET nickname = ?, avatar = ?, total_races = total_races + 1,
            total_wins = total_wins + ?, last_played = ?
        WHERE user_id = ?
      `);
      stmt.run(nickname, avatar, isWinner ? 1 : 0, now, userId);
    } else {
      const stmt = this.db.prepare(`
        INSERT INTO participant_stats (
          user_id, nickname, avatar, total_races, total_wins, last_played
        ) VALUES (?, ?, ?, 1, ?, ?)
      `);
      stmt.run(userId, nickname, avatar, isWinner ? 1 : 0, now);
    }
  }

  public getRecentSessions(limit: number = 10): any[] {
    const stmt = this.db.prepare(
      `SELECT * FROM race_sessions ORDER BY id DESC LIMIT ?`
    );
    return stmt.all(limit);
  }

  public getTopRacers(limit: number = 10): any[] {
    const stmt = this.db.prepare(
      `SELECT * FROM participant_stats ORDER BY total_wins DESC, total_races DESC LIMIT ?`
    );
    return stmt.all(limit);
  }
}
