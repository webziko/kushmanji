import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";

let root;
let project;
let source;
let importer;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "hfwin import é "));
  project = path.join(root, "project");
  source = path.join(root, "originals");
  await fs.mkdir(project);
  await fs.mkdir(source);
  await fs.writeFile(path.join(project, "index.html"), "original composition");
  importer = await import("../src/main/mediaImport.js").catch(() => ({}));
});
afterEach(async () => fs.rm(root, { recursive: true, force: true }));

test("import copies media and leaves the original and composition unchanged", async () => {
  const file = path.join(source, "Kannada clip é.MP4");
  await fs.writeFile(file, "original footage");
  assert.equal(typeof importer.importMedia, "function", "safe media importer is available");
  const imported = await importer.importMedia(project, [file]);
  assert.deepEqual(imported.files, ["assets/Kannada clip é.MP4"]);
  assert.equal(await fs.readFile(file, "utf8"), "original footage");
  assert.equal(await fs.readFile(path.join(project, imported.files[0]), "utf8"), "original footage");
  assert.equal(await fs.readFile(path.join(project, "index.html"), "utf8"), "original composition");
});

test("a duplicate filename never overwrites existing project media", async () => {
  await fs.mkdir(path.join(project, "assets"));
  await fs.writeFile(path.join(project, "assets", "clip.mp4"), "existing");
  const file = path.join(source, "clip.mp4");
  await fs.writeFile(file, "new");
  assert.equal(typeof importer.importMedia, "function");
  const imported = await importer.importMedia(project, [file]);
  assert.deepEqual(imported.files, ["assets/clip-2.mp4"]);
  assert.equal(await fs.readFile(path.join(project, "assets", "clip.mp4"), "utf8"), "existing");
});

test("all source files are validated before any are copied", async () => {
  const video = path.join(source, "clip.mp4");
  const script = path.join(source, "run.cmd");
  await fs.writeFile(video, "video");
  await fs.writeFile(script, "not media");
  assert.equal(typeof importer.importMedia, "function");
  await assert.rejects(importer.importMedia(project, [video, script]), /video, sound or picture/);
  assert.deepEqual(await fs.readdir(project), ["index.html"]);
});

test("media cannot be copied through a project junction leading elsewhere", async (t) => {
  const outside = path.join(root, "private");
  await fs.mkdir(outside);
  try { await fs.symlink(outside, path.join(project, "assets"), "junction"); }
  catch { return t.skip("this account cannot make a junction"); }
  const video = path.join(source, "clip.mp4");
  await fs.writeFile(video, "video");
  assert.equal(typeof importer.importMedia, "function");
  await assert.rejects(importer.importMedia(project, [video]), /outside this project/);
  assert.deepEqual(await fs.readdir(outside), []);
});

test("folder import finds nested media and skips hidden folders and linked files", async () => {
  await fs.mkdir(path.join(source, "day 1"));
  await fs.mkdir(path.join(source, ".private"));
  await fs.writeFile(path.join(source, "day 1", "clip.mp4"), "video");
  await fs.writeFile(path.join(source, ".private", "secret.mp4"), "private");
  await fs.writeFile(path.join(source, "notes.txt"), "notes");
  assert.equal(typeof importer.mediaFilesIn, "function");
  assert.deepEqual(await importer.mediaFilesIn(source), [path.join(source, "day 1", "clip.mp4")]);
});

test("exactly 200 media files plus notes are accepted, but 201 media files are refused", async () => {
  for (let i = 0; i < 200; i++) await fs.writeFile(path.join(source, `${String(i).padStart(3, "0")}.mp4`), "video");
  await fs.writeFile(path.join(source, "zzz-notes.txt"), "notes");
  assert.equal((await importer.mediaFilesIn(source)).length, 200);
  await fs.writeFile(path.join(source, "extra.mp4"), "video");
  await assert.rejects(importer.mediaFilesIn(source), /too many files/);
});
