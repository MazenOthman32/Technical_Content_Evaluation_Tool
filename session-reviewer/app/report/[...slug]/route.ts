import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await context.params;
  const id = slug.map((part) => decodeURIComponent(part)).join("/");
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data, error } = await supabase
    .from("sessions")
    .select("report_html")
    .eq("slug", id)
    .maybeSingle();

  if (error) {
    return new Response(error.message, { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  if (!data?.report_html) {
    return new Response("التقرير مش موجود", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  return new Response(data.report_html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
