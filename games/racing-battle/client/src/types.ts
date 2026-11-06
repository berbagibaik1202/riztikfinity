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

export type VehicleType = "supercar" | "formula" | "kart" | "muscle" | "motorcycle" | "cyber";

export interface Participant {
  id: string;
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
  laneOffset: number;
  currentWaypoint: number;
  lap: number;
  progress: number;
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
  type: "oil" | "rock" | "rocket";
  placedBy: string;
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
  state: string;
  totalLaps: number;
  countdown: number | null;
  participants: Participant[];
  obstacles: Obstacle[];
  leaderboard: LeaderboardEntry[];
  winner: LeaderboardEntry | null;
}
