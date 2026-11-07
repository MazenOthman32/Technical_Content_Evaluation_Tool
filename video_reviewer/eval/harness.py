"""Golden dataset evaluation harness."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional


def _parse_ts(ts: str) -> float:
    parts = [float(p) for p in str(ts).strip().split(":")]
    sec = 0.0
    for p in parts:
        sec = sec * 60 + p
    return sec


def match_findings(
    expected: list[dict],
    detected: list[dict],
    tolerance_sec: float = 15.0,
) -> dict[str, Any]:
    matched_exp: set[int] = set()
    matched_det: set[int] = set()
    pairs: list[dict] = []

    for i, exp in enumerate(expected):
        exp_t = _parse_ts(exp.get("t_start") or exp.get("timestamp") or "00:00:00")
        exp_cat = exp.get("category")
        best_j = None
        best_dt = None
        for j, det in enumerate(detected):
            if j in matched_det:
                continue
            det_t = _parse_ts(det.get("t_start") or det.get("timestamp") or "00:00:00")
            if exp_cat and det.get("category") and exp_cat != det.get("category"):
                continue
            dt = abs(det_t - exp_t)
            if dt <= tolerance_sec and (best_dt is None or dt < best_dt):
                best_dt = dt
                best_j = j
        if best_j is not None:
            matched_exp.add(i)
            matched_det.add(best_j)
            pairs.append({"expected_index": i, "detected_index": best_j, "dt": best_dt})

    tp = len(matched_exp)
    fp = len(detected) - len(matched_det)
    fn = len(expected) - len(matched_exp)
    precision = tp / len(detected) if detected else 0.0
    recall = tp / len(expected) if expected else 0.0

    # Critical recall
    exp_crit = [e for e in expected if e.get("severity") == "critical"]
    det_by_idx = {j: detected[j] for j in matched_det}
    crit_matched = 0
    for i, e in enumerate(expected):
        if e.get("severity") != "critical":
            continue
        if i in matched_exp:
            crit_matched += 1
    critical_recall = crit_matched / len(exp_crit) if exp_crit else 1.0

    timestamp_errors = [p["dt"] for p in pairs]
    avg_ts_error = sum(timestamp_errors) / len(timestamp_errors) if timestamp_errors else 0.0

    return {
        "true_positives": tp,
        "false_positives": fp,
        "false_negatives": fn,
        "precision": precision,
        "recall": recall,
        "critical_recall": critical_recall,
        "avg_timestamp_error_sec": avg_ts_error,
        "pairs": pairs,
    }


def evaluate_case(case_dir: Path, tolerance_sec: float = 15.0) -> dict[str, Any]:
    expected_path = case_dir / "expected.json"
    detected_path = case_dir / "detected.json"
    if not expected_path.exists():
        return {"case": case_dir.name, "error": "missing expected.json"}
    expected = json.loads(expected_path.read_text(encoding="utf-8"))
    if isinstance(expected, dict):
        expected = expected.get("findings") or []
    if detected_path.exists():
        detected = json.loads(detected_path.read_text(encoding="utf-8"))
        if isinstance(detected, dict):
            detected = detected.get("findings") or []
    else:
        # Try report.json from a prior run path referenced in case meta
        report = case_dir / "report.json"
        if report.exists():
            detected = json.loads(report.read_text(encoding="utf-8")).get("findings") or []
        else:
            detected = []
    metrics = match_findings(expected, detected, tolerance_sec=tolerance_sec)
    metrics["case"] = case_dir.name
    metrics["expected_count"] = len(expected)
    metrics["detected_count"] = len(detected)
    return metrics


def run_evaluation(
    golden_dir: Path,
    out_dir: Path,
    config_path: Optional[str] = None,
    tolerance_sec: float = 15.0,
) -> dict[str, Any]:
    golden_dir = Path(golden_dir)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    cases = sorted([p for p in golden_dir.iterdir() if p.is_dir()]) if golden_dir.exists() else []
    results = [evaluate_case(c, tolerance_sec=tolerance_sec) for c in cases]

    if results:
        precision = sum(r.get("precision", 0) for r in results) / len(results)
        recall = sum(r.get("recall", 0) for r in results) / len(results)
        crit = sum(r.get("critical_recall", 0) for r in results) / len(results)
        avg_ts = sum(r.get("avg_timestamp_error_sec", 0) for r in results) / len(results)
    else:
        precision = recall = crit = avg_ts = 0.0

    summary = {
        "cases": len(results),
        "precision": precision,
        "recall": recall,
        "critical_recall": crit,
        "avg_timestamp_error_sec": avg_ts,
        "details": results,
        "config_path": config_path,
        "note": "لا توجد حالات golden" if not results else None,
    }
    (out_dir / "eval_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return summary
