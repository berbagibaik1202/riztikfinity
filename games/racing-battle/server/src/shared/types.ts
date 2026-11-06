/**
 * RizLive Racing Battle — Shared Types
 * Used across Authoritative Server, Phaser Client, and Creator Dashboard
 */

export type UniversalActionType =
  | "JOIN_RACE"
  | "LEAVE_RACE"
  | "ACCELERATE"
  | "NITRO"
  | "TURN_LEFT"
  | "TURN_RIGHT"
  | "SHIELD"
  | "REPAIR"
  | "SLOW_DOWN"
  | "SPAWN_OBSTACLE"
  | "START_RACE"
  | "PAUSE_RACE"
  | "FINISH_RACE"
  | "RESET_RACE";

export type GameState =
  | "IDLE"
  | "WAITING"
  | "COUNTDOWN"
  | "RACING"
  | "PAUSED"
  | "FINISHED"
  | "RESULTS"
  | "ERROR";

export type VehicleType =
  | "supercar"
  | "formula"
  | "kart"
  | "muscle"
  | "motorcycle"
  | "cyber";

export interface Participant {
  id: string; // Internal racer ID (lower unique_id)
  userId: string;
  nickname: string;
  avatar: string;
  vehicleType: VehicleType;
  color: string;
  x: number;
  y: number;
  angle: number;
  speed: number;
  baseMaxSpeed: number;
  laneOffset: number; // -1.0 to 1.0 (lateral position on track)
  currentWaypoint: number;
  lap: number;
  progress: number; // 0.0 to 1.0 on current lap
  totalDistance: number;
  nitroActive: boolean;
  nitroTimer: number;
  shieldActive: boolean;
  shieldTimer: number;
  spinTimer: number;
  finished: boolean;
  finishTime: number | null;
  finishRank: number | null;
}

export interface Obstacle {
  id: string;
  x: number;
  y: number;
  waypointIndex: number;
  laneOffset: number;
  type: "oil" | "rock" | "rocket";
  placedBy: string;
  duration: number;
}

export interface Waypoint {
  x: number;
  y: number;
  radius?: number;
}

export interface TrackData {
  id: string;
  name: string;
  waypoints: Waypoint[];
  roadWidth: number;
  length: number;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  nickname: string;
  avatar: string;
  vehicleType: VehicleType;
  color: string;
  lap: number;
  progress: number;
  finished: boolean;
  finishTime: number | null;
}

export interface GameTickState {
  tick: number;
  timestamp: number;
  state: GameState;
  totalLaps: number;
  countdown: number | null;
  participants: Participant[];
  obstacles: Obstacle[];
  leaderboard: LeaderboardEntry[];
  winner: LeaderboardEntry | null;
}

export interface UniversalActionPayload {
  id: number;
  protocol: string;
  action: UniversalActionType;
  user_id: string;
  nickname: string;
  avatar?: string;
  multiplier?: number;
  timestamp: number;
  meta?: Record<string, any>;
}

export interface RaceSessionRecord {
  id: number;
  sessionId: string;
  startTime: string;
  endTime: string | null;
  totalLaps: number;
  winnerUserId: string | null;
  winnerNickname: string | null;
  totalParticipants: number;
  summaryJson: string;
}
