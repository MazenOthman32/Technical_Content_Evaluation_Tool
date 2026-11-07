"""Video/audio helpers via FFmpeg."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path


class DependencyError(RuntimeError):
    pass


def require_bin(name: str) -> str:
    path = shutil.which(name)
    if not path:
        raise DependencyError(
            f"الأداة '{name}' غير موجودة في PATH. ثبّت FFmpeg/FFprobe ثم أعد المحاولة."
        )
    return path


def run(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, check=True, capture_output=True, text=True)


def probe_duration(path: Path) -> float:
    require_bin("ffprobe")
    out = run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ]
    ).stdout.strip()
    return float(out)


def extract_audio(video: Path, out: Path) -> Path:
    """Extract mono WAV at 16 kHz."""
    require_bin("ffmpeg")
    out.parent.mkdir(parents=True, exist_ok=True)
    run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(video),
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "pcm_s16le",
            str(out),
        ]
    )
    return out


def extract_frame_at(video: Path, timestamp: float, out: Path) -> Path:
    require_bin("ffmpeg")
    out.parent.mkdir(parents=True, exist_ok=True)
    run(
        [
            "ffmpeg",
            "-y",
            "-ss",
            f"{timestamp:.3f}",
            "-i",
            str(video),
            "-frames:v",
            "1",
            "-q:v",
            "2",
            str(out),
        ]
    )
    return out


def scene_change_times(video: Path, threshold: float = 0.3) -> list[float]:
    """Return timestamps where scene changes are detected."""
    require_bin("ffprobe")
    # Use ffmpeg select filter with showinfo via ffprobe-like approach
    require_bin("ffmpeg")
    cmd = [
        "ffmpeg",
        "-i",
        str(video),
        "-vf",
        f"select='gt(scene,{threshold})',showinfo",
        "-vsync",
        "vfr",
        "-f",
        "null",
        "-",
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    times: list[float] = []
    for line in (proc.stderr or "").splitlines():
        if "pts_time:" in line:
            try:
                part = line.split("pts_time:")[1].split()[0]
                times.append(float(part))
            except (IndexError, ValueError):
                continue
    return times
