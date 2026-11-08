// Cheap lint (tycho convention): `node --check` parses every .js/.mjs file
// under web/, scripts/, tools/ and tests/ WITHOUT executing it. Unlike tycho's
// version this walks subfolders, because web/ is split into sim/, render/, ui/.
import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const SKIP = new Set(["node_modules", ".git", "vendor"]);

/** Recursively collect .js/.mjs files, skipping dependency and VCS dirs. */
function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (name.endsWith(".js") || name.endsWith(".mjs")) out.push(path);
  }
  return out;
}

const targets = ["web", "scripts", "tools", "tests"].flatMap((d) => walk(join(root, d)));
if (targets.length === 0) {
  console.error("check-syntax: no .js/.mjs files found");
  process.exit(1);
}

let failed = false;
for (const file of targets) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  } catch (error) {
    failed = true;
    console.error(`SYNTAX ERROR: ${file}\n${error.stderr?.toString() || error.message}`);
  }
}
if (failed) process.exit(1);
console.log(`check-syntax: ${targets.length} files OK`);
