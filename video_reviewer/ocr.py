"""OCR extraction via pytesseract."""

from __future__ import annotations

import os
import shutil
from pathlib import Path

from .schema import FrameInfo, OcrResult


def _configure_tesseract() -> None:
    import pytesseract

    existing = shutil.which("tesseract")
    candidates = [
        existing,
        os.getenv("TESSERACT_CMD"),
        str(Path.home() / "AppData/Local/InstantPlusTools/bin/tesseract.exe"),
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    ]
    for cand in candidates:
        if cand and Path(cand).exists():
            pytesseract.pytesseract.tesseract_cmd = cand
            tessdata = Path(cand).resolve().parent.parent / "tessdata"
            if tessdata.exists() and not os.getenv("TESSDATA_PREFIX"):
                os.environ["TESSDATA_PREFIX"] = str(tessdata)
            break


def ocr_frames(
    work_dir: Path,
    frames: list[FrameInfo],
    high_confidence: float = 70.0,
    langs: str = "ara+eng",
) -> list[OcrResult]:
    import pytesseract
    from PIL import Image

    _configure_tesseract()
    results: list[OcrResult] = []
    for fr in frames:
        img_path = work_dir / fr.path
        if not img_path.exists():
            # try absolute/relative fallbacks
            alt = Path(fr.path)
            img_path = alt if alt.exists() else work_dir / Path(fr.path).name
        if not img_path.exists():
            continue
        try:
            img = Image.open(img_path)
            data = pytesseract.image_to_data(img, lang=langs, output_type=pytesseract.Output.DICT)
            texts: list[str] = []
            confs: list[float] = []
            n = len(data.get("text", []))
            for i in range(n):
                t = (data["text"][i] or "").strip()
                if not t:
                    continue
                try:
                    c = float(data["conf"][i])
                except (ValueError, TypeError):
                    c = -1.0
                if c >= 0:
                    texts.append(t)
                    confs.append(c)
            text = " ".join(texts).strip()
            if not text:
                continue
            conf = sum(confs) / len(confs) if confs else 0.0
            results.append(
                OcrResult(
                    frame=fr.path,
                    timestamp=fr.timestamp,
                    text=text,
                    confidence=conf,
                    high_confidence=conf >= high_confidence,
                )
            )
        except Exception:
            continue
    return results


def ocr_corpus(results: list[OcrResult]) -> str:
    lines = []
    for r in results:
        from .transcribe import fmt_ts

        lines.append(f"[{fmt_ts(r.timestamp)}] ({r.frame}) {r.text}")
    return "\n".join(lines)
