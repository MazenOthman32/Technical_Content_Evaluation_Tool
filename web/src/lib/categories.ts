export type CourseItem = {
  id: string;
  label: string;
  labelAr: string;
};

export const COURSE_CATALOG: CourseItem[] = [
  { id: "frontend", label: "Frontend Development", labelAr: "تطوير الواجهات" },
  { id: "backend", label: "Backend & APIs", labelAr: "الباك اند وواجهات API" },
  { id: "mobile", label: "Mobile Development", labelAr: "تطوير الموبايل" },
  { id: "data", label: "Data & AI", labelAr: "البيانات والذكاء الاصطناعي" },
  { id: "devops", label: "DevOps & Cloud", labelAr: "DevOps والسحابة" },
  { id: "security", label: "Security", labelAr: "الأمن السيبراني" },
  { id: "uiux", label: "UI/UX Design", labelAr: "تصميم تجربة المستخدم" },
  { id: "soft_skills", label: "Soft Skills", labelAr: "المهارات الشخصية" },
  { id: "general", label: "General Course", labelAr: "كورس عام" },
];

export const BUSINESS_CATEGORIES = COURSE_CATALOG;

export type CourseId = string;
export type BusinessCategoryId = CourseId;

export function courseLabel(id?: string | null) {
  const found = COURSE_CATALOG.find((c) => c.id === id);
  if (!found) return id || "كورس عام";
  return found.labelAr || found.label;
}

export function categoryLabel(id?: string | null) {
  return courseLabel(id);
}

export function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.map((t) => String(t || "").trim()).filter(Boolean))].slice(0, 12);
}
