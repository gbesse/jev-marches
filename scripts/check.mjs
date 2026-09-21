// Purpose: Syntax-check every JavaScript module shipped by the repository.
import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
const roots = ["src", "bin", "scripts", "examples", "test"];
const files = [];
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p);
    else if (p.endsWith(".mjs")) files.push(p);
  }
}
for (const root of roots) await walk(root);
for (const file of files) {
  const r = spawnSync(process.execPath, ["--check", file], {
    stdio: "inherit",
  });
  if (r.status) process.exit(r.status);
}
console.log("Syntax checked " + files.length + " modules.");
