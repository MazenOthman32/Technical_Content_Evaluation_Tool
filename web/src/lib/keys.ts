export type KeyProvider = "anthropic" | "groq" | "openai";

export function maskKey(value?: string | null) {
  const key = (value || "").trim();
  if (!key) return "";
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

export function keyStatus(value?: string | null, verifiedAt?: string | null) {
  const has = Boolean((value || "").trim());
  if (!has) return { state: "missing" as const, label: "غير مضبوط", has: false };
  if (verifiedAt) return { state: "verified" as const, label: "مفعّل ومُختبر", has: true };
  return { state: "saved" as const, label: "محفوظ", has: true };
}

export async function probeKey(provider: KeyProvider, apiKey: string) {
  const key = apiKey.trim();
  if (!key) return { ok: false, message: "المفتاح فارغ" };

  if (provider === "groq") {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, message: `Groq رفض المفتاح (${res.status})` };
    return { ok: true, message: "Groq يعمل" };
  }

  if (provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, message: `OpenAI رفض المفتاح (${res.status})` };
    return { ok: true, message: "OpenAI يعمل" };
  }

  const res = await fetch("https://api.anthropic.com/v1/models", {
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    cache: "no-store",
  });
  if (!res.ok) return { ok: false, message: `Anthropic رفض المفتاح (${res.status})` };
  return { ok: true, message: "Anthropic يعمل" };
}
