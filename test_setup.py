"""
Verification script for TikTok Live Game Controller core components.
"""

import sys
import os

# Add workspace to path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app import direct_input
from app.config import load_config, save_config, ActionRule
from app.queue_manager import QueueManager, PressMode

def test_direct_input():
    print("Testing direct_input...")
    scancode_w, ext_w = direct_input.resolve_scancode("w")
    assert scancode_w == 0x11, f"Expected 0x11 for 'w', got {hex(scancode_w) if scancode_w else None}"
    
    scancode_space, _ = direct_input.resolve_scancode("space")
    assert scancode_space == 0x39, f"Expected 0x39 for 'space', got {hex(scancode_space) if scancode_space else None}"
    
    admin = direct_input.is_admin()
    title = direct_input.get_foreground_window_title()
    print(f"  [OK] Scancode 'w': {hex(scancode_w)}, 'space': {hex(scancode_space)}")
    print(f"  [INFO] Running as Admin: {admin}")
    print(f"  [INFO] Foreground window: '{title}'")

def test_config():
    print("\nTesting config...")
    cfg = load_config()
    assert len(cfg.rules) > 0, "Expected default rules to be loaded"
    print(f"  [OK] Loaded {len(cfg.rules)} rules.")
    for r in cfg.rules[:2]:
        print(f"    - {r.id}: {r.trigger_type.value} -> [{r.target_key}] ({r.press_mode.value})")

def test_static_and_routes():
    print("\nTesting static overlay files...")
    static_dir = os.path.join(os.path.dirname(__file__), "app", "static")
    for fname in ["index.html", "overlay.html", "comments.html"]:
        fpath = os.path.join(static_dir, fname)
        assert os.path.exists(fpath), f"Missing expected file: {fname}"
        with open(fpath, "r", encoding="utf-8") as f:
            content = f.read()
            assert len(content) > 100, f"File {fname} is too small/empty"
        print(f"  [OK] {fname} exists ({len(content)} bytes)")

    # Verify server app import and routes
    from app.server import app
    routes = [route.path for route in app.routes]
    print(f"  [OK] Registered FastAPI routes: {routes}")
    assert "/overlay" in routes, "Missing /overlay route"
    assert "/comments" in routes, "Missing /comments route"
    assert "/chat" in routes, "Missing /chat route"
    assert "/favicon.ico" in routes, "Missing /favicon.ico route"
    assert "/api/profiles" in routes, "Missing /api/profiles route"
    assert "/api/profiles/select" in routes, "Missing /api/profiles/select route"

def test_profiles():
    print("\nTesting profile_manager...")
    from app.profile_manager import profile_mgr
    profile_mgr.ensure_profiles_dir()
    profs = profile_mgr.list_profiles()
    assert len(profs) >= 4, f"Expected at least 4 presets, got {len(profs)}"
    print(f"  [OK] Found {len(profs)} profiles:")
    for p in profs:
        print(f"    - {p['id']}: {p['name']} ({p['rules_count']} rules)")
    
    # Test loading roblox_driving
    driving = profile_mgr.get_profile("roblox_driving")
    assert driving is not None, "Failed to load roblox_driving"
    assert len(driving.rules) > 0, "roblox_driving has no rules"
    print(f"  [OK] Successfully loaded {driving.name} with {len(driving.rules)} rules.")

    # Test duplicate and delete guard
    clone = profile_mgr.duplicate_profile("roblox_driving", "test_temp_clone", "Temp Test Clone")
    assert clone is not None, "Failed to duplicate profile"
    assert clone.id == "test_temp_clone"

    # Active profile delete guard
    can_del_active, _ = profile_mgr.delete_profile("test_temp_clone", active_profile_id="test_temp_clone")
    assert can_del_active is False, "Active profile must not be deleted"

    # Delete non-active clone
    can_del, _ = profile_mgr.delete_profile("test_temp_clone", active_profile_id="roblox_obby")
    assert can_del is True, "Failed to delete non-active profile"
    print("  [OK] Duplication and safety delete guards verified successfully.")

