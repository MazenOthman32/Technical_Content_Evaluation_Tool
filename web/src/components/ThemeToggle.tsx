"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const saved = (localStorage.getItem("ip-theme") as "light" | "dark" | null) || "light";
    setTheme(saved);
    document.documentElement.dataset.theme = saved;
  }, []);

  function toggle() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem("ip-theme", next);
  }

  return (
    <button className="icon-btn" type="button" onClick={toggle} aria-label="تبديل المظهر">
      {theme === "light" ? "☾" : "☀"}
    </button>
  );
}
