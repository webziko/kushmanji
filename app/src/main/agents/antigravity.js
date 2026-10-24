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
  tested: "1.4.7",
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

// One agy kept running per video (2026-10-24). Every agy start costs about 12 s before it reads a message, and
// starting one per message made "reply with one word" take 42 s through this bridge (docs/FINDINGS.md). With
// `--input-format stream-json` one agy keeps its conversation open and runs a turn for each line it reads on stdin:
// {"event":"user","message":{"role":"user","content":"..."}} (the shape is agy's own; it is not documented). A
// running agy is used again only for the same folder, model and access, and only for the conversation it holds,
// or before its first turn for a new one. Anything else closes it and starts its own. `prewarm` starts one when a
// video opens, so even the first message does not wait.
const IDLE_MS = 15 * 60_000;
/** Folder (lower case) → the agy running there. */
const sessions = new Map();

const folderKey = (dir) => path.resolve(dir).toLowerCase();

function openSession({ dir, model, access, sessionId }) {
  const tool = findAgy();
  if (!tool) return null;
  const child = startTool(
    tool,
    [
      // An empty print prompt: the messages come on stdin. agy refuses `-p` without a value of its own.
      "-p=",
      "--input-format",
      "stream-json",
      "--output-format",
      "stream-json",
      ...(sessionId ? ["--conversation", sessionId] : []),
      ...(model ? ["--model", model] : []),
      ...(ACCESS[access] ?? ACCESS.project),
    ],
    { cwd: dir, env: mediaToolsEnv(agentEnv(), { dir, access }) },
  );
  const session = {
    key: folderKey(dir), model: model ?? null, access, conversation: sessionId ?? null, used: Boolean(sessionId),
    child, turn: null, errors: "", closed: false, idle: null,
  };
  // A message written after agy died must not throw here; its close reports it.
  child.stdin.on("error", () => {});
  readJsonLines(child, (event) => {
    const payload = event[event.event] ?? event;
    const conversation = event.conversation_id ?? payload.conversation_id;
    if (conversation) session.conversation = conversation;
    session.turn?.line(event, payload);
  });
  child.stderr.on("data", (chunk) => (session.errors = (session.errors + chunk).slice(-4000)));
  child.on("error", (error) => ended(session, { error }));
  child.on("close", (code) => ended(session, { code }));
  return session;
}

function ended(session, why) {
  if (session.ended) return;
  session.ended = true;
  session.closed = true;
  clearTimeout(session.idle);
  if (sessions.get(session.key) === session) sessions.delete(session.key);
  session.turn?.ended(why);
}

function close(session, { sync = false } = {}) {
  session.closed = true;
  clearTimeout(session.idle);
  if (sessions.get(session.key) === session) sessions.delete(session.key);
  killTree(session.child.pid, { sync });
}

/** An agy nobody has written to for a while is closed: it holds memory and its helper programs. */
function waitIdle(session) {
  clearTimeout(session.idle);
  session.idle = setTimeout(() => close(session), IDLE_MS);
  session.idle.unref?.();
}

function sessionFor({ dir, model, access, sessionId }) {
  const kept = sessions.get(folderKey(dir));
  const fits = kept && !kept.closed && !kept.turn && kept.model === (model ?? null) && kept.access === access &&
    (sessionId ? kept.conversation === sessionId : !kept.used);
  if (fits) return kept;
  if (kept) close(kept);
  const made = openSession({ dir, model, access, sessionId });
  if (made) sessions.set(made.key, made);
  return made;
}

/** Start agy for this video's next message before it is sent. Nothing happens if one is already running there. */
export function prewarm({ dir, model = null, access = "project", sessionId = null }) {
  const kept = sessions.get(folderKey(dir));
  if (kept && !kept.closed) return;
  const made = openSession({ dir, model, access, sessionId });
  if (!made) return;
  sessions.set(made.key, made);
  waitIdle(made);
}

/** The video's conversation was forgotten ("Start over"): its agy goes too. */
export function forget(dir) {
  const kept = sessions.get(folderKey(dir));
  if (kept) close(kept);
}

/** Close every agy this app started: the video closed or the app quits. */
export function closeAll({ sync = false } = {}) {
  for (const session of [...sessions.values()]) close(session, { sync });
}

export function run({ dir, text, sessionId, model, access = "project", onEvent }) {
  let finished = false;
  let stopped = false;
  const done = (payload) => {
    if (finished) return;
    finished = true;
    onEvent({ type: "done", ...payload });
  };

  const prompt = withHouseNote(text, !sessionId);
  // Kept from when the message went on agy's command line (about 32,000 characters on Windows): a request this
  // long is a mistake, not something to send.
  const session = prompt.length > MAX_PROMPT ? null : sessionFor({ dir, model, access, sessionId });
  if (!session) {
    const error = findAgy()
      ? say("That message is too long for Gemini. Shorten it and send again.")
      : say("{name} is not on this computer yet.", { name: about.label });
    queueMicrotask(() => done({ ok: false, error }));
    return { stop() {} };
  }
  session.used = true;
  clearTimeout(session.idle);

  const shown = new Set();
  let sentSession = false;
  let streamed = "";
  let textStep = null;
  // A prewarmed agy already knows its conversation, from its first line.
  const tellSession = () => {
    if (sentSession || !session.conversation) return;
    sentSession = true;
    onEvent({ type: "session", id: session.conversation });
  };
  session.turn = {
    line(event, payload) {
      tellSession();
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
        session.turn = null;
        waitIdle(session);
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
    },
    ended({ error, code }) {
      if (stopped) return done({ ok: false, stopped: true });
      if (error) {
        return done({ ok: false,
          error: say("{name} could not start: {message}", { name: about.label, message: error.message }) });
      }
      // agy writes its routine log to stderr ("logging before google.Init"); those lines are not the reason.
      const reason = lastLine(session.errors.split(/\r?\n/)
        .filter((line) => !/logging before google\.Init/.test(line)).join("\n"));
      done({ ok: false,
        error: reason || say("{name} stopped unexpectedly (code {code}).", { name: about.label, code }) });
    },
  };
  queueMicrotask(tellSession);
  session.child.stdin.write(`${JSON.stringify({ event: "user", message: { role: "user", content: prompt } })}\n`);

  return {
    stop({ sync = false } = {}) {
      stopped = true;
      close(session, { sync });
    },
  };
}
