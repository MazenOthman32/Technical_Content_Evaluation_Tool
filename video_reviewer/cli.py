"""Command-line interface for Instant Plus Video Reviewer."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .config import load_course_meta, load_system_config
from .pipeline import Pipeline


def cmd_review(args: argparse.Namespace) -> int:
    video = Path(args.video)
    if not video.exists():
        print(f"الملف غير موجود: {video}", file=sys.stderr)
        return 1

    overrides = {"max_cost": args.max_cost} if args.max_cost is not None else {}
    config = load_system_config(args.config, overrides=overrides)
    course = load_course_meta(args.course)

    def progress(stage: str, status: str, error: str | None = None) -> None:
        msg = f"[{stage}] {status}"
        if error:
            msg += f" — {error}"
        print(msg, flush=True)

    pipe = Pipeline(
        video=video,
        course=course,
        config=config,
        resume=not args.no_resume,
        on_progress=progress,
        api_key=args.api_key,
    )
    try:
        out = pipe.run()
    except Exception as e:
        print(f"فشلت المراجعة: {e}", file=sys.stderr)
        print(f"مجلد العمل: {pipe.work_dir}", file=sys.stderr)
        return 2

    print(f"اكتملت المراجعة: {out}")
    print(f"الحكم المقترح: {pipe.verdict.value}")
    print(f"عدد الملاحظات: {len(pipe.findings)}")
    return 0


def cmd_ui(args: argparse.Namespace) -> int:
    import uvicorn

    config = load_system_config(args.config)
    host = args.host or config.host
    port = args.port or config.port
    print(f"تشغيل الواجهة على http://{host}:{port}")
    uvicorn.run(
        "video_reviewer.web:app",
        host=host,
        port=port,
        reload=False,
    )
    return 0


def cmd_eval(args: argparse.Namespace) -> int:
    from .eval.harness import run_evaluation

    golden = Path(args.golden)
    out = Path(args.out)
    result = run_evaluation(golden, out, config_path=args.config)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="video-reviewer", description="Instant Plus Video Reviewer")
    sub = p.add_subparsers(dest="command", required=True)

    r = sub.add_parser("review", help="مراجعة فيديو")
    r.add_argument("video", help="مسار ملف الفيديو")
    r.add_argument("--course", required=True, help="ملف YAML لبيانات الكورس")
    r.add_argument("--config", default=None, help="ملف إعدادات النظام")
    r.add_argument("--max-cost", type=float, default=None)
    r.add_argument("--api-key", default=None)
    r.add_argument("--no-resume", action="store_true")
    r.set_defaults(func=cmd_review)

    u = sub.add_parser("ui", help="تشغيل الواجهة المحلية")
    u.add_argument("--config", default=None)
    u.add_argument("--host", default=None)
    u.add_argument("--port", type=int, default=None)
    u.set_defaults(func=cmd_ui)

    e = sub.add_parser("eval", help="تقييم على golden dataset")
    e.add_argument("--golden", default="golden/")
    e.add_argument("--out", default="results/")
    e.add_argument("--config", default=None)
    e.set_defaults(func=cmd_eval)

    return p


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
