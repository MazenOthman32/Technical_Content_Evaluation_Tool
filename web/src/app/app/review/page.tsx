"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/Toast";
import { MODELS } from "@/lib/models";
import { createClient } from "@/lib/supabase/client";

export default function ReviewPage() {
  const toast = useToast();
  const [source, setSource] = useState<"drive" | "file">("drive");
  const [provider, setProvider] = useState("groq");
  const [model, setModel] = useState(MODELS.groq[0].id);
  const [fileName, setFileName] = useState("لم يتم اختيار ملف");
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
        .select("anthropic_api_key,groq_api_key,openai_api_key")
        .eq("user_id", auth.user.id)
        .maybeSingle();

      const key =
        provider === "groq"
          ? settings?.groq_api_key
          : provider === "openai"
            ? settings?.openai_api_key
            : settings?.anthropic_api_key;
      if (!key) throw new Error("أضف مفتاح API من الإعدادات أولاً");

      if (source === "drive" && !driveUrl) throw new Error("الصق لينك Google Drive");
      if (source === "file" && !file?.name) throw new Error("اختر ملف فيديو");

      const started = Date.now();
      const reviewId = `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
      await supabase.from("reviews").insert({
        id: reviewId,
        user_id: auth.user.id,
        video_name: source === "file" ? file?.name : driveUrl,
        drive_url: source === "drive" ? driveUrl : null,
        provider,
        model,
        status: processApi ? "queued" : "awaiting_backend",
        duration_ms: Date.now() - started,
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
        toast.push("تم إرسال المراجعة للمعالجة", "ok");
      } else {
        toast.push("تم حفظ الطلب. اربط NEXT_PUBLIC_PROCESS_API_URL للمعالجة الكاملة", "info");
      }
      e.currentTarget.reset();
      setFileName("لم يتم اختيار ملف");
    } catch (ex: unknown) {
      toast.push(ex instanceof Error ? ex.message : "حدث خطأ", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="page-title">مراجعة جديدة</h1>
      <p className="page-sub">ارفع فيديو أو الصق رابط Drive وابدأ تقييم الجودة</p>
      <form className="panel form" onSubmit={onSubmit} style={{ maxWidth: 720, marginTop: "1rem" }}>
        <div className="tabs">
          <button type="button" className={source === "drive" ? "active" : ""} onClick={() => setSource("drive")}>
            Google Drive
          </button>
          <button type="button" className={source === "file" ? "active" : ""} onClick={() => setSource("file")}>
            ملف محلي
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
              <option value="openai">OpenAI</option>
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
          {loading ? <><span className="spinner" /> جاري الإرسال...</> : "بدء المراجعة"}
        </button>
      </form>
    </div>
  );
}
