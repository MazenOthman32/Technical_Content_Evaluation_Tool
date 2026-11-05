#!/usr/bin/env python3
"""واجهة محلية لتشغيل مراجعة السيشنات من المتصفح."""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path
from urllib.parse import quote

from flask import Flask, jsonify, request, send_from_directory

import session_reviewer as sr

ROOT = Path(__file__).resolve().parent
REPORTS = ROOT / "reports"
ENV_PATH = ROOT / ".env"
KEY_NAMES = ("GROQ_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY")
KEY_LABELS = {
    "GROQ_API_KEY": "Groq",
    "OPENAI_API_KEY": "OpenAI",
    "ANTHROPIC_API_KEY": "Anthropic",
}

app = Flask(__name__)
JOBS: dict[str, dict] = {}
JOBS_LOCK = threading.Lock()
RUN_LOCK = threading.Lock()


def upsert_env(updates: dict[str, str]) -> None:
    lines = ENV_PATH.read_text(encoding="utf-8").splitlines() if ENV_PATH.exists() else []
    seen: set[str] = set()
    out: list[str] = []
    for line in lines:
        key = line.split("=", 1)[0].strip()
        if key in updates and updates[key]:
            out.append(f"{key}={updates[key]}")
            seen.add(key)
        else:
            out.append(line)
    for key, value in updates.items():
        if value and key not in seen:
            out.append(f"{key}={value}")
    ENV_PATH.write_text("\n".join(out).rstrip() + "\n", encoding="utf-8")


def clean_keys(keys: dict | None) -> dict[str, str]:
    clean: dict[str, str] = {}
    for name in KEY_NAMES:
        value = str((keys or {}).get(name) or "").strip()
        if any(ch in value for ch in "\r\n"):
            raise RuntimeError("المفتاح فيه سطر جديد، انسخه من غير مسافات زيادة.")
        if value:
            clean[name] = value
    return clean


def apply_keys(keys: dict | None, save: bool) -> None:
    clean = clean_keys(keys)
    for name, value in clean.items():
        os.environ[name] = value
    if save and clean:
        upsert_env(clean)


def installed(module: str) -> bool:
    return importlib.util.find_spec(module) is not None


def default_provider() -> str:
    if os.getenv("ANTHROPIC_API_KEY") and installed("anthropic"):
        return "anthropic"
    return "groq"


def default_backend() -> str:
    if os.getenv("OPENAI_API_KEY"):
        return "openai"
    return "groq"


def public_url(relative: str) -> str:
    return "/reports/" + quote(relative.replace("\\", "/"), safe="/")


def report_card(report: Path, root: Path) -> dict:
    findings_path = report.parent / "findings.json"
    findings = []
    if findings_path.exists():
        try:
            loaded = json.loads(findings_path.read_text(encoding="utf-8"))
            findings = loaded if isinstance(loaded, list) else []
        except json.JSONDecodeError:
            findings = []
    active = [item for item in findings if item.get("verdict", "keep") == "keep"]

    def count(severity: str) -> int:
        return sum(1 for item in active if item.get("severity") == severity)

    rel = report.relative_to(root).as_posix()
    return {
        "title": report.parent.name,
        "url": public_url(rel),
        "major": count("major"),
        "moderate": count("moderate"),
        "minor": count("minor"),
        "mtime": report.stat().st_mtime,
    }


