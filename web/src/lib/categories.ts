export const BUSINESS_CATEGORIES = [
  { id: "technical_accuracy", label: "الدقة التقنية", labelEn: "Technical Accuracy" },
  { id: "code_quality", label: "جودة الكود", labelEn: "Code Quality" },
  { id: "video_clarity", label: "وضوح الفيديو", labelEn: "Video Clarity" },
  { id: "security_compliance", label: "الامتثال الأمني", labelEn: "Security Compliance" },
  { id: "pedagogy", label: "الجودة التعليمية", labelEn: "Pedagogy" },
  { id: "general", label: "عام", labelEn: "General" },
] as const;

export type BusinessCategoryId = (typeof BUSINESS_CATEGORIES)[number]["id"];

export function categoryLabel(id?: string | null) {
  const found = BUSINESS_CATEGORIES.find((c) => c.id === id);
  return found?.label || id || "عام";
}

export function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.map((t) => String(t || "").trim()).filter(Boolean))].slice(0, 12);
}
