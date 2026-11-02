"""
FastAPI Server for Local Web Dashboard, WebSocket Live Feed, & OBS Overlay.
"""

import asyncio
from contextlib import asynccontextmanager
import os
from typing import List, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app import direct_input
from app.config import ActionRule, AppConfig, load_config, save_config
from app.queue_manager import QueueManager
from app.tiktok_client import ConnectionState, TikTokManager

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(STATIC_DIR, exist_ok=True)

# Shared singletons
config: AppConfig = load_config()
queue_mgr = QueueManager(
    max_queue_size=config.max_queue_size,
    require_roblox_focus=config.require_roblox_focus,
    auto_focus_roblox=config.auto_focus_roblox,
)
tiktok_mgr = TikTokManager(config=config, queue_manager=queue_mgr)

# Active WebSocket connections
active_websockets: List[WebSocket] = []


async def broadcast_ws(message: dict):
    """Send JSON message to all connected dashboard and OBS websockets."""
    for ws in list(active_websockets):
        try:
            await ws.send_json(message)
        except Exception:
            if ws in active_websockets:
                active_websockets.remove(ws)


# Hook up queue logs, connection status, and overlay events to WebSocket broadcast
queue_mgr.add_log_listener(lambda log: asyncio.create_task(broadcast_ws({"type": "log", "data": log})))
tiktok_mgr.add_state_listener(
    lambda state, room_id: asyncio.create_task(
        broadcast_ws({
            "type": "state",
            "data": {
                "state": state.value,
                "room_id": room_id,
                "user": tiktok_mgr.current_user,
            },
        })
    )
)
tiktok_mgr.add_overlay_listener(
    lambda payload: asyncio.create_task(
        broadcast_ws({
            "type": "overlay",
            "data": payload,
        })
    )
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: start queue processor
    await queue_mgr.start()
    yield
    # Shutdown
    await tiktok_mgr.disconnect()
    await queue_mgr.stop()


app = FastAPI(title="TikTok Live Game Controller & OBS Overlay", lifespan=lifespan)


class ConnectRequest(BaseModel):
    username: str


class TestKeyRequest(BaseModel):
    key: str
    mode: str = "tap"
    duration: float = 0.3


class ConfigUpdateRequest(BaseModel):
    require_roblox_focus: bool
    auto_focus_roblox: bool = True
    max_queue_size: int
    rules: List[ActionRule]


class OverlaySettingsRequest(BaseModel):
    tts_enabled: bool
    tts_volume: float
    tts_speed: float
    tts_template: str
    overlay_walking_characters: bool
    overlay_gift_balloons: bool
    overlay_like_hearts: bool


class TestOverlayEventRequest(BaseModel):
    event_type: str  # comment, gift, join, like
    nickname: str = "Penonton_Setia"
    text: Optional[str] = "Halo bang! Semangat terus live-nya!"
    gift_name: Optional[str] = "Rose"
    combo: int = 1


@app.get("/")
async def get_index():
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        response = FileResponse(index_path)
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        return response
    return {"message": "Dashboard UI file not found."}


@app.get("/overlay")
async def get_overlay():
    overlay_path = os.path.join(STATIC_DIR, "overlay.html")
    if os.path.exists(overlay_path):
        response = FileResponse(overlay_path)
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        return response
    return {"message": "Overlay UI file not found."}


@app.get("/api/status")
async def get_status():
    return {
        "tiktok_state": tiktok_mgr.state.value,
        "tiktok_user": tiktok_mgr.current_user,
        "room_id": tiktok_mgr.room_id,
        "is_admin": direct_input.is_admin(),
        "is_roblox_focused": direct_input.is_roblox_focused(),
        "roblox_running": direct_input.find_roblox_window() is not None,
        "active_window": direct_input.get_foreground_window_title(),
        "queue_size": queue_mgr.queue.qsize(),
        "require_roblox_focus": queue_mgr.require_roblox_focus,
        "auto_focus_roblox": queue_mgr.auto_focus_roblox,
        "tts_enabled": config.tts_enabled,
    }


@app.post("/api/connect")
async def post_connect(req: ConnectRequest):
    config.tiktok_username = req.username
    save_config(config)
    success = await tiktok_mgr.connect(req.username)
    return {"success": success, "username": req.username}


@app.post("/api/disconnect")
async def post_disconnect():
    await tiktok_mgr.disconnect()
    return {"success": True}


@app.get("/api/rules")
async def get_rules():
    return {
        "tiktok_username": config.tiktok_username,
        "require_roblox_focus": queue_mgr.require_roblox_focus,
        "auto_focus_roblox": queue_mgr.auto_focus_roblox,
        "max_queue_size": queue_mgr.max_queue_size,
        "rules": config.rules,
    }


@app.post("/api/rules")
async def save_rules(req: ConfigUpdateRequest):
    config.require_roblox_focus = req.require_roblox_focus
    config.auto_focus_roblox = req.auto_focus_roblox
    config.max_queue_size = req.max_queue_size
    config.rules = req.rules

    queue_mgr.require_roblox_focus = req.require_roblox_focus
    queue_mgr.auto_focus_roblox = req.auto_focus_roblox
    queue_mgr.max_queue_size = req.max_queue_size

    save_config(config)
    await queue_mgr.broadcast_log("INFO", f"Berhasil menyimpan {len(req.rules)} aturan.")
    return {"success": True, "rules_count": len(req.rules)}


@app.get("/api/overlay/settings")
async def get_overlay_settings():
    return {
        "tts_enabled": config.tts_enabled,
        "tts_volume": config.tts_volume,
        "tts_speed": config.tts_speed,
        "tts_template": config.tts_template,
        "overlay_walking_characters": config.overlay_walking_characters,
        "overlay_gift_balloons": config.overlay_gift_balloons,
        "overlay_like_hearts": config.overlay_like_hearts,
    }


@app.post("/api/overlay/settings")
async def save_overlay_settings(req: OverlaySettingsRequest):
    config.tts_enabled = req.tts_enabled
    config.tts_volume = req.tts_volume
    config.tts_speed = req.tts_speed
    config.tts_template = req.tts_template
    config.overlay_walking_characters = req.overlay_walking_characters
    config.overlay_gift_balloons = req.overlay_gift_balloons
    config.overlay_like_hearts = req.overlay_like_hearts
    save_config(config)

    # Broadcast updated settings to overlay websocket
    await broadcast_ws({
        "type": "overlay_config",
        "data": {
            "tts_enabled": config.tts_enabled,
            "tts_volume": config.tts_volume,
            "tts_speed": config.tts_speed,
            "tts_template": config.tts_template,
            "overlay_walking_characters": config.overlay_walking_characters,
            "overlay_gift_balloons": config.overlay_gift_balloons,
            "overlay_like_hearts": config.overlay_like_hearts,
        },
    })
    return {"success": True}


@app.post("/api/overlay/test-event")
async def test_overlay_event(req: TestOverlayEventRequest):
    """Test overlay visuals & TTS without live TikTok stream."""
    if req.event_type == "comment":
        await tiktok_mgr.broadcast_overlay_event(
            "comment",
            {
                "nickname": req.nickname,
                "unique_id": req.nickname.lower(),
                "avatar": "",
                "comment": req.text or "Komentar uji coba TTS!",
            },
        )
    elif req.event_type == "gift":
        await tiktok_mgr.broadcast_overlay_event(
            "gift",
            {
                "nickname": req.nickname,
                "unique_id": req.nickname.lower(),
                "avatar": "",
                "gift_name": req.gift_name or "Rose",
                "combo": req.combo,
            },
        )
    elif req.event_type == "join":
        await tiktok_mgr.broadcast_overlay_event(
            "join",
            {
                "nickname": req.nickname,
                "unique_id": req.nickname.lower(),
                "avatar": "",
            },
        )
    elif req.event_type == "like":
        await tiktok_mgr.broadcast_overlay_event(
            "like",
            {
                "nickname": req.nickname,
                "unique_id": req.nickname.lower(),
                "count": 5,
            },
        )
    return {"success": True, "event": req.event_type}


@app.post("/api/test-key")
async def test_key(req: TestKeyRequest):
    key = req.key.lower().strip()
    direct_input.focus_roblox()
    await asyncio.sleep(0.08)

    duration = max(0.05, req.duration)
    if req.mode == "hold":
        success = direct_input.press_key(key)
        await asyncio.sleep(duration)
        direct_input.release_key(key)
    else:
        success = direct_input.tap_key(key, duration)

    await queue_mgr.broadcast_log(
        "INFO",
        f"Manual Test Key: {req.mode.upper()} [{key.upper()}] ({duration:.2f}s) -> {'OK' if success else 'FAILED'}",
    )
    return {"success": success, "key": key}


@app.post("/api/emergency-stop")
async def emergency_stop():
    queue_mgr.emergency_stop()
    await queue_mgr.broadcast_log("WARNING", "EMERGENCY STOP DIAKTIFKAN: Semua tombol dilepas & antrean dikosongkan!")
    return {"success": True}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_websockets.append(websocket)
    await websocket.send_json({
        "type": "init",
        "data": {
            "state": tiktok_mgr.state.value,
            "room_id": tiktok_mgr.room_id,
            "user": tiktok_mgr.current_user,
            "is_admin": direct_input.is_admin(),
            "is_roblox_focused": direct_input.is_roblox_focused(),
            "roblox_running": direct_input.find_roblox_window() is not None,
            "active_window": direct_input.get_foreground_window_title(),
            "overlay_config": {
                "tts_enabled": config.tts_enabled,
                "tts_volume": config.tts_volume,
                "tts_speed": config.tts_speed,
                "tts_template": config.tts_template,
                "overlay_walking_characters": config.overlay_walking_characters,
                "overlay_gift_balloons": config.overlay_gift_balloons,
                "overlay_like_hearts": config.overlay_like_hearts,
            },
        },
    })
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in active_websockets:
            active_websockets.remove(websocket)
    except Exception:
        if websocket in active_websockets:
            active_websockets.remove(websocket)


# Mount static assets
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
