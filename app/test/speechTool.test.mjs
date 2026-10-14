// The speech tool (speechTool.js, M10-11): finding Whisper, the checked download, and when the app says it is there.
// No network: `download` is given a stand-in for fetch.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { download, findProgram, homeProblem, modelFile, SpeechTool, whisperReady } from "../src/main/speechTool.js";

function scratch(t, name = "hfwin speech é ") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), name));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
// A stand-in user folder Whisper can read: plain English letters only (see homeProblem).
const plainHome = (t) => scratch(t, "hfwin-speech-home-");

const answer = (bytes, { ok = true, status = 200 } = {}) => async () => ({
  ok, status,
  body: (async function* chunks() {
    for (let i = 0; i < bytes.length; i += 3) yield bytes.subarray(i, i + 3);
  })(),
});
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

test("the program is found where whisper.cpp's zip puts it, and not deeper than two folders", (t) => {
  const dir = scratch(t);
  assert.equal(findProgram(dir), null);
  fs.mkdirSync(path.join(dir, "Release"));
  fs.writeFileSync(path.join(dir, "Release", "whisper-cli.exe"), "");
  assert.equal(findProgram(dir), path.join(dir, "Release", "whisper-cli.exe"));
  const deep = scratch(t);
  fs.mkdirSync(path.join(deep, "a", "b", "c"), { recursive: true });
  fs.writeFileSync(path.join(deep, "a", "b", "c", "whisper-cli.exe"), "");
  assert.equal(findProgram(deep), null);
  assert.equal(findProgram(path.join(deep, "missing")), null);
});

test("Whisper counts as ready only with both the program and the model", (t) => {
  const home = plainHome(t);
  const program = path.join(home, "whisper-cli.exe");
  assert.equal(whisperReady({ program, home }), false);
  fs.writeFileSync(program, "");
  assert.equal(whisperReady({ program, home }), false, "no model yet");
  fs.mkdirSync(path.dirname(modelFile(home)), { recursive: true });
  fs.writeFileSync(modelFile(home), "");
  assert.equal(whisperReady({ program, home }), true);
  assert.equal(whisperReady({ program: undefined, home }), false);
  assert.equal(modelFile(home), path.join(home, ".cache", "hyperframes", "whisper", "models", "ggml-large-v3.bin"));
});

test("a download whose length and fingerprint match is kept, with progress, and nothing left beside it", async (t) => {
  const dir = scratch(t);
  const bytes = Buffer.from("a whisper program, pretend");
  const file = path.join(dir, "deeper", "whisper.zip");
  const seen = [];
  await download("https://example.invalid/w.zip", file, {
    bytes: bytes.length, sha256: sha(bytes), onBytes: (n) => seen.push(n), fetchImpl: answer(bytes),
  });
  assert.deepEqual(fs.readFileSync(file), bytes);
  assert.equal(seen.at(-1), bytes.length);
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ["whisper.zip"]);
});

test("a download that is not the file expected is thrown away", async (t) => {
  const dir = scratch(t);
  const file = path.join(dir, "model.bin");
  const bytes = Buffer.from("tampered");
  await assert.rejects(
    download("https://example.invalid/m.bin", file, { bytes: bytes.length, sha256: sha(Buffer.from("other")), fetchImpl: answer(bytes) }),
    /not the file expected/,
  );
  await assert.rejects(
    download("https://example.invalid/m.bin", file, { bytes: 99, sha256: sha(bytes), fetchImpl: answer(bytes) }),
    /not the file expected/,
  );
  await assert.rejects(
    download("https://example.invalid/m.bin", file, { bytes: 1, sha256: "x", fetchImpl: answer(bytes, { ok: false, status: 404 }) }),
    /404/,
  );
  assert.deepEqual(fs.readdirSync(dir), []);
});

