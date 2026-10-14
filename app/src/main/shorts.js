// "Make shorts from this video" (M17-04), the half that needs no assistant. An assistant, working inside the source
// video's folder, picks the moments and writes them into SHORTS.md as one fenced block of JSON. This file reads that
// plan, refuses it in plain words when it is wrong, and makes one new HyperFrames project per short beside the
// source, so that every short starts from the same look (STYLE.md) and the same footage study. Asking the
// assistant to build each short is shortsMaker.js.
//
// Nothing here ever changes the source folder: it is only read, and its big files are linked, not moved.
import fs from "node:fs";
import path from "node:path";
import { folderNameFor } from "./folderName.js";
import { readJson, writeJson } from "./jsonFile.js";
import { STUDY_FOLDER } from "./studyPlan.js";

export const SHORTS_FILE = "SHORTS.md";

const MAX_BYTES = 100_000;
const MAX_SHORTS = 5;
const MAX_PIECES = 12;
const MAX_TITLE = 60;
const MAX_WORDS = 400;
const MIN_PIECE = 0.5;
const MIN_SECONDS = 5;
const MAX_SECONDS = 90;
const MAX_NAME = 80;
const MAX_ASSETS = 2000;
const MAX_TRIES = 50;
// The room an ending card needs after the last piece, in seconds.
const ENDING_ROOM = 3;
const WIDTH = 1080;
const HEIGHT = 1920;

const VIDEO = /\.(mp4|mov|m4v|webm|mkv)$/i;
// Windows keeps these names for devices; a file cannot have one, with or without an extension.
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
// What a short inherits from the video it is cut from. The look and the notes for assistants, never the renders.
// Not meta.json: it holds the video's own id and name, and a short is a video of its own (written below).
const SHARED_FILES = [
  "hyperframes.json", "package.json", "STYLE.md", "DESIGN.md", "LOOK.md", "AGENTS.md", "CLAUDE.md",
];

const tidy = (text) => String(text ?? "").replace(/[\u0000-\u001f\u007f]+|\s+/g, " ").trim();
const hundredths = (seconds) => Math.round(seconds * 100);
const count = (text) => Array.from(text).length;
const keyOf = (parts) => parts.join("/").toLowerCase();

/**
 * The parts of a clip's path inside the project, or null when it is not a video file there. The path comes from an
 * assistant's file, so everything that could point outside the project is refused: absolute paths, drive letters and
 * streams (any colon), "..", hidden folders (the study and the tools live there), and names Windows keeps.
 */
function clipParts(value) {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/\\/g, "/");
  if (!text || text.startsWith("/") || /[:<>"|?*\u0000-\u001f]/.test(text)) return null;
  const parts = text.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  for (const part of parts) {
    if (part.startsWith(".") || /[. ]$/.test(part) || RESERVED.test(part.split(".")[0])) return null;
  }
  return VIDEO.test(parts.at(-1)) ? parts : null;
}

function parseBlock(body) {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

/** The plan as the first JSON block of the text holds it, or a plain-sentence error. */
function planFrom(text) {
  const blocks = Array.from(String(text ?? "").matchAll(/```([^\r\n`]*)\r?\n([\s\S]*?)```/g), (found) => ({
    kind: found[1].trim().toLowerCase(),
    body: found[2],
  }));
  const wrong = () =>
    new Error("The shorts plan could not be read: the block in SHORTS.md is not written correctly.");
  const tagged = blocks.find((block) => block.kind === "json");
  if (tagged) {
    const value = parseBlock(tagged.body);
    if (value === undefined) throw wrong();
    return value;
  }
  // An assistant sometimes forgets the word "json" after the fence. Take such a block if it reads as a plan.
  const bare = blocks.filter((block) => block.kind === "");
  for (const block of bare) {
    const value = parseBlock(block.body);
    if (value !== undefined) return value;
  }
  if (bare.length > 0) throw wrong();
  throw new Error("SHORTS.md has no plan in it: it must hold one fenced block with the list of shorts.");
}

function parsePiece(raw, where) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${where}: this piece is not written correctly.`);
  }
  const parts = clipParts(raw.clip);
  if (!parts) throw new Error(`${where}: that clip is not a video inside this project.`);
  const { from, to } = raw;
  if (typeof from !== "number" || typeof to !== "number" || !Number.isFinite(from) || !Number.isFinite(to)) {
    throw new Error(`${where}: the start and the end must be numbers of seconds.`);
  }
  if (from < 0) throw new Error(`${where}: the start cannot be before the beginning of the clip.`);
  if (from >= to) throw new Error(`${where}: the end must come after the start.`);
  // Compared in whole hundredths, so that 8.0 to 8.5 is exactly half a second and not 0.4999999.
  if (hundredths(to) - hundredths(from) < hundredths(MIN_PIECE)) {
    throw new Error(`${where}: a piece must be at least half a second long.`);
  }
  // Cut, not refused: an overlong line is not worth losing a good plan for. One line, so SHORT.md stays tidy.
  const words = Array.from(tidy(typeof raw.words === "string" ? raw.words : "")).slice(0, MAX_WORDS).join("").trim();
  return { clip: parts.join("/"), from: hundredths(from) / 100, to: hundredths(to) / 100, words };
}

