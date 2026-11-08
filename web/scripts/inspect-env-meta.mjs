import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function load(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    let k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}

for (const f of [".env.vercel.production", ".env.local", "../.env"]) {
  load(resolve(process.cwd(), f));
}

const keys = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

for (const k of keys) {
  const v = process.env[k] || "";
  if (!v) {
    console.log(k, "MISSING");
    continue;
  }
  console.log(
    k,
    "len=" + v.length,
    "prefix=" + v.slice(0, 8),
    "suffix=" + v.slice(-4),
    "dots=" + (v.match(/\./g) || []).length
  );
}
