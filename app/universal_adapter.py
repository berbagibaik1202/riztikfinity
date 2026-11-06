"""
Universal Game Adapter Protocol (TikInfinity - RizLive Game Engine)
Provides normalized universal game actions, capabilities discovery,
WebSocket/REST distribution, and state synchronization for external games
(e.g., RizLive Racing Battle, Quiz Battle, Unity, Unreal, Phaser HTML5).
"""

import asyncio
from datetime import datetime
import json
import logging
import threading
import time
from typing import Any, Dict, List, Optional, Set
from fastapi import WebSocket

logger = logging.getLogger("universal_adapter")

PROTOCOL_VERSION = "1.0.0"

SUPPORTED_ACTIONS = [
    "JOIN_RACE",
    "LEAVE_RACE",
    "ACCELERATE",
    "NITRO",
    "TURN_LEFT",
    "TURN_RIGHT",
    "SHIELD",
    "REPAIR",
    "SLOW_DOWN",
    "SPAWN_OBSTACLE",
    "START_RACE",
    "PAUSE_RACE",
    "FINISH_RACE",
    "RESET_RACE",
]

SUPPORTED_STATES = [
    "IDLE",
    "WAITING",
    "COUNTDOWN",
    "RACING",
    "PAUSED",
    "FINISHED",
    "RESULTS",
    "ERROR",
]


