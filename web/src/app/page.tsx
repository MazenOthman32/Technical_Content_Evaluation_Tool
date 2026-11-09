import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function supabaseConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  return Boolean(url) && Boolean(key) && !url.includes("YOUR_PROJECT") && key !== "your_anon_key";
}

export default async function Home() {
  if (!supabaseConfigured()) {
    redirect("/login");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  redirect(user ? "/app/dashboard" : "/login");
}
