// `npm run check`: a fast gate with no window. Every source file must parse. Run it before `npm run smoke`.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function sources(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    return /\.(js|mjs|cjs)$/.test(entry.name) ? [full] : [];
  });
}

const files = ["src", "scripts", "test"].flatMap((folder) => sources(path.join(appDir, folder)));
let failed = 0;
for (const file of files) {
  const run = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (run.status === 0) continue;
  failed++;
  console.error(`✗ ${path.relative(appDir, file)}\n${run.stderr.trim()}\n`);
}

if (failed) {
  console.error(`check: ${failed} of ${files.length} file(s) do not parse`);
  process.exitCode = 1;
} else {
  console.log(`check: ${files.length} files parse`);
}
