"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import CoursePicker from "@/components/CoursePicker";
import { useToast } from "@/components/Toast";
import { normalizeSessionTitle } from "@/lib/categories";
import { Course } from "@/lib/courses";
import { MODELS } from "@/lib/models";
import { createClient } from "@/lib/supabase/client";

export default function ReviewPage() {
  const toast = useToast();
  const router = useRouter();
  const [source, setSource] = useState<"drive" | "file">("drive");
  const [driveUrl, setDriveUrl] = useState("");
  const [provider, setProvider] = useState("groq");
  const [model, setModel] = useState(MODELS.groq[0].id);
  const [sessionTitle, setSessionTitle] = useState("");
  const [courseId, setCourseId] = useState("");
  const [course, setCourse] = useState<Course | null>(null);
  const [tags, setTags] = useState("");
  const [fileName, setFileName] = useState("لم يتم اختيار ملف");
  const [fileInputKey, setFileInputKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [processorReady, setProcessorReady] = useState<boolean | null>(null);
  const modelOptions = useMemo(() => MODELS[provider] || [], [provider]);

  useEffect(() => {
    fetch("/api/process/reviews")
      .then((r) => r.json())
      .then((j) => setProcessorReady(Boolean(j.ok)))
      .catch(() => setProcessorReady(false));
  }, []);

  useEffect(() => {
    setModel((prev) => {
      if (modelOptions.some((m) => m.id === prev)) return prev;
      return modelOptions[0]?.id || "";
    });
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

  function clearForm() {
    setDriveUrl("");
    setFileName("لم يتم اختيار ملف");
    setFileInputKey((k) => k + 1);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setLoading(true);
    const fd = new FormData(form);
    const url = driveUrl.trim();
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

      if (source === "drive" && !url) throw new Error("الصق لينك Google Drive");
      if (source === "file" && !file?.name) throw new Error("اختر ملف فيديو");
      const title = normalizeSessionTitle(sessionTitle);
      if (!title) throw new Error("أدخل عنوان السيشن");
      if (!courseId) throw new Error("اختر كورساً");

      const health = await fetch("/api/process/reviews").then((r) => r.json()).catch(() => ({ ok: false }));
      const canProcess = Boolean(health.ok);
      setProcessorReady(canProcess);

      const started = Date.now();
      const reviewId = `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
      const videoName = source === "file" ? file?.name || "video" : url;
      const tagList = [...new Set(tags.split(",").map((t) => t.trim()).filter(Boolean))].slice(0, 12);
      const category = course?.slug || "general";
      const org = { category, tags: tagList, session_title: title, course_id: courseId };
      const basePayload = {
        id: reviewId,
        user_id: auth.user.id,
        video_name: videoName,
        drive_url: source === "drive" ? url : null,
        provider,
        model,
        status: canProcess ? "queued" : "awaiting_backend",
        duration_ms: Date.now() - started,
        report: { _org: org },
      };
      let { error: insertErr } = await supabase.from("reviews").insert({
        ...basePayload,
        category,
        tags: tagList,
        session_title: title,
        course_id: courseId,
      });
      if (
        insertErr &&
        (String(insertErr.message || "").includes("category") ||
          String(insertErr.message || "").includes("session_title") ||
          String(insertErr.message || "").includes("course_id"))
      ) {
        const soft = { ...basePayload };
        const retry = await supabase.from("reviews").insert(soft);
        insertErr = retry.error;
      }
      if (insertErr) throw new Error(insertErr.message || "تعذر حفظ المراجعة");

      if (canProcess) {
        const body = new FormData();
        body.set("provider", provider);
        body.set("model", model);
        body.set("review_id", reviewId);
        body.set("drive_url", source === "drive" ? url : "");
        if (source === "file" && file) body.set("video", file);
        const res = await fetch("/api/process/reviews", { method: "POST", body });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          await supabase.from("reviews").update({ status: "failed" }).eq("id", reviewId);
          throw new Error(data.error || data.detail || "فشل إرسال المهمة للمعالج");
        }
        toast.push("تم إرسال المراجعة للمعالجة", "ok");
      } else {
        toast.push("تم حفظ الطلب. المعالج غير متصل حالياً", "ok");
      }
      form?.reset?.();
      clearForm();
      setSessionTitle("");
      setTags("");
      router.push(`/app/reports/${encodeURIComponent(reviewId)}`);
    } catch (ex: unknown) {
      toast.push(ex instanceof Error ? ex.message : "حدث خطأ", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-fill">
      <div className="page-head">
        <div>
          <h1 className="page-title">مراجعة جديدة</h1>
          <p className="page-sub">حدّد عنوان السيشن والكورس، ثم ارفع الفيديو أو الصق رابط Drive</p>
        </div>
      </div>
      <form className="panel form review-form settings-panel" onSubmit={onSubmit}>
        {processorReady === false ? (
          <div className="banner warn">
            معالج الفيديو غير متصل. سيتم حفظ الطلب، ويكتمل التحليل بعد تشغيل المعالج محلياً.
          </div>
        ) : null}
        {processorReady === true ? (
          <div className="banner ok">المعالج متصل — سيُنشأ التقرير الكامل بعد انتهاء التحليل.</div>
        ) : null}
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
            <input
              name="drive_url"
              type="url"
              value={driveUrl}
              onChange={(e) => setDriveUrl(e.target.value)}
              placeholder="https://drive.google.com/file/d/..."
            />
          </label>
        ) : (
          <label className="drop">
            اسحب الفيديو أو اختر ملفاً
            <input
              key={fileInputKey}
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

        <label>
          عنوان السيشن
          <input
            value={sessionTitle}
            onChange={(e) => setSessionTitle(e.target.value)}
            placeholder="مثال: Session 1: Introduction to React"
            required
            maxLength={160}
          />
        </label>

        <CoursePicker
          value={courseId}
          autoSelectDefault
          onChange={(id, c) => {
            setCourseId(id);
            setCourse(c || null);
          }}
          disabled={loading}
        />

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
          <label>
            وحدات / وسوم (مفصولة بفاصلة)
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Module 1, Hooks, Auth"
            />
          </label>
        </div>

        <button className="btn" type="submit" disabled={loading}>
          {loading ? <><span className="spinner" /> جاري الإرسال...</> : "بدء المراجعة"}
        </button>
      </form>
    </div>
  );
}
