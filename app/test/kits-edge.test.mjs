// Saved looks (kits.js), the corners kits.test.mjs does not reach: names Windows refuses, names that try to climb out
// of the looks folder, very large or missing files, and using a look more than once.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { hasStyle, kitFileName, listKits, saveKit, STYLE_FILE, useKit } from "../src/main/kits.js";

function place(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hfwin kits é "));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const looks = path.join(root, "looks");
  const video = path.join(root, "A video");
  fs.mkdirSync(video);
  const other = path.join(root, "Another video");
  fs.mkdirSync(other);
  return { root, looks, video, other };
}

test("every name Windows keeps for a device gets a suffix, in any letter case", () => {
  for (const name of ["con", "PRN", "Aux", "NUL", "com1", "COM9", "lpt3"]) {
    assert.match(kitFileName(name), / look\.md$/, name);
  }
  assert.equal(kitFileName("console"), "console.md");
  assert.equal(kitFileName("com10"), "com10.md");
});

test("a name can never leave the looks folder or hide in a stream or a drive", () => {
  for (const name of ["..\\..\\x", "../../x", "C:\\Windows\\x", "x:y", "a/b", "a\\b", "x.md", "~/x", "%APPDATA%"]) {
    const file = kitFileName(name);
    assert.equal(path.basename(file), file, `${name} -> ${file}`);
    assert.match(file, /^[\p{L}\p{M}\p{N} _-]+\.md$/u, `${name} -> ${file}`);
  }
});

test("a long name is cut to sixty characters", () => {
  assert.ok(kitFileName("a".repeat(100)).length <= 63);
});

test("a look with a long name can be used again from the list after it is saved", (t) => {
  const { looks, video, other } = place(t);
  fs.writeFileSync(path.join(video, STYLE_FILE), "x");
  saveKit(looks, video, `${"a".repeat(59)} b`);
  const [{ name }] = listKits(looks);
  assert.doesNotThrow(() => useKit(looks, other, name));
});

test("a name of marks and symbols only is refused in plain words", () => {
  for (const name of ["", "   ", "!!!", "....", null, undefined]) {
    assert.throws(() => kitFileName(name), /Give the look a name/);
  }
});

test("two spellings of one name (decomposed and composed letters) are one look", () => {
  assert.equal(kitFileName("Cafe\u0301"), kitFileName("Caf\u00e9"));
});

test("a look that is too large is refused on the way in and on the way out", (t) => {
  const { looks, video, other } = place(t);
  fs.writeFileSync(path.join(video, STYLE_FILE), "x".repeat(64_001));
  assert.throws(() => saveKit(looks, video, "Big"), /too large/);
  fs.mkdirSync(looks, { recursive: true });
  fs.writeFileSync(path.join(looks, "Big.md"), "x".repeat(64_001));
  assert.throws(() => useKit(looks, other, "Big"), /too large/);
  assert.equal(hasStyle(other), false, "nothing was written");
});

test("a folder named STYLE.md is not taken for a look", (t) => {
  const { looks, video } = place(t);
  fs.mkdirSync(path.join(video, STYLE_FILE));
  assert.equal(hasStyle(video), false);
  assert.throws(() => saveKit(looks, video, "Nope"), /no look written down yet/);
});

test("saving again under the same name replaces the look and leaves no temporary file", (t) => {
  const { looks, video } = place(t);
  fs.writeFileSync(path.join(video, STYLE_FILE), "first");
  saveKit(looks, video, "Channel");
  fs.writeFileSync(path.join(video, STYLE_FILE), "second");
  saveKit(looks, video, "Channel");
  assert.deepEqual(fs.readdirSync(looks), ["Channel.md"]);
  assert.equal(fs.readFileSync(path.join(looks, "Channel.md"), "utf8"), "second");
});

test("looks are listed newest first, and only the .md files", (t) => {
  const { looks, video } = place(t);
  fs.writeFileSync(path.join(video, STYLE_FILE), "x");
  fs.mkdirSync(looks, { recursive: true });
  fs.writeFileSync(path.join(looks, "notes.txt"), "x");
  fs.mkdirSync(path.join(looks, "Folder.md"));
  for (const [name, age] of [["Old", 300], ["New", 0], ["Middle", 100]]) {
    const file = path.join(looks, `${name}.md`);
    fs.writeFileSync(file, "x");
    const when = new Date(Date.now() - age * 1000);
    fs.utimesSync(file, when, when);
  }
  assert.deepEqual(listKits(looks), [{ name: "New" }, { name: "Middle" }, { name: "Old" }]);
});

test("using a look twice keeps the look the video had before the first time", (t) => {
  const { looks, video, other } = place(t);
  fs.writeFileSync(path.join(video, STYLE_FILE), "Channel look");
  saveKit(looks, video, "Channel");
  fs.writeFileSync(path.join(video, STYLE_FILE), "Another look");
  saveKit(looks, video, "Second");
  fs.writeFileSync(path.join(other, STYLE_FILE), "The video's own look, written by hand");
  useKit(looks, other, "Channel");
  useKit(looks, other, "Second");
  const kept = fs.readdirSync(other).filter((name) => name !== STYLE_FILE).map((name) => fs.readFileSync(path.join(other, name), "utf8"));
  assert.ok(kept.some((text) => /written by hand/.test(text)), "the video's own look survives a second 'use'");
});

test("saving a look still works when Windows will not rename over the old file for a moment", (t) => {
  const { looks, video } = place(t);
  fs.writeFileSync(path.join(video, STYLE_FILE), "first");
  saveKit(looks, video, "Channel");
  fs.writeFileSync(path.join(video, STYLE_FILE), "second");
  const rename = fs.renameSync;
  fs.renameSync = () => { throw Object.assign(new Error("EPERM: operation not permitted, rename"), { code: "EPERM" }); };
  try {
    assert.doesNotThrow(() => saveKit(looks, video, "Channel"));
  } finally {
    fs.renameSync = rename;
  }
  assert.equal(fs.readFileSync(path.join(looks, "Channel.md"), "utf8"), "second");
  assert.deepEqual(fs.readdirSync(looks), ["Channel.md"], "no temporary file is left behind");
});
