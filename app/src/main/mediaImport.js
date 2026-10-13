import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { kindOf, mayHoldFootage } from "./studyPlan.js";

const PICTURES = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);
export const MEDIA_EXTENSIONS = (
  "mp4 mov m4v mkv webm avi wmv mpg mpeg mts m2ts 3gp flv " +
  "mp3 wav m4a aac flac ogg opus wma aif aiff jpg jpeg png webp gif avif"
).split(" ");
export const isMedia = (file) => Boolean(kindOf(file)) || PICTURES.has(path.extname(file).toLowerCase());
const inside = (root, target) => {
  const relative = path.relative(root, target);
  return !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`);
};

/** Folder intake skips links and tool outputs; only media selected by the person enters a project. */
export async function mediaFilesIn(folder) {
  const files = [];
  let walked = 0;
  async function walk(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (++walked > 20_000) {
        throw new Error("That folder has too many files. Choose a smaller folder of footage.");
      }
      const file = path.join(dir, entry.name);
      if (entry.isDirectory() && mayHoldFootage(entry.name)) await walk(file);
      else if (entry.isFile() && !entry.name.startsWith(".") && isMedia(entry.name)) {
        if (files.length >= 200) throw new Error("That folder has too many files. Choose a smaller folder of footage.");
        files.push(file);
      }
    }
  }
  await walk(path.resolve(folder));
  return files.sort((a, b) => a.localeCompare(b));
}

/** Copy, never move. Exclusive creation protects existing assets even when names collide. */
export async function importMedia(dir, files) {
  if (!Array.isArray(files) || files.length === 0 || files.length > 200) {
    throw new Error("Choose between one and 200 video, sound or picture files.");
  }
  if (!path.isAbsolute(dir) || !(await fs.stat(path.join(dir, "index.html"))).isFile()) {
    throw new Error("Open a HyperFrames project first.");
  }
  const selected = [...new Set(files)];
  for (const file of selected) {
    if (typeof file !== "string" || !path.isAbsolute(file) || !isMedia(file)) {
      throw new Error("Choose video, sound or picture files. Other files cannot be imported.");
    }
    if (!(await fs.lstat(file)).isFile()) throw new Error("A selected file is missing or is a link.");
  }
  const root = await fs.realpath(dir);
  const assets = path.join(dir, "assets");
  await fs.mkdir(assets, { recursive: true });
  if (!inside(root, await fs.realpath(assets))) {
    throw new Error("The assets folder leads outside this project. Choose another project.");
  }
  const copied = [];
  for (const file of selected) {
    const parsed = path.parse(file);
    for (let n = 1; ; n++) {
      const name = n === 1 ? parsed.base : `${parsed.name}-${n}${parsed.ext}`;
      const target = path.join(assets, name);
      try {
        await fs.copyFile(file, target, constants.COPYFILE_EXCL);
        copied.push(path.relative(dir, target).split(path.sep).join("/"));
        break;
      } catch (error) {
        if (error.code === "EEXIST") continue;
        throw new Error(`Could not copy ${parsed.base}. Your originals are unchanged. ${copied.length} files were imported.`);
      }
    }
  }
  return { files: copied, count: copied.length };
}
