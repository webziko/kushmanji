import fs from "node:fs/promises";
import path from "node:path";
import { isMedia, MEDIA_EXTENSIONS } from "./mediaImport.js";
import { kindOf, mayHoldFootage } from "./studyPlan.js";

// What the chat's "@" list and its drop target need from a video's folder (M3-03). The page asks for names,
// never for file contents, and the main process does the looking: the page is not trusted to say what a folder
// holds.

/** The list is for a person to pick from, so a very large folder is cut short instead of slowing the chat. */
export const MAX_MENTIONABLE = 500;
/** Folders below the video's own folder that are searched. */
export const MAX_DEPTH = 4;
/** Clips that can be dropped on the chat at once. */
export const MAX_DROPPED = 50;
/** Entries looked at, files and folders both, before the search gives up on a folder with no end. */
const MAX_LOOKED_AT = 20_000;

const naturally = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

/** "video", "audio", "image" or "scene" for a file the list offers, null for everything else. */
function kindFor(parts) {
  const name = parts.at(-1);
  const kind = kindOf(name);
  if (kind) return kind;
  // Video and sound are told apart by kindOf; the only other media isMedia accepts are pictures.
  if (isMedia(name)) return "image";
  // The video's own index.html is the whole video, not a part of it; every other page is a scene.
  const page = path.extname(name).toLowerCase() === ".html";
  return page && !(parts.length === 1 && name.toLowerCase() === "index.html") ? "scene" : null;
}

/**
 * The clips, sounds, pictures and scenes inside a video's folder, for the chat's "@" list. Looks at the
 * shallow folders first, so a cut-short list keeps what is easiest to find. Skips hidden folders and the ones
 * that never hold footage (node_modules, renders...), and never follows a shortcut or junction out of the
 * folder.
 *
 * `mention` is what the chat writes after the "@": the file's name when no other file has it, otherwise its
 * whole path from the video's folder, so the assistant can open exactly the file meant.
 */
export async function listMentionable(dir) {
  if (typeof dir !== "string" || !path.isAbsolute(dir)) throw new Error("Open a video first.");
  const found = [];
  const folders = [{ folder: path.resolve(dir), parts: [] }];
  let lookedAt = 0;
  const room = () => found.length < MAX_MENTIONABLE && lookedAt < MAX_LOOKED_AT;
  for (let next = 0; next < folders.length && room(); next++) {
    const { folder, parts } = folders[next];
    let entries;
    try {
      entries = await fs.readdir(folder, { withFileTypes: true });
    } catch (error) {
      // A folder inside the video that cannot be read (antivirus, permissions) is left out, not fatal.
      if (parts.length > 0) continue;
      throw new Error("This video's folder could not be read.", { cause: error });
    }
    entries.sort((a, b) => naturally(a.name, b.name));
    for (const entry of entries) {
      if (!room()) break;
      lookedAt++;
      if (entry.name.startsWith(".")) continue;
      if (entry.isDirectory()) {
        if (parts.length < MAX_DEPTH && mayHoldFootage(entry.name)) {
          folders.push({ folder: path.join(folder, entry.name), parts: [...parts, entry.name] });
        }
      } else if (entry.isFile()) {
        const where = [...parts, entry.name];
        const kind = kindFor(where);
        if (kind) found.push({ path: where.join("/"), name: entry.name, kind });
      }
    }
  }

  const sameName = new Map();
  for (const item of found) {
    const key = item.name.toLowerCase();
    sameName.set(key, (sameName.get(key) ?? 0) + 1);
  }
  return found
    .map((item) => {
      const shared = sameName.get(item.name.toLowerCase()) > 1;
      return { ...item, mention: shared ? item.path : item.name };
    })
    .sort((a, b) => naturally(a.path, b.path));
}

const EXTENSIONS = new Set(MEDIA_EXTENSIONS.map((extension) => `.${extension}`));

/**
 * The files dropped on the chat, checked before anything is copied: a list of absolute paths, each a real
 * file of a kind the app can add. The page took these from a drop; the main process still does not take its
 * word for them. Returns the files without repeats. Anything wrong refuses the whole drop, so a half-added
 * set never happens.
 */
export async function validateDropped(paths) {
  if (!Array.isArray(paths) || paths.length === 0 || paths.length > MAX_DROPPED) {
    throw new Error(`Drop between one and ${MAX_DROPPED} files at a time.`);
  }
  const chosen = [];
  for (const file of paths) {
    if (typeof file !== "string" || !path.isAbsolute(file)) {
      throw new Error("One of the dropped files could not be found on this computer, so nothing was added.");
    }
    const name = path.basename(file);
    if (!EXTENSIONS.has(path.extname(file).toLowerCase())) {
      throw new Error(`${name} is not a video, sound or picture file, so nothing was added.`);
    }
    let info;
    try {
      info = await fs.lstat(file);
    } catch {
      throw new Error(`${name} is missing or cannot be read, so nothing was added.`);
    }
    // A shortcut is not the file it points to: importing it would copy the shortcut, or follow it elsewhere.
    if (!info.isFile()) throw new Error(`${name} is a folder or a shortcut, so nothing was added.`);
    chosen.push(path.resolve(file));
  }
  return [...new Set(chosen)];
}
