"""
Roblox Live Race Manager
Bridge for TikTok Live interactive racing in Roblox.
Handles racer enrollments, gift power-ups (speed boost, turbo donut, rocket topi),
and bidirectional synchronization with Roblox Studio via HttpService.
"""

from datetime import datetime
import threading
import time
from typing import Any, Dict, List, Optional


class RobloxRaceManager:
    def __init__(self):
        self._lock = threading.Lock()
        self.enabled: bool = True
        self.race_state: str = "waiting"  # "waiting", "racing", "finished"
        self.vehicle_preference: str = "mixed"  # "car", "motorcycle", "mixed"
        self.total_laps: int = 3

        # Active participants: user_id -> racer dict
        self.racers: Dict[str, dict] = {}

        # FIFO queue for Roblox Studio polling
        self.action_queue: List[dict] = []
        self._action_counter: int = 0
        self.max_queue_history: int = 200

        # Race outcome
        self.winner: Optional[dict] = None
        self.last_sync_time: float = 0.0

        # Callbacks for web dashboard & OBS broadcasts
        self._listeners = []

    def add_listener(self, callback):
        self._listeners.append(callback)

    def _notify(self, event_type: str, data: dict):
        for cb in self._listeners:
            try:
                cb(event_type, data)
            except Exception:
                pass

    def _enqueue_action(self, action_type: str, payload: dict) -> dict:
        self._action_counter += 1
        item = {
            "id": self._action_counter,
            "action": action_type,
            "timestamp": time.time(),
            "data": payload,
        }
        self.action_queue.append(item)
        if len(self.action_queue) > self.max_queue_history:
            self.action_queue.pop(0)

        self._notify("roblox_action", item)
        return item

    def join_racer(self, user_id: str, nickname: str, avatar: str = "", vehicle: Optional[str] = None) -> dict:
        """Enroll a TikTok viewer as a racer in the arena."""
        with self._lock:
            if not self.enabled:
                return {"status": "disabled"}

            clean_id = str(user_id or nickname).strip().lower()
            if not clean_id:
                clean_id = f"guest_{int(time.time() * 1000)}"

            # If user already registered, return existing
            if clean_id in self.racers:
                return {"status": "already_joined", "racer": self.racers[clean_id]}

            # Determine vehicle type
            v_type = vehicle
            if not v_type or v_type not in ["car", "motorcycle"]:
                if self.vehicle_preference == "mixed":
                    # Alternate between car and motorcycle
                    v_type = "car" if len(self.racers) % 2 == 0 else "motorcycle"
                else:
                    v_type = self.vehicle_preference

            racer = {
                "user_id": clean_id,
                "nickname": nickname or clean_id,
                "avatar": avatar or "",
                "vehicle": v_type,
                "score": 0,
                "lap": 1,
                "speed_multiplier": 1.0,
                "turbo_active": False,
                "joined_at": datetime.now().strftime("%H:%M:%S"),
            }
            self.racers[clean_id] = racer

            # Notify Roblox Studio to spawn vehicle & driver
            self._enqueue_action("spawn_racer", racer)
            self._notify("racer_joined", racer)
            return {"status": "ok", "racer": racer}

    def boost_racer(self, user_id: str, nickname: str, multiplier: int = 1, turbo: bool = False) -> dict:
        """Apply speed acceleration or turbo to a racer."""
        with self._lock:
            clean_id = str(user_id or nickname).strip().lower()

            # If not yet joined, auto-join on first gift!
            if clean_id not in self.racers:
                self.join_racer(user_id=clean_id, nickname=nickname)

            payload = {
                "user_id": clean_id,
                "nickname": nickname,
                "multiplier": max(1, multiplier),
                "turbo": turbo,
                "timestamp": time.time(),
            }

            if clean_id in self.racers:
                if turbo:
                    self.racers[clean_id]["turbo_active"] = True
                self.racers[clean_id]["speed_multiplier"] = min(8.0, 1.0 + (multiplier * 0.4))

            self._enqueue_action("boost", payload)
            self._notify("racer_boosted", payload)
            return {"status": "ok", "payload": payload}

    def fire_rocket(self, user_id: str, nickname: str) -> dict:
        """Trigger rocket projectile from racer's vehicle to blast opponents."""
        with self._lock:
            clean_id = str(user_id or nickname).strip().lower()

            # Auto join if not joined
            if clean_id not in self.racers:
                self.join_racer(user_id=clean_id, nickname=nickname)

            payload = {
                "user_id": clean_id,
                "nickname": nickname,
                "timestamp": time.time(),
            }
            self._enqueue_action("fire_rocket", payload)
            self._notify("rocket_fired", payload)
            return {"status": "ok", "payload": payload}

    def start_race(self) -> dict:
        """Start the race countdown and movement."""
        with self._lock:
            self.race_state = "racing"
            self.winner = None
            payload = {
                "state": "racing",
                "total_laps": self.total_laps,
                "timestamp": time.time(),
            }
            self._enqueue_action("start_race", payload)
            self._notify("race_started", payload)
            return {"status": "ok", "race_state": self.race_state}

    def reset_race(self, clear_racers: bool = False) -> dict:
        """Reset the arena and vehicles to starting grid."""
        with self._lock:
            self.race_state = "waiting"
            self.winner = None
            if clear_racers:
                self.racers.clear()
            else:
                for r in self.racers.values():
                    r["lap"] = 1
                    r["speed_multiplier"] = 1.0
                    r["turbo_active"] = False

            payload = {
                "state": "waiting",
                "clear_racers": clear_racers,
                "timestamp": time.time(),
            }
            self._enqueue_action("reset_race", payload)
            self._notify("race_reset", payload)
            return {"status": "ok", "race_state": self.race_state, "racer_count": len(self.racers)}

    def poll_actions(self, since_id: int = 0) -> List[dict]:
        """Roblox Studio HttpService polls this to retrieve queued commands."""
        with self._lock:
            self.last_sync_time = time.time()
            if since_id <= 0:
                # Return all unexpired items up to last 25
                return self.action_queue[-25:]
            return [a for a in self.action_queue if a["id"] > since_id]

    def update_state_from_roblox(self, data: dict) -> dict:
        """Receive race telemetry (standings, lap counter, winner) from Roblox Studio."""
        with self._lock:
            self.last_sync_time = time.time()
            if "race_state" in data:
                self.race_state = data["race_state"]

            if "winner" in data and data["winner"]:
                self.winner = data["winner"]
                self.race_state = "finished"

            standings = data.get("standings", [])
            for item in standings:
                uid = str(item.get("user_id", "")).strip().lower()
                if uid in self.racers:
                    self.racers[uid]["lap"] = item.get("lap", self.racers[uid]["lap"])
                    self.racers[uid]["position"] = item.get("position", 0)

            self._notify("roblox_sync", self.get_summary())
            return {"status": "ok"}

    def get_summary(self) -> dict:
        """Get summary snapshot of the race."""
        with self._lock:
            # Check if Roblox Studio is actively connected (polled in last 5 seconds)
            roblox_connected = (time.time() - self.last_sync_time) < 5.0 if self.last_sync_time > 0 else False

            return {
                "enabled": self.enabled,
                "race_state": self.race_state,
                "vehicle_preference": self.vehicle_preference,
                "total_laps": self.total_laps,
                "racers": list(self.racers.values()),
                "racer_count": len(self.racers),
                "winner": self.winner,
                "roblox_connected": roblox_connected,
                "last_action_id": self._action_counter,
            }


# Global singleton instance
roblox_race_mgr = RobloxRaceManager()

