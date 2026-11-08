"""Supabase helpers for auth verification and per-user settings."""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Any, Optional


def supabase_enabled() -> bool:
    return bool(os.getenv("SUPABASE_URL") and (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")))


@lru_cache(maxsize=1)
def get_supabase():
    from supabase import create_client

    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL / keys غير مضبوطة")
    return create_client(url, key)


def verify_access_token(token: str) -> Optional[dict[str, Any]]:
    if not token:
        return None
    try:
        client = get_supabase()
        user_resp = client.auth.get_user(token)
        user = user_resp.user
        if not user:
            return None
        profile = (
            client.table("profiles")
            .select("username,full_name,role")
            .eq("id", user.id)
            .limit(1)
            .execute()
        )
        row = (profile.data or [None])[0] or {}
        return {
            "id": user.id,
            "email": user.email,
            "username": row.get("username") or (user.email or "").split("@")[0],
            "name": row.get("full_name") or row.get("username") or user.email,
            "role": row.get("role") or "reviewer",
        }
    except Exception:
        return None


def get_settings_for_user(user_id: str) -> dict[str, Any]:
    client = get_supabase()
    res = client.table("user_settings").select("*").eq("user_id", user_id).limit(1).execute()
    if res.data:
        return res.data[0]
    # create empty settings row
    client.table("user_settings").upsert({"user_id": user_id}).execute()
    return {
        "user_id": user_id,
        "anthropic_api_key": "",
        "groq_api_key": "",
        "llm_provider": "groq",
        "llm_model": "openai/gpt-oss-120b",
        "whisper_model": "auto",
        "max_cost": None,
    }


def update_settings_for_user(user_id: str, updates: dict[str, Any]) -> dict[str, Any]:
    current = get_settings_for_user(user_id)
    payload = {
        "user_id": user_id,
        "anthropic_api_key": current.get("anthropic_api_key") or "",
        "groq_api_key": current.get("groq_api_key") or "",
        "llm_provider": current.get("llm_provider") or "groq",
        "llm_model": current.get("llm_model") or "openai/gpt-oss-120b",
        "whisper_model": current.get("whisper_model") or "auto",
        "max_cost": current.get("max_cost"),
    }
    for key in ("llm_provider", "llm_model", "whisper_model", "max_cost"):
        if key in updates and updates[key] is not None:
            payload[key] = updates[key]
    if updates.get("anthropic_api_key"):
        payload["anthropic_api_key"] = str(updates["anthropic_api_key"]).strip()
    if updates.get("groq_api_key"):
        payload["groq_api_key"] = str(updates["groq_api_key"]).strip()

    client = get_supabase()
    client.table("user_settings").upsert(payload).execute()
    return get_settings_for_user(user_id)


def get_user_api_key_sb(user_id: str, provider: str) -> Optional[str]:
    settings = get_settings_for_user(user_id)
    key_name = "anthropic_api_key" if provider == "anthropic" else "groq_api_key"
    key = (settings.get(key_name) or "").strip()
    return key or None


def upsert_review_result(
    *,
    review_id: str,
    user_id: Optional[str],
    video_name: Optional[str],
    drive_url: Optional[str],
    provider: Optional[str],
    model: Optional[str],
    status: str,
    proposed_verdict: Optional[str],
    findings_count: int,
    quality_score: Optional[float],
    duration_ms: Optional[int],
    cost: Optional[float],
    report: Optional[dict[str, Any]],
) -> None:
    """Persist finished pipeline output into public.reviews for the Next.js app."""
    if not supabase_enabled() or not review_id:
        return
    try:
        client = get_supabase()
        payload: dict[str, Any] = {
            "id": review_id,
            "status": status,
            "proposed_verdict": proposed_verdict,
            "findings_count": findings_count,
            "quality_score": quality_score,
            "duration_ms": duration_ms,
            "cost": cost,
            "report": report,
            "updated_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        }
        if user_id:
            payload["user_id"] = user_id
        if video_name is not None:
            payload["video_name"] = video_name
        if drive_url is not None:
            payload["drive_url"] = drive_url
        if provider is not None:
            payload["provider"] = provider
        if model is not None:
            payload["model"] = model

        # Prefer update when row already exists (created by Next.js).
        existing = client.table("reviews").select("id").eq("id", review_id).limit(1).execute()
        if existing.data:
            client.table("reviews").update(payload).eq("id", review_id).execute()
        elif user_id:
            client.table("reviews").upsert(payload).execute()
    except Exception:
        # Never break the local pipeline if cloud sync fails.
        return