class UniversalGameAdapter:
    def __init__(self):
        self._lock = threading.Lock()
        self.enabled: bool = True
        self.protocol_version: str = PROTOCOL_VERSION

        # Active connected game clients (WebSockets)
        self.connected_clients: Set[WebSocket] = set()

        # Action Queue (FIFO with bounded history)
        self.action_queue: List[Dict[str, Any]] = []
        self._action_id_seq: int = 0
        self.max_queue_size: int = 300

        # Event deduplication cache (key -> timestamp)
        self._dedup_cache: Dict[str, float] = {}
        self.dedup_window_seconds: float = 0.4

        # Realtime Game State synchronized from authoritative game server
        self.game_state: Dict[str, Any] = {
            "game_name": "RizLive Racing Battle",
            "state": "IDLE",
            "track": "circuit_standard",
            "total_laps": 3,
            "current_lap": 1,
            "active_participants": 0,
            "leaderboard": [],
            "last_winner": None,
            "last_updated": time.time(),
        }

        # Configurable Action Mappings
        self.gift_mappings: Dict[str, Dict[str, Any]] = {
            "rose": {"action": "ACCELERATE", "multiplier": 1, "description": "Dorongan kecepatan standar"},
            "mawar": {"action": "ACCELERATE", "multiplier": 1, "description": "Dorongan kecepatan standar"},
            "doughnut": {"action": "NITRO", "multiplier": 8, "description": "Nitro turbo roket kecepatan tinggi"},
            "donut": {"action": "NITRO", "multiplier": 8, "description": "Nitro turbo roket kecepatan tinggi"},
            "donat": {"action": "NITRO", "multiplier": 8, "description": "Nitro turbo roket kecepatan tinggi"},
            "cap": {"action": "SPAWN_OBSTACLE", "description": "Munculkan rintangan ranjau/oli di depan lawan"},
            "topi": {"action": "SPAWN_OBSTACLE", "description": "Munculkan rintangan ranjau/oli di depan lawan"},
            "hat": {"action": "SPAWN_OBSTACLE", "description": "Munculkan rintangan ranjau/oli di depan lawan"},
            "heart": {"action": "SHIELD", "duration": 5.0, "description": "Perisai pelindung dari rintangan"},
            "hati": {"action": "SHIELD", "duration": 5.0, "description": "Perisai pelindung dari rintangan"},
            "whale": {"action": "NITRO", "multiplier": 12, "description": "Super Hypercar Boost"},
            "paus": {"action": "NITRO", "multiplier": 12, "description": "Super Hypercar Boost"},
            "lion": {"action": "NITRO", "multiplier": 15, "description": "Mega Nitro Boost"},
            "singa": {"action": "NITRO", "multiplier": 15, "description": "Mega Nitro Boost"},
            "universe": {"action": "NITRO", "multiplier": 20, "description": "Ultimate Nitro Boost"},
        }

        self.comment_mappings: Dict[str, str] = {
            "ikut": "JOIN_RACE",
            "!join": "JOIN_RACE",
            "!gas": "ACCELERATE",
            "!nitro": "NITRO",
            "!shield": "SHIELD",
            "!kiri": "TURN_LEFT",
            "!kanan": "TURN_RIGHT",
            "!rem": "SLOW_DOWN",
        }

        # Registered listeners
        self._listeners: List[Any] = []

    def add_listener(self, callback):
        self._listeners.append(callback)

    def _notify(self, event_type: str, data: dict):
        for cb in self._listeners:
            try:
                cb(event_type, data)
            except Exception:
                pass

    def get_capabilities(self) -> Dict[str, Any]:
        """Capabilities endpoint metadata for game engines to discover."""
        return {
            "protocol_version": self.protocol_version,
            "engine": "TikInfinity Universal Game Controller",
            "supported_actions": SUPPORTED_ACTIONS,
            "supported_states": SUPPORTED_STATES,
            "gift_mappings": self.gift_mappings,
            "comment_mappings": self.comment_mappings,
            "connected_games_count": len(self.connected_clients),
            "status": "ready" if self.enabled else "disabled",
        }

    def is_duplicate(self, dedup_key: str) -> bool:
        now = time.time()
        # Clean older entries
        with self._lock:
            expired = [k for k, ts in self._dedup_cache.items() if now - ts > self.dedup_window_seconds]
            for k in expired:
                del self._dedup_cache[k]

            if dedup_key in self._dedup_cache:
                return True
            self._dedup_cache[dedup_key] = now
            return False

    def dispatch_action(
        self,
        action: str,
        user_id: str,
        nickname: str,
        avatar: str = "",
        multiplier: int = 1,
        meta: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        """Normalize and queue an authoritative action to all connected game engines."""
        if not self.enabled:
            return None

        act_upper = action.strip().upper()
        if act_upper not in SUPPORTED_ACTIONS:
            logger.warning(f"Unsupported universal action: {action}")
            return None

        clean_uid = str(user_id or nickname).strip().lower()
        if not clean_uid:
            clean_uid = f"guest_{int(time.time() * 1000)}"

        # Deduplication check for rapid spam
        dedup_key = f"{act_upper}:{clean_uid}:{multiplier}:{meta.get('gift_id', '') if meta else ''}"
        if self.is_duplicate(dedup_key):
            logger.debug(f"Action deduplicated: {dedup_key}")
            return None

        with self._lock:
            self._action_id_seq += 1
            payload = {
                "id": self._action_id_seq,
                "protocol": self.protocol_version,
                "action": act_upper,
                "user_id": clean_uid,
                "nickname": nickname or clean_uid,
                "avatar": avatar or "",
                "multiplier": max(1, multiplier),
                "timestamp": time.time(),
                "meta": meta or {},
            }
            self.action_queue.append(payload)
            if len(self.action_queue) > self.max_queue_size:
                self.action_queue.pop(0)

        logger.info(f"⚡ [Universal Action #{payload['id']}] {act_upper} by {nickname} (x{multiplier})")
        self._notify("universal_action", payload)
        self.broadcast_to_games(payload)
        return payload

    def handle_tiktok_comment(self, user_id: str, nickname: str, avatar: str, comment: str) -> Optional[Dict[str, Any]]:
        """Parse TikTok Live comment and map to universal game action."""
        if not self.enabled:
            return None

        t = comment.strip().lower()
        # Direct matched comment commands
        for cmd, act in self.comment_mappings.items():
            if t == cmd or t.startswith(cmd + " "):
                vehicle_choice = None
                if act == "JOIN_RACE" and len(t.split()) > 1:
                    vehicle_choice = t.split()[1].lower()
                return self.dispatch_action(
                    action=act,
                    user_id=user_id,
                    nickname=nickname,
                    avatar=avatar,
                    multiplier=1,
                    meta={"source": "comment", "raw_text": comment, "vehicle_choice": vehicle_choice},
                )

        # Vehicle specific selection commands
        if t.startswith("!"):
            v_type = t[1:].strip()
            if v_type in ["ferrari", "lambo", "lamborghini", "bugatti", "nissan", "silvia", "motor", "motorcycle"]:
                return self.dispatch_action(
                    action="JOIN_RACE",
                    user_id=user_id,
                    nickname=nickname,
                    avatar=avatar,
                    multiplier=1,
                    meta={"source": "comment", "raw_text": comment, "vehicle_choice": v_type},
                )

        return None

    def handle_tiktok_gift(
        self,
        user_id: str,
        nickname: str,
        avatar: str,
        gift_name: str,
        combo: int = 1,
        repeat_end: bool = True,
    ) -> Optional[Dict[str, Any]]:
        """Parse TikTok Live gift and map to universal game action."""
        if not self.enabled:
            return None

        g_lower = gift_name.strip().lower()
        mapping = None
        for key, conf in self.gift_mappings.items():
            if key in g_lower:
                mapping = conf
                break

        if not mapping:
            # Default fallback for unmapped gifts: ACCELERATE proportional to combo
            mapping = {"action": "ACCELERATE", "multiplier": combo}

        act = mapping.get("action", "ACCELERATE")
        base_mult = mapping.get("multiplier", 1)
        total_mult = base_mult * max(1, combo)

        meta = {
            "source": "gift",
            "gift_name": gift_name,
            "combo": combo,
            "repeat_end": repeat_end,
            "description": mapping.get("description", ""),
        }
        if "duration" in mapping:
            meta["duration"] = mapping["duration"]

        return self.dispatch_action(
            action=act,
            user_id=user_id,
            nickname=nickname,
            avatar=avatar,
            multiplier=total_mult,
            meta=meta,
        )

    def handle_tiktok_like(self, user_id: str, nickname: str, avatar: str, count: int = 1) -> Optional[Dict[str, Any]]:
        """Parse TikTok Likes and provide subtle acceleration support."""
        if not self.enabled:
            return None
        # Likes generate small speed boost
        return self.dispatch_action(
            action="ACCELERATE",
            user_id=user_id,
            nickname=nickname,
            avatar=avatar,
            multiplier=max(1, count // 10),
            meta={"source": "like", "count": count},
        )

    def poll_actions(self, since_id: int = 0) -> List[Dict[str, Any]]:
        """Polled by REST-based game servers."""
        with self._lock:
            return [a for a in self.action_queue if a["id"] > since_id]

    def update_game_state(self, new_state: Dict[str, Any]) -> Dict[str, Any]:
        """Authoritative game server pushes updated game state and leaderboard."""
        with self._lock:
            self.game_state.update(new_state)
            self.game_state["last_updated"] = time.time()
        self._notify("game_state_update", self.game_state)
        return {"status": "ok", "state": self.game_state["state"]}

    def register_client(self, websocket: WebSocket):
        self.connected_clients.add(websocket)
        logger.info(f"🎮 Connected new game client via WebSocket. Total: {len(self.connected_clients)}")

    def unregister_client(self, websocket: WebSocket):
        if websocket in self.connected_clients:
            self.connected_clients.remove(websocket)
            logger.info(f"🎮 Game client disconnected. Total: {len(self.connected_clients)}")

    def broadcast_to_games(self, action_payload: Dict[str, Any]):
        """Stream action immediately to all connected game engines over WebSocket."""
        if not self.connected_clients:
            return

        msg = json.dumps({"type": "action", "data": action_payload})

        async def _send_all():
            dead_clients = set()
            for ws in list(self.connected_clients):
                try:
                    await ws.send_text(msg)
                except Exception:
                    dead_clients.add(ws)
            for ws in dead_clients:
                self.unregister_client(ws)

        try:
            loop = asyncio.get_running_loop()
            loop.create_task(_send_all())
        except RuntimeError:
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    asyncio.run_coroutine_threadsafe(_send_all(), loop)
                else:
                    asyncio.run(_send_all())
            except Exception as e:
                logger.error(f"Failed to broadcast to games: {e}")


# Global Singleton
universal_adapter = UniversalGameAdapter()

