"""AI-assisted technical review per lesson segment."""

from __future__ import annotations

from pathlib import Path

from .llm import LLMClient
from .schema import Confidence, CourseMeta, Finding, LessonSegment, TranscriptSegment
from .transcribe import fmt_ts


def _load_prompt(version: str = "v1") -> str:
    path = Path(__file__).parent / "prompts" / version / "review.txt"
    return path.read_text(encoding="utf-8")


def _low_conf_near(transcript: list[TranscriptSegment], t_start: float, window: float = 20.0) -> bool:
    for s in transcript:
        if abs(((s.start + s.end) / 2) - t_start) <= window and s.low_confidence:
            return True
    return False


def _parse_ts(ts: str) -> float:
    parts = [float(p) for p in str(ts).strip().split(":")]
    sec = 0.0
    for p in parts:
        sec = sec * 60 + p
    return sec


def review_segments(
    llm: LLMClient,
    lessons: list[LessonSegment],
    course: CourseMeta,
    transcript: list[TranscriptSegment],
    prompt_version: str = "v1",
) -> list[Finding]:
    system = _load_prompt(prompt_version)
    findings: list[Finding] = []
    counter = 0

    for les in lessons:
        if not les.transcript_excerpt.strip():
            continue
        user = (
            f"Course title: {course.title or ''}\n"
            f"Field: {course.field}\n"
            f"Level: {course.level}\n"
            f"Language config: {course.language}\n"
            f"Declared stack versions: {', '.join(course.stack) or 'NOT PROVIDED'}\n"
            f"Glossary: {', '.join(course.glossary)}\n"
            f"Lesson: {les.id} — {les.title}\n"
            f"Context carry: {les.context_carry}\n\n"
            f"<transcript>\n{les.transcript_excerpt}\n</transcript>\n\n"
            f"<ocr>\n{les.ocr_excerpt or '(none)'}\n</ocr>"
        )
        data = llm.json(system, user, max_tokens=5000)
        for raw in data.get("findings") or []:
            counter += 1
            fid = f"{les.id}-{counter:03d}"
            try:
                evidence = raw.get("evidence") or {}
                quote = (evidence.get("quote") or "").strip()
                if not quote:
                    continue
                finding = Finding(
                    id=fid,
                    lesson=les.id,
                    t_start=str(raw.get("t_start") or fmt_ts(les.t_start)),
                    t_end=str(raw.get("t_end") or fmt_ts(les.t_end)),
                    category=raw.get("category") or "factual",
                    severity=raw.get("severity") or "unsure",
                    evidence={
                        "quote": quote,
                        "source_type": evidence.get("source_type") or "transcript",
                        "frame": evidence.get("frame"),
                        "ocr_text": evidence.get("ocr_text"),
                        "timestamp": str(raw.get("t_start") or ""),
                    },
                    expected=str(raw.get("expected") or ""),
                    correction=str(raw.get("correction") or ""),
                    confidence=raw.get("confidence") or "medium",
                    summary=str(raw.get("summary") or quote[:120]),
                )
                t0 = _parse_ts(finding.t_start)
                if _low_conf_near(transcript, t0):
                    finding.confidence = Confidence.low
                    finding.note = "check the audio at this timestamp"
                findings.append(finding)
            except Exception:
                continue
    return findings
