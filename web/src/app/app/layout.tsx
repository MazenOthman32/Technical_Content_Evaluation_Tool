"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import { createClient } from "@/lib/supabase/client";
import { isStaff } from "@/lib/auth/roles";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [userLabel, setUserLabel] = useState("");
  const [role, setRole] = useState("reviewer");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.replace("/login");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name,username,role,is_active")
        .eq("id", data.user.id)
        .maybeSingle();
      if (profile && profile.is_active === false) {
        await supabase.auth.signOut();
        router.replace("/login");
        return;
      }
      const r = profile?.role || "reviewer";
      setRole(r);
      setUserLabel(`${profile?.full_name || profile?.username || data.user.email} · ${r}`);
    });
  }, [router]);

  const links = useMemo(() => {
    const base = [
      { href: "/app/dashboard", label: "لوحة التحليلات" },
      { href: "/app/review", label: "مراجعة جديدة" },
      { href: "/app/history", label: "السجل" },
      { href: "/app/reports", label: "التقارير" },
      { href: "/app/settings", label: "الإعدادات" },
    ];
    return base;
  }, []);

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
        <Logo />
        <nav className="nav">
          {links.map((l) => (
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
          <div className="user-chip">{userLabel || "…"}</div>
          {isStaff(role) ? <div className="help" style={{ color: "#93a0c7", paddingInline: 8 }}>صلاحيات إدارية مفعّلة</div> : null}
          <button type="button" className="btn ghost" onClick={logout}>
            خروج
          </button>
        </div>
      </aside>
      <main className="main">
        <div className="topbar">
          <div />
          <ThemeToggle />
        </div>
        {children}
      </main>
    </div>
  );
}
