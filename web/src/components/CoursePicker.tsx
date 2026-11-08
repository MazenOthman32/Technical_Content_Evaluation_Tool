"use client";

import { useEffect, useState } from "react";
import { Course } from "@/lib/courses";

type CoursePickerProps = {
  value: string;
  onChange: (courseId: string, course?: Course | null) => void;
  disabled?: boolean;
  allowCreate?: boolean;
  autoSelectDefault?: boolean;
};

export default function CoursePicker({
  value,
  onChange,
  disabled = false,
  allowCreate = true,
  autoSelectDefault = false,
}: CoursePickerProps) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");

  async function loadCourses() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/courses");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "تعذر تحميل الكورسات");
      const list = (json.courses || []) as Course[];
      setCourses(list);
      if (autoSelectDefault && !value && list.length) {
        const general = list.find((c) => c.slug === "general") || list[0];
        onChange(general.id, general);
      }
    } catch (ex: unknown) {
      setError(ex instanceof Error ? ex.message : "تعذر تحميل الكورسات");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCourses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createCourse() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "فشل إنشاء الكورس");
      const course = json.course as Course;
      setCourses((prev) => [...prev, course].sort((a, b) => a.name.localeCompare(b.name, "ar")));
      onChange(course.id, course);
      setNewName("");
      setShowCreate(false);
    } catch (ex: unknown) {
      setError(ex instanceof Error ? ex.message : "فشل إنشاء الكورس");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="course-picker">
      <label>
        الكورس
        <select
          value={value}
          disabled={disabled || loading}
          onChange={(e) => {
            const id = e.target.value;
            if (id === "__create__") {
              setShowCreate(true);
              return;
            }
            const found = courses.find((c) => c.id === id) || null;
            onChange(id, found);
          }}
        >
          {loading ? <option value="">جاري التحميل...</option> : null}
          {!loading && !courses.length ? <option value="">لا توجد كورسات</option> : null}
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          {allowCreate ? <option value="__create__">+ إنشاء كورس جديد...</option> : null}
        </select>
      </label>

      {showCreate ? (
        <div className="inline-add" style={{ marginTop: "0.65rem" }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="اسم الكورس الجديد"
            maxLength={120}
            disabled={creating || disabled}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                createCourse();
              }
            }}
          />
          <button className="btn secondary btn-sm" type="button" disabled={creating || !newName.trim()} onClick={createCourse}>
            {creating ? "..." : "إنشاء"}
          </button>
          <button
            className="btn secondary btn-sm"
            type="button"
            disabled={creating}
            onClick={() => {
              setShowCreate(false);
              setNewName("");
            }}
          >
            إلغاء
          </button>
        </div>
      ) : null}

      {error ? <p className="help" style={{ color: "var(--danger)", marginTop: "0.45rem" }}>{error}</p> : null}
    </div>
  );
}
