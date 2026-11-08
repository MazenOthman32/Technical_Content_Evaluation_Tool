"""Resume a failed review and sync the result to Supabase."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")
load_dotenv(ROOT / "web" / ".env.local")

REVIEW_ID = sys.argv[1] if len(sys.argv) > 1 else "1794109348033_a73394"


def main() -> int:
    from video_reviewer.config import SystemConfig, default_data_dir
    from video_reviewer.pipeline import Pipeline
    from video_reviewer.schema import CourseMeta
    from video_reviewer.supabase_client import upsert_review_result

    work = default_data_dir(SystemConfig()) / REVIEW_ID
    meta = {}
    if (work / "meta.json").exists():
        meta = json.loads((work / "meta.json").read_text(encoding="utf-8"))

    # Prefer already-downloaded source video
    source = work / "source"
    videos = list(source.glob("*")) if source.exists() else []
    if not videos:
        raise SystemExit(f"No source video under {source}")
    video = videos[0]

    api_key = os.getenv("ANTHROPIC_API_KEY") or os.getenv("GROQ_API_KEY") or os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise SystemExit("Missing LLM API key in env")

    model = (meta.get("config") or {}).get("llm_model") or os.getenv("REVIEW_MODEL") or "claude-sonnet-5-5"
    provider = (meta.get("config") or {}).get("llm_provider") or "anthropic"
    cfg = SystemConfig().model_copy(update={"llm_model": model, "llm_provider": provider})

    course = CourseMeta(field="general", level="intermediate", language="auto")
    pipe = Pipeline(
        video=video,
        course=course,
        config=cfg,
        review_id=REVIEW_ID,
        work_dir=work,
        api_key=api_key,
        resume=True,
        copy_video=False,
    )
    print(f"Resuming {REVIEW_ID} from {video.name} ...")
    pipe.run()

    report = {}
    report_path = work / "report.json"
    md_path = work / "report.md"
    if report_path.exists():
        report = json.loads(report_path.read_text(encoding="utf-8"))
        if md_path.exists():
            report["markdown"] = md_path.read_text(encoding="utf-8")

    findings = report.get("findings") or []
    critical = sum(1 for f in findings if f.get("severity") == "critical")
    medium = sum(1 for f in findings if f.get("severity") == "medium")
    quality = 100.0 if not findings else max(0, round(100 - critical * 25 - medium * 10, 1))
    cost = (report.get("cost") or {}).get("estimated_usd")
    duration_ms = int(float(report.get("duration_sec") or 0) * 1000) or None

    upsert_review_result(
        review_id=REVIEW_ID,
        user_id=meta.get("user_id") or "c75722c3-5d2e-4b21-8539-8e247080735d",
        video_name=meta.get("video_name") or video.name,
        drive_url=meta.get("drive_url"),
        provider="anthropic",
        model=cfg.llm_model,
        status="completed",
        proposed_verdict=pipe.verdict.value,
        findings_count=len(pipe.findings),
        quality_score=quality,
        duration_ms=duration_ms,
        cost=cost,
        report=report,
    )
    print(f"Done: verdict={pipe.verdict.value} findings={len(pipe.findings)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
