"""Deterministic proposed verdict rules."""

from __future__ import annotations

from .schema import Finding, Severity, Verdict


def calculate_verdict(
    findings: list[Finding],
    *,
    processing_complete: bool,
    transcript_empty: bool = False,
    include_pedagogy: bool = False,
    include_quiz: bool = False,
) -> Verdict:
    if not processing_complete or transcript_empty:
        return Verdict.needs_human_review

    relevant = []
    for f in findings:
        if f.category.value == "pedagogy" and not include_pedagogy:
            continue
        if f.category.value == "quiz" and not include_quiz:
            continue
        relevant.append(f)

    if not relevant:
        return Verdict.no_issues_found_by_tool

    severities = {f.severity for f in relevant}
    if Severity.critical in severities or Severity.medium in severities:
        return Verdict.fix_required

    non_unsure = [f for f in relevant if f.severity != Severity.unsure]
    if non_unsure and all(f.severity == Severity.minor for f in non_unsure):
        # minor only (possibly with unsure also present — critical/medium already handled)
        if Severity.unsure in severities and not non_unsure:
            return Verdict.needs_human_review
        return Verdict.approve_with_notes

    if severities == {Severity.unsure} or (not non_unsure and Severity.unsure in severities):
        return Verdict.needs_human_review

    if all(f.severity == Severity.minor for f in relevant):
        return Verdict.approve_with_notes

    return Verdict.needs_human_review


def severity_counts(findings: list[Finding]) -> dict[str, int]:
    counts = {s.value: 0 for s in Severity}
    for f in findings:
        counts[f.severity.value] = counts.get(f.severity.value, 0) + 1
    return counts
