"""Future verification extension points (Phase 2).

Phase 1 supports model_only verification only.
"""

from __future__ import annotations

from typing import Any, Optional

from .schema import Finding, Verification


def verify_finding(finding: Finding, **_kwargs: Any) -> Finding:
    """Phase 1: leave verification as model_only with null result."""
    finding.verification = Verification(method="model_only", result=None)
    return finding


def run_code_sandbox(_code: str) -> Optional[dict]:
    """Reserved for Phase 2a isolated code execution."""
    raise NotImplementedError("Code sandbox verification is planned for Phase 2a.")


def check_official_docs(_claim: str) -> Optional[dict]:
    """Reserved for Phase 2b documentation verification."""
    raise NotImplementedError("Official documentation verification is planned for Phase 2b.")
