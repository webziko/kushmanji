// `npm run smoke`: starts the real app in its self-test mode (src/main/smoke.js) against a throwaway projects
// folder, then reports what happened. Screenshots and result.json land in app/.smoke/.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
// HFWIN_SMOKE_NAME=job keeps a run's files in app/.smoke-job, so a long real job and the ordinary self-test
// can run at the same time without wiping each other's folder. Letters, digits and dashes only: the folder is
// deleted at the start of every run.
const named = /^[a-z0-9-]{1,40}$/i.test(process.env.HFWIN_SMOKE_NAME ?? "") ? `-${process.env.HFWIN_SMOKE_NAME}` : "";
const outDir = path.join(appDir, `.smoke${named}`);
const electron = createRequire(import.meta.url)("electron");

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

// `--agent` also sends one real chat request, to Claude Code or to the agent named: `--agent=codex`. It spends
// that agent's usage, so it is opt-in (`npm run smoke:agent`, `npm run smoke:codex`).
const agentFlag = process.argv.find((arg) => arg === "--agent" || arg.startsWith("--agent="));
const withAgent = agentFlag ? (agentFlag.split("=")[1] ?? "claude") : null;

// `--study` adds footage with real speech in it, made with HyperFrames' own voice on this computer, and checks
// the words the footage study wrote down (`npm run smoke:study`). Free, but slower, and it needs the voice model.
const withSpeech = process.argv.includes("--study");

// A parent shell that set ELECTRON_RUN_AS_NODE would make Electron run as plain Node and never open a window.
const { ELECTRON_RUN_AS_NODE: _ignored, ...env } = process.env;
const run = spawnSync(electron, [appDir], {
  stdio: "inherit",
  env: {
    ...env,
    HFWIN_SMOKE: outDir,
    HFWIN_PROJECTS_ROOT: path.join(outDir, "projects"),
    ...(withAgent ? { HFWIN_SMOKE_AGENT: withAgent } : {}),
    ...(withSpeech ? { HFWIN_SMOKE_STUDY: "speech" } : {}),
  },
  // Up to two real agent turns, and some agents take minutes over one. Speech has to be made, then transcribed.
  timeout:
    (Number(process.env.HFWIN_SMOKE_TURN_MINUTES) || 0) * 60_000 + (withAgent ? 1_500_000 : withSpeech ? 900_000 : 300_000),
});

let result = null;
try {
  result = JSON.parse(fs.readFileSync(path.join(outDir, "result.json"), "utf8"));
} catch {
  // The app died before writing it; the exit code below says so.
}

if (result?.ok) {
  console.log(`smoke: PASS (steps: ${result.steps.join(", ")}; Studio at ${result.studioUrl})`);
  if (result.consoleErrors.length) console.log(`smoke: ${result.consoleErrors.length} console error(s), see result.json`);
  if (result.fullscreenNotChecked) console.log(`smoke: full screen was NOT checked. ${result.fullscreenNotChecked}`);
} else {
  console.error(`smoke: FAIL (exit ${run.status}${run.error ? `, ${run.error.message}` : ""})`);
  if (result?.error) console.error(result.error);
  process.exitCode = 1;
}
console.log(`smoke: output in ${outDir}`);
