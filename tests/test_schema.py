from video_reviewer.schema import Finding, ReviewReport, Verdict


def test_finding_defaults():
    f = Finding(
        id="L2-003",
        lesson="L2",
        t_start="00:10:00",
        t_end="00:10:20",
        category="code_bug",
        severity="critical",
        evidence={"quote": "x = 1/0", "source_type": "ocr"},
        expected="avoid division by zero",
        correction="guard the denominator",
        confidence="high",
        summary="division by zero",
    )
    assert f.review_status == "open"
    assert f.verification.method == "model_only"
    assert f.source_url is None


def test_report_roundtrip():
    report = ReviewReport(
        review_id="r1",
        video_name="a.mp4",
        course={"field": "backend"},
        model="claude-sonnet-5-5",
        processing_status="completed",
        proposed_verdict=Verdict.no_issues_found_by_tool,
    )
    data = report.model_dump()
    again = ReviewReport(**data)
    assert again.proposed_verdict == Verdict.no_issues_found_by_tool
