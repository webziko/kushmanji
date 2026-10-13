// The shared project memory: what one agent is told about the others' work.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { filesChangedSince, handoverNote, readTurns, recordTurn } from "../src/main/agents/journal.js";

const NAMES = { claude: "Claude Code", codex: "Codex", antigravity: "Antigravity (Gemini)" };
let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "hfwin journal "));
  fs.writeFileSync(path.join(dir, "index.html"), "<h1>Title</h1>");
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const turn = (engine, asked, did) => recordTurn(dir, { engine, asked, did, startedAt: Date.now() - 1000 });

test("a turn is stored in upstream's app-history format", () => {
  turn("codex", "Make the title red", "The title is red now.");
  const line = fs.readFileSync(path.join(dir, ".hyperframes", "app-history.jsonl"), "utf8").trim();
  const stored = JSON.parse(line);
  assert.deepEqual(Object.keys(stored).sort(), ["asked", "at", "did", "engine", "files"]);
  assert.equal(stored.engine, "codex");
  assert.ok(!Number.isNaN(Date.parse(stored.at)), "`at` is a date upstream can parse");
  assert.deepEqual(stored.files, ["index.html"]);
});

test("the agent that worked last is told nothing", () => {
  turn("claude", "Add a title", "Added.");
  assert.equal(handoverNote(dir, "claude", NAMES), "");
});

test("an agent is told what the others did since its own last turn, and no more", () => {
  turn("codex", "Old request", "Old work by Codex.");
  turn("claude", "Add music", "Added music.");
  turn("codex", "Make it blue", "It is blue.");
  turn("antigravity", "Add a logo", "Logo added.");
  const note = handoverNote(dir, "claude", NAMES);
  assert.match(note, /since your last turn/);
  assert.match(note, /Codex was asked: "Make it blue"/);
  assert.match(note, /Antigravity \(Gemini\) was asked: "Add a logo"/);
  assert.doesNotMatch(note, /Old request/, "work it already knew about is not repeated");
  assert.doesNotMatch(note, /Add music/, "its own turn is not repeated");
});

test("an agent new to the project is told what happened before it", () => {
  turn("claude", "Add a title", "Added.");
  assert.match(handoverNote(dir, "codex", NAMES), /before you/);
});

test("a long history is cut to the most recent turns", () => {
  for (let i = 1; i <= 12; i++) turn("codex", `Request ${i}`, `Done ${i}`);
  const note = handoverNote(dir, "claude", NAMES);
  assert.doesNotMatch(note, /"Request 4"/);
  assert.match(note, /"Request 12"/);
  assert.match(note, /4 earlier turns are left out/);
});

test("a damaged line does not hide the rest", () => {
  turn("codex", "First", "One.");
  fs.appendFileSync(path.join(dir, ".hyperframes", "app-history.jsonl"), "not json\n");
  turn("codex", "Second", "Two.");
  assert.equal(readTurns(dir).length, 2);
});

test("hidden folders and outputs do not count as changed files", () => {
  for (const folder of [".hyperframes", "node_modules", "renders", "assets"]) {
    fs.mkdirSync(path.join(dir, folder), { recursive: true });
    fs.writeFileSync(path.join(dir, folder, "file.txt"), "x");
  }
  assert.deepEqual(filesChangedSince(dir, Date.now() - 5000), ["assets/file.txt", "index.html"]);
});

test("a project that cannot be written to does not throw", () => {
  assert.doesNotThrow(() => recordTurn(path.join(dir, "missing", "\0bad"), { engine: "codex", asked: "a", did: "b", startedAt: 0 }));
});
