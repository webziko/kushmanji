// "Make other sizes" of a video (M17-11): makes upright and square versions of a video beside the source,
// hard-linking or copying assets, copying compositions and text files, and preparing one request per shape
// for the assistant to adapt the layout.
//
// Nothing in the source folder is ever changed: it is only read, and its big files are linked, not moved.

import fs from "node:fs";
import path from "node:path";
import { writeJson } from "./jsonFile.js";
import { say } from "./say.js";
import { nameOf } from "./videoManage.js";

export const SHAPES = ["upright", "square"];

const MAX_ASSETS = 2000;
const MAX_TRIES = 50;

const TEXT_FILE = /\.(md|txt|json|html|css|js|mjs|ts|csv|tsv|svg|xml)$/i;

const within = (root, file) => {
  const relative = path.relative(root, file);
  return !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`);
};

function checkSource(dir) {
  if (typeof dir !== "string" || !path.isAbsolute(dir) || !fs.existsSync(dir)) {
    throw new Error(say("The video's folder could not be found."));
  }
  let stat;
  try {
    stat = fs.statSync(dir);
  } catch {
    throw new Error(say("The video's folder could not be found."));
  }
  if (!stat.isDirectory() || !fs.existsSync(path.join(dir, "index.html"))) {
    throw new Error(say("The video's folder could not be found."));
  }
}

export function readProjectSize(dir) {
  const file = path.join(dir, "index.html");
  let html;
  try {
    html = fs.readFileSync(file, "utf8");
  } catch {
    return { width: 1920, height: 1080 };
  }
  const rootTag = html.match(/<[^>]+(?:id=["']root["']|data-composition-id)[^>]*>/i) ||
                  html.match(/<[^>]+data-width=[^>]+>/i);
  const tag = rootTag ? rootTag[0] : html;
  const matchW = tag.match(/data-width=["']?(\d+)["']?/i);
  const matchH = tag.match(/data-height=["']?(\d+)["']?/i);
  const width = matchW ? Number(matchW[1]) : 1920;
  const height = matchH ? Number(matchH[1]) : 1080;
  return { width, height };
}

export function detectShape({ width, height }) {
  if (width === height) return "square";
  if (height > width) return "upright";
  return "wide";
}

export function shapesOffered(dir) {
  const shape = detectShape(readProjectSize(dir));
  if (shape === "upright") return ["square"];
  if (shape === "square") return ["upright"];
  return ["upright", "square"];
}
export const offeredShapes = shapesOffered;

export function preparedRequest({ sourceName, shape, sourceShape = "wide" }) {
  const sourceKind = sourceShape === "square" ? "square" : sourceShape === "upright" ? "upright" : "wide";
  if (shape === "upright") {
    return (
      `This is a copy of the ${sourceKind} video ${sourceName}. Turn it into the upright version for phones: ` +
      "1080 by 1920, same length, same story and moments at the same times, same words, music and ending. " +
      "Do not squeeze or crop: adapt the layout (words in the upper third, the main subject larger and centred, " +
      "nothing important within 160 px of the top, 320 px of the bottom or 60 px of the sides). " +
      "Read .hyperframes/MOTION_GUIDE.md first. Check with look_at_video at several moments, fix once, " +
      "and tell me what you changed."
    );
  }
  if (shape === "square") {
    return (
      `This is a copy of the ${sourceKind} video ${sourceName}. Turn it into the square version: ` +
      "1080 by 1080, same length, same story and moments at the same times, same words, music and ending. " +
      "Do not squeeze or crop: adapt the layout (words in the upper third, the main subject larger and centred, " +
      "nothing important within 54 px of the edges, about 5%). " +
      "Read .hyperframes/MOTION_GUIDE.md first. Check with look_at_video at several moments, fix once, " +
      "and tell me what you changed."
    );
  }
  throw new Error(say("The shape “{shape}” is not known to this app.", { shape: String(shape) }));
}

function place(source, target, stat) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  try {
    fs.linkSync(source, target);
    return;
  } catch {
    // Fall through to a copy when hard-links fail (e.g. cross-drive or unsupported filesystem).
  }
  fs.copyFileSync(source, target);
  fs.utimesSync(target, stat.atimeMs / 1000, stat.mtimeMs / 1000);
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
    for (const name of fs.readdirSync(from)) {
      if (!name.startsWith(".")) copyTree(path.join(from, name), path.join(to, name));
    }
  } else if (stat.isFile()) {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
}

function listAssets(sourceDir) {
  let root;
  try {
    root = fs.realpathSync.native(sourceDir);
  } catch {
    root = path.resolve(sourceDir);
  }
  const assetsFolder = path.join(sourceDir, "assets");
  let assetsStat;
  try {
    assetsStat = fs.lstatSync(assetsFolder);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  if (assetsStat.isSymbolicLink()) {
    let realAssets;
    try {
      realAssets = fs.realpathSync.native(assetsFolder);
    } catch {
      realAssets = null;
    }
    if (!realAssets || !within(root, realAssets)) {
      throw new Error(say("A link in the assets folder leads outside this video."));
    }
    return [];
  }
  if (!assetsStat.isDirectory()) return [];

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
      if (stat.isSymbolicLink()) {
        let real;
        try {
          real = fs.realpathSync.native(full);
        } catch {
          real = null;
        }
        if (!real || !within(root, real)) {
          throw new Error(say("A link in the assets folder leads outside this video."));
        }
        continue;
      }
      if (stat.isDirectory()) {
        if (!name.startsWith(".")) walk(full, [...parts, name]);
      } else if (stat.isFile()) {
        found.push({ full, parts: [...parts, name], stat });
      }
    }
  };
  walk(assetsFolder, ["assets"]);
  return found;
}

export function candidateFolderName(sourceDir, shape, index = 1) {
  const base = `${path.basename(sourceDir)}-${shape}`;
  return index === 1 ? base : `${base}-${index}`;
}

function makeFolder(parentDir, sourceDir, shape) {
  fs.mkdirSync(parentDir, { recursive: true });
  for (let n = 1; n <= MAX_TRIES; n++) {
    const candidate = path.resolve(parentDir, candidateFolderName(sourceDir, shape, n));
    try {
      // Exclusive creation: an existing folder fails so nothing is ever overwritten.
      fs.mkdirSync(candidate);
      return candidate;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
  }
  throw new Error(say("There are already too many folders with this name beside the video."));
}

export function makeOtherSizeProject(
  sourceDir, shape, { parentDir = path.dirname(sourceDir), orderIndex = 0 } = {},
) {
  checkSource(sourceDir);
  if (!SHAPES.includes(shape)) {
    throw new Error(say("The shape “{shape}” is not known to this app.", { shape: String(shape) }));
  }
  const target = makeFolder(parentDir, sourceDir, shape);
  try {
    const sourceIndex = path.join(sourceDir, "index.html");
    const targetIndex = path.join(target, "index.html");
    fs.copyFileSync(sourceIndex, targetIndex);

    const compositions = path.join(sourceDir, "compositions");
    if (fs.existsSync(compositions)) {
      copyTree(compositions, path.join(target, "compositions"));
    }

    const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const name = entry.name;
      if (name.startsWith(".") || name === "meta.json" || name === "index.html") continue;
      if (TEXT_FILE.test(name)) {
        fs.copyFileSync(path.join(sourceDir, name), path.join(target, name));
      }
    }

    for (const asset of listAssets(sourceDir)) {
      place(asset.full, path.join(target, ...asset.parts), asset.stat);
    }

    const sourceName = nameOf(sourceDir);
    const newName = `${sourceName} (${shape})`;
    writeJson(path.join(target, "meta.json"), {
      id: path.basename(target),
      name: newName,
      createdAt: new Date().toISOString(),
    });

    const sourceStat = fs.statSync(sourceIndex);
    const offsetSeconds = orderIndex + 1;
    fs.utimesSync(
      targetIndex,
      (sourceStat.atimeMs / 1000) - offsetSeconds,
      (sourceStat.mtimeMs / 1000) - offsetSeconds,
    );

    const sourceShape = detectShape(readProjectSize(sourceDir));
    const request = preparedRequest({ sourceName, shape, sourceShape });

    return { dir: target, shape, name: newName, request };
  } catch (error) {
    fs.rmSync(target, { recursive: true, force: true });
    throw error;
  }
}

export function makeOtherSizes(sourceDir, shapes, options = {}) {
  checkSource(sourceDir);
  if (!Array.isArray(shapes) || shapes.length === 0) {
    throw new Error(say("Choose at least one size to make."));
  }
  for (const shape of shapes) {
    if (!SHAPES.includes(shape)) {
      throw new Error(say("The shape “{shape}” is not known to this app.", { shape: String(shape) }));
    }
  }
  return shapes.map((shape, i) =>
    makeOtherSizeProject(sourceDir, shape, { ...options, orderIndex: i })
  );
}
