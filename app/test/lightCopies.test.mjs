// Lighter copies of a project's videos (M16-07): which clips get one, what the copy is called, which clips a
// project uses, and which preview request is sent to a finished copy. FFmpeg is never started here.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  COPY_FOLDER, LightCopies, copyArgs, copyName, needsLightCopy, requestedFile, videosUsed,
} from "../src/main/lightCopies.js";

const SERVER = "http://127.0.0.1:48620";
const PROJECT = "My Vlog";
const PREVIEW = `${SERVER}/api/projects/My%20Vlog/preview/`;

// A space and a non-ASCII letter on purpose: every path on a stranger's PC may have both.
function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hfwin copies é "));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function write(dir, rel, content = "x") {
  const file = path.join(dir, ...rel.split("/"));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

// What ffprobe prints, cut down to what the module reads. Its numbers are strings.
const video = (extra = {}) =>
  ({ codec_type: "video", codec_name: "h264", width: 1280, height: 720, ...extra });
const audio = (codec_name) => ({ codec_type: "audio", codec_name });
const probe = (streams, bitRate) => ({ streams, format: bitRate ? { bit_rate: String(bitRate) } : {} });

test("a 1080p phone clip gets a lighter copy", () => {
  assert.equal(needsLightCopy(probe([video({ width: 1920, height: 1080, bit_rate: "16000000" })])), true);
});

test("a portrait clip is judged by its short side, whatever its bitrate", () => {
  assert.equal(needsLightCopy(probe([video({ width: 1080, height: 1920, bit_rate: "3000000" })])), true);
});

test("a 720p clip at a low bitrate is light enough already", () => {
  assert.equal(needsLightCopy(probe([video({ bit_rate: "3000000" }), audio("aac")])), false);
});

test("when the video stream has no bitrate, the file's bitrate decides", () => {
  assert.equal(needsLightCopy(probe([video()], 9_000_000)), true);
  assert.equal(needsLightCopy(probe([video()], 3_000_000)), false);
});

test("a small clip in a codec that is slow to jump around in still gets a copy", () => {
  assert.equal(needsLightCopy(probe([video({ codec_name: "hevc", width: 640, height: 360 })])), true);
});

test("a sound file, a cover picture and a missing probe need no copy", () => {
  assert.equal(needsLightCopy(probe([audio("mp3")])), false);
  const cover = video({ codec_name: "mjpeg", width: 1920, height: 1080, disposition: { attached_pic: 1 } });
  assert.equal(needsLightCopy(probe([cover, audio("mp3")])), false);
  assert.equal(needsLightCopy(null), false);
  assert.equal(needsLightCopy({}), false);
});

test("a copy is named after the clip and the exact version of it", () => {
  const stat = { size: 1000, mtimeMs: 1_700_000_000_000 };
  const name = copyName("assets/clip.mp4", stat);
  assert.match(name, /^clip\.[0-9a-f]{12}\.mp4$/);
  assert.equal(copyName("assets/clip.mp4", { ...stat }), name);
  assert.notEqual(copyName("assets/clip.mp4", { ...stat, size: 1001 }), name);
  assert.notEqual(copyName("assets/clip.mp4", { ...stat, mtimeMs: stat.mtimeMs + 1000 }), name);
  assert.notEqual(copyName("assets/other.mp4", stat), name);
});

test("the case of the path does not change the copy's name, because Windows does not care", () => {
  const stat = { size: 1000, mtimeMs: 1_700_000_000_000 };
  assert.equal(copyName("Assets/CLIP.mp4", stat), copyName("assets/clip.mp4", stat));
});

test("odd characters in a clip's name are replaced so the copy's name is safe anywhere", () => {
  const name = copyName("assets/My Clip (1).MOV", { size: 5, mtimeMs: 7 });
  assert.match(name, /^[\w-]+\.[0-9a-f]{12}\.mp4$/);
  assert.ok(name.startsWith("my-clip-1-"), name);
  // A name with nothing usable in it (here all Kannada) still gets a plain one.
  assert.match(copyName("assets/ಕನ್ನಡ.mp4", { size: 5, mtimeMs: 7 }), /^[\w-]+\.[0-9a-f]{12}\.mp4$/);
});

test("the arguments keep every path as one item, even with spaces and accents in it", () => {
  const source = path.join(os.tmpdir(), "hfwin copies é ", "My Clip.mp4");
  const target = path.join(os.tmpdir(), "hfwin copies é ", "out folder", "My-Clip.abc.part.mp4");
  const args = copyArgs(source, target, probe([video(), audio("aac")]));
  assert.ok(args.every((arg) => typeof arg === "string"));
  assert.equal(args.indexOf(source), args.indexOf("-i") + 1);
  assert.equal(args.at(-1), target);
  assert.equal(args.filter((arg) => arg.includes("My Clip")).length, 1);
});

