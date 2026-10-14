// Lighter copies (lightCopies.js), the parts lightCopies.test.mjs cannot reach: a whole pass with stand-ins for
// FFprobe and FFmpeg, what stays in the copies folder, stopping in the middle of a copy, and the finer points of
// which request is redirected where. The stand-ins are shell scripts, so the passes run where those can (not on
// Windows, where the same code is exercised by `npm run smoke`).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { COPY_FOLDER, LightCopies, copyName, requestedFile, videosUsed } from "../src/main/lightCopies.js";

const SERVER = "http://127.0.0.1:48620";
const CAN_RUN_SCRIPTS = process.platform !== "win32";

function tempDir(t, label = "hfwin run é ") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), label));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function write(dir, rel, content = "x") {
  const file = path.join(dir, ...rel.split("/"));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

const waitFor = async (check, what, ms = 8000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (check()) return;
    await new Promise((done) => setTimeout(done, 25));
  }
  assert.fail(`timed out waiting for ${what}`);
};

const HEAVY = { streams: [
  { codec_type: "video", codec_name: "h264", width: 1920, height: 1080, bit_rate: "16000000" },
  { codec_type: "audio", codec_name: "aac" },
], format: { duration: "12.5" } };
const LIGHT = { streams: [{ codec_type: "video", codec_name: "h264", width: 640, height: 360, bit_rate: "900000" }],
  format: { duration: "3" } };

/** FFprobe and FFmpeg as shell scripts that log each call. `ffmpegBody` is what the FFmpeg script does with `$last`. */
function stubTools(dir, { probe = HEAVY, ffmpegBody = 'printf light > "$last"\nexit 0' } = {}) {
  const bin = path.join(dir, "stub bin é");
  fs.mkdirSync(bin, { recursive: true });
  const log = path.join(bin, "calls.log");
  fs.writeFileSync(log, "");
  const ffprobe = path.join(bin, "ffprobe");
  const ffmpeg = path.join(bin, "ffmpeg");
  fs.writeFileSync(ffprobe, `#!/bin/sh\necho "ffprobe $*" >> "${log}"\ncat <<'JSON'\n${JSON.stringify(probe)}\nJSON\n`);
  fs.writeFileSync(ffmpeg, `#!/bin/sh\necho "ffmpeg $*" >> "${log}"\nfor a; do last="$a"; done\n${ffmpegBody}\n`);
  fs.chmodSync(ffprobe, 0o755);
  fs.chmodSync(ffmpeg, 0o755);
  const calls = (tool) => fs.readFileSync(log, "utf8").split("\n").filter((line) => line.startsWith(`${tool} `));
  return { tools: () => ({ ffmpeg, ffprobe }), calls };
}

/** A project with one page that uses `assets/a.mp4`. */
function project(t) {
  const dir = tempDir(t);
  const clip = write(dir, "assets/a.mp4", "phone footage, many bytes");
  write(dir, "index.html", `<video src="assets/a.mp4"></video>`);
  const name = copyName("assets/a.mp4", fs.statSync(clip));
  return {
    dir, clip, name,
    folder: path.join(dir, ...COPY_FOLDER),
    copy: path.join(dir, ...COPY_FOLDER, name),
    current: { dir, serverUrl: SERVER, projectName: "My Vlog" },
    request: `${SERVER}/api/projects/My%20Vlog/preview/assets/a.mp4`,
  };
}

const ready = (copies, dir) => waitFor(() => ["ready", "unavailable"].includes(copies.status(dir).state), "the pass to end");

test("a heavy clip gets a lighter copy, nothing is left half-made, and its request is then redirected", { skip: !CAN_RUN_SCRIPTS }, async (t) => {
  const p = project(t);
  const stub = stubTools(p.dir);
  const reports = [];
  const copies = new LightCopies({ tools: stub.tools, emit: (report) => reports.push(report.status.state) });
  t.after(() => copies.stop());
  copies.start(p.dir, { delayMs: 0 });
  await ready(copies, p.dir);
  assert.deepEqual(copies.status(p.dir), { state: "ready", done: 1, total: 1, failed: 0 });
  assert.ok(reports.includes("making"), "the page was told a copy was being made");
  assert.equal(fs.readFileSync(p.copy, "utf8"), "light");
  assert.deepEqual(fs.readdirSync(p.folder), [p.name], "no .part file is left");
  const [call] = stub.calls("ffmpeg");
  assert.ok(call.includes(`-i ${p.clip}`), "FFmpeg is given the original");
  assert.ok(call.endsWith(".part.mp4"), "and writes to a part file first");
  assert.equal(copies.redirect(p.request, p.current),
    `${SERVER}/api/projects/My%20Vlog/preview/.cache/kushmanji-preview/${p.name}`);
});

