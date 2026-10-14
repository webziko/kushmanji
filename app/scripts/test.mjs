// `npm test`: the unit tests, run on Electron's own Node, the one the app ships with, rather than whatever Node the
// person happens to have. They are not always the same: Node 24.11's fs.rmSync silently does nothing on Windows when
// the path holds a letter such as "é", which Electron 44's Node (24.21) no longer does. Testing on the shipped Node
// means a test fails only when the app would. Falls back to this Node when Electron is not installed.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function electronNode() {
  try {
    const file = createRequire(import.meta.url)("electron");
    return typeof file === "string" && fs.existsSync(file) ? file : null;
  } catch {
    return null;
  }
}

const runner = electronNode();
const run = spawnSync(runner ?? process.execPath, ["--test", "test/*.test.mjs", ...process.argv.slice(2)], {
  cwd: appDir,
  stdio: "inherit",
  windowsHide: true,
  env: runner ? { ...process.env, ELECTRON_RUN_AS_NODE: "1" } : process.env,
});
process.exitCode = run.status ?? 1;
