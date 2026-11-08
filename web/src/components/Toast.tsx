"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

type ToastItem = { id: number; type: "ok" | "error" | "info"; text: string };

const ToastCtx = createContext<{
  push: (text: string, type?: ToastItem["type"]) => void;
} | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, type: ToastItem["type"] = "info") => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, type, text }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 3200);
  }, []);
  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) return { push: () => undefined };
  return ctx;
}