test("a clip that is light enough gets no copy, and is not looked at again on the next pass", { skip: !CAN_RUN_SCRIPTS }, async (t) => {
  const p = project(t);
  const stub = stubTools(p.dir, { probe: LIGHT });
  const copies = new LightCopies({ tools: stub.tools });
  t.after(() => copies.stop());
  copies.start(p.dir, { delayMs: 0 });
  await ready(copies, p.dir);
  assert.deepEqual(copies.status(p.dir), { state: "ready", done: 0, total: 0, failed: 0 });
  assert.equal(stub.calls("ffmpeg").length, 0);
  assert.equal(stub.calls("ffprobe").length, 1);
  assert.equal(copies.redirect(p.request, p.current), null);
  copies.refresh(p.dir);
  await waitFor(() => copies.status(p.dir).state === "ready" && stub.calls("ffprobe").length >= 1, "the second pass");
  await new Promise((done) => setTimeout(done, 2600));
  assert.equal(stub.calls("ffprobe").length, 1, "the version already found light is not probed again");
});

test("only this app's own copies are cleared away, and only the ones that no longer belong to a clip", { skip: !CAN_RUN_SCRIPTS }, async (t) => {
  const p = project(t);
  const stub = stubTools(p.dir, { probe: LIGHT });
  const stale = "a.0123456789ab.mp4";
  for (const name of [stale, "b.cafecafecafe.mp4.part.mp4", "cover.jpg", "notes.txt", "mine.mp4", "keep.0123456789abc.mp4"]) {
    write(p.dir, `${COPY_FOLDER.join("/")}/${name}`);
  }
  const copies = new LightCopies({ tools: stub.tools });
  t.after(() => copies.stop());
  copies.start(p.dir, { delayMs: 0 });
  await ready(copies, p.dir);
  assert.deepEqual(fs.readdirSync(p.folder).sort(), ["cover.jpg", "keep.0123456789abc.mp4", "mine.mp4", "notes.txt"]);
});

test("a copy that FFmpeg could not make is counted, leaves no part file, and the original keeps playing", { skip: !CAN_RUN_SCRIPTS }, async (t) => {
  const p = project(t);
  const stub = stubTools(p.dir, { ffmpegBody: 'printf broken > "$last"\nexit 1' });
  const copies = new LightCopies({ tools: stub.tools });
  t.after(() => copies.stop());
  copies.start(p.dir, { delayMs: 0 });
  await ready(copies, p.dir);
  assert.deepEqual(copies.status(p.dir), { state: "ready", done: 1, total: 1, failed: 1 });
  assert.equal(fs.existsSync(p.folder) ? fs.readdirSync(p.folder).length : 0, 0);
  assert.equal(copies.redirect(p.request, p.current), null);
});

test("stopping in the middle of a copy ends FFmpeg and removes the part file", { skip: !CAN_RUN_SCRIPTS }, async (t) => {
  const p = project(t);
  const stub = stubTools(p.dir, { ffmpegBody: 'printf partial > "$last"\nexec sleep 30' });
  const copies = new LightCopies({ tools: stub.tools });
  t.after(() => copies.stop());
  copies.start(p.dir, { delayMs: 0 });
  await waitFor(() => fs.existsSync(p.folder) && fs.readdirSync(p.folder).some((name) => name.endsWith(".part.mp4")),
    "the copy to begin");
  copies.stop();
  await waitFor(() => fs.readdirSync(p.folder).length === 0, "the part file to be removed");
  assert.equal(fs.existsSync(p.copy), false);
  assert.equal(copies.redirect(p.request, p.current), null, "nothing is redirected after stop");
});

test("a failed copy is not started again on every change to the project", { skip: !CAN_RUN_SCRIPTS }, async (t) => {
  const p = project(t);
  const stub = stubTools(p.dir, { ffmpegBody: 'exit 1' });
  const copies = new LightCopies({ tools: stub.tools });
  t.after(() => copies.stop());
  copies.start(p.dir, { delayMs: 0 });
  await ready(copies, p.dir);
  assert.equal(stub.calls("ffmpeg").length, 1);
  copies.refresh(p.dir);
  await new Promise((done) => setTimeout(done, 3200));
  assert.equal(stub.calls("ffmpeg").length, 1, "the same failing job is not repeated for each refresh");
});

test("a copies folder that cannot be made ends the pass quietly, with no unhandled rejection", { skip: !CAN_RUN_SCRIPTS }, async (t) => {
  const p = project(t);
  // A file where the .cache folder should be: the folder can never be made. (On Windows it is a blocked write.)
  write(p.dir, ".cache", "not a folder");
  const stub = stubTools(p.dir);
  const unhandled = [];
  const watch = (error) => unhandled.push(error);
  process.on("unhandledRejection", watch);
  const copies = new LightCopies({ tools: stub.tools });
  t.after(() => { process.off("unhandledRejection", watch); copies.stop(); });
  copies.start(p.dir, { delayMs: 0 });
  await new Promise((done) => setTimeout(done, 600));
  assert.deepEqual(unhandled.map(String), []);
  assert.notEqual(copies.status(p.dir).state, "making", "the status is not stuck on 'making'");
});

