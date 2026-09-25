import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "apps", "web", "dist");
const target = join(root, "custom_components", "ha_lens", "frontend", "app");

if (!existsSync(join(source, "index.html"))) {
  throw new Error("Companion bundle source is missing. Run the web build first.");
}

const index = readFileSync(join(source, "index.html"), "utf8");
if (!index.includes("/ha_lens_static/app/")) {
  throw new Error(
    "Companion bundle has the wrong Vite base path. Set VITE_BASE_PATH=/ha_lens_static/app/ before building.",
  );
}

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });

console.log("Synced Home Assistant companion frontend to custom_components/ha_lens/frontend/app");
