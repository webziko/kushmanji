import fs from "node:fs";
import path from "node:path";

// The project's shared memory: one line per chat turn, whoever the agent was. It is what lets one agent pick up
// where another left off.
//
// The file and its fields are upstream's own (`packages/cli/src/utils/appHistory.ts`): the official desktop app
// writes `.hyperframes/app-history.jsonl` and `hyperframes catch-up` reads it. Keeping to that format means a
// project made here stays readable by the CLI, and by the official Windows app when it ships.

const FILE = path.join(".hyperframes", "app-history.jsonl");
const MAX_FIELD = 2000; // upstream drops what is longer
const MAX_WALKED = 5000;
const SKIPPED = new Set(["node_modules", "renders", "snapshots"]);
// How much of the past an agent is handed. Enough to act on, small enough not to drown the request.
const MAX_TURNS = 8;
const MAX_QUOTE = 500;

/** Project files changed after `since`. Hidden folders and outputs are not the video. */
export function filesChangedSince(dir, since) {
  const changed = [];
  let walked = 0;
  const walk = (folder) => {
    let entries = [];
    try {
      entries = fs.readdirSync(folder, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (walked++ > MAX_WALKED) return;
      if (entry.name.startsWith(".") || SKIPPED.has(entry.name)) continue;
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && modified(full) > since) changed.push(path.relative(dir, full).split(path.sep).join("/"));
    }
  };
  walk(dir);
  return changed.sort();
}

// A file deleted while the folder is read, or one Windows will not describe while a delete is pending, has not
// changed in any way the next assistant can use.
function modified(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

/** Add one turn. A journal that cannot be written must never fail the chat, so errors end here. */
export function recordTurn(dir, { engine, asked, did, startedAt }) {
  try {
    const line = JSON.stringify({
      at: new Date().toISOString(),
      engine,
      asked: asked.slice(0, MAX_FIELD),
      did: did.slice(0, MAX_FIELD),
      files: filesChangedSince(dir, startedAt).slice(0, 200),
    });
    fs.mkdirSync(path.join(dir, ".hyperframes"), { recursive: true });
    fs.appendFileSync(path.join(dir, FILE), `${line}\n`);
  } catch {
    // Read-only folder, full disk: the change itself still happened and the chat still shows it.
  }
}

export function readTurns(dir) {
  let text = "";
  try {
    text = fs.readFileSync(path.join(dir, FILE), "utf8");
  } catch {
    return [];
  }
  return text.split("\n").flatMap((line) => {
    try {
      const turn = JSON.parse(line);
      return turn && typeof turn.asked === "string" ? [turn] : [];
    } catch {
      return [];
    }
  });
}

const quote = (text) => {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  return flat.length > MAX_QUOTE ? `${flat.slice(0, MAX_QUOTE)}…` : flat;
};

/**
 * What `engine` missed: the turns other agents handled since its own last turn, or everything when it is new to
 * the project. Empty when it was the last to work, since its own conversation already holds that.
 * `names` maps an agent id to the name to call it.
 */
export function handoverNote(dir, engine, names) {
  const turns = readTurns(dir);
  const lastOwn = turns.findLastIndex((turn) => turn.engine === engine);
  const missed = turns.slice(lastOwn + 1).filter((turn) => turn.engine !== engine);
  if (missed.length === 0) return "";

  const shown = missed.slice(-MAX_TURNS);
  const lines = shown.map((turn) => {
    const who = names[turn.engine] ?? "Another agent";
    const files = turn.files?.length ? ` Files changed: ${turn.files.slice(0, 12).join(", ")}.` : "";
    return `- ${who} was asked: "${quote(turn.asked)}". It reported: "${quote(turn.did)}".${files}`;
  });
  const opening =
    lastOwn === -1
      ? "Other agents worked on this video before you. What happened, oldest first:"
      : "Other agents worked on this video since your last turn. What happened, oldest first:";
  const skipped = missed.length > shown.length ? `\n(${missed.length - shown.length} earlier turns are left out.)` : "";
  return (
    `${opening}\n${lines.join("\n")}${skipped}\n` +
    "The full log is .hyperframes/app-history.jsonl. The files are the truth, not this summary: read them before you change anything."
  );
}

/**
 * A recap for a fresh conversation (M15-04): the last few turns on this video, whoever took them. A conversation
 * that is resumed sends everything said in it again with each request; starting afresh with this is far smaller.
 */
export function recapNote(dir, names, { max = 6 } = {}) {
  const turns = readTurns(dir).slice(-max);
  if (turns.length === 0) return "";
  const lines = turns.map((turn) => {
    const who = names[turn.engine] ?? "An assistant";
    const files = turn.files?.length ? ` Files changed: ${turn.files.slice(0, 12).join(", ")}.` : "";
    return `- ${who} was asked: "${quote(turn.asked)}". It reported: "${quote(turn.did)}".${files}`;
  });
  return (
    "This is a fresh conversation about the same video, started to keep each request small. The latest work on " +
    `it, oldest first:\n${lines.join("\n")}\n` +
    "The full log is .hyperframes/app-history.jsonl, and the plan lives in the project's own files. The files are " +
    "the truth, not this summary: read them before you change anything."
  );
}
