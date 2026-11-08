import { COURSE_CATALOG } from "@/lib/categories";

export type Course = {
  id: string;
  name: string;
  slug: string;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export function slugifyCourseName(name: string) {
  const base = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^\w\u0600-\u06FF]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base || `course-${Date.now().toString(16)}`;
}

export function courseDisplayName(
  course?: Pick<Course, "name" | "slug"> | Pick<Course, "name" | "slug">[] | null,
  fallback?: string | null
) {
  const item = Array.isArray(course) ? course[0] : course;
  if (item?.name) return item.name;
  if (item?.slug) {
    const found = COURSE_CATALOG.find((c) => c.id === item.slug);
    if (found) return found.labelAr || found.label;
    return item.slug;
  }
  return fallback || "كورس عام";
}
