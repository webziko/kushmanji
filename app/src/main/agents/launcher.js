import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// How to start an agent's command-line tool on Windows without a shell.
//
// A native install is an .exe and starts directly. An npm install leaves only a .cmd shim, and Node refuses to
// spawn those without a shell, where quoting the arguments safely is not possible. Every npm shim is the same
// generated wrapper around one JavaScript file, so we read the file's path out of the shim and run it with Node.

const WHERE = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "where.exe");

/** Every file Windows would run for `name`, in PATH order. */
export function whereAll(name) {
  const found = spawnSync(WHERE, [name], { encoding: "utf8", windowsHide: true });
  if (found.status !== 0) return [];
  return found.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((file) => file && fs.existsSync(file));
}

/** The script an npm .cmd shim runs: the quoted `%dp0%\node_modules\...\x.js` on its last line. */
function shimScript(cmdFile) {
  try {
    const match = fs.readFileSync(cmdFile, "utf8").match(/"%dp0%\\([^"]+\.[cm]?js)"/);
    if (!match) return null;
    const script = path.join(path.dirname(cmdFile), match[1]);
    return fs.existsSync(script) ? script : null;
  } catch {
    return null;
  }
}

/**
 * Where a tool lives and how to start it: `{ file, args, env }`, or null when it is not installed.
 * `extra` lists full paths to try after PATH, for tools whose installer does not always update PATH.
 */
export function resolveTool(name, extra = []) {
  const candidates = [...whereAll(name), ...extra.filter((file) => fs.existsSync(file))];
  const exe = candidates.find((file) => /\.exe$/i.test(file));
  if (exe) return { file: exe, args: [], env: {} };

  for (const shim of candidates.filter((file) => /\.cmd$/i.test(file))) {
    const script = shimScript(shim);
    if (!script) continue;
    // An npm install means Node is installed. Without it on PATH, Electron's own Node runs the script.
    const node = whereAll("node").find((file) => /\.exe$/i.test(file));
    return node
      ? { file: node, args: [script], env: {} }
      : { file: process.execPath, args: [script], env: { ELECTRON_RUN_AS_NODE: "1" } };
  }
  return null;
}

/** Start a resolved tool. Arguments are an array and stdin is a pipe: user text never meets a command line. */
export function startTool(tool, args, { cwd, env }) {
  const child = spawn(tool.file, [...tool.args, ...args], {
    cwd,
    env: { ...env, ...tool.env },
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin.on("error", () => {});
  // Decode as a stream, or a character split across two chunks arrives as two broken halves.
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  return child;
}

/** Split a child's stdout into lines and hand each JSON object to `onEvent`. Other lines are ignored. */
export function readJsonLines(child, onEvent) {
  let pending = "";
  child.stdout.on("data", (chunk) => {
    pending += chunk;
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("{")) continue;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      onEvent(event);
    }
  });
}

// The variables an agent session sets for the programs it starts. `markers` say such a session is our parent;
// only then are the variables matching `vars` dropped, except the person's own settings listed in `keep`.
const PARENT_SESSIONS = [
  {
    markers: ["CLAUDECODE", "CLAUDE_CODE_SESSION_ID"],
    vars: /^CLAUDE(CODE$|_)/,
    keep: ["CLAUDE_CONFIG_DIR", "CLAUDE_CODE_GIT_BASH_PATH", "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX"],
  },
  { markers: ["CODEX_THREAD_ID"], vars: /^CODEX_(THREAD_ID$|SANDBOX)/, keep: [] },
];

/**
 * The environment an agent starts with.
 *
 * When this app is itself started from inside an agent session (either AI running `npm start` or the smoke test
 * there), it inherits that session's variables, and a nested agent would attach to the wrong session or inherit
 * its sandbox. Those are dropped. Started the normal way, from the Start Menu, there are none and the person's
 * own settings pass through untouched. ELECTRON_RUN_AS_NODE always goes: it is ours, and it would break any
 * Electron app the agent starts.
 */
export function agentEnv(env = process.env) {
  const active = PARENT_SESSIONS.filter(({ markers }) => markers.some((name) => name in env));
  const dropped = (key) => active.some(({ vars, keep }) => vars.test(key) && !keep.includes(key));
  return Object.fromEntries(
    Object.entries(env).filter(([key]) => key !== "ELECTRON_RUN_AS_NODE" && !dropped(key)),
  );
}

export const lastLine = (text) => String(text).trim().split(/\r?\n/).pop() ?? "";
