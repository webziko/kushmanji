import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { collect, killTree } from "../proc.js";
import { withHouseNote } from "./house.js";
import { agentEnv, lastLine, readJsonLines, resolveTool, startTool } from "./launcher.js";
import { codexLookArgs } from "./lookTool.js";
import { fromCodex } from "./usage.js";
import { mediaToolsEnv } from "./mediaTools.js";
import { say } from "../say.js";

// The Codex bridge (ChatGPT's coding agent). Same contract as claude.js; see docs/ARCHITECTURE.md.
// `codex exec --json` runs one turn and prints one JSON object per line. Replies arrive whole, not as deltas.

export const about = {
  name: "Codex",
  // What the person reads in menus and messages (docs/UX.md, "The words"); see claude.js.
  label: "ChatGPT",
  product: "Codex",
  install: ["npm install -g @openai/codex"],
  signIn: ["codex login"],
  // The newest version this bridge was run against. A newer install gets a note in the chat (docs/MAINTENANCE.md).
  tested: "0.164.0",
};

/**
 * The models this install offers, read from the list Codex itself keeps. Nothing is hard-coded, so a Codex update
 * that adds or retires a model shows up here by itself.
 */
export async function models() {
  return listedModels();
}

const codexHome = () => process.env.CODEX_HOME || path.join(os.homedir(), ".codex");

export function listedModels(home = codexHome()) {
  try {
    const cache = JSON.parse(fs.readFileSync(path.join(home, "models_cache.json"), "utf8"));
    return cache.models
      .filter((model) => model.visibility === "list" && typeof model.slug === "string")
      .map((model) => ({ id: model.slug, name: model.display_name || model.slug }));
  } catch {
    // No list yet (Codex has not run), or a format this version of the app does not know: offer the default only.
    return [];
  }
}

