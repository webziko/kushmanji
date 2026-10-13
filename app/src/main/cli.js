import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { collect } from "./proc.js";

// The open-source HyperFrames CLI, taken from this app's own node_modules so the app never depends on a global
// install or on `npx` reaching the network.
const require = createRequire(import.meta.url);
const pkgPath = require.resolve("hyperframes/package.json");
const pkg = require(pkgPath);

export const cliVersion = pkg.version;
export const cliEntry = path.join(path.dirname(pkgPath), pkg.bin.hyperframes);

/**
 * Start the CLI with Electron's own Node (ELECTRON_RUN_AS_NODE), so no separate Node install is needed.
 * The variable is inherited on purpose: the CLI re-runs `process.execPath` for its workers, and without it each
 * of those would open a second copy of this app instead of running a script.
 */
export function spawnCli(args, { cwd, env = {}, projectDir } = {}) {
  return spawn(process.execPath, [cliEntry, ...args], {
    cwd,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ...env,
      ELECTRON_RUN_AS_NODE: "1",
      // Tells the CLI it runs inside a desktop app, which silences its "get the desktop app" hints.
      ...(projectDir ? { HYPERFRAMES_DESKTOP_PROJECT: projectDir } : {}),
    },
  });
}

export const runCli = (args, options = {}) =>
  collect(spawnCli(args, options), { timeoutMs: options.timeoutMs ?? 0 });
