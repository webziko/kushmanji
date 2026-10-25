// "Draw on the picture" (drawings.js, M3-05): the box the page names, the file name, the folder kept to fifty, and a
// project folder that cannot be written. The picture is a small stand-in for Electron's NativeImage, and the window
// for the BrowserWindow: nothing here needs a screen.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  captureDrawing, drawingName, KEEP, NOTES_FOLDER, pruneDrawings, saveDrawing, stampOf,
} from "../src/main/drawings.js";

function project(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hfwin drawing é "));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
const notes = (dir) => path.join(dir, ...NOTES_FOLDER);
const AT = new Date(2026, 9, 25, 9, 15, 0); // 25 October 2026, 09:15:00 on the person's clock

/** What `saveDrawing` asks of a NativeImage: isEmpty, getSize, resize and toPNG. */
const picture = ({ empty = false, width = 900, png = Buffer.from("png bytes") } = {}) => {
  const made = { resizedTo: null };
  const image = {
    made,
    isEmpty: () => empty,
    getSize: () => ({ width, height: Math.round(width * 9 / 16) }),
    resize: ({ width: to }) => { made.resizedTo = to; return picture({ width: to, png }); },
    toPNG: () => png,
  };
  return image;
};

/** The window `captureDrawing` asks of: its content size, and a page that hands back `image` for the box it is given. */
const windowFor = (image, { width = 1440, height = 900 } = {}) => {
  const seen = { boxes: [] };
  return {
    seen,
    getContentBounds: () => ({ x: 10, y: 20, width, height }),
    webContents: { capturePage: async (box) => { seen.boxes.push(box); return image; } },
  };
};

test("the name is the person's own clock to the second, in the form drawing-YYYYMMDD-HHMMSS.png", () => {
  assert.equal(stampOf(AT), "20261025-091500");
  assert.equal(drawingName(AT), "drawing-20261025-091500.png");
  assert.equal(drawingName(AT, 2), "drawing-20261025-091500-2.png");
  assert.equal(drawingName(new Date(2027, 0, 3, 4, 5, 6)), "drawing-20270103-040506.png");
});

test("a drawing is kept in .hyperframes/notes and its path inside the project comes back with forward slashes", (t) => {
  const dir = project(t);
  const got = saveDrawing(dir, picture({ png: Buffer.from("the frame and the marks") }), { now: AT });
  assert.equal(got, ".hyperframes/notes/drawing-20261025-091500.png");
  assert.equal(fs.readFileSync(path.join(dir, ...got.split("/")), "utf8"), "the frame and the marks");
  assert.deepEqual(fs.readdirSync(notes(dir)), ["drawing-20261025-091500.png"], "no temporary file is left");
});

test("two drawings in the same second do not replace each other", (t) => {
  const dir = project(t);
  assert.equal(saveDrawing(dir, picture({ png: Buffer.from("one") }), { now: AT }), ".hyperframes/notes/drawing-20261025-091500.png");
  assert.equal(saveDrawing(dir, picture({ png: Buffer.from("two") }), { now: AT }), ".hyperframes/notes/drawing-20261025-091500-2.png");
  assert.equal(fs.readFileSync(path.join(notes(dir), "drawing-20261025-091500.png"), "utf8"), "one");
  assert.equal(fs.readFileSync(path.join(notes(dir), "drawing-20261025-091500-2.png"), "utf8"), "two");
});

test("a picture wider than 1600 pixels is made smaller; one that is not is kept as it was", (t) => {
  const dir = project(t);
  const wide = picture({ width: 2800 });
  saveDrawing(dir, wide, { now: AT });
  assert.equal(wide.made.resizedTo, 1600);
  const narrow = picture({ width: 1600 });
  saveDrawing(dir, narrow, { now: new Date(AT.getTime() + 1000) });
  assert.equal(narrow.made.resizedTo, null);
});

test("an empty picture, or one with no bytes, writes nothing, not even the folder", (t) => {
  const dir = project(t);
  for (const bad of [picture({ empty: true }), picture({ png: Buffer.alloc(0) }), null]) {
    assert.throws(() => saveDrawing(dir, bad, { now: AT }), /The picture could not be taken/);
  }
  assert.equal(fs.existsSync(path.join(dir, ".hyperframes")), false);
});

test("the folder keeps the newest 50 drawings and removes the oldest, and nothing it did not make", (t) => {
  const dir = project(t);
  fs.mkdirSync(notes(dir), { recursive: true });
  const old = [];
  for (let i = 0; i < KEEP; i++) {
    const name = drawingName(new Date(2026, 9, 1, 8, 0, i));
    old.push(name);
    fs.writeFileSync(path.join(notes(dir), name), "old");
  }
  // Other things a person or an assistant keeps there are not the app's to remove.
  for (const own of ["README.txt", "drawing-by-hand.png", "drawing-20261001-080000.png.bak", "notes.json"])
    fs.writeFileSync(path.join(notes(dir), own), "mine");
  fs.mkdirSync(path.join(notes(dir), "drawing-20200101-000000.png"));

  const got = saveDrawing(dir, picture(), { now: AT });
  const left = fs.readdirSync(notes(dir)).filter((name) => /^drawing-\d{8}-\d{6}(-\d+)?\.png$/.test(name) &&
    fs.statSync(path.join(notes(dir), name)).isFile());
  assert.equal(left.length, KEEP);
  assert.ok(left.includes(path.basename(got)), "the drawing just made stays");
  assert.ok(!left.includes(old[0]), "the oldest one went");
  assert.ok(left.includes(old[1]) && left.includes(old.at(-1)));
  for (const own of ["README.txt", "drawing-by-hand.png", "drawing-20261001-080000.png.bak", "notes.json", "drawing-20200101-000000.png"])
    assert.ok(fs.existsSync(path.join(notes(dir), own)), `${own} is not touched`);
});

test("older drawings are judged by the time in the name, with the copy number inside a second", (t) => {
  const dir = project(t);
  fs.mkdirSync(notes(dir), { recursive: true });
  const names = ["drawing-20261025-091500-2.png", "drawing-20261025-091500.png", "drawing-20261025-091500-3.png", "drawing-20261025-091459.png"];
  for (const name of names) fs.writeFileSync(path.join(notes(dir), name), "x");
  pruneDrawings(notes(dir), { keep: 2 });
  assert.deepEqual(fs.readdirSync(notes(dir)).sort(), ["drawing-20261025-091500-2.png", "drawing-20261025-091500-3.png"]);
});

test("the drawing just saved is never the one removed, even when the clock went backwards", (t) => {
  const dir = project(t);
  fs.mkdirSync(notes(dir), { recursive: true });
  fs.writeFileSync(path.join(notes(dir), "drawing-20270101-000000.png"), "later");
  fs.writeFileSync(path.join(notes(dir), "drawing-20261025-091500.png"), "now");
  pruneDrawings(notes(dir), { keep: 1, except: "drawing-20261025-091500.png" });
  assert.ok(fs.existsSync(path.join(notes(dir), "drawing-20261025-091500.png")));
});

test("a file that cannot be removed does not stop the drawing being saved", (t) => {
  const dir = project(t);
  fs.mkdirSync(notes(dir), { recursive: true });
  for (let i = 0; i < KEEP; i++) fs.writeFileSync(path.join(notes(dir), drawingName(new Date(2026, 9, 1, 8, 0, i))), "old");
  const unlink = fs.unlinkSync;
  fs.unlinkSync = () => { throw Object.assign(new Error("EBUSY: resource busy or locked"), { code: "EBUSY" }); };
  try {
    assert.equal(saveDrawing(dir, picture(), { now: AT }), ".hyperframes/notes/drawing-20261025-091500.png");
  } finally {
    fs.unlinkSync = unlink;
  }
});

test("when Windows will not rename the temporary file into place, the drawing is still kept and the temporary file goes", (t) => {
  const dir = project(t);
  const rename = fs.renameSync;
  fs.renameSync = () => { throw Object.assign(new Error("EPERM: operation not permitted, rename"), { code: "EPERM" }); };
  try {
    saveDrawing(dir, picture({ png: Buffer.from("kept") }), { now: AT });
  } finally {
    fs.renameSync = rename;
  }
  assert.deepEqual(fs.readdirSync(notes(dir)), ["drawing-20261025-091500.png"]);
  assert.equal(fs.readFileSync(path.join(notes(dir), "drawing-20261025-091500.png"), "utf8"), "kept");
});

test("a project folder that cannot be written says so in a sentence, and leaves nothing behind", (t) => {
  const dir = project(t);
  // A file where the hidden folder should be: the folder cannot be made.
  fs.writeFileSync(path.join(dir, ".hyperframes"), "not a folder");
  assert.throws(() => saveDrawing(dir, picture(), { now: AT }), /The drawing could not be saved in this video's folder\./);
  assert.equal(fs.readFileSync(path.join(dir, ".hyperframes"), "utf8"), "not a folder");

  const gone = path.join(os.tmpdir(), "hfwin drawing missing é ", "nowhere");
  assert.throws(() => saveDrawing(gone, picture(), { now: AT }), /could not be saved in this video's folder/);
});

test("a write that fails half way leaves no temporary file", (t) => {
  const dir = project(t);
  const write = fs.writeFileSync;
  fs.writeFileSync = (file, ...rest) => {
    write(file, "half");
    throw Object.assign(new Error("ENOSPC: no space left on device"), { code: "ENOSPC" });
  };
  try {
    assert.throws(() => saveDrawing(dir, picture(), { now: AT }), /could not be saved in this video's folder/);
  } finally {
    fs.writeFileSync = write;
  }
  assert.deepEqual(fs.readdirSync(notes(dir)), []);
});

test("a hidden folder that is really a link leading out of the project is not written through", (t) => {
  const dir = project(t);
  const elsewhere = project(t);
  try {
    fs.symlinkSync(elsewhere, path.join(dir, ".hyperframes"), "junction");
  } catch {
    t.skip("this computer does not allow links");
    return;
  }
  assert.throws(() => saveDrawing(dir, picture(), { now: AT }), /could not be saved in this video's folder/);
  assert.deepEqual(fs.readdirSync(elsewhere), [], "nothing was made on the other side of the link");
});

test("the page names a box, which is kept inside the window; the picture of that box is what is saved", async (t) => {
  const dir = project(t);
  const win = windowFor(picture({ png: Buffer.from("from the window") }));
  const got = await captureDrawing(win, dir, { x: 24.4, y: 103, width: 1018, height: 643 }, { now: AT });
  assert.equal(got, ".hyperframes/notes/drawing-20261025-091500.png");
  assert.deepEqual(win.seen.boxes, [{ x: 24, y: 103, width: 1018, height: 643 }]);
  assert.equal(fs.readFileSync(path.join(dir, ...got.split("/")), "utf8"), "from the window");

  // A box that runs off the window is cut to it, as for Home's cover.
  await captureDrawing(win, dir, { x: -50, y: 800, width: 2000, height: 400 }, { now: new Date(AT.getTime() + 1000) });
  assert.deepEqual(win.seen.boxes[1], { x: 0, y: 800, width: 1440, height: 100 });
});

test("a box that is not a usable box takes no picture and writes nothing", async (t) => {
  const dir = project(t);
  const win = windowFor(picture());
  for (const rect of [null, undefined, "box", {}, { x: "a", y: 0, width: 400, height: 400 }, { x: 0, y: 0, width: 20, height: 400 },
    { x: 5000, y: 0, width: 400, height: 400 }, { x: 0, y: 0, width: Infinity, height: NaN }]) {
    await assert.rejects(captureDrawing(win, dir, rect, { now: AT }), /The picture is not on the screen/);
  }
  await assert.rejects(captureDrawing(null, dir, { x: 0, y: 0, width: 400, height: 400 }), /The picture is not on the screen/);
  assert.deepEqual(win.seen.boxes, []);
  assert.equal(fs.existsSync(path.join(dir, ".hyperframes")), false);
});

test("a window that gives back nothing (hidden, or the screen is locked) is said in a sentence", async (t) => {
  const dir = project(t);
  const win = windowFor(picture({ empty: true }));
  await assert.rejects(captureDrawing(win, dir, { x: 0, y: 0, width: 400, height: 400 }, { now: AT }), /The picture could not be taken/);
  assert.equal(fs.existsSync(path.join(dir, ".hyperframes")), false);
});
