import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { keyStatus, maskKey } from "@/lib/keys";

export async function GET() {
  const ctx = await requireStaff();
  if (!ctx.ok) return NextResponse.json({ error: "غير مصرح" }, { status: 403 });

  const admin = createAdminClient();
  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id,email,username,full_name,role,is_active,created_at")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: settings } = await admin
    .from("user_settings")
    .select(
      "user_id,anthropic_api_key,groq_api_key,openai_api_key,anthropic_verified_at,groq_verified_at,openai_verified_at,llm_provider,llm_model"
    );

  const byUser = new Map((settings || []).map((s) => [s.user_id, s]));
  const users = (profiles || []).map((p) => {
    const s = byUser.get(p.id);
    return {
      ...p,
      keys: {
        anthropic: {
          ...keyStatus(s?.anthropic_api_key, s?.anthropic_verified_at),
          masked: maskKey(s?.anthropic_api_key),
        },
        groq: {
          ...keyStatus(s?.groq_api_key, s?.groq_verified_at),
          masked: maskKey(s?.groq_api_key),
        },
        openai: {
          ...keyStatus(s?.openai_api_key, s?.openai_verified_at),
          masked: maskKey(s?.openai_api_key),
        },
      },
      llm_provider: s?.llm_provider || "groq",
      llm_model: s?.llm_model || "",
    };
  });

  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  const ctx = await requireStaff();
  if (!ctx.ok) return NextResponse.json({ error: "غير مصرح" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const fullName = String(body.full_name || "").trim() || email.split("@")[0];
  const username = String(body.username || "").trim() || email.split("@")[0];
  const role = String(body.role || "reviewer");
  const allowed =
    ctx.profile?.role === "super_admin"
      ? ["super_admin", "admin", "reviewer"]
      : ["reviewer"];
  if (!allowed.includes(role)) {
    return NextResponse.json(
      {
        error:
          ctx.profile?.role === "super_admin"
            ? "دور غير صالح"
            : "الأدمن العادي ينشئ Reviewer فقط — Super Admin يضيف Admin / Super Admin / Reviewer",
      },
      { status: 403 }
    );
  }
  if (!email || password.length < 8) {
    return NextResponse.json({ error: "البريد وكلمة مرور (8+) مطلوبة" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role },
    user_metadata: { username, full_name: fullName, role },
  });
  if (error || !data.user) {
    return NextResponse.json({ error: error?.message || "فشل الإنشاء" }, { status: 400 });
  }

  await admin.from("profiles").upsert({
    id: data.user.id,
    email,
    username,
    full_name: fullName,
    role,
    is_active: true,
    updated_at: new Date().toISOString(),
  });

  await admin.from("user_settings").upsert({
    user_id: data.user.id,
    anthropic_api_key: String(body.anthropic_api_key || "").trim(),
    groq_api_key: String(body.groq_api_key || "").trim(),
    openai_api_key: String(body.openai_api_key || "").trim(),
    llm_provider: String(body.llm_provider || "groq"),
    llm_model: String(body.llm_model || "openai/gpt-oss-120b"),
    updated_at: new Date().toISOString(),
  });

  return NextResponse.json({ id: data.user.id, email, role });
}
