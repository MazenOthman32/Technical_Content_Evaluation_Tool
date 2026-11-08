/**
 * Creates normal Supabase Auth accounts (Super Admin + Admin + Reviewer).
 * Prefer: cd web && node scripts/seed-admins.mjs
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webScript = resolve(here, "..", "web", "scripts", "seed-admins.mjs");
const webDir = resolve(here, "..", "web");

const result = spawnSync(process.execPath, [webScript], {
  cwd: webDir,
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);
