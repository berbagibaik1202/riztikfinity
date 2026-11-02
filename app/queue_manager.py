"""
Action Queue Manager and Executor.
Handles FIFO scheduling, combo multipliers, spam throttling, window auto-focus, and emergency stop.
"""

import asyncio
from dataclasses import dataclass
from datetime import datetime
import time
from typing import Any, Callable, Dict, List, Optional
from app import direct_input
from app.config import ActionRule, PressMode


@dataclass
class QueuedAction:
    rule_id: str
    target_key: str
    press_mode: PressMode
    duration: float
    repeats: int
    source_user: str
    source_trigger: str
    description: str
    timestamp: float = time.time()


class QueueManager:
    def __init__(
        self,
        max_queue_size: int = 50,
        require_roblox_focus: bool = False,
        auto_focus_roblox: bool = True,
    ):
        self.max_queue_size = max_queue_size
        self.require_roblox_focus = require_roblox_focus
        self.auto_focus_roblox = auto_focus_roblox
        self.queue: asyncio.Queue[QueuedAction] = asyncio.Queue(maxsize=max_queue_size)
        self.is_running: bool = False
        self.worker_task: Optional[asyncio.Task] = None
        self._cooldown_tracker: Dict[str, float] = {}
        self._log_listeners: List[Callable[[dict], Any]] = []
        self._is_emergency_stopped: bool = False

    def add_log_listener(self, callback: Callable[[dict], Any]) -> None:
        """Register a callback for live logs sent to WebSockets."""
        self._log_listeners.append(callback)

    async def broadcast_log(self, level: str, message: str, details: Optional[dict] = None) -> None:
        """Broadcast an event log to all registered listeners."""
        payload = {
            "time": datetime.now().strftime("%H:%M:%S"),
            "level": level,
            "message": message,
            "details": details or {},
        }
        for listener in self._log_listeners:
            try:
                res = listener(payload)
                if asyncio.iscoroutine(res):
                    await res
            except Exception:
                pass

    async def start(self) -> None:
        """Start the background queue processor worker."""
        if not self.is_running:
            self.is_running = True
            self._is_emergency_stopped = False
            self.worker_task = asyncio.create_task(self._worker_loop())
            await self.broadcast_log("INFO", "Action Queue worker started.")

    async def stop(self) -> None:
        """Stop the background queue processor worker."""
        self.is_running = False
        if self.worker_task and not self.worker_task.done():
            self.worker_task.cancel()
            try:
                await self.worker_task
            except asyncio.CancelledError:
                pass
        self.emergency_stop()

    def emergency_stop(self) -> None:
        """Immediately clear queue and release all pressed keys."""
        self._is_emergency_stopped = True
        # Drain queue
        while not self.queue.empty():
            try:
                self.queue.get_nowait()
                self.queue.task_done()
            except Exception:
                break
        # Force release all keys
        direct_input.release_all_keys()

    async def trigger_rule(
        self,
        rule: ActionRule,
        source_user: str,
        source_trigger: str,
        combo_count: int = 1,
    ) -> bool:
        """Evaluate rule cooldown and enqueue an action."""
        if self._is_emergency_stopped:
            return False

        if not rule.enabled:
            return False

        now = time.time()
        last_triggered = self._cooldown_tracker.get(rule.id, 0.0)
        if (now - last_triggered) < rule.cooldown_seconds:
            return False

        # Calculate duration or repeats based on multiplier
        effective_duration = max(0.08, rule.duration_seconds)
        repeats = 1

        if rule.multiplier_enabled and combo_count > 1:
            if rule.press_mode == PressMode.HOLD:
                effective_duration = min(rule.duration_seconds * combo_count, 5.0)
            elif rule.press_mode == PressMode.TAP:
                repeats = min(combo_count, 10)

        action = QueuedAction(
            rule_id=rule.id,
            target_key=rule.target_key,
            press_mode=rule.press_mode,
            duration=effective_duration,
            repeats=repeats,
            source_user=source_user,
            source_trigger=source_trigger,
            description=(
                f"{rule.press_mode.value.upper()} [{rule.target_key.upper()}] "
                f"for {effective_duration:.2f}s"
                + (f" (x{combo_count})" if combo_count > 1 else "")
            ),
        )

        try:
            self.queue.put_nowait(action)
            self._cooldown_tracker[rule.id] = now
            await self.broadcast_log(
                "INFO",
                f"Antrean masuk dari {source_user}: {action.description}",
                {"user": source_user, "trigger": source_trigger, "key": rule.target_key},
            )
            return True
        except asyncio.QueueFull:
            await self.broadcast_log(
                "WARNING",
                f"Batas antrean penuh ({self.max_queue_size}). Aksi dari {source_user} di-drop.",
            )
            return False

    async def _worker_loop(self) -> None:
        """Sequential FIFO consumer executing input actions."""
        while self.is_running:
            try:
                action = await self.queue.get()
            except asyncio.CancelledError:
                break

            try:
                if self._is_emergency_stopped:
                    self.queue.task_done()
                    continue

                # Auto-focus Roblox if enabled and Roblox is running
                if self.auto_focus_roblox:
                    if not direct_input.is_roblox_focused():
                        direct_input.focus_roblox()

                # Check strict focus if required
                if self.require_roblox_focus:
                    if not direct_input.is_roblox_focused():
                        # Try once more to focus
                        if not direct_input.focus_roblox() and not direct_input.is_roblox_focused():
                            active_title = direct_input.get_foreground_window_title()
                            await self.broadcast_log(
                                "WARNING",
                                f"Roblox tidak fokus (Jendela aktif: '{active_title[:30]}'). Aksi tombol [{action.target_key.upper()}] dilewati.",
                            )
                            self.queue.task_done()
                            continue

                # Execute action
                if action.press_mode == PressMode.TAP:
                    for _ in range(action.repeats):
                        if self._is_emergency_stopped:
                            break
                        direct_input.press_key(action.target_key)
                        await asyncio.sleep(action.duration)
                        direct_input.release_key(action.target_key)
                        await asyncio.sleep(0.05)
                else:  # HOLD
                    direct_input.press_key(action.target_key)
                    await asyncio.sleep(action.duration)
                    direct_input.release_key(action.target_key)

                await self.broadcast_log(
                    "ACTION",
                    f"Tombol [{action.target_key.upper()}] berhasil ditekan ({action.duration:.2f}s).",
                )

            except Exception as e:
                await self.broadcast_log("ERROR", f"Gagal mengeksekusi aksi: {e}")
                direct_input.release_all_keys()
            finally:
                self.queue.task_done()
