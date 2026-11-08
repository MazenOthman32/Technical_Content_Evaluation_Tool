import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/session";

const SUPER_EMAIL = (
  process.env.SUPER_ADMIN_EMAIL || "MazenOthman320@gmail.com"
).trim().toLowerCase();

export async function POST() {
  const ctx = await requireUser();
  if (!ctx.user?.email) {
    return NextResponse.json({ error: "يلزم تسجيل الدخول" }, { status: 401 });
  }

  const email = ctx.user.email.toLowerCase();
  let role = ctx.profile?.role || "reviewer";
  let promoted = false;

  if (email === SUPER_EMAIL) {
    try {
      const admin = createAdminClient();
      await admin.auth.admin.updateUserById(ctx.user.id, {
        app_metadata: { role: "super_admin" },
        user_metadata: {
          ...(ctx.user.user_metadata || {}),
          role: "super_admin",
          username: "mazen",
          full_name: "Mazen Othman",
        },
      });
      await admin.from("profiles").upsert({
        id: ctx.user.id,
        email: ctx.user.email,
        username: "mazen",
        full_name: "Mazen Othman",
        role: "super_admin",
        is_active: true,
        updated_at: new Date().toISOString(),
      });

      const { data: settings } = await admin
        .from("user_settings")
        .select("anthropic_api_key,groq_api_key,openai_api_key")
        .eq("user_id", ctx.user.id)
        .maybeSingle();

      await admin.from("user_settings").upsert({
        user_id: ctx.user.id,
        anthropic_api_key:
          settings?.anthropic_api_key || process.env.ANTHROPIC_API_KEY || "",
        groq_api_key: settings?.groq_api_key || process.env.GROQ_API_KEY || "",
        openai_api_key: settings?.openai_api_key || process.env.OPENAI_API_KEY || "",
        updated_at: new Date().toISOString(),
      });

      role = "super_admin";
      promoted = true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "تعذر ترقية الحساب";
      return NextResponse.json(
        {
          email,
          role,
          is_staff: role === "super_admin" || role === "admin",
          promoted: false,
          warning: message,
        },
        { status: 200 }
      );
    }
  }

  return NextResponse.json({
    email,
    role,
    is_staff: role === "super_admin" || role === "admin",
    promoted,
  });
}
