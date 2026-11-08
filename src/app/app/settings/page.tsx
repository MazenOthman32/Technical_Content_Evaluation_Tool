"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const MODELS: Record<string, { id: string; label: string }[]> = {
  groq: [
    { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B (Groq)" },
    { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
    { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant" },
  ],
  anthropic: [
    { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" },
    { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
  ],
};

export default function SettingsPage() {
  const [provider, setProvider] = useState("groq");
  const [model, setModel] = useState(MODELS.groq[0].id);
  const [whisper, setWhisper] = useState("auto");
  const [maxCost, setMaxCost] = useState("");
  const [anthropicSet, setAnthropicSet] = useState(false);
  const [groqSet, setGroqSet] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const options = useMemo(() => MODELS[provider] || [], [provider]);

  async function load() {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
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
    setAnthropicSet(Boolean((data.anthropic_api_key || "").trim()));
    setGroqSet(Boolean((data.groq_api_key || "").trim()));
  }

  useEffect(() => {
    load();
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg("");
    setErr("");
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

      const anthropic = String(fd.get("anthropic_api_key") || "").trim();
      const groq = String(fd.get("groq_api_key") || "").trim();

      const payload: Record<string, unknown> = {
        user_id: auth.user.id,
        llm_provider: provider,
        llm_model: model,
        whisper_model: whisper,
        max_cost: maxCost ? Number(maxCost) : null,
        anthropic_api_key: anthropic || current?.anthropic_api_key || "",
        groq_api_key: groq || current?.groq_api_key || "",
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("user_settings").upsert(payload);
      if (error) throw error;
      setMsg("تم حفظ إعدادات حسابك في Supabase.");
      (e.currentTarget.querySelector('[name="anthropic_api_key"]') as HTMLInputElement).value = "";
      (e.currentTarget.querySelector('[name="groq_api_key"]') as HTMLInputElement).value = "";
      await load();
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "فشل الحفظ");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="page-title">الإعدادات</h1>
      <form className="panel form" onSubmit={onSubmit} style={{ maxWidth: 760 }}>
        <h2 style={{ margin: 0, fontSize: "1.05rem" }}>مفاتيح API لحسابك فقط</h2>
        <p className="help">كل حساب يحفظ مفاتيحه بشكل منفصل. المراجع لا يرى مفاتيح الأدمن.</p>
        <div className="form-grid">
          <label>
            Anthropic API Key
            <input name="anthropic_api_key" type="password" placeholder="sk-ant-..." autoComplete="off" />
            <span className="help">{anthropicSet ? "مفتاح محفوظ" : "غير مضبوط"}</span>
          </label>
          <label>
            Groq API Key
            <input name="groq_api_key" type="password" placeholder="gsk_..." autoComplete="off" />
            <span className="help">{groqSet ? "مفتاح محفوظ" : "غير مضبوط"}</span>
          </label>
        </div>

        <h2 style={{ margin: "0.4rem 0 0", fontSize: "1.05rem" }}>تفضيلات المراجعة</h2>
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
        <button className="btn" type="submit" disabled={loading}>
          {loading ? "جاري الحفظ..." : "حفظ الإعدادات"}
        </button>
        {err ? <div className="banner error">{err}</div> : null}
        {msg ? <div className="banner ok">{msg}</div> : null}
      </form>
    </div>
  );
}
