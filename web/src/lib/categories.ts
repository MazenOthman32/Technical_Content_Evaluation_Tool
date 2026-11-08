export const COURSE_CATALOG = [
  { id: "frontend", label: "Frontend Development" },
  { id: "backend", label: "Backend & APIs" },
  { id: "mobile", label: "Mobile Development" },
  { id: "data", label: "Data & AI" },
  { id: "devops", label: "DevOps & Cloud" },
  { id: "security", label: "Security" },
  { id: "uiux", label: "UI/UX Design" },
  { id: "soft_skills", label: "Soft Skills" },
  { id: "general", label: "General Course" },
] as const;

export const BUSINESS_CATEGORIES = COURSE_CATALOG;

export type CourseId = (typeof COURSE_CATALOG)[number]["id"];
export type BusinessCategoryId = CourseId;

export function categoryLabel(id?: string | null) {
  const found = COURSE_CATALOG.find((c) => c.id === id);
  return found?.label || id || "General Course";
}

export function courseLabel(id?: string | null) {
  return categoryLabel(id);
}

export function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.map((t) => String(t || "").trim()).filter(Boolean))].slice(0, 12);
}
