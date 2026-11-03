"""
TikTok Live Client Integration using TikTokLive library.
Listens directly to public TikTok server Webcast WebSocket without TikTok Studio.
Broadcasts controller actions and overlay visual/TTS events.
"""

import asyncio
from enum import Enum
import logging
from typing import Any, Callable, List, Optional
from TikTokLive import TikTokLiveClient
from TikTokLive.events import (
    CommentEvent,
    ConnectEvent,
    DisconnectEvent,
    FollowEvent,
    GiftEvent,
    JoinEvent,
    LikeEvent,
    LiveEndEvent,
    ShareEvent,
)

from app.config import AppConfig, TriggerType
from app.queue_manager import QueueManager
from app.roblox_race import roblox_race_mgr

logger = logging.getLogger("tiktok_client")


class ConnectionState(str, Enum):
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    RECONNECTING = "reconnecting"


def extract_user_avatar(user: Any) -> str:
    """Safely extract avatar URL from TikTok user protobuf object."""
    try:
        if hasattr(user, "avatar_thumb") and user.avatar_thumb:
            if hasattr(user.avatar_thumb, "url_list") and user.avatar_thumb.url_list:
                return user.avatar_thumb.url_list[0]
    except Exception:
        pass
    return ""


class TikTokManager:
    def __init__(self, config: AppConfig, queue_manager: QueueManager):
        self.config = config
        self.queue_manager = queue_manager
        self.client: Optional[TikTokLiveClient] = None
        self.state: ConnectionState = ConnectionState.DISCONNECTED
        self.room_id: Optional[str] = None
        self.current_user: str = ""
        self.like_accumulator: int = 0
        self._state_listeners: List[Callable[[ConnectionState, Optional[str]], None]] = []
        self._overlay_listeners: List[Callable[[dict], Any]] = []
        self._run_task: Optional[asyncio.Task] = None

    def add_state_listener(self, callback: Callable[[ConnectionState, Optional[str]], None]) -> None:
        """Register a callback for connection state changes."""
        self._state_listeners.append(callback)

    def add_overlay_listener(self, callback: Callable[[dict], Any]) -> None:
        """Register a callback for overlay events (visuals & TTS)."""
        self._overlay_listeners.append(callback)

    async def broadcast_overlay_event(self, event_name: str, payload: dict) -> None:
        """Broadcast event to OBS overlay and dashboard websockets."""
        data = {"event": event_name, **payload}
        for listener in self._overlay_listeners:
            try:
                res = listener(data)
                if asyncio.iscoroutine(res):
                    await res
            except Exception:
                pass

    async def _set_state(self, new_state: ConnectionState, room_id: Optional[str] = None) -> None:
        self.state = new_state
        if room_id is not None:
            self.room_id = room_id
        for listener in self._state_listeners:
            try:
                res = listener(self.state, self.room_id)
                if asyncio.iscoroutine(res):
                    await res
            except Exception:
                pass

    async def connect(self, unique_id: str) -> bool:
        """Start listening to a TikTok live room by username."""
        cleaned_id = unique_id.strip().lstrip("@")
        if not cleaned_id:
            await self.queue_manager.broadcast_log("ERROR", "Username TikTok tidak boleh kosong.")
            return False

        if self.state in (ConnectionState.CONNECTED, ConnectionState.CONNECTING):
            await self.disconnect()

        self.current_user = cleaned_id
        self.like_accumulator = 0
        await self._set_state(ConnectionState.CONNECTING)
        await self.queue_manager.broadcast_log("INFO", f"Menghubungi TikTok Live @{cleaned_id}...")

        try:
            self.client = TikTokLiveClient(unique_id=cleaned_id)
            self._register_event_handlers()

            # Start connection in background task
            self._run_task = asyncio.create_task(self._client_runner())
            return True
        except Exception as e:
            await self._set_state(ConnectionState.DISCONNECTED)
            await self.queue_manager.broadcast_log("ERROR", f"Gagal memulai koneksi TikTok: {e}")
            return False

    async def disconnect(self) -> None:
        """Gracefully disconnect from TikTok Live."""
        if self.client:
            try:
                if self.client.connected:
                    await self.client.disconnect()
            except Exception:
                pass
            self.client = None

        if self._run_task and not self._run_task.done():
            self._run_task.cancel()
            try:
                await self._run_task
            except asyncio.CancelledError:
                pass

        self.room_id = None
        self.like_accumulator = 0
        await self._set_state(ConnectionState.DISCONNECTED)
        await self.queue_manager.broadcast_log("INFO", "Terputus dari TikTok Live.")

    async def _client_runner(self) -> None:
        """Background runner task to maintain connection and auto-reconnect."""
        try:
            if self.client:
                await self.client.start()
        except asyncio.CancelledError:
            pass
        except Exception as e:
            await self.queue_manager.broadcast_log("WARNING", f"Stream TikTok terputus: {e}")
            await self._set_state(ConnectionState.DISCONNECTED)

    def _register_event_handlers(self) -> None:
        if not self.client:
            return

        @self.client.on(ConnectEvent)
        async def on_connect(event: ConnectEvent):
            room_id = str(getattr(self.client, "room_id", "Unknown"))
            await self._set_state(ConnectionState.CONNECTED, room_id)
            await self.queue_manager.broadcast_log(
                "INFO",
                f"Tersambung ke Live @{self.current_user} (Room ID: {room_id})",
            )

        @self.client.on(DisconnectEvent)
        async def on_disconnect(event: DisconnectEvent):
            await self._set_state(ConnectionState.DISCONNECTED)
            await self.queue_manager.broadcast_log("WARNING", "Koneksi ke TikTok terputus.")

        @self.client.on(LiveEndEvent)
        async def on_live_end(event: LiveEndEvent):
            await self._set_state(ConnectionState.DISCONNECTED)
            await self.queue_manager.broadcast_log("INFO", f"Live streaming @{self.current_user} telah selesai.")

        @self.client.on(JoinEvent)
        async def on_join(event: JoinEvent):
            user_name = getattr(event.user, "nickname", None) or getattr(event.user, "unique_id", "Viewer")
            unique_id = getattr(event.user, "unique_id", "")
            avatar_url = extract_user_avatar(event.user)

            await self.broadcast_overlay_event(
                "join",
                {
                    "nickname": user_name,
                    "unique_id": unique_id,
                    "avatar": avatar_url,
                },
            )

        @self.client.on(CommentEvent)
        async def on_comment(event: CommentEvent):
            user_name = getattr(event.user, "nickname", None) or getattr(event.user, "unique_id", "Viewer")
            unique_id = getattr(event.user, "unique_id", "")
            avatar_url = extract_user_avatar(event.user)
            text = (getattr(event, "comment", "") or "").strip()

            await self.queue_manager.broadcast_log(
                "INFO",
                f"💬 {user_name}: \"{text}\"",
            )

            # Broadcast to OBS Overlay (Walking avatar speech bubble + TTS reader)
            await self.broadcast_overlay_event(
                "comment",
                {
                    "nickname": user_name,
                    "unique_id": unique_id,
                    "avatar": avatar_url,
                    "comment": text,
                },
            )

            # Check if user joins or changes vehicle in Roblox Live Race via chat
            if roblox_race_mgr.enabled:
                t_lower = text.lower()
                clean_uid = str(unique_id or user_name).strip().lower()

                # Command ganti kendaraan: !ferrari, !lambo, !bugatti, !porsche, !motor, !kart, !truck, !cyber
                detected_vehicle = None
                if "!ferrari" in t_lower or "ganti ferrari" in t_lower or "pilih ferrari" in t_lower or "ikut ferrari" in t_lower:
                    detected_vehicle = "ferrari"
                elif "!lambo" in t_lower or "!lamborghini" in t_lower or "ganti lambo" in t_lower or "pilih lambo" in t_lower or "ikut lambo" in t_lower:
                    detected_vehicle = "lamborghini"
                elif "!bugatti" in t_lower or "ganti bugatti" in t_lower or "pilih bugatti" in t_lower or "ikut bugatti" in t_lower:
                    detected_vehicle = "bugatti"
                elif "!porsche" in t_lower or "ganti porsche" in t_lower or "pilih porsche" in t_lower or "ikut porsche" in t_lower:
                    detected_vehicle = "porsche"
                elif "!motor" in t_lower or "!bike" in t_lower or "ganti motor" in t_lower or "ikut motor" in t_lower:
                    detected_vehicle = "motorcycle"
                elif "!kart" in t_lower or "ganti kart" in t_lower or "ikut kart" in t_lower:
                    detected_vehicle = "kart"
                elif "!truck" in t_lower or "ganti truck" in t_lower or "ikut truck" in t_lower:
                    detected_vehicle = "truck"
                elif "!cyber" in t_lower or "ganti cyber" in t_lower:
                    detected_vehicle = "cyber"

                if detected_vehicle:
                    res = roblox_race_mgr.change_vehicle(user_id=unique_id, nickname=user_name, vehicle=detected_vehicle)
                    v_title = detected_vehicle.capitalize()
                    await self.queue_manager.broadcast_log(
                        "INFO",
                        f"🏎️ {user_name} berganti/memilih kendaraan: {v_title}!",
                    )
                elif "ikut" in t_lower:
                    join_res = roblox_race_mgr.join_racer(
                        user_id=unique_id,
                        nickname=user_name,
                        avatar=avatar_url,
                    )
                    if join_res.get("status") == "ok":
                        vehicle = join_res["racer"]["vehicle"]
                        vehicle_name = "Mobil" if vehicle == "car" else vehicle.capitalize()
                        await self.queue_manager.broadcast_log(
                            "INFO",
                            f"🏎️ {user_name} bergabung ke Balapan Roblox ({vehicle_name}) via chat 'ikut'!",
                        )

            # Match controller rules for game
            for rule in self.config.rules:
                if not rule.enabled or rule.trigger_type != TriggerType.CHAT:
                    continue
                if rule.chat_command and rule.chat_command.strip().lower() in text.lower():
                    await self.queue_manager.trigger_rule(
                        rule=rule,
                        source_user=user_name,
                        source_trigger=f"Chat: {text}",
                        combo_count=1,
                    )

        @self.client.on(GiftEvent)
        async def on_gift(event: GiftEvent):
            gift_name = ""
            if hasattr(event, "gift") and event.gift:
                gift_name = getattr(event.gift, "name", "") or getattr(event.gift, "describe", "")
            if not gift_name:
                gift_name = f"Gift_{getattr(event, 'gift_id', 'unknown')}"

            user_name = getattr(event.user, "nickname", None) or getattr(event.user, "unique_id", "Viewer")
            unique_id = getattr(event.user, "unique_id", "")
            avatar_url = extract_user_avatar(event.user)
            combo = getattr(event, "repeat_count", 1) or getattr(event, "combo_count", 1) or 1

            await self.queue_manager.broadcast_log(
                "INFO",
                f"🎁 Gift: {gift_name} (x{combo}) dari {user_name}",
            )

            # Broadcast to OBS Overlay (Floating Gift Bubble)
            await self.broadcast_overlay_event(
                "gift",
                {
                    "nickname": user_name,
                    "unique_id": unique_id,
                    "avatar": avatar_url,
                    "gift_name": gift_name,
                    "combo": combo,
                },
            )

            # Interactive Roblox Live Race controls via TikTok Gifts
            if roblox_race_mgr.enabled:
                g_lower = gift_name.lower()
                clean_uid = str(unique_id or user_name).strip().lower()

                # 1. Rose / Mawar: Join race arena OR speed boost (1x or 5x or combo)
                if "rose" in g_lower or "mawar" in g_lower:
                    if clean_uid not in roblox_race_mgr.racers:
                        join_res = roblox_race_mgr.join_racer(user_id=unique_id, nickname=user_name, avatar=avatar_url)
                        vehicle = join_res.get("racer", {}).get("vehicle", "car")
                        vehicle_name = "Mobil" if vehicle == "car" else "Motor"
                        await self.queue_manager.broadcast_log(
                            "INFO",
                            f"🏎️ {user_name} masuk arena Balapan Roblox ({vehicle_name}) dari Gift Mawar!",
                        )
                    else:
                        mult = combo
                        roblox_race_mgr.boost_racer(user_id=unique_id, nickname=user_name, multiplier=mult)
                        await self.queue_manager.broadcast_log(
                            "INFO",
                            f"⚡ {user_name} mempercepat laju {mult}x di Balapan Roblox!",
                        )

                # 2. Donut / Doughnut: Transform to Ferrari + Turbo speed!
                elif "doughnut" in g_lower or "donat" in g_lower or "donut" in g_lower:
                    roblox_race_mgr.change_vehicle(user_id=unique_id, nickname=user_name, vehicle="ferrari")
                    roblox_race_mgr.boost_racer(user_id=unique_id, nickname=user_name, multiplier=8, turbo=True)
                    await self.queue_manager.broadcast_log(
                        "INFO",
                        f"🍩 {user_name} MENGGANTI MOBIL JADI FERRARI + AKTIFKAN TURBO DONAT!",
                    )

                # 3. Cap / Topi / Hat: Shoot Rocket at opponents!
                elif "cap" in g_lower or "topi" in g_lower or "hat" in g_lower:
                    roblox_race_mgr.fire_rocket(user_id=unique_id, nickname=user_name)
                    await self.queue_manager.broadcast_log(
                        "INFO",
                        f"🚀 {user_name} menembakkan ROKET TOPI ke lawan di Balapan Roblox!",
                    )

                # 4. Gift Mewah / Supercars (Paus/Whale, Singa/Lion, Corgi, Galaxy, Universe, Mobil):
                elif any(k in g_lower for k in ["whale", "paus", "lion", "singa", "corgi", "galaxy", "universe", "mobil", "car"]):
                    target_v = "bugatti" if ("galaxy" in g_lower or "universe" in g_lower) else "lamborghini"
                    roblox_race_mgr.change_vehicle(user_id=unique_id, nickname=user_name, vehicle=target_v)
                    roblox_race_mgr.boost_racer(user_id=unique_id, nickname=user_name, multiplier=10, turbo=True)
                    await self.queue_manager.broadcast_log(
                        "INFO",
                        f"🌟 {user_name} MENG-UPGRADE KENDARAAN JADI HYPERCAR {target_v.upper()}!",
                    )

            # Match controller rules for game
            for rule in self.config.rules:
                if not rule.enabled or rule.trigger_type != TriggerType.GIFT:
                    continue
                if rule.gift_name and (
                    rule.gift_name.strip().lower() in gift_name.strip().lower()
                    or gift_name.strip().lower() in rule.gift_name.strip().lower()
                ):
                    await self.queue_manager.trigger_rule(
                        rule=rule,
                        source_user=user_name,
                        source_trigger=f"Gift: {gift_name}",
                        combo_count=combo,
                    )

        @self.client.on(LikeEvent)
        async def on_like(event: LikeEvent):
            user_name = getattr(event.user, "nickname", None) or getattr(event.user, "unique_id", "Viewer")
            unique_id = getattr(event.user, "unique_id", "")
            count = getattr(event, "count", 1) or 1
            self.like_accumulator += count

            # Broadcast to OBS Overlay (Floating heart particles & avatar happy jump)
            await self.broadcast_overlay_event(
                "like",
                {
                    "nickname": user_name,
                    "unique_id": unique_id,
                    "count": count,
                },
            )

            like_rules = [r for r in self.config.rules if r.enabled and r.trigger_type == TriggerType.LIKE]
            if not like_rules:
                return

            for rule in like_rules:
                milestone = rule.like_count or 5
                if self.like_accumulator >= milestone:
                    triggers_count = self.like_accumulator // milestone
                    self.like_accumulator %= milestone

                    await self.queue_manager.broadcast_log(
                        "INFO",
                        f"❤️ Like milestone tercapai dari {user_name}! ({milestone}x tap -> [{rule.target_key.upper()}])",
                    )
                    for _ in range(triggers_count):
                        await self.queue_manager.trigger_rule(
                            rule=rule,
                            source_user=user_name,
                            source_trigger=f"Likes ({milestone} taps)",
                            combo_count=1,
                        )
                else:
                    await self.queue_manager.broadcast_log(
                        "DEBUG",
                        f"❤️ Tap layar dari {user_name} (+{count} like, progress: {self.like_accumulator}/{milestone})",
                    )

        @self.client.on(FollowEvent)
        async def on_follow(event: FollowEvent):
            user_name = getattr(event.user, "nickname", None) or getattr(event.user, "unique_id", "Viewer")
            unique_id = getattr(event.user, "unique_id", "")
            avatar_url = extract_user_avatar(event.user)

            await self.queue_manager.broadcast_log("INFO", f"⭐ Follower baru: {user_name}")
            await self.broadcast_overlay_event(
                "follow",
                {
                    "nickname": user_name,
                    "unique_id": unique_id,
                    "avatar": avatar_url,
                },
            )

        @self.client.on(ShareEvent)
        async def on_share(event: ShareEvent):
            user_name = getattr(event.user, "nickname", None) or getattr(event.user, "unique_id", "Viewer")
            await self.queue_manager.broadcast_log("INFO", f"🔁 Live dibagikan oleh: {user_name}")
            await self.broadcast_overlay_event(
                "share",
                {"nickname": user_name},
            )
