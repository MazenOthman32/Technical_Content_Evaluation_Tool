export const MODELS: Record<string, { id: string; label: string }[]> = {
  groq: [
    { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B (Groq)" },
    { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
    { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant" },
  ],
  anthropic: [
    { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" },
    { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
  ],
  openai: [
    { id: "gpt-4.1", label: "GPT-4.1" },
    { id: "gpt-4o-mini", label: "GPT-4o Mini" },
  ],
};
