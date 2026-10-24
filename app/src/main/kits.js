// A look kept under a name and used again (M10-04, M17-09). The owner's three shorts were each one request, and their
// ending cards and top titles came out a little different every time. A video's look is written in its STYLE.md
// (colours, fonts, titles, captions, ending card); every assistant is told to follow that file. "Save this look"
// keeps a copy in the app's settings folder under a name, and "Use" copies it into another video.
import fs from "node:fs";
import path from "node:path";
import { say } from "./say.js";

export const STYLE_FILE = "STYLE.md";
const MAX_BYTES = 64_000;
const MAX_KITS = 100;

/** A kit's file name from the name the person gave it: letters (with their marks, which Kannada and Hindi need),
 * digits, spaces and dashes only. */
export function kitFileName(name) {
  // Cut by letters, not UTF-16 units, so a letter outside the basic plane is never split in half.
  const kept = String(name ?? "").normalize("NFC").replace(/[^\p{L}\p{M}\p{N} _-]+/gu, "").replace(/\s+/g, " ");
  const clean = Array.from(kept).slice(0, 60).join("").trim();
  if (!clean) throw new Error(say("Give the look a name, for example the name of your channel."));
  // Windows keeps a few names for devices; a file cannot have one.
  return /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(clean) ? `${clean} look.md` : `${clean}.md`;
}

/** The saved looks, by name, newest first. */
export function listKits(folder) {
  let entries = [];
  try {
    entries = fs.readdirSync(folder, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((entry) => entry.isFile() && /\.md$/i.test(entry.name)).slice(0, MAX_KITS)
    .map((entry) => ({ name: entry.name.replace(/\.md$/i, ""), at: fs.statSync(path.join(folder, entry.name)).mtimeMs }))
    .sort((a, b) => b.at - a.at)
    .map(({ name }) => ({ name }));
}

/** Whether this video has a look written down yet. */
export function hasStyle(dir) {
  try {
    return fs.statSync(path.join(dir, STYLE_FILE)).isFile();
  } catch {
    return false;
  }
}

function readStyle(file) {
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > MAX_BYTES) {
    throw new Error(say("That look is too large to be a description of a look."));
  }
  return fs.readFileSync(file, "utf8");
}

/** Keep this video's STYLE.md under `name`. A look of the same name is replaced: that is how a look is updated. */
export function saveKit(folder, dir, name) {
  const source = path.join(dir, STYLE_FILE);
  if (!hasStyle(dir)) {
    throw new Error(say("This video has no look written down yet. Ask the assistant to write one first."));
  }
  const text = readStyle(source);
  fs.mkdirSync(folder, { recursive: true });
  const target = path.join(folder, kitFileName(name));
  const temp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temp, text);
  try {
    fs.renameSync(temp, target);
  } catch {
    // Windows refuses the rename while an antivirus or indexer holds the old file. A plain write still works.
    fs.writeFileSync(target, text);
    fs.rmSync(temp, { force: true });
  }
  return { name: kitFileName(name).replace(/\.md$/, "") };
}

// Whether `text` is one of the saved looks word for word, so it was put there by "Use" and is kept already.
function isSavedLook(folder, text) {
  return listKits(folder).some(({ name }) => {
    try {
      return fs.readFileSync(path.join(folder, `${name}.md`), "utf8") === text;
    } catch {
      return false;
    }
  });
}

/** Copy the saved look `name` into this video as its STYLE.md, keeping any look it had as STYLE.before.md. */
export function useKit(folder, dir, name) {
  const source = path.join(folder, kitFileName(name));
  if (!fs.existsSync(source)) throw new Error(say("That look is no longer saved."));
  const text = readStyle(source);
  const target = path.join(dir, STYLE_FILE);
  // Never lose what was there: the person's or an assistant's own description of this video. A look that is only a
  // copy of a saved one is kept already, and must not replace the video's own in STYLE.before.md.
  if (hasStyle(dir) && !isSavedLook(folder, readStyle(target))) fs.copyFileSync(target, path.join(dir, "STYLE.before.md"));
  fs.writeFileSync(target, text);
  return { name: kitFileName(name).replace(/\.md$/, "") };
}
