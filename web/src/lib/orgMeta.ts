import { normalizeCourseKey, normalizeSessionTitle, normalizeTags } from "@/lib/categories";
import { ReportPayload, ReviewRow } from "@/lib/reports";

export type OrgMeta = {
  category: string;
  tags: string[];
  session_title: string;
  course_id?: string;
};

export function readOrgMeta(row: Partial<ReviewRow> | null | undefined): OrgMeta {
  const embedded = ((row?.report as ReportPayload & { _org?: Partial<OrgMeta> }) || {})?._org;
  return {
    category: normalizeCourseKey(row?.category || embedded?.category || "general"),
    tags: normalizeTags(row?.tags?.length ? row.tags : embedded?.tags || []),
    session_title: normalizeSessionTitle(row?.session_title || embedded?.session_title || ""),
    course_id: row?.course_id || embedded?.course_id || undefined,
  };
}

export function withOrgMeta(
  report: ReportPayload | null | undefined,
  meta: Partial<OrgMeta>
): ReportPayload & { _org: OrgMeta } {
  const current = ((report as ReportPayload & { _org?: Partial<OrgMeta> }) || {})?._org;
  return {
    ...(report || {}),
    _org: {
      category: normalizeCourseKey(meta.category ?? current?.category ?? "general"),
      tags: normalizeTags(meta.tags ?? current?.tags ?? []),
      session_title: normalizeSessionTitle(meta.session_title ?? current?.session_title ?? ""),
      course_id: meta.course_id ?? current?.course_id,
    },
  };
}
