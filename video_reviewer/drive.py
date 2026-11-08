"""Google Drive download helpers."""

from __future__ import annotations

import os
import re
from pathlib import Path

MEDIA_EXT = {".mp4", ".mkv", ".mov", ".webm", ".avi", ".m4v", ".m4a", ".mp3", ".wav"}


def parse_drive_link(url: str) -> tuple[str, str]:
    m = re.search(r"/folders/([a-zA-Z0-9_-]+)", url)
    if m:
        return "folder", m.group(1)
    for pat in (r"/file/d/([a-zA-Z0-9_-]+)", r"[?&]id=([a-zA-Z0-9_-]+)", r"/d/([a-zA-Z0-9_-]+)"):
        m = re.search(pat, url)
        if m:
            return "file", m.group(1)
    raise ValueError(f"مش قادر أفهم لينك الـ Drive ده: {url}")


def download_from_drive(url: str, out_dir: Path) -> Path:
    import gdown

    kind, fid = parse_drive_link(url.strip())
    out_dir.mkdir(parents=True, exist_ok=True)
    share_hint = (
        "اتأكد إن الملف متشير 'Anyone with the link can view' "
        "(أو نزّله يدوي وارفعه كملف)."
    )
    if kind == "file":
        path = gdown.download(id=fid, output=str(out_dir) + os.sep, quiet=False)
        if not path:
            raise RuntimeError("فشل تنزيل Drive. " + share_hint)
        return Path(path)

    paths = gdown.download_folder(id=fid, output=str(out_dir), quiet=False)
    if not paths:
        raise RuntimeError("فشل تنزيل فولدر Drive. " + share_hint)
    media = sorted(Path(p) for p in paths if Path(p).suffix.lower() in MEDIA_EXT)
    if not media:
        raise RuntimeError("الفولدر مفيهوش ملفات فيديو.")
    return media[0]
