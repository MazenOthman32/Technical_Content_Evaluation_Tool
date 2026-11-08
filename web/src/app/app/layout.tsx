"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const LINKS = [
  { href: "/app/review", label: "مراجعة جديدة" },
  { href: "/app/history", label: "السجل" },
  { href: "/app/reports", label: "التقارير" },
  { href: "/app/settings", label: "الإعدادات" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [userLabel, setUserLabel] = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.replace("/login");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name,username,role")
        .eq("id", data.user.id)
        .maybeSingle();
      setUserLabel(
        `${profile?.full_name || profile?.username || data.user.email} · ${profile?.role || "reviewer"}`
      );
    });
  }, [router]);

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="shell">
      <button className="menu-btn" type="button" onClick={() => setOpen(true)} aria-label="القائمة">
        ☰
      </button>
      <div className={`backdrop ${open ? "open" : ""}`} onClick={() => setOpen(false)} />
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="brand">
          <Image src="/brand/instant-plus-logo.png" alt="Instant+" width={120} height={28} />
          <span>Video Reviewer</span>
        </div>
        <nav className="nav">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={pathname.startsWith(l.href) ? "active" : ""}
              onClick={() => setOpen(false)}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="side-foot">
          <div className="user-chip">{userLabel}</div>
          <button type="button" className="btn ghost" onClick={logout}>
            خروج
          </button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
