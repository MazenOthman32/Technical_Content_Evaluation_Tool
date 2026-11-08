"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import KeyBadge from "@/components/KeyBadge";
import { useToast } from "@/components/Toast";
import { isStaff } from "@/lib/auth/roles";
import { keyStatus } from "@/lib/keys";
import { MODELS } from "@/lib/models";
import { createClient } from "@/lib/supabase/client";

type ManagedUser = {
  id: string;
  email: string | null;
  username: string | null;
  full_name: string | null;
  role: string;
  is_active: boolean;
  keys: Record<string, { state: "missing" | "saved" | "verified"; label: string; masked: string }>;
};

export default function SettingsPage() {
  const toast = useToast();
  const [tab, setTab] = useState<"keys" | "prefs" | "users">("keys");
  const [role, setRole] = useState("reviewer");
  const [provider, setProvider] = useState("groq");
  const [model, setModel] = useState(MODELS.groq[0].id);
  const [whisper, setWhisper] = useState("auto");
  const [maxCost, setMaxCost] = useState("");
  type KeyUi = ReturnType<typeof keyStatus>;
  const [anthropic, setAnthropic] = useState<KeyUi>({ state: "missing", label: "غير مضبوط", has: false });
  const [groq, setGroq] = useState<KeyUi>({ state: "missing", label: "غير مضبوط", has: false });
  const [openai, setOpenai] = useState<KeyUi>({ state: "missing", label: "غير مضبوط", has: false });
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [usersErr, setUsersErr] = useState("");
  const options = useMemo(() => MODELS[provider] || [], [provider]);

  async function loadSettings() {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", auth.user.id)
      .maybeSingle();
    setRole(profile?.role || "reviewer");

    const { data } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (!data) {
      await supabase.from("user_settings").upsert({ user_id: auth.user.id });
      return;
    }
    setProvider(data.llm_provider || "groq");
    setModel(data.llm_model || MODELS.groq[0].id);
    setWhisper(data.whisper_model || "auto");
    setMaxCost(data.max_cost != null ? String(data.max_cost) : "");
    setAnthropic(keyStatus(data.anthropic_api_key, data.anthropic_verified_at));
    setGroq(keyStatus(data.groq_api_key, data.groq_verified_at));
    setOpenai(keyStatus(data.openai_api_key, data.openai_verified_at));
  }

  async function loadUsers() {
    setUsersErr("");
    const res = await fetch("/api/admin/users");
    const json = await res.json();
    if (!res.ok) {
      setUsersErr(json.error || "تعذر تحميل المستخدمين");
      return;
    }
    setUsers(json.users || []);
  }

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    if (tab === "users" && isStaff(role)) loadUsers();
  }, [tab, role]);

  async function saveSettings(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("يلزم تسجيل الدخول");
      const { data: current } = await supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", auth.user.id)
        .maybeSingle();

      const payload = {
        user_id: auth.user.id,
        llm_provider: provider,
        llm_model: model,
        whisper_model: whisper,
        max_cost: maxCost ? Number(maxCost) : null,
        anthropic_api_key:
          String(fd.get("anthropic_api_key") || "").trim() || current?.anthropic_api_key || "",
        groq_api_key: String(fd.get("groq_api_key") || "").trim() || current?.groq_api_key || "",
        openai_api_key: String(fd.get("openai_api_key") || "").trim() || current?.openai_api_key || "",
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("user_settings").upsert(payload);
      if (error) throw error;
      toast.push("تم حفظ الإعدادات", "ok");
      e.currentTarget.reset();
      await loadSettings();
    } catch (ex: unknown) {
      toast.push(ex instanceof Error ? ex.message : "فشل الحفظ", "error");
    } finally {
      setLoading(false);
    }
  }

  async function testKey(providerName: "anthropic" | "groq" | "openai", inputName: string) {
    const input = document.querySelector(`[name="${inputName}"]`) as HTMLInputElement | null;
    const res = await fetch("/api/keys/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: providerName, api_key: input?.value || "" }),
    });
    const json = await res.json();
    toast.push(json.message || (res.ok ? "تم" : "فشل"), res.ok ? "ok" : "error");
    await loadSettings();
  }

  async function createUser(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: fd.get("email"),
          password: fd.get("password"),
          full_name: fd.get("full_name"),
          username: fd.get("username"),
          role: fd.get("role"),
          anthropic_api_key: fd.get("new_anthropic"),
          groq_api_key: fd.get("new_groq"),
          openai_api_key: fd.get("new_openai"),
          llm_provider: fd.get("new_provider") || "groq",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "فشل الإنشاء");
      toast.push(`تم إنشاء ${json.email}`, "ok");
      e.currentTarget.reset();
      await loadUsers();
    } catch (ex: unknown) {
      toast.push(ex instanceof Error ? ex.message : "فشل", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-fill settings-page">
      <div className="page-head">
        <div>
          <h1 className="page-title">الإعدادات</h1>
          <p className="page-sub">إدارة المفاتيح والتفضيلات{isStaff(role) ? " والمستخدمين" : ""}</p>
        </div>
      </div>

      <div className="tabs">
        <button type="button" className={tab === "keys" ? "active" : ""} onClick={() => setTab("keys")}>
          مفاتيح API
        </button>
        <button type="button" className={tab === "prefs" ? "active" : ""} onClick={() => setTab("prefs")}>
          تفضيلات المراجعة
        </button>
        {isStaff(role) ? (
          <button type="button" className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}>
            إدارة المستخدمين
          </button>
        ) : null}
      </div>

      {(tab === "keys" || tab === "prefs") && (
        <form className="panel form settings-panel" onSubmit={saveSettings}>
          {tab === "keys" ? (
            <>
              <h2 style={{ margin: 0, fontSize: "1.05rem" }}>واجهة إدارة المفاتيح</h2>
              <p className="help">المفاتيح محفوظة لحسابك فقط. اترك الحقل فارغًا للإبقاء على القيمة الحالية.</p>
              <div className="form-grid">
                <label>
                  <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    Anthropic <KeyBadge state={anthropic.state} label={anthropic.label} />
                  </span>
                  <input name="anthropic_api_key" type="password" placeholder="sk-ant-..." autoComplete="off" />
                  <button className="btn secondary" type="button" onClick={() => testKey("anthropic", "anthropic_api_key")}>
                    اختبار
                  </button>
                </label>
                <label>
                  <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    Groq <KeyBadge state={groq.state} label={groq.label} />
                  </span>
                  <input name="groq_api_key" type="password" placeholder="gsk_..." autoComplete="off" />
                  <button className="btn secondary" type="button" onClick={() => testKey("groq", "groq_api_key")}>
                    اختبار
                  </button>
                </label>
                <label>
                  <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    OpenAI <KeyBadge state={openai.state} label={openai.label} />
                  </span>
                  <input name="openai_api_key" type="password" placeholder="sk-..." autoComplete="off" />
                  <button className="btn secondary" type="button" onClick={() => testKey("openai", "openai_api_key")}>
                    اختبار
                  </button>
                </label>
              </div>
            </>
          ) : (
            <>
              <h2 style={{ margin: 0, fontSize: "1.05rem" }}>تفضيلات المراجعة</h2>
              <div className="form-grid">
                <label>
                  المزود الافتراضي
                  <select
                    value={provider}
                    onChange={(e) => {
                      setProvider(e.target.value);
                      setModel((MODELS[e.target.value] || [])[0]?.id || "");
                    }}
                  >
                    <option value="groq">Groq</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="openai">OpenAI</option>
                  </select>
                </label>
                <label>
                  الموديل الافتراضي
                  <select value={model} onChange={(e) => setModel(e.target.value)}>
                    {options.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  حد التكلفة (USD)
                  <input value={maxCost} onChange={(e) => setMaxCost(e.target.value)} type="number" step="0.1" min="0" />
                </label>
                <label>
                  موديل Whisper
                  <select value={whisper} onChange={(e) => setWhisper(e.target.value)}>
                    <option value="auto">auto</option>
                    <option value="small">small</option>
                    <option value="medium">medium</option>
                    <option value="large-v3">large-v3</option>
                  </select>
                </label>
              </div>
            </>
          )}
          <button className="btn" type="submit" disabled={loading}>
            {loading ? <><span className="spinner" /> جاري الحفظ...</> : "حفظ"}
          </button>
        </form>
      )}

      {tab === "users" && isStaff(role) ? (
        <div className="users-stack">
          <form className="panel form settings-panel" onSubmit={createUser}>
            <h2 style={{ margin: 0, fontSize: "1.05rem" }}>إنشاء مستخدم جديد</h2>
            <p className="help">
              {role === "super_admin"
                ? "Super Admin يقدر يضيف Super Admin أو Admin أو Reviewer. الحسابات تتعمل على Supabase Auth."
                : "الأدمن يقدر يضيف Reviewer فقط."}
            </p>
            <div className="form-grid">
              <label>
                الاسم الكامل
                <input name="full_name" required />
              </label>
              <label>
                اسم المستخدم
                <input name="username" required />
              </label>
              <label>
                البريد
                <input name="email" type="email" required />
              </label>
              <label>
                كلمة المرور
                <input name="password" type="password" required minLength={8} />
              </label>
              <label>
                الدور
                <select name="role" defaultValue="reviewer">
                  <option value="reviewer">Reviewer</option>
                  {role === "super_admin" ? (
                    <>
                      <option value="admin">Admin</option>
                      <option value="super_admin">Super Admin</option>
                    </>
                  ) : null}
                </select>
              </label>
              <label>
                المزود الافتراضي
                <select name="new_provider" defaultValue="groq">
                  <option value="groq">Groq</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="openai">OpenAI</option>
                </select>
              </label>
              <label>
                Anthropic (اختياري)
                <input name="new_anthropic" type="password" autoComplete="off" />
              </label>
              <label>
                Groq (اختياري)
                <input name="new_groq" type="password" autoComplete="off" />
              </label>
              <label>
                OpenAI (اختياري)
                <input name="new_openai" type="password" autoComplete="off" />
              </label>
            </div>
            <button className="btn" type="submit" disabled={loading}>
              {loading ? <><span className="spinner" /> جاري الإنشاء...</> : "إنشاء الحساب"}
            </button>
          </form>

          <div className="panel">
            <h2 style={{ margin: "0 0 0.8rem", fontSize: "1.05rem" }}>المستخدمون</h2>
            {usersErr ? <div className="banner error">{usersErr}</div> : null}
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>المستخدم</th>
                    <th>الدور</th>
                    <th>Anthropic</th>
                    <th>Groq</th>
                    <th>OpenAI</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <strong>{u.full_name || u.username}</strong>
                        <div className="help">{u.email}</div>
                      </td>
                      <td>
                        <span className="pill">{u.role}</span>
                      </td>
                      <td>
                        <KeyBadge state={u.keys.anthropic.state} label={u.keys.anthropic.label} />
                        <div className="help">{u.keys.anthropic.masked || "—"}</div>
                      </td>
                      <td>
                        <KeyBadge state={u.keys.groq.state} label={u.keys.groq.label} />
                        <div className="help">{u.keys.groq.masked || "—"}</div>
                      </td>
                      <td>
                        <KeyBadge state={u.keys.openai.state} label={u.keys.openai.label} />
                        <div className="help">{u.keys.openai.masked || "—"}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
