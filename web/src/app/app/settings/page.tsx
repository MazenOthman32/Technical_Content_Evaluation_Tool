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

type KeyUi = ReturnType<typeof keyStatus>;

const emptyEdit = {
  id: "",
  full_name: "",
  username: "",
  email: "",
  role: "reviewer",
  is_active: true,
  password: "",
  anthropic_api_key: "",
  groq_api_key: "",
  openai_api_key: "",
};

export default function SettingsPage() {
  const toast = useToast();
  const [tab, setTab] = useState<"keys" | "prefs" | "processor" | "users">("keys");
  const [role, setRole] = useState("reviewer");
  const [myId, setMyId] = useState("");
  const [provider, setProvider] = useState("groq");
  const [model, setModel] = useState(MODELS.groq[0].id);
  const [whisper, setWhisper] = useState("auto");
  const [maxCost, setMaxCost] = useState("");
  const [anthropic, setAnthropic] = useState<KeyUi>({ state: "missing", label: "غير مضبوط", has: false });
  const [groq, setGroq] = useState<KeyUi>({ state: "missing", label: "غير مضبوط", has: false });
  const [openai, setOpenai] = useState<KeyUi>({ state: "missing", label: "غير مضبوط", has: false });
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [usersErr, setUsersErr] = useState("");
  const [editing, setEditing] = useState<typeof emptyEdit | null>(null);
  const [processorOk, setProcessorOk] = useState<boolean | null>(null);
  const [processorMsg, setProcessorMsg] = useState("");
  const [processorBase, setProcessorBase] = useState("");
  const [processorBusy, setProcessorBusy] = useState(false);
  const options = useMemo(() => MODELS[provider] || [], [provider]);
  const isSuper = role === "super_admin";
  const startCommands = useMemo(
    () =>
      [
        'cd "C:\\Users\\omaze\\OneDrive\\Desktop\\Final Evaluation Tool"',
        ".\\scripts\\start-processor.ps1",
        ".\\scripts\\start-tunnel.ps1",
      ].join("\n"),
    []
  );

  async function loadSettings() {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    setMyId(auth.user.id);
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

  async function checkProcessor() {
    setProcessorBusy(true);
    try {
      const res = await fetch("/api/process/reviews", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      const ok = Boolean(json.ok);
      setProcessorOk(ok);
      setProcessorBase(String(json.base || ""));
      setProcessorMsg(
        ok
          ? "المعالج متصل وجاهز لاستقبال المراجعات."
          : json.message || json.error || "المعالج غير متصل. شغّله من اللاب ثم افحص مرة أخرى."
      );
      toast.push(ok ? "المعالج متصل" : "المعالج غير متصل", ok ? "ok" : "error");
    } catch (ex: unknown) {
      setProcessorOk(false);
      setProcessorMsg(ex instanceof Error ? ex.message : "فشل فحص المعالج");
      toast.push("فشل فحص المعالج", "error");
    } finally {
      setProcessorBusy(false);
    }
  }

  async function startProcessorAction() {
    setProcessorBusy(true);
    try {
      const health = await fetch("/api/process/reviews", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ ok: false }));
      if (health.ok) {
        setProcessorOk(true);
        setProcessorBase(String(health.base || ""));
        setProcessorMsg("المعالج متصل بالفعل.");
        toast.push("المعالج شغّال بالفعل", "ok");
        return;
      }

      const a = document.createElement("a");
      a.href = "/ops/start-vercel-processor.ps1";
      a.download = "start-vercel-processor.ps1";
      a.click();
      await navigator.clipboard.writeText(startCommands).catch(() => undefined);
      setProcessorOk(false);
      setProcessorMsg(
        "تم تحميل سكربت التشغيل ونسخ الأوامر. شغّل الملف على اللاب (أو الصق الأوامر في PowerShell)، ثم اضغط «فحص الاتصال»."
      );
      toast.push("تم تجهيز التشغيل — افتح السكربت على اللاب", "ok");
    } catch (ex: unknown) {
      toast.push(ex instanceof Error ? ex.message : "تعذر بدء التجهيز", "error");
    } finally {
      setProcessorBusy(false);
    }
  }

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    if (tab === "users" && isStaff(role)) loadUsers();
    if (tab === "processor") checkProcessor();
  }, [tab, role]);

  async function saveSettings(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setLoading(true);
    const fd = new FormData(form);
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
      form?.reset?.();
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
    const form = e.currentTarget;
    setLoading(true);
    const fd = new FormData(form);
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
      form?.reset?.();
      await loadUsers();
    } catch (ex: unknown) {
      toast.push(ex instanceof Error ? ex.message : "فشل", "error");
    } finally {
      setLoading(false);
    }
  }

  function openEdit(u: ManagedUser) {
    setEditing({
      id: u.id,
      full_name: u.full_name || "",
      username: u.username || "",
      email: u.email || "",
      role: u.role,
      is_active: u.is_active,
      password: "",
      anthropic_api_key: "",
      groq_api_key: "",
      openai_api_key: "",
    });
  }

  async function saveEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing || !isSuper) return;
    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        full_name: editing.full_name,
        username: editing.username,
        email: editing.email,
        role: editing.role,
        is_active: editing.is_active,
      };
      if (editing.password.trim()) payload.password = editing.password.trim();
      if (editing.anthropic_api_key.trim()) payload.anthropic_api_key = editing.anthropic_api_key.trim();
      if (editing.groq_api_key.trim()) payload.groq_api_key = editing.groq_api_key.trim();
      if (editing.openai_api_key.trim()) payload.openai_api_key = editing.openai_api_key.trim();

      const res = await fetch(`/api/admin/users/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "فشل التعديل");
      toast.push("تم تحديث الحساب", "ok");
      setEditing(null);
      await loadUsers();
    } catch (ex: unknown) {
      toast.push(ex instanceof Error ? ex.message : "فشل", "error");
    } finally {
      setLoading(false);
    }
  }

  async function removeUser(u: ManagedUser) {
    if (!isSuper) return;
    if (u.id === myId) {
      toast.push("لا يمكن حذف حسابك الحالي", "error");
      return;
    }
    if (!window.confirm(`حذف الحساب ${u.email} نهائيًا؟`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "فشل الحذف");
      toast.push("تم حذف الحساب", "ok");
      if (editing?.id === u.id) setEditing(null);
      await loadUsers();
    } catch (ex: unknown) {
      toast.push(ex instanceof Error ? ex.message : "فشل", "error");
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(u: ManagedUser) {
    if (!isSuper) return;
    if (u.id === myId && u.is_active) {
      toast.push("لا يمكن تعطيل حسابك الحالي", "error");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !u.is_active }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "فشل التحديث");
      toast.push(u.is_active ? "تم تعطيل الحساب" : "تم تفعيل الحساب", "ok");
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
        <button type="button" className={tab === "processor" ? "active" : ""} onClick={() => setTab("processor")}>
          المعالج
        </button>
        {isStaff(role) ? (
          <button type="button" className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}>
            إدارة المستخدمين
          </button>
        ) : null}
      </div>

      {tab === "processor" ? (
        <div className="panel settings-panel">
          <h2 className="section-title">معالج الفيديو (Vercel)</h2>
          <p className="help" style={{ marginBottom: "1rem" }}>
            موقع Vercel لا يقدر يشغّل Python على اللاب مباشرة. الزر يجهّز سكربت التشغيل محلياً، وبعد فتح النفق حدّث
            <code> PROCESS_API_URL </code>
            في Vercel إن تغيّر اللينك.
          </p>

          <div className={`banner ${processorOk ? "ok" : processorOk === false ? "warn" : ""}`} style={{ marginBottom: "1rem" }}>
            <strong>
              {processorOk === null ? "جاري الفحص..." : processorOk ? "متصل" : "غير متصل"}
            </strong>
            <p className="help" style={{ margin: "0.4rem 0 0" }}>
              {processorMsg || "اضغط فحص الاتصال لمعرفة حالة المعالج."}
            </p>
            {processorBase ? (
              <p className="help" style={{ margin: "0.35rem 0 0", direction: "ltr", textAlign: "left" }}>
                {processorBase}
              </p>
            ) : null}
          </div>

          <div className="row-actions" style={{ marginBottom: "1rem" }}>
            <button className="btn" type="button" disabled={processorBusy} onClick={startProcessorAction}>
              {processorBusy ? (
                <>
                  <span className="spinner" /> جاري التجهيز...
                </>
              ) : (
                "تشغيل المعالج"
              )}
            </button>
            <button className="btn secondary" type="button" disabled={processorBusy} onClick={checkProcessor}>
              فحص الاتصال
            </button>
            <button
              className="btn secondary"
              type="button"
              disabled={processorBusy}
              onClick={async () => {
                await navigator.clipboard.writeText(startCommands);
                toast.push("تم نسخ أوامر PowerShell", "ok");
              }}
            >
              نسخ الأوامر
            </button>
          </div>

          <pre
            className="help"
            style={{
              margin: 0,
              padding: "0.9rem 1rem",
              borderRadius: "var(--radius)",
              border: "1px solid var(--line)",
              background: "color-mix(in srgb, var(--panel-solid) 88%, var(--bg))",
              whiteSpace: "pre-wrap",
              direction: "ltr",
              textAlign: "left",
              lineHeight: 1.7,
            }}
          >
            {startCommands}
          </pre>
        </div>
      ) : null}

      {(tab === "keys" || tab === "prefs") && (
        <form className="panel form settings-panel" onSubmit={saveSettings}>
          {tab === "keys" ? (
            <>
              <h2 className="section-title">واجهة إدارة المفاتيح</h2>
              <p className="help">المفاتيح محفوظة لحسابك فقط. اترك الحقل فارغًا للإبقاء على القيمة الحالية.</p>
              <div className="form-grid">
                <label>
                  <span className="label-row">
                    Anthropic <KeyBadge state={anthropic.state} label={anthropic.label} />
                  </span>
                  <input name="anthropic_api_key" type="password" placeholder="sk-ant-..." autoComplete="off" />
                  <button className="btn secondary" type="button" onClick={() => testKey("anthropic", "anthropic_api_key")}>
                    اختبار
                  </button>
                </label>
                <label>
                  <span className="label-row">
                    Groq <KeyBadge state={groq.state} label={groq.label} />
                  </span>
                  <input name="groq_api_key" type="password" placeholder="gsk_..." autoComplete="off" />
                  <button className="btn secondary" type="button" onClick={() => testKey("groq", "groq_api_key")}>
                    اختبار
                  </button>
                </label>
                <label>
                  <span className="label-row">
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
              <h2 className="section-title">تفضيلات المراجعة</h2>
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
            {loading ? (
              <>
                <span className="spinner" /> جاري الحفظ...
              </>
            ) : (
              "حفظ"
            )}
          </button>
        </form>
      )}

      {tab === "users" && isStaff(role) ? (
        <div className="users-stack">
          <form className="panel form settings-panel" onSubmit={createUser}>
            <h2 className="section-title">إنشاء مستخدم جديد</h2>
            <p className="help">
              {isSuper
                ? "Super Admin يقدر يضيف/يعدل/يحذف أي حساب على Supabase Auth."
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
                  {isSuper ? (
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
              {loading ? (
                <>
                  <span className="spinner" /> جاري الإنشاء...
                </>
              ) : (
                "إنشاء الحساب"
              )}
            </button>
          </form>

          <div className="panel">
            <h2 className="section-title">المستخدمون</h2>
            {usersErr ? <div className="banner error">{usersErr}</div> : null}
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>المستخدم</th>
                    <th>الدور</th>
                    <th>الحالة</th>
                    <th>Anthropic</th>
                    <th>Groq</th>
                    <th>OpenAI</th>
                    {isSuper ? <th>إجراءات</th> : null}
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
                        <span className={`pill ${u.is_active ? "pill-ok" : "pill-danger"}`}>
                          {u.is_active ? "نشط" : "معطّل"}
                        </span>
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
                      {isSuper ? (
                        <td>
                          <div className="row-actions">
                            <button className="btn secondary btn-sm" type="button" onClick={() => openEdit(u)}>
                              تعديل
                            </button>
                            <button className="btn secondary btn-sm" type="button" onClick={() => toggleActive(u)}>
                              {u.is_active ? "تعطيل" : "تفعيل"}
                            </button>
                            <button
                              className="btn secondary btn-sm btn-danger"
                              type="button"
                              onClick={() => removeUser(u)}
                              disabled={u.id === myId}
                            >
                              حذف
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {editing && isSuper ? (
            <div className="modal-backdrop" onClick={() => setEditing(null)}>
              <form
                className="panel form modal-card"
                onClick={(e) => e.stopPropagation()}
                onSubmit={saveEdit}
              >
                <div className="modal-head">
                  <h2 className="section-title">تعديل الحساب</h2>
                  <button className="icon-btn" type="button" onClick={() => setEditing(null)} aria-label="إغلاق">
                    ✕
                  </button>
                </div>
                <div className="form-grid">
                  <label>
                    الاسم الكامل
                    <input
                      value={editing.full_name}
                      onChange={(e) => setEditing({ ...editing, full_name: e.target.value })}
                      required
                    />
                  </label>
                  <label>
                    اسم المستخدم
                    <input
                      value={editing.username}
                      onChange={(e) => setEditing({ ...editing, username: e.target.value })}
                      required
                    />
                  </label>
                  <label>
                    البريد
                    <input
                      type="email"
                      value={editing.email}
                      onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                      required
                    />
                  </label>
                  <label>
                    الدور
                    <select
                      value={editing.role}
                      onChange={(e) => setEditing({ ...editing, role: e.target.value })}
                    >
                      <option value="reviewer">Reviewer</option>
                      <option value="admin">Admin</option>
                      <option value="super_admin">Super Admin</option>
                    </select>
                  </label>
                  <label>
                    كلمة مرور جديدة (اختياري)
                    <input
                      type="password"
                      value={editing.password}
                      onChange={(e) => setEditing({ ...editing, password: e.target.value })}
                      minLength={8}
                      placeholder="اتركها فارغة للإبقاء"
                    />
                  </label>
                  <label className="check-row">
                    <span>الحساب نشط</span>
                    <input
                      type="checkbox"
                      checked={editing.is_active}
                      onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })}
                    />
                  </label>
                  <label>
                    Anthropic (اختياري)
                    <input
                      type="password"
                      value={editing.anthropic_api_key}
                      onChange={(e) => setEditing({ ...editing, anthropic_api_key: e.target.value })}
                      autoComplete="off"
                    />
                  </label>
                  <label>
                    Groq (اختياري)
                    <input
                      type="password"
                      value={editing.groq_api_key}
                      onChange={(e) => setEditing({ ...editing, groq_api_key: e.target.value })}
                      autoComplete="off"
                    />
                  </label>
                  <label>
                    OpenAI (اختياري)
                    <input
                      type="password"
                      value={editing.openai_api_key}
                      onChange={(e) => setEditing({ ...editing, openai_api_key: e.target.value })}
                      autoComplete="off"
                    />
                  </label>
                </div>
                <div className="row-actions">
                  <button className="btn" type="submit" disabled={loading}>
                    {loading ? (
                      <>
                        <span className="spinner" /> جاري الحفظ...
                      </>
                    ) : (
                      "حفظ التعديلات"
                    )}
                  </button>
                  <button className="btn secondary" type="button" onClick={() => setEditing(null)}>
                    إلغاء
                  </button>
                </div>
              </form>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
