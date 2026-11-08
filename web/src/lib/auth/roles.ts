export type AppRole = "super_admin" | "admin" | "reviewer";

export function isStaff(role?: string | null) {
  return role === "super_admin" || role === "admin";
}
