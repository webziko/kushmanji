// Renaming a video, and moving one to the Recycle Bin (M1-10). Apart from projects.js so it can be tested without
// Electron: everything it needs from the app (the settings, the projects folder, the Recycle Bin, "is this video in
// use?") is handed in. projects.js is where main.js reaches it.
//
// A video's name, as the person sees it everywhere, is the `name` in its meta.json (HyperFrames writes one when it
// makes a project). The folder's name is a separate thing: only a video the app made is renamed on disk too.
import fs from "node:fs";
import path from "node:path";
import { folderNameFor } from "./folderName.js";
import { readJson, writeJson } from "./jsonFile.js";
import { say } from "./say.js";

/** The longest name a video may be given, counted in letters (the page's box stops at the same number). */
export const MAX_NAME_LETTERS = 80;

const META = "meta.json";
/** Where the chat keeps what each assistant remembers of its conversation (agents/index.js, `chatFile`). */
const CHAT = [".hyperframes", "studio-win-chat.json"];

/** Windows compares paths without regard to case, so one folder has one key however its path is typed. */
const keyOf = (dir) => path.resolve(dir).toLowerCase();
const isPath = (value) => typeof value === "string" && value !== "";

/** The name a video is shown under: its meta.json's name, or its folder's name when it has none. */
export function nameOf(dir) {
  const name = readJson(path.join(dir, META), null)?.name;
  const shown = typeof name === "string" ? name.replace(/[\u0000-\u001f\u007f-\u009f\s]+/g, " ").trim() : "";
  return shown || path.basename(dir);
}

/** The name the person typed, tidied (control characters and runs of spaces become one space), or a plain refusal. */
export function cleanName(raw) {
  const name = typeof raw === "string" ? raw.replace(/[\u0000-\u001f\u007f-\u009f\s]+/g, " ").trim() : "";
  if (!name) throw new Error(say("Type a name for the video."));
  // Letters as a person counts them, not UTF-16 units: a name in Kannada or with emoji is not cut short.
  if (Array.from(name).length > MAX_NAME_LETTERS) {
    throw new Error(say("That name is too long. Use 80 letters or fewer."));
  }
  return name;
}

/**
 * The settings after a video's folder moved from `from` to `to`: the change to hand to updateState, which is empty
 * when nothing remembered the old place. Two things in the app's settings are kept by folder: the list of folders
 * the person opened, and the access level chosen for each video (`access.byProject`, keyed by the lower-cased full
 * path; agents/access.js). The level moves with the video; left behind it would be given to the next video made
 * under the old folder name, and "Anything on this computer" is meant for one video only.
 */
export function remembered(state, from, to) {
  const was = keyOf(from);
  const change = {};
  const recent = Array.isArray(state?.recentFolders) ? state.recentFolders : [];
  if (recent.some((dir) => isPath(dir) && keyOf(dir) === was)) {
    const seen = new Set();
    change.recentFolders = recent
      .map((dir) => (isPath(dir) && keyOf(dir) === was ? path.resolve(to) : dir))
      .filter((dir) => !isPath(dir) || (!seen.has(keyOf(dir)) && seen.add(keyOf(dir))));
  }
  const byProject = state?.access?.byProject;
  if (byProject && typeof byProject === "object" && Object.hasOwn(byProject, was)) {
    const { [was]: level, ...others } = byProject;
    change.access = { ...state.access, byProject: { ...others, [keyOf(to)]: level } };
  }
  return change;
}

/** The settings after a video went to the Recycle Bin: off the list, and its access level forgotten. */
export function forgotten(state, dir) {
  const gone = keyOf(dir);
  const change = {};
  const recent = Array.isArray(state?.recentFolders) ? state.recentFolders : [];
  if (recent.some((other) => isPath(other) && keyOf(other) === gone)) {
    change.recentFolders = recent.filter((other) => !isPath(other) || keyOf(other) !== gone);
  }
  const byProject = state?.access?.byProject;
  if (byProject && typeof byProject === "object" && Object.hasOwn(byProject, gone)) {
    const { [gone]: _level, ...others } = byProject;
    change.access = { ...state.access, byProject: others };
  }
  return change;
}

/**
 * The folder name a new name would get under the projects folder: its own words, and a number when another video
 * has that name already (as createProject does). The folder a video already has counts as free, so renaming a video
 * to a name that gives its present folder name does not move it.
 */
export function folderFor(name, current, root, exists = fs.existsSync) {
  const base = folderNameFor(name);
  for (let n = 1; n <= 1000; n++) {
    const folder = n === 1 ? base : `${base}-${n}`;
    if (folder.toLowerCase() === current.toLowerCase() || !exists(path.join(root, folder))) return folder;
  }
  return current;
}

function writeName(dir, name) {
  if (nameOf(dir) === name) return;
  const file = path.join(dir, META);
  const old = readJson(file, null);
  const meta = old && typeof old === "object" && !Array.isArray(old) ? old : {};
  try {
    // The id stays what it was made as: only the name people read changes.
    writeJson(file, { id: path.basename(dir), createdAt: new Date().toISOString(), ...meta, name });
  } catch {
    throw new Error(say("The new name could not be saved. Try again in a moment."));
  }
}

/**
 * After the folder moved, the assistants forget their conversations about it. Claude Code keeps a conversation
 * under the folder it was started in, so a resume from the new place fails once ("the conversation is gone") before
 * the chat recovers by itself. The chat's own messages, and the record the assistants share, stay.
 */
