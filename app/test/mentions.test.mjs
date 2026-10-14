// The "@" list's files and the checks on clips dropped on the chat (M3-03). The folder has a space and a letter
// outside ASCII in its name, as a real one on Windows can.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { importMedia } from "../src/main/mediaImport.js";
import { listMentionable, MAX_DROPPED, MAX_MENTIONABLE, validateDropped } from "../src/main/mentions.js";

let root;
let video;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "hfwin mentions é "));
  video = path.join(root, "my video");
  await fs.mkdir(video);
  await fs.writeFile(path.join(video, "index.html"), "<html></html>");
});
afterEach(async () => fs.rm(root, { recursive: true, force: true }));

const touch = async (...parts) => {
  const file = path.join(video, ...parts);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, "x");
  return file;
};

test("the list names clips, sounds, pictures and scenes, with forward slashes and no index.html", async () => {
  await touch("assets", "clip-03.MP4");
  await touch("assets", "voice é.wav");
  await touch("assets", "logo.png");
  await touch("compositions", "intro.html");
  await touch("notes.txt");
  const found = await listMentionable(video);
  assert.deepEqual(found, [
    { path: "assets/clip-03.MP4", name: "clip-03.MP4", kind: "video", mention: "clip-03.MP4" },
    { path: "assets/logo.png", name: "logo.png", kind: "image", mention: "logo.png" },
    { path: "assets/voice é.wav", name: "voice é.wav", kind: "audio", mention: "voice é.wav" },
    { path: "compositions/intro.html", name: "intro.html", kind: "scene", mention: "intro.html" },
  ]);
});

test("only the video's own index.html is left out; a page of the same name in a folder is a scene", async () => {
  await touch("scenes", "index.html");
  const found = await listMentionable(video);
  assert.deepEqual(found.map((item) => [item.path, item.kind]), [["scenes/index.html", "scene"]]);
});

test("hidden folders, tool folders and saved videos are not searched", async () => {
  await touch(".hyperframes", "study", "sheet.png");
  await touch(".cache", "copy.mp4");
  await touch("node_modules", "pkg", "demo.mp4");
  await touch("renders", "final.mp4");
  await touch("snapshots", "frame.png");
  await touch("assets", ".hidden.mp4");
  await touch("assets", "kept.mp4");
  assert.deepEqual((await listMentionable(video)).map((item) => item.path), ["assets/kept.mp4"]);
});

test("folders are searched four levels down and no further", async () => {
  await touch("a", "b", "c", "d", "deep.mp4");
  await touch("a", "b", "c", "d", "e", "too-deep.mp4");
  assert.deepEqual((await listMentionable(video)).map((item) => item.path), ["a/b/c/d/deep.mp4"]);
});

test("a list this long is cut short, keeping the files nearest the top", async () => {
  await fs.mkdir(path.join(video, "assets"));
  await fs.mkdir(path.join(video, "more"));
  for (let i = 0; i < MAX_MENTIONABLE; i++) await fs.writeFile(path.join(video, "more", `c${i}.mp4`), "x");
  await touch("top.mp4");
  const found = await listMentionable(video);
  assert.equal(found.length, MAX_MENTIONABLE);
  assert.ok(found.some((item) => item.path === "top.mp4"), "the shallow file is kept");
});

test("two files with one name are told apart by their whole path; one name stays short", async () => {
  await touch("assets", "clip.mp4");
  await touch("assets", "b", "Clip.mp4");
  await touch("assets", "other.mp4");
  const found = await listMentionable(video);
  assert.deepEqual(
    Object.fromEntries(found.map((item) => [item.path, item.mention])),
    { "assets/clip.mp4": "assets/clip.mp4", "assets/b/Clip.mp4": "assets/b/Clip.mp4", "assets/other.mp4": "other.mp4" },
  );
});

test("numbers in names sort as numbers", async () => {
  for (const n of [10, 2, 1]) await touch("assets", `clip-${n}.mp4`);
  assert.deepEqual((await listMentionable(video)).map((item) => item.name), ["clip-1.mp4", "clip-2.mp4", "clip-10.mp4"]);
});

test("a shortcut or junction is never followed out of the video", async () => {
  const outside = path.join(root, "outside");
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, "secret.mp4"), "x");
  await touch("assets", "real.mp4");
  try {
    await fs.symlink(outside, path.join(video, "linked"), "junction");
    await fs.symlink(path.join(outside, "secret.mp4"), path.join(video, "assets", "link.mp4"), "file");
  } catch {
    // This computer will not make links without extra rights: the rest of the test still holds.
  }
  assert.deepEqual((await listMentionable(video)).map((item) => item.path), ["assets/real.mp4"]);
});

test("a folder that is not an absolute path or cannot be read is refused in plain words", async () => {
  await assert.rejects(listMentionable("my video"), /Open a video first/);
  await assert.rejects(listMentionable(null), /Open a video first/);
  await assert.rejects(listMentionable(path.join(root, "missing")), /could not be read/);
});

test("dropped files that are real media are accepted once each", async () => {
  const a = await touch("..", "dropped", "Clip é.MOV");
  const b = await touch("..", "dropped", "song.mp3");
  const checked = await validateDropped([a, b, a]);
  assert.deepEqual(checked, [path.resolve(a), path.resolve(b)]);
});

test("a drop with anything wrong in it is refused whole, in plain words", async () => {
  const good = await touch("..", "dropped", "ok.mp4");
  const text = await touch("..", "dropped", "notes.txt");
  const folder = path.join(root, "dropped", "looks like a clip.mp4");
  await fs.mkdir(folder);
  await assert.rejects(validateDropped([good, text]), /notes\.txt is not a video, sound or picture file/);
  await assert.rejects(validateDropped([good, folder]), /looks like a clip\.mp4 is a folder or a shortcut/);
  await assert.rejects(validateDropped([good, path.join(root, "gone.mp4")]), /gone\.mp4 is missing/);
  await assert.rejects(validateDropped([good, "clips/relative.mp4"]), /could not be found on this computer/);
  await assert.rejects(validateDropped([good, 42]), /could not be found on this computer/);
});

test("a drop must be a list of one to fifty files", async () => {
  await assert.rejects(validateDropped([]), /between one and 50/);
  await assert.rejects(validateDropped("clip.mp4"), /between one and 50/);
  await assert.rejects(validateDropped(undefined), /between one and 50/);
  const many = Array.from({ length: MAX_DROPPED + 1 }, (_, i) => path.join(root, `c${i}.mp4`));
  await assert.rejects(validateDropped(many), /between one and 50/);
});

test("a shortcut to a clip is not taken for the clip", async () => {
  const real = await touch("..", "dropped", "real.mp4");
  const link = path.join(root, "dropped", "link.mp4");
  try {
    await fs.symlink(real, link, "file");
  } catch {
    return; // No links on this computer, so there is nothing to refuse.
  }
  await assert.rejects(validateDropped([link]), /folder or a shortcut/);
});

test("dropped clips are copied into the video and the originals stay where they were", async () => {
  const original = await touch("..", "dropped", "Kannada clip é.mp4");
  const imported = await importMedia(video, await validateDropped([original]));
  assert.deepEqual(imported.files, ["assets/Kannada clip é.mp4"]);
  assert.equal(await fs.readFile(original, "utf8"), "x");
  assert.ok((await listMentionable(video)).some((item) => item.path === "assets/Kannada clip é.mp4"));
});
