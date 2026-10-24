// FFmpeg with one press (ffmpegTool.js, M5-03): finding it, which FFmpeg wins, and the checked download. No network:
// the download is a real zip made here with Windows' own tar.exe, handed over by a stand-in for fetch.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { FFMPEG_ZIP, FfmpegTool, findPrograms } from "../src/main/ffmpegTool.js";

function scratch(t, name = "hfwin ffmpeg é ") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), name));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Keeps the person's own settings out of the test and puts them back afterwards. */
function cleanEnv(t) {
  const saved = { ffmpeg: process.env.HYPERFRAMES_FFMPEG_PATH, ffprobe: process.env.HYPERFRAMES_FFPROBE_PATH };
  delete process.env.HYPERFRAMES_FFMPEG_PATH;
  delete process.env.HYPERFRAMES_FFPROBE_PATH;
  t.after(() => {
    const back = [["HYPERFRAMES_FFMPEG_PATH", saved.ffmpeg], ["HYPERFRAMES_FFPROBE_PATH", saved.ffprobe]];
    for (const [name, value] of back) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
}

/** A folder laid out like Gyan's zip: `ffmpeg-<version>-essentials_build\bin\ffmpeg.exe` and `ffprobe.exe`. */
function fakeBuild(root) {
  const bin = path.join(root, "ffmpeg-9.0.2-essentials_build", "bin");
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, "ffmpeg.exe"), "pretend ffmpeg");
  fs.writeFileSync(path.join(bin, "ffprobe.exe"), "pretend ffprobe");
  return bin;
}

const answer = (bytes) => async () => ({
  ok: true, status: 200,
  body: (async function* chunks() {
    for (let i = 0; i < bytes.length; i += 64) yield bytes.subarray(i, i + 64);
  })(),
});

test("the pinned download is the numbered 9.0.2 release, with its size and fingerprint", () => {
  assert.match(FFMPEG_ZIP.url, /^https:\/\/github\.com\/GyanD\/codexffmpeg\/releases\/download\/9\.0\.2\//);
  assert.equal(FFMPEG_ZIP.bytes, 114_768_076);
  assert.match(FFMPEG_ZIP.sha256, /^[0-9a-f]{64}$/);
});

test("both programs are found where the zip puts them, and only together", (t) => {
  const dir = scratch(t);
  assert.equal(findPrograms(dir), null);
  const bin = fakeBuild(dir);
  assert.deepEqual(findPrograms(dir), { ffmpeg: path.join(bin, "ffmpeg.exe"), ffprobe: path.join(bin, "ffprobe.exe") });
  fs.rmSync(path.join(bin, "ffprobe.exe"));
  assert.equal(findPrograms(dir), null, "FFmpeg without FFprobe is not enough");
  assert.equal(findPrograms(path.join(dir, "missing")), null);
});

test("an FFmpeg the person has wins; the app's own is used only when there is none", (t) => {
  cleanEnv(t);
  const folder = path.join(scratch(t), "tools", "ffmpeg");
  const bin = fakeBuild(folder);

  new FfmpegTool({ folder, whereAll: () => ["C:\\Tools\\ffmpeg.exe"] }).useIfPresent();
  assert.equal(process.env.HYPERFRAMES_FFMPEG_PATH, undefined, "one on PATH is HyperFrames' to find");

  new FfmpegTool({ folder, whereAll: () => ["C:\\Tools\\ffmpeg.cmd"] }).useIfPresent();
  assert.equal(process.env.HYPERFRAMES_FFMPEG_PATH, path.join(bin, "ffmpeg.exe"), "a .cmd stand-in is not FFmpeg");
  assert.equal(process.env.HYPERFRAMES_FFPROBE_PATH, path.join(bin, "ffprobe.exe"));

  const mine = path.join(scratch(t), "my ffmpeg.exe");
  fs.writeFileSync(mine, "");
  process.env.HYPERFRAMES_FFMPEG_PATH = mine;
  new FfmpegTool({ folder, whereAll: () => [] }).useIfPresent();
  assert.equal(process.env.HYPERFRAMES_FFMPEG_PATH, mine, "one the person named is never replaced");
});

test("the status says what one press would fetch, until FFmpeg is here", (t) => {
  cleanEnv(t);
  const folder = path.join(scratch(t), "tools", "ffmpeg");
  const tool = new FfmpegTool({ folder, whereAll: () => [] });
  assert.deepEqual(tool.status(), { state: "missing", error: null, megabytes: 115 });
  fakeBuild(folder);
  assert.deepEqual(tool.status(), { state: "ready" });
});

test("one press fetches, checks and unpacks FFmpeg, says how far it got, and uses it", async (t) => {
  cleanEnv(t);
  const work = scratch(t);
  fakeBuild(path.join(work, "zip source"));
  const zip = path.join(work, "build.zip");
  const tar = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
  const made = spawnSync(tar, ["-a", "-c", "-f", zip, "-C", path.join(work, "zip source"), "ffmpeg-9.0.2-essentials_build"],
    { windowsHide: true });
  assert.equal(made.status, 0, String(made.stderr));
  const bytes = fs.readFileSync(zip);
  const source = { url: "https://example.invalid/ffmpeg.zip", bytes: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex") };
  const folder = path.join(work, "user data", "tools", "ffmpeg");
  const said = [];
  const tool = new FfmpegTool({
    folder, whereAll: () => [], source, fetchImpl: answer(bytes), emit: (status) => said.push(status),
  });

  const done = await tool.get();
  assert.equal(done.state, "ready");
  assert.equal(said[0].state, "getting");
  assert.ok(said.some((status) => status.percent === 100), "progress reached the end");
  assert.equal(process.env.HYPERFRAMES_FFMPEG_PATH, findPrograms(folder).ffmpeg);
  assert.equal(fs.readFileSync(process.env.HYPERFRAMES_FFMPEG_PATH, "utf8"), "pretend ffmpeg");
  assert.equal(fs.existsSync(`${folder}.new`), false, "nothing half-unpacked is left beside it");
});

test("a download that is not the file expected leaves nothing behind and says so plainly", async (t) => {
  cleanEnv(t);
  const work = scratch(t);
  const folder = path.join(work, "tools", "ffmpeg");
  const bytes = Buffer.from("not the build");
  const source = { url: "https://example.invalid/ffmpeg.zip", bytes: bytes.length, sha256: "0".repeat(64) };
  const tool = new FfmpegTool({ folder, whereAll: () => [], source, fetchImpl: answer(bytes) });
  const done = await tool.get();
  assert.equal(done.state, "failed");
  assert.match(done.error, /not the file expected/);
  assert.equal(fs.existsSync(folder), false);
  assert.equal(process.env.HYPERFRAMES_FFMPEG_PATH, undefined);
  const offline = new FfmpegTool({ folder, whereAll: () => [], source,
    fetchImpl: async () => { throw new TypeError("fetch failed"); } });
  assert.equal((await offline.get()).error, "FFmpeg could not be downloaded. Check the internet connection and try again.");
});
