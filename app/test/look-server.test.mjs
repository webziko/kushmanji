// "look_at_video" (tools/look.mjs), the half look.test.mjs leaves out: the server reading and writing JSON lines, the
// drawing of a project through a stand-in for the HyperFrames CLI, what stays on disk, and the script started the way
// an assistant starts it (a path with a space and an accent, Windows line endings).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { serve, snapshotLook } from "../src/main/agents/tools/look.mjs";

const SCRIPT = fileURLToPath(new URL("../src/main/agents/tools/look.mjs", import.meta.url));
const PNG = Buffer.from("89504e470d0a1a0a", "hex");

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hfwin look é "));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A stand-in for the HyperFrames CLI: writes `frame-NN-at-Ts.png` for each --at time and notes how it was called. */
function fakeCli(dir, { fail = false } = {}) {
  const file = path.join(dir, "fake cli é.mjs");
  fs.writeFileSync(file, `
import fs from "node:fs";
import path from "node:path";
const args = process.argv.slice(2);
const out = args[args.indexOf("-o") + 1];
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "args.json"), JSON.stringify({ args, cwd: process.cwd() }));
if (${fail}) process.exit(1);
const times = args[args.indexOf("--at") + 1].split(",").map(Number);
times.forEach((time, i) => fs.writeFileSync(path.join(out, "frame-" + String(i).padStart(2, "0") + "-at-" + time + "s.png"), "PNG" + time));
fs.writeFileSync(path.join(out, "contact-sheet.jpg"), "sheet");
`);
  return file;
}

