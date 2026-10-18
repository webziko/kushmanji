// The problem report (M9-07): a small file the owner can send to whoever helps them when something goes wrong.
//
// It is written for a stranger to read, and so it holds nothing private: what happened (a kind, a code, a count, a
// short error sentence), never what the person made or said. Callers must never pass chat messages, transcript
// words or file contents. On top of that, `redact` scrubs every string that does get through, as a second lock:
// the home folder (it holds the person's Windows name), email addresses, long tokens, and the value after
// Authorization, Bearer, api_key, token= and the like.
//
// Writing a log must never be the thing that breaks the app, so nothing here throws.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** `kushmanji-2026-10-18.log`: the only names this module writes, and the only names it ever deletes. */
const NAME = /^kushmanji-\d{4}-\d{2}-\d{2}\.log$/;
const MAX_TEXT = 500;
// The patterns below are cheap on short text but can be slow on megabytes of it (the email pattern backtracks), and
// everything past MAX_TEXT is thrown away anyway, so a long string is cut here first, with room to spare.
const MAX_WORK = 4000;
const MAX_DEPTH = 4;
// One log line is for reading; no caller has a good reason to put hundreds of things in it.
const MAX_ITEMS = 50;

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A pattern for the home folder in any spelling it can turn up in: either slash, any number of them in a row (a
 * path inside JSON text has doubled backslashes), any letter case, and the way a file: address writes it. Null when
 * the "home" is too little to mean anything (a bare drive or "/"), where replacing it would only make a mess.
 */
function homePattern(home) {
  const text = String(home ?? "").trim();
  const parts = text.split(/[\\/]+/).filter(Boolean);
  if (!parts.some((part) => !/^[A-Za-z]:$/.test(part))) return null;
  const slashes = "[\\\\/]+";
  const lead = /^[\\/]/.test(text) ? slashes : "";
  const spell = (segments) => lead + segments.map(escapeRegex).join(slashes);
  const spellings = new Set([spell(parts), spell(parts.map((part) => encodeURI(part)))]);
  // Not when the name goes on ("C:\Users\kish" is not the start of "C:\Users\kishore"): that is another folder.
  return new RegExp(`(?:${[...spellings].join("|")})(?![\\p{L}\\p{N}_])`, "giu");
}

