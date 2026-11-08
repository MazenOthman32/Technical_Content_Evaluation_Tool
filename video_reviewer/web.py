"""Local FastAPI web server for Instant Plus Video Reviewer."""

from __future__ import annotations

import json
import shutil
import threading
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware

from .auth import (
    authenticate,
    cookie_secure,
    create_session,
    destroy_session,
    ensure_users_file,
    get_session_user,
    get_user_api_key,
    get_user_settings,
    update_user_settings,
)
from .config import SystemConfig, default_data_dir
from .drive import download_from_drive
from .llm import AVAILABLE_MODELS, DEFAULT_MODELS
from .pipeline import Pipeline
from .schema import CourseMeta

load_dotenv()
ensure_users_file()

STATIC_DIR = Path(__file__).parent / "static"
Path("data/reviews").mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Instant Plus Video Reviewer", version="0.1.0")
COOKIE_NAME = "ipvr_session"


class AuthGateMiddleware(BaseHTTPMiddleware):
    PUBLIC_EXACT = {"/", "/api/login", "/api/me", "/api/health", "/favicon.ico"}
    PUBLIC_STATIC = {"/static/css/login.css", "/static/js/login.js", "/static/login.html"}

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if request.method == "OPTIONS":
            return await call_next(request)
        if path in self.PUBLIC_EXACT or path in self.PUBLIC_STATIC or path.startswith("/static/brand/"):
            return await call_next(request)

        user = get_session_user(request.cookies.get(COOKIE_NAME))
        if not user:
            auth = request.headers.get("Authorization") or ""
            if auth.lower().startswith("bearer "):
                token = auth.split(" ", 1)[1].strip()
                try:
                    from .supabase_client import verify_access_token

                    user = verify_access_token(token)
                except Exception:
                    user = None
        if user:
            request.state.user = user
            return await call_next(request)

        if path.startswith("/api/"):
            return JSONResponse({"detail": "يلزم تسجيل الدخول"}, status_code=401)
        return RedirectResponse(url="/", status_code=302)