test("the copy has no B-frames and keeps its timestamps, so jumps are fast and sound stays in step", () => {
  const args = copyArgs("in.mp4", "out.mp4", probe([video(), audio("aac")]));
  const after = (flag) => args[args.indexOf(flag) + 1];
  assert.equal(after("-bf"), "0");
  assert.equal(after("-fps_mode"), "passthrough");
  assert.equal(after("-c:v"), "libx264");
});

test("sound that players handle well is copied as it is, other sound is turned into AAC", () => {
  const audioOf = (codec) => {
    const args = copyArgs("in.mp4", "out.mp4", probe([video(), audio(codec)]));
    return args[args.indexOf("-c:a") + 1];
  };
  assert.equal(audioOf("aac"), "copy");
  assert.equal(audioOf("mp3"), "copy");
  assert.equal(audioOf("pcm_s16le"), "aac");
  const pcm = copyArgs("in.mp4", "out.mp4", probe([video(), audio("pcm_s16le")]));
  assert.equal(pcm[pcm.indexOf("-b:a") + 1], "160k");
});

test("a clip with no sound still works, because the sound is mapped only if there is any", () => {
  for (const info of [probe([video()]), probe([video(), audio("aac")])]) {
    const args = copyArgs("in.mp4", "out.mp4", info);
    const maps = args.flatMap((arg, i) => (arg === "-map" ? [args[i + 1]] : []));
    assert.deepEqual(maps, ["0:v:0", "0:a:0?"]);
  }
});

test("the videos a project uses are found once each, from pages outside tool and render folders", (t) => {
  const dir = tempDir(t);
  for (const rel of ["assets/a.mp4", "assets/b c.mp4", "assets/d.mp4", "assets/e.mp4", "assets/pic.png",
    ".cache/kushmanji-preview/z.mp4"]) write(dir, rel);
  write(dir, "index.html", [
    `<video src="assets/a.mp4"></video>`,
    `<video src='assets/a.mp4'></video>`,
    `<video src="assets/b%20c.mp4"></video>`,
    `<video src="https://example.com/x.mp4"></video>`,
    `<video src="assets/missing.mp4"></video>`,
    `<img src="assets/pic.png">`,
    `<video src=".cache/kushmanji-preview/z.mp4"></video>`,
  ].join("\n"));
  write(dir, "compositions/scene.html", `<video src="assets/d.mp4"></video>`);
  // e.mp4 exists, so the only reason it can be left out is that renders/ is not read.
  write(dir, "renders/old.html", `<video src="assets/e.mp4"></video>`);
  // The order follows readdir, which differs between systems, so it is compared sorted.
  assert.deepEqual(videosUsed(dir).sort(), ["assets/a.mp4", "assets/b c.mp4", "assets/d.mp4"]);
});

test("a page in a folder may name a clip relative to itself", (t) => {
  const dir = tempDir(t);
  write(dir, "compositions/own.mp4");
  write(dir, "compositions/scene.html", `<video src="own.mp4?t=3#x"></video>`);
  assert.deepEqual(videosUsed(dir), ["compositions/own.mp4"]);
});

test("a page cannot point at a clip outside the project", (t) => {
  const dir = tempDir(t);
  const outside = tempDir(t);
  write(outside, "secret.mp4");
  write(dir, "index.html", `<video src="../${path.basename(outside)}/secret.mp4"></video>`);
  assert.deepEqual(videosUsed(dir), []);
});

test("a request for a project video is named by its path inside the project", () => {
  const current = { serverUrl: SERVER, projectName: PROJECT };
  assert.equal(requestedFile(`${PREVIEW}assets/clip%201.mp4`, current), "assets/clip 1.mp4");
  assert.equal(requestedFile(`${PREVIEW}assets/clip.mp4?t=5`, current), "assets/clip.mp4");
});

test("a request to another server or another project is not ours", () => {
  const current = { serverUrl: SERVER, projectName: PROJECT };
  const route = "/api/projects/My%20Vlog/preview/assets/clip.mp4";
  assert.equal(requestedFile(`http://127.0.0.1:48621${route}`, current), null);
  assert.equal(requestedFile(`http://localhost:48620${route}`, current), null);
  assert.equal(requestedFile(`${SERVER}/api/projects/Other/preview/assets/clip.mp4`, current), null);
  assert.equal(requestedFile("not a url", current), null);
});

test("only videos are redirected, and never a hidden, tool or climbing path", () => {
  const current = { serverUrl: SERVER, projectName: PROJECT };
  assert.equal(requestedFile(`${PREVIEW}index.html`, current), null);
  assert.equal(requestedFile(`${PREVIEW}assets/pic.png`, current), null);
  assert.equal(requestedFile(`${PREVIEW}.cache/kushmanji-preview/z.mp4`, current), null);
  assert.equal(requestedFile(`${PREVIEW}assets/.hidden/z.mp4`, current), null);
  // The address parser already resolves a plain "..", so the climb has to arrive percent-encoded.
  assert.equal(requestedFile(`${PREVIEW}assets/..%2Fsecret.mp4`, current), null);
  assert.equal(requestedFile(`${PREVIEW}assets/..%5Csecret.mp4`, current), null);
});

