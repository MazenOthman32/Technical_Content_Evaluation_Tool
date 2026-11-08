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

export default function ReviewPage() {
  const [source, setSource] = useState<"drive" | "file">("drive");
  const [provider, setProvider] = useState("groq");
  const [model, setModel] = useState(MODELS.groq[0].id);
  const [fileName, setFileName] = useState("لم يتم اختيار ملف");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const processApi = process.env.NEXT_PUBLIC_PROCESS_API_URL || "";

  const modelOptions = useMemo(() => MODELS[provider] || [], [provider]);

  useEffect(() => {
    setModel(modelOptions[0]?.id || "");
  }, [provider, modelOptions]);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase
        .from("user_settings")
        .select("llm_provider,llm_model")
        .eq("user_id", auth.user.id)
        .maybeSingle();
      if (data?.llm_provider) setProvider(data.llm_provider);
      if (data?.llm_model) setModel(data.llm_model);
    })();
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr("");
    setMsg("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const driveUrl = String(fd.get("drive_url") || "").trim();
    const file = (fd.get("video") as File | null) || null;

    try {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("يلزم تسجيل الدخول");

      const { data: settings } = await supabase
        .from("user_settings")
        .select("anthropic_api_key,groq_api_key")
        .eq("user_id", auth.user.id)
        .maybeSingle();

      const key =
        provider === "groq"
          ? settings?.groq_api_key
          : settings?.anthropic_api_key;
      if (!key) throw new Error("أضف مفتاح API الخاص بحسابك من الإعدادات أولاً");

      if (source === "drive" && !driveUrl) throw new Error("الصق لينك Google Drive");
      if (source === "file" && !file?.name) throw new Error("اختر ملف فيديو");

      const reviewId = `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
      await supabase.from("reviews").insert({
        id: reviewId,
        user_id: auth.user.id,
        video_name: source === "file" ? file?.name : driveUrl,
        drive_url: source === "drive" ? driveUrl : null,
        provider,
        model,
        status: processApi ? "queued" : "awaiting_backend",
      });

      if (processApi) {
        const body = new FormData();
        body.set("provider", provider);
        body.set("model", model);
        body.set("drive_url", source === "drive" ? driveUrl : "");
        if (source === "file" && file) body.set("video", file);
        const session = await supabase.auth.getSession();
        const res = await fetch(`${processApi}/api/reviews`, {
          method: "POST",
          headers: { Authorization: `Bearer ${session.data.session?.access_token || ""}` },
          body,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || "فشل إرسال المهمة للمعالج");
        }
        setMsg("تم إرسال المراجعة للمعالجة.");
      } else {
        setMsg(
          "تم حفظ طلب المراجعة في Supabase. اضبط NEXT_PUBLIC_PROCESS_API_URL لربط معالج الفيديو."
        );
      }
      e.currentTarget.reset();
      setFileName("لم يتم اختيار ملف");
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "حدث خطأ");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="page-title">مراجعة جديدة</h1>
      <form className="panel form" onSubmit={onSubmit}>
        <div className="tabs">
          <button type="button" className={source === "drive" ? "active" : ""} onClick={() => setSource("drive")}>
            Google Drive
          </button>
          <button type="button" className={source === "file" ? "active" : ""} onClick={() => setSource("file")}>
            ملف
          </button>
        </div>

        {source === "drive" ? (
          <label>
            لينك Drive
            <input name="drive_url" type="url" placeholder="https://drive.google.com/file/d/..." />
          </label>
        ) : (
          <label className="drop">
            اسحب الفيديو أو اختر ملفاً
            <input
              name="video"
              type="file"
              accept="video/*"
              onChange={(e) => setFileName(e.target.files?.[0]?.name || "لم يتم اختيار ملف")}
            />
            <div className="help" style={{ marginTop: 8 }}>
              {fileName}
            </div>
          </label>
        )}

        <div className="form-grid">
          <label>
            المزود
            <select name="provider" value={provider} onChange={(e) => setProvider(e.target.value)}>
              <option value="groq">Groq</option>
              <option value="anthropic">Anthropic</option>
            </select>
          </label>
          <label>
            الموديل
            <select name="model" value={model} onChange={(e) => setModel(e.target.value)}>
              {modelOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button className="btn" type="submit" disabled={loading}>
          {loading ? "جاري الإرسال..." : "بدء المراجعة"}
        </button>
        {err ? <div className="banner error">{err}</div> : null}
        {msg ? <div className="banner ok">{msg}</div> : null}
      </form>
    </div>
  );
}
