#!/usr/bin/env python3
"""يرفع تقارير reports/ إلى جدول sessions على Supabase."""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPORTS = ROOT / "reports"


def _load_env() -> None:
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    load_dotenv(ROOT / ".env")


def _counts(findings: list) -> dict[str, int]:
    active = [item for item in findings if item.get("verdict", "keep") == "keep"]

    def count(severity: str) -> int:
        return sum(1 for item in active if item.get("severity") == severity)

    return {
        "total": len(active),
        "major": count("major"),
        "moderate": count("moderate"),
        "minor": count("minor"),
    }


def session_record(report: Path, reports_root: Path) -> dict:
    folder = report.parent
    findings_path = folder / "findings.json"
    transcript_path = folder / "transcript.txt"
    findings = json.loads(findings_path.read_text(encoding="utf-8")) if findings_path.exists() else []
    if not isinstance(findings, list):
        findings = []
    created = datetime.fromtimestamp(report.stat().st_mtime, timezone.utc).isoformat()
    counts = _counts(findings)
    relative = folder.relative_to(reports_root)
    topic = relative.parts[1] if relative.parts[:1] == ("batches",) and len(relative.parts) >= 2 else folder.name
    return {
        "slug": relative.as_posix(),
        "title": folder.name,
        "topic": topic,
        "source": None,
        "created_at": created,
        "report_html": report.read_text(encoding="utf-8"),
        "transcript": transcript_path.read_text(encoding="utf-8") if transcript_path.exists() else None,
        "findings": findings,
        **counts,
    }


def _request(method: str, url: str, body: dict | None, key: str) -> None:
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("apikey", key)
    req.add_header("Authorization", f"Bearer {key}")
    req.add_header("Content-Type", "application/json")
    req.add_header("Prefer", "resolution=merge-duplicates,return=minimal")
    with urllib.request.urlopen(req, timeout=60) as res:
        res.read()


def upload_tree(root: Path) -> int:
    _load_env()
    base = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not base or not key:
        raise RuntimeError("حط SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY في ملف .env")
    reports = sorted(path for path in root.rglob("report.html") if "_downloads" not in path.parts)
    if not reports:
        return 0
    endpoint = f"{base}/rest/v1/sessions?on_conflict=slug"
    uploaded = 0
    for report in reports:
        record = session_record(report, REPORTS)
        try:
            _request("POST", endpoint, record, key)
        except urllib.error.HTTPError as ex:
            detail = ex.read().decode("utf-8", errors="replace")[:300]
            raise RuntimeError(f"Supabase رفض {record['slug']}: {ex.code} {detail}") from ex
        uploaded += 1
        print(f"اترفع: {record['slug']}", flush=True)
    return uploaded


def main() -> None:
    _load_env()
    try:
        count = upload_tree(REPORTS)
    except Exception as ex:
        sys.exit(str(ex))
    print(f"خلصت. {count} تقرير على Supabase.")


if __name__ == "__main__":
    main()