/**
 * Turn the text of SHORTS.md into `{ shorts: [{ title, pieces: [{ clip, from, to, words }], seconds }] }`, or throw
 * an Error whose message is a sentence the person can read. Keys the plan does not need are ignored. Whether the
 * clips exist is readShortsPlan's business, since this knows no folder.
 */
export function parseShortsPlan(text) {
  const plan = planFrom(text);
  if (!plan || typeof plan !== "object" || !Array.isArray(plan.shorts)) {
    throw new Error("The shorts plan has no list of shorts.");
  }
  if (plan.shorts.length === 0) throw new Error("The shorts plan has no shorts in it.");
  if (plan.shorts.length > MAX_SHORTS) {
    throw new Error(`The shorts plan has ${plan.shorts.length} shorts; make 1 to ${MAX_SHORTS}.`);
  }
  const shorts = plan.shorts.map((raw, i) => {
    const n = i + 1;
    // Letters are counted, not UTF-16 units: a Kannada or Hindi title is not "longer" for its marks.
    const title = tidy(raw?.title);
    if (typeof raw?.title !== "string" || !title) throw new Error(`Short ${n} has no title.`);
    if (count(title) > MAX_TITLE) throw new Error(`Short ${n} has a title longer than ${MAX_TITLE} characters.`);
    if (!Array.isArray(raw.pieces) || raw.pieces.length === 0) throw new Error(`Short ${n} has no pieces.`);
    if (raw.pieces.length > MAX_PIECES) {
      throw new Error(`Short ${n} has ${raw.pieces.length} pieces; a short may have 1 to ${MAX_PIECES}.`);
    }
    const pieces = raw.pieces.map((piece, j) => parsePiece(piece, `Short ${n}, piece ${j + 1}`));
    const total = pieces.reduce((sum, piece) => sum + hundredths(piece.to) - hundredths(piece.from), 0);
    const seconds = Math.round(total / 10) / 10;
    if (seconds < MIN_SECONDS || seconds > MAX_SECONDS) {
      throw new Error(
        `Short ${n} would be ${seconds} seconds long; a short is ${MIN_SECONDS} to ${MAX_SECONDS} seconds.`,
      );
    }
    return { title, pieces, seconds };
  });
  return { shorts };
}

/**
 * A regular file at `parts` below `root`, walking one step at a time so that a link or junction anywhere on the way
 * (which could lead out of the folder) is not followed. Returns `{ file, stat }` or null.
 */
function plainFile(root, parts) {
  let current = root;
  let stat = null;
  for (const [i, part] of parts.entries()) {
    current = path.join(current, part);
    try {
      stat = fs.lstatSync(current);
    } catch {
      return null;
    }
    if (stat.isSymbolicLink() || (i < parts.length - 1 ? !stat.isDirectory() : !stat.isFile())) return null;
  }
  return stat ? { file: current, stat } : null;
}

/**
 * The plan in `dir`'s SHORTS.md, checked against the folder: every clip must be a file in there. Null when there is
 * no SHORTS.md yet; a plain-sentence error when the plan is wrong.
 */
export function readShortsPlan(dir) {
  const file = path.join(dir, SHORTS_FILE);
  let stat;
  try {
    stat = fs.statSync(file);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return null;
    throw new Error("SHORTS.md could not be opened.");
  }
  if (!stat.isFile()) return null;
  if (stat.size > MAX_BYTES) throw new Error("SHORTS.md is too large to be a list of shorts.");
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    throw new Error("SHORTS.md could not be read.");
  }
  const plan = parseShortsPlan(text);
  plan.shorts.forEach((short, i) => {
    short.pieces.forEach((piece, j) => {
      if (!plainFile(dir, piece.clip.split("/"))) {
        throw new Error(
          `Short ${i + 1}, piece ${j + 1}: the clip "${piece.clip}" was not found in this video's folder.`,
        );
      }
    });
  });
  return plan;
}