/** The model Codex's own settings name (`model = "..."` at the top of config.toml), or null. */
export function configuredModel(home = codexHome()) {
  try {
    const top = fs.readFileSync(path.join(home, "config.toml"), "utf8").split(/^\s*\[/m)[0];
    return /^\s*model\s*=\s*"([^"]+)"/m.exec(top)?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * The model to ask for when the person chose none. Codex's own settings can name one the account no longer offers:
 * seen 2026-10-18, "gpt-6-astra" after the owner's plan changed, and every request failed with "not supported when
 * using Codex with a ChatGPT account". Then the first model Codex lists for this account is used instead.
 */
export function fallbackModel(configured, offered) {
  if (!configured || offered.length === 0) return null;
  return offered.some((model) => model.id === configured) ? null : offered[0].id;
}

const forward = (file) => file.replaceAll("\\", "/");

// What Codex may do without asking. `codex exec` never stops to ask: outside these limits a step just fails.
const ACCESS = {
  // Codex's own sandbox: write inside the project, plus the folders the HyperFrames CLI itself writes to. The
  // first real run failed `npx hyperframes check` because npm could not write its cache from inside the sandbox.
  project() {
    const home = os.homedir();
    const roots = [
      path.join(process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local"), "npm-cache"),
      path.join(home, ".cache"),
      path.join(home, ".hyperframes"),
      path.join(home, ".local", "state", "hyperframes"),
    ];
    // Values are TOML. Forward slashes, so no backslash in a path needs escaping.
    return [
      "-c",
      'sandbox_mode="workspace-write"',
      "-c",
      "sandbox_workspace_write.network_access=true",
      "-c",
      `sandbox_workspace_write.writable_roots=${JSON.stringify(roots.map(forward))}`,
    ];
  },
  // The same sandbox. Codex limits where a command may write, not which command runs, so what separates this
  // level from "project" is the FFmpeg check on the PATH (mediaTools.js): it refuses there and checks here.
  tools: () => ACCESS.project(),
  // Anything, unasked: installs, any command, any folder.
  full: () => ["--dangerously-bypass-approvals-and-sandbox"],
};

const READS = /^(Get-Content|Get-ChildItem|Get-Item|Select-String|Test-Path|rg|cat|ls|dir|type|findstr)\b/i;

/** Codex wraps every command in a PowerShell call. Show the command the agent meant, not the wrapper. */
function innerCommand(command) {
  const inner = String(command).match(/-Command\s+"?([\s\S]*?)"?\s*$/)?.[1] ?? String(command);
  return inner.split(/\r?\n/)[0].slice(0, 80);
}

function activityFor(item) {
  if (item.type === "command_execution") {
    const command = innerCommand(item.command);
    const label = READS.test(command) ? say("Looking at your files") : say("Running a program");
    return { type: "activity", label, detail: command };
  }
  if (item.type === "file_change") {
    const first = item.changes?.[0]?.path;
    return { type: "activity", label: say("Changing your files"), detail: first ? path.basename(first) : "" };
  }
  if (item.type === "web_search") {
    return { type: "activity", label: say("Looking on the web"), detail: item.query ?? "" };
  }
  if (item.type === "todo_list") return { type: "activity", label: say("Planning"), detail: "" };
  if (item.type === "mcp_tool_call") {
    return { type: "activity", label: say("Using a tool"), detail: item.tool ?? "" };
  }
  return null;
}

/** Codex reports a failed request as JSON inside a string. Pull out the sentence, and say what fixes it. */
function explain(message) {
  let text = String(message ?? "").trim();
  try {
    text = JSON.parse(text).error?.message ?? text;
  } catch {
    // Already a plain sentence.
  }
  if (/model\b.*\b(not supported|not found|does not exist)/i.test(text)) {
    // The command and Codex's own words are values, so a translation can neither change the line to paste nor
    // lose the reason Codex gave.
    return say("ChatGPT's tool (Codex) is older than the version chosen in its settings. To update it, " +
      "open PowerShell, paste this line and press Enter: {command}\n{text}",
    { command: "npm install -g @openai/codex@latest", text });
  }
  return text || say("{name} could not finish this change.", { name: about.label });
}

// Codex's Windows sandbox failing to start, as it reports it on a command that never ran. Seen with 0.162.1:
// its setup step could not touch a file the Codex desktop app had open, and after that every command was
// refused while file edits still worked, so a turn "succeeded" having checked nothing (docs/MAINTENANCE.md).
const SANDBOX_DOWN = /Failed to create unified exec process|setup refresh had errors/i;
// What gets Codex working again without the person doing anything: its other built-in Windows sandbox (a
// restricted token, no setup step). Tried here with the Codex desktop app open: the default sandbox refused
// `cmd /c ver`, this one ran it. Like the default it is Codex's own sandbox, set by Codex's own switch.
const SANDBOX_FALLBACK = ["-c", 'windows.sandbox="unelevated"'];
/** True once the default sandbox has failed in this run of the app. Later turns then skip straight to the other. */
let plainSandbox = false;
const SANDBOX_HELP =
  say("ChatGPT could not run any program, because neither of its two safety boxes would start. If the " +
    "Codex app is open, close it and send your message again. Or pick another assistant in the menu above.");

const findCodex = () => resolveTool("codex");

export async function status() {
  const tool = findCodex();
  if (!tool) return { state: "not-installed" };
  const run = (args) =>
    collect(startTool(tool, args, { env: agentEnv() }), { timeoutMs: 20_000, closeStdin: true });
  const version = await run(["--version"]);
  if (version.code !== 0) return { state: "broken", detail: lastLine(version.stderr || version.stdout) };
  const number = version.stdout.trim().split(/\s+/).pop();
  const login = await run(["login", "status"]);
  // It prints "Logged in using ChatGPT" or "Not logged in", on stdout or stderr depending on the version.
  return /not logged in/i.test(login.stdout + login.stderr)
    ? { state: "not-signed-in", version: number }
    : { state: "ready", version: number };
}

export function run({ dir, text, sessionId, model, access = "project", onEvent }) {
  let finished = false;
  let stopped = false;
  const done = (payload) => {
    if (finished) return;
    finished = true;
    onEvent({ type: "done", ...payload });
  };

  const tool = findCodex();
  if (!tool) {
    queueMicrotask(() =>
      done({ ok: false, error: say("{name} is not on this computer yet.", { name: about.label }) }));
    return { stop() {} };
  }

  // Shared by both tries, so a second try's words follow the first's instead of starting over.
  let wroteText = false;
  let child = null;
  const asked = model ?? fallbackModel(configuredModel(), listedModels());

  /** One try at the turn. `plain` uses Codex's simpler Windows sandbox: see SANDBOX_FALLBACK. */
  const attempt = (plain) => {
    const options = [
      "--json",
      "--skip-git-repo-check",
      ...(asked ? ["-m", asked] : []),
      // The app's own "look at the video" (lookTool.js), started by Codex outside its sandbox.
      ...codexLookArgs(dir),
      ...(ACCESS[access] ?? ACCESS.project)(),
      ...(plain && access !== "full" ? SANDBOX_FALLBACK : []),
    ];
    // The trailing "-" tells Codex to read the message from stdin.
    const args = sessionId ? ["exec", "resume", sessionId, ...options, "-"] : ["exec", ...options, "-"];
    const mine = startTool(tool, args, { cwd: dir, env: mediaToolsEnv(agentEnv(), { dir, access }) });
    child = mine;
    mine.stdin.end(withHouseNote(text, !sessionId));

    const shown = new Set();
    let failure = "";
    let sandboxDown = false;
    // Set when this try is given up for a second one: whatever it still prints or however it ends is ignored.
    let abandoned = false;
    readJsonLines(mine, (event) => {
      if (abandoned) return;
      const item = event.item;
      if (event.type === "thread.started") {
        onEvent({ type: "session", id: event.thread_id });
      } else if ((event.type === "item.started" || event.type === "item.completed") && item) {
        if (item.type === "command_execution" && item.status === "failed" && SANDBOX_DOWN.test(item.aggregated_output ?? "")) {
          if (!plain && access !== "full") {
            // The first command is where this shows. Nothing useful can follow, so stop at once and start the
            // turn again with the sandbox that still works, and use that one until the app is closed.
            abandoned = true;
            plainSandbox = true;
            onEvent({ type: "activity", label: say("Starting again, another way"), detail: "" });
            killTree(mine.pid);
            return attempt(true);
          }
          sandboxDown = true;
        }
        if (item.type === "agent_message" && event.type === "item.completed" && item.text) {
          onEvent({ type: "text", text: wroteText ? `\n\n${item.text}` : item.text });
          wroteText = true;
        } else if (!shown.has(item.id)) {
          // A step is announced when it starts; some kinds only ever report completion.
          const activity = activityFor(item);
          if (activity) {
            shown.add(item.id);
            onEvent(activity);
          }
        }
      } else if (event.type === "error") {
        failure = event.message;
      } else if (event.type === "turn.failed") {
        done({ ok: false, error: explain(event.error?.message ?? failure) });
      } else if (event.type === "turn.completed") {
        // Codex calls the turn complete even when none of its commands could start. The person has to hear that.
        const usage = fromCodex(event);
        done(sandboxDown ? { ok: false, error: SANDBOX_HELP, usage } : { ok: true, usage });
      }
    });

    let errors = "";
    mine.stderr.on("data", (chunk) => (errors = (errors + chunk).slice(-2000)));
    mine.on("error", (error) => abandoned || done({ ok: false,
      error: say("{name} could not start: {message}", { name: about.label, message: error.message }) }));
    mine.on("close", (code) => {
      if (abandoned) return;
      if (stopped) return done({ ok: false, stopped: true });
      const reason = failure || lastLine(errors);
      done({ ok: false, error: reason ? explain(reason)
        : say("{name} stopped unexpectedly (code {code}).", { name: about.label, code }) });
    });
  };
  attempt(plainSandbox);

  return {
    stop({ sync = false } = {}) {
      stopped = true;
      killTree(child?.pid, { sync });
    },
  };
}