app.add_middleware(AuthGateMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

_jobs: dict[str, dict[str, Any]] = {}
_jobs_lock = threading.Lock()
_base_config = SystemConfig()

MEDIA_EXT = {".mp4", ".mkv", ".mov", ".webm", ".avi", ".m4v"}


class LoginBody(BaseModel):
    username: str
    password: str


class SettingsUpdate(BaseModel):
    anthropic_api_key: Optional[str] = None
    groq_api_key: Optional[str] = None
    max_cost: Optional[float] = None
    llm_provider: Optional[str] = None
    llm_model: Optional[str] = None
    whisper_model: Optional[str] = None


def _current_user(request: Request) -> Optional[dict[str, Any]]:
    cookie_user = get_session_user(request.cookies.get(COOKIE_NAME))
    if cookie_user:
        return cookie_user
    auth = request.headers.get("Authorization") or ""
    if auth.lower().startswith("bearer "):
        token = auth.split(" ", 1)[1].strip()
        try:
            from .supabase_client import verify_access_token

            sb_user = verify_access_token(token)
            if sb_user:
                return sb_user
        except Exception:
            return None
    return None


def require_user(request: Request) -> dict[str, Any]:
    user = _current_user(request)
    if not user:
        raise HTTPException(401, "يلزم تسجيل الدخول")
    return user


def require_admin(request: Request) -> dict[str, Any]:
    user = require_user(request)
    if user.get("role") not in {"admin", "super_admin"}:
        raise HTTPException(403, "متاح للمسؤول فقط")
    return user


def _prefs_for_user(user: dict[str, Any]) -> dict[str, Any]:
    if user.get("id"):
        try:
            from .supabase_client import get_settings_for_user

            return get_settings_for_user(str(user["id"]))
        except Exception:
            pass
    return get_user_settings(user.get("username") or "")


def _api_key_for_user(user: dict[str, Any], provider: str) -> Optional[str]:
    if user.get("id"):
        try:
            from .supabase_client import get_user_api_key_sb

            key = get_user_api_key_sb(str(user["id"]), provider)
            if key:
                return key
        except Exception:
            pass
    return get_user_api_key(user.get("username") or "", provider)


def _config_for_user(user: dict[str, Any] | str) -> SystemConfig:
    if isinstance(user, str):
        prefs = get_user_settings(user)
    else:
        prefs = _prefs_for_user(user)
    return _base_config.model_copy(
        update={
            "llm_provider": prefs.get("llm_provider") or _base_config.llm_provider,
            "llm_model": prefs.get("llm_model") or _base_config.llm_model,
            "max_cost": prefs.get("max_cost"),
            "whisper_model": prefs.get("whisper_model") or _base_config.whisper_model,
        }
    )


def _list_reviews(username: Optional[str] = None, role: str = "reviewer") -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    root = default_data_dir(_base_config)
    if not root.exists():
        return items
    for d in sorted(root.iterdir(), reverse=True):
        if not d.is_dir():
            continue
        meta_path = d / "meta.json"
        report_path = d / "report.json"
        meta: dict[str, Any] = {}
        if meta_path.exists():
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        owner = meta.get("created_by")
        if role != "admin" and username and owner and owner != username:
            continue
        findings_count = meta.get("findings_count")
        if findings_count is None and report_path.exists():
            findings_count = len(json.loads(report_path.read_text(encoding="utf-8")).get("findings") or [])
        cost = None
        if (d / "cost.json").exists():
            cost = json.loads((d / "cost.json").read_text(encoding="utf-8")).get("estimated_usd")
        elif report_path.exists():
            cost = json.loads(report_path.read_text(encoding="utf-8")).get("cost", {}).get("estimated_usd")
        items.append(
            {
                "review_id": d.name,
                "video_name": meta.get("video_name") or d.name,
                "created_at": meta.get("created_at"),
                "created_by": owner,
                "field": (meta.get("course") or {}).get("field"),
                "processing_status": meta.get("processing_status") or "unknown",
                "proposed_verdict": meta.get("proposed_verdict"),
                "findings_count": findings_count or 0,
                "cost": cost,
            }
        )
    return items


def _dashboard_stats(user: dict[str, Any]) -> dict[str, Any]:
    reviews = _list_reviews(user.get("username"), user.get("role") or "reviewer")
    completed = [r for r in reviews if r["processing_status"] == "completed"]
    needs_attention = [
        r
        for r in reviews
        if r["processing_status"] == "failed"
        or r.get("proposed_verdict") in {"fix_required", "needs_human_review"}
    ]
    severity = {"critical": 0, "medium": 0, "minor": 0, "unsure": 0}
    total_findings = 0
    root = default_data_dir(_base_config)
    for r in reviews:
        report = root / r["review_id"] / "report.json"
        if not report.exists():
            continue
        data = json.loads(report.read_text(encoding="utf-8"))
        findings = data.get("findings") or []
        total_findings += len(findings)
        for f in findings:
            sev = f.get("severity") or "unsure"
            if sev in severity:
                severity[sev] += 1
    return {
        "total_reviews": len(reviews),
        "completed_reviews": len(completed),
        "needs_attention": len(needs_attention),
        "total_findings": total_findings,
        "severity": severity,
        "recent": reviews[:8],
    }


def _settings_payload(username: str) -> dict[str, Any]:
    prefs = get_user_settings(username)
    return {
        "anthropic_api_key_set": bool((prefs.get("anthropic_api_key") or "").strip() or get_user_api_key(username, "anthropic")),
        "groq_api_key_set": bool((prefs.get("groq_api_key") or "").strip() or get_user_api_key(username, "groq")),
        "has_personal_anthropic": bool((prefs.get("anthropic_api_key") or "").strip()),
        "has_personal_groq": bool((prefs.get("groq_api_key") or "").strip()),
        "max_cost": prefs.get("max_cost"),
        "llm_provider": prefs.get("llm_provider") or "groq",
        "llm_model": prefs.get("llm_model") or DEFAULT_MODELS["groq"],
        "whisper_model": prefs.get("whisper_model") or "auto",
        "providers": AVAILABLE_MODELS,
        "defaults": DEFAULT_MODELS,
        "can_edit": True,
    }


@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    if _current_user(request):
        return RedirectResponse(url="/app", status_code=302)
    return HTMLResponse((STATIC_DIR / "login.html").read_text(encoding="utf-8"))


@app.get("/app", response_class=HTMLResponse)
def app_home(request: Request):
    if not _current_user(request):
        return RedirectResponse(url="/", status_code=302)
    return HTMLResponse((STATIC_DIR / "app.html").read_text(encoding="utf-8"))


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "version": "0.1.0"}


@app.get("/api/me")
def me(request: Request) -> dict:
    user = _current_user(request)
    if not user:
        return {"authenticated": False}
    return {"authenticated": True, "user": user}


