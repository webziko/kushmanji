// "Make other sizes" of a video (otherSizes.js): making upright and square project copies
// beside the source video, hard-linking or copying assets, copying compositions and text files,
// and preparing layout requests for the assistant without touching the source video.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  candidateFolderName,
  detectShape,
  makeOtherSizeProject,
  makeOtherSizes,
  offeredShapes,
  preparedRequest,
  readProjectSize,
  SHAPES,
  shapesOffered,
} from "../src/main/otherSizes.js";

const MTIME = new Date(Date.UTC(2026, 3, 15, 10, 20, 30));

function tempRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hfwin sizes é "));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function put(file, content = "data") {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  fs.utimesSync(file, MTIME, MTIME);
}

function listing(dir) {
  const out = [];
  const walk = (folderPath, prefix) => {
    for (const name of fs.readdirSync(folderPath).sort()) {
      const full = path.join(folderPath, name);
      const stat = fs.lstatSync(full);
      out.push(`${prefix}${name}|${stat.isDirectory() ? "dir" : stat.size}|${stat.mtimeMs}`);
      if (stat.isDirectory()) walk(full, `${prefix}${name}/`);
    }
  };
  walk(dir, "");
  return out;
}

function sampleProject(t, { name = "City Vlog", width = 1920, height = 1080 } = {}) {
  const root = tempRoot(t);
  const dir = path.join(root, name);
  const html = "<!DOCTYPE html><html><head></head><body>" +
    `<div id="root" data-width="${width}" data-height="${height}"></div></body></html>`;
  put(path.join(dir, "index.html"), html);
  put(path.join(dir, "meta.json"), JSON.stringify({
    id: "vlog-id",
    name,
    createdAt: "2026-01-01T00:00:00.000Z",
  }));
  put(path.join(dir, "STYLE.md"), "# Style\nWarm aesthetic.");
  put(path.join(dir, "BRAND.md"), "# Brand\nCity life.");
  put(path.join(dir, "BRIEF.md"), "# Brief\nWeekend trip.");
  put(path.join(dir, "DESIGN.md"), "# Design\nClean layout.");
  put(path.join(dir, "STORYBOARD.md"), "# Storyboard\nIntro -> Main -> Outro.");
  put(path.join(dir, "script.txt"), "Welcome to the city.");
  put(path.join(dir, "compositions", "main.html"), "<div class=\"scene\"></div>");
  put(path.join(dir, "compositions", "sub", "lowerThird.json"), "{\"title\":\"welcome\"}");
  put(path.join(dir, "assets", "video.mp4"), "video binary data");
  put(path.join(dir, "assets", "music", "track.mp3"), "audio binary data");
  put(path.join(dir, ".hyperframes", "study", "index.json"), "{\"study\":\"data\"}");
  put(path.join(dir, ".hyperframes", "MOTION_GUIDE.md"), "# Guide");
  put(path.join(dir, ".cache", "cover.jpg"), "cached image");
  return { root, dir, name };
}

test("detectShape and readProjectSize identify wide, upright and square videos", (t) => {
  const { dir: wideDir } = sampleProject(t, { width: 1920, height: 1080 });
  const wideSize = readProjectSize(wideDir);
  assert.deepEqual(wideSize, { width: 1920, height: 1080 });
  assert.equal(detectShape(wideSize), "wide");
  assert.deepEqual(shapesOffered(wideDir), ["upright", "square"]);
  assert.deepEqual(offeredShapes(wideDir), ["upright", "square"]);

  const { dir: uprightDir } = sampleProject(t, { width: 1080, height: 1920 });
  const uprightSize = readProjectSize(uprightDir);
  assert.deepEqual(uprightSize, { width: 1080, height: 1920 });
  assert.equal(detectShape(uprightSize), "upright");
  assert.deepEqual(shapesOffered(uprightDir), ["square"]);

  const { dir: squareDir } = sampleProject(t, { width: 1080, height: 1080 });
  const squareSize = readProjectSize(squareDir);
  assert.deepEqual(squareSize, { width: 1080, height: 1080 });
  assert.equal(detectShape(squareSize), "square");
  assert.deepEqual(shapesOffered(squareDir), ["upright"]);
});