// Each pattern keeps the words around a secret ("token=") so the line still tells a helper what kind of thing it was.
const SECRET_PATTERNS = [
  // "Authorization: Bearer abc", "Authorization=Basic abc", `"authorization": "abc"`
  [/(\bauthorization["']?\s*[:=]\s*["']?)(?:(?:Bearer|Basic|Token)\s+)?[^\s"',;]+/giu, "$1[hidden]"],
  // The bare form that turns up in error text: "Bearer abc123"
  [/(\bBearer\s+)[^\s"',;]+/giu, "$1[hidden]"],
  // api_key=..., api-key: ..., access_token=..., token=..., client_secret=..., password=...
  [/([\w-]*(?:api[_-]?key|token|secret|passw(?:or)?d)["']?\s*[:=]\s*["']?)[^\s"',;&]+/giu, "$1[hidden]"],
  [/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu, "[email]"],
  // Anything that looks like a key or token: a long run of letters, digits, "_" and "-".
  [/[A-Za-z0-9_-]{32,}/g, "[hidden]"],
];

function scrubText(text, home) {
  let clean = text.length > MAX_WORK ? text.slice(0, MAX_WORK) : text;
  if (home) clean = clean.replace(home, "~");
  for (const [pattern, replacement] of SECRET_PATTERNS) clean = clean.replace(pattern, replacement);
  return clean.length > MAX_TEXT ? `${clean.slice(0, MAX_TEXT)}…` : clean;
}

function scrub(value, home, depth) {
  if (typeof value === "string") return scrubText(value, home);
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "bigint") return String(value);
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (value instanceof Error) return scrub({ name: value.name, message: value.message }, home, depth);
  if (typeof value !== "object") return undefined; // A function or a symbol means nothing in a log.
  if (depth >= MAX_DEPTH) return "[too deep]";
  if (Array.isArray(value)) return value.slice(0, MAX_ITEMS).map((item) => scrub(item, home, depth + 1) ?? null);
  const clean = {};
  for (const key of Object.keys(value).slice(0, MAX_ITEMS)) {
    // A key is a name the caller chose, but it is text like any other if a caller builds one from user data.
    const inside = scrub(value[key], home, depth + 1);
    if (inside !== undefined) clean[scrubText(key, home)] = inside;
  }
  return clean;
}

/**
 * `value` with every string in it scrubbed: the home folder becomes "~", emails, long tokens and the value after
 * Authorization / Bearer / api_key / token= are removed, and each string is cut to 500 characters. Works through
 * arrays and objects, four levels deep at most (anything deeper becomes "[too deep]"), and never changes `value`.
 * `home` is the folder to hide, the computer's own by default; tests pass one so they do not depend on the machine.
 */
export function redact(value, { home = os.homedir() } = {}) {
  let pattern = null;
  try {
    pattern = homePattern(home);
  } catch { /* a home folder that cannot be matched leaves the other rules in force */ }
  return scrub(value, pattern, 0);
}

/** What a caller handed to `write`, as an object without `at` or `kind`: those two are always ours. */
function detailsOf(details) {
  if (details === undefined || details === null) return {};
  if (typeof details !== "object" || Array.isArray(details)) return { value: details };
  const { at: _at, kind: _kind, ...rest } = details;
  return rest;
}

/**
 * What an error looks like in the report: what it is, its message, and the first five places in the code it passed
 * through. Hand the result to `write`, which scrubs it. Never throws: an error that cannot be read is still reported.
 */
export function errorDetails(error) {
  try {
    if (!(error instanceof Error)) return { message: String(error ?? "") };
    const stack = typeof error.stack === "string"
      ? error.stack.split("\n").filter((line) => /^\s*at\s/.test(line)).slice(0, 5).map((line) => line.trim())
      : [];
    return {
      name: error.name,
      ...(typeof error.code === "string" ? { code: error.code } : {}),
      message: error.message,
      stack,
    };
  } catch {
    return { message: "An error that could not be read." };
  }
}

/** Local date as 2026-10-18: the day the person lived, which is the day a helper will ask about. */
function dayOf(date) {
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The log files in `folder`, oldest first: only files with this module's own names, never a folder or other files. */
function logFilesIn(folder) {
  try {
    return fs.readdirSync(folder, { withFileTypes: true })
      .filter((entry) => entry.isFile() && NAME.test(entry.name))
      .map((entry) => entry.name)
      .sort(); // The date is in the name, so this is oldest first.
  } catch {
    return [];
  }
}

/**
 * One file per day in `folder`, named `kushmanji-YYYY-MM-DD.log`, one JSON object per line: `{ at, kind, ...details }`.
 * A day's file stops growing at `maxBytes` (it says so on one last line), and only the newest `keep` files stay.
 * `write(kind, details)` redacts every string in `details` and never throws: a full disk or a file another program
 * holds only loses that line. `file()` is the newest log file there is, or null; `folder` is where they live.
 */
export function createLog({ folder, now = () => new Date(), maxBytes = 2_000_000, keep = 7 } = {}) {
  /** The file being written: its name, the bytes in it, whether it is closed off, and whether old files were swept. */
  let today = null;

  function open(name) {
    let bytes = 0;
    try {
      bytes = fs.statSync(path.join(folder, name)).size;
    } catch { /* not there yet */ }
    today = { name, bytes, full: bytes >= maxBytes, pruned: false };
  }

  function append(name, line) {
    const file = path.join(folder, name);
    try {
      fs.appendFileSync(file, line);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      fs.mkdirSync(folder, { recursive: true }); // Cleared by hand, or never made.
      fs.appendFileSync(file, line);
    }
  }

  /** Delete the oldest files beyond `keep`. Run once for each new day's file, so it costs next to nothing. */
  function prune() {
    for (const name of logFilesIn(folder).slice(0, -Math.max(1, keep))) {
      try {
        fs.rmSync(path.join(folder, name), { force: true });
      } catch { /* in use for the moment: it is looked at again tomorrow */ }
    }
  }

  function write(kind, details) {
    try {
      const date = now();
      const name = `kushmanji-${dayOf(date)}.log`;
      if (today?.name !== name) open(name);
      if (today.full) return;
      const entry = {
        at: date.toISOString(),
        kind: scrubText(String(kind ?? ""), null).slice(0, 60),
        ...redact(detailsOf(details)),
      };
      let line = `${JSON.stringify(entry)}\n`;
      if (today.bytes + Buffer.byteLength(line) > maxBytes) {
        // One last line, so a helper reading the file knows it is not the whole story.
        const full = { at: entry.at, kind: "log-full", note: "This day's log reached its size limit." };
        line = `${JSON.stringify(full)}\n`;
        today.full = true;
      }
      append(name, line);
      today.bytes += Buffer.byteLength(line);
      // After the first line that really landed, so a day whose first try failed is cleaned up on its second.
      if (!today.pruned) {
        today.pruned = true;
        prune();
      }
    } catch {
      // The disk is full, the folder is locked, or the line could not be made: this line is lost, nothing else.
    }
  }

  function file() {
    const names = logFilesIn(folder);
    return names.length ? path.join(folder, names[names.length - 1]) : null;
  }

  return { write, file, folder };
}
