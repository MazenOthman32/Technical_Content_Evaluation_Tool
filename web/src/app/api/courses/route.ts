import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { slugifyCourseName } from "@/lib/courses";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await requireUser();
  if (!auth.user || !auth.profile?.is_active) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("courses")
    .select("id,name,slug,created_by,created_at,updated_at")
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ courses: data || [] });
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.user || !auth.profile?.is_active) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const name = String(body.name || "").trim().slice(0, 120);
  if (!name) return NextResponse.json({ error: "اسم الكورس مطلوب" }, { status: 400 });

  let slug = slugifyCourseName(String(body.slug || name));
  const admin = createAdminClient();

  for (let i = 0; i < 5; i += 1) {
    const candidate = i === 0 ? slug : `${slug}-${i + 1}`;
    const { data, error } = await admin
      .from("courses")
      .insert({
        name,
        slug: candidate,
        created_by: auth.user.id,
        updated_at: new Date().toISOString(),
      })
      .select("id,name,slug,created_by,created_at,updated_at")
      .maybeSingle();

    if (!error && data) return NextResponse.json({ course: data }, { status: 201 });
    if (error && !String(error.message || "").toLowerCase().includes("duplicate")) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    slug = candidate;
  }

  return NextResponse.json({ error: "تعذر إنشاء الكورس" }, { status: 500 });
}
