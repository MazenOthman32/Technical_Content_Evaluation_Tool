/**
 * Seeds Super Admin via Supabase Auth Admin API.
 * Passwords are hashed by Supabase (bcrypt). Never commit service role keys.
 *
 * Usage:
 *   node scripts/seed-super-admin.mjs
 *
 * Required env:
 *   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SUPER_ADMIN_EMAIL
 *   SUPER_ADMIN_PASSWORD
 * Optional:
 *   ANTHROPIC_API_KEY, GROQ_API_KEY, OPENAI_API_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i < 0) continue;
    const key = trimmed.slice(0, i).trim();
    const val = trimmed.slice(i + 1).trim();
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnvFile(resolve(process.cwd(), ".env"));
loadEnvFile(resolve(process.cwd(), "web/.env.local"));

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = (process.env.SUPER_ADMIN_EMAIL || "MazenOthman320@gmail.com").trim();
const password = process.env.SUPER_ADMIN_PASSWORD || "";

if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!password || password.length < 8) {
  console.error("Set SUPER_ADMIN_PASSWORD (min 8 chars) in .env");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: listed, error: listErr } = await admin.auth.admin.listUsers({ perPage: 200 });
if (listErr) {
  console.error(listErr.message);
  process.exit(1);
}

let user = listed.users.find((u) => (u.email || "").toLowerCase() === email.toLowerCase());

if (!user) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: "super_admin" },
    user_metadata: {
      username: "mazen",
      full_name: "Mazen Othman",
      role: "super_admin",
    },
  });
  if (error) {
    console.error("createUser:", error.message);
    process.exit(1);
  }
  user = data.user;
  console.log("Created Super Admin", user.id);
} else {
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    password,
    email_confirm: true,
    app_metadata: { ...(user.app_metadata || {}), role: "super_admin" },
    user_metadata: {
      ...(user.user_metadata || {}),
      username: "mazen",
      full_name: "Mazen Othman",
      role: "super_admin",
    },
  });
  if (error) {
    console.error("updateUser:", error.message);
    process.exit(1);
  }
  console.log("Updated Super Admin", user.id);
}

await admin.from("profiles").upsert({
  id: user.id,
  email,
  username: "mazen",
  full_name: "Mazen Othman",
  role: "super_admin",
  is_active: true,
  updated_at: new Date().toISOString(),
});

const settings = {
  user_id: user.id,
  anthropic_api_key: process.env.ANTHROPIC_API_KEY || "",
  groq_api_key: process.env.GROQ_API_KEY || "",
  openai_api_key: process.env.OPENAI_API_KEY || "",
  llm_provider: process.env.GROQ_API_KEY ? "groq" : process.env.ANTHROPIC_API_KEY ? "anthropic" : "openai",
  llm_model: process.env.GROQ_API_KEY
    ? "openai/gpt-oss-120b"
    : process.env.ANTHROPIC_API_KEY
      ? "claude-sonnet-5-5"
      : "gpt-4.1",
  whisper_model: "auto",
  updated_at: new Date().toISOString(),
};

const { error: settingsErr } = await admin.from("user_settings").upsert(settings);
if (settingsErr) {
  console.error("settings:", settingsErr.message);
  process.exit(1);
}

console.log("Super Admin ready:", email);
console.log(
  "API keys seeded:",
  [
    settings.anthropic_api_key ? "anthropic" : null,
    settings.groq_api_key ? "groq" : null,
    settings.openai_api_key ? "openai" : null,
  ]
    .filter(Boolean)
    .join(", ") || "(none found in env)"
);
