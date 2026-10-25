// "Draw on the picture" (M3-05): the person marks the video's picture in coral on the watching screen, and the
// picture with the marks goes to the assistant. The page names only the box of the picture on screen (as for Home's
// cover, covers.js); this file takes the picture of the app's own window there, so the frame and the marks are one
// image, and keeps it in the project's hidden `.hyperframes/notes` folder, which HyperFrames' watcher skips and
// the assistants can read. It returns the picture's path inside the project, which the page puts in the chat's box.
import fs from "node:fs";
import path from "node:path";
import { captureBox } from "./covers.js";
import { say } from "./say.js";

export const NOTES_FOLDER = [".hyperframes", "notes"];
/** How many drawings a project keeps; the oldest go first. */
export const KEEP = 50;
/** A bigger window gives a bigger picture than an assistant needs, and 50 of them add up. */
const MAX_WIDTH = 1600;

// The names this file makes, and the only names it ever removes: whatever else is in the folder is not its own.
const MADE = /^drawing-(\d{8}-\d{6})(?:-(\d+))?\.png$/;

const two = (number) => String(number).padStart(2, "0");

/** 20261025-091500: the person's own clock, as they would write it down. */
export function stampOf(date) {
  return `${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}-` +
    `${two(date.getHours())}${two(date.getMinutes())}${two(date.getSeconds())}`;
}

/** The name of the drawing made at `date`. `copy` is 1 for the first in a second, then 2, 3... */
export const drawingName = (date, copy = 1) => `drawing-${stampOf(date)}${copy > 1 ? `-${copy}` : ""}.png`;

const within = (root, file) => {
  const relative = path.relative(root, file);
  return !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`);
};

/**
 * The project's notes folder, made if it is not there, or null. A project folder can be sent by someone else, so its
 * hidden folder may be a link that leads elsewhere: the folder as it really is must still be inside the project.
 */
function notesFolder(dir) {
  const root = fs.realpathSync.native(dir);
  // One level at a time, so a link is found before anything is made on the other side of it.
  let folder = dir;
  for (const part of NOTES_FOLDER) {
    folder = path.join(folder, part);
    fs.mkdirSync(folder, { recursive: true });
    if (!within(root, fs.realpathSync.native(folder))) return null;
  }
  return folder;
}

/** The first name at `date` that nothing in `folder` has (a second drawing in the same second gets "-2"), or null. */
function freeName(folder, date) {
  for (let copy = 1; copy <= 99; copy++) {
    const name = drawingName(date, copy);
    try {
      fs.lstatSync(path.join(folder, name));
    } catch (error) {
      if (error.code === "ENOENT") return name;
      throw error;
    }
  }
  return null;
}

/** Oldest first, by the time in the name (and the copy number within a second). */
const byAge = (a, b) => {
  const [, stampA, copyA] = MADE.exec(a);
  const [, stampB, copyB] = MADE.exec(b);
  return stampA === stampB ? Number(copyA ?? 1) - Number(copyB ?? 1) : stampA < stampB ? -1 : 1;
};

/** Remove the oldest drawings beyond `keep`. Never `except` (the one just saved), never a file it did not make. */
export function pruneDrawings(folder, { keep = KEEP, except = null } = {}) {
  let names;
  try {
    names = fs.readdirSync(folder, { withFileTypes: true })
      .filter((entry) => entry.isFile() && MADE.test(entry.name)).map((entry) => entry.name).sort(byAge);
  } catch {
    return;
  }
  for (const name of names.slice(0, Math.max(0, names.length - keep))) {
    if (name === except) continue;
    try {
      fs.unlinkSync(path.join(folder, name));
    } catch {
      // Held open for a moment by an indexer, or already gone: the next drawing tries again.
    }
  }
}

const noPicture = () => new Error(say("The picture could not be taken. Try again."));
const notSaved = () => new Error(say("The drawing could not be saved in this video's folder."));

/**
 * Keep `image` (an Electron NativeImage of the picture and the marks) in the project's notes folder. Returns its
 * path inside the project, written with `/` so it reads the same to every assistant.
 */
export function saveDrawing(dir, image, { now = new Date() } = {}) {
  if (!image || image.isEmpty()) throw noPicture();
  const picture = image.getSize().width > MAX_WIDTH ? image.resize({ width: MAX_WIDTH, quality: "best" }) : image;
  const png = picture.toPNG();
  if (!png?.length) throw noPicture();

  let folder = null;
  let name = null;
  try {
    folder = notesFolder(dir);
    name = folder && freeName(folder, now);
  } catch { /* a folder that cannot be made or read: said below */ }
  if (!folder || !name) throw notSaved();
  const file = path.join(folder, name);
  const temp = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temp, png);
    try {
      fs.renameSync(temp, file);
    } catch {
      // Windows refuses to move a file another program (an indexer, an antivirus) has open for a moment.
      fs.copyFileSync(temp, file, fs.constants.COPYFILE_EXCL);
      fs.rmSync(temp, { force: true });
    }
  } catch {
    try {
      fs.rmSync(temp, { force: true });
    } catch { /* nothing more to do */ }
    throw notSaved();
  }
  pruneDrawings(folder, { except: name });
  return [...NOTES_FOLDER, name].join("/");
}

/**
 * The page's "Send to the chat": take the picture of `win` inside the box the page named, and keep it. Nothing but
 * the box comes from the page, and the box is kept inside the window (covers.js `captureBox`).
 */
export async function captureDrawing(win, dir, rect, options) {
  const box = win && captureBox(rect, win.getContentBounds());
  if (!box) throw new Error(say("The picture is not on the screen, so it could not be taken. Try again."));
  return saveDrawing(dir, await win.webContents.capturePage(box), options);
}
