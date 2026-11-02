"""
DirectInput Keyboard Simulator for Windows & Roblox Engine.
Powered by PyDirectInput with Win32 window focus & scancode management.
"""

import ctypes
from ctypes import wintypes
import time
from typing import Optional, Set, Tuple
import pydirectinput

# Configure pydirectinput for zero delay and no failsafe crash
pydirectinput.PAUSE = 0.0
pydirectinput.FAILSAFE = False

# Track keys currently pressed down to safely release them on emergency stop
_CURRENTLY_PRESSED_KEYS: Set[str] = set()


def is_admin() -> bool:
    """Check if the current process is running with Administrator privileges."""
    try:
        return ctypes.windll.shell32.IsUserAnAdmin() != 0
    except Exception:
        return False


def get_foreground_window_title() -> str:
    """Return the title of the current foreground active window."""
    try:
        hwnd = ctypes.windll.user32.GetForegroundWindow()
        length = ctypes.windll.user32.GetWindowTextLengthW(hwnd)
        if length > 0:
            buff = ctypes.create_unicode_buffer(length + 1)
            ctypes.windll.user32.GetWindowTextW(hwnd, buff, length + 1)
            return buff.value
        return ""
    except Exception:
        return ""


def find_roblox_window() -> Optional[int]:
    """Find the HWND of the Roblox Player window if running."""
    roblox_hwnd = None

    def enum_proc(hwnd, lParam):
        nonlocal roblox_hwnd
        if ctypes.windll.user32.IsWindowVisible(hwnd):
            # Check window title
            length = ctypes.windll.user32.GetWindowTextLengthW(hwnd)
            title = ""
            if length > 0:
                buff = ctypes.create_unicode_buffer(length + 1)
                ctypes.windll.user32.GetWindowTextW(hwnd, buff, length + 1)
                title = buff.value.lower()

            # Check window class name (Roblox Client uses 'WINDOWSCLIENT')
            class_buff = ctypes.create_unicode_buffer(256)
            ctypes.windll.user32.GetClassNameW(hwnd, class_buff, 256)
            class_name = class_buff.value.lower()

            if "roblox" in title or "windowsclient" in class_name:
                roblox_hwnd = hwnd
                return False  # Stop enumeration
        return True

    EnumWindowsProc = ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)
    ctypes.windll.user32.EnumWindows(EnumWindowsProc(enum_proc), 0)
    return roblox_hwnd


def is_roblox_focused() -> bool:
    """Check if Roblox is currently the active foreground window."""
    try:
        hwnd = ctypes.windll.user32.GetForegroundWindow()
        if not hwnd:
            return False

        length = ctypes.windll.user32.GetWindowTextLengthW(hwnd)
        title = ""
        if length > 0:
            buff = ctypes.create_unicode_buffer(length + 1)
            ctypes.windll.user32.GetWindowTextW(hwnd, buff, length + 1)
            title = buff.value.lower()

        class_buff = ctypes.create_unicode_buffer(256)
        ctypes.windll.user32.GetClassNameW(hwnd, class_buff, 256)
        class_name = class_buff.value.lower()

        return "roblox" in title or "windowsclient" in class_name
    except Exception:
        return False


def focus_roblox() -> bool:
    """
    Bring Roblox window to the foreground so it receives keyboard input.
    Uses Win32 SetForegroundWindow with Windows focus-lock bypass.
    """
    hwnd = find_roblox_window()
    if not hwnd:
        return False

    try:
        user32 = ctypes.windll.user32
        # Restore if minimized (SW_RESTORE = 9)
        user32.ShowWindow(hwnd, 9)

        # Bypass Windows focus stealing prevention using simulated ALT tap
        user32.keybd_event(0x12, 0, 0, 0)  # ALT down
        user32.SetForegroundWindow(hwnd)
        user32.keybd_event(0x12, 0, 2, 0)  # ALT up
        time.sleep(0.05)
        return True
    except Exception:
        return False


def resolve_scancode(key_name: str) -> Tuple[Optional[int], bool]:
    """Resolve key name to DirectInput scancode via pydirectinput mapping."""
    key = key_name.strip().lower()
    code = pydirectinput.KEYBOARD_MAPPING.get(key)
    if code is not None:
        is_extended = key in ["up", "left", "down", "right"] or code > 255
        return code, is_extended
    return None, False


def press_key(key_name: str) -> bool:
    """Press down a key using DirectInput scancode."""
    key = key_name.strip().lower()
    try:
        if key in pydirectinput.KEYBOARD_MAPPING:
            pydirectinput.keyDown(key)
            _CURRENTLY_PRESSED_KEYS.add(key)
            return True
    except Exception as e:
        print(f"Error pressing {key}: {e}")
    return False


def release_key(key_name: str) -> bool:
    """Release a key using DirectInput scancode."""
    key = key_name.strip().lower()
    try:
        if key in pydirectinput.KEYBOARD_MAPPING:
            pydirectinput.keyUp(key)
            _CURRENTLY_PRESSED_KEYS.discard(key)
            return True
    except Exception as e:
        print(f"Error releasing {key}: {e}")
    return False


def tap_key(key_name: str, duration: float = 0.1) -> bool:
    """Tap a key (press, wait, release)."""
    key = key_name.strip().lower()
    if press_key(key):
        time.sleep(max(0.05, duration))
        return release_key(key)
    return False


def release_all_keys() -> None:
    """Emergency stop: release all recorded pressed keys."""
    for key in list(_CURRENTLY_PRESSED_KEYS):
        try:
            pydirectinput.keyUp(key)
        except Exception:
            pass
    _CURRENTLY_PRESSED_KEYS.clear()
