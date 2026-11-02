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

if __name__ == "__main__":
    test_direct_input()
    test_config()
    print("\nAll core tests passed successfully!")

