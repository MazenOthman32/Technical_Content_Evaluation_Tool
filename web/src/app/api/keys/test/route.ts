import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { KeyProvider, probeKey } from "@/lib/keys";

export async function POST(request: Request) {
  const ctx = await requireUser();
  if (!ctx.user) return NextResponse.json({ error: "يلزم تسجيل الدخول" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const provider = String(body.provider || "") as KeyProvider;
  if (!["anthropic", "groq", "openai"].includes(provider)) {
    return NextResponse.json({ error: "مزود غير مدعوم" }, { status: 400 });
  }

  let apiKey = String(body.api_key || "").trim();
  const { data: settings } = await ctx.supabase
    .from("user_settings")
    .select("anthropic_api_key,groq_api_key,openai_api_key")
    .eq("user_id", ctx.user.id)
    .maybeSingle();

  if (!apiKey) {
    apiKey =
      provider === "anthropic"
        ? settings?.anthropic_api_key || ""
        : provider === "groq"
          ? settings?.groq_api_key || ""
          : settings?.openai_api_key || "";
  }

  const result = await probeKey(provider, apiKey);
  if (result.ok) {
    const column =
      provider === "anthropic"
        ? "anthropic_verified_at"
        : provider === "groq"
          ? "groq_verified_at"
          : "openai_verified_at";
    await ctx.supabase
      .from("user_settings")
      .upsert({
        user_id: ctx.user.id,
        [column]: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
  }

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
