import os from "node:os";
import path from "node:path";
import { collect, killTree } from "../proc.js";
import { withHouseNote } from "./house.js";
import { agentEnv, lastLine, readJsonLines, resolveTool, startTool } from "./launcher.js";
import { mediaToolsEnv } from "./mediaTools.js";
import { say } from "../say.js";

// The Antigravity bridge: Google's `agy` command-line agent, the way to use Gemini models. It replaced the
// Gemini CLI, which Google switched off for personal accounts ("This client is no longer supported ... please
// migrate to the Antigravity suite"). Same contract as claude.js; see docs/ARCHITECTURE.md.
//
// `agy -p <text> --output-format stream-json` prints one JSON object per line. Each carries its kind in `event`
// and its payload under a key of the same name: {"event":"step_update","step_update":{...}}. Google's reference
// page shows the payload flat; the real tool (1.3.3) nests it, so both are read.

export const about = {
  name: "Antigravity (Gemini)",
  // What the person reads in menus and messages (docs/UX.md, "The words"); see claude.js.
  label: "Gemini",
  product: "Antigravity",
  install: ["irm https://antigravity.google/cli/install.ps1 | iex"],
  // The first interactive run walks through Google sign-in in the browser. It shares the Antigravity IDE's sign-in.
  signIn: ["agy"],
  // The newest version this bridge was run against. A newer install gets a note in the chat (docs/MAINTENANCE.md).
  tested: "1.3.3",
};

// The command line holds about 32,000 characters on Windows; leave room for everything else on it.
const MAX_PROMPT = 20_000;
const MODELS_TTL_MS = 10 * 60_000;

// Headless `agy` refuses every write and command unless told otherwise, so both modes approve tool requests.
// "project" adds agy's terminal sandbox.
const ACCESS = {
  project: ["--dangerously-skip-permissions", "--sandbox"],
  // The same switches. agy has no list of allowed commands when run headless, so what separates this level
  // from "project" is the FFmpeg check on the PATH (mediaTools.js): it refuses there and checks here.
  tools: ["--dangerously-skip-permissions", "--sandbox"],
  full: ["--dangerously-skip-permissions"],
};

// The official installer's folder, which is not on PATH until the next sign-in to Windows.
const findAgy = () =>
  resolveTool("agy", [
    path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"), "agy", "bin", "agy.exe"),
  ]);

const quiet = (tool, args, timeoutMs) =>
  collect(startTool(tool, args, { env: agentEnv() }), { timeoutMs, closeStdin: true });

export async function status() {
  const tool = findAgy();
  if (!tool) return { state: "not-installed" };
  const version = await quiet(tool, ["--version"], 20_000);
  if (version.code !== 0) return { state: "broken", detail: lastLine(version.stderr || version.stdout) };
  // No command reports sign-in. A signed-out run ends with "authentication required", which `run` turns into a
  // plain message.
  return { state: "ready", version: version.stdout.trim().split(/\s+/).pop() };
}

let modelsCache = { at: 0, list: [] };

/** `agy models` prints "id<TAB>Name" per line. It asks Google each time, so the answer is kept for ten minutes. */
export async function models() {
  if (Date.now() - modelsCache.at < MODELS_TTL_MS) return modelsCache.list;
  const tool = findAgy();
  if (!tool) return [];
  const listed = await quiet(tool, ["models"], 30_000);
  const list = listed.stdout.split(/\r?\n/).flatMap((line) => {
    const [id, name] = line.split("\t").map((part) => part.trim());
    return id && name && /^[\w.:-]+$/.test(id) ? [{ id, name }] : [];
  });
  if (list.length > 0) modelsCache = { at: Date.now(), list };
  return list;
}

/** Tool names are agy's own and change between versions, so the label is read off the name itself. */
function labelFor(toolName = "") {
  if (/read|view|list|search|grep|find|glob/i.test(toolName)) return say("Looking at your files");
  if (/write|edit|replace|create|patch|delete/i.test(toolName)) return say("Changing your files");
  if (/command|terminal|shell|exec|run/i.test(toolName)) return say("Running a program");
  if (/browser|web|url|fetch/i.test(toolName)) return say("Looking on the web");
  return say("Working");
}

