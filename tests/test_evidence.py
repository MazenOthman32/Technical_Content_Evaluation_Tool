from video_reviewer.evidence import validate_findings
from video_reviewer.schema import (
    Category,
    Confidence,
    Evidence,
    Finding,
    OcrResult,
    Severity,
    TranscriptSegment,
)


def _finding(quote: str, t_start: str = "00:00:10") -> Finding:
    return Finding(
        id="L1-001",
        lesson="L1",
        t_start=t_start,
        t_end="00:00:20",
        category=Category.factual,
        severity=Severity.medium,
        evidence=Evidence(quote=quote),
        expected="x",
        correction="y",
        confidence=Confidence.high,
        summary="s",
    )


def test_keeps_matching_transcript_evidence():
    transcript = [
        TranscriptSegment(start=8, end=14, text="The loop starts from 1 and ends at 10"),
    ]
    kept, dropped = validate_findings(
        [_finding("The loop starts from 1 and ends at 10")],
        transcript,
        [],
        similarity_threshold=85,
    )
    assert len(kept) == 1
    assert dropped == []
    assert kept[0].evidence.source_type.value == "transcript"


def test_drops_unverified_quote():
    transcript = [TranscriptSegment(start=0, end=5, text="hello world")]
    kept, dropped = validate_findings(
        [_finding("completely unrelated technical claim about FastAPI")],
        transcript,
        [],
        similarity_threshold=85,
    )
    assert kept == []
    assert len(dropped) == 1
    assert dropped[0].reason == "evidence_not_found"


def test_ocr_evidence_preferred_when_stronger():
    transcript = [TranscriptSegment(start=0, end=5, text="unrelated speech")]
    ocr = [
        OcrResult(
            frame="frames/00_00_10_000.jpg",
            timestamp=10,
            text="for i in range(10):",
            confidence=90,
            high_confidence=True,
        )
    ]
    kept, dropped = validate_findings(
        [_finding("for i in range(10):")],
        transcript,
        ocr,
        similarity_threshold=85,
    )
    assert len(kept) == 1
    assert kept[0].evidence.source_type.value == "ocr"
    assert kept[0].evidence.frame.endswith(".jpg")
