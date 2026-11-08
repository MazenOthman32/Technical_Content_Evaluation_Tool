"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "");
    try {
      const supabase = createClient();
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) throw err;
      router.replace("/app/dashboard");
      router.refresh();
    } catch (ex: unknown) {
      setError(ex instanceof Error ? ex.message : "تعذر تسجيل الدخول");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-wrap">
        <section className="login-hero">
          <Logo />
          <h1>Technical Content Evaluation</h1>
          <p>منصة مؤسسية لمراجعة جودة المحتوى التقني بذكاء اصطناعي — لفريق Instant Plus.</p>
        </section>
        <section className="login-card">
          <form className="form" onSubmit={onSubmit}>
            <div>
              <h2 style={{ margin: 0 }}>تسجيل الدخول</h2>
              <p className="help">الحسابات تُدار بواسطة الأدمن فقط</p>
            </div>
            <label>
              البريد الإلكتروني
              <input name="email" type="email" required placeholder="name@company.com" autoComplete="username" />
            </label>
            <label>
              كلمة المرور
              <div style={{ position: "relative" }}>
                <input
                  name="password"
                  type={showPass ? "text" : "password"}
                  required
                  placeholder="••••••••"
                  autoComplete="current-password"
                  style={{ width: "100%", paddingLeft: "4.2rem" }}
                />
                <button
                  type="button"
                  className="btn secondary"
                  style={{ position: "absolute", left: 6, top: 6, padding: "0.45rem 0.65rem" }}
                  onClick={() => setShowPass((v) => !v)}
                >
                  {showPass ? "إخفاء" : "عرض"}
                </button>
              </div>
            </label>
            <button className="btn" type="submit" disabled={loading}>
              {loading ? <><span className="spinner" /> جاري الدخول...</> : "دخول آمن"}
            </button>
            {error ? <div className="banner error">{error}</div> : null}
          </form>
        </section>
      </div>
    </div>
  );
}
