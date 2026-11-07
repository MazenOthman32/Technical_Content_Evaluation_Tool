"""AI-assisted topic segmentation with context carry-forward."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from .llm import LLMClient
from .schema import CourseMeta, LessonSegment, OcrResult, TranscriptSegment
from .transcribe import fmt_ts, transcript_lines


def _load_prompt(version: str = "v1") -> str:
    path = Path(__file__).parent / "prompts" / version / "segment.txt"
    return path.read_text(encoding="utf-8")


def _fallback_segments(
    transcript: list[TranscriptSegment],
    window: float = 480.0,
    overlap: float = 60.0,
) -> list[LessonSegment]:
    if not transcript:
        return []
    end = transcript[-1].end
    segs: list[LessonSegment] = []
    t = 0.0
    idx = 1
    step = max(1.0, window - overlap)
    while t < end:
        te = min(end, t + window)
        part = [s for s in transcript if s.end > t and s.start < te]
        if part:
            segs.append(
                LessonSegment(
                    id=f"L{idx}",
                    title=f"Segment {idx}",
                    t_start=t,
                    t_end=te,
                    transcript_excerpt=transcript_lines(part),
                )
            )
            idx += 1
        if te >= end:
            break
        t += step
    return segs


def segment_lessons(
    llm: LLMClient,
    transcript: list[TranscriptSegment],
    ocr: list[OcrResult],
    course: CourseMeta,
    overlap: float = 60.0,
    prompt_version: str = "v1",
) -> list[LessonSegment]:
    if not transcript:
        return []

    system = _load_prompt(prompt_version)
    user = (
        f"Course field: {course.field}\n"
        f"Level: {course.level}\n"
        f"Stack: {', '.join(course.stack)}\n"
        f"Preferred overlap seconds: {overlap}\n\n"
        f"<transcript>\n{transcript_lines(transcript)}\n</transcript>"
    )
    try:
        data = llm.json(system, user, max_tokens=4000)
        raw = data.get("segments") or []
    except Exception:
        return _attach_excerpts(_fallback_segments(transcript, overlap=overlap), transcript, ocr)

    lessons: list[LessonSegment] = []
    for i, s in enumerate(raw, 1):
        try:
            lid = str(s.get("id") or f"L{i}")
            lessons.append(
                LessonSegment(
                    id=lid,
                    title=str(s.get("title") or lid),
                    t_start=float(s["t_start"]),
                    t_end=float(s["t_end"]),
                    context_carry=s.get("context_carry") or {},
                )
            )
        except Exception:
            continue

    if not lessons:
        lessons = _fallback_segments(transcript, overlap=overlap)
    return _attach_excerpts(lessons, transcript, ocr)


def _attach_excerpts(
    lessons: list[LessonSegment],
    transcript: list[TranscriptSegment],
    ocr: list[OcrResult],
) -> list[LessonSegment]:
    carry: dict = {"functions": [], "variables": [], "technologies": [], "versions": []}
    out: list[LessonSegment] = []
    for les in lessons:
        part = [s for s in transcript if s.end > les.t_start and s.start < les.t_end]
        ocr_part = [o for o in ocr if les.t_start <= o.timestamp <= les.t_end]
        merged = dict(carry)
        merged.update(les.context_carry or {})
        les.context_carry = merged
        les.transcript_excerpt = transcript_lines(part)
        les.ocr_excerpt = "\n".join(f"[{fmt_ts(o.timestamp)}] {o.text}" for o in ocr_part)
        # propagate for next
        for key in carry:
            vals = les.context_carry.get(key) or []
            if isinstance(vals, list):
                carry[key] = list(dict.fromkeys([*carry[key], *vals]))
        out.append(les)
    return out
