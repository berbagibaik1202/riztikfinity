"""
Configuration and Rule Data Models.
Manages loading, saving, and validating rules.json.
"""

from enum import Enum
import json
import os
from typing import List, Optional
from pydantic import BaseModel, Field

RULES_FILE_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "rules.json")


class TriggerType(str, Enum):
    GIFT = "gift"
    CHAT = "chat"
    LIKE = "like"


class PressMode(str, Enum):
    HOLD = "hold"
    TAP = "tap"


class ActionRule(BaseModel):
    id: str = Field(..., description="Unique ID for the rule")
    trigger_type: TriggerType = Field(TriggerType.GIFT, description="Type of trigger: gift, chat, or like")
    gift_name: Optional[str] = Field(None, description="Name of the TikTok gift (e.g. Rose, Doughnut)")
    chat_command: Optional[str] = Field(None, description="Chat text/command to match (e.g. !jump, !left)")
    like_count: Optional[int] = Field(None, description="Trigger on every N likes")
    target_key: str = Field(..., description="Target keyboard key (e.g. w, a, s, d, space, shift)")
    press_mode: PressMode = Field(PressMode.HOLD, description="hold or tap")
    duration_seconds: float = Field(0.3, ge=0.02, le=10.0, description="Duration in seconds")
    multiplier_enabled: bool = Field(True, description="Repeat or multiply duration by gift combo count")
    cooldown_seconds: float = Field(0.1, ge=0.0, le=10.0, description="Cooldown between triggers")
    enabled: bool = Field(True, description="Whether rule is active")


class AppConfig(BaseModel):
    tiktok_username: str = ""
    require_roblox_focus: bool = False
    auto_focus_roblox: bool = True
    max_queue_size: int = 50
    active_profile: str = "roblox_obby"
    # Overlay & TTS Features
    tts_enabled: bool = True
    tts_volume: float = 1.0
    tts_speed: float = 1.0
    tts_template: str = "{nickname} berkata: {comment}"
    overlay_walking_characters: bool = True
    overlay_gift_balloons: bool = True
    overlay_like_hearts: bool = True
    rules: List[ActionRule] = []


DEFAULT_RULES: List[dict] = [
    {
        "id": "rule_rose_forward",
        "trigger_type": "gift",
        "gift_name": "Rose",
        "target_key": "w",
        "press_mode": "hold",
        "duration_seconds": 0.4,
        "multiplier_enabled": True,
        "cooldown_seconds": 0.1,
        "enabled": True,
    },
    {
        "id": "rule_doughnut_jump",
        "trigger_type": "gift",
        "gift_name": "Doughnut",
        "target_key": "space",
        "press_mode": "tap",
        "duration_seconds": 0.1,
        "multiplier_enabled": False,
        "cooldown_seconds": 0.3,
        "enabled": True,
    },
    {
        "id": "rule_chat_jump",
        "trigger_type": "chat",
        "chat_command": "!jump",
        "target_key": "space",
        "press_mode": "tap",
        "duration_seconds": 0.1,
        "multiplier_enabled": False,
        "cooldown_seconds": 0.5,
        "enabled": True,
    },
    {
        "id": "rule_chat_left",
        "trigger_type": "chat",
        "chat_command": "!kiri",
        "target_key": "a",
        "press_mode": "hold",
        "duration_seconds": 0.5,
        "multiplier_enabled": False,
        "cooldown_seconds": 0.2,
        "enabled": True,
    },
    {
        "id": "rule_chat_right",
        "trigger_type": "chat",
        "chat_command": "!kanan",
        "target_key": "d",
        "press_mode": "hold",
        "duration_seconds": 0.5,
        "multiplier_enabled": False,
        "cooldown_seconds": 0.2,
        "enabled": True,
    },
    {
        "id": "rule_like_forward",
        "trigger_type": "like",
        "like_count": 5,
        "target_key": "w",
        "press_mode": "hold",
        "duration_seconds": 0.4,
        "multiplier_enabled": True,
        "cooldown_seconds": 0.1,
        "enabled": True,
    },
]


def load_config() -> AppConfig:
    """Load config from rules.json or create default if not exists."""
    if not os.path.exists(RULES_FILE_PATH):
        cfg = AppConfig(
            tiktok_username="",
            require_roblox_focus=False,
            auto_focus_roblox=True,
            max_queue_size=50,
            tts_enabled=True,
            tts_volume=1.0,
            tts_speed=1.0,
            tts_template="{nickname} berkata: {comment}",
            overlay_walking_characters=True,
            overlay_gift_balloons=True,
            overlay_like_hearts=True,
            rules=[ActionRule(**r) for r in DEFAULT_RULES],
        )
        save_config(cfg)
        return cfg

    try:
        with open(RULES_FILE_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            return AppConfig(**data)
    except Exception as e:
        print(f"Error loading {RULES_FILE_PATH}: {e}, using defaults")
        return AppConfig(
            tiktok_username="",
            require_roblox_focus=False,
            auto_focus_roblox=True,
            max_queue_size=50,
            tts_enabled=True,
            tts_volume=1.0,
            tts_speed=1.0,
            tts_template="{nickname} berkata: {comment}",
            overlay_walking_characters=True,
            overlay_gift_balloons=True,
            overlay_like_hearts=True,
            rules=[ActionRule(**r) for r in DEFAULT_RULES],
        )


def save_config(config: AppConfig) -> None:
    """Save config to rules.json."""
    with open(RULES_FILE_PATH, "w", encoding="utf-8") as f:
        json.dump(config.model_dump(), f, indent=2)