test("candidateFolderName produces names and suffixes for collisions", () => {
  const source = "C:\\Projects\\Summer Vacation";
  assert.equal(candidateFolderName(source, "upright", 1), "Summer Vacation-upright");
  assert.equal(candidateFolderName(source, "upright", 2), "Summer Vacation-upright-2");
  assert.equal(candidateFolderName(source, "square", 1), "Summer Vacation-square");
  assert.equal(candidateFolderName(source, "square", 5), "Summer Vacation-square-5");
});

test("preparedRequest contains exact safe margins and dimensions for upright and square", () => {
  const uprightReq = preparedRequest({ sourceName: "City Vlog", shape: "upright", sourceShape: "wide" });
  assert.ok(uprightReq.includes("This is a copy of the wide video City Vlog."));
  assert.ok(uprightReq.includes("1080 by 1920"));
  assert.ok(uprightReq.includes("words in the upper third, the main subject larger and centred"));
  // The same zones as the editing and motion guides: where Shorts and Reels put their buttons.
  assert.ok(uprightReq.includes("220 px of the top, 420 px of the bottom, 140 px of the right or 60 px of the left"));
  assert.ok(uprightReq.includes(".hyperframes/MOTION_GUIDE.md"));
  assert.ok(uprightReq.includes("look_at_video"));

  const squareReq = preparedRequest({ sourceName: "City Vlog", shape: "square", sourceShape: "wide" });
  assert.ok(squareReq.includes("This is a copy of the wide video City Vlog."));
  assert.ok(squareReq.includes("1080 by 1080"));
  assert.ok(squareReq.includes("words in the upper third, the main subject larger and centred"));
  assert.ok(squareReq.includes("54 px of the edges, about 5%"));
  assert.ok(squareReq.includes(".hyperframes/MOTION_GUIDE.md"));

  assert.throws(
    () => preparedRequest({ sourceName: "City Vlog", shape: "panoramic" }),
    /The shape “panoramic” is not known to this app\./,
  );
});

test("makeOtherSizeProject copies compositions, plain text files, links assets, and excludes cache", (t) => {
  const { dir } = sampleProject(t);
  const beforeSource = listing(dir);

  const made = makeOtherSizeProject(dir, "upright");
  assert.equal(made.shape, "upright");
  assert.equal(made.name, "City Vlog (upright)");
  assert.ok(fs.existsSync(made.dir));
  assert.equal(path.basename(made.dir), "City Vlog-upright");

  // Source directory was never changed
  assert.deepEqual(listing(dir), beforeSource);

  // Text files and compositions are copied
  assert.ok(fs.existsSync(path.join(made.dir, "index.html")));
  assert.equal(fs.readFileSync(path.join(made.dir, "STYLE.md"), "utf8"), "# Style\nWarm aesthetic.");
  assert.equal(fs.readFileSync(path.join(made.dir, "BRAND.md"), "utf8"), "# Brand\nCity life.");
  assert.equal(fs.readFileSync(path.join(made.dir, "BRIEF.md"), "utf8"), "# Brief\nWeekend trip.");
  assert.equal(fs.readFileSync(path.join(made.dir, "DESIGN.md"), "utf8"), "# Design\nClean layout.");
  assert.equal(fs.readFileSync(path.join(made.dir, "STORYBOARD.md"), "utf8"), "# Storyboard\nIntro -> Main -> Outro.");
  assert.equal(fs.readFileSync(path.join(made.dir, "script.txt"), "utf8"), "Welcome to the city.");
  assert.equal(fs.readFileSync(path.join(made.dir, "compositions", "main.html"), "utf8"), "<div class=\"scene\"></div>");
  assert.equal(
    fs.readFileSync(path.join(made.dir, "compositions", "sub", "lowerThird.json"), "utf8"),
    "{\"title\":\"welcome\"}",
  );

  // Assets exist
  assert.equal(fs.readFileSync(path.join(made.dir, "assets", "video.mp4"), "utf8"), "video binary data");
  assert.equal(fs.readFileSync(path.join(made.dir, "assets", "music", "track.mp3"), "utf8"), "audio binary data");

  // .hyperframes and .cache are NOT copied
  assert.ok(!fs.existsSync(path.join(made.dir, ".hyperframes")));
  assert.ok(!fs.existsSync(path.join(made.dir, ".cache")));

  // meta.json is customized
  const meta = JSON.parse(fs.readFileSync(path.join(made.dir, "meta.json"), "utf8"));
  assert.equal(meta.name, "City Vlog (upright)");
  assert.equal(meta.id, "City Vlog-upright");
  assert.ok(meta.createdAt);

  // Target index.html mtime is adjusted to sort after source on Home
  const sourceMtime = fs.statSync(path.join(dir, "index.html")).mtimeMs;
  const targetMtime = fs.statSync(path.join(made.dir, "index.html")).mtimeMs;
  assert.ok(targetMtime < sourceMtime, "target index.html mtime is earlier so it appears after source");
});

