"""Frame extraction: scene changes, pre-change, periodic sampling."""

from __future__ import annotations

import hashlib
from pathlib import Path

from .media import extract_frame_at, probe_duration, scene_change_times
from .schema import FrameInfo


def _fingerprint(path: Path, sample: int = 8192) -> str:
    h = hashlib.md5()
    with path.open("rb") as f:
        h.update(f.read(sample))
    return h.hexdigest()


def select_timestamps(
    duration: float,
    scene_times: list[float],
    sample_interval: float = 20.0,
    pre_change_offset: float = 0.4,
) -> list[tuple[float, str]]:
    chosen: dict[float, str] = {}

    def add(t: float, reason: str) -> None:
        t = max(0.0, min(duration - 0.05, t)) if duration > 0.1 else 0.0
        key = round(t, 2)
        if key not in chosen:
            chosen[key] = reason

    # Periodic sampling
    t = 0.0
    while t < duration:
        add(t, "sample")
        t += sample_interval

    # Scene changes + pre-change
    for st in scene_times:
        add(st, "scene")
        add(st - pre_change_offset, "pre_change")

    return sorted((t, r) for t, r in ((k, v) for k, v in chosen.items()))


def extract_frames(
    video: Path,
    out_dir: Path,
    scene_threshold: float = 0.3,
    sample_interval: float = 20.0,
    pre_change_offset: float = 0.4,
) -> list[FrameInfo]:
    out_dir.mkdir(parents=True, exist_ok=True)
    duration = probe_duration(video)
    scenes = scene_change_times(video, threshold=scene_threshold)
    stamps = select_timestamps(duration, scenes, sample_interval, pre_change_offset)

    frames: list[FrameInfo] = []
    seen_fp: set[str] = set()
    for ts, reason in stamps:
        name = f"{int(ts // 3600):02d}_{int((ts % 3600) // 60):02d}_{int(ts % 60):02d}_{int((ts % 1) * 1000):03d}.jpg"
        path = out_dir / name
        try:
            extract_frame_at(video, ts, path)
        except Exception:
            continue
        if not path.exists() or path.stat().st_size < 100:
            continue
        fp = _fingerprint(path)
        if fp in seen_fp:
            path.unlink(missing_ok=True)
            continue
        seen_fp.add(fp)
        rel = f"frames/{name}"
        frames.append(FrameInfo(path=rel, timestamp=ts, reason=reason))
    return frames
