"""Stage cache and resume helpers."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional


class StageCache:
    def __init__(self, work_dir: Path):
        self.work_dir = Path(work_dir)
        self.work_dir.mkdir(parents=True, exist_ok=True)
        self.meta_path = self.work_dir / "cache_meta.json"

    def path(self, name: str) -> Path:
        return self.work_dir / name

    def exists(self, name: str) -> bool:
        return self.path(name).exists()

    def write_json(self, name: str, data: Any) -> Path:
        p = self.path(name)
        p.parent.mkdir(parents=True, exist_ok=True)
        with p.open("w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return p

    def read_json(self, name: str) -> Any:
        with self.path(name).open(encoding="utf-8") as f:
            return json.load(f)

    def write_text(self, name: str, text: str) -> Path:
        p = self.path(name)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")
        return p

    def read_text(self, name: str) -> str:
        return self.path(name).read_text(encoding="utf-8")

    def set_stage(self, stage: str, status: str, error: Optional[str] = None) -> None:
        meta = {}
        if self.meta_path.exists():
            meta = json.loads(self.meta_path.read_text(encoding="utf-8"))
        stages = meta.setdefault("stages", {})
        stages[stage] = {"status": status, "error": error}
        meta["last_stage"] = stage
        self.meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    def stage_status(self, stage: str) -> Optional[str]:
        if not self.meta_path.exists():
            return None
        meta = json.loads(self.meta_path.read_text(encoding="utf-8"))
        return (meta.get("stages") or {}).get(stage, {}).get("status")

    def is_complete(self, stage: str) -> bool:
        return self.stage_status(stage) == "completed" and self._artifact_ok(stage)

    def _artifact_ok(self, stage: str) -> bool:
        mapping = {
            "audio": "audio.wav",
            "transcribe": "transcript.json",
            "frames": "frames.json",
            "ocr": "ocr.json",
            "segment": "segments.json",
            "review": "raw_findings.json",
            "evidence": "findings.json",
            "verdict": "verdict.json",
            "report": "report.json",
        }
        name = mapping.get(stage)
        return bool(name and self.exists(name))
