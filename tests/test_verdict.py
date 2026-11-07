from video_reviewer.schema import Category, Confidence, Evidence, Finding, Severity, Verdict
from video_reviewer.verdict import calculate_verdict


def _f(severity: str, category: str = "factual") -> Finding:
    return Finding(
        id="L1-001",
        lesson="L1",
        t_start="00:01:00",
        t_end="00:01:10",
        category=Category(category),
        severity=Severity(severity),
        evidence=Evidence(quote="sample quote"),
        expected="expected",
        correction="fix",
        confidence=Confidence.high,
        summary="summary",
    )


def test_fix_required_on_critical():
    assert calculate_verdict([_f("critical")], processing_complete=True) == Verdict.fix_required


def test_fix_required_on_medium():
    assert calculate_verdict([_f("medium")], processing_complete=True) == Verdict.fix_required


def test_approve_with_notes_minor_only():
    assert calculate_verdict([_f("minor")], processing_complete=True) == Verdict.approve_with_notes


def test_needs_human_review_unsure_only():
    assert calculate_verdict([_f("unsure")], processing_complete=True) == Verdict.needs_human_review


def test_no_issues():
    assert calculate_verdict([], processing_complete=True) == Verdict.no_issues_found_by_tool


def test_incomplete_never_clean():
    assert calculate_verdict([], processing_complete=False) == Verdict.needs_human_review


def test_empty_transcript():
    assert (
        calculate_verdict([], processing_complete=True, transcript_empty=True)
        == Verdict.needs_human_review
    )


def test_pedagogy_excluded_from_verdict_by_default():
    assert (
        calculate_verdict([_f("critical", "pedagogy")], processing_complete=True)
        == Verdict.no_issues_found_by_tool
    )


def test_pedagogy_included_when_enabled():
    assert (
        calculate_verdict(
            [_f("critical", "pedagogy")],
            processing_complete=True,
            include_pedagogy=True,
        )
        == Verdict.fix_required
    )
