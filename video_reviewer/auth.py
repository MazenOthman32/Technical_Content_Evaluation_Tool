"""Local auth with hashed passwords and per-user API keys."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import threading
from pathlib import Path
from typing import Any, Optional

USERS_PATH = Path("data/users.json")
SESSIONS: dict[str, dict[str, Any]] = {}
_lock = threading.Lock()

DEFAULT_USERS = [
    {
        "username": "mazen",
        "email": "MazenOthman320@gmail.com",
        "password": os.getenv("SUPER_ADMIN_PASSWORD", ""),
        "role": "super_admin",
        "name": "Mazen Othman",
    },
    {
        "username": "admin",
        "email": "admin@instantplus.com",
        "password": "admin123",
        "role": "admin",
        "name": "Admin",
    },
    {
        "username": "reviewer",
        "email": "reviewer@instantplus.com",
        "password": "reviewer123",
        "role": "reviewer",
        "name": "Content Reviewer",
    },
]

DEFAULT_PREFS = {
    "anthropic_api_key": "",
    "groq_api_key": "",
    "openai_api_key": "",
    "llm_provider": "groq",
    "llm_model": "openai/gpt-oss-120b",
    "max_cost": None,
    "whisper_model": "auto",
}


def _hash_password(password: str, salt: Optional[str] = None) -> tuple[str, str]:
    """PBKDF2-HMAC-SHA256 (120k iters). Compatible stand-in when bcrypt isn't installed."""
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000)
    return salt, digest.hex()


def _verify(password: str, salt: str, password_hash: str) -> bool:
    if password_hash.startswith("$2"):
        try:
            import bcrypt  # type: ignore

            return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
        except Exception:
            return False
    _, digest = _hash_password(password, salt)
    return hmac.compare_digest(digest, password_hash)


def _public_user(user: dict[str, Any]) -> dict[str, Any]:
    return {
        "username": user["username"],
        "email": user.get("email"),
        "name": user.get("name") or user["username"],
        "role": user.get("role") or "reviewer",
    }


def _seed_settings() -> dict[str, Any]:
    settings = dict(DEFAULT_PREFS)
    settings["anthropic_api_key"] = os.getenv("ANTHROPIC_API_KEY", "") or ""
    settings["groq_api_key"] = os.getenv("GROQ_API_KEY", "") or ""
    settings["openai_api_key"] = os.getenv("OPENAI_API_KEY", "") or ""
    if settings["groq_api_key"]:
        settings["llm_provider"] = "groq"
    elif settings["anthropic_api_key"]:
        settings["llm_provider"] = "anthropic"
        settings["llm_model"] = "claude-sonnet-5-5"
    elif settings["openai_api_key"]:
        settings["llm_provider"] = "openai"
        settings["llm_model"] = "gpt-4.1"
    return settings


def ensure_users_file() -> None:
    USERS_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not USERS_PATH.exists():
        users = []
        for u in DEFAULT_USERS:
            if not u.get("password"):
                continue
            salt, pw_hash = _hash_password(u["password"])
            prefs = _seed_settings() if u["role"] in {"super_admin", "admin"} else dict(DEFAULT_PREFS)
            users.append(
                {
                    "username": u["username"],
                    "email": u.get("email"),
                    "name": u["name"],
                    "role": u["role"],
                    "salt": salt,
                    "password_hash": pw_hash,
                    "settings": prefs,
                }
            )
        USERS_PATH.write_text(json.dumps(users, ensure_ascii=False, indent=2), encoding="utf-8")
        return

    users = json.loads(USERS_PATH.read_text(encoding="utf-8"))
    changed = False
    existing = {u.get("username", "").lower() for u in users}
    for seed in DEFAULT_USERS:
        if seed["username"].lower() in existing or not seed.get("password"):
            continue
        salt, pw_hash = _hash_password(seed["password"])
        prefs = _seed_settings() if seed["role"] in {"super_admin", "admin"} else dict(DEFAULT_PREFS)
        users.append(
            {
                "username": seed["username"],
                "email": seed.get("email"),
                "name": seed["name"],
                "role": seed["role"],
                "salt": salt,
                "password_hash": pw_hash,
                "settings": prefs,
            }
        )
        changed = True

    for u in users:
        if "settings" not in u or not isinstance(u.get("settings"), dict):
            u["settings"] = dict(DEFAULT_PREFS)
            changed = True
        else:
            for k, v in DEFAULT_PREFS.items():
                if k not in u["settings"]:
                    u["settings"][k] = v
                    changed = True
        if u.get("role") == "super_admin":
            for key_name in ("anthropic_api_key", "groq_api_key", "openai_api_key"):
                env_map = {
                    "anthropic_api_key": "ANTHROPIC_API_KEY",
                    "groq_api_key": "GROQ_API_KEY",
                    "openai_api_key": "OPENAI_API_KEY",
                }
                if not (u["settings"].get(key_name) or "").strip():
                    env_val = os.getenv(env_map[key_name], "") or ""
                    if env_val:
                        u["settings"][key_name] = env_val
                        changed = True
    if changed:
        USERS_PATH.write_text(json.dumps(users, ensure_ascii=False, indent=2), encoding="utf-8")


