"""
Game Profile Preset Manager.
Manages multiple game rule configurations (e.g. Roblox Obby, Roblox Driving, Minecraft).
Enables streamers to quickly switch game profiles without reconfiguring rules.
"""

import json
import os
import re
from typing import List, Optional, Tuple
from pydantic import BaseModel, Field

from app.config import ActionRule, PressMode, TriggerType

PROFILES_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "profiles")


class GameProfile(BaseModel):
    id: str = Field(..., description="Unique slug ID (e.g. roblox_obby, roblox_driving)")
    name: str = Field(..., description="Display name for the profile")
    description: str = Field("", description="Brief description of the game profile")
    game_name: str = Field("Roblox", description="Target game (e.g. Roblox Obby, Minecraft)")
    is_builtin: bool = Field(False, description="Whether this is a protected built-in preset")
    rules: List[ActionRule] = Field(default_factory=list, description="List of action rules for this game")


# Built-in High Quality Game Presets
BUILTIN_PRESETS: List[dict] = [
    {
        "id": "roblox_obby",
        "name": "Roblox Obby (Parkour)",
        "description": "Tantangan parkour rintangan Roblox: Mawar maju, Donat lompat, Paus mundur/bahaya.",
        "game_name": "Roblox Obby",
        "is_builtin": True,
        "rules": [
            {
                "id": "obby_rose_forward",
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
                "id": "obby_doughnut_jump",
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
                "id": "obby_icecream_left",
                "trigger_type": "gift",
                "gift_name": "Ice Cream",
                "target_key": "a",
                "press_mode": "hold",
                "duration_seconds": 0.4,
                "multiplier_enabled": True,
                "cooldown_seconds": 0.2,
                "enabled": True,
            },
            {
                "id": "obby_heart_right",
                "trigger_type": "gift",
                "gift_name": "Finger Heart",
                "target_key": "d",
                "press_mode": "hold",
                "duration_seconds": 0.4,
                "multiplier_enabled": True,
                "cooldown_seconds": 0.2,
                "enabled": True,
            },
            {
                "id": "obby_whale_backward",
                "trigger_type": "gift",
                "gift_name": "Whale",
                "target_key": "s",
                "press_mode": "hold",
                "duration_seconds": 1.2,
                "multiplier_enabled": False,
                "cooldown_seconds": 1.0,
                "enabled": True,
            },
            {
                "id": "obby_chat_jump",
                "trigger_type": "chat",
                "chat_command": "!lompat",
                "target_key": "space",
                "press_mode": "tap",
                "duration_seconds": 0.1,
                "multiplier_enabled": False,
                "cooldown_seconds": 0.4,
                "enabled": True,
            },
            {
                "id": "obby_chat_forward",
                "trigger_type": "chat",
                "chat_command": "!maju",
                "target_key": "w",
                "press_mode": "hold",
                "duration_seconds": 0.5,
                "multiplier_enabled": False,
                "cooldown_seconds": 0.3,
                "enabled": True,
            },
            {
                "id": "obby_like_forward",
                "trigger_type": "like",
                "like_count": 10,
                "target_key": "w",
                "press_mode": "hold",
                "duration_seconds": 0.3,
                "multiplier_enabled": True,
                "cooldown_seconds": 0.1,
                "enabled": True,
            },
        ],
    },
    {
        "id": "roblox_driving",
        "name": "Roblox Driving (Balapan Mobil)",
        "description": "Kendali mobil balap: W gas maju, S rem/mundur, Space rem tangan, H klakson.",
        "game_name": "Roblox Driving",
        "is_builtin": True,
        "rules": [
            {
                "id": "drive_rose_gas",
                "trigger_type": "gift",
                "gift_name": "Rose",
                "target_key": "w",
                "press_mode": "hold",
                "duration_seconds": 0.8,
                "multiplier_enabled": True,
                "cooldown_seconds": 0.1,
                "enabled": True,
            },
            {
                "id": "drive_doughnut_handbrake",
                "trigger_type": "gift",
                "gift_name": "Doughnut",
                "target_key": "space",
                "press_mode": "hold",
                "duration_seconds": 0.6,
                "multiplier_enabled": False,
                "cooldown_seconds": 0.5,
                "enabled": True,
            },
            {
                "id": "drive_icecream_reverse",
                "trigger_type": "gift",
                "gift_name": "Ice Cream",
                "target_key": "s",
                "press_mode": "hold",
                "duration_seconds": 0.8,
                "multiplier_enabled": True,
                "cooldown_seconds": 0.3,
                "enabled": True,
            },
            {
                "id": "drive_heart_horn",
                "trigger_type": "gift",
                "gift_name": "Finger Heart",
                "target_key": "h",
                "press_mode": "tap",
                "duration_seconds": 0.2,
                "multiplier_enabled": True,
                "cooldown_seconds": 0.2,
                "enabled": True,
            },
            {
                "id": "drive_chat_left",
                "trigger_type": "chat",
                "chat_command": "!kiri",
                "target_key": "a",
                "press_mode": "hold",
                "duration_seconds": 0.6,
                "multiplier_enabled": False,
                "cooldown_seconds": 0.2,
                "enabled": True,
            },
            {
                "id": "drive_chat_right",
                "trigger_type": "chat",
                "chat_command": "!kanan",
                "target_key": "d",
                "press_mode": "hold",
                "duration_seconds": 0.6,
                "multiplier_enabled": False,
                "cooldown_seconds": 0.2,
                "enabled": True,
            },
            {
                "id": "drive_chat_gas",
                "trigger_type": "chat",
                "chat_command": "!gas",
                "target_key": "w",
                "press_mode": "hold",
                "duration_seconds": 1.2,
                "multiplier_enabled": False,
                "cooldown_seconds": 0.5,
                "enabled": True,
            },
            {
                "id": "drive_like_gas",
                "trigger_type": "like",
                "like_count": 15,
                "target_key": "w",
                "press_mode": "hold",
                "duration_seconds": 0.4,
                "multiplier_enabled": True,
                "cooldown_seconds": 0.1,
                "enabled": True,
            },
        ],
    },
    {
        "id": "minecraft_survival",
        "name": "Minecraft Survival & Adventure",
        "description": "Tantangan Minecraft: Mawar maju, Donat lompat, Shift sneak, E inventory, Q buang barang.",
        "game_name": "Minecraft",
        "is_builtin": True,
        "rules": [
            {
                "id": "mc_rose_forward",
                "trigger_type": "gift",
                "gift_name": "Rose",
                "target_key": "w",
                "press_mode": "hold",
                "duration_seconds": 0.5,
                "multiplier_enabled": True,
                "cooldown_seconds": 0.1,
                "enabled": True,
            },
            {
                "id": "mc_doughnut_jump",
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
                "id": "mc_icecream_sneak",
                "trigger_type": "gift",
                "gift_name": "Ice Cream",
                "target_key": "shift",
                "press_mode": "hold",
                "duration_seconds": 1.0,
                "multiplier_enabled": False,
                "cooldown_seconds": 0.5,
                "enabled": True,
            },
            {
                "id": "mc_whale_drop",
                "trigger_type": "gift",
                "gift_name": "Whale",
                "target_key": "q",
                "press_mode": "tap",
                "duration_seconds": 0.1,
                "multiplier_enabled": True,
                "cooldown_seconds": 1.0,
                "enabled": True,
            },
            {
                "id": "mc_chat_jump",
                "trigger_type": "chat",
                "chat_command": "!lompat",
                "target_key": "space",
                "press_mode": "tap",
                "duration_seconds": 0.1,
                "multiplier_enabled": False,
                "cooldown_seconds": 0.3,
                "enabled": True,
            },
            {
                "id": "mc_chat_inv",
                "trigger_type": "chat",
                "chat_command": "!tas",
                "target_key": "e",
                "press_mode": "tap",
                "duration_seconds": 0.1,
                "multiplier_enabled": False,
                "cooldown_seconds": 0.5,
                "enabled": True,
            },
            {
                "id": "mc_like_forward",
                "trigger_type": "like",
                "like_count": 10,
                "target_key": "w",
                "press_mode": "hold",
                "duration_seconds": 0.4,
                "multiplier_enabled": True,
                "cooldown_seconds": 0.1,
                "enabled": True,
            },
        ],
    },
    {
        "id": "roblox_tower",
        "name": "Roblox Tower of Hell (Hardcore)",
        "description": "Tantangan menara maut kecepatan tinggi: Mawar lompat terus, Donat lari, Paus mundur jatuh.",
        "game_name": "Roblox Tower",
        "is_builtin": True,
        "rules": [
            {
                "id": "tower_rose_jump",
                "trigger_type": "gift",
                "gift_name": "Rose",
                "target_key": "space",
                "press_mode": "tap",
                "duration_seconds": 0.1,
                "multiplier_enabled": True,
                "cooldown_seconds": 0.1,
                "enabled": True,
            },
            {
                "id": "tower_doughnut_sprint",
                "trigger_type": "gift",
                "gift_name": "Doughnut",
                "target_key": "w",
                "press_mode": "hold",
                "duration_seconds": 0.8,
                "multiplier_enabled": True,
                "cooldown_seconds": 0.2,
                "enabled": True,
            },
            {
                "id": "tower_whale_fall",
                "trigger_type": "gift",
                "gift_name": "Whale",
                "target_key": "s",
                "press_mode": "hold",
                "duration_seconds": 1.5,
                "multiplier_enabled": False,
                "cooldown_seconds": 1.0,
                "enabled": True,
            },
            {
                "id": "tower_chat_jump",
                "trigger_type": "chat",
                "chat_command": "!lompat",
                "target_key": "space",
                "press_mode": "tap",
                "duration_seconds": 0.1,
                "multiplier_enabled": False,
                "cooldown_seconds": 0.3,
                "enabled": True,
            },
            {
                "id": "tower_chat_fall",
                "trigger_type": "chat",
                "chat_command": "!jatuh",
                "target_key": "s",
                "press_mode": "hold",
                "duration_seconds": 1.0,
                "multiplier_enabled": False,
                "cooldown_seconds": 0.8,
                "enabled": True,
            },
            {
                "id": "tower_like_jump",
                "trigger_type": "like",
                "like_count": 10,
                "target_key": "space",
                "press_mode": "tap",
                "duration_seconds": 0.1,
                "multiplier_enabled": True,
                "cooldown_seconds": 0.1,
                "enabled": True,
            },
        ],
    },
]