test("makeOtherSizeProject numbers the folder when taken, never overwriting", (t) => {
  const { root, dir } = sampleProject(t);
  const firstTarget = path.join(root, "City Vlog-upright");
  put(path.join(firstTarget, "index.html"), "existing");

  const made = makeOtherSizeProject(dir, "upright");
  assert.equal(path.basename(made.dir), "City Vlog-upright-2");
  assert.equal(fs.readFileSync(path.join(firstTarget, "index.html"), "utf8"), "existing");
});

test("makeOtherSizes creates projects for multiple shapes", (t) => {
  const { dir } = sampleProject(t);
  const result = makeOtherSizes(dir, ["upright", "square"]);
  assert.equal(result.length, 2);
  assert.equal(result[0].shape, "upright");
  assert.equal(result[0].name, "City Vlog (upright)");
  assert.equal(result[1].shape, "square");
  assert.equal(result[1].name, "City Vlog (square)");

  assert.ok(fs.existsSync(result[0].dir));
  assert.ok(fs.existsSync(result[1].dir));

  // The second one's mtime is adjusted after the first
  const mtime1 = fs.statSync(path.join(result[0].dir, "index.html")).mtimeMs;
  const mtime2 = fs.statSync(path.join(result[1].dir, "index.html")).mtimeMs;
  assert.ok(mtime2 < mtime1, "second project mtime is ordered after first");
});

test("refusals: invalid source, unknown shapes, empty shapes", (t) => {
  const { dir } = sampleProject(t);

  assert.throws(
    () => makeOtherSizes(dir, []),
    /Choose at least one size to make\./,
  );
  assert.throws(
    () => makeOtherSizes(dir, ["wide"]),
    /The shape “wide” is not known to this app\./,
  );
  assert.throws(
    () => makeOtherSizes("C:\\does-not-exist", ["upright"]),
    /The video's folder could not be found\./,
  );
  assert.throws(
    () => makeOtherSizeProject(dir, "panoramic"),
    /The shape “panoramic” is not known to this app\./,
  );
});

test("refusals: symlink in assets folder leading outside the project", (t) => {
  const { root, dir } = sampleProject(t);
  const outsideFile = path.join(root, "outside.txt");
  put(outsideFile, "secret");

  const symlinkPath = path.join(dir, "assets", "outside_link.txt");
  try {
    fs.symlinkSync(outsideFile, symlinkPath);
  } catch {
    // If symlinks cannot be created on Windows without elevation, test passes gracefully
    return;
  }

  assert.throws(
    () => makeOtherSizeProject(dir, "upright"),
    /A link in the assets folder leads outside this video\./,
  );
});

test("refusals: folder name collision limit reached", (t) => {
  const { root, dir } = sampleProject(t);
  // Pre-create 50 collisions
  put(path.join(root, "City Vlog-upright", "index.html"), "x");
  for (let i = 2; i <= 50; i++) {
    put(path.join(root, `City Vlog-upright-${i}`, "index.html"), "x");
  }

  assert.throws(
    () => makeOtherSizeProject(dir, "upright"),
    /There are already too many folders with this name beside the video\./,
  );
});
