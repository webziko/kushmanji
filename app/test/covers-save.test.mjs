// Home's picture of each video (covers.js), the half covers.test.mjs leaves out: writing `cover.jpg` and reading it
// back. The picture is a small stand-in for Electron's NativeImage.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { coverFile, readCover, saveCover } from "../src/main/covers.js";

function project(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hfwin cover é "));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** What `saveCover` asks of a NativeImage: isEmpty, resize, toBitmap, toJPEG. */
const picture = ({ empty = false, brightness = 120, jpeg = Buffer.from("jpeg bytes") } = {}) => ({
  isEmpty: () => empty,
  resize: () => ({ toBitmap: () => Buffer.alloc(480 * 270 * 4, brightness), toJPEG: () => jpeg }),
});

test("a good picture is kept as .cache/kushmanji-preview/cover.jpg, with no temporary file left", (t) => {
  const dir = project(t);
  assert.equal(saveCover(dir, picture()), true);
  assert.equal(coverFile(dir), path.join(dir, ".cache", "kushmanji-preview", "cover.jpg"));
  assert.equal(fs.readFileSync(coverFile(dir), "utf8"), "jpeg bytes");
  assert.deepEqual(fs.readdirSync(path.dirname(coverFile(dir))), ["cover.jpg"]);
});

test("an empty or nearly black picture writes nothing, not even the folder", (t) => {
  const dir = project(t);
  assert.equal(saveCover(dir, picture({ empty: true })), false);
  assert.equal(saveCover(dir, picture({ brightness: 3 })), false);
  assert.equal(saveCover(dir, null), false);
  assert.equal(fs.existsSync(path.join(dir, ".cache")), false);
});

test("a newer picture replaces the older one", (t) => {
  const dir = project(t);
  saveCover(dir, picture({ jpeg: Buffer.from("one") }));
  saveCover(dir, picture({ jpeg: Buffer.from("two") }));
  assert.equal(fs.readFileSync(coverFile(dir), "utf8"), "two");
});

test("when Windows will not rename over the old picture, it is still replaced and the temporary file goes", (t) => {
  const dir = project(t);
  saveCover(dir, picture({ jpeg: Buffer.from("old") }));
  const rename = fs.renameSync;
  fs.renameSync = () => { throw Object.assign(new Error("EPERM: operation not permitted, rename"), { code: "EPERM" }); };
  try {
    assert.equal(saveCover(dir, picture({ jpeg: Buffer.from("new") })), true);
  } finally {
    fs.renameSync = rename;
  }
  assert.equal(fs.readFileSync(coverFile(dir), "utf8"), "new");
  assert.deepEqual(fs.readdirSync(path.dirname(coverFile(dir))), ["cover.jpg"]);
});

test("the picture is read back as a data address Home's page may show", (t) => {
  const dir = project(t);
  assert.equal(readCover(dir), null, "no picture yet");
  saveCover(dir, picture({ jpeg: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) }));
  assert.equal(readCover(dir), `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString("base64")}`);
});

test("a picture that is too large, or is really a folder, is not sent to the page", (t) => {
  const dir = project(t);
  fs.mkdirSync(path.dirname(coverFile(dir)), { recursive: true });
  fs.writeFileSync(coverFile(dir), Buffer.alloc(400_001));
  assert.equal(readCover(dir), null);
  fs.rmSync(coverFile(dir));
  fs.mkdirSync(coverFile(dir));
  assert.equal(readCover(dir), null);
});

test("a project folder that has gone is simply without a picture", () => {
  assert.equal(readCover(path.join(os.tmpdir(), "hfwin cover missing é ", "nowhere")), null);
});