def load_users() -> list[dict[str, Any]]:
    ensure_users_file()
    with _lock:
        return json.loads(USERS_PATH.read_text(encoding="utf-8"))


def _save_users(users: list[dict[str, Any]]) -> None:
    USERS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _lock:
        USERS_PATH.write_text(json.dumps(users, ensure_ascii=False, indent=2), encoding="utf-8")


def get_user_record(username: str) -> Optional[dict[str, Any]]:
    needle = (username or "").strip().lower()
    for user in load_users():
        if user.get("username", "").lower() == needle or (user.get("email") or "").lower() == needle:
            return user
    return None


def authenticate(username: str, password: str) -> Optional[dict[str, Any]]:
    user = get_user_record(username)
    if not user:
        return None
    if _verify(password, user.get("salt") or "", user["password_hash"]):
        return _public_user(user)
    return None


def get_user_settings(username: str) -> dict[str, Any]:
    user = get_user_record(username)
    if not user:
        return dict(DEFAULT_PREFS)
    settings = dict(DEFAULT_PREFS)
    settings.update(user.get("settings") or {})
    return settings


def update_user_settings(username: str, updates: dict[str, Any]) -> dict[str, Any]:
    users = load_users()
    found = False
    for user in users:
        if user.get("username", "").lower() != username.lower() and (user.get("email") or "").lower() != username.lower():
            continue
        settings = dict(DEFAULT_PREFS)
        settings.update(user.get("settings") or {})
        for key, value in updates.items():
            if key not in DEFAULT_PREFS:
                continue
            if key in {"anthropic_api_key", "groq_api_key", "openai_api_key"}:
                if value is None:
                    continue
                text = str(value).strip()
                if text:
                    settings[key] = text
                continue
            settings[key] = value
        user["settings"] = settings
        found = True
        break
    if not found:
        raise ValueError("المستخدم غير موجود")
    _save_users(users)
    return get_user_settings(username)


def get_user_api_key(username: str, provider: str) -> Optional[str]:
    settings = get_user_settings(username)
    key_name = {
        "anthropic": "anthropic_api_key",
        "groq": "groq_api_key",
        "openai": "openai_api_key",
    }.get(provider, "groq_api_key")
    key = (settings.get(key_name) or "").strip()
    if key:
        return key
    env_name = {
        "anthropic": "ANTHROPIC_API_KEY",
        "groq": "GROQ_API_KEY",
        "openai": "OPENAI_API_KEY",
    }.get(provider, "GROQ_API_KEY")
    return os.getenv(env_name) or None


def create_session(user: dict[str, Any]) -> str:
    token = secrets.token_urlsafe(32)
    SESSIONS[token] = dict(user)
    return token


def get_session_user(token: Optional[str]) -> Optional[dict[str, Any]]:
    if not token:
        return None
    return SESSIONS.get(token)


def destroy_session(token: Optional[str]) -> None:
    if token and token in SESSIONS:
        del SESSIONS[token]


def cookie_secure() -> bool:
    return os.getenv("COOKIE_SECURE", "").lower() in {"1", "true", "yes"}
