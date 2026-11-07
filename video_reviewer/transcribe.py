"""Speech transcription with faster-whisper."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from .schema import CourseMeta, TranscriptSegment


def _pick_model(requested: str) -> str:
    if requested and requested != "auto":
        return requested
    try:
        import torch

        if torch.cuda.is_available():
            return "large-v3"
    except Exception:
        pass
    return "small"


def _language_arg(lang: str) -> Optional[str]:
    if not lang or lang == "auto":
        return None
    if lang in {"ar", "en"}:
        return lang
    return None


def build_initial_prompt(course: CourseMeta) -> str:
    terms = ", ".join(course.glossary + course.stack)
    base = (
        "Technical educational lecture. Preserve English technical terms exactly. "
        "May mix Arabic and English."
    )
    if terms:
        return f"{base} Domain terms: {terms}."
    return base


def transcribe(
    audio: Path,
    course: CourseMeta,
    model_size: str = "auto",
    low_confidence_logprob: float = -1.0,
) -> list[TranscriptSegment]:
    from faster_whisper import WhisperModel

    size = _pick_model(model_size)
    model = WhisperModel(size, device="auto", compute_type="default")
    prompt = build_initial_prompt(course)
    language = _language_arg(course.language)

    segs, _info = model.transcribe(
        str(audio),
        initial_prompt=prompt,
        vad_filter=True,
        language=language,
        word_timestamps=False,
    )

    out: list[TranscriptSegment] = []
    for s in segs:
        text = (s.text or "").strip()
        if not text:
            continue
        avg = getattr(s, "avg_logprob", None)
        low = bool(avg is not None and avg < low_confidence_logprob)
        out.append(
            TranscriptSegment(
                start=float(s.start),
                end=float(s.end),
                text=text,
                avg_logprob=avg,
                low_confidence=low,
            )
        )
    return out


def fmt_ts(seconds: float) -> str:
    seconds = max(0, int(round(seconds)))
    return f"{seconds // 3600:02d}:{(seconds % 3600) // 60:02d}:{seconds % 60:02d}"


def transcript_lines(segments: list[TranscriptSegment]) -> str:
    return "\n".join(f"[{fmt_ts(s.start)}] {s.text}" for s in segments)