/**
 * The folder name (not the path) for short number `index`: the video's own name, "short", the number, and the title
 * as a folder name. At most 80 letters; the title is cut first, and only a very long video name is cut as well, so
 * that "-short-3" always survives and two shorts never get the same name.
 */
export function shortFolderName(sourceDir, index, title) {
  const base = Array.from(path.basename(sourceDir));
  const slug = Array.from(folderNameFor(title));
  const tail = Array.from(`-short-${index}`);
  // Room for the video's name and the title together; the hyphen between "-short-N" and the title is not in it.
  const room = MAX_NAME - tail.length - 1;
  let keepSlug = slug.length;
  let keepBase = base.length;
  if (keepBase + keepSlug > room) {
    keepSlug = Math.min(keepSlug, Math.max(10, room - keepBase));
    keepBase = Math.min(keepBase, room - keepSlug);
  }
  const title2 = slug.slice(0, keepSlug).join("").replace(/-+$/, "");
  return `${base.slice(0, keepBase).join("")}${tail.join("")}-${title2}`.replace(/[-. ]+$/, "");
}

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** The same bare composition HyperFrames starts a video with, made upright and without its network script. */
function starterHtml(title, duration) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=${WIDTH}, height=${HEIGHT}">
    <title>${escapeHtml(title)}</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      html, body { margin:0; width:${WIDTH}px; height:${HEIGHT}px; overflow:hidden; background:#000; }
      #root { width:100%; height:100%; position:relative; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${duration}"
      data-width="${WIDTH}" data-height="${HEIGHT}"></div>
  </body>
</html>
`;
}

function secondsOf(short) {
  if (Number.isFinite(short.seconds)) return short.seconds;
  const total = (short.pieces ?? []).reduce((sum, piece) => sum + hundredths(piece.to) - hundredths(piece.from), 0);
  return Math.round(total / 10) / 10;
}

function shortNotes(sourceDir, short, index) {
  const pieces = (short.pieces ?? []).map((piece) => {
    const words = tidy(piece.words);
    return `- ${piece.clip}, ${piece.from} to ${piece.to}${words ? `: "${words}"` : ""}`;
  });
  return [
    `# Short ${index}: ${tidy(short.title)}`,
    "",
    `About ${secondsOf(short)} seconds, from the video "${path.basename(sourceDir)}". Use these pieces, in this ` +
      "order (times are inside each clip's own file, in seconds):",
    "",
    ...pieces,
    "",
  ].join("\n");
}

/**
 * Put `source` at `target` without using more disk: a hard link, which keeps its size and its time of last change
 * (the footage study decides from those two whether a clip was edited). Where a link is not possible (another
 * drive, a file system without links, a refusal) it is a copy that is given the original's times. A tool that
 * rewrites a linked file in place would change the original too; the ones in use write a new file instead.
 */
function place(source, target, stat) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  try {
    fs.linkSync(source, target);
    return;
  } catch {
    // Fall through to a copy.
  }
  fs.copyFileSync(source, target);
  // The milliseconds with their fraction, not a Date, which would drop it: the study rounds from the fraction.
  fs.utimesSync(target, stat.atimeMs / 1000, stat.mtimeMs / 1000);
}

/** Every file under the video's assets folder, links and hidden folders left out, as `{ full, parts, stat }`. */
function listAssets(sourceDir) {
  const found = [];
  const walk = (folder, parts) => {
    let names;
    try {
      names = fs.readdirSync(folder).sort();
    } catch {
      return;
    }
    for (const name of names) {
      if (found.length >= MAX_ASSETS) return;
      const full = path.join(folder, name);
      let stat;
      try {
        stat = fs.lstatSync(full);
      } catch {
        continue;
      }
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) {
        if (!name.startsWith(".")) walk(full, [...parts, name]);
      } else if (stat.isFile()) {
        found.push({ full, parts: [...parts, name], stat });
      }
    }
  };
  try {
    // lstat does not follow: an assets folder that is a link or junction to somewhere else is not a directory here.
    const root = path.join(sourceDir, "assets");
    if (fs.lstatSync(root).isDirectory()) walk(root, ["assets"]);
  } catch {
    // No assets folder: a video without footage still gets its project.
  }
  return found;
}

