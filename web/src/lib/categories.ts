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

export function normalizeCourseKey(input?: string | null) {
  const raw = String(input || "").trim();
  if (!raw) return "general";
  const byId = COURSE_CATALOG.find((c) => c.id === raw || c.label === raw || c.labelAr === raw);
  if (byId) return byId.id;
  return raw.slice(0, 80);
}

export function courseLabel(id?: string | null) {
  const key = String(id || "").trim();
  if (!key) return "كورس عام";
  const found = COURSE_CATALOG.find((c) => c.id === key || c.label === key || c.labelAr === key);
  if (found) return found.labelAr || found.label;
  return key;
}

export function categoryLabel(id?: string | null) {
  return courseLabel(id);
}

export function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.map((t) => String(t || "").trim()).filter(Boolean))].slice(0, 12);
}

export function normalizeSessionTitle(input?: string | null) {
  return String(input || "").trim().slice(0, 160);
}
