/**
 * Create normal Supabase Auth users (admins + reviewer) via Admin API.
 * Passwords are stored hashed by Supabase (bcrypt).
 *
 * From web/:
 *   node scripts/seed-admins.mjs
 *
 * Requires in ../.env or .env.local:
 *   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
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

loadEnvFile(resolve(process.cwd(), "..", ".env"));
loadEnvFile(resolve(process.cwd(), ".env.local"));

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  console.error("Add SUPABASE_SERVICE_ROLE_KEY from Supabase → Project Settings → API");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ACCOUNTS = [
  {
    email: (process.env.SUPER_ADMIN_EMAIL || "MazenOthman320@gmail.com").trim(),
    password: process.env.SUPER_ADMIN_PASSWORD || "282002mm",
    role: "super_admin",
    username: "mazen",
    full_name: "Mazen Othman",
    seedKeys: true,
  },
  {
    email: process.env.ADMIN_EMAIL || "admin@instantplus.com",
    password: process.env.ADMIN_PASSWORD || "admin123",
    role: "admin",
    username: "admin",
    full_name: "Admin",
    seedKeys: false,
  },
  {
    email: process.env.REVIEWER_EMAIL || "reviewer@instantplus.com",
    password: process.env.REVIEWER_PASSWORD || "reviewer123",
    role: "reviewer",
    username: "reviewer",
    full_name: "Content Reviewer",
    seedKeys: false,
  },
];

function defaultSettings(seedKeys) {
  const anthropic = seedKeys ? process.env.ANTHROPIC_API_KEY || "" : "";
  const groq = seedKeys ? process.env.GROQ_API_KEY || "" : "";
  const openai = seedKeys ? process.env.OPENAI_API_KEY || "" : "";
  return {
    anthropic_api_key: anthropic,
    groq_api_key: groq,
    openai_api_key: openai,
    llm_provider: groq ? "groq" : anthropic ? "anthropic" : openai ? "openai" : "groq",
    llm_model: groq
      ? "openai/gpt-oss-120b"
      : anthropic
        ? "claude-sonnet-5-5"
        : openai
          ? "gpt-4.1"
          : "openai/gpt-oss-120b",
    whisper_model: "auto",
    updated_at: new Date().toISOString(),
  };
}

const { data: listed, error: listErr } = await admin.auth.admin.listUsers({ perPage: 200 });
if (listErr) {
  console.error(listErr.message);
  process.exit(1);
}

for (const account of ACCOUNTS) {
  if (!account.password || account.password.length < 6) {
    console.error("Skip invalid password for", account.email);
    continue;
  }

  let user = listed.users.find(
    (u) => (u.email || "").toLowerCase() === account.email.toLowerCase()
  );

  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: account.email,
      password: account.password,
      email_confirm: true,
      app_metadata: { role: account.role },
      user_metadata: {
        username: account.username,
        full_name: account.full_name,
        role: account.role,
      },
    });
    if (error) {
      console.error("create", account.email, error.message);
      continue;
    }
    user = data.user;
    console.log("CREATED", account.role, account.email, user.id);
  } else {
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      password: account.password,
      email_confirm: true,
      app_metadata: { ...(user.app_metadata || {}), role: account.role },
      user_metadata: {
        ...(user.user_metadata || {}),
        username: account.username,
        full_name: account.full_name,
        role: account.role,
      },
    });
    if (error) {
      console.error("update", account.email, error.message);
      continue;
    }
    console.log("UPDATED", account.role, account.email, user.id);
  }

  const { error: profileErr } = await admin.from("profiles").upsert({
    id: user.id,
    email: account.email,
    username: account.username,
    full_name: account.full_name,
    role: account.role,
    is_active: true,
    updated_at: new Date().toISOString(),
  });
  if (profileErr) {
    console.error("profile", account.email, profileErr.message);
    continue;
  }

  const { error: settingsErr } = await admin.from("user_settings").upsert({
    user_id: user.id,
    ...defaultSettings(account.seedKeys),
  });
  if (settingsErr) {
    console.error("settings", account.email, settingsErr.message);
    continue;
  }
}

console.log("\nDone. Accounts are normal Supabase Auth users:");
for (const a of ACCOUNTS) {
  console.log(`- ${a.role}: ${a.email}`);
}