test("a request for a project with a non-Latin name is redirected, with the name encoded as the server wants it", (t) => {
  const dir = tempDir(t);
  const clip = write(dir, "assets/clip one.mp4", "x");
  const copies = new LightCopies({ tools: () => ({ ffmpeg: null, ffprobe: null }) });
  copies.start(dir, { delayMs: 60_000 });
  t.after(() => copies.stop());
  const projectName = "ನನ್ನ ವೀಡಿಯೊ";
  const current = { dir, serverUrl: SERVER, projectName };
  const name = copyName("assets/clip one.mp4", fs.statSync(clip));
  write(dir, `${COPY_FOLDER.join("/")}/${name}`);
  const base = `${SERVER}/api/projects/${encodeURIComponent(projectName)}/preview/`;
  assert.equal(copies.redirect(`${base}assets/clip%20one.mp4`, current), `${base}.cache/kushmanji-preview/${name}`);
  assert.equal(requestedFile(`${base}assets/clip%20one.mp4`, current), "assets/clip one.mp4");
});

test("an odd spelling of the same path (a doubled slash, a capital extension, a query) finds the same copy", (t) => {
  const dir = tempDir(t);
  const clip = write(dir, "assets/Clip.MP4", "x");
  const copies = new LightCopies({ tools: () => ({ ffmpeg: null, ffprobe: null }) });
  copies.start(dir, { delayMs: 60_000 });
  t.after(() => copies.stop());
  const current = { dir, serverUrl: SERVER, projectName: "p" };
  const name = copyName("assets/Clip.MP4", fs.statSync(clip));
  write(dir, `${COPY_FOLDER.join("/")}/${name}`);
  const want = `${SERVER}/api/projects/p/preview/.cache/kushmanji-preview/${name}`;
  for (const spelled of ["assets/Clip.MP4", "assets//Clip.MP4", "assets/./Clip.MP4", "assets/Clip.MP4?t=1"]) {
    assert.equal(copies.redirect(`${SERVER}/api/projects/p/preview/${spelled}`, current), want, spelled);
  }
});

test("a copy that is not a file (a folder of that name) is not redirected to", (t) => {
  const dir = tempDir(t);
  const clip = write(dir, "assets/a.mp4", "x");
  const copies = new LightCopies({ tools: () => ({ ffmpeg: null, ffprobe: null }) });
  copies.start(dir, { delayMs: 60_000 });
  t.after(() => copies.stop());
  fs.mkdirSync(path.join(dir, ...COPY_FOLDER, copyName("assets/a.mp4", fs.statSync(clip))), { recursive: true });
  assert.equal(copies.redirect(`${SERVER}/api/projects/p/preview/assets/a.mp4`,
    { dir, serverUrl: SERVER, projectName: "p" }), null);
});

test("a start for another folder replaces the first: the old project is no longer redirected", (t) => {
  const one = project(t);
  const two = project(t);
  const copies = new LightCopies({ tools: () => ({ ffmpeg: null, ffprobe: null }) });
  t.after(() => copies.stop());
  copies.start(one.dir, { delayMs: 60_000 });
  write(one.dir, `${COPY_FOLDER.join("/")}/${one.name}`);
  assert.ok(copies.redirect(one.request, one.current));
  copies.start(two.dir, { delayMs: 60_000 });
  assert.equal(copies.redirect(one.request, one.current), null);
  assert.deepEqual(copies.status(one.dir), { state: "idle", done: 0, total: 0 });
});

test("refresh for another folder or after stop does nothing", (t) => {
  const p = project(t);
  const copies = new LightCopies({ tools: () => ({ ffmpeg: null, ffprobe: null }) });
  copies.refresh(p.dir);
  copies.start(p.dir, { delayMs: 60_000 });
  copies.refresh(path.join(p.dir, "elsewhere"));
  copies.stop();
  copies.refresh(p.dir);
  copies.stop();
  assert.equal(copies.status(p.dir).state, "idle");
});

test("videos are found in sub-folders three deep, not four, and not through a hidden or tool folder", (t) => {
  const dir = tempDir(t);
  for (const rel of ["a.mp4", "b.mp4", "c.mp4", "d.mp4", "e.MOV"]) write(dir, `assets/${rel}`);
  write(dir, "one/two/three/page.html", `<video src="../../../assets/a.mp4"></video>`);
  write(dir, "one/two/three/four/page.html", `<video src="../../../../assets/b.mp4"></video>`);
  write(dir, ".hidden/page.html", `<video src="../assets/c.mp4"></video>`);
  write(dir, "node_modules/x/page.html", `<video src="../../assets/d.mp4"></video>`);
  write(dir, "index.html", `<video><source src="assets/e.MOV" type="video/quicktime"></video>`);
  assert.deepEqual(videosUsed(dir).sort(), ["assets/a.mp4", "assets/e.MOV"]);
});
