"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import { createClient } from "@/lib/supabase/client";

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

      await fetch("/api/auth/ensure-role", { method: "POST" }).catch(() => null);

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
      setUserLabel(`${profile?.full_name || profile?.username || data.user.email} · ${r}`);
    });
  }, [router]);

  useEffect(() => {
    document.body.classList.toggle("nav-open", open);
    return () => document.body.classList.remove("nav-open");
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const links = useMemo(
    () => [
      { href: "/app/dashboard", label: "لوحة التحليل" },
      { href: "/app/review", label: "مراجعة جديدة" },
      { href: "/app/history", label: "السجل" },
      { href: "/app/reports", label: "التقارير" },
      { href: "/app/settings", label: "الإعدادات" },
    ],
    []
  );

  const pageTitle =
    links.find((l) => pathname.startsWith(l.href))?.label || "Instant+";

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="shell">
      <header className="mobile-bar">
        <button className="menu-btn" type="button" onClick={() => setOpen(true)} aria-label="القائمة">
          ☰
        </button>
        <div className="mobile-bar-title">{pageTitle}</div>
        <ThemeToggle />
      </header>

      <div className={`backdrop ${open ? "open" : ""}`} onClick={() => setOpen(false)} />
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="sidebar-head">
          <Logo />
          <button className="icon-btn sidebar-close" type="button" onClick={() => setOpen(false)} aria-label="إغلاق">
            ✕
          </button>
        </div>
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
          <div className="side-actions">
            <ThemeToggle />
            <button type="button" className="btn ghost" onClick={logout}>
              خروج
            </button>
          </div>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
