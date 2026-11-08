import { createClient } from "@/lib/supabase/server";
import { AppRole, isStaff } from "@/lib/auth/roles";

export type { AppRole };
export { isStaff };

export type SessionProfile = {
  id: string;
  email: string | null;
  username: string | null;
  full_name: string | null;
  role: AppRole;
  is_active: boolean;
};

export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null as SessionProfile | null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("id,email,username,full_name,role,is_active")
    .eq("id", user.id)
    .maybeSingle();
  return {
    supabase,
    user,
    profile: (profile as SessionProfile | null) || null,
  };
}

export async function requireStaff() {
  const ctx = await requireUser();
  if (!ctx.user || !ctx.profile?.is_active || !isStaff(ctx.profile.role)) {
    return { ...ctx, ok: false as const };
  }
  return { ...ctx, ok: true as const };
}
