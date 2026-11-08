import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (!auth.ok) return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  if (auth.profile?.role !== "super_admin") {
    return NextResponse.json({ error: "تعديل الحسابات لـ Super Admin فقط" }, { status: 403 });
  }

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const admin = createAdminClient();

  const fullName = body.full_name != null ? String(body.full_name).trim() : undefined;
  const username = body.username != null ? String(body.username).trim() : undefined;
  const email = body.email != null ? String(body.email).trim().toLowerCase() : undefined;
  const role = body.role != null ? String(body.role) : undefined;
  const isActive = typeof body.is_active === "boolean" ? body.is_active : undefined;
  const password = body.password != null ? String(body.password) : undefined;

  if (role && !["super_admin", "admin", "reviewer"].includes(role)) {
    return NextResponse.json({ error: "دور غير صالح" }, { status: 400 });
  }
  if (password != null && password.length > 0 && password.length < 8) {
    return NextResponse.json({ error: "كلمة المرور 8 أحرف على الأقل" }, { status: 400 });
  }
  if (id === auth.user?.id && isActive === false) {
    return NextResponse.json({ error: "لا يمكن تعطيل حسابك الحالي" }, { status: 400 });
  }

  const authUpdate: Record<string, unknown> = {};
  if (email) authUpdate.email = email;
  if (password && password.length >= 8) authUpdate.password = password;
  if (role || fullName || username) {
    const { data: current } = await admin.auth.admin.getUserById(id);
    authUpdate.app_metadata = {
      ...(current.user?.app_metadata || {}),
      ...(role ? { role } : {}),
    };
    authUpdate.user_metadata = {
      ...(current.user?.user_metadata || {}),
      ...(username ? { username } : {}),
      ...(fullName ? { full_name: fullName } : {}),
      ...(role ? { role } : {}),
    };
  }

  if (Object.keys(authUpdate).length) {
    const { error } = await admin.auth.admin.updateUserById(id, authUpdate);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const profilePatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (fullName != null) profilePatch.full_name = fullName;
  if (username != null) profilePatch.username = username;
  if (email != null) profilePatch.email = email;
  if (role != null) profilePatch.role = role;
  if (isActive != null) profilePatch.is_active = isActive;

  const { error: profileErr } = await admin.from("profiles").update(profilePatch).eq("id", id);
  if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 });

  const settingsPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  let hasSettings = false;
  for (const key of ["anthropic_api_key", "groq_api_key", "openai_api_key", "llm_provider", "llm_model"] as const) {
    if (body[key] != null && String(body[key]).trim() !== "") {
      settingsPatch[key] = String(body[key]).trim();
      hasSettings = true;
    }
  }
  if (hasSettings) {
    const { error: settingsErr } = await admin.from("user_settings").upsert({
      user_id: id,
      ...settingsPatch,
    });
    if (settingsErr) return NextResponse.json({ error: settingsErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (!auth.ok) return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  if (auth.profile?.role !== "super_admin") {
    return NextResponse.json({ error: "حذف الحسابات لـ Super Admin فقط" }, { status: 403 });
  }

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 });
  if (id === auth.user?.id) {
    return NextResponse.json({ error: "لا يمكن حذف حسابك الحالي" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