test("the app uses its own Whisper, else one on PATH, and never replaces one the person named", (t) => {
  const saved = process.env.HYPERFRAMES_WHISPER_PATH;
  t.after(() => {
    if (saved === undefined) delete process.env.HYPERFRAMES_WHISPER_PATH;
    else process.env.HYPERFRAMES_WHISPER_PATH = saved;
  });
  const folder = path.join(scratch(t), "tools", "whisper");
  const onPath = ["C:\\Tools\\whisper-cli.cmd", "C:\\Tools\\whisper-cli.exe"];

  delete process.env.HYPERFRAMES_WHISPER_PATH;
  new SpeechTool({ folder, whereAll: () => onPath }).useIfPresent();
  assert.equal(process.env.HYPERFRAMES_WHISPER_PATH, "C:\\Tools\\whisper-cli.exe");

  delete process.env.HYPERFRAMES_WHISPER_PATH;
  fs.mkdirSync(path.join(folder, "Release"), { recursive: true });
  fs.writeFileSync(path.join(folder, "Release", "whisper-cli.exe"), "");
  new SpeechTool({ folder, whereAll: () => onPath }).useIfPresent();
  assert.equal(process.env.HYPERFRAMES_WHISPER_PATH, path.join(folder, "Release", "whisper-cli.exe"));

  process.env.HYPERFRAMES_WHISPER_PATH = "D:\\Mine\\whisper-cli.exe";
  new SpeechTool({ folder, whereAll: () => onPath }).useIfPresent();
  assert.equal(process.env.HYPERFRAMES_WHISPER_PATH, "D:\\Mine\\whisper-cli.exe");

  delete process.env.HYPERFRAMES_WHISPER_PATH;
  new SpeechTool({ folder: path.join(folder, "none"), whereAll: () => [] }).useIfPresent();
  assert.equal(process.env.HYPERFRAMES_WHISPER_PATH, undefined);
});

test("the status says what the person would download, until both parts are here", (t) => {
  const saved = process.env.HYPERFRAMES_WHISPER_PATH;
  t.after(() => {
    if (saved === undefined) delete process.env.HYPERFRAMES_WHISPER_PATH;
    else process.env.HYPERFRAMES_WHISPER_PATH = saved;
  });
  const home = plainHome(t);
  const folder = path.join(home, "tools", "whisper");
  delete process.env.HYPERFRAMES_WHISPER_PATH;
  const tool = new SpeechTool({ folder, home, whereAll: () => [] });
  const missing = tool.status();
  assert.equal(missing.state, "missing");
  assert.ok(missing.megabytes > 3000 && missing.megabytes < 3200, `${missing.megabytes} MB`);

  // HyperFrames already has the model: only the program is offered, and its size said as it is.
  fs.mkdirSync(path.dirname(modelFile(home)), { recursive: true });
  fs.writeFileSync(modelFile(home), "");
  assert.equal(tool.status().megabytes, 9);

  fs.mkdirSync(path.join(folder, "Release"), { recursive: true });
  fs.writeFileSync(path.join(folder, "Release", "whisper-cli.exe"), "");
  tool.useIfPresent();
  assert.equal(tool.status().state, "ready");
});

test("a user folder whose name Whisper cannot read is said plainly, and nothing is fetched", async (t) => {
  const home = scratch(t, "hfwin José ");
  assert.match(homeProblem(home), /user folder/);
  assert.equal(homeProblem(plainHome(t)), null);
  fs.mkdirSync(path.dirname(modelFile(home)), { recursive: true });
  fs.writeFileSync(modelFile(home), "");
  const program = path.join(home, "whisper-cli.exe");
  fs.writeFileSync(program, "");
  assert.equal(whisperReady({ program, home }), false, "never handed to the study, where it would crash");
  const tool = new SpeechTool({ folder: path.join(home, "tools", "whisper"), home, whereAll: () => [] });
  assert.equal(tool.status().state, "blocked");
  assert.equal((await tool.get()).state, "blocked");
  assert.equal(fs.existsSync(path.join(home, "tools")), false);
});