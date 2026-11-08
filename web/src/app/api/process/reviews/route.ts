import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";

export const runtime = "nodejs";
export const maxDuration = 60;

function processBase() {
  return (process.env.PROCESS_API_URL || process.env.NEXT_PUBLIC_PROCESS_API_URL || "").replace(/\/$/, "");
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.user) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const base = processBase();
  if (!base) {
    return NextResponse.json(
      {
        error: "معالج الفيديو غير مربوط. اضبط PROCESS_API_URL أو NEXT_PUBLIC_PROCESS_API_URL",
        code: "PROCESS_API_MISSING",
      },
      { status: 503 }
    );
  }

  const incoming = await request.formData();
  const outbound = new FormData();
  for (const [key, value] of incoming.entries()) {
    outbound.append(key, value);
  }

  const {
    data: { session },
  } = await auth.supabase.auth.getSession();
  const token = session?.access_token || "";

  const headers: Record<string, string> = {
    "bypass-tunnel-reminder": "1",
    "User-Agent": "InstantPlus-Processor-Proxy/1.0",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${base}/api/reviews`, {
      method: "POST",
      headers,
      body: outbound,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error: `تعذر الوصول لمعالج الفيديو على ${base}`,
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 }
    );
  }

  const text = await res.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { detail: text || "استجابة غير صالحة من المعالج" };
  }

  if (!res.ok) {
    const detail =
      typeof data === "object" && data && "detail" in data
        ? String((data as { detail: unknown }).detail)
        : "فشل إرسال المهمة للمعالج";
    return NextResponse.json({ error: detail, detail: data }, { status: res.status });
  }

  return NextResponse.json(data);
}

export async function GET() {
  const base = processBase();
  if (!base) {
    return NextResponse.json({ ok: false, configured: false, message: "PROCESS_API_URL غير مضبوط" });
  }
  try {
    const res = await fetch(`${base}/api/health`, {
      cache: "no-store",
      headers: {
        "bypass-tunnel-reminder": "1",
        "User-Agent": "InstantPlus-Processor-Proxy/1.0",
      },
    });
    const json = await res.json().catch(() => ({}));
    return NextResponse.json({
      ok: res.ok,
      configured: true,
      base,
      health: json,
    });
  } catch (err: unknown) {
    return NextResponse.json({
      ok: false,
      configured: true,
      base,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