/** The file or command a step is about, as seen in agy 1.3.3: AbsolutePath, TargetFile, CommandLine. */
function detailFor(toolInfo) {
  const given = toolInfo?.parameters ?? {};
  const file = given.AbsolutePath ?? given.TargetFile ?? given.Path ?? given.DirectoryPath;
  if (file) return path.basename(String(file));
  return String(given.CommandLine ?? given.Query ?? given.Url ?? "").split(/\r?\n/)[0].slice(0, 80);
}

export function run({ dir, text, sessionId, model, access = "project", onEvent }) {
  let finished = false;
  let stopped = false;
  const done = (payload) => {
    if (finished) return;
    finished = true;
    onEvent({ type: "done", ...payload });
  };

  const tool = findAgy();
  const prompt = withHouseNote(text, !sessionId);
  if (!tool || prompt.length > MAX_PROMPT) {
    const error = tool
      ? say("That message is too long for Gemini. Shorten it and send again.")
      : say("{name} is not on this computer yet.", { name: about.label });
    queueMicrotask(() => done({ ok: false, error }));
    return { stop() {} };
  }

  // The message is an argument here, not stdin: agy reads stdin only in its streaming input format. That is safe
  // because `startTool` never uses a shell, so nothing can be quoted wrongly.
  const child = startTool(
    tool,
    [
      "-p",
      prompt,
      "--output-format",
      "stream-json",
      ...(sessionId ? ["--conversation", sessionId] : []),
      ...(model ? ["--model", model] : []),
      ...(ACCESS[access] ?? ACCESS.project),
    ],
    { cwd: dir, env: mediaToolsEnv(agentEnv(), { dir, access }) },
  );
  child.stdin.end();

  const shown = new Set();
  let sentSession = false;
  let streamed = "";
  let textStep = null;
  readJsonLines(child, (event) => {
    const payload = event[event.event] ?? event;
    const conversation = event.conversation_id ?? payload.conversation_id;
    if (conversation && !sentSession) {
      sentSession = true;
      onEvent({ type: "session", id: conversation });
    }
    if (event.event === "step_update") {
      if (payload.step_type === "agent_response" && payload.text_delta) {
        // Each step is its own message; a blank line keeps two of them from running together.
        const gap = streamed.trim() && textStep !== payload.step_index ? "\n\n" : "";
        textStep = payload.step_index;
        streamed += gap + payload.text_delta;
        onEvent({ type: "text", text: gap + payload.text_delta });
      } else if (payload.step_type === "tool" && !shown.has(payload.step_index)) {
        shown.add(payload.step_index);
        onEvent({ type: "activity", label: labelFor(payload.tool_name), detail: detailFor(payload.tool_info) });
      }
    } else if (event.event === "result") {
      // A reply can arrive only here, whole, when nothing was streamed.
      if (!streamed.trim() && payload.response) onEvent({ type: "text", text: String(payload.response).trim() });
      if (payload.status === "SUCCESS") return done({ ok: true });
      const error = typeof payload.error === "string" ? payload.error : (payload.error?.message ?? "");
      done({
        ok: false,
        error: /authentication required/i.test(error)
          ? say("Gemini is not signed in. Open PowerShell, type agy, press Enter and sign in with Google.")
          : error || say("{name} could not finish this change.", { name: about.label }),
      });
    }
  });

  let errors = "";
  child.stderr.on("data", (chunk) => (errors = (errors + chunk).slice(-4000)));
  child.on("error", (error) => done({ ok: false,
    error: say("{name} could not start: {message}", { name: about.label, message: error.message }) }));
  child.on("close", (code) => {
    if (stopped) return done({ ok: false, stopped: true });
    // agy writes its routine log to stderr ("logging before google.Init"); those lines are not the reason.
    const reason = lastLine(errors.split(/\r?\n/).filter((line) => !/logging before google\.Init/.test(line)).join("\n"));
    done({ ok: false,
      error: reason || say("{name} stopped unexpectedly (code {code}).", { name: about.label, code }) });
  });

  return {
    stop({ sync = false } = {}) {
      stopped = true;
      killTree(child.pid, { sync });
    },
  };
}
