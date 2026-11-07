"""Local FastAPI web server for Instant Plus Video Reviewer."""

from __future__ import annotations

import json
import os
import shutil
import threading
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .config import SystemConfig, default_data_dir, load_course_meta, load_system_config
from .pipeline import Pipeline
from .schema import CourseMeta
from .verdict import severity_counts

load_dotenv()

STATIC_DIR = Path(__file__).parent / "static"
DATA_ROOT = Path.cwd() / "data" / "reviews"
DATA_ROOT.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Instant Plus Video Reviewer", version="0.1.0")
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# In-memory job registry (local Phase 1)
_jobs: dict[str, dict[str, Any]] = {}
_jobs_lock = threading.Lock()
_session_api_key: Optional[str] = None
_session_config = SystemConfig()


class SettingsUpdate(BaseModel):
    api_key: Optional[str] = None
    max_cost: Optional[float] = None


def _list_reviews() -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    root = default_data_dir(_session_config)
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
                "field": (meta.get("course") or {}).get("field"),
                "processing_status": meta.get("processing_status") or "unknown",
                "proposed_verdict": meta.get("proposed_verdict"),
                "findings_count": findings_count or 0,
                "cost": cost,
            }
        )
    return items


def _dashboard_stats() -> dict[str, Any]:
    reviews = _list_reviews()
    completed = [r for r in reviews if r["processing_status"] == "completed"]
    needs_attention = [
        r
        for r in reviews
        if r["processing_status"] == "failed"
        or r.get("proposed_verdict") in {"fix_required", "needs_human_review"}
    ]
    severity = {"critical": 0, "medium": 0, "minor": 0, "unsure": 0}
    total_findings = 0
    root = default_data_dir(_session_config)
    for r in reviews:
        report = root / r["review_id"] / "report.json"
        if not report.exists():
            continue
        data = json.loads(report.read_text(encoding="utf-8"))
        findings = data.get("findings") or []
        total_findings += len(findings)
        for f in findings:
            sev = (f.get("severity") or "unsure")
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


@app.get("/", response_class=HTMLResponse)
def index() -> HTMLResponse:
    html = (STATIC_DIR / "index.html").read_text(encoding="utf-8")
    return HTMLResponse(html)


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "version": "0.1.0"}


@app.get("/api/dashboard")
def dashboard() -> dict:
    return _dashboard_stats()


@app.get("/api/reviews")
def reviews() -> dict:
    return {"reviews": _list_reviews()}


@app.get("/api/reviews/{review_id}")
def review_detail(review_id: str) -> dict:
    root = default_data_dir(_session_config) / review_id
    if not root.exists():
        raise HTTPException(404, "المراجعة غير موجودة")
    meta = {}
    if (root / "meta.json").exists():
        meta = json.loads((root / "meta.json").read_text(encoding="utf-8"))
    report = {}
    if (root / "report.json").exists():
        report = json.loads((root / "report.json").read_text(encoding="utf-8"))
    job = None
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
def review_video(review_id: str):
    root = default_data_dir(_session_config) / review_id / "source"
    if not root.exists():
        raise HTTPException(404, "لا يوجد فيديو")
    files = list(root.glob("*"))
    if not files:
        raise HTTPException(404, "لا يوجد فيديو")
    return FileResponse(files[0])


@app.get("/api/reviews/{review_id}/download/{kind}")
def download(review_id: str, kind: str):
    root = default_data_dir(_session_config) / review_id
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
def job_status(review_id: str) -> dict:
    with _jobs_lock:
        job = _jobs.get(review_id)
    if not job:
        # Fall back to persisted meta
        root = default_data_dir(_session_config) / review_id
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


@app.post("/api/settings")
def update_settings(body: SettingsUpdate) -> dict:
    global _session_api_key, _session_config
    if body.api_key is not None:
        key = body.api_key.strip()
        _session_api_key = key or None
        if key:
            os.environ["ANTHROPIC_API_KEY"] = key
    if body.max_cost is not None:
        _session_config = _session_config.model_copy(update={"max_cost": body.max_cost})
    return {
        "api_key_set": bool(_session_api_key or os.getenv("ANTHROPIC_API_KEY")),
        "max_cost": _session_config.max_cost,
    }


@app.get("/api/settings")
def get_settings() -> dict:
    return {
        "api_key_set": bool(_session_api_key or os.getenv("ANTHROPIC_API_KEY")),
        "max_cost": _session_config.max_cost,
        "model": _session_config.llm_model,
        "host": _session_config.host,
        "port": _session_config.port,
    }


@app.get("/api/eval")
def eval_results() -> dict:
    results = Path.cwd() / "results" / "eval_summary.json"
    if not results.exists():
        return {"available": False, "message": "لا توجد نتائج تقييم محفوظة بعد. شغّل: video-reviewer eval"}
    data = json.loads(results.read_text(encoding="utf-8"))
    return {"available": True, "summary": data}


@app.post("/api/reviews")
async def create_review(
    video: UploadFile = File(...),
    field: str = Form("general"),
    level: str = Form("intermediate"),
    language: str = Form("auto"),
    stack: str = Form(""),
    glossary: str = Form(""),
    title: str = Form(""),
    max_cost: Optional[float] = Form(None),
    api_key: Optional[str] = Form(None),
):
    allowed = {".mp4", ".mkv", ".mov", ".webm", ".avi", ".m4v"}
    suffix = Path(video.filename or "upload.mp4").suffix.lower()
    if suffix not in allowed:
        raise HTTPException(400, "نوع الملف غير مدعوم")

    review_id = datetime.now().strftime("%Y%m%d_%H%M%S") + "_" + uuid.uuid4().hex[:6]
    root = default_data_dir(_session_config) / review_id
    src_dir = root / "source"
    src_dir.mkdir(parents=True, exist_ok=True)
    dest = src_dir / (Path(video.filename or f"video{suffix}").name)
    with dest.open("wb") as f:
        shutil.copyfileobj(video.file, f)

    course = CourseMeta(
        field=field,
        level=level,
        language=language,
        stack=[s.strip() for s in stack.split(",") if s.strip()],
        glossary=[g.strip() for g in glossary.split(",") if g.strip()],
        title=title or None,
    )
    cfg = _session_config
    if max_cost is not None:
        cfg = cfg.model_copy(update={"max_cost": max_cost})

    key = (api_key or "").strip() or _session_api_key or os.getenv("ANTHROPIC_API_KEY")

    with _jobs_lock:
        _jobs[review_id] = {
            "review_id": review_id,
            "status": "queued",
            "stages": {s: {"status": "pending"} for s in Pipeline.STAGES},
            "error": None,
        }

    def runner() -> None:
        def on_progress(stage: str, status: str, error: Optional[str] = None) -> None:
            with _jobs_lock:
                job = _jobs[review_id]
                job["status"] = "running"
                job["stages"][stage] = {"status": status, "error": error}
                if error:
                    job["error"] = error

        try:
            pipe = Pipeline(
                video=dest,
                course=course,
                config=cfg,
                review_id=review_id,
                work_dir=root,
                api_key=key,
                resume=True,
                on_progress=on_progress,
                copy_video=False,
            )
            pipe.run()
            with _jobs_lock:
                _jobs[review_id]["status"] = "completed"
                _jobs[review_id]["verdict"] = pipe.verdict.value
                _jobs[review_id]["findings_count"] = len(pipe.findings)
        except Exception as e:
            with _jobs_lock:
                _jobs[review_id]["status"] = "failed"
                _jobs[review_id]["error"] = str(e)

    threading.Thread(target=runner, daemon=True).start()
    return {"review_id": review_id, "status": "queued"}
