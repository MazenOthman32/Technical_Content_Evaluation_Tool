export type Evidence = {
  quote?: string;
  source_type?: string;
  frame?: string | null;
  ocr_text?: string | null;
  timestamp?: string | null;
};

export type Finding = {
  id: string;
  lesson?: string;
  t_start?: string;
  t_end?: string;
  category?: string;
  severity?: string;
  evidence?: Evidence;
  expected?: string;
  correction?: string;
  confidence?: string;
  summary?: string;
  note?: string | null;
};

export type ReportPayload = {
  review_id?: string;
  video_name?: string;
  model?: string;
  processing_status?: string;
  proposed_verdict?: string;
  findings?: Finding[];
  limitations?: string[];
  cost?: {
    input_tokens?: number;
    output_tokens?: number;
    text_requests?: number;
    image_requests?: number;
    estimated_usd?: number;
  };
  course?: {
    field?: string;
    level?: string;
    language?: string;
    stack?: string[];
    title?: string | null;
  };
  duration_sec?: number | null;
  markdown?: string;
};

export type ReviewRow = {
  id: string;
  video_name: string | null;
  session_title?: string | null;
  drive_url?: string | null;
  provider?: string | null;
  model?: string | null;
  status: string;
  proposed_verdict: string | null;
  findings_count: number | null;
  quality_score: number | null;
  duration_ms: number | null;
  cost: number | null;
  created_at: string;
  report: ReportPayload | null;
  category?: string | null;
  tags?: string[] | null;
};

export function displaySessionTitle(row: Pick<ReviewRow, "session_title" | "video_name" | "id">) {
  return row.session_title?.trim() || row.video_name || row.id;
}

export function verdictLabel(v?: string | null) {
  switch (v) {
    case "fix_required":
      return "يحتاج إصلاح";
    case "approve_with_notes":
      return "موافقة مع ملاحظات";
    case "needs_human_review":
      return "يحتاج مراجعة بشرية";
    case "no_issues_found_by_tool":
      return "لا ملاحظات من الأداة";
    default:
      return v || "—";
  }
}

export function statusLabel(s?: string | null) {
  switch (s) {
    case "awaiting_backend":
      return "بانتظار المعالج";
    case "queued":
      return "في الطابور";
    case "running":
    case "downloading":
      return "قيد المعالجة";
    case "completed":
      return "مكتمل";
    case "failed":
      return "فشل";
    default:
      return s || "—";
  }
}

export function severityLabel(s?: string | null) {
  switch (s) {
    case "critical":
      return "حرج";
    case "medium":
      return "متوسط";
    case "minor":
      return "بسيط";
    case "unsure":
      return "غير مؤكد";
    default:
      return s || "—";
  }
}

export function hasReportContent(report: ReportPayload | null | undefined) {
  if (!report) return false;
  if (Array.isArray(report.findings) && report.findings.length > 0) return true;
  if (report.proposed_verdict) return true;
  if (report.markdown) return true;
  if (report.processing_status === "completed" || report.processing_status === "failed") return true;
  return false;
}

export function countBySeverity(findings: Finding[]) {
  return findings.reduce(
    (acc, f) => {
      const key = (f.severity || "unsure") as keyof typeof acc;
      if (key in acc) acc[key] += 1;
      else acc.unsure += 1;
      return acc;
    },
    { critical: 0, medium: 0, minor: 0, unsure: 0 }
  );
}
