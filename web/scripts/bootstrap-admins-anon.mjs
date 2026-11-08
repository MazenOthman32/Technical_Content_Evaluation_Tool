/**
 * One-time bootstrap via anon signUp when service_role is unavailable.
 * Creates Auth users if missing; sets role via user_metadata (trigger copies to profiles).
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
    let key = trimmed.slice(0, i).trim();
    let val = trimmed.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnvFile(resolve(process.cwd(), "..", ".env"));
loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env.vercel.production"));

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.error("Missing SUPABASE URL / ANON KEY");
  process.exit(1);
}

const accounts = [
  {
    email: process.env.SUPER_ADMIN_EMAIL || "MazenOthman320@gmail.com",
    password: process.env.SUPER_ADMIN_PASSWORD || "282002mm",
    role: "super_admin",
    username: "mazen",
    full_name: "Mazen Othman",
  },
  {
    email: "admin@instantplus.com",
    password: "admin123",
    role: "admin",
    username: "admin",
    full_name: "Admin",
  },
  {
    email: "reviewer@instantplus.com",
    password: "reviewer123",
    role: "reviewer",
    username: "reviewer",
    full_name: "Content Reviewer",
  },
];

const supabase = createClient(url, anon, {
  auth: { autoRefreshToken: false, persistSession: false },
});

for (const account of accounts) {
  const email = account.email.trim();
  console.log("\n→", email);

  const login = await supabase.auth.signInWithPassword({
    email,
    password: account.password,
  });

  if (!login.error && login.data.user) {
    console.log("  OK already exists & password works");
    await supabase.auth.signOut();
    continue;
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password: account.password,
    options: {
      data: {
        username: account.username,
        full_name: account.full_name,
        role: account.role,
      },
    },
  });

  if (error) {
    console.error("  signUp failed:", error.message);
    console.error("  signIn was:", login.error?.message || "n/a");
    continue;
  }

  if (data.user && !data.session) {
    console.log("  CREATED but email confirmation may be required — confirm in Supabase Auth or disable confirmations");
  } else if (data.session) {
    console.log("  CREATED and signed in OK, role metadata:", account.role);
    // try set profile role if trigger missed (own row update may be blocked for role change)
    await supabase.from("profiles").upsert({
      id: data.user.id,
      email,
      username: account.username,
      full_name: account.full_name,
      role: account.role,
      is_active: true,
      updated_at: new Date().toISOString(),
    });
    if (account.role === "super_admin") {
      await supabase.from("user_settings").upsert({
        user_id: data.user.id,
        anthropic_api_key: process.env.ANTHROPIC_API_KEY || "",
        groq_api_key: process.env.GROQ_API_KEY || "",
        openai_api_key: process.env.OPENAI_API_KEY || "",
        updated_at: new Date().toISOString(),
      });
    }
    await supabase.auth.signOut();
  } else {
    console.log("  CREATED", data.user?.id);
  }
}

console.log("\nDone. Try login again on the site.");
