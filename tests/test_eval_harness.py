from video_reviewer.eval.harness import match_findings


def test_match_within_tolerance():
    expected = [{"t_start": "00:01:00", "category": "factual", "severity": "critical"}]
    detected = [{"t_start": "00:01:10", "category": "factual", "severity": "critical"}]
    m = match_findings(expected, detected, tolerance_sec=15)
    assert m["true_positives"] == 1
    assert m["precision"] == 1.0
    assert m["critical_recall"] == 1.0


def test_false_positive():
    expected = [{"t_start": "00:01:00", "category": "factual", "severity": "critical"}]
    detected = [
        {"t_start": "00:01:05", "category": "factual", "severity": "critical"},
        {"t_start": "00:10:00", "category": "code_bug", "severity": "medium"},
    ]
    m = match_findings(expected, detected, tolerance_sec=15)
    assert m["false_positives"] == 1