@app.post("/api/login")
def login(body: LoginBody) -> JSONResponse:
    user = authenticate(body.username, body.password)
    if not user:
        raise HTTPException(401, "بيانات الدخول غير صحيحة")
    token = create_session(user)
    resp = JSONResponse({"ok": True, "user": user})
    resp.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        secure=cookie_secure(),
        max_age=60 * 60 * 12,
        path="/",
    )
    return resp


@app.post("/api/logout")
def logout(request: Request) -> JSONResponse:
    destroy_session(request.cookies.get(COOKIE_NAME))
    resp = JSONResponse({"ok": True})
    # Match set_cookie attributes so browsers actually clear the session.
    resp.delete_cookie(key=COOKIE_NAME, path="/", samesite="lax", secure=cookie_secure())
    resp.set_cookie(
        key=COOKIE_NAME,
        value="",
        max_age=0,
        expires=0,
        path="/",
        httponly=True,
        samesite="lax",
        secure=cookie_secure(),
    )
    return resp


@app.get("/api/models")
def models(_user: dict = Depends(require_user)) -> dict:
    return {"providers": AVAILABLE_MODELS, "defaults": DEFAULT_MODELS}


@app.get("/api/dashboard")
def dashboard(user: dict = Depends(require_user)) -> dict:
    return _dashboard_stats(user)


@app.get("/api/reviews")
def reviews(user: dict = Depends(require_user)) -> dict:
    return {"reviews": _list_reviews(user.get("username"), user.get("role") or "reviewer")}


@app.get("/api/reviews/{review_id}")
def review_detail(review_id: str, user: dict = Depends(require_user)) -> dict:
    root = default_data_dir(_base_config) / review_id
    if not root.exists():
        raise HTTPException(404, "المراجعة غير موجودة")
    meta = {}
    if (root / "meta.json").exists():
        meta = json.loads((root / "meta.json").read_text(encoding="utf-8"))
    owner = meta.get("created_by")
    if user.get("role") != "admin" and owner and owner != user.get("username"):
        raise HTTPException(403, "غير مسموح")
    report = {}
    if (root / "report.json").exists():
        report = json.loads((root / "report.json").read_text(encoding="utf-8"))
    with _jobs_lock:
        job = _jobs.get(review_id)
    return {
        "meta": meta,
        "report": report,
        "job": job,
        "has_video": any((root / "source").glob("*")) if (root / "source").exists() else False,
        "artifacts": {
            "markdown": (root / "report.md").exists(),
            "json": (root / "report.json").exists(),
            "dropped": (root / "dropped_issues.json").exists(),
        },
    }


@app.get("/api/reviews/{review_id}/video")
def review_video(review_id: str, user: dict = Depends(require_user)):
    root = default_data_dir(_base_config) / review_id
    meta = {}
    if (root / "meta.json").exists():
        meta = json.loads((root / "meta.json").read_text(encoding="utf-8"))
    owner = meta.get("created_by")
    if user.get("role") != "admin" and owner and owner != user.get("username"):
        raise HTTPException(403, "غير مسموح")
    src = root / "source"
    if not src.exists():
        raise HTTPException(404, "لا يوجد فيديو")
    files = list(src.glob("*"))
    if not files:
        raise HTTPException(404, "لا يوجد فيديو")
    return FileResponse(files[0])


@app.get("/api/reviews/{review_id}/download/{kind}")
def download(review_id: str, kind: str, user: dict = Depends(require_user)):
    root = default_data_dir(_base_config) / review_id
    meta = {}
    if (root / "meta.json").exists():
        meta = json.loads((root / "meta.json").read_text(encoding="utf-8"))
    owner = meta.get("created_by")
    if user.get("role") != "admin" and owner and owner != user.get("username"):
        raise HTTPException(403, "غير مسموح")
    mapping = {
        "markdown": root / "report.md",
        "json": root / "report.json",
        "dropped": root / "dropped_issues.json",
    }
    path = mapping.get(kind)
    if not path or not path.exists():
        raise HTTPException(404, "الملف غير موجود")
    return FileResponse(path, filename=path.name)


