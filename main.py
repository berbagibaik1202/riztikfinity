"""
TikTok Live Game Controller - Main Entrypoint.
Starts the FastAPI server and listens for global panic hotkey (Ctrl + Shift + Q).
"""

import ctypes
import os
import sys
import threading
import time
import uvicorn

from app import direct_input
from app.server import queue_mgr

# Win32 Virtual Key Codes for Global Panic Hotkey
VK_CONTROL = 0x11
VK_SHIFT = 0x10
VK_Q = 0x51


def global_hotkey_listener():
    """
    Background worker detecting global emergency panic shortcut (Ctrl + Shift + Q).
    Runs with zero external C-dependencies using Win32 GetAsyncKeyState.
    """
    user32 = ctypes.windll.user32
    while True:
        try:
            ctrl_pressed = (user32.GetAsyncKeyState(VK_CONTROL) & 0x8000) != 0
            shift_pressed = (user32.GetAsyncKeyState(VK_SHIFT) & 0x8000) != 0
            q_pressed = (user32.GetAsyncKeyState(VK_Q) & 0x8000) != 0

            if ctrl_pressed and shift_pressed and q_pressed:
                print("\n[EMERGENCY STOP] Hotkey Ctrl+Shift+Q detected! Draining queue and releasing keys...")
                queue_mgr.emergency_stop()
                time.sleep(1.0)
        except Exception:
            pass
        time.sleep(0.05)


def print_banner():
    is_admin_mode = direct_input.is_admin()
    banner = f"""
======================================================================
  TikTok Live Game Controller & OBS Interactive Overlay
======================================================================
  * Web Dashboard  : http://localhost:8000 atau http://127.0.0.1:8000
  * OBS Overlay    : http://localhost:8000/overlay (Karakter & Balon)
  * OBS Comment Box: http://localhost:8000/comments (Daftar Chat Live)
  * Status         : Ready & Listening (0.0.0.0:8000)
  * Administrator  : {'[OK] Admin Mode Active' if is_admin_mode else '[WARNING] NOT running as Administrator!'}
  * Panic Shortcut : Ctrl + Shift + Q (Emergency Stop)
======================================================================
"""
    print(banner)
    if not is_admin_mode:
        print("[TIPS] Untuk menjamin input masuk ke Roblox tanpa diblokir OS:")
        print("       Disarankan menjalankan terminal/cmd ini dengan 'Run as Administrator'.\n")


def main():
    print_banner()

    # Start emergency hotkey thread
    hotkey_thread = threading.Thread(target=global_hotkey_listener, daemon=True)
    hotkey_thread.start()

    # Run FastAPI web server binding to 0.0.0.0 so OBS CEF IPv4 and IPv6 localhost both work
    uvicorn.run(
        "app.server:app",
        host="0.0.0.0",
        port=8000,
        log_level="info",
        reload=False,
    )


if __name__ == "__main__":
    main()