test("a broken percent-encoding and other Studio routes are left alone", () => {
  const current = { serverUrl: SERVER, projectName: PROJECT };
  assert.equal(requestedFile(`${PREVIEW}assets/bad%E0%A4%A.mp4`, current), null);
  assert.equal(requestedFile(`${SERVER}/api/projects/My%20Vlog/thumbnail/assets/x.mp4`, current), null);
  assert.equal(requestedFile(`${SERVER}/api/projects/My%20Vlog/preview/`, current), null);
});

// A started project with one clip, and what a request for that clip looks like.
function open(t) {
  const dir = tempDir(t);
  const clip = write(dir, "assets/a.mp4", "phone footage");
  const copies = new LightCopies({ tools: () => ({ ffmpeg: null, ffprobe: null }) });
  // A long delay, so nothing runs; stop() clears the timer, which would otherwise keep the test alive.
  copies.start(dir, { delayMs: 60_000 });
  t.after(() => copies.stop());
  const name = copyName("assets/a.mp4", fs.statSync(clip));
  return {
    dir, clip, copies, name,
    current: { dir, serverUrl: SERVER, projectName: PROJECT },
    request: `${PREVIEW}assets/a.mp4`,
    copyFile: path.join(dir, ...COPY_FOLDER, name),
    copyUrl: `${PREVIEW}.cache/kushmanji-preview/${name}`,
  };
}

test("until the lighter copy exists, the original plays", (t) => {
  const p = open(t);
  assert.equal(p.copies.redirect(p.request, p.current), null);
});

test("once the lighter copy exists, the request is sent to it", (t) => {
  const p = open(t);
  write(p.dir, `${COPY_FOLDER.join("/")}/${p.name}`, "light");
  assert.equal(p.copies.redirect(p.request, p.current), p.copyUrl);
  // The copy's own address is not redirected again, and a request for anything else is untouched.
  assert.equal(p.copies.redirect(p.copyUrl, p.current), null);
  assert.equal(p.copies.redirect(`${PREVIEW}index.html`, p.current), null);
});

test("a copy of an older version of the clip is never used", (t) => {
  const p = open(t);
  write(p.dir, `${COPY_FOLDER.join("/")}/${p.name}`, "light");
  assert.equal(p.copies.redirect(p.request, p.current), p.copyUrl);
  fs.writeFileSync(p.clip, "the same clip, trimmed and saved again with other bytes");
  assert.equal(p.copies.redirect(p.request, p.current), null);
});

test("a request for a clip that is not in the project is not redirected", (t) => {
  const p = open(t);
  assert.equal(p.copies.redirect(`${PREVIEW}assets/gone.mp4`, p.current), null);
});

test("a request from another project's window is not redirected", (t) => {
  const p = open(t);
  write(p.dir, `${COPY_FOLDER.join("/")}/${p.name}`, "light");
  const other = path.join(path.dirname(p.dir), `${path.basename(p.dir)} other`);
  assert.equal(p.copies.redirect(p.request, { ...p.current, dir: other }), null);
  assert.equal(p.copies.redirect(p.request, null), null);
});

test("the project folder is the same folder whatever the letter case, as on Windows", (t) => {
  const p = open(t);
  write(p.dir, `${COPY_FOLDER.join("/")}/${p.name}`, "light");
  assert.equal(p.copies.redirect(p.request, { ...p.current, dir: p.dir.toUpperCase() }), p.copyUrl);
});

test("after stop, nothing is redirected", (t) => {
  const p = open(t);
  write(p.dir, `${COPY_FOLDER.join("/")}/${p.name}`, "light");
  assert.equal(p.copies.redirect(p.request, p.current), p.copyUrl);
  p.copies.stop();
  assert.equal(p.copies.redirect(p.request, p.current), null);
});

test("a project that was never started has an idle status", (t) => {
  const copies = new LightCopies({ tools: () => ({ ffmpeg: null, ffprobe: null }) });
  assert.deepEqual(copies.status(tempDir(t)), { state: "idle", done: 0, total: 0 });
});

test("without FFmpeg and FFprobe the status says the copies are unavailable", async (t) => {
  for (const tools of [{ ffmpeg: null, ffprobe: null }, { ffmpeg: "ffmpeg", ffprobe: null }]) {
    const dir = tempDir(t);
    let first;
    const emitted = new Promise((resolve) => { first = resolve; });
    const copies = new LightCopies({ tools: () => tools, emit: first });
    t.after(() => copies.stop());
    copies.start(dir, { delayMs: 0 });
    assert.equal(copies.status(dir).state, "waiting");
    const report = await emitted;
    assert.equal(report.dir, dir);
    assert.deepEqual(report.status, { state: "unavailable", done: 0, total: 0 });
    assert.equal(copies.status(dir).state, "unavailable");
    copies.stop();
  }
});