@app.get("/api/jobs/{review_id}")
def job_status(review_id: str, _user: dict = Depends(require_user)) -> dict:
    with _jobs_lock:
        job = _jobs.get(review_id)
    if not job:
        root = default_data_dir(_base_config) / review_id
        if root.exists() and (root / "meta.json").exists():
            meta = json.loads((root / "meta.json").read_text(encoding="utf-8"))
            return {
                "review_id": review_id,
                "status": meta.get("processing_status"),
                "stages": meta.get("stages") or {},
                "error": None,
            }
        raise HTTPException(404, "المهمة غير موجودة")
    return job


@app.get("/api/settings")
def get_settings(user: dict = Depends(require_user)) -> dict:
    return _settings_payload(user["username"])


@app.post("/api/settings")
def update_settings(body: SettingsUpdate, user: dict = Depends(require_user)) -> dict:
    updates: dict[str, Any] = {}
    if body.anthropic_api_key is not None:
        updates["anthropic_api_key"] = body.anthropic_api_key
    if body.groq_api_key is not None:
        updates["groq_api_key"] = body.groq_api_key
    if body.max_cost is not None:
        updates["max_cost"] = body.max_cost
    if body.llm_provider:
        if body.llm_provider not in {"anthropic", "groq"}:
            raise HTTPException(400, "مزود غير مدعوم")
        updates["llm_provider"] = body.llm_provider
    if body.llm_model:
        updates["llm_model"] = body.llm_model
    if body.whisper_model:
        updates["whisper_model"] = body.whisper_model
    update_user_settings(user["username"], updates)
    return _settings_payload(user["username"])


@app.get("/api/eval")
def eval_results(_admin: dict = Depends(require_admin)) -> dict:
    results = Path.cwd() / "results" / "eval_summary.json"
    if not results.exists():
        return {"available": False, "message": "لا توجد نتائج تقييم محفوظة"}
    data = json.loads(results.read_text(encoding="utf-8"))
    return {"available": True, "summary": data}