/** The lines a server wrote, parsed, once it has been given `lines` and its input has ended. */
async function converse(look, lines) {
  const input = new PassThrough();
  const output = new PassThrough();
  let text = "";
  output.on("data", (chunk) => (text += chunk));
  serve(look, input, output);
  for (const line of lines) input.write(line);
  input.end();
  await new Promise((done) => setTimeout(done, 80));
  return text.split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

const call = (id, seconds) => `${JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call",
  params: { name: "look_at_video", arguments: { seconds } } })}\n`;

test("each line gets its answer; notifications, blank lines and broken lines get none", async () => {
  const look = async (seconds) => seconds.map((at) => ({ seconds: at, png: PNG }));
  const got = await converse(look, [
    `${JSON.stringify({ jsonrpc: "2.0", id: 0, method: "ping" })}\n`,
    "\n",
    "this is not json\n",
    `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
    "[1, 2, 3]\n",
    `${JSON.stringify({ jsonrpc: "2.0", id: "a", method: "tools/list" })}\n`,
  ]);
  assert.deepEqual(got.map((reply) => reply.id), [0, "a"]);
  assert.equal(got[1].result.tools[0].name, "look_at_video");
});

test("lines that end in a carriage return, as Windows writes them, are read", async () => {
  const got = await converse(async () => [], [`${JSON.stringify({ jsonrpc: "2.0", id: 7, method: "ping" })}\r\n`]);
  assert.deepEqual(got, [{ jsonrpc: "2.0", id: 7, result: {} }]);
});

test("a slow picture does not hold up the answers that follow, and each answer carries its own id", async () => {
  let release;
  const slow = new Promise((resolve) => { release = resolve; });
  const look = async (seconds) => {
    if (seconds[0] === 1) await slow;
    return seconds.map((at) => ({ seconds: at, png: PNG }));
  };
  const input = new PassThrough();
  const output = new PassThrough();
  const seen = [];
  output.on("data", (chunk) => seen.push(...String(chunk).split("\n").filter(Boolean).map((line) => JSON.parse(line).id)));
  serve(look, input, output);
  input.write(call(1, [1]));
  input.write(call(2, [2]));
  input.write(`${JSON.stringify({ jsonrpc: "2.0", id: 3, method: "ping" })}\n`);
  await new Promise((done) => setTimeout(done, 60));
  assert.deepEqual([...seen].sort(), [2, 3], "the later requests were answered while the first waited");
  release();
  await new Promise((done) => setTimeout(done, 60));
  assert.deepEqual([...seen].sort(), [1, 2, 3]);
  assert.equal(seen.at(-1), 1, "and the slow one came last");
  input.end();
});

test("a picture that cannot be drawn is a plain refusal the assistant can read, not a dead server", async () => {
  const look = async () => { throw new Error("the video could not be drawn just now"); };
  const got = await converse(look, [call(1, [2]), `${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "ping" })}\n`]);
  const byId = (id) => got.find((reply) => reply.id === id);
  assert.equal(byId(1).result.isError, true);
  assert.match(byId(1).result.content[0].text, /No pictures: the video could not be drawn/);
  assert.deepEqual(byId(2), { jsonrpc: "2.0", id: 2, result: {} });
});

test("asking without moments, or with the wrong kind of thing, is refused in words", async () => {
  const look = async () => assert.fail("must not draw");
  const got = await converse(look, [
    `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "look_at_video" } })}\n`,
    call(2, "5"), call(3, [-1]), call(4, ["soon"]),
    `${JSON.stringify({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "other_tool" } })}\n`,
  ]);
  assert.equal(got.length, 5);
  for (const reply of got) assert.equal(reply.result.isError, true);
  assert.match(got.find((reply) => reply.id === 5).result.content[0].text, /no tool called other_tool/);
});

test("the CLI is asked for exactly those moments, into this project's own look folder, with no web description", async (t) => {
  const dir = tempDir(t);
  const project = path.join(dir, "My vlog é");
  fs.mkdirSync(project);
  const shots = await snapshotLook(fakeCli(dir), project)([3.5, 12]);
  assert.deepEqual(shots.map((shot) => shot.seconds), [3.5, 12]);
  assert.deepEqual(shots.map((shot) => String(shot.png)), ["PNG3.5", "PNG12"], "pictures only, never the contact sheet");
  const looks = path.join(project, ".cache", "kushmanji-look");
  const [folder] = fs.readdirSync(looks);
  const { args, cwd } = JSON.parse(fs.readFileSync(path.join(looks, folder, "args.json"), "utf8"));
  assert.equal(args[0], "snapshot");
  assert.equal(args[1], project);
  assert.equal(args[args.indexOf("--at") + 1], "3.5,12");
  assert.ok(args.includes("--no-end"));
  assert.equal(args[args.indexOf("--describe") + 1], "false", "no picture is sent to any web service");
  assert.equal(path.resolve(args[args.indexOf("-o") + 1]), path.join(looks, folder));
  assert.equal(fs.realpathSync(cwd), fs.realpathSync(project));
});

test("only the three newest looks are kept", async (t) => {
  const dir = tempDir(t);
  const project = path.join(dir, "p");
  fs.mkdirSync(project);
  const look = snapshotLook(fakeCli(dir), project);
  for (let i = 0; i < 5; i++) await look([i]);
  const kept = fs.readdirSync(path.join(project, ".cache", "kushmanji-look")).sort();
  assert.equal(kept.length, 3);
  assert.ok(kept.every((name) => /^\d+$/.test(name)));
});

test("when the CLI fails the assistant is told in plain words, and the project's own files are untouched", async (t) => {
  const dir = tempDir(t);
  const project = path.join(dir, "p");
  fs.mkdirSync(project);
  fs.writeFileSync(path.join(project, "index.html"), "<html></html>");
  await assert.rejects(snapshotLook(fakeCli(dir, { fail: true }), project)([1]), /could not be drawn just now/);
  const before = fs.readdirSync(project).sort();
  assert.deepEqual(before, [".cache", "index.html"]);
  assert.equal(fs.readFileSync(path.join(project, "index.html"), "utf8"), "<html></html>");
});

test("started the way an assistant starts it, from a path with a space and an accent, it answers and then exits", async (t) => {
  const dir = tempDir(t);
  const project = path.join(dir, "My vlog é");
  fs.mkdirSync(project);
  const child = spawn(process.execPath, [SCRIPT, fakeCli(dir), project], { stdio: ["pipe", "pipe", "inherit"], windowsHide: true });
  let text = "";
  child.stdout.on("data", (chunk) => (text += chunk));
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } })}\r\n`);
  child.stdin.write(call(2, [1.25]));
  const exited = new Promise((resolve) => child.on("close", resolve));
  const until = Date.now() + 15_000;
  while (text.split("\n").filter(Boolean).length < 2 && Date.now() < until) await new Promise((done) => setTimeout(done, 50));
  child.stdin.end();
  assert.equal(await exited, 0, "ends by itself when the assistant closes its end");
  const [hello, shot] = text.split("\n").filter(Boolean).map((line) => JSON.parse(line));
  assert.equal(hello.result.serverInfo.name, "kushmanji");
  assert.equal(shot.result.content[0].text, "Pictures of the video at 1.25 s.");
  assert.equal(shot.result.content[1].mimeType, "image/png");
  assert.equal(Buffer.from(shot.result.content[1].data, "base64").toString(), "PNG1.25");
});
