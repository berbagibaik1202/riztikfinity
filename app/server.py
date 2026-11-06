"""
FastAPI Server for Local Web Dashboard, WebSocket Live Feed, & OBS Overlay.
"""

import asyncio
from contextlib import asynccontextmanager
import os
from typing import List, Optional
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app import direct_input
from app.config import ActionRule, AppConfig, load_config, save_config
from app.profile_manager import GameProfile, profile_mgr
from app.queue_manager import QueueManager
from app.roblox_race import roblox_race_mgr
from app.tiktok_client import ConnectionState, TikTokManager
from app.universal_adapter import universal_adapter

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
    """Send JSON message to all connected dashboard and OBS websockets with timeout protection."""
    for ws in list(active_websockets):
        try:
            await asyncio.wait_for(ws.send_json(message), timeout=0.5)
        except Exception:
            if ws in active_websockets:
                try:
                    active_websockets.remove(ws)
                except ValueError:
                    pass


def safe_schedule(coro):
    """Safely schedule a coroutine or close it if no event loop is running."""
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(coro)
    except RuntimeError:
        coro.close()


# Hook up queue logs, connection status, and overlay events to WebSocket broadcast
queue_mgr.add_log_listener(lambda log: safe_schedule(broadcast_ws({"type": "log", "data": log})))
tiktok_mgr.add_state_listener(
    lambda state, room_id: safe_schedule(
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
    lambda payload: safe_schedule(
        broadcast_ws({
            "type": "overlay",
            "data": payload,
        })
    )
)
roblox_race_mgr.add_listener(
    lambda event_type, data: safe_schedule(
        broadcast_ws({
            "type": "roblox_race",
            "event": event_type,
            "data": data,
        })
    )
)
universal_adapter.add_listener(
    lambda event_type, data: safe_schedule(
        broadcast_ws({
            "type": "universal_adapter",
            "event": event_type,
            "data": data,
        })
    )
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: ensure profiles directory & seed presets
    profile_mgr.ensure_profiles_dir()
    # start queue processor
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


class SelectProfileRequest(BaseModel):
    profile_id: str


class SaveCurrentProfileRequest(BaseModel):
    name: str
    game_name: str = "Roblox"
    description: str = ""


class DuplicateProfileRequest(BaseModel):
    source_id: str
    new_id: str
    new_name: str


class ImportProfileRequest(BaseModel):
    data: dict


@app.get("/favicon.ico", include_in_schema=False)
async def get_favicon():
    """Return SVG favicon to prevent 404 logs in terminal/browser."""
    svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🎮</text></svg>'
    return Response(content=svg, media_type="image/svg+xml")


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


@app.get("/comments")
@app.get("/chat")
async def get_comments():
    comments_path = os.path.join(STATIC_DIR, "comments.html")
    if os.path.exists(comments_path):
        response = FileResponse(comments_path)
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        return response
    return {"message": "Comments UI file not found."}


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
        "active_profile": getattr(config, "active_profile", "roblox_obby"),
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

    # Also sync changes to active profile file if it exists
    if getattr(config, "active_profile", None):
        prof = profile_mgr.get_profile(config.active_profile)
        if prof:
            prof.rules = req.rules
            profile_mgr.save_profile(prof)

    await queue_mgr.broadcast_log(
        "INFO",
        f"Berhasil menyimpan {len(req.rules)} aturan untuk profil '{config.active_profile}'.",
    )
    return {"success": True, "rules_count": len(req.rules), "active_profile": config.active_profile}


# ======================================================================
# MULTI-PROFILE PRESET GAME ENDPOINTS
# ======================================================================

@app.get("/api/profiles")
async def get_profiles():
    """List all available game rule presets."""
    active_id = getattr(config, "active_profile", "roblox_obby")
    return {
        "active_profile": active_id,
        "profiles": profile_mgr.list_profiles(active_id),
    }


@app.post("/api/profiles/select")
async def select_profile(req: SelectProfileRequest):
    """Switch active game profile and load its rules."""
    prof = profile_mgr.get_profile(req.profile_id)
    if not prof:
        raise HTTPException(status_code=404, detail="Profil tidak ditemukan")

    config.active_profile = prof.id
    config.rules = prof.rules
    save_config(config)

    # Broadcast real-time update to web dashboard
    await broadcast_ws({
        "type": "profile_changed",
        "data": {
            "active_profile": prof.id,
            "profile_name": prof.name,
            "game_name": prof.game_name,
            "rules": [r.model_dump() for r in prof.rules],
        },
    })

    await queue_mgr.broadcast_log(
        "ACTION",
        f"🎮 Beralih ke profil game: '{prof.name}' ({len(prof.rules)} aturan dimuat).",
    )
    return {
        "success": True,
        "active_profile": prof.id,
        "name": prof.name,
        "rules_count": len(prof.rules),
        "rules": prof.rules,
    }


@app.post("/api/profiles/save-current")
async def save_current_profile(req: SaveCurrentProfileRequest):
    """Save current active rules as a new named custom profile."""
    from app.profile_manager import sanitize_profile_id
    prof_id = sanitize_profile_id(req.name)
    new_profile = GameProfile(
        id=prof_id,
        name=req.name.strip(),
        game_name=req.game_name.strip() or "Roblox",
        description=req.description.strip(),
        is_builtin=False,
        rules=[r.model_copy() for r in config.rules],
    )
    if profile_mgr.save_profile(new_profile):
        config.active_profile = prof_id
        save_config(config)
        await queue_mgr.broadcast_log("INFO", f"Profil baru berhasil dibuat: '{new_profile.name}'.")
        return {"success": True, "profile": new_profile.model_dump()}
    raise HTTPException(status_code=500, detail="Gagal menyimpan profil baru.")


@app.post("/api/profiles/duplicate")
async def duplicate_profile(req: DuplicateProfileRequest):
    """Duplicate an existing profile with a new name."""
    cloned = profile_mgr.duplicate_profile(req.source_id, req.new_id, req.new_name)
    if not cloned:
        raise HTTPException(status_code=400, detail="Gagal menduplikasi profil.")
    await queue_mgr.broadcast_log("INFO", f"Profil '{cloned.name}' berhasil diduplikasi.")
    return {"success": True, "profile": cloned.model_dump()}


@app.delete("/api/profiles/{profile_id}")
async def delete_profile(profile_id: str):
    """Delete a profile (cannot delete active profile)."""
    success, msg = profile_mgr.delete_profile(profile_id, config.active_profile)
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    await queue_mgr.broadcast_log("INFO", msg)
    return {"success": True, "message": msg}


@app.get("/api/profiles/{profile_id}/export")
async def export_profile(profile_id: str):
    """Export profile as a downloadable JSON file."""
    prof = profile_mgr.get_profile(profile_id)
    if not prof:
        raise HTTPException(status_code=404, detail="Profil tidak ditemukan")
    return JSONResponse(
        content=prof.model_dump(),
        headers={
            "Content-Disposition": f'attachment; filename="riztik_profile_{prof.id}.json"'
        },
    )


@app.post("/api/profiles/import")
async def import_profile(req: ImportProfileRequest):
    """Import a profile from JSON payload."""
    prof, msg = profile_mgr.import_profile(req.data)
    if not prof:
        raise HTTPException(status_code=400, detail=msg)
    await queue_mgr.broadcast_log("INFO", f"Berhasil mengimpor profil: '{prof.name}'.")
    return {"success": True, "profile": prof.model_dump(), "message": msg}


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


# ==========================================
# ROBLOX LIVE RACE API ENDPOINTS
# ==========================================
class RobloxControlRequest(BaseModel):
    action: str  # "start", "reset", "clear", "toggle", "set_vehicle"
    vehicle_preference: Optional[str] = None
    total_laps: Optional[int] = None


class RobloxTestActionRequest(BaseModel):
    test_type: str  # "join_rose", "join_chat", "boost_1x", "boost_5x", "turbo_donut", "rocket_topi"
    user_id: Optional[str] = None
    nickname: Optional[str] = None


@app.get("/api/roblox/actions")
async def get_roblox_actions(since_id: int = 0):
    """Polled by Roblox Studio HttpService to get queued commands."""
    actions = roblox_race_mgr.poll_actions(since_id=since_id)
    return JSONResponse(content={"status": "ok", "actions": actions})


@app.post("/api/roblox/state")
async def post_roblox_state(data: dict):
    """Roblox Studio reports race status, standings, and winner."""
    res = roblox_race_mgr.update_state_from_roblox(data)
    return JSONResponse(content=res)


@app.get("/api/roblox/summary")
async def get_roblox_summary():
    """Returns race status, racers list, and connection status for Dashboard."""
    return JSONResponse(content=roblox_race_mgr.get_summary())


@app.post("/api/roblox/control")
async def post_roblox_control(req: RobloxControlRequest):
    """Controls the race state (start, reset, vehicle settings)."""
    if req.action == "start":
        return JSONResponse(content=roblox_race_mgr.start_race())
    elif req.action == "reset":
        return JSONResponse(content=roblox_race_mgr.reset_race(clear_racers=False))
    elif req.action == "clear":
        return JSONResponse(content=roblox_race_mgr.reset_race(clear_racers=True))
    elif req.action == "toggle":
        roblox_race_mgr.enabled = not roblox_race_mgr.enabled
        return JSONResponse(content={"status": "ok", "enabled": roblox_race_mgr.enabled})
    elif req.action == "set_vehicle":
        if req.vehicle_preference in ["car", "motorcycle", "mixed"]:
            roblox_race_mgr.vehicle_preference = req.vehicle_preference
        if req.total_laps and req.total_laps > 0:
            roblox_race_mgr.total_laps = req.total_laps
        return JSONResponse(content=roblox_race_mgr.get_summary())
    return JSONResponse(status_code=400, content={"status": "error", "message": "Unknown action"})


@app.post("/api/roblox/test-action")
async def post_roblox_test_action(req: RobloxTestActionRequest):
    """Simulates a test TikTok event for the Roblox Race."""
    uname = req.nickname or "Tester_Pembalap"
    uid = req.user_id or uname.lower()

    if req.test_type == "join_rose":
        res = roblox_race_mgr.join_racer(user_id=uid, nickname=uname)
        v = res.get("racer", {}).get("vehicle", "car")
        v_name = "Mobil" if v == "car" else "Motor"
        universal_adapter.dispatch_action(
            action="JOIN_RACE",
            user_id=uid,
            nickname=uname,
            meta={"source": "test_simulator", "vehicle_choice": v}
        )
        await queue_mgr.broadcast_log("INFO", f"🏎️ [TEST] {uname} masuk balapan ({v_name}) dari Gift Mawar!")
        return JSONResponse(content=res)

    elif req.test_type == "join_chat":
        res = roblox_race_mgr.join_racer(user_id=uid, nickname=uname)
        v = res.get("racer", {}).get("vehicle", "car")
        v_name = "Mobil" if v == "car" else "Motor"
        universal_adapter.dispatch_action(
            action="JOIN_RACE",
            user_id=uid,
            nickname=uname,
            meta={"source": "test_simulator", "vehicle_choice": v}
        )
        await queue_mgr.broadcast_log("INFO", f"🏎️ [TEST] {uname} masuk balapan ({v_name}) via chat 'ikut'!")
        return JSONResponse(content=res)

    elif req.test_type == "boost_1x":
        res = roblox_race_mgr.boost_racer(user_id=uid, nickname=uname, multiplier=1)
        universal_adapter.dispatch_action(
            action="ACCELERATE",
            user_id=uid,
            nickname=uname,
            multiplier=1,
        )
        await queue_mgr.broadcast_log("INFO", f"⚡ [TEST] {uname} percepat 1x via Mawar 1!")
        return JSONResponse(content=res)

    elif req.test_type == "boost_5x":
        res = roblox_race_mgr.boost_racer(user_id=uid, nickname=uname, multiplier=5)
        universal_adapter.dispatch_action(
            action="ACCELERATE",
            user_id=uid,
            nickname=uname,
            multiplier=5,
        )
        await queue_mgr.broadcast_log("INFO", f"⚡ [TEST] {uname} percepat 5x via Mawar 5!")
        return JSONResponse(content=res)

    elif req.test_type == "turbo_donut":
        res = roblox_race_mgr.boost_racer(user_id=uid, nickname=uname, multiplier=8, turbo=True)
        universal_adapter.dispatch_action(
            action="NITRO",
            user_id=uid,
            nickname=uname,
            multiplier=8,
        )
        await queue_mgr.broadcast_log("INFO", f"🍩 [TEST] {uname} TURBO DONUT diaktifkan!")
        return JSONResponse(content=res)

    elif req.test_type == "rocket_topi":
        res = roblox_race_mgr.fire_rocket(user_id=uid, nickname=uname)
        universal_adapter.dispatch_action(
            action="SPAWN_OBSTACLE",
            user_id=uid,
            nickname=uname,
        )
        await queue_mgr.broadcast_log("INFO", f"🚀 [TEST] {uname} menembakkan ROKET TOPI!")
        return JSONResponse(content=res)

    elif req.test_type == "change_ferrari":
        res = roblox_race_mgr.change_vehicle(user_id=uid, nickname=uname, vehicle="ferrari")
        universal_adapter.dispatch_action(action="JOIN_RACE", user_id=uid, nickname=uname, meta={"vehicle_choice": "supercar"})
        await queue_mgr.broadcast_log("INFO", f"🏎️ [TEST] {uname} mengganti kendaraan ke FERRARI!")
        return JSONResponse(content=res)

    elif req.test_type == "change_lambo":
        res = roblox_race_mgr.change_vehicle(user_id=uid, nickname=uname, vehicle="lamborghini")
        universal_adapter.dispatch_action(action="JOIN_RACE", user_id=uid, nickname=uname, meta={"vehicle_choice": "supercar"})
        await queue_mgr.broadcast_log("INFO", f"🏎️ [TEST] {uname} mengganti kendaraan ke LAMBORGHINI!")
        return JSONResponse(content=res)

    elif req.test_type == "change_bugatti":
        res = roblox_race_mgr.change_vehicle(user_id=uid, nickname=uname, vehicle="bugatti")
        universal_adapter.dispatch_action(action="JOIN_RACE", user_id=uid, nickname=uname, meta={"vehicle_choice": "supercar"})
        await queue_mgr.broadcast_log("INFO", f"🏎️ [TEST] {uname} mengganti kendaraan ke BUGATTI CHIRON!")
        return JSONResponse(content=res)

    elif req.test_type == "change_motor":
        res = roblox_race_mgr.change_vehicle(user_id=uid, nickname=uname, vehicle="motorcycle")
        universal_adapter.dispatch_action(action="JOIN_RACE", user_id=uid, nickname=uname, meta={"vehicle_choice": "motorcycle"})
        await queue_mgr.broadcast_log("INFO", f"🏍️ [TEST] {uname} mengganti kendaraan ke MOTOR!")
        return JSONResponse(content=res)

    return JSONResponse(status_code=400, content={"status": "error", "message": "Unknown test type"})


@app.get("/api/roblox/script/{script_name}")
async def get_roblox_script(script_name: str):
    """Retrieve Luau script files for 1-click copy into Roblox Studio."""
    base_dir = os.path.dirname(os.path.dirname(__file__))
    roblox_dir = os.path.join(base_dir, "roblox")
    if script_name == "track":
        fpath = os.path.join(roblox_dir, "GenerateTrack.lua")
    elif script_name == "controller":
        fpath = os.path.join(roblox_dir, "LiveRaceController.server.lua")
    elif script_name == "camera":
        fpath = os.path.join(roblox_dir, "LiveRaceCamera.client.lua")
    else:
        raise HTTPException(status_code=404, detail="Script not found")

    if os.path.exists(fpath):
        with open(fpath, "r", encoding="utf-8") as f:
            return Response(content=f.read(), media_type="text/plain; charset=utf-8")
    raise HTTPException(status_code=404, detail="File missing")


# ==========================================
# UNIVERSAL GAME ADAPTER API & WEBSOCKET
# ==========================================
class UniversalDispatchRequest(BaseModel):
    action: Optional[str] = None
    action_type: Optional[str] = None
    user_id: Optional[str] = None
    nickname: Optional[str] = None
    avatar: Optional[str] = ""
    multiplier: Optional[int] = 1
    meta: Optional[Dict[str, Any]] = None


@app.get("/api/adapter/capabilities")
async def get_adapter_capabilities():
    """Capabilities discovery for connected game engines."""
    return JSONResponse(content=universal_adapter.get_capabilities())


@app.get("/api/adapter/status")
async def get_adapter_status():
    """Status endpoint for Creator Dashboard & monitors."""
    return JSONResponse(
        content={
            "enabled": universal_adapter.enabled,
            "protocol_version": universal_adapter.protocol_version,
            "connected_games": len(universal_adapter.connected_clients),
            "connected_clients": len(universal_adapter.connected_clients),
            "game_state": universal_adapter.game_state,
            "queue_count": len(universal_adapter.action_queue),
            "queue_size": len(universal_adapter.action_queue),
        }
    )


@app.get("/api/adapter/actions")
async def get_adapter_actions(since_id: int = 0):
    """Polled by REST-based external game engines."""
    actions = universal_adapter.poll_actions(since_id=since_id)
    return JSONResponse(content={"status": "ok", "actions": actions})


@app.post("/api/adapter/dispatch")
async def post_adapter_dispatch(req: UniversalDispatchRequest):
    """Manually dispatch a universal action (used by test simulator & dashboard)."""
    act = req.action or req.action_type
    if not act:
        raise HTTPException(status_code=400, detail="Action is required ('action' or 'action_type')")
    uname = req.nickname or "Tester_Racer"
    uid = req.user_id or uname.lower()
    res = universal_adapter.dispatch_action(
        action=act,
        user_id=uid,
        nickname=uname,
        avatar=req.avatar or "",
        multiplier=req.multiplier or 1,
        meta=req.meta or {"source": "manual_dispatch"},
    )
    if not res:
        raise HTTPException(status_code=400, detail="Invalid action or adapter disabled")
    await queue_mgr.broadcast_log(
        "INFO",
        f"🎮 [Adapter Dispatch] {act.upper()} untuk {uname} (x{req.multiplier or 1})",
    )
    return JSONResponse(content={"status": "ok", "action": res})


@app.post("/api/adapter/state")
async def post_adapter_state(data: dict):
    """External game server syncs authoritative state & leaderboard back."""
    res = universal_adapter.update_game_state(data)
    return JSONResponse(content=res)


@app.websocket("/ws/adapter")
async def adapter_websocket_endpoint(websocket: WebSocket):
    """Dedicated realtime WebSocket stream for external game engines."""
    await websocket.accept()
    universal_adapter.register_client(websocket)
    try:
        # Send initial greeting with protocol version & current state
        await websocket.send_json({
            "type": "init",
            "protocol": universal_adapter.protocol_version,
            "capabilities": universal_adapter.get_capabilities(),
            "game_state": universal_adapter.game_state,
        })
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
                mtype = msg.get("type")
                if mtype == "state_update":
                    universal_adapter.update_game_state(msg.get("data", {}))
                elif mtype == "ping":
                    await websocket.send_json({"type": "pong", "timestamp": time.time()})
            except Exception:
                pass
    except WebSocketDisconnect:
        universal_adapter.unregister_client(websocket)
    except Exception:
        universal_adapter.unregister_client(websocket)


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
            "roblox_race": roblox_race_mgr.get_summary(),
            "universal_adapter": universal_adapter.get_capabilities(),
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