@app.post("/api/reviews")
async def create_review(
    video: Optional[UploadFile] = File(None),
    drive_url: str = Form(""),
    field: str = Form("general"),
    level: str = Form("intermediate"),
    language: str = Form("auto"),
    stack: str = Form(""),
    glossary: str = Form(""),
    title: str = Form(""),
    provider: str = Form(""),
    model: str = Form(""),
    review_id: str = Form(""),
    user: dict = Depends(require_user),
):
    prefs = _prefs_for_user(user)
    provider = (provider or prefs.get("llm_provider") or "groq").lower().strip()
    if provider not in {"anthropic", "groq", "openai"}:
        raise HTTPException(400, "مزود غير مدعوم")

    drive_url = (drive_url or "").strip()
    has_file = bool(video and video.filename)
    if not has_file and not drive_url:
        raise HTTPException(400, "ارفع فيديو أو الصق لينك Google Drive")
    if has_file and drive_url:
        raise HTTPException(400, "اختَر إما ملف أو لينك Drive")

    key = _api_key_for_user(user, provider)
    if not key:
        raise HTTPException(400, "مفتاح API غير مضبوط لحسابك. افتح الإعدادات وأضفه.")

    safe_id = "".join(ch for ch in (review_id or "").strip() if ch.isalnum() or ch in {"_", "-"})
    review_id = safe_id or (datetime.now().strftime("%Y%m%d_%H%M%S") + "_" + uuid.uuid4().hex[:6])
    cfg = _config_for_user(user)
    root = default_data_dir(cfg) / review_id
    src_dir = root / "source"
    src_dir.mkdir(parents=True, exist_ok=True)

    dest: Optional[Path] = None
    if has_file:
        assert video is not None
        suffix = Path(video.filename or "upload.mp4").suffix.lower()
        if suffix not in MEDIA_EXT:
            raise HTTPException(400, "نوع الملف غير مدعوم")
        dest = src_dir / Path(video.filename or f"video{suffix}").name
        with dest.open("wb") as f:
            shutil.copyfileobj(video.file, f)

    course = CourseMeta(
        field=field or "general",
        level=level or "intermediate",
        language=language or "auto",
        stack=[s.strip() for s in stack.split(",") if s.strip()],
        glossary=[g.strip() for g in glossary.split(",") if g.strip()],
        title=title or None,
    )
    chosen_model = (model or "").strip() or prefs.get("llm_model") or DEFAULT_MODELS.get(provider) or DEFAULT_MODELS["groq"]
    cfg = cfg.model_copy(update={"llm_provider": provider, "llm_model": chosen_model})
    video_name = dest.name if dest else (drive_url or "drive")

    with _jobs_lock:
        _jobs[review_id] = {
            "review_id": review_id,
            "status": "queued",
            "stages": {s: {"status": "pending"} for s in Pipeline.STAGES},
            "error": None,
            "provider": provider,
            "model": chosen_model,
            "created_by": user.get("username"),
            "user_id": user.get("id"),
        }

    # persist owner early
    (root / "meta.json").write_text(
        json.dumps(
            {
                "review_id": review_id,
                "created_by": user.get("username"),
                "user_id": user.get("id"),
                "processing_status": "queued",
                "video_name": video_name,
                "drive_url": drive_url or None,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    def _sync_supabase(status: str, pipe: Optional[Pipeline] = None, error: Optional[str] = None) -> None:
        try:
            from .supabase_client import upsert_review_result

            report = {}
            report_path = root / "report.json"
            md_path = root / "report.md"
            if report_path.exists():
                report = json.loads(report_path.read_text(encoding="utf-8"))
                if md_path.exists():
                    report["markdown"] = md_path.read_text(encoding="utf-8")
            elif error:
                report = {
                    "processing_status": "failed",
                    "proposed_verdict": "needs_human_review",
                    "findings": [],
                    "limitations": [f"فشل المعالجة: {error}"],
                }

            findings = report.get("findings") or []
            verdict = None
            if pipe is not None:
                verdict = pipe.verdict.value
                findings_count = len(pipe.findings)
            else:
                verdict = report.get("proposed_verdict")
                findings_count = len(findings)

            critical = sum(1 for f in findings if (f.get("severity") if isinstance(f, dict) else getattr(f, "severity", None)) == "critical")
            medium = sum(1 for f in findings if (f.get("severity") if isinstance(f, dict) else getattr(f, "severity", None)) == "medium")
            quality = None
            if findings:
                quality = max(0, round(100 - critical * 25 - medium * 10, 1))
            elif status == "completed":
                quality = 100.0

            cost_usd = None
            if isinstance(report.get("cost"), dict):
                cost_usd = report["cost"].get("estimated_usd")

            duration_ms = None
            if report.get("duration_sec") is not None:
                try:
                    duration_ms = int(float(report["duration_sec"]) * 1000)
                except Exception:
                    duration_ms = None

            upsert_review_result(
                review_id=review_id,
                user_id=user.get("id"),
                video_name=video_name,
                drive_url=drive_url or None,
                provider=provider,
                model=chosen_model,
                status=status,
                proposed_verdict=verdict,
                findings_count=findings_count,
                quality_score=quality,
                duration_ms=duration_ms,
                cost=cost_usd,
                report=report,
            )
        except Exception:
            return

    def runner() -> None:
        def on_progress(stage: str, status: str, error: Optional[str] = None) -> None:
            with _jobs_lock:
                job = _jobs[review_id]
                job["status"] = "running"
                job["stages"][stage] = {"status": status, "error": error}
                if error:
                    job["error"] = error

        try:
            video_path = dest
            if drive_url:
                with _jobs_lock:
                    _jobs[review_id]["status"] = "downloading"
                video_path = download_from_drive(drive_url, src_dir)
            assert video_path is not None
            pipe = Pipeline(
                video=video_path,
                course=course,
                config=cfg,
                review_id=review_id,
                work_dir=root,
                api_key=key,
                resume=True,
                on_progress=on_progress,
                copy_video=False,
            )
            # ensure ownership survives pipeline meta overwrite
            original_persist = pipe._persist_meta

            def persist_with_owner() -> None:
                original_persist()
                meta_path = root / "meta.json"
                meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else {}
                meta["created_by"] = user.get("username")
                meta["user_id"] = user.get("id")
                meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

            pipe._persist_meta = persist_with_owner  # type: ignore[method-assign]
            pipe.run()
            with _jobs_lock:
                _jobs[review_id]["status"] = "completed"
                _jobs[review_id]["verdict"] = pipe.verdict.value
                _jobs[review_id]["findings_count"] = len(pipe.findings)
            _sync_supabase("completed", pipe=pipe)
        except Exception as e:
            with _jobs_lock:
                _jobs[review_id]["status"] = "failed"
                _jobs[review_id]["error"] = str(e)
            _sync_supabase("failed", error=str(e))

    threading.Thread(target=runner, daemon=True).start()
    return {"review_id": review_id, "status": "queued", "provider": provider, "model": chosen_model}