def sanitize_profile_id(raw_id: str) -> str:
    """Clean string into safe slug filename (lowercase, letters, numbers, underscores)."""
    clean = re.sub(r"[^a-zA-Z0-9_]+", "_", raw_id.strip().lower())
    clean = re.sub(r"_+", "_", clean).strip("_")
    return clean or f"profile_{int(os.times().system * 100)}"


class ProfileManager:
    """Handles storage, listing, and activation of game profiles."""

    def __init__(self, profiles_dir: str = PROFILES_DIR):
        self.profiles_dir = profiles_dir
        self.ensure_profiles_dir()

    def ensure_profiles_dir(self) -> None:
        """Create profiles/ folder and populate built-in presets if missing."""
        os.makedirs(self.profiles_dir, exist_ok=True)
        for preset_dict in BUILTIN_PRESETS:
            preset_file = os.path.join(self.profiles_dir, f"{preset_dict['id']}.json")
            if not os.path.exists(preset_file):
                try:
                    profile = GameProfile(**preset_dict)
                    with open(preset_file, "w", encoding="utf-8") as f:
                        json.dump(profile.model_dump(), f, indent=2)
                except Exception as e:
                    print(f"Error seeding preset {preset_dict['id']}: {e}")

    def list_profiles(self, active_profile_id: str = "roblox_obby") -> List[dict]:
        """List all available profiles with summary metadata and active status."""
        self.ensure_profiles_dir()
        result = []

        # Read all json files in profiles_dir
        for fname in sorted(os.listdir(self.profiles_dir)):
            if not fname.endswith(".json"):
                continue
            fpath = os.path.join(self.profiles_dir, fname)
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    prof_id = data.get("id") or os.path.splitext(fname)[0]
                    result.append({
                        "id": prof_id,
                        "name": data.get("name", prof_id.replace("_", " ").title()),
                        "game_name": data.get("game_name", "Roblox"),
                        "description": data.get("description", ""),
                        "is_builtin": bool(data.get("is_builtin", False)),
                        "rules_count": len(data.get("rules", [])),
                        "is_active": prof_id == active_profile_id,
                    })
            except Exception as e:
                print(f"Error reading profile {fname}: {e}")

        # If list is empty for any reason, reseed
        if not result:
            self.ensure_profiles_dir()
            return self.list_profiles(active_profile_id)

        return result

    def get_profile(self, profile_id: str) -> Optional[GameProfile]:
        """Load a profile by its ID."""
        safe_id = sanitize_profile_id(profile_id)
        fpath = os.path.join(self.profiles_dir, f"{safe_id}.json")
        if not os.path.exists(fpath):
            return None
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                data = json.load(f)
                return GameProfile(**data)
        except Exception as e:
            print(f"Error loading profile {safe_id}: {e}")
            return None

    def save_profile(self, profile: GameProfile) -> bool:
        """Save or update a profile JSON file."""
        safe_id = sanitize_profile_id(profile.id)
        profile.id = safe_id
        fpath = os.path.join(self.profiles_dir, f"{safe_id}.json")
        try:
            with open(fpath, "w", encoding="utf-8") as f:
                json.dump(profile.model_dump(), f, indent=2)
            return True
        except Exception as e:
            print(f"Error saving profile {safe_id}: {e}")
            return False

    def delete_profile(self, profile_id: str, active_profile_id: str) -> Tuple[bool, str]:
        """Delete a profile file with safety guards."""
        safe_id = sanitize_profile_id(profile_id)
        if safe_id == active_profile_id:
            return False, "Tidak dapat menghapus profil yang sedang aktif. Silakan pilih profil lain terlebih dahulu."

        fpath = os.path.join(self.profiles_dir, f"{safe_id}.json")
        if not os.path.exists(fpath):
            return False, f"Profil {safe_id} tidak ditemukan."

        try:
            # Check if builtin
            with open(fpath, "r", encoding="utf-8") as f:
                data = json.load(f)
                if data.get("is_builtin", False):
                    # Instead of blocking, we allow deletion by resetting it to default
                    pass

            os.remove(fpath)
            return True, f"Profil '{safe_id}' berhasil dihapus."
        except Exception as e:
            return False, f"Gagal menghapus profil: {e}"

    def duplicate_profile(self, source_id: str, new_id: str, new_name: str) -> Optional[GameProfile]:
        """Clone an existing profile with a new ID and name."""
        source = self.get_profile(source_id)
        if not source:
            return None

        clean_new_id = sanitize_profile_id(new_id)
        new_profile = GameProfile(
            id=clean_new_id,
            name=new_name.strip() or f"{source.name} (Copy)",
            description=f"Salinan dari {source.name}",
            game_name=source.game_name,
            is_builtin=False,
            rules=[r.model_copy() for r in source.rules],
        )
        if self.save_profile(new_profile):
            return new_profile
        return None

    def import_profile(self, data: dict) -> Tuple[Optional[GameProfile], str]:
        """Import profile from parsed JSON dictionary."""
        try:
            raw_id = data.get("id") or data.get("name", "custom_imported")
            safe_id = sanitize_profile_id(raw_id)
            name = data.get("name") or safe_id.replace("_", " ").title()
            desc = data.get("description", "Profil yang diimpor")
            game = data.get("game_name", "Roblox")
            raw_rules = data.get("rules", [])

            parsed_rules = []
            for r in raw_rules:
                try:
                    parsed_rules.append(ActionRule(**r))
                except Exception:
                    pass

            profile = GameProfile(
                id=safe_id,
                name=name,
                description=desc,
                game_name=game,
                is_builtin=False,
                rules=parsed_rules,
            )
            if self.save_profile(profile):
                return profile, "Profil berhasil diimpor!"
            return None, "Gagal menyimpan file profil yang diimpor."
        except Exception as e:
            return None, f"Format JSON profil tidak valid: {e}"


# Singleton instance
profile_mgr = ProfileManager()
