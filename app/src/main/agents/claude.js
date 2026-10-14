import os from "node:os";
import path from "node:path";
import { collect, killTree } from "../proc.js";
import { HOUSE_PROMPT } from "./house.js";
import { agentEnv, lastLine, readJsonLines, resolveTool, startTool } from "./launcher.js";
import { mediaToolsEnv } from "./mediaTools.js";

// The Claude Code bridge, and the reference for the agent bridge contract in docs/ARCHITECTURE.md.
// Claude Code runs headless (`-p`) in the project folder and reports what it does as one JSON object per line.

/** What the chat shows for this agent, and the PowerShell commands that fix a missing install or sign-in. */
export const about = {
  name: "Claude Code",
  // What the person reads in menus and messages (docs/UX.md, "The words"): the plain name, with the product's own
  // name beside it where they might need to recognise or install it. `name` stays for the assistants' own notes.
  label: "Claude",
  product: "Claude Code",
  install: ["irm https://claude.ai/install.ps1 | iex"],
  signIn: ["claude auth login"],
  // The newest version this bridge was run against. A newer install gets a note in the chat (docs/MAINTENANCE.md).
  tested: "2.1.280",
};

/** Aliases, not version names: each follows Anthropic's newest model of that family, so this list does not age. */
export const models = async () => [
  { id: "fable", name: "Fable" },
  { id: "opus", name: "Opus" },
  { id: "sonnet", name: "Sonnet" },
  { id: "haiku", name: "Haiku" },
];

// The commands a HyperFrames project needs: the CLI itself, and the project's own `check` and `render` scripts
// (the first real run asked for `npm run check` and was refused, which is why those two are here).
const PROJECT_COMMANDS = [
  "npx hyperframes",
  "npx --yes hyperframes",
  "hyperframes",
  "npm run check",
  "npm run render",
];

// The "Editing tools" level adds these two. On the agent's PATH they are the app's own check in front of the
// real programs (mediaTools.js), which keeps them to files inside the project.
const MEDIA_COMMANDS = ["ffmpeg", "ffprobe"];

/** Each command with and without arguments, in each shell named. */
const allow = (shells, commands) =>
  shells.flatMap((shell) => commands.flatMap((command) => [`${shell}(${command})`, `${shell}(${command}:*)`]));

const limited = (...commands) => [
  "--permission-mode",
  "acceptEdits",
  "--allowedTools",
  ...commands,
  "WebFetch",
  "WebSearch",
  "Skill",
];

// What the agent may do without asking. Headless Claude Code cannot stop to ask, so a step that is not allowed
// here is refused and the agent carries on without it.
const ACCESS = {
  // Edit the project's files and run the HyperFrames commands. Both shells are listed because Claude Code on
  // Windows uses either.
  project: limited(...allow(["Bash", "PowerShell"], PROJECT_COMMANDS)),
  // The same, plus FFmpeg, in Bash only. From PowerShell the check is reached through a .cmd file, and cmd.exe
  // reads the arguments a second time: "a&b.mp4" would run b.mp4 as a command. Tried here; it does. Bash hands
  // the arguments over exactly as typed.
  tools: limited(...allow(["Bash", "PowerShell"], PROJECT_COMMANDS), ...allow(["Bash"], MEDIA_COMMANDS)),
  // Anything, unasked: installs, any command, the internet.
  full: ["--permission-mode", "bypassPermissions"],
};

const LABELS = {
  Read: "Looking at your files",
  Grep: "Looking at your files",
  Glob: "Looking at your files",
  Edit: "Changing your files",
  Write: "Changing your files",
  MultiEdit: "Changing your files",
  NotebookEdit: "Changing your files",
  Bash: "Running a program",
  PowerShell: "Running a program",
  WebFetch: "Looking on the web",
  WebSearch: "Looking on the web",
  Task: "Working on one part",
  Agent: "Working on one part",
  TodoWrite: "Planning",
  Skill: "Using one of its skills",
};

// Anthropic's installer puts the .exe here and does not always add the folder to PATH.
const findClaude = () => resolveTool("claude", [path.join(os.homedir(), ".local", "bin", "claude.exe")]);

