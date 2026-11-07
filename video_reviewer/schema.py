"""Pydantic data models for Instant Plus Video Reviewer (Phase 1)."""

from __future__ import annotations

from enum import Enum
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class Severity(str, Enum):
    critical = "critical"
    medium = "medium"
    minor = "minor"
    unsure = "unsure"


class Category(str, Enum):
    factual = "factual"
    code_bug = "code_bug"
    outdated = "outdated"
    mismatch = "mismatch"
    pedagogy = "pedagogy"
    quiz = "quiz"


class Confidence(str, Enum):
    high = "high"
    medium = "medium"
    low = "low"


class SourceType(str, Enum):
    transcript = "transcript"
    ocr = "ocr"
    frame = "frame"


class StageStatus(str, Enum):
    pending = "pending"
    processing = "processing"
    completed = "completed"
    failed = "failed"
    skipped = "skipped"


class Verdict(str, Enum):
    fix_required = "fix_required"
    approve_with_notes = "approve_with_notes"
    needs_human_review = "needs_human_review"
    no_issues_found_by_tool = "no_issues_found_by_tool"


class Evidence(BaseModel):
    quote: str
    source_type: SourceType = SourceType.transcript
    frame: Optional[str] = None
    ocr_text: Optional[str] = None
    timestamp: Optional[str] = None


class Verification(BaseModel):
    method: Literal["model_only"] = "model_only"
    result: Optional[Any] = None


class Finding(BaseModel):
    id: str
    lesson: str
    t_start: str
    t_end: str
    category: Category
    severity: Severity
    evidence: Evidence
    expected: str
    correction: str
    verification: Verification = Field(default_factory=Verification)
    source_url: Optional[str] = None
    confidence: Confidence = Confidence.medium
    agreement: Optional[Any] = None
    review_status: Literal["open"] = "open"
    summary: str
    note: Optional[str] = None


class TranscriptSegment(BaseModel):
    start: float
    end: float
    text: str
    avg_logprob: Optional[float] = None
    low_confidence: bool = False


class FrameInfo(BaseModel):
    path: str
    timestamp: float
    reason: str = "sample"  # scene | pre_change | sample


class OcrResult(BaseModel):
    frame: str
    timestamp: float
    text: str
    confidence: float
    high_confidence: bool = False


class LessonSegment(BaseModel):
    id: str
    title: str
    t_start: float
    t_end: float
    context_carry: dict[str, Any] = Field(default_factory=dict)
    transcript_excerpt: str = ""
    ocr_excerpt: str = ""


class CourseMeta(BaseModel):
    field: str = "general"
    level: str = "intermediate"
    language: str = "auto"  # ar | en | auto
    stack: list[str] = Field(default_factory=list)
    glossary: list[str] = Field(default_factory=list)
    title: Optional[str] = None


class DroppedIssue(BaseModel):
    finding: dict[str, Any]
    reason: str
    evidence_match: Optional[float] = None
    details: Optional[str] = None


class CostInfo(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0
    image_requests: int = 0
    text_requests: int = 0
    estimated_usd: float = 0.0
    max_cost: Optional[float] = None


class StageState(BaseModel):
    name: str
    status: StageStatus = StageStatus.pending
    error: Optional[str] = None
    started_at: Optional[str] = None
    finished_at: Optional[str] = None


class ReviewReport(BaseModel):
    review_id: str
    video_name: str
    course: CourseMeta
    model: str
    prompt_version: str = "v1"
    processing_status: str
    proposed_verdict: Verdict
    findings: list[Finding] = Field(default_factory=list)
    stages: list[StageState] = Field(default_factory=list)
    cost: CostInfo = Field(default_factory=CostInfo)
    limitations: list[str] = Field(default_factory=list)
    created_at: Optional[str] = None
    duration_sec: Optional[float] = None