def test_roblox_race():
    print("\nTesting Roblox Live Race system...")
    from app.roblox_race import roblox_race_mgr
    
    # Reset
    roblox_race_mgr.reset_race(clear_racers=True)
    assert len(roblox_race_mgr.racers) == 0

    # Join racer via Rose / Chat
    res1 = roblox_race_mgr.join_racer("user_101", "SpeedDemon", vehicle="car")
    assert res1["status"] == "ok"
    assert "user_101" in roblox_race_mgr.racers
    assert roblox_race_mgr.racers["user_101"]["vehicle"] == "car"

    res2 = roblox_race_mgr.join_racer("user_102", "BikerPro", vehicle="motorcycle")
    assert res2["status"] == "ok"
    assert roblox_race_mgr.racers["user_102"]["vehicle"] == "motorcycle"

    # Boost 1x, 5x, Turbo
    b1 = roblox_race_mgr.boost_racer("user_101", "SpeedDemon", multiplier=1)
    assert b1["status"] == "ok"

    t1 = roblox_race_mgr.boost_racer("user_101", "SpeedDemon", multiplier=8, turbo=True)
    assert t1["status"] == "ok"
    assert roblox_race_mgr.racers["user_101"]["turbo_active"] is True

    # Change vehicle (e.g. to ferrari, lamborghini, bugatti)
    cv = roblox_race_mgr.change_vehicle("user_101", "SpeedDemon", vehicle="ferrari")
    assert cv["status"] == "ok"
    assert cv["vehicle"] == "ferrari"
    assert roblox_race_mgr.racers["user_101"]["vehicle"] == "ferrari"

    # Rocket
    rk = roblox_race_mgr.fire_rocket("user_102", "BikerPro")
    assert rk["status"] == "ok"

    # Start race
    sr = roblox_race_mgr.start_race()
    assert sr["race_state"] == "racing"

    # Poll actions
    actions = roblox_race_mgr.poll_actions(since_id=0)
    assert len(actions) >= 5
    act_types = [a["action"] for a in actions]
    assert "spawn_racer" in act_types
    assert "boost" in act_types
    assert "change_vehicle" in act_types
    assert "fire_rocket" in act_types
    assert "start_race" in act_types
    print(f"  [OK] Successfully enqueued and polled {len(actions)} Roblox race actions.")

    # Check files exist
    assert os.path.exists("roblox/LiveRaceController.server.lua")
    assert os.path.exists("roblox/LiveRaceCamera.client.lua")
    assert os.path.exists("roblox/GenerateTrack.lua")
    assert os.path.exists("roblox/README.md")
    print("  [OK] Roblox Luau scripts and documentation confirmed present.")


def test_universal_adapter():
    print("\nTesting Universal Game Adapter Protocol...")
    from app.universal_adapter import universal_adapter

    caps = universal_adapter.get_capabilities()
    assert caps["protocol_version"] == "1.0.0"
    assert "JOIN_RACE" in caps["supported_actions"]
    assert "NITRO" in caps["supported_actions"]
    assert "ACCELERATE" in caps["supported_actions"]
    assert "SPAWN_OBSTACLE" in caps["supported_actions"]
    assert "SHIELD" in caps["supported_actions"]
    print("  [OK] Protocol version and capabilities validated.")

    # Test comment parsing
    a1 = universal_adapter.handle_tiktok_comment("u_1", "RacerOne", "", "ikut")
    assert a1 is not None
    assert a1["action"] == "JOIN_RACE"
    assert a1["nickname"] == "RacerOne"

    a2 = universal_adapter.handle_tiktok_comment("u_2", "RacerTwo", "", "!ferrari")
    assert a2 is not None
    assert a2["action"] == "JOIN_RACE"
    assert a2["meta"]["vehicle_choice"] == "ferrari"

    # Test gift parsing
    g1 = universal_adapter.handle_tiktok_gift("u_1", "RacerOne", "", "Rose", combo=5)
    assert g1 is not None
    assert g1["action"] == "ACCELERATE"
    assert g1["multiplier"] == 5

    g2 = universal_adapter.handle_tiktok_gift("u_2", "RacerTwo", "", "Doughnut", combo=1)
    assert g2 is not None
    assert g2["action"] == "NITRO"
    assert g2["multiplier"] == 8

    # Test state update
    st = universal_adapter.update_game_state({"state": "RACING", "active_participants": 2})
    assert st["state"] == "RACING"
    assert universal_adapter.game_state["active_participants"] == 2

    # Test action poll
    polled = universal_adapter.poll_actions(since_id=0)
    assert len(polled) >= 4
    print(f"  [OK] Universal action dispatcher, mapping, and polling confirmed ({len(polled)} actions).")


if __name__ == "__main__":
    test_direct_input()
    test_config()
    test_static_and_routes()
    test_profiles()
    test_roblox_race()
    test_universal_adapter()
    print("\nAll core tests passed successfully!")

