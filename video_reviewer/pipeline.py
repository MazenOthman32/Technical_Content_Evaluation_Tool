"""End-to-end processing orchestration with resume support."""

from __future__ import annotations

import datetime as dt
import json
import shutil
import uuid
from pathlib import Path
from typing import Callable, Optional

from .cache import StageCache
from .config import SystemConfig, default_data_dir
from .evidence import validate_findings
from .frames import extract_frames
from .llm import CostLimitExceeded, LLMClient
from .media import extract_audio, probe_duration
from .ocr import ocr_frames
from .report import LIMITATIONS, make_report, write_reports
from .review import review_segments
from .schema import (
    CourseMeta,
    DroppedIssue,
    Finding,
    FrameInfo,
    LessonSegment,
    OcrResult,
    StageState,
    StageStatus,
    TranscriptSegment,
    Verdict,
)
from .segment import segment_lessons
from .transcribe import transcribe
from .verdict import calculate_verdict


ProgressCB = Callable[[str, str, Optional[str]], None]


class Pipeline:
    STAGES = [
        "audio",
        "transcribe",
        "frames",
        "ocr",
        "segment",
        "review",
        "evidence",
        "verdict",
        "report",
    ]

    def __init__(
        self,
        video: Path,
        course: CourseMeta,
        config: SystemConfig,
        *,
        review_id: Optional[str] = None,
        work_dir: Optional[Path] = None,
        api_key: Optional[str] = None,
        resume: bool = True,
        on_progress: Optional[ProgressCB] = None,
        copy_video: bool = True,
    ):
        self.video = Path(video)
        self.course = course
        self.config = config
        self.resume = resume
        self.on_progress = on_progress
        self.api_key = api_key
        self.review_id = review_id or dt.datetime.now().strftime("%Y%m%d_%H%M%S") + "_" + uuid.uuid4().hex[:6]
        base = default_data_dir(config)
        self.work_dir = Path(work_dir) if work_dir else base / self.review_id
        self.work_dir.mkdir(parents=True, exist_ok=True)
        self.cache = StageCache(self.work_dir)
        self.stages: dict[str, StageState] = {
            s: StageState(name=s, status=StageStatus.pending) for s in self.STAGES
        }
        self.llm: Optional[LLMClient] = None
        self.duration: Optional[float] = None
        self.transcript: list[TranscriptSegment] = []
        self.frames: list[FrameInfo] = []
        self.ocr: list[OcrResult] = []
        self.lessons: list[LessonSegment] = []
        self.raw_findings: list[Finding] = []
        self.findings: list[Finding] = []
        self.dropped: list[DroppedIssue] = []
        self.verdict: Verdict = Verdict.needs_human_review
        self.processing_status = "running"
        self.copy_video = copy_video
        self._persist_meta()

    def _emit(self, stage: str, status: str, error: Optional[str] = None) -> None:
        st = self.stages[stage]
        st.status = StageStatus(status)
        st.error = error
        now = dt.datetime.now().isoformat(timespec="seconds")
        if status == "processing":
            st.started_at = now
        if status in {"completed", "failed", "skipped"}:
            st.finished_at = now
        self.cache.set_stage(stage, status, error)
        self._persist_meta()
        if self.on_progress:
            self.on_progress(stage, status, error)

    def _persist_meta(self) -> None:
        meta = {
            "review_id": self.review_id,
            "video_name": self.video.name,
            "course": self.course.model_dump(),
            "config": self.config.model_dump(),
            "processing_status": self.processing_status,
            "stages": {k: v.model_dump() for k, v in self.stages.items()},
            "proposed_verdict": self.verdict.value if self.verdict else None,
            "findings_count": len(self.findings),
            "created_at": getattr(self, "created_at", None),
        }
        if not hasattr(self, "created_at") or not self.created_at:
            self.created_at = dt.datetime.now().isoformat(timespec="seconds")
            meta["created_at"] = self.created_at
        (self.work_dir / "meta.json").write_text(
            json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    def _skip_or_run(self, stage: str, artifact: str, fn: Callable[[], None]) -> None:
        if self.resume and self.cache.is_complete(stage):
            self._emit(stage, "skipped")
            return
        self._emit(stage, "processing")
        try:
            fn()
            self._emit(stage, "completed")
        except Exception as e:
            self._emit(stage, "failed", str(e))
            raise

    def _ensure_llm(self) -> LLMClient:
        if self.llm is None:
            self.llm = LLMClient(
                model=self.config.llm_model,
                provider=getattr(self.config, "llm_provider", "anthropic"),
                temperature=self.config.temperature,
                max_cost=self.config.max_cost,
                api_key=self.api_key,
            )
        return self.llm

    def _prepare_video(self) -> None:
        dest = self.work_dir / "source" / self.video.name
        dest.parent.mkdir(parents=True, exist_ok=True)
        if self.copy_video:
            if not dest.exists():
                shutil.copy2(self.video, dest)
            self.video_path = dest
        else:
            self.video_path = self.video
        self.duration = probe_duration(self.video_path)

    def run(self) -> Path:
        self.created_at = dt.datetime.now().isoformat(timespec="seconds")
        self.processing_status = "running"
        self._persist_meta()
        try:
            self._prepare_video()

            def audio_step() -> None:
                extract_audio(self.video_path, self.cache.path("audio.wav"))

            self._skip_or_run("audio", "audio.wav", audio_step)

            def transcribe_step() -> None:
                segs = transcribe(
                    self.cache.path("audio.wav"),
                    self.course,
                    model_size=self.config.whisper_model,
                    low_confidence_logprob=self.config.low_confidence_logprob,
                )
                self.cache.write_json(
                    "transcript.json", [s.model_dump() for s in segs]
                )

            self._skip_or_run("transcribe", "transcript.json", transcribe_step)
            self.transcript = [
                TranscriptSegment(**s) for s in self.cache.read_json("transcript.json")
            ]

            def frames_step() -> None:
                frames = extract_frames(
                    self.video_path,
                    self.work_dir / "frames",
                    scene_threshold=self.config.scene_threshold,
                    sample_interval=self.config.frame_sample_interval,
                    pre_change_offset=self.config.pre_change_offset,
                )
                self.cache.write_json("frames.json", [f.model_dump() for f in frames])

            self._skip_or_run("frames", "frames.json", frames_step)
            self.frames = [FrameInfo(**f) for f in self.cache.read_json("frames.json")]

            def ocr_step() -> None:
                results = ocr_frames(
                    self.work_dir,
                    self.frames,
                    high_confidence=self.config.ocr_high_confidence,
                )
                self.cache.write_json("ocr.json", [r.model_dump() for r in results])

            self._skip_or_run("ocr", "ocr.json", ocr_step)
            self.ocr = [OcrResult(**r) for r in self.cache.read_json("ocr.json")]

            def segment_step() -> None:
                llm = self._ensure_llm()
                lessons = segment_lessons(
                    llm,
                    self.transcript,
                    self.ocr,
                    self.course,
                    overlap=self.config.segmentation_overlap,
                    prompt_version=self.config.prompt_version,
                )
                self.cache.write_json("segments.json", [l.model_dump() for l in lessons])

            self._skip_or_run("segment", "segments.json", segment_step)
            self.lessons = [LessonSegment(**s) for s in self.cache.read_json("segments.json")]

            def review_step() -> None:
                llm = self._ensure_llm()
                findings = review_segments(
                    llm,
                    self.lessons,
                    self.course,
                    self.transcript,
                    prompt_version=self.config.prompt_version,
                )
                self.cache.write_json(
                    "raw_findings.json", [f.model_dump() for f in findings]
                )

            self._skip_or_run("review", "raw_findings.json", review_step)
            self.raw_findings = [
                Finding(**f) for f in self.cache.read_json("raw_findings.json")
            ]

            def evidence_step() -> None:
                kept, dropped = validate_findings(
                    self.raw_findings,
                    self.transcript,
                    self.ocr,
                    similarity_threshold=self.config.evidence_similarity,
                    duration=self.duration,
                )
                self.cache.write_json("findings.json", [f.model_dump() for f in kept])
                self.cache.write_json(
                    "dropped_issues.json", [d.model_dump() for d in dropped]
                )

            self._skip_or_run("evidence", "findings.json", evidence_step)
            self.findings = [Finding(**f) for f in self.cache.read_json("findings.json")]
            self.dropped = [
                DroppedIssue(**d) for d in self.cache.read_json("dropped_issues.json")
            ]

            def verdict_step() -> None:
                complete = all(
                    self.stages[s].status in {StageStatus.completed, StageStatus.skipped}
                    for s in self.STAGES
                    if s not in {"verdict", "report"}
                )
                # stages before verdict should be done; check transcript empty
                v = calculate_verdict(
                    self.findings,
                    processing_complete=complete and self.stages["evidence"].status
                    in {StageStatus.completed, StageStatus.skipped},
                    transcript_empty=len(self.transcript) == 0,
                    include_pedagogy=self.config.include_pedagogy_in_verdict,
                    include_quiz=self.config.include_quiz_in_verdict,
                )
                self.cache.write_json("verdict.json", {"proposed_verdict": v.value})

            self._skip_or_run("verdict", "verdict.json", verdict_step)
            self.verdict = Verdict(self.cache.read_json("verdict.json")["proposed_verdict"])

            def report_step() -> None:
                cost = self.llm.cost if self.llm else self._load_cost()
                report = make_report(
                    review_id=self.review_id,
                    video_name=self.video.name,
                    course=self.course,
                    model=self.config.llm_model,
                    prompt_version=self.config.prompt_version,
                    processing_status="completed",
                    verdict=self.verdict,
                    findings=self.findings,
                    stages=list(self.stages.values()),
                    cost=cost,
                    created_at=self.created_at,
                    duration_sec=self.duration,
                )
                write_reports(self.work_dir, report, self.dropped)
                if self.llm:
                    self.cache.write_json("cost.json", self.llm.cost.model_dump())

            self._skip_or_run("report", "report.json", report_step)
            self.processing_status = "completed"
            self._persist_meta()
            return self.work_dir

        except CostLimitExceeded as e:
            self.processing_status = "failed"
            self.verdict = Verdict.needs_human_review
            self._write_partial_failure(str(e))
            raise
        except Exception as e:
            self.processing_status = "failed"
            self.verdict = Verdict.needs_human_review
            self._write_partial_failure(str(e))
            raise

    def _load_cost(self):
        from .schema import CostInfo

        if self.cache.exists("cost.json"):
            return CostInfo(**self.cache.read_json("cost.json"))
        return CostInfo(max_cost=self.config.max_cost)

    def _write_partial_failure(self, error: str) -> None:
        from .schema import CostInfo

        cost = self.llm.cost if self.llm else CostInfo(max_cost=self.config.max_cost)
        report = make_report(
            review_id=self.review_id,
            video_name=self.video.name,
            course=self.course,
            model=self.config.llm_model,
            prompt_version=self.config.prompt_version,
            processing_status="failed",
            verdict=Verdict.needs_human_review,
            findings=self.findings,
            stages=list(self.stages.values()),
            cost=cost,
            created_at=getattr(self, "created_at", None),
            duration_sec=self.duration,
        )
        report.limitations = LIMITATIONS + [f"فشل المعالجة: {error}"]
        write_reports(self.work_dir, report, self.dropped)
        self._persist_meta()
