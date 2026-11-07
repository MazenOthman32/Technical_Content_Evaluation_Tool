"""Markdown and JSON report generation."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .schema import CostInfo, CourseMeta, DroppedIssue, Finding, ReviewReport, StageState, Verdict
from .verdict import severity_counts


LIMITATIONS = [
    "النتائج توصيات مدعومة بالأدلة وليست قرار نشر نهائي.",
    "تقرير بلا ملاحظات لا يعني أن المحتوى صحيح تقنياً بنسبة 100%.",
    "التحقق من الأدلة يؤكد وجود الاقتباس في المصدر، ولا يثبت صحة التفسير التقني بشكل مستقل.",
    "Phase 1 يستخدم verification.method = model_only فقط.",
]


def build_markdown(report: ReviewReport) -> str:
    counts = severity_counts(report.findings)
    lines = [
        f"# تقرير مراجعة فيديو — Instant Plus",
        "",
        f"**معرّف المراجعة:** {report.review_id}",
        f"**الفيديو:** {report.video_name}",
        f"**المجال:** {report.course.field}",
        f"**المستوى:** {report.course.level}",
        f"**اللغة:** {report.course.language}",
        f"**التقنيات:** {', '.join(report.course.stack) or 'غير محددة'}",
        f"**النموذج:** {report.model}",
        f"**إصدار الـ Prompt:** {report.prompt_version}",
        f"**حالة المعالجة:** {report.processing_status}",
        f"**الحكم المقترح:** `{report.proposed_verdict.value}`",
        "",
        "## ملخص النتائج",
        "",
        f"- Critical: {counts.get('critical', 0)}",
        f"- Medium: {counts.get('medium', 0)}",
        f"- Minor: {counts.get('minor', 0)}",
        f"- Unsure: {counts.get('unsure', 0)}",
        f"- الإجمالي: {len(report.findings)}",
        "",
        "## جدول الملاحظات",
        "",
        "| ID | الدرس | البداية | النهاية | الفئة | الخطورة | الثقة | الملخص |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for f in report.findings:
        lines.append(
            f"| {f.id} | {f.lesson} | {f.t_start} | {f.t_end} | {f.category.value} | "
            f"{f.severity.value} | {f.confidence.value} | {f.summary.replace('|', '/')} |"
        )

    lines += ["", "## تفاصيل الملاحظات", ""]
    for f in report.findings:
        lines += [
            f"### {f.id} — {f.summary}",
            "",
            f"- **الوقت:** {f.t_start} → {f.t_end}",
            f"- **الفئة / الخطورة / الثقة:** {f.category.value} / {f.severity.value} / {f.confidence.value}",
            f"- **الدليل ({f.evidence.source_type.value}):** {f.evidence.quote}",
        ]
        if f.evidence.ocr_text:
            lines.append(f"- **OCR:** `{f.evidence.ocr_text}`")
        if f.evidence.frame:
            lines.append(f"- **الإطار:** {f.evidence.frame}")
        lines += [
            f"- **المتوقع:** {f.expected}",
            f"- **التصحيح المقترح:** {f.correction}",
        ]
        if f.note:
            lines.append(f"- **تنبيه:** {f.note}")
        lines.append("")

    lines += [
        "## كود للاختبار يدوياً",
        "",
        "راجع التصحيحات المقترحة أعلاه ونفّذ أي مقاطع كود ذات صلة يدوياً قبل اعتماد الملاحظة.",
        "",
        "## حدود المعالجة",
        "",
    ]
    for lim in report.limitations or LIMITATIONS:
        lines.append(f"- {lim}")

    cost = report.cost
    lines += [
        "",
        "## التكلفة التقديرية",
        "",
        f"- Input tokens: {cost.input_tokens}",
        f"- Output tokens: {cost.output_tokens}",
        f"- Text requests: {cost.text_requests}",
        f"- Image requests: {cost.image_requests}",
        f"- تقدير USD: {cost.estimated_usd:.4f}",
        "",
        "## إخلاء مسؤولية",
        "",
        "هذه الأداة مساعدة للذكاء الاصطناعي. القرار النهائي للموافقة أو الرفض أو طلب التصحيح "
        "يبقى حصرياً للمراجع البشري المخوّل في Instant Plus.",
        "",
    ]
    return "\n".join(lines)


def write_reports(
    work_dir: Path,
    report: ReviewReport,
    dropped: list[DroppedIssue],
) -> dict[str, Path]:
    work_dir.mkdir(parents=True, exist_ok=True)
    md_path = work_dir / "report.md"
    json_path = work_dir / "report.json"
    dropped_path = work_dir / "dropped_issues.json"

    md_path.write_text(build_markdown(report), encoding="utf-8")
    json_path.write_text(
        json.dumps(report.model_dump(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    dropped_path.write_text(
        json.dumps([d.model_dump() for d in dropped], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return {"markdown": md_path, "json": json_path, "dropped": dropped_path}


def make_report(
    *,
    review_id: str,
    video_name: str,
    course: CourseMeta,
    model: str,
    prompt_version: str,
    processing_status: str,
    verdict: Verdict,
    findings: list[Finding],
    stages: list[StageState],
    cost: CostInfo,
    created_at: str | None = None,
    duration_sec: float | None = None,
) -> ReviewReport:
    return ReviewReport(
        review_id=review_id,
        video_name=video_name,
        course=course,
        model=model,
        prompt_version=prompt_version,
        processing_status=processing_status,
        proposed_verdict=verdict,
        findings=findings,
        stages=stages,
        cost=cost,
        limitations=LIMITATIONS,
        created_at=created_at,
        duration_sec=duration_sec,
    )