function forgetConversations(dir) {
  const file = path.join(dir, ...CHAT);
  const chat = readJson(file, null);
  if (!chat || typeof chat !== "object" || !Array.isArray(chat.messages)) return;
  const { sessionId: _old, ...rest } = chat;
  writeJson(file, { ...rest, sessions: {}, turns: {}, told: {} });
}

// Said when the name is changed and the folder keeps its old name. The name is changed first, and stays.
const FOLDER_KEPT = {
  open: say("The name is changed. The folder keeps its old name while the video is open."),
  saving: say("The name is changed. The folder keeps its old name while the video is being saved."),
  working: say("The name is changed. The folder keeps its old name while the assistant is working."),
  refused: say("The name is changed. Windows would not rename the folder just now, so it keeps its old name."),
  deep: say("The name is changed. The folder keeps its old name, because the new one would be too long for Windows."),
};

// Windows refuses a rename for a moment while an antivirus program or the search indexer looks at a folder.
const TRY_AGAIN = new Set(["EBUSY", "EPERM", "EACCES"]);
const wait = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * Give a video a new name. `env`:
 *   root      the app's own projects folder
 *   state     { read(), update(change) }: the app's settings
 *   why(dir)  null, or "open", "saving" or "working": why the folder must stay where it is for now
 *   tooDeep(dir)  true for a folder path Windows' video tools cannot work with (projects.js)
 *   rename, wait  for tests
 * The name (meta.json) is written first and always. The folder is renamed too only for a video inside the projects
 * folder that nothing is using; if Windows refuses, the folder keeps its name and `note` says so in one sentence.
 * Resolves to `{ dir, name, note }` where `dir` is where the video is now.
 */
export async function renameVideo(dir, raw, env) {
  const name = cleanName(raw);
  dir = path.resolve(dir);
  writeName(dir, name);
  const kept = (note = null) => ({ dir, name, note });

  const root = path.resolve(env.root);
  // Only a video made by the app sits directly in its folder; one opened from elsewhere keeps its folder's name.
  if (keyOf(path.dirname(dir)) !== keyOf(root)) return kept();
  const folder = folderFor(name, path.basename(dir), root, env.exists);
  if (folder.toLowerCase() === path.basename(dir).toLowerCase()) return kept();

  const busy = env.why?.(dir);
  if (busy) return kept(FOLDER_KEPT[busy] ?? FOLDER_KEPT.refused);
  const target = path.join(root, folder);
  if (env.tooDeep?.(target)) return kept(FOLDER_KEPT.deep);
  const rename = env.rename ?? fs.promises.rename;
  for (let attempt = 1; ; attempt++) {
    try {
      await rename(dir, target);
      break;
    } catch (error) {
      if (attempt < 3 && TRY_AGAIN.has(error?.code)) {
        await (env.wait ?? wait)(300);
        continue;
      }
      return kept(FOLDER_KEPT.refused);
    }
  }
  // The folder is where it is now whatever happens next; a settings file that cannot be written only means the
  // video starts from the default access level again, which is the careful way round.
  try {
    const change = remembered(env.state.read(), dir, target);
    if (Object.keys(change).length) env.state.update(change);
  } catch { /* see above */ }
  try {
    forgetConversations(target);
  } catch { /* the chat recovers from a conversation it cannot resume */ }
  return { dir: target, name, note: null };
}

// Said when a video cannot go to the Recycle Bin yet.
const TRASH_REFUSED = {
  open: say("This video is open. Go back to your videos first, then move it to the Recycle Bin."),
  saving: say("This video is being saved. Wait until it is saved before moving it to the Recycle Bin."),
  working: say("The assistant is still working. Wait for it to finish before moving a video to the Recycle Bin."),
};
const NOT_FROM_HERE = say("That folder holds much more than one video, so it is not moved from here.");
const TRASH_FAILED = say("Windows could not move this video to the Recycle Bin, so nothing was changed.");

/** A drive's top, the person's home folder, the app's projects folder, or a folder around one of those. */
function holdsMore(dir, places) {
  const here = keyOf(dir);
  if (here === path.parse(here).root) return true;
  const below = here.endsWith(path.sep) ? here : here + path.sep;
  return places.filter(isPath).some((place) => (keyOf(place) + path.sep).startsWith(below));
}

/**
 * Move a video's folder to the Windows Recycle Bin, from which the person can restore it, and take it off the
 * list. `env`: `trashItem` (Electron's shell.trashItem, handed in so a test can fake it), `why(dir)` as for
 * renameVideo, `root` the projects folder, `home` the person's home folder, `state` as for renameVideo.
 * Nothing is touched when the move is refused or fails.
 */
export async function trashVideo(dir, env) {
  dir = path.resolve(dir);
  const busy = env.why?.(dir);
  if (busy) throw new Error(TRASH_REFUSED[busy] ?? TRASH_REFUSED.working);
  if (holdsMore(dir, [env.root, env.home])) throw new Error(NOT_FROM_HERE);
  try {
    await env.trashItem(dir);
  } catch {
    throw new Error(TRASH_FAILED);
  }
  try {
    const change = forgotten(env.state.read(), dir);
    if (Object.keys(change).length) env.state.update(change);
  } catch { /* the folder is gone, so the list drops it by itself */ }
}