export async function status() {
  const tool = findClaude();
  if (!tool) return { state: "not-installed" };
  const run = (args) =>
    collect(startTool(tool, args, { env: agentEnv() }), { timeoutMs: 20_000, closeStdin: true });
  const version = await run(["--version"]);
  if (version.code !== 0) return { state: "broken", detail: lastLine(version.stderr || version.stdout) };
  const auth = await run(["auth", "status"]);
  let loggedIn = null;
  try {
    // Only the yes or no is read. The account's email and organisation stay in the main process.
    loggedIn = JSON.parse(auth.stdout).loggedIn === true;
  } catch {
    // An older Claude Code without `auth status`: assume signed in and let the first run say otherwise.
  }
  const number = version.stdout.trim().split(/\s+/)[0];
  return loggedIn === false ? { state: "not-signed-in", version: number } : { state: "ready", version: number };
}

function activityFor(block) {
  const input = block.input ?? {};
  const file = input.file_path ?? input.path ?? input.notebook_path;
  const detail = file
    ? path.basename(String(file))
    : (input.command ?? input.skill ?? input.description ?? input.pattern ?? input.query ?? "");
  return {
    type: "activity",
    label: LABELS[block.name] ?? "Working",
    detail: String(detail).split(/\r?\n/)[0].slice(0, 80),
  };
}

/**
 * Run one chat turn. `onEvent` gets `session`, then `text` and `activity` events, then exactly one `done`.
 * The message goes in on stdin: user text never touches a command line.
 */
export function run({ dir, text, sessionId, model, access = "project", onEvent }) {
  let finished = false;
  let stopped = false;
  const done = (payload) => {
    if (finished) return;
    finished = true;
    onEvent({ type: "done", ...payload });
  };

  const tool = findClaude();
  if (!tool) {
    queueMicrotask(() => done({ ok: false, error: "Claude is not on this computer yet." }));
    return { stop() {} };
  }

  const child = startTool(
    tool,
    [
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--include-partial-messages",
      "--append-system-prompt",
      HOUSE_PROMPT,
      ...(sessionId ? ["--resume", sessionId] : []),
      ...(model ? ["--model", model] : []),
      ...(ACCESS[access] ?? ACCESS.project),
    ],
    { cwd: dir, env: mediaToolsEnv(agentEnv(), { dir, access }) },
  );
  child.stdin.end(text);

  let wroteText = false;
  readJsonLines(child, (event) => {
    // A sub-agent's stream carries its parent's tool id. Only the main agent speaks in the chat.
    const main = event.parent_tool_use_id == null;
    if (event.type === "system" && event.subtype === "init") {
      onEvent({ type: "session", id: event.session_id });
    } else if (event.type === "stream_event" && main) {
      const part = event.event;
      if (part?.type === "content_block_start" && part.content_block?.type === "text" && wroteText) {
        onEvent({ type: "text", text: "\n\n" });
      } else if (part?.type === "content_block_delta" && part.delta?.type === "text_delta") {
        wroteText = true;
        onEvent({ type: "text", text: part.delta.text });
      }
    } else if (event.type === "assistant" && main) {
      for (const block of event.message?.content ?? []) {
        if (block.type === "tool_use") onEvent(activityFor(block));
      }
    } else if (event.type === "result") {
      if (event.subtype === "success" && !event.is_error) done({ ok: true });
      else done({ ok: false, error: String(event.result || "Claude could not finish this change.") });
    }
  });

  let errors = "";
  child.stderr.on("data", (chunk) => (errors = (errors + chunk).slice(-2000)));
  child.on("error", (error) => done({ ok: false, error: `Claude could not start: ${error.message}` }));
  child.on("close", (code) => {
    if (stopped) done({ ok: false, stopped: true });
    else done({ ok: false, error: lastLine(errors) || `Claude stopped unexpectedly (code ${code}).` });
  });

  return {
    stop({ sync = false } = {}) {
      stopped = true;
      killTree(child.pid, { sync });
    },
  };
}
