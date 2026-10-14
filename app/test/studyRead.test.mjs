import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";

let root;
let read;
beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "hfwin study review "));
  fs.mkdirSync(path.join(root, ".hyperframes", "study", "clip"), { recursive: true });
  read = (await import("../src/main/studyRead.js").catch(() => ({}))).readClipStudy;
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
function index(clip) {
  fs.writeFileSync(path.join(root, ".hyperframes", "study", "index.json"), JSON.stringify({ clips: [clip] }));
}
test("a saved clip can be reviewed with its frame sheet and readable transcript", () => {
  index({ file: "assets/clip.mp4", seconds: 12, width: 1920, height: 1080,
    sheets: [{ file: ".hyperframes/study/clip/sheet.jpg" }],
    transcript: { text: ".hyperframes/study/clip/transcript.txt", languageSure: false } });
  fs.writeFileSync(path.join(root, ".hyperframes", "study", "clip", "sheet.jpg"), "picture bytes");
  fs.writeFileSync(path.join(root, ".hyperframes", "study", "clip", "transcript.txt"), "[0:00 - 0:03] Hello");
  assert.equal(typeof read, "function", "saved study reader is available");
  const clip = read(root, "assets/clip.mp4");
  assert.equal(clip.seconds, 12);
  assert.match(clip.images[0], /^data:image\/jpeg;base64,/);
  assert.match(clip.text, /Hello/);
  assert.equal(clip.languageSure, false);
});

test("a project opened through a Windows junction still has its own saved review", (t) => {
  const alias = `${root}-alias`;
  try { fs.symlinkSync(root, alias, "junction"); }
  catch { return t.skip("junction not available"); }
  try {
    index({ file: "assets/clip.mp4", sheets: [], transcript: null, seconds: 5 });
    assert.equal(read(alias, "assets/clip.mp4").seconds, 5);
  } finally { fs.rmdirSync(alias); }
});

test("all saved sheets of a long clip are available for review", () => {
  const folder = ".hyperframes/study/clip";
  for (const name of ["first.jpg", "last.jpg"]) fs.writeFileSync(path.join(root, folder, name), name);
  index({ file: "assets/long.mp4", sheets: [{ file: `${folder}/first.jpg` }, { file: `${folder}/last.jpg` }] });
  assert.equal(read(root, "assets/long.mp4").images.length, 2);
});
test("a project record cannot expose a file outside the saved study", () => {
  const secret = path.join(root, "private.txt");
  fs.writeFileSync(secret, "secret");
  index({ file: "assets/clip.mp4", sheets: [], transcript: { text: "private.txt" } });
  assert.equal(typeof read, "function");
  assert.throws(() => read(root, "assets/clip.mp4"), /cannot show what it saw/);
});
test("a link in the study cannot expose a file outside the project", (t) => {
  const elsewhere = path.join(root, "elsewhere");
  fs.mkdirSync(elsewhere);
  fs.writeFileSync(path.join(elsewhere, "private.txt"), "secret");
  try { fs.symlinkSync(elsewhere, path.join(root, ".hyperframes", "study", "linked"), "junction"); }
  catch { return t.skip("junction not available"); }
  index({ file: "assets/clip.mp4", sheets: [], transcript: { text: ".hyperframes/study/linked/private.txt" } });
  assert.equal(typeof read, "function");
  assert.throws(() => read(root, "assets/clip.mp4"), /cannot show what it saw/);
});
