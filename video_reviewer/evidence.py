"""Evidence validation with rapidfuzz."""

from __future__ import annotations

from typing import Optional

from rapidfuzz import fuzz

from .schema import DroppedIssue, Finding, OcrResult, SourceType, TranscriptSegment
from .transcribe import fmt_ts


def _parse_ts(ts: str) -> float:
    parts = [float(p) for p in str(ts).strip().split(":")]
    sec = 0.0
    for p in parts:
        sec = sec * 60 + p
    return sec


def _best_transcript_match(quote: str, transcript: list[TranscriptSegment]) -> tuple[float, Optional[TranscriptSegment]]:
    best_score = 0.0
    best_seg: Optional[TranscriptSegment] = None
    for s in transcript:
        score = float(fuzz.partial_ratio(quote, s.text))
        if score > best_score:
            best_score = score
            best_seg = s
    return best_score, best_seg


def _best_ocr_match(quote: str, ocr: list[OcrResult]) -> tuple[float, Optional[OcrResult]]:
    best_score = 0.0
    best: Optional[OcrResult] = None
    for r in ocr:
        score = float(fuzz.partial_ratio(quote, r.text))
        if score > best_score:
            best_score = score
            best = r
    return best_score, best


def validate_findings(
    findings: list[Finding],
    transcript: list[TranscriptSegment],
    ocr: list[OcrResult],
    similarity_threshold: float = 85.0,
    duration: Optional[float] = None,
) -> tuple[list[Finding], list[DroppedIssue]]:
    kept: list[Finding] = []
    dropped: list[DroppedIssue] = []

    for f in findings:
        quote = (f.evidence.quote or "").strip()
        if not quote:
            dropped.append(DroppedIssue(finding=f.model_dump(), reason="empty_evidence_quote"))
            continue

        try:
            t_start = _parse_ts(f.t_start)
            t_end = _parse_ts(f.t_end)
        except Exception:
            dropped.append(DroppedIssue(finding=f.model_dump(), reason="invalid_timestamp"))
            continue

        if t_start < 0 or t_end < t_start:
            dropped.append(DroppedIssue(finding=f.model_dump(), reason="invalid_timestamp_range"))
            continue
        if duration is not None and t_start > duration + 5:
            dropped.append(
                DroppedIssue(
                    finding=f.model_dump(),
                    reason="timestamp_out_of_range",
                    details=f"t_start={t_start}, duration={duration}",
                )
            )
            continue

        t_score, t_seg = _best_transcript_match(quote, transcript)
        o_score, o_hit = _best_ocr_match(quote, ocr)
        best = max(t_score, o_score)

        if best < similarity_threshold:
            dropped.append(
                DroppedIssue(
                    finding=f.model_dump(),
                    reason="evidence_not_found",
                    evidence_match=best,
                    details=f"transcript={t_score:.1f}, ocr={o_score:.1f}, threshold={similarity_threshold}",
                )
            )
            continue

        # Attach best evidence metadata (system-controlled)
        if o_score >= t_score and o_hit is not None:
            f.evidence.source_type = SourceType.ocr
            f.evidence.frame = o_hit.frame
            f.evidence.ocr_text = o_hit.text
            f.evidence.timestamp = fmt_ts(o_hit.timestamp)
        elif t_seg is not None:
            f.evidence.source_type = SourceType.transcript
            f.evidence.timestamp = fmt_ts(t_seg.start)
            f.evidence.frame = None

        kept.append(f)

    return kept, dropped