function copyTree(from, to) {
  let stat;
  try {
    stat = fs.lstatSync(from);
  } catch {
    return;
  }
  if (stat.isSymbolicLink()) return;
  if (stat.isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    for (const name of fs.readdirSync(from)) copyTree(path.join(from, name), path.join(to, name));
  } else if (stat.isFile()) {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
}

/**
 * The part of the footage study about the files this short really has, so the assistant does not read about footage
 * it was not given. That is the clips it uses and also the music and sounds that were placed: the app studies every
 * audio and video file it finds in a project, so without their entries it would listen to a whole song again before
 * the first request. `placed` holds the lower-case, forward-slash paths of what the short project received.
 */
function copyStudy(sourceDir, newDir, placed) {
  const index = readJson(path.join(sourceDir, ...STUDY_FOLDER, "index.json"), null);
  if (!index || typeof index !== "object" || !Array.isArray(index.clips)) return;
  const kept = index.clips.filter(
    (clip) => typeof clip?.file === "string" && placed.has(clip.file.replace(/\\/g, "/").toLowerCase()),
  );
  const studyRoot = path.resolve(sourceDir, ...STUDY_FOLDER);
  for (const clip of kept) {
    if (typeof clip.study !== "string" || !clip.study) continue;
    const parts = clip.study.replace(/\\/g, "/").split("/").filter(Boolean);
    const from = path.resolve(sourceDir, ...parts);
    const inside = path.relative(studyRoot, from);
    // The index is a file an assistant may have touched: never copy from outside the study folder.
    if (!inside || inside.startsWith("..") || path.isAbsolute(inside)) continue;
    copyTree(from, path.resolve(newDir, ...parts));
  }
  writeJson(path.join(newDir, ...STUDY_FOLDER, "index.json"), { ...index, clips: kept });
}

function makeFolder(parentDir, name) {
  fs.mkdirSync(parentDir, { recursive: true });
  for (let n = 1; n <= MAX_TRIES; n++) {
    const candidate = path.resolve(parentDir, n === 1 ? name : `${name}-${n}`);
    try {
      // Not recursive: a folder that exists already must fail, so that nothing of anyone's is ever written into.
      fs.mkdirSync(candidate);
      return candidate;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
  }
  throw new Error("There are already too many folders with this short's name beside the video.");
}

/**
 * Make short number `index` (counting from 1) as a project of its own, beside the source video by default, and
 * return its folder. It holds the starter composition, the video's look files, the clips this short uses (and every
 * non-video file of the video's assets, such as fonts and music), the part of the footage study about those clips,
 * and SHORT.md, which says what to cut. Nothing in the source folder is changed.
 */
export function makeShortProject(sourceDir, short, index, { parentDir = path.dirname(sourceDir) } = {}) {
  if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
    throw new Error("The video's folder could not be found.");
  }
  const target = makeFolder(parentDir, shortFolderName(sourceDir, index, short.title));
  try {
    const clips = (short.pieces ?? []).map((piece) => clipParts(piece.clip)).filter(Boolean);
    const used = new Set(clips.map(keyOf));

    fs.writeFileSync(
      path.join(target, "index.html"),
      starterHtml(tidy(short.title), Math.ceil(secondsOf(short)) + ENDING_ROOM),
    );
    for (const name of SHARED_FILES) {
      const found = plainFile(sourceDir, [name]);
      if (found) fs.copyFileSync(found.file, path.join(target, name));
    }
    const name = path.basename(target);
    writeJson(path.join(target, "meta.json"), { id: name, name, createdAt: new Date().toISOString() });

    const placed = new Set();
    for (const asset of listAssets(sourceDir)) {
      const key = keyOf(asset.parts);
      // A video no piece uses would only fill the disk and make the assistant look at footage it should not use.
      if (VIDEO.test(asset.parts.at(-1)) && !used.has(key)) continue;
      place(asset.full, path.join(target, ...asset.parts), asset.stat);
      placed.add(key);
    }
    // A clip kept outside assets/ is still needed.
    for (const parts of clips) {
      if (placed.has(keyOf(parts))) continue;
      const found = plainFile(sourceDir, parts);
      if (!found) continue;
      place(found.file, path.join(target, ...parts), found.stat);
      placed.add(keyOf(parts));
    }

    copyStudy(sourceDir, target, placed);
    fs.writeFileSync(path.join(target, "SHORT.md"), shortNotes(sourceDir, short, index));
    return target;
  } catch (error) {
    // Half a project is worse than none: the person would open it and find it empty. Only the new folder goes.
    fs.rmSync(target, { recursive: true, force: true });
    throw new Error(`The folder for short ${index} could not be made. Is there room on the disk?`, { cause: error });
  }
}

/** Make every short of the plan, in order, and return their folders. */
export function makeShorts(sourceDir, plan, options) {
  if (!Array.isArray(plan?.shorts)) throw new Error("The shorts plan has no list of shorts.");
  return plan.shorts.map((short, i) => makeShortProject(sourceDir, short, i + 1, options));
}