def list_courses() -> list[dict]:
    if not REPORTS.exists():
        return []
    courses: dict[str, dict] = {}

    def bucket(course_id: str, title: str, mtime: float) -> dict:
        current = courses.get(course_id)
        if current is None:
            current = {"id": course_id, "title": title, "reports": [], "mtime": mtime}
            courses[course_id] = current
        current["mtime"] = max(current["mtime"], mtime)
        if title:
            current["title"] = title
        return current

    batches = REPORTS / "batches"
    if batches.exists():
        for manifest in batches.glob("*/manifest.json"):
            try:
                data = json.loads(manifest.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                data = {}
            course_id = manifest.parent.name
            title = str(data.get("topic") or course_id).strip() or course_id
            place = bucket(course_id, title, manifest.stat().st_mtime)
            for item in data.get("reports", []):
                report = manifest.parent / str(item.get("report") or "")
                if not report.is_file():
                    continue
                card = report_card(report, REPORTS)
                card["title"] = item.get("title") or card["title"]
                place["reports"].append(card)
                place["mtime"] = max(place["mtime"], card["mtime"])
    for report in REPORTS.glob("*/report.html"):
        card = report_card(report, REPORTS)
        place = bucket(report.parent.name, report.parent.name, card["mtime"])
        place["reports"].append(card)
    ordered = sorted(courses.values(), key=lambda item: item["mtime"], reverse=True)
    for course in ordered:
        course["reports"].sort(key=lambda item: item["mtime"], reverse=True)
        course["count"] = len(course["reports"])
    return ordered


def course_name_for(sources: list[str], requested: str) -> str:
    name = requested.strip()
    if name:
        return name
    raw = sources[0]
    path = Path(raw)
    if path.exists():
        if path.is_dir():
            return path.name
        return path.stem
    return time.strftime("كورس-%Y%m%d")


def allocate_batch_dir(name: str) -> Path:
    base = REPORTS / "batches"
    base.mkdir(parents=True, exist_ok=True)
    slug = sr.safe_name(name) if name else ""
    if not slug or slug == "session":
        slug = time.strftime("%Y%m%d-%H%M")
    dest = base / slug
    dest.mkdir(parents=True, exist_ok=True)
    return dest


def validate(payload: dict) -> tuple[list[str], dict]:
    sources = []
    for item in payload.get("sources") or []:
        kind = str(item.get("kind") or "link").strip()
        value = str(item.get("value") or "").strip().strip('"')
        if not value:
            continue
        exists = Path(value).exists()
        if kind == "path" or exists:
            if not exists:
                raise RuntimeError(f"المسار مش موجود: {value}")
        elif not value.lower().startswith(("http://", "https://")):
            raise RuntimeError("اللينك لازم يبدأ بـ http، أو اختار مسار موجود على الجهاز.")
        sources.append(value)
    if not sources:
        raise RuntimeError("حط لينك أو مسار واحد على الأقل.")

    reference = str(payload.get("reference") or "").strip().strip('"')
    if reference and not Path(reference).exists():
        raise RuntimeError(f"ملف المرجع مش موجود: {reference}")

    provider = payload.get("provider") or default_provider()
    backend = payload.get("backend") or default_backend()
    if provider not in ("groq", "anthropic") or backend not in ("groq", "openai", "local"):
        raise RuntimeError("اختيار الموديل مش مفهوم.")

    missing = [key for key in sr.required_env(provider, backend) if not os.getenv(key)]
    if missing:
        names = " و ".join(KEY_LABELS.get(key, key) for key in missing)
        raise RuntimeError(f"محتاج مفتاح {names} عشان الاختيار ده يشتغل.")
    if provider == "anthropic" and not installed("anthropic"):
        raise RuntimeError("مراجعة Anthropic مش متاحة على الجهاز ده.")
    if backend == "local" and not installed("faster_whisper"):
        raise RuntimeError("التفريغ المحلي مش متاح على الجهاز ده.")

    try:
        confidence = float(payload.get("min_confidence", 0.75))
    except (TypeError, ValueError) as ex:
        raise RuntimeError("درجة الثقة لازم تكون رقم.") from ex

    return sources, {
        "topic": str(payload.get("topic") or "").strip() or None,
        "glossary": str(payload.get("glossary") or "").strip() or None,
        "reference": reference or None,
        "provider": provider,
        "backend": backend,
        "model": str(payload.get("model") or "").strip() or None,
        "local_model": str(payload.get("local_model") or "large-v3").strip() or "large-v3",
        "language": str(payload.get("language") or "").strip() or None,
        "min_confidence": min(0.99, max(0.3, confidence)),
        "no_verify": not bool(payload.get("verify", True)),
        "retranscribe": bool(payload.get("retranscribe")),
        "batch_name": str(payload.get("batch_name") or payload.get("topic") or "").strip(),
    }


def public_result(batch: Path, raw: dict) -> dict:
    rel_batch = batch.relative_to(REPORTS).as_posix()
    manifest_path = batch / "manifest.json"
    reports = []
    failed = raw.get("failed", [])
    if manifest_path.exists():
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
        failed = data.get("failed", failed)
        for item in data.get("reports", []):
            reports.append({
                **item,
                "url": public_url(f"{rel_batch}/{item['report']}"),
                "transcript_url": public_url(f"{rel_batch}/{item['transcript']}") if item.get("transcript") else "",
            })
    return {
        "folder": rel_batch,
        "folder_abs": str(batch),
        "course_id": batch.name,
        "index_url": public_url(f"{rel_batch}/index.html"),
        "reports": reports,
        "failed": failed,
    }


def run_job(job_id: str, payload: dict) -> None:
    job = JOBS[job_id]

    def sink(line: str) -> None:
        with JOBS_LOCK:
            job["logs"].append(line)

    sr.set_log_sink(sink)
    try:
        apply_keys(payload.get("keys"), save=False)
        sources, options = validate(payload)
        if payload.get("save_keys"):
            apply_keys(payload.get("keys"), save=True)
        course = course_name_for(sources, options.pop("batch_name") or (options.get("topic") or ""))
        options["topic"] = options.get("topic") or course
        batch = allocate_batch_dir(course)
        args = argparse.Namespace(source="", out=str(batch), used_names=set(), **options)
        raw = sr.run_batch(sources, args)
        if raw["reports"] and os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_SERVICE_ROLE_KEY"):
            try:
                from upload_to_supabase import upload_tree

                uploaded = upload_tree(batch)
                sr.log(f"اترفع {uploaded} تقرير على Supabase")
            except Exception as ex:
                sr.log(f"التقرير اتعمل، بس الرفع على Supabase فشل: {ex}")
        with JOBS_LOCK:
            job["result"] = public_result(batch, raw)
            if raw["reports"]:
                job["status"] = "done"
            else:
                job["status"] = "error"
                job["error"] = "مفيش تقرير اتكتب. السبب موجود في السجل تحت."
    except Exception as ex:
        sr.log(f"❌ {ex}")
        with JOBS_LOCK:
            job["status"] = "error"
            job["error"] = str(ex)
    finally:
        sr.set_log_sink(None)
        with JOBS_LOCK:
            job["finished"] = time.time()
        RUN_LOCK.release()


def decode_dialog_output(raw: bytes) -> str:
    if not raw:
        return ""
    if raw.startswith((b"\xff\xfe", b"\xfe\xff")):
        return raw.decode("utf-16", errors="ignore")
    if len(raw) > 3 and raw[1] == 0:
        return raw.decode("utf-16-le", errors="ignore")
    return raw.decode("utf-8", errors="ignore")


def browse_windows(kind: str) -> str:
    if kind == "dir":
        script = r"""
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "Choose the videos folder"
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.SelectedPath) }
"""
    else:
        script = r"""
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = "Choose a video"
$dialog.Filter = "Media|*.mp4;*.mkv;*.mov;*.webm;*.avi;*.m4v;*.m4a;*.mp3;*.wav;*.aac|All files|*.*"
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.FileName) }
"""
    result = subprocess.run(
        ["powershell", "-NoProfile", "-STA", "-Command", script],
        capture_output=True,
        timeout=300,
    )
    return decode_dialog_output(result.stdout).strip().strip('"')


@app.get("/")
def home():
    return send_from_directory(ROOT / "templates", "index.html")


@app.get("/api/status")
def status():
    running = not RUN_LOCK.acquire(blocking=False)
    if not running:
        RUN_LOCK.release()
    return jsonify({
        "keys": {name: bool(os.getenv(name)) for name in KEY_NAMES},
        "packages": {
            "anthropic": installed("anthropic"),
            "faster_whisper": installed("faster_whisper"),
        },
        "defaults": {
            "provider": default_provider(),
            "backend": default_backend(),
        },
        "courses": list_courses(),
        "running": running,
    })


@app.post("/api/jobs")
def start_job():
    payload = request.get_json(silent=True) or {}
    if not RUN_LOCK.acquire(blocking=False):
        return jsonify({"error": "في تشغيل شغال دلوقتي. استنى ما يخلص."}), 409
    try:
        apply_keys(payload.get("keys"), save=False)
        validate(payload)
    except Exception as ex:
        RUN_LOCK.release()
        return jsonify({"error": str(ex)}), 400

    job_id = uuid.uuid4().hex[:12]
    with JOBS_LOCK:
        JOBS[job_id] = {
            "status": "running",
            "logs": [],
            "error": "",
            "result": None,
            "started": time.time(),
        }
    threading.Thread(target=run_job, args=(job_id, payload), daemon=True).start()
    return jsonify({"id": job_id})


@app.get("/api/jobs/<job_id>")
def job_status(job_id: str):
    job = JOBS.get(job_id)
    if job is None:
        return jsonify({"error": "التشغيل ده مش موجود."}), 404
    try:
        since = max(0, int(request.args.get("since", 0)))
    except ValueError:
        since = 0
    with JOBS_LOCK:
        return jsonify({
            "status": job["status"],
            "error": job["error"],
            "logs": job["logs"][since:],
            "next": len(job["logs"]),
            "result": job["result"],
            "started": job["started"],
        })


@app.post("/api/browse")
def browse():
    kind = str((request.get_json(silent=True) or {}).get("kind") or "file").strip()
    try:
        if sys.platform == "win32":
            path = browse_windows("dir" if kind == "dir" else "file")
        else:
            import tkinter as tk
            from tkinter import filedialog

            root = tk.Tk()
            root.withdraw()
            root.attributes("-topmost", True)
            try:
                if kind == "dir":
                    path = filedialog.askdirectory(title="Choose the videos folder") or ""
                else:
                    pattern = " ".join(f"*{ext}" for ext in sorted(sr.MEDIA_EXT))
                    path = filedialog.askopenfilename(
                        title="Choose a video",
                        filetypes=[("Media", pattern), ("All files", "*.*")],
                    ) or ""
            finally:
                root.destroy()
    except Exception as ex:
        return jsonify({"error": f"اختيار الملف من النافذة متعملش: {ex}"}), 400
    return jsonify({"path": path})


@app.post("/api/open")
def open_folder():
    rel = str((request.get_json(silent=True) or {}).get("folder") or "").replace("\\", "/").lstrip("/")
    if not rel or ".." in Path(rel).parts:
        return jsonify({"error": "الفولدر مش معروف."}), 400
    path = (REPORTS / rel).resolve()
    reports_root = REPORTS.resolve()
    if path != reports_root and reports_root not in path.parents:
        return jsonify({"error": "الفولدر مش جوه التقارير."}), 400
    if not path.exists():
        return jsonify({"error": "الفولدر مش موجود."}), 404
    if sys.platform == "win32":
        os.startfile(path)  # noqa: S606 - the local user asked to open their own report folder
    elif sys.platform == "darwin":
        subprocess.run(["open", str(path)], check=False)
    else:
        subprocess.run(["xdg-open", str(path)], check=False)
    return jsonify({"ok": True})


@app.get("/reports/<path:filename>")
def serve_report(filename: str):
    return send_from_directory(REPORTS, filename)


if __name__ == "__main__":
    print("افتح الواجهة على http://127.0.0.1:7860", flush=True)
    app.run(host="127.0.0.1", port=7860, threaded=True, debug=False)
