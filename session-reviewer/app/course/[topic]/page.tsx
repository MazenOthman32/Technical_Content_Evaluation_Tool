import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import Link from "next/link";

type SessionRow = {
  slug: string;
  title: string;
  topic: string | null;
  major: number;
  moderate: number;
  minor: number;
};

export default async function CoursePage({ params }: { params: Promise<{ topic: string }> }) {
  const { topic } = await params;
  const name = decodeURIComponent(topic);
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const query = supabase
    .from("sessions")
    .select("slug,title,topic,major,moderate,minor")
    .order("created_at", { ascending: false });
  const { data, error } = name === "بدون اسم" ? await query.is("topic", null) : await query.eq("topic", name);
  const sessions = (data || []) as SessionRow[];

  return (
    <main className="page">
      <div className="head">
        <h1>{name}</h1>
        <Link className="back" href="/">الكل</Link>
      </div>
      {error ? (
        <p className="notice">{error.message}</p>
      ) : sessions && sessions.length > 0 ? (
        <div className="list">
          {sessions.map((session) => (
            <Link
              key={session.slug}
              className="item"
              href={`/report/${session.slug.split("/").map(encodeURIComponent).join("/")}`}
            >
              <strong>{session.title}</strong>
              <span className="sev">
                <b className="major">{session.major}</b>
                {" · "}
                <b className="moderate">{session.moderate}</b>
                {" · "}
                <b className="minor">{session.minor}</b>
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="notice">الكورس ده لسه من غير تقارير</p>
      )}
    </main>
  );
}
