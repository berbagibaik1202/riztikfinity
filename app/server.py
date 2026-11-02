"""
FastAPI Server for Local Web Dashboard & WebSocket Live Feed.
"""

import asyncio
from contextlib import asynccontextmanager
import os
from typing import List
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
    """Send JSON message to all connected dashboard websockets."""
    for ws in list(active_websockets):
        try:
            await ws.send_json(message)
        except Exception:
            active_websockets.remove(ws)


# Hook up queue logs and connection status to WebSocket broadcast
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: start queue processor
    await queue_mgr.start()
    yield
    # Shutdown
    await tiktok_mgr.disconnect()
    await queue_mgr.stop()


app = FastAPI(title="TikTok Live Game Controller", lifespan=lifespan)


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


@app.get("/")
async def get_index():
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "Dashboard UI file not found. Please create app/static/index.html"}


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


@app.post("/api/test-key")
async def test_key(req: TestKeyRequest):
    key = req.key.lower().strip()

    # Try bringing Roblox to focus before testing if available
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
