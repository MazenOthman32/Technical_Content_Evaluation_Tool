import { normalizeTags } from "@/lib/categories";
import { ReportPayload, ReviewRow } from "@/lib/reports";

export type OrgMeta = {
  category: string;
  tags: string[];
};

export function readOrgMeta(row: Partial<ReviewRow> | null | undefined): OrgMeta {
  const embedded = ((row?.report as ReportPayload & { _org?: OrgMeta }) || {})?._org;
  return {
    category: row?.category || embedded?.category || "general",
    tags: normalizeTags(row?.tags?.length ? row.tags : embedded?.tags || []),
  };
}

export function withOrgMeta(
  report: ReportPayload | null | undefined,
  meta: Partial<OrgMeta>
): ReportPayload & { _org: OrgMeta } {
  const current = ((report as ReportPayload & { _org?: OrgMeta }) || {})?._org;
  return {
    ...(report || {}),
    _org: {
      category: meta.category || current?.category || "general",
      tags: normalizeTags(meta.tags ?? current?.tags ?? []),
    },
  };
}
