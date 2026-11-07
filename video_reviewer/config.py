"""Configuration loading and defaults for Instant Plus Video Reviewer."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Optional

import yaml
from pydantic import BaseModel, Field

from .schema import CourseMeta


class SystemConfig(BaseModel):
    whisper_model: str = "auto"  # auto | large-v3 | small | ...
    low_confidence_logprob: float = -1.0
    scene_threshold: float = 0.3
    frame_sample_interval: float = 20.0
    pre_change_offset: float = 0.4
    ocr_engine: str = "pytesseract"
    ocr_high_confidence: float = 70.0
    llm_model: str = "claude-sonnet-5-5"
    temperature: float = 0.0
    evidence_similarity: float = 85.0
    segmentation_overlap: float = 60.0
    prompt_version: str = "v1"
    max_cost: Optional[float] = None
    include_pedagogy_in_verdict: bool = False
    include_quiz_in_verdict: bool = False
    data_dir: str = "data/reviews"
    host: str = "127.0.0.1"
    port: int = 8765


def load_yaml(path: Path | str) -> dict[str, Any]:
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"ملف الإعدادات غير موجود: {p}")
    with p.open(encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    if not isinstance(data, dict):
        raise ValueError(f"ملف YAML يجب أن يكون قاموساً: {p}")
    return data


def load_system_config(path: Optional[Path | str] = None, overrides: Optional[dict] = None) -> SystemConfig:
    raw: dict[str, Any] = {}
    if path:
        raw.update(load_yaml(path))
    if overrides:
        raw.update({k: v for k, v in overrides.items() if v is not None})
    return SystemConfig(**raw)


def load_course_meta(path: Optional[Path | str] = None, overrides: Optional[dict] = None) -> CourseMeta:
    raw: dict[str, Any] = {}
    if path:
        raw.update(load_yaml(path))
    if overrides:
        for k, v in overrides.items():
            if v is None:
                continue
            if k == "stack" and isinstance(v, str):
                raw[k] = [s.strip() for s in v.split(",") if s.strip()]
            elif k == "glossary" and isinstance(v, str):
                raw[k] = [s.strip() for s in v.split(",") if s.strip()]
            else:
                raw[k] = v
    return CourseMeta(**raw)


def default_data_dir(cfg: SystemConfig, base: Optional[Path] = None) -> Path:
    root = base or Path.cwd()
    return (root / cfg.data_dir).resolve()
