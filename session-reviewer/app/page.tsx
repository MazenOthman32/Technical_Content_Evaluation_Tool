import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import Link from "next/link";

type SessionRow = {
  slug: string;
  topic: string | null;
};

export default async function Page() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: sessions, error } = await supabase
    .from("sessions")
    .select("slug,topic")
    .order("created_at", { ascending: false });

  const courses = new Map<string, number>();
  for (const session of (sessions || []) as SessionRow[]) {
    const name = session.topic?.trim() || "بدون اسم";
    courses.set(name, (courses.get(name) || 0) + 1);
  }

  return (
    <main className="page">
      <h1>التقارير</h1>
      {error ? (
        <p className="notice">
          {error.code === "PGRST205"
            ? "جدول التقارير لسه مش موجود في Supabase."
            : error.message}
        </p>
      ) : courses.size > 0 ? (
        <div className="list">
          {[...courses.entries()].map(([name, count]) => (
            <Link key={name} className="item" href={`/course/${encodeURIComponent(name)}`}>
              <strong>{name}</strong>
              <span className="sev">{count}</span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="notice">لسه مفيش تقارير</p>
      )}
    </main>
  );
}
